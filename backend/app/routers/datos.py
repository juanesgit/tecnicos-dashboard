"""Router de datos operacionales — datos_service corre en thread pool."""
import asyncio
import copy
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from fastapi.responses import JSONResponse

from app.models.user import User
from app.services.auth import get_current_user, check_api_key
from app.services.datos_service import (
    ejecutar_consulta_v2,
    serializar_datos,
    calcular_estadisticas,
    calcular_cumplimiento_dia_por_tecnicos,
)
from app.services.cache_service import get_cached_datos, set_cached_datos
from app.config import settings

router = APIRouter(tags=["Datos"])


class _AuthResult:
    def __init__(self, user: Optional[User], is_bot: bool):
        self.user = user
        self.is_bot = is_bot


def _require_auth(
    current_user: Optional[User] = Depends(get_current_user),
    x_api_key: Optional[str] = Header(default=None),
    api_key: Optional[str] = Query(default=None),
) -> _AuthResult:
    """Permite acceso con JWT o con API Key del bot. Devuelve user y flag de bot."""
    if check_api_key(x_api_key or api_key):
        return _AuthResult(user=None, is_bot=True)
    if current_user is None:
        raise HTTPException(status_code=401, detail="No autenticado")
    return _AuthResult(user=current_user, is_bot=False)


def _apply_scope(payload: dict, user: User) -> dict:
    """Filtra datos según el rol del usuario:
    - admin: datos completos
    - lider_celula: filtra por célula
    - supervisor_microcelda: filtra por lista de microceldas (soporta múltiples)
    - supervisor_ccot: filtra por lista de células (soporta múltiples)
    """
    role = user.role
    datos = payload.get("datos", [])

    if role == "lider_celula" and user.celula:
        celula = user.celula.strip().lower()
        datos = [d for d in datos if str(d.get("celula", "")).strip().lower() == celula]
    elif role == "supervisor_microcelda":
        micros = {m.strip().lower() for m in user.microcelda_list}
        if micros:
            datos = [d for d in datos if str(d.get("microcelda", "")).strip().lower() in micros]
    elif role == "supervisor_ccot":
        celulas = {c.strip().lower() for c in user.celula_list}
        if celulas:
            datos = [d for d in datos if str(d.get("celula", "")).strip().lower() in celulas]

    result = copy.copy(payload)
    result["datos"] = datos
    return result


@router.get("/datos")
async def datos(auth: _AuthResult = Depends(_require_auth)):
    cached = get_cached_datos()
    if cached is not None:
        content = cached
        if not auth.is_bot and auth.user and auth.user.role != "admin":
            content = _apply_scope(cached, auth.user)
        return JSONResponse(content=content, headers={
            "X-App-Version": settings.APP_VERSION,
            "X-App-Timezone": settings.APP_TIMEZONE,
            "X-Cache": "HIT",
        })

    loop = asyncio.get_event_loop()
    df = await loop.run_in_executor(None, ejecutar_consulta_v2)

    if df is None or df.empty:
        raise HTTPException(status_code=404, detail="No se encontraron datos para hoy")

    payload = {
        "datos": serializar_datos(df),
        "estadisticas": calcular_estadisticas(df),
        "version_backend": settings.APP_VERSION,
    }
    set_cached_datos(payload)

    content = payload
    if not auth.is_bot and auth.user and auth.user.role != "admin":
        content = _apply_scope(payload, auth.user)

    return JSONResponse(content=content, headers={
        "X-App-Version": settings.APP_VERSION,
        "X-App-Timezone": settings.APP_TIMEZONE,
        "X-Cache": "MISS",
    })


@router.post("/cumplimiento-dia")
async def cumplimiento_dia(body: dict, auth: _AuthResult = Depends(_require_auth)):
    tecnicos = body.get("tecnicos") or []
    if not isinstance(tecnicos, list):
        raise HTTPException(status_code=400, detail='El campo "tecnicos" debe ser una lista')
    tecnicos = [str(t).strip() for t in tecnicos if str(t).strip()]
    loop = asyncio.get_event_loop()
    valor = await loop.run_in_executor(None, calcular_cumplimiento_dia_por_tecnicos, tecnicos)
    return {"cumplimiento_time_slot_dia": valor}


@router.get("/health")
async def health():
    from datetime import datetime
    import pytz
    tz = pytz.timezone(settings.APP_TIMEZONE)
    now = datetime.now(tz)
    return JSONResponse(
        content={"status": "ok", "time": now.isoformat(), "version": settings.APP_VERSION, "timezone": settings.APP_TIMEZONE},
        headers={"X-App-Version": settings.APP_VERSION, "X-App-Timezone": settings.APP_TIMEZONE},
    )


@router.get("/version")
async def version():
    return {"version": settings.APP_VERSION, "timezone": settings.APP_TIMEZONE}
