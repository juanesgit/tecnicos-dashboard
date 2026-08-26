"""Router de zonas territoriales — célula / microcelda / nodo."""
import asyncio
from fastapi import APIRouter, Depends, HTTPException

from app.services.zonas_service import get_jerarquia, reload_zonas
from app.services.auth import get_current_user

router = APIRouter(prefix="/zonas", tags=["zonas"])


@router.get("")
async def listar_zonas():
    """Devuelve la jerarquía célula → microcelda → ciudades."""
    loop = asyncio.get_event_loop()
    jerarquia = await loop.run_in_executor(None, get_jerarquia)
    return {"zonas": jerarquia}


@router.post("/recargar")
async def recargar_zonas(current_user=Depends(get_current_user)):
    """Fuerza la recarga del Excel de nodos (requiere autenticación)."""
    loop = asyncio.get_event_loop()
    total = await loop.run_in_executor(None, reload_zonas)
    return {"ok": True, "nodos_cargados": total}
