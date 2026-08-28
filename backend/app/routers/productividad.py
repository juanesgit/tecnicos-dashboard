"""Router de productividad — métricas por técnico y microcelda."""
import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from fastapi.responses import JSONResponse
from typing import Optional
import pandas as pd
import pytz

from app.models.user import User
from app.services.auth import get_current_user, check_api_key
from app.mysql_db import get_mysql_connection
from app.config import settings
from app.services.zonas_service import get_zona_map
from app.routers.avance import _es_no_operativa
import time as _time

_prod_cache: dict = {}
_PROD_TTL = 180   # 3 min

router = APIRouter(tags=["Productividad"])

JORNADA_INICIO_MIN = 420   # 07:00
JORNADA_FIN_MIN    = 1080  # 18:00


class _AuthResult:
    def __init__(self, user: Optional[User], is_bot: bool):
        self.user = user
        self.is_bot = is_bot


def _require_auth(
    current_user: Optional[User] = Depends(get_current_user),
    x_api_key: Optional[str] = Header(default=None),
    api_key: Optional[str] = Query(default=None),
) -> _AuthResult:
    if check_api_key(x_api_key or api_key):
        return _AuthResult(user=None, is_bot=True)
    if current_user is None:
        raise HTTPException(status_code=401, detail="No autenticado")
    return _AuthResult(user=current_user, is_bot=False)


def _proyectar_cierre(current_min: int, cerradas: int, por_cerrar: int):
    """Proyecta el % de avance a las 18:00 basado en el ritmo actual."""
    total_ejecutable = cerradas + por_cerrar
    if total_ejecutable == 0:
        return None
    transcurridos = current_min - JORNADA_INICIO_MIN
    if transcurridos <= 0:
        return None
    restantes = JORNADA_FIN_MIN - current_min
    if restantes <= 0:
        return round(min(100.0, (cerradas / total_ejecutable) * 100), 1)
    ritmo = cerradas / transcurridos
    return round(min(100.0, ((cerradas + ritmo * restantes) / total_ejecutable) * 100), 1)


