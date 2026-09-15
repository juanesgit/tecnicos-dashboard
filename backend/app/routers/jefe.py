"""Router para el rol jefe_ccot — supervisión de supervisores, reasignación de alarmas y config."""
from __future__ import annotations
from datetime import datetime, date
from typing import Any, Dict, List, Optional

import pytz
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select as sa_select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.alarma import Alarma, AlarmaEvento
from app.models.user import User
from app.services.auth import get_current_user
from app.config import settings

router = APIRouter(prefix="/jefe", tags=["Jefe CCOT"])
ROLES_JEFE = {"admin", "jefe_ccot"}

CONFIG_KEY_MAX = "max_alarmas_sup"
CONFIG_DEFAULT_MAX = 5


def _check_jefe(user: User):
    if user.role not in ROLES_JEFE:
        raise HTTPException(status_code=403, detail="Solo jefe_ccot o admin")


def _tz_now() -> datetime:
    return datetime.now(pytz.timezone(settings.APP_TIMEZONE)).replace(tzinfo=None)


# ─── Helpers de config ────────────────────────────────────────────────────────

async def _get_config_val(db: AsyncSession, key: str, default: str = "") -> str:
    result = await db.execute(
        text("SELECT valor FROM configuracion WHERE clave = :k"), {"k": key}
    )
    row = result.fetchone()
    return row[0] if row else default


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ConfigOut(BaseModel):
    max_alarmas_sup: int


class ConfigIn(BaseModel):
    max_alarmas_sup: int


class DisponibeIn(BaseModel):
    disponible: bool


class ReasignarIn(BaseModel):
    supervisor_id: int


# ─── Config endpoints ─────────────────────────────────────────────────────────

