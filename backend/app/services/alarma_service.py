"""
Servicio de alarmas — detección, escalado y cierre automático.

Reglas de nivel (basadas en los minutos de retraso REAL del técnico en cada snapshot):
  leve      → retraso 30 - 59 min   (SLA 45 min)
  moderada  → retraso 60 - 89 min   (SLA 20 min)
  crítica   → retraso ≥ 90 min      (SLA 10 min)

Solo se crea alarma cuando el retraso es ≥ 30 min.
El nivel se actualiza en cada snapshot según el retraso actual del técnico.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import pytz

from app.config import settings

logger = logging.getLogger(__name__)

ESTADOS_RETRASO  = {"Retraso actual", "Retraso en siguiente"}
MIN_RETRASO_LEVE = 30   # Umbral mínimo para crear alarma

SLA_MIN = {"leve": 45, "moderada": 20, "critica": 10}


def _nivel_por_minutos(minutos: int) -> str:
    """Nivel según minutos REALES de retraso del técnico."""
    if minutos >= 90:
        return "critica"
    if minutos >= 60:
        return "moderada"
    return "leve"


def _minutos_retraso(d: Dict) -> int:
    """Extrae los minutos de retraso reales del técnico desde el dict del snapshot."""
    estado = d.get("estado_actual", "")
    if estado == "Retraso en siguiente":
        return int(d.get("minutos_retraso_siguiente", 0) or 0)
    return int(d.get("minutos_retraso", 0) or 0)


async def _supervisores_ccot() -> List[Dict[str, Any]]:
    from app.routers.presencia import manager
    online = manager.get_online()
    supers = [u for u in online if u.get("role") == "supervisor_ccot"]
    if supers:
        return supers
    from app.database import AsyncSessionLocal
    from app.models.user import User
    from sqlalchemy import select as sa_select
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            sa_select(User).where(User.role == "supervisor_ccot", User.is_active == True)
        )
        return [{"user_id": u.id, "full_name": u.full_name} for u in result.scalars().all()]


async def _siguiente_supervisor(supervisores: List[Dict]) -> Optional[Dict]:
    if not supervisores:
        return None
    from app.database import AsyncSessionLocal
    from app.models.alarma import Alarma
    from sqlalchemy import select as sa_select, func
    async with AsyncSessionLocal() as session:
        ids = [s["user_id"] for s in supervisores]
        result = await session.execute(
            sa_select(Alarma.asignado_a, func.count(Alarma.id).label("cnt"))
            .where(Alarma.estado == "abierta", Alarma.asignado_a.in_(ids))
            .group_by(Alarma.asignado_a)
        )
        carga = {row[0]: row[1] for row in result.fetchall()}
    return min(supervisores, key=lambda s: carga.get(s["user_id"], 0))


async def _push(user_id: int, titulo: str, cuerpo: str):
    try:
        from app.database import AsyncSessionLocal
        from sqlalchemy import text
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = :uid"),
                {"uid": user_id},
            )
            rows = result.fetchall()
        if not rows:
            return
        import json
        from pywebpush import webpush, WebPushException
        vapid_private = getattr(settings, "VAPID_PRIVATE_KEY", None)
        vapid_claims  = getattr(settings, "VAPID_CLAIMS", None)
        if not vapid_private or not vapid_claims:
            return
        payload = json.dumps({"title": titulo, "body": cuerpo, "icon": "/icons/icon-192.png"})
        for row in rows:
            try:
                webpush(
                    subscription_info={"endpoint": row[0], "keys": {"p256dh": row[1], "auth": row[2]}},
                    data=payload, vapid_private_key=vapid_private, vapid_claims=vapid_claims,
                )
            except WebPushException as exc:
                logger.warning("[Alarma][Push] user %d: %s", user_id, exc)
    except Exception as exc:
        logger.warning("[Alarma][Push] %s", exc)


async def procesar_alarmas(datos: List[Dict[str, Any]]) -> None:
    from app.database import AsyncSessionLocal
    from app.models.alarma import Alarma, AlarmaEvento
    from sqlalchemy import select as sa_select

    tz  = pytz.timezone(settings.APP_TIMEZONE)
    now = datetime.now(tz).replace(tzinfo=None)

    # ── Técnicos retrasados con ≥ 30 minutos de retraso ──────────────────────
    retrasados: Dict[str, Dict] = {}
    for d in datos:
        if d.get("estado_actual") in ESTADOS_RETRASO:
            min_ret = _minutos_retraso(d)
            if min_ret >= MIN_RETRASO_LEVE:
                tec = d.get("Técnico") or d.get("técnico") or ""
                if tec:
                    retrasados[tec] = d

    supervisores = await _supervisores_ccot()
    eventos_nuevos: List[AlarmaEvento] = []

    async with AsyncSessionLocal() as session:
        result = await session.execute(sa_select(Alarma).where(Alarma.estado == "abierta"))
        abiertas: List[Alarma] = list(result.scalars().all())
        abiertas_map: Dict[str, Alarma] = {a.tecnico: a for a in abiertas}

        # ── 1. Cierre automático: técnico ya no retrasado ≥ 30 min ───────────
        for alarma in abiertas:
            if alarma.tecnico not in retrasados:
                alarma.estado       = "cerrada"
                alarma.fecha_cierre = now
                edad = int((now - alarma.fecha_creacion).total_seconds() / 60)
                alarma.tiempo_resolucion_min = edad
                alarma.sla_cumplido = edad <= SLA_MIN[alarma.nivel]
                eventos_nuevos.append(AlarmaEvento(
                    alarma_id=alarma.id, tipo="cierre_auto",
                    descripcion=f"Técnico ya no presenta retraso ≥ 30 min. ({edad} min abierta)",
                    ts=now,
                ))
                logger.info("[Alarma] Cierre auto: %s (%d min abierta)", alarma.tecnico, edad)

        # ── 2. Escalado por minutos REALES de retraso del técnico ─────────────
        for alarma in abiertas:
            if alarma.estado != "abierta":
                continue
            d = retrasados.get(alarma.tecnico)
            if not d:
                continue
            min_ret   = _minutos_retraso(d)
            nivel_nuevo = _nivel_por_minutos(min_ret)
            if nivel_nuevo != alarma.nivel:
                ant = alarma.nivel
                alarma.nivel = nivel_nuevo
                eventos_nuevos.append(AlarmaEvento(
                    alarma_id=alarma.id, tipo="escalada",
                    nivel_anterior=ant, nivel_nuevo=nivel_nuevo,
                    descripcion=f"Escalada a {nivel_nuevo}: {min_ret} min de retraso.",
                    ts=now,
                ))
                logger.info("[Alarma] Escalada: %s %s→%s (%d min)", alarma.tecnico, ant, nivel_nuevo, min_ret)
                asyncio.create_task(_push(
                    alarma.asignado_a,
                    f"⚠️ Alarma escalada a {nivel_nuevo.upper()}",
                    f"{alarma.tecnico} — {alarma.celula}/{alarma.microcelda} ({min_ret} min de retraso)",
                ))

        # ── 3. Nuevas alarmas (solo técnicos con ≥ 30 min de retraso) ─────────
        nuevas = []
        for tec, d in retrasados.items():
            if tec in abiertas_map:
                continue
            sup = await _siguiente_supervisor(supervisores)
            if not sup:
                logger.warning("[Alarma] Sin supervisores disponibles.")
                break

            min_ret = _minutos_retraso(d)
            nivel   = _nivel_por_minutos(min_ret)

            nueva = Alarma(
                tecnico        = tec,
                celula         = d.get("celula", "Sin clasificar") or "Sin clasificar",
                microcelda     = d.get("microcelda", "Sin clasificar") or "Sin clasificar",
                ciudad         = d.get("ciudad_nodo") or d.get("ciudad_actual") or None,
                tipo_retraso   = d.get("estado_actual") or None,
                minutos_retraso_inicio = min_ret if min_ret > 0 else None,
                nivel          = nivel,
                estado         = "abierta",
                asignado_a     = sup["user_id"],
                asignado_nombre = sup.get("full_name", ""),
                fecha_creacion = now,
            )
            session.add(nueva)
            nuevas.append((nueva, sup, min_ret))
            abiertas_map[tec] = nueva

        if nuevas:
            await session.flush()
            for nueva, sup, min_ret in nuevas:
                eventos_nuevos.append(AlarmaEvento(
                    alarma_id=nueva.id, tipo="creacion",
                    nivel_nuevo=nueva.nivel, user_id=sup["user_id"],
                    descripcion=f"Asignada a {sup.get('full_name', '')}. Retraso: {min_ret} min.",
                    ts=now,
                ))
                logger.info(
                    "[Alarma] Nueva: %s (%s) %d min → sup %s",
                    nueva.tecnico, nueva.nivel, min_ret, sup.get("full_name"),
                )
                asyncio.create_task(_push(
                    sup["user_id"], "🔴 Nueva alarma asignada",
                    f"{nueva.tecnico} — {nueva.celula} ({min_ret} min de retraso)",
                ))

        for ev in eventos_nuevos:
            session.add(ev)

        await session.commit()

        n_nuevas  = len(nuevas)
        n_cerradas = sum(1 for a in abiertas if a.estado == "cerrada")
        if n_nuevas or n_cerradas:
            logger.info(
                "[Alarma] Ciclo: %d retrasados≥30min, nuevas=%d, cerradas=%d",
                len(retrasados), n_nuevas, n_cerradas,
            )
