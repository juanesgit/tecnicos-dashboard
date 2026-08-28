"""Router de actividad — tracking de uso del sistema."""
from __future__ import annotations
from datetime import datetime, timedelta, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
import pytz

from app.database import get_db
from app.models.user import User
from app.models.actividad import ActividadUsuario
from app.services.auth import get_current_user
from app.config import settings

router = APIRouter(prefix="/actividad", tags=["Actividad"])

TZ = pytz.timezone(settings.APP_TIMEZONE)


def _now_local() -> datetime:
    return datetime.now(TZ).replace(tzinfo=None)


def _only_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    return current_user


# ── POST /actividad — el frontend registra eventos silenciosamente ────────────
@router.post("", status_code=204)
async def registrar_evento(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    evento = str(body.get("evento", "")).strip()[:50]
    if not evento:
        return  # ignorar eventos vacíos

    EVENTOS_VALIDOS = {
        "login", "tab_dashboard", "tab_avance", "tab_historico",
        "tab_productividad", "tab_admin", "tab_usuarios", "datos",
    }
    if evento not in EVENTOS_VALIDOS:
        return  # ignorar eventos desconocidos

    db.add(ActividadUsuario(
        user_id   = current_user.id,
        username  = current_user.username,
        full_name = current_user.full_name,
        role      = current_user.role,
        evento    = evento,
        ts        = _now_local(),
    ))
    await db.commit()


# ── GET /actividad/adherencia — estadísticas para el admin ───────────────────
@router.get("/adherencia")
async def adherencia(
    dias: int = 30,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_only_admin),
):
    """
    Retorna estadísticas de adherencia por usuario para los últimos N días.
    Incluye: último acceso, días activos, total eventos, logins, semáforo.
    """
    desde = _now_local() - timedelta(days=dias)
    hoy   = _now_local().date()

    # Todos los usuarios activos
    users_res = await db.execute(select(User).where(User.is_active == True).order_by(User.role, User.full_name))
    all_users = users_res.scalars().all()

    # Toda la actividad en el período
    act_res = await db.execute(
        select(ActividadUsuario).where(ActividadUsuario.ts >= desde)
    )
    actividades = act_res.scalars().all()

    # Agrupar por user_id
    from collections import defaultdict
    por_user: dict[int, list[ActividadUsuario]] = defaultdict(list)
    for a in actividades:
        por_user[a.user_id].append(a)

    ROLE_LABEL = {
        "admin":                 "Administrador",
        "lider_celula":          "Líder Célula",
        "supervisor_microcelda": "Supervisor",
        "supervisor_ccot":       "Sup. CCOT",
    }

    stats = []
    for u in all_users:
        evs = por_user.get(u.id, [])
        # Último acceso global (historial completo, no solo período)
        last_res = await db.execute(
            select(ActividadUsuario.ts)
            .where(ActividadUsuario.user_id == u.id)
            .order_by(ActividadUsuario.ts.desc())
            .limit(1)
        )
        last_ts = last_res.scalar_one_or_none()

        logins_30      = sum(1 for e in evs if e.evento == "login")
        total_evs_30   = len(evs)
        dias_activos_30 = len({e.ts.date() for e in evs})

        # Semáforo basado en último acceso
        if last_ts is None:
            semaforo = "gray"    # nunca entró
        else:
            diff = (hoy - last_ts.date()).days
            if diff == 0:
                semaforo = "green"
            elif diff <= 3:
                semaforo = "yellow"
            else:
                semaforo = "red"

        stats.append({
            "user_id":        u.id,
            "username":        u.username,
            "full_name":       u.full_name,
            "role":            u.role,
            "role_label":      ROLE_LABEL.get(u.role, u.role),
            "celula":          u.celula,
            "ultimo_acceso":   last_ts.isoformat() if last_ts else None,
            "logins_30":       logins_30,
            "total_eventos_30": total_evs_30,
            "dias_activos_30": dias_activos_30,
            "semaforo":        semaforo,
        })

    # Resumen global
    activos_hoy     = sum(1 for s in stats if s["semaforo"] == "green")
    activos_semana  = sum(1 for s in stats if s["semaforo"] in ("green", "yellow"))
    nunca_entraron  = sum(1 for s in stats if s["semaforo"] == "gray")

    return {
        "periodo_dias": dias,
        "resumen": {
            "activos_hoy":    activos_hoy,
            "activos_semana": activos_semana,
            "nunca_entraron": nunca_entraron,
            "total_usuarios": len(stats),
        },
        "usuarios": stats,
    }


# ── GET /actividad/timeline — historial por usuario (admin) ──────────────────
@router.get("/timeline/{user_id}")
async def timeline_usuario(
    user_id: int,
    dias: int = 30,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_only_admin),
):
    """Devuelve los últimos N días de actividad de un usuario (eventos por día)."""
    desde = _now_local() - timedelta(days=dias)
    res = await db.execute(
        select(ActividadUsuario)
        .where(ActividadUsuario.user_id == user_id, ActividadUsuario.ts >= desde)
        .order_by(ActividadUsuario.ts.desc())
        .limit(500)
    )
    rows = res.scalars().all()

    from collections import defaultdict
    por_dia: dict = defaultdict(list)
    for r in rows:
        d = r.ts.date().isoformat()
        por_dia[d].append(r.evento)

    return {
        "user_id": user_id,
        "dias": [
            {"fecha": d, "eventos": evs, "total": len(evs)}
            for d, evs in sorted(por_dia.items(), reverse=True)
        ],
    }
