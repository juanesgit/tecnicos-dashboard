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

    def update_info(self, user_id: int, **kwargs):
        """Actualiza campos del info en memoria para un usuario conectado."""
        if user_id in self._info:
            self._info[user_id].update(kwargs)

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
    Al conectar un supervisor_ccot se dispara un rebalanceo de alarmas.
    """
    import asyncio, logging
    _log = logging.getLogger(__name__)

    user = await _user_from_token(token)
    if not user:
        await websocket.close(code=4001)
        return

    await manager.connect(
        user.id,
        {
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "disponible": user.disponible,
        },
        websocket,
    )

    # Si es supervisor_ccot, rebalancear alarmas en background
    if user.role == "supervisor_ccot":
        asyncio.create_task(_rebalancear_alarmas(user.id, user.full_name))

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user.id)


async def _rebalancear_alarmas(nuevo_sup_id: int, nombre: str):
    """
    Cuando un supervisor_ccot se conecta, revisa si hay desequilibrio
    de carga (>50% de diferencia entre el supervisor con más y el recién llegado).
    Si es así, reasigna hasta equilibrar.
    """
    import logging
    _log = logging.getLogger(__name__)
    try:
        from app.database import AsyncSessionLocal
        from app.models.alarma import Alarma, AlarmaEvento
        from sqlalchemy import select as sa_select, func
        from datetime import datetime
        import pytz
        from app.config import settings

        tz  = pytz.timezone(settings.APP_TIMEZONE)
        now = datetime.now(tz).replace(tzinfo=None)

        async with AsyncSessionLocal() as session:
            # Todos los supervisores online ahora
            online_ids = [u["user_id"] for u in manager.get_online() if u.get("role") == "supervisor_ccot"]
            if len(online_ids) < 2:
                return  # nada que rebalancear si solo hay uno

            # Carga actual
            result = await session.execute(
                sa_select(Alarma.asignado_a, func.count(Alarma.id).label("cnt"))
                .where(Alarma.estado == "abierta", Alarma.asignado_a.in_(online_ids))
                .group_by(Alarma.asignado_a)
            )
            carga = {row[0]: row[1] for row in result.fetchall()}
            carga_nuevo = carga.get(nuevo_sup_id, 0)

            # Supervisor con más carga
            sup_max_id = max(online_ids, key=lambda sid: carga.get(sid, 0))
            carga_max  = carga.get(sup_max_id, 0)

            # Solo rebalancear si la diferencia es > 50% y hay al menos 2 alarmas a mover
            if sup_max_id == nuevo_sup_id or carga_max == 0:
                return
            diferencia = carga_max - carga_nuevo
            if diferencia < 2 or (diferencia / carga_max) < 0.5:
                return

            # Mover la mitad de la diferencia (redondeado hacia abajo)
            a_mover = diferencia // 2

            alarmas_res = await session.execute(
                sa_select(Alarma)
                .where(Alarma.estado == "abierta", Alarma.asignado_a == sup_max_id)
                .order_by(Alarma.nivel.asc(), Alarma.fecha_creacion.desc())  # mover las leves más nuevas primero
                .limit(a_mover)
            )
            alarmas = alarmas_res.scalars().all()

            for alarma in alarmas:
                alarma.asignado_a      = nuevo_sup_id
                alarma.asignado_nombre = nombre
                session.add(AlarmaEvento(
                    alarma_id   = alarma.id,
                    tipo        = "reasignacion",
                    user_id     = nuevo_sup_id,
                    descripcion = f"Reasignada a {nombre} por rebalanceo al reconectar.",
                    ts          = now,
                ))

            if alarmas:
                await session.commit()
                _log.info(
                    "[Alarma][Rebalanceo] %d alarma(s) movida(s) de sup %d → %s al reconectar",
                    len(alarmas), sup_max_id, nombre,
                )
    except Exception as exc:
        logging.getLogger(__name__).warning("[Alarma][Rebalanceo] Error: %s", exc)


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
