"""Evaluación de alertas post-snapshot y envío de push segmentado por rol."""
from __future__ import annotations
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional

logger = logging.getLogger(__name__)

# Cooldown en memoria: {clave_alerta: datetime_ultimo_envio}
# Se reinicia al reiniciar el backend — comportamiento intencional.
_cooldowns: Dict[str, datetime] = {}


def _en_cooldown(clave: str, minutos: int) -> bool:
    ultimo = _cooldowns.get(clave)
    if ultimo is None:
        return False
    return datetime.utcnow() - ultimo < timedelta(minutes=minutos)


def _marcar_cooldown(clave: str) -> None:
    _cooldowns[clave] = datetime.utcnow()


async def evaluar_y_notificar(stats: dict, ultimo_snap) -> None:
    """
    Evalúa umbrales sobre el snapshot recién calculado y envía push
    a los usuarios suscritos según su rol y scope de célula.

    Args:
        stats:       salida de _calcular_stats() con keys:
                     total, con_retraso, con_parada, cumplimiento_pct, por_celula
        ultimo_snap: SnapshotGlobal anterior (puede ser None en el primer snapshot)
    """
    from app.config import settings
    from app.database import AsyncSessionLocal
    from app.models.push_subscription import PushSubscription
    from app.models.user import User
    from app.routers.push import _send_to_subs
    from sqlalchemy import select

    total        = stats["total"]
    con_retraso  = stats["con_retraso"]
    cumplimiento = stats["cumplimiento_pct"]
    pct_retraso  = round(con_retraso / total * 100, 1) if total else 0.0

    # Tuplas (titulo, cuerpo) que van a admins
    alertas_globales: List[Tuple[str, str]] = []
    # celula → lista de tuplas (titulo, cuerpo) para líderes/supervisores de esa célula
    alertas_celula: Dict[str, List[Tuple[str, str]]] = {}

    cooldown = settings.ALERT_COOLDOWN_MIN

    # ── 1. Retraso global supera umbral % ─────────────────────────────────
    if settings.ALERT_PCT_RETRASO_GLOBAL > 0 and pct_retraso >= settings.ALERT_PCT_RETRASO_GLOBAL:
        clave = "global_pct_retraso"
        if not _en_cooldown(clave, cooldown):
            alertas_globales.append((
                f"⚠️ Retrasos al {pct_retraso}%",
                f"{con_retraso} de {total} técnicos con retraso "
                f"(umbral configurado: {settings.ALERT_PCT_RETRASO_GLOBAL}%)",
            ))
            _marcar_cooldown(clave)

    # ── 2. Spike: incremento brusco de retrasos entre snapshots ───────────
    if settings.ALERT_SPIKE_RETRASO > 0 and ultimo_snap is not None:
        spike = con_retraso - ultimo_snap.con_retraso
        if spike >= settings.ALERT_SPIKE_RETRASO:
            clave = "global_spike_retraso"
            if not _en_cooldown(clave, cooldown):
                alertas_globales.append((
                    f"📈 Pico de retrasos: +{spike} técnicos",
                    f"Retrasos subieron de {ultimo_snap.con_retraso} a {con_retraso} "
                    f"en el último ciclo (umbral: +{settings.ALERT_SPIKE_RETRASO})",
                ))
                _marcar_cooldown(clave)

    # ── 3. Cumplimiento global cae por debajo del mínimo ──────────────────
    if settings.ALERT_CUMPLIMIENTO_MIN > 0 and cumplimiento < settings.ALERT_CUMPLIMIENTO_MIN:
        clave = "global_cumplimiento_bajo"
        if not _en_cooldown(clave, cooldown):
            alertas_globales.append((
                f"📉 Cumplimiento al {cumplimiento}%",
                f"El cumplimiento global cayó por debajo del "
                f"{settings.ALERT_CUMPLIMIENTO_MIN}%",
            ))
            _marcar_cooldown(clave)

    # ── 4. Retraso por célula supera umbral % ─────────────────────────────
    if settings.ALERT_PCT_RETRASO_CELULA > 0:
        for cel in stats.get("por_celula", []):
            cel_nombre  = cel["celula"]
            cel_total   = cel["total"]
            cel_retraso = cel["con_retraso"]
            cel_pct     = round(cel_retraso / cel_total * 100, 1) if cel_total else 0.0

            if cel_pct >= settings.ALERT_PCT_RETRASO_CELULA:
                clave = f"celula_pct_retraso_{cel_nombre}"
                if not _en_cooldown(clave, cooldown):
                    alertas_celula.setdefault(cel_nombre, []).append((
                        f"⚠️ {cel_nombre}: retrasos al {cel_pct}%",
                        f"{cel_retraso} de {cel_total} técnicos con retraso "
                        f"(umbral: {settings.ALERT_PCT_RETRASO_CELULA}%)",
                    ))
                    _marcar_cooldown(clave)

    # Si no hay nada que enviar, salir temprano
    if not alertas_globales and not alertas_celula:
        return

    # ── Despachar push segmentado por rol ─────────────────────────────────
    async with AsyncSessionLocal() as session:
        users_result = await session.execute(
            select(User).where(User.is_active == True)
        )
        users = users_result.scalars().all()

        subs_result = await session.execute(select(PushSubscription))
        all_subs    = subs_result.scalars().all()

        # Índice user_id → suscripciones
        subs_by_user: Dict[int, list] = {}
        for s in all_subs:
            if s.user_id:
                subs_by_user.setdefault(s.user_id, []).append(s)

        for user in users:
            user_subs = subs_by_user.get(user.id, [])
            if not user_subs:
                continue

            mensajes: List[Tuple[str, str]] = []

            if user.role == "admin":
                # Admin recibe todo: globales + todas las células
                mensajes.extend(alertas_globales)
                for cel_msgs in alertas_celula.values():
                    mensajes.extend(cel_msgs)

            elif user.role in ("lider_celula", "supervisor_microcelda"):
                # Solo las alertas de su célula
                if user.celula:
                    mensajes.extend(alertas_celula.get(user.celula, []))

            for titulo, cuerpo in mensajes:
                await _send_to_subs(user_subs, titulo, cuerpo, "/")
                logger.info(
                    "[Alerta] → %s (%s | %s): %s",
                    user.username, user.role, user.celula or "—", titulo,
                )
