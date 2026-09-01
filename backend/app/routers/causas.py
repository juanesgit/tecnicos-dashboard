"""Router de causas de retraso — configurables por admin."""
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.alarma import CausaRetraso
from app.models.user import User
from app.services.auth import get_current_user

router = APIRouter(prefix="/causas", tags=["Causas"])


def _only_admin(cu: User):
    if cu.role != "admin":
        raise HTTPException(status_code=403, detail="Solo admin")


def _ser(c: CausaRetraso) -> dict:
    return {"id": c.id, "nombre": c.nombre, "descripcion": c.descripcion, "activa": c.activa}


class CausaIn(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    activa: bool = True


class CausaPatch(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    activa: Optional[bool] = None


@router.get("")
async def listar(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Lista todas las causas. Admin ve todas; supervisor solo activas."""
    q = sa_select(CausaRetraso).order_by(CausaRetraso.nombre)
    if cu.role != "admin":
        q = q.where(CausaRetraso.activa == True)
    rows = (await db.execute(q)).scalars().all()
    return [_ser(c) for c in rows]


@router.post("", status_code=201)
async def crear(body: CausaIn, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _only_admin(cu)
    existente = (await db.execute(sa_select(CausaRetraso).where(CausaRetraso.nombre == body.nombre))).scalar_one_or_none()
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe una causa con ese nombre")
    c = CausaRetraso(nombre=body.nombre, descripcion=body.descripcion, activa=body.activa)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return _ser(c)


@router.patch("/{causa_id}")
async def actualizar(causa_id: int, body: CausaPatch, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _only_admin(cu)
    c = (await db.execute(sa_select(CausaRetraso).where(CausaRetraso.id == causa_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="No encontrada")
    if body.nombre is not None:
        c.nombre = body.nombre
    if body.descripcion is not None:
        c.descripcion = body.descripcion
    if body.activa is not None:
        c.activa = body.activa
    await db.commit()
    return _ser(c)


@router.delete("/{causa_id}", status_code=204)
async def eliminar(causa_id: int, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _only_admin(cu)
    c = (await db.execute(sa_select(CausaRetraso).where(CausaRetraso.id == causa_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="No encontrada")
    await db.delete(c)
    await db.commit()
