"""CRUD de usuarios — solo admin."""
from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.constants import CELULAS, VALID_CELULAS, VALID_MICROCELDAS, get_celula_de_microcelda
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, UserList
from app.services.auth import get_current_user, hash_password

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])

ROLES_VALIDOS = {"admin", "lider_celula", "supervisor_microcelda"}


def _only_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    return current_user


def _validate_scope(
    role: str,
    celula: Optional[str],
    microcelda: Optional[str] = None,
    microceldas: Optional[List[str]] = None,
) -> None:
    """Valida rol, célula y lista de microceldas coherentes."""
    if role not in ROLES_VALIDOS:
        raise HTTPException(status_code=422, detail=f"Rol inválido. Opciones: {sorted(ROLES_VALIDOS)}")

    if role == "lider_celula":
        if not celula:
            raise HTTPException(status_code=422, detail="lider_celula requiere célula")
        if celula not in VALID_CELULAS:
            raise HTTPException(status_code=422, detail=f"Célula '{celula}' no existe")

    if role == "supervisor_microcelda":
        if not celula:
            raise HTTPException(status_code=422, detail="supervisor_microcelda requiere célula")
        if celula not in VALID_CELULAS:
            raise HTTPException(status_code=422, detail=f"Célula '{celula}' no existe")

        # Lista efectiva: nueva forma (microceldas) o legacy (microcelda)
        effective: List[str] = microceldas if microceldas else ([microcelda] if microcelda else [])
        if not effective:
            raise HTTPException(status_code=422, detail="supervisor_microcelda requiere al menos una microcelda")

        for mc in effective:
            if mc not in VALID_MICROCELDAS:
                raise HTTPException(status_code=422, detail=f"Microcelda '{mc}' no existe")
            celula_padre = get_celula_de_microcelda(mc)
            if celula_padre != celula:
                raise HTTPException(
                    status_code=422,
                    detail=f"'{mc}' pertenece a '{celula_padre}', no a '{celula}'"
                )


# ── Endpoint público (autenticado): estructura de células ─────────────────────
@router.get("/celulas-estructura", include_in_schema=True)
async def celulas_estructura(_: User = Depends(get_current_user)):
    """Devuelve el mapa célula → [microceldas] para poblar selectores."""
    return {"celulas": CELULAS}


# ── CRUD ──────────────────────────────────────────────────────────────────────
@router.get("", response_model=List[UserList])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_only_admin),
):
    result = await db.execute(select(User).order_by(User.id))
    return [UserList.model_validate(u) for u in result.scalars().all()]


@router.post("", response_model=UserList, status_code=201)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_only_admin),
):
    # Resolver lista efectiva de microceldas
    effective_mcs: Optional[List[str]] = data.microceldas or ([data.microcelda] if data.microcelda else None)
    _validate_scope(data.role, data.celula, microceldas=effective_mcs)

    exists = await db.execute(select(User).where(User.username == data.username))
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Usuario ya existe")

    user = User(
        username=data.username,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=data.role,
        celula=data.celula or None,
        # legacy: guardar la primera microcelda en el campo simple para compatibilidad
        microcelda=effective_mcs[0] if effective_mcs else None,
        # nueva: guardar la lista completa como JSON
        microceldas=effective_mcs if effective_mcs and len(effective_mcs) > 1 else None,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserList.model_validate(user)


@router.put("/{user_id}", response_model=UserList)
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_only_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    new_role   = data.role   if data.role   is not None else user.role
    new_celula = data.celula if data.celula is not None else user.celula

    # Resolver lista efectiva de microceldas para validación
    if data.microceldas is not None:
        new_effective_mcs = data.microceldas or None
    elif data.microcelda is not None:
        new_effective_mcs = [data.microcelda] if data.microcelda else None
    else:
        new_effective_mcs = user.microcelda_list or None

    _validate_scope(new_role, new_celula, microceldas=new_effective_mcs)

    if data.full_name  is not None: user.full_name       = data.full_name
    if data.password   is not None: user.hashed_password = hash_password(data.password)
    if data.role       is not None: user.role             = data.role
    if data.celula     is not None: user.celula           = data.celula or None
    if data.is_active  is not None: user.is_active        = data.is_active

    # Actualizar microceldas
    if data.microceldas is not None or data.microcelda is not None:
        mcs = new_effective_mcs or []
        user.microcelda  = mcs[0] if mcs else None                          # campo legacy
        user.microceldas = mcs if len(mcs) > 1 else None                   # JSON solo si > 1

    await db.commit()
    await db.refresh(user)
    return UserList.model_validate(user)


@router.delete("/{user_id}", status_code=204)
async def deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(_only_admin),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.is_active = False
    await db.commit()