@router.get("/config", response_model=ConfigOut)
async def get_config(
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _check_jefe(cu)
    val = await _get_config_val(db, CONFIG_KEY_MAX, str(CONFIG_DEFAULT_MAX))
    return {"max_alarmas_sup": int(val)}


@router.patch("/config", response_model=ConfigOut)
async def update_config(
    body: ConfigIn,
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _check_jefe(cu)
    if body.max_alarmas_sup < 1 or body.max_alarmas_sup > 50:
        raise HTTPException(status_code=400, detail="Debe estar entre 1 y 50")
    await db.execute(
        text(
            "INSERT INTO configuracion(clave, valor) VALUES(:k,:v) "
            "ON CONFLICT(clave) DO UPDATE SET valor=:v"
        ),
        {"k": CONFIG_KEY_MAX, "v": str(body.max_alarmas_sup)},
    )
    await db.commit()
    return {"max_alarmas_sup": body.max_alarmas_sup}


# ─── Supervisores endpoints ───────────────────────────────────────────────────

@router.get("/supervisores")
async def listar_supervisores(
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Supervisores ccot con estado online, disponibilidad, carga y KPIs del día."""
    _check_jefe(cu)

    # Todos los supervisores ccot activos
    sups = (
        await db.execute(
            sa_select(User).where(User.role == "supervisor_ccot", User.is_active == True)
        )
    ).scalars().all()

    # Estado WS online
    from app.routers.presencia import manager
    online_ids: set[int] = {u["user_id"] for u in manager.get_online()}

    # Alarmas activas por supervisor
    carga_rows = (
        await db.execute(
            sa_select(Alarma.asignado_a, Alarma.estado, func.count(Alarma.id).label("cnt"))
            .where(Alarma.estado.in_(["abierta", "en_gestion"]))
            .group_by(Alarma.asignado_a, Alarma.estado)
        )
    ).fetchall()
    carga_map: Dict[int, Dict] = {}
    for row in carga_rows:
        sid, estado, cnt = row
        if sid not in carga_map:
            carga_map[sid] = {"abierta": 0, "en_gestion": 0}
        carga_map[sid][estado] = cnt

    # KPIs del día (alarmas cerradas hoy por supervisor)
    hoy_str = date.today().isoformat()
    cerradas_rows = (
        await db.execute(
            sa_select(Alarma)
            .where(
                Alarma.fecha_cierre >= hoy_str,
                Alarma.estado.in_(["cerrada_gestionada", "cerrada_sin_gestion", "cerrada"]),
                Alarma.asignado_a.isnot(None),
            )
        )
    ).scalars().all()

    kpi_map: Dict[int, Dict] = {}
    for a in cerradas_rows:
        sid = a.asignado_a
        if sid not in kpi_map:
            kpi_map[sid] = {"cerradas": 0, "sla_ok": 0, "gestionadas": 0, "total_min": 0, "con_min": 0}
        kpi_map[sid]["cerradas"] += 1
        if a.sla_cumplido:
            kpi_map[sid]["sla_ok"] += 1
        if a.estado == "cerrada_gestionada":
            kpi_map[sid]["gestionadas"] += 1
        if a.tiempo_resolucion_min:
            kpi_map[sid]["total_min"] += a.tiempo_resolucion_min
            kpi_map[sid]["con_min"] += 1

    resultado = []
    for s in sups:
        carga = carga_map.get(s.id, {"abierta": 0, "en_gestion": 0})
        kd = kpi_map.get(s.id, {})
        cerradas = kd.get("cerradas", 0)
        sla_ok = kd.get("sla_ok", 0)
        gestionadas = kd.get("gestionadas", 0)
        total_min = kd.get("total_min", 0)
        con_min = kd.get("con_min", 0)
        resultado.append({
            "id": s.id,
            "username": s.username,
            "full_name": s.full_name,
            "disponible": s.disponible,
            "online": s.id in online_ids,
            "celulas": s.celulas or ([s.celula] if s.celula else []),
            "alarmas_abiertas": carga["abierta"],
            "alarmas_en_gestion": carga["en_gestion"],
            "alarmas_activas": carga["abierta"] + carga["en_gestion"],
            "cerradas_hoy": cerradas,
            "sla_pct": round(sla_ok / cerradas * 100) if cerradas else None,
            "tiempo_medio_min": round(total_min / con_min) if con_min else None,
            "documentadas_pct": round(gestionadas / cerradas * 100) if cerradas else None,
        })

    # Orden: online primero, luego por alarmas activas desc
    return sorted(resultado, key=lambda x: (-int(x["online"]), -x["alarmas_activas"]))


@router.get("/supervisores/{sup_id}/alarmas")
async def alarmas_supervisor(
    sup_id: int,
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Alarmas activas de un supervisor específico."""
    _check_jefe(cu)
    rows = (
        await db.execute(
            sa_select(Alarma)
            .where(
                Alarma.asignado_a == sup_id,
                Alarma.estado.in_(["abierta", "en_gestion"]),
            )
            .order_by(Alarma.nivel.desc(), Alarma.fecha_creacion.asc())
        )
    ).scalars().all()

    def _s(a: Alarma) -> Dict:
        return {
            "id": a.id,
            "tecnico": a.tecnico,
            "celula": a.celula,
            "microcelda": a.microcelda,
            "nivel": a.nivel,
            "estado": a.estado,
            "minutos_retraso_inicio": a.minutos_retraso_inicio,
            "fecha_creacion": a.fecha_creacion.isoformat() if a.fecha_creacion else None,
            "asignado_nombre": a.asignado_nombre,
        }

    return [_s(a) for a in rows]


@router.patch("/supervisores/{sup_id}/disponible")
async def toggle_disponible(
    sup_id: int,
    body: DisponibeIn,
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Jefe activa/desactiva la disponibilidad de un supervisor."""
    _check_jefe(cu)
    sup = (
        await db.execute(
            sa_select(User).where(User.id == sup_id, User.is_active == True)
        )
    ).scalar_one_or_none()
    if not sup or sup.role != "supervisor_ccot":
        raise HTTPException(status_code=404, detail="Supervisor no encontrado")
    sup.disponible = body.disponible
    await db.commit()
    # Actualizar en memoria del manager (si está online)
    from app.routers.presencia import manager
    manager.update_info(sup_id, disponible=body.disponible)
    return {"id": sup_id, "disponible": body.disponible}


# ─── Reasignación de alarmas ──────────────────────────────────────────────────

@router.patch("/alarmas/{alarma_id}/reasignar")
async def reasignar_alarma(
    alarma_id: int,
    body: ReasignarIn,
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Jefe reasigna manualmente una alarma activa a otro supervisor."""
    _check_jefe(cu)
    a = (await db.execute(sa_select(Alarma).where(Alarma.id == alarma_id))).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Alarma no encontrada")
    if a.estado not in {"abierta", "en_gestion"}:
        raise HTTPException(status_code=400, detail="Solo se pueden reasignar alarmas activas")

    sup = (
        await db.execute(
            sa_select(User).where(User.id == body.supervisor_id, User.is_active == True)
        )
    ).scalar_one_or_none()
    if not sup or sup.role != "supervisor_ccot":
        raise HTTPException(status_code=404, detail="Supervisor destino no encontrado")

    now = _tz_now()
    anterior = a.asignado_nombre
    a.asignado_a = sup.id
    a.asignado_nombre = sup.full_name
    db.add(AlarmaEvento(
        alarma_id=a.id,
        tipo="reasignacion",
        user_id=cu.id,
        descripcion=f"Reasignada por {cu.full_name}: {anterior} → {sup.full_name}",
        ts=now,
    ))
    await db.commit()
    return {
        "id": a.id,
        "asignado_a": sup.id,
        "asignado_nombre": sup.full_name,
    }


# ─── Vista global de alarmas (para el jefe) ───────────────────────────────────

@router.get("/alarmas")
async def todas_alarmas_jefe(
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Todas las alarmas activas + resumen, para la vista del jefe."""
    _check_jefe(cu)
    rows = (
        await db.execute(
            sa_select(Alarma)
            .where(Alarma.estado.in_(["abierta", "en_gestion"]))
            .order_by(Alarma.nivel.desc(), Alarma.fecha_creacion.asc())
        )
    ).scalars().all()

    def _s(a: Alarma) -> Dict:
        return {
            "id": a.id,
            "tecnico": a.tecnico,
            "celula": a.celula,
            "microcelda": a.microcelda,
            "nivel": a.nivel,
            "estado": a.estado,
            "asignado_a": a.asignado_a,
            "asignado_nombre": a.asignado_nombre,
            "minutos_retraso_inicio": a.minutos_retraso_inicio,
            "fecha_creacion": a.fecha_creacion.isoformat() if a.fecha_creacion else None,
        }

    return [_s(a) for a in rows]
