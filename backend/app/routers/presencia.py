"""Presencia en tiempo real — WebSocket + endpoint REST."""
from __future__ import annotations
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException, Depends
from sqlalchemy import select
from jose import jwt, JWTError

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user import User
from app.services.auth import get_current_user


# ── Connection Manager (en memoria — funciona con 1 proceso uvicorn) ──────────
class ConnectionManager:
    def __init__(self):
        self._conns: dict[int, WebSocket] = {}   # user_id → ws
        self._info:  dict[int, dict]      = {}   # user_id → metadatos

    async def connect(self, user_id: int, info: dict, ws: WebSocket):
        await ws.accept()
        self._conns[user_id] = ws
        self._info[user_id]  = info

    def disconnect(self, user_id: int):
        self._conns.pop(user_id, None)
        self._info.pop(user_id, None)

    def get_online(self) -> list[dict]:
        return [{"user_id": uid, **meta} for uid, meta in self._info.items()]

    @property
    def count(self) -> int:
        return len(self._conns)


manager = ConnectionManager()


# ── Helpers ──────────────────────────────────────────────────────────────────
async def _user_from_token(token: str) -> User | None:
    """Decodifica el JWT pasado como query param y devuelve el usuario activo."""
    try:
        payload  = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id  = int(payload.get("sub", 0))
    except (JWTError, ValueError):
        return None
    async with AsyncSessionLocal() as db:
        res  = await db.execute(
            select(User).where(User.id == user_id, User.is_active == True)
        )
        return res.scalar_one_or_none()


# ── WebSocket /ws/presencia — registrado SIN prefijo /api en main.py ─────────
async def ws_presencia(websocket: WebSocket, token: str = Query(...)):
    """
    El frontend conecta al iniciar sesión y mantiene la conexión abierta.
    Envía 'ping' cada 30 s para evitar timeout del servidor.
    """
    user = await _user_from_token(token)
    if not user:
        await websocket.close(code=4001)  # 4001 = no autorizado
        return

    await manager.connect(
        user.id,
        {"username": user.username, "full_name": user.full_name, "role": user.role},
        websocket,
    )
    try:
        while True:
            await websocket.receive_text()   # absorbe pings del cliente
    except WebSocketDisconnect:
        manager.disconnect(user.id)


# ── REST /api/actividad/online — registrado CON prefijo /api en main.py ──────
router = APIRouter(tags=["Presencia"])

@router.get("/actividad/online")
async def get_online(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    return {
        "count":  manager.count,
        "online": manager.get_online(),
    }
