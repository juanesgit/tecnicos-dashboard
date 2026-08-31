"""Router de alarmas."""
from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.alarma import Alarma, AlarmaEvento, SLA_MAP
from app.models.user import User
from app.services.auth import get_current_user
from app.services.cache_service import get_cached_datos

router = APIRouter(prefix="/alarmas", tags=["Alarmas"])
ROLES = {"admin", "supervisor_ccot"}


def _check(user: User):
    if user.role not in ROLES:
        raise HTTPException(status_code=403, detail="Sin permiso")


def _ser(a: Alarma) -> Dict[str, Any]:
    return {
        "id": a.id, "tecnico": a.tecnico, "celula": a.celula,
        "microcelda": a.microcelda, "nivel": a.nivel, "estado": a.estado,
        "asignado_a": a.asignado_a, "asignado_nombre": a.asignado_nombre,
        "fecha_creacion": a.fecha_creacion.isoformat() if a.fecha_creacion else None,
        "fecha_cierre": a.fecha_cierre.isoformat() if a.fecha_cierre else None,
        "tiempo_resolucion_min": a.tiempo_resolucion_min,
        "notas": a.notas, "sla_cumplido": a.sla_cumplido,
        "ciudad": a.ciudad,
        "tipo_retraso": a.tipo_retraso,
        "minutos_retraso_inicio": a.minutos_retraso_inicio,
        "actividad": a.actividad,
        "ot": a.ot,
    }


class NotaIn(BaseModel):
    notas: str

class CerrarIn(BaseModel):
    notas: Optional[str] = None


@router.get("/badge")
async def badge(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _check(cu)
    q = sa_select(Alarma).where(Alarma.estado == "abierta")
    if cu.role != "admin":
        q = q.where(Alarma.asignado_a == cu.id)
    rows = (await db.execute(q)).scalars().all()
    return {
        "total": len(rows),
        "criticas": sum(1 for a in rows if a.nivel == "critica"),
        "moderadas": sum(1 for a in rows if a.nivel == "moderada"),
    }


@router.get("/mis")
async def mis_alarmas(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _check(cu)
    if cu.role == "admin":
        q = sa_select(Alarma).order_by(Alarma.estado.asc(), Alarma.nivel.desc(), Alarma.fecha_creacion.asc())
    else:
        q = sa_select(Alarma).where(Alarma.asignado_a == cu.id).order_by(Alarma.estado.asc(), Alarma.nivel.desc(), Alarma.fecha_creacion.asc())
    rows = (await db.execute(q)).scalars().all()
    return [_ser(a) for a in rows]


@router.get("/todas")
async def todas(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if cu.role != "admin":
        raise HTTPException(status_code=403, detail="Solo admin")
    rows = (await db.execute(sa_select(Alarma).order_by(Alarma.estado.asc(), Alarma.nivel.desc(), Alarma.fecha_creacion.asc()))).scalars().all()
    return [_ser(a) for a in rows]


@router.get("/distribucion-retrasos")
async def distribucion_retrasos(cu: User = Depends(get_current_user)) -> List[Dict[str, Any]]:
    """Técnicos con retraso activo desde el caché de datos operacionales (MySQL).
    Devuelve todos los técnicos en estados de retraso para la gráfica de distribución."""
    _check(cu)
    cached = get_cached_datos()
    if not cached:
        return []
    ESTADOS = {"Retraso actual", "Retraso en siguiente"}
    result = []
    for d in cached.get("datos", []):
        estado = d.get("estado_actual", "")
        if estado not in ESTADOS:
            continue
        # Para "Retraso en siguiente" usar minutos_retraso_siguiente
        if estado == "Retraso en siguiente":
            min_ret = max(0, int(d.get("minutos_retraso_siguiente") or 0))
        else:
            min_ret = max(0, int(d.get("minutos_retraso") or 0))
        result.append({
            "tecnico":    d.get("Técnico") or "",
            "celula":     d.get("celula") or "Sin clasificar",
            "microcelda": d.get("microcelda") or "Sin clasificar",
            "ciudad":     d.get("ciudad_nodo") or d.get("ciudad_actual") or "",
            "actividad":  d.get("actividad_actual") or "",
            "ot":         str(d.get("ot_actual") or "").strip(),
            "estado":     "abierta",          # compat con GraficaDistribucion
            "minutos_retraso_inicio": min_ret,
        })
    return result


@router.patch("/{alarma_id}/nota")
async def nota(alarma_id: int, body: NotaIn, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _check(cu)
    a = (await db.execute(sa_select(Alarma).where(Alarma.id == alarma_id))).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="No encontrada")
    if cu.role != "admin" and a.asignado_a != cu.id:
        raise HTTPException(status_code=403, detail="No es tu alarma")
    a.notas = body.notas
    from app.config import settings; import pytz
    now = datetime.now(pytz.timezone(settings.APP_TIMEZONE)).replace(tzinfo=None)
    db.add(AlarmaEvento(alarma_id=a.id, tipo="nota", user_id=cu.id, descripcion=body.notas[:500], ts=now))
    await db.commit()
    return _ser(a)


@router.patch("/{alarma_id}/cerrar")
async def cerrar(alarma_id: int, body: CerrarIn, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _check(cu)
    a = (await db.execute(sa_select(Alarma).where(Alarma.id == alarma_id))).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="No encontrada")
    if cu.role != "admin" and a.asignado_a != cu.id:
        raise HTTPException(status_code=403, detail="No es tu alarma")
    if a.estado == "cerrada":
        raise HTTPException(status_code=400, detail="Ya cerrada")
    from app.config import settings; import pytz
    now = datetime.now(pytz.timezone(settings.APP_TIMEZONE)).replace(tzinfo=None)
    a.estado = "cerrada"
    a.fecha_cierre = now
    edad = int((now - a.fecha_creacion).total_seconds() / 60)
    a.tiempo_resolucion_min = edad
    a.sla_cumplido = edad <= SLA_MAP.get(a.nivel, 45)
    if body.notas:
        a.notas = body.notas
    db.add(AlarmaEvento(alarma_id=a.id, tipo="cierre_manual", user_id=cu.id,
                         descripcion=f"Cerrada por {cu.full_name}. {body.notas or ''}".strip(), ts=now))
    await db.commit()
    return _ser(a)
