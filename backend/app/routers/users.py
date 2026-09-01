from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select as sa_select
from app.models.user import User
from app.schemas.user import UserOut
from app.services.auth import get_current_user
from app.database import get_db

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.patch("/me/disponible")
async def toggle_disponible(
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Supervisor activa/desactiva su disponibilidad para recibir alarmas."""
    if cu.role not in {"admin", "supervisor_ccot"}:
        raise HTTPException(status_code=403, detail="Sin permiso")
    cu.disponible = not cu.disponible
    await db.commit()
    # Sincronizar el estado en memoria del WebSocket (si está conectado)
    from app.routers.presencia import manager
    manager.update_info(cu.id, disponible=cu.disponible)
    return {"disponible": cu.disponible}


@router.get("/supervisores-disponibles")
async def supervisores_disponibles(
    cu: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista supervisores_ccot disponibles (solo admin)."""
    if cu.role != "admin":
        raise HTTPException(status_code=403, detail="Solo admin")
    result = await db.execute(
        sa_select(User).where(
            User.role == "supervisor_ccot",
            User.is_active == True,
        )
    )
    sups = result.scalars().all()
    return [
        {"id": u.id, "full_name": u.full_name, "disponible": u.disponible}
        for u in sups
    ]
