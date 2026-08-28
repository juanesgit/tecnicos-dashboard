from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import pytz

from app.database import get_db
from app.models.user import User
from app.models.actividad import ActividadUsuario
from app.schemas.user import LoginRequest, Token, UserOut
from app.services.auth import verify_password, create_access_token, get_current_user
from app.config import settings

router = APIRouter(prefix="/auth", tags=["Auth"])

TZ = pytz.timezone(settings.APP_TIMEZONE)


@router.post("/login", response_model=Token)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    # Registrar evento de login
    db.add(ActividadUsuario(
        user_id   = user.id,
        username  = user.username,
        full_name = user.full_name,
        role      = user.role,
        evento    = "login",
        ts        = datetime.now(TZ).replace(tzinfo=None),
    ))
    await db.commit()

    token = create_access_token(user.id)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)