def _calcular_productividad(celula: Optional[str] = None) -> dict:
    cache_key = f"prod:{celula or '__all__'}"
    cached = _prod_cache.get(cache_key)
    if cached and (_time.monotonic() - cached["ts"]) < _PROD_TTL:
        return cached["data"]

    tz = pytz.timezone(settings.APP_TIMEZONE)
    now = datetime.now(tz)
    current_min = now.hour * 60 + now.minute
    hora_actual = f"{now.hour:02d}:{now.minute:02d}"

    connection = None
    try:
        connection = get_mysql_connection()
        with connection.cursor() as cursor:
            cursor.execute("SHOW TABLES LIKE 'wf_futuro_pruebas'")
            if not cursor.fetchall():
                return {"por_tecnico": [], "por_microcelda": [], "hora_corte": hora_actual}

            cursor.execute("""
                SELECT w.`Técnico`, w.`Estado`, w.`Tipo de Actividad`,
                       w.`Inicio`, w.`Inicio - Fin`, w.`Nodo`, w.`Fecha`
                FROM wf_futuro_pruebas w
                WHERE w.Origen IN ('REGION OCCIDENTE', 'PYMES OCCIDENTE')
                  AND w.Fecha >= CURRENT_DATE()
                  AND w.Fecha < CURRENT_DATE() + INTERVAL 1 DAY
            """)
            results = cursor.fetchall()

        if not results:
            return {"por_tecnico": [], "por_microcelda": [], "hora_corte": hora_actual}

        df = pd.DataFrame(results)

        # Excluir actividades no operativas
        df = df[~df["Tipo de Actividad"].apply(_es_no_operativa)].copy()
        if df.empty:
            return {"por_tecnico": [], "por_microcelda": [], "hora_corte": hora_actual}

        # Normalizar estados
        estado_map = {
            "Completado":    "completado",
            "No completado": "no_completado",
            "Iniciado":      "iniciado",
            "Pendiente":     "pendiente",
            "Suspendido":    "suspendido",
            "Cancelado":     "cancelado",
        }
        df["estado_norm"] = df["Estado"].map(estado_map).fillna("otro")

        # Mapeo de zona
        zona_map = get_zona_map()
        df["microcelda"] = df["Nodo"].apply(
            lambda n: zona_map.get(str(n).strip(), {}).get("microcelda", "Sin clasificar")
            if pd.notna(n) else "Sin clasificar"
        )
        df["celula"] = df["Nodo"].apply(
            lambda n: zona_map.get(str(n).strip(), {}).get("celula", "Sin clasificar")
            if pd.notna(n) else "Sin clasificar"
        )

        if celula:
            df = df[df["celula"] == celula].copy()
            if df.empty:
                return {"por_tecnico": [], "por_microcelda": [], "hora_corte": hora_actual}

        # ── 1. Por técnico ─────────────────────────────────────────────────────
        por_tecnico = []
        for tecnico_name, grp in df.groupby("Técnico"):
            tname = str(tecnico_name).strip()
            if not tname:
                continue

            # Microcelda y célula más frecuente del técnico
            mc_mode  = grp["microcelda"].mode()
            cel_mode = grp["celula"].mode()
            mc  = str(mc_mode.iloc[0])  if not mc_mode.empty  else "Sin clasificar"
            cel = str(cel_mode.iloc[0]) if not cel_mode.empty else "Sin clasificar"

            c   = grp["estado_norm"].value_counts().to_dict()
            com = c.get("completado",    0)
            nc  = c.get("no_completado", 0)
            ini = c.get("iniciado",      0)
            pen = c.get("pendiente",     0)
            sus = c.get("suspendido",    0)
            can = c.get("cancelado",     0)

            cerradas   = com + nc
            por_cerrar = ini + pen + sus
            ejecutable = cerradas + por_cerrar   # excluye canceladas

            # Avance: OTs cerradas / OTs ejecutables
            avance = round(cerradas / ejecutable * 100, 1) if ejecutable > 0 else 0.0

            # Calidad: completadas exitosas / total cerradas
            calidad = round(com / cerradas * 100, 1) if cerradas > 0 else None

            # Velocidad: proyección de avance a las 18:00
            velocidad = _proyectar_cierre(current_min, cerradas, por_cerrar)

            por_tecnico.append({
                "tecnico":       tname,
                "celula":        cel,
                "microcelda":    mc,
                "total":         len(grp),
                "completado":    com,
                "no_completado": nc,
                "iniciado":      ini,
                "pendiente":     pen,
                "suspendido":    sus,
                "cancelado":     can,
                "ejecutable":    ejecutable,
                "cerradas":      cerradas,
                "avance":        avance,
                "calidad":       calidad,        # None si sin OTs cerradas aún
                "velocidad":     velocidad,      # None si sin ritmo calculable
            })

        por_tecnico.sort(key=lambda x: -(x["avance"] or 0))

        # ── 2. Por microcelda (agrupado) ───────────────────────────────────────
        por_microcelda = []
        for (cel_mc, mc), grp_mc in df.groupby(["celula", "microcelda"]):
            cm  = grp_mc["estado_norm"].value_counts().to_dict()
            com = cm.get("completado",    0)
            nc  = cm.get("no_completado", 0)
            ini = cm.get("iniciado",      0)
            pen = cm.get("pendiente",     0)
            sus = cm.get("suspendido",    0)

            cerradas   = com + nc
            por_cerrar = ini + pen + sus
            ejecutable = cerradas + por_cerrar

            avance    = round(cerradas / ejecutable * 100, 1) if ejecutable > 0 else 0.0
            calidad   = round(com / cerradas * 100, 1)        if cerradas > 0   else None
            velocidad = _proyectar_cierre(current_min, cerradas, por_cerrar)

            n_tecnicos = int(grp_mc["Técnico"].nunique())

            por_microcelda.append({
                "microcelda":    str(mc),
                "celula":        str(cel_mc),
                "n_tecnicos":    n_tecnicos,
                "ejecutable":    ejecutable,
                "cerradas":      cerradas,
                "completado":    com,
                "no_completado": nc,
                "iniciado":      ini,
                "pendiente":     pen,
                "suspendido":    sus,
                "avance":        avance,
                "calidad":       calidad,
                "velocidad":     velocidad,
            })

        por_microcelda.sort(key=lambda x: -(x["avance"] or 0))

        result = {
            "por_tecnico":    por_tecnico,
            "por_microcelda": por_microcelda,
            "hora_corte":     hora_actual,
        }
        _prod_cache[cache_key] = {"data": result, "ts": _time.monotonic()}
        return result

    except Exception as e:
        import sys, traceback
        print(f"[PRODUCTIVIDAD] ERROR: {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return {"por_tecnico": [], "por_microcelda": [], "hora_corte": hora_actual}
    finally:
        if connection:
            connection.close()


@router.get("/productividad/tecnicos")
async def productividad_tecnicos(
    celula: Optional[str] = Query(default=None),
    auth: _AuthResult = Depends(_require_auth),
):
    """
    Métricas de productividad por técnico y microcelda.

    - **avance**: % OTs cerradas sobre ejecutables (corte actual)
    - **calidad**: % OTs completadas exitosamente sobre total cerradas
    - **velocidad**: % avance proyectado a las 18:00 según ritmo actual
    """
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, _calcular_productividad, celula)
    return JSONResponse(content=data)
