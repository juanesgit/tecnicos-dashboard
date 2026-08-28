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

ROLES_VALIDOS = {"admin", "lider_celula", "supervisor_microcelda", "supervisor_ccot"}


def _only_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    return current_user


def _validate_scope(
    role: str,
    celula: Optional[str],
    microcelda: Optional[str],
    microceldas: Optional[List[str]] = None,
    celulas: Optional[List[str]] = None,
) -> None:
    """Valida que la célula/microceldas/células sean coherentes con el rol."""
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
        mcs = microceldas or ([microcelda] if microcelda else [])
        if not mcs:
            raise HTTPException(status_code=422, detail="supervisor_microcelda requiere al menos una microcelda")
        for mc in mcs:
            if mc not in VALID_MICROCELDAS:
                raise HTTPException(status_code=422, detail=f"Microcelda '{mc}' no existe")
            celula_padre = get_celula_de_microcelda(mc)
            if celula_padre != celula:
                raise HTTPException(
                    status_code=422,
                    detail=f"'{mc}' pertenece a '{celula_padre}', no a '{celula}'"
                )

    if role == "supervisor_ccot":
        cls = celulas or ([celula] if celula else [])
        if not cls:
            raise HTTPException(status_code=422, detail="supervisor_ccot requiere al menos una célula")
        for c in cls:
            if c not in VALID_CELULAS:
                raise HTTPException(status_code=422, detail=f"Célula '{c}' no existe")


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
    _validate_scope(data.role, data.celula, data.microcelda, data.microceldas, data.celulas)

    exists = await db.execute(select(User).where(User.username == data.username))
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Usuario ya existe")

    # Para supervisor_ccot: primera célula de la lista va también en campo legacy celula
    celula_legacy = data.celula
    if data.role == "supervisor_ccot" and data.celulas:
        celula_legacy = data.celulas[0]

    user = User(
        username=data.username,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=data.role,
        celula=celula_legacy or None,
        microcelda=data.microcelda or None,
        microceldas=data.microceldas or None,
        celulas=data.celulas or None,
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

    # Tomar valores actuales si el update es parcial
    new_role       = data.role       if data.role       is not None else user.role
    new_celula     = data.celula     if data.celula     is not None else user.celula
    new_microcelda = data.microcelda if data.microcelda is not None else user.microcelda
    new_microceldas = data.microceldas if data.microceldas is not None else user.microceldas
    new_celulas     = data.celulas    if data.celulas    is not None else user.celulas
    _validate_scope(new_role, new_celula, new_microcelda, new_microceldas, new_celulas)

    if data.full_name   is not None: user.full_name       = data.full_name
    if data.password    is not None: user.hashed_password = hash_password(data.password)
    if data.role        is not None: user.role             = data.role
    if data.celula      is not None: user.celula           = data.celula or None
    if data.microcelda  is not None: user.microcelda       = data.microcelda or None
    if data.microceldas is not None: user.microceldas      = data.microceldas or None
    if data.celulas     is not None:
        user.celulas = data.celulas or None
        # Actualizar campo legacy celula con la primera célula de la lista
        if data.celulas:
            user.celula = data.celulas[0]
    if data.is_active   is not None: user.is_active        = data.is_active

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
