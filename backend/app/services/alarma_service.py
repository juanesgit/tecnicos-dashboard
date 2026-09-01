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
MAX_ALARMAS_SUP  = 10   # Cap de alarmas abiertas por supervisor
HORAS_ACTIVO     = 8    # Horas desde último login para considerar "activo reciente"

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
    """
    Devuelve candidatos a recibir alarmas en orden de prioridad:
      Tier 1 — disponible=True Y WebSocket activo ahora mismo
      Tier 2 — disponible=True (sin importar presencia WS)
      Sin Tier 3: si nadie está disponible, devuelve [] → alarma queda sin asignar.
    """
    from app.database import AsyncSessionLocal
    from app.models.user import User
    from sqlalchemy import select as sa_select

    # Tier 1: WebSocket online + disponible
    from app.routers.presencia import manager
    online = manager.get_online()
    t1 = [u for u in online if u.get("role") == "supervisor_ccot" and u.get("disponible")]
    if t1:
        logger.info("[Alarma][Tier1] %d supervisor(es) online+disponible", len(t1))
        return t1

    # Tier 2: disponible=True en BD (pueden no tener WS abierto pero marcaron disponible)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            sa_select(User).where(
                User.role == "supervisor_ccot",
                User.is_active == True,
                User.disponible == True,
            )
        )
        t2 = [{"user_id": u.id, "full_name": u.full_name} for u in result.scalars().all()]

    if t2:
        logger.info("[Alarma][Tier2] %d supervisor(es) disponible(s) en BD", len(t2))
        return t2

    logger.warning("[Alarma] Sin supervisores disponibles — alarma irá a cola sin asignar")
    return []


async def _siguiente_supervisor(supervisores: List[Dict]) -> Optional[Dict]:
    """
    Round-robin con cap: elige al supervisor con menos alarmas abiertas.
    Si todos superan MAX_ALARMAS_SUP, igual asigna al de menor carga
    pero advierte en log (sobrecarga).
    """
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

    elegido = min(supervisores, key=lambda s: carga.get(s["user_id"], 0))
    carga_elegido = carga.get(elegido["user_id"], 0)

    if carga_elegido >= MAX_ALARMAS_SUP:
        logger.warning(
            "[Alarma][Sobrecarga] %s ya tiene %d alarmas abiertas (cap=%d) — asignando de todas formas",
            elegido.get("full_name"), carga_elegido, MAX_ALARMAS_SUP,
        )
    return elegido


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


async def _rebalancear_entre_online() -> None:
    """
    Rebalanceo periódico: se llama al final de cada ciclo de procesar_alarmas.
    Si hay ≥ 2 supervisores_ccot online con más del 50% de diferencia de carga,
    mueve alarmas del más cargado al menos cargado hasta equilibrar.
    Puede hacer múltiples pasadas hasta que no haya desequilibrio.
    """
    from app.database import AsyncSessionLocal
    from app.models.alarma import Alarma, AlarmaEvento
    from sqlalchemy import select as sa_select, func
    import pytz
    from datetime import datetime

    from app.routers.presencia import manager

    online = manager.get_online()
    online_sups = [u for u in online if u.get("role") == "supervisor_ccot"]
    if len(online_sups) < 2:
        return

    tz  = pytz.timezone(settings.APP_TIMEZONE)
    now = datetime.now(tz).replace(tzinfo=None)
    online_ids = [u["user_id"] for u in online_sups]
    sup_info   = {u["user_id"]: u for u in online_sups}

    MAX_PASADAS = 5
    for pasada in range(MAX_PASADAS):
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                sa_select(Alarma.asignado_a, func.count(Alarma.id).label("cnt"))
                .where(Alarma.estado == "abierta", Alarma.asignado_a.in_(online_ids))
                .group_by(Alarma.asignado_a)
            )
            carga = {row[0]: row[1] for row in result.fetchall()}

        # Asegurar que todos los supervisores online aparecen (aunque tengan 0)
        for sid in online_ids:
            carga.setdefault(sid, 0)

        sup_max_id = max(online_ids, key=lambda sid: carga[sid])
        sup_min_id = min(online_ids, key=lambda sid: carga[sid])

        carga_max = carga[sup_max_id]
        carga_min = carga[sup_min_id]

        if sup_max_id == sup_min_id or carga_max == 0:
            break
        diferencia = carga_max - carga_min
        if diferencia < 2 or (diferencia / carga_max) < 0.5:
            break

        a_mover = diferencia // 2
        nombre_destino = sup_info[sup_min_id].get("full_name", str(sup_min_id))

        async with AsyncSessionLocal() as session:
            alarmas_res = await session.execute(
                sa_select(Alarma)
                .where(Alarma.estado == "abierta", Alarma.asignado_a == sup_max_id)
                .order_by(Alarma.nivel.asc(), Alarma.fecha_creacion.desc())
                .limit(a_mover)
            )
            alarmas = alarmas_res.scalars().all()

            for alarma in alarmas:
                alarma.asignado_a       = sup_min_id
                alarma.asignado_nombre  = nombre_destino
                session.add(AlarmaEvento(
                    alarma_id   = alarma.id,
                    tipo        = "reasignacion",
                    user_id     = sup_min_id,
                    descripcion = f"Rebalanceo periódico: reasignada a {nombre_destino} ({carga_max}→{carga_max - a_mover} vs {carga_min}→{carga_min + a_mover}).",
                    ts          = now,
                ))

            if alarmas:
                await session.commit()
                logger.info(
                    "[Alarma][Rebalanceo] Pasada %d: %d alarma(s) sup%d(%d)→%s(%d)",
                    pasada + 1, len(alarmas), sup_max_id, carga_max,
                    nombre_destino, carga_min,
                )
            else:
                break  # Nada que mover


async def procesar_alarmas(datos: List[Dict[str, Any]]) -> None:
    from app.database import AsyncSessionLocal
    from app.models.alarma import Alarma, AlarmaEvento
    from sqlalchemy import select as sa_select

    tz  = pytz.timezone(settings.APP_TIMEZONE)
    now = datetime.now(tz).replace(tzinfo=None)

    # ── 0. Cierre de alarmas de días anteriores ───────────────────────────────
    hoy = now.date()
    async with AsyncSessionLocal() as session:
        result = await session.execute(sa_select(Alarma).where(Alarma.estado == "abierta"))
        alarmas_viejas = [a for a in result.scalars().all() if a.fecha_creacion.date() < hoy]
        if alarmas_viejas:
            for alarma in alarmas_viejas:
                alarma.estado       = "cerrada"
                alarma.fecha_cierre = now
                edad = int((now - alarma.fecha_creacion).total_seconds() / 60)
                alarma.tiempo_resolucion_min = edad
                alarma.sla_cumplido = False  # fin de operación: SLA no cumplido
                session.add(AlarmaEvento(
                    alarma_id   = alarma.id,
                    tipo        = "cierre_fin_operacion",
                    descripcion = f"Cerrada automáticamente al inicio del nuevo día operativo ({alarma.fecha_creacion.date()}).",
                    ts          = now,
                ))
            await session.commit()
            logger.info(
                "[Alarma] Cierre fin operación: %d alarma(s) de días anteriores cerradas.",
                len(alarmas_viejas),
            )

    # ── Técnicos retrasados con ≥ 30 minutos de retraso ──────────────────────
    retrasados: Dict[str, Dict] = {}
    for d in datos:
        if d.get("estado_actual") in ESTADOS_RETRASO:
            min_ret = _minutos_retraso(d)
            if min_ret >= MIN_RETRASO_LEVE:
                tec = d.get("Técnico") or d.get("técnico") or ""
                if tec:
                    retrasados[tec] = d

    # ── DEBUG: mostrar qué nodo/celula tienen los técnicos retrasados ───────────
    for tec, d in retrasados.items():
        logger.info(
            "[Alarma][DEBUG] Retrasado: %s | Nodo=%s | celula=%s | microcelda=%s | ciudad_nodo=%s | min=%d",
            tec,
            d.get("Nodo") or d.get("nodo") or "N/A",
            d.get("celula", "N/A"),
            d.get("microcelda", "N/A"),
            d.get("ciudad_nodo", "N/A"),
            _minutos_retraso(d),
        )

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

            # Enriquecer campos que pueden haber quedado NULL en alarmas antiguas
            alarma.minutos_retraso_inicio = alarma.minutos_retraso_inicio or (min_ret if min_ret > 0 else None)
            alarma.ot       = alarma.ot       or str(d.get("ot_actual")       or "").strip() or None
            alarma.actividad= alarma.actividad or str(d.get("actividad_actual") or "").strip() or None
            alarma.ciudad   = alarma.ciudad   or d.get("ciudad_nodo") or d.get("ciudad_actual") or None
            alarma.tipo_retraso = alarma.tipo_retraso or d.get("estado_actual") or None

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

        # ── 2.5 Auto-asignación de alarmas SIN ASIGNAR ───────────────────────────
        # Orden: critica → moderada → leve (mayor minutos primero)
        NIVEL_ORDEN = {"critica": 0, "moderada": 1, "leve": 2}
        sin_asignar_abiertas = sorted(
            [a for a in abiertas if a.estado == "abierta" and a.asignado_a is None],
            key=lambda a: NIVEL_ORDEN.get(a.nivel, 3),
        )
        if sin_asignar_abiertas and supervisores:
            for alarma in sin_asignar_abiertas:
                sup = await _siguiente_supervisor(supervisores)
                if not sup:
                    break
                alarma.asignado_a      = sup["user_id"]
                alarma.asignado_nombre = sup.get("full_name", "")
                eventos_nuevos.append(AlarmaEvento(
                    alarma_id   = alarma.id,
                    tipo        = "asignacion_auto",
                    user_id     = sup["user_id"],
                    descripcion = f"Auto-asignada a {sup.get('full_name', '')} (supervisor disponible).",
                    ts          = now,
                ))
                logger.info(
                    "[Alarma][AutoAsign] %s (%s) → %s",
                    alarma.tecnico, alarma.nivel, sup.get("full_name"),
                )
                asyncio.create_task(_push(
                    sup["user_id"], "🔴 Alarma asignada automáticamente",
                    f"{alarma.tecnico} — {alarma.celula} ({alarma.nivel})",
                ))

        # ── 3. Nuevas alarmas (solo técnicos con ≥ 30 min de retraso) ─────────
        # Ordenar por minutos de retraso descendente: critica → moderada → leve
        retrasados_ordenados = sorted(
            retrasados.items(),
            key=lambda item: _minutos_retraso(item[1]),
            reverse=True,
        )
        nuevas = []
        for tec, d in retrasados_ordenados:
            if tec in abiertas_map:
                continue

            sup = await _siguiente_supervisor(supervisores)
            min_ret = _minutos_retraso(d)
            nivel   = _nivel_por_minutos(min_ret)

            # Si no hay supervisores disponibles → sin asignar
            sin_asignar = sup is None
            nueva = Alarma(
                tecnico        = tec,
                celula         = d.get("celula", "Sin clasificar") or "Sin clasificar",
                microcelda     = d.get("microcelda", "Sin clasificar") or "Sin clasificar",
                ciudad         = d.get("ciudad_nodo") or d.get("ciudad_actual") or None,
                tipo_retraso   = d.get("estado_actual") or None,
                minutos_retraso_inicio = min_ret if min_ret > 0 else None,
                actividad      = d.get("actividad_actual") or None,
                ot             = str(d.get("ot_actual") or "").strip() or None,
                nivel          = nivel,
                estado         = "abierta",
                asignado_a     = sup["user_id"] if not sin_asignar else None,
                asignado_nombre = sup.get("full_name", "") if not sin_asignar else "Sin asignar",
                fecha_creacion = now,
            )
            session.add(nueva)
            nuevas.append((nueva, sup, min_ret, sin_asignar))
            abiertas_map[tec] = nueva

        if nuevas:
            await session.flush()
            for nueva, sup, min_ret, sin_asignar in nuevas:
                desc = (
                    f"Sin supervisores disponibles. Retraso: {min_ret} min. En cola."
                    if sin_asignar
                    else f"Asignada a {sup.get('full_name', '')}. Retraso: {min_ret} min."
                )
                eventos_nuevos.append(AlarmaEvento(
                    alarma_id=nueva.id, tipo="creacion",
                    nivel_nuevo=nueva.nivel,
                    user_id=sup["user_id"] if not sin_asignar else None,
                    descripcion=desc,
                    ts=now,
                ))
                logger.info(
                    "[Alarma] Nueva: %s (%s) %d min → %s",
                    nueva.tecnico, nueva.nivel, min_ret,
                    sup.get("full_name") if not sin_asignar else "SIN ASIGNAR",
                )
                if not sin_asignar:
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

    # ── 4. Rebalanceo periódico entre supervisores online ─────────────────────
    await _rebalancear_entre_online()
