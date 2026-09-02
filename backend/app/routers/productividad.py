"""Router de productividad — métricas por técnico y microcelda.

Dimensiones del score (4):
  - Avance      : OTs cerradas (completado + no_completado) / ejecutables, ponderado por cuota
  - Efectividad : OTs completadas / ejecutables (escala 0..1/n — nunca null)
  - Velocidad   : proyección de avance ponderado a las 18:00 según ritmo actual
  - Cumplimiento: % de OTs completadas iniciadas antes de su fin planificado (a tiempo)
"""
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


def _proyectar_cierre(current_min: int, peso_cerradas: float, peso_por_cerrar: float):
    """Proyecta el % de avance ponderado a las 18:00 basado en el ritmo actual."""
    peso_total = peso_cerradas + peso_por_cerrar
    if peso_total == 0:
        return None
    transcurridos = current_min - JORNADA_INICIO_MIN
    if transcurridos <= 0:
        return None
    restantes = JORNADA_FIN_MIN - current_min
    if restantes <= 0:
        return round(min(100.0, (peso_cerradas / peso_total) * 100), 1)
    ritmo = peso_cerradas / transcurridos
    return round(min(100.0, ((peso_cerradas + ritmo * restantes) / peso_total) * 100), 1)


def _parse_fin_planificado(inicio_fin_str: str) -> Optional[str]:
    """Extrae el tiempo fin de 'HH:MM - HH:MM'. Retorna 'HH:MM' o None."""
    try:
        partes = str(inicio_fin_str or "").split(" - ")
        if len(partes) >= 2:
            fin = partes[1].strip()
            if len(fin) == 5 and fin[2] == ":":
                return fin
    except Exception:
        pass
    return None


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

            # ── Query con JOIN a wf_time_slot para obtener cuota por subtipo ──
            cursor.execute("""
                SELECT
                    w.`Técnico`,
                    w.`Estado`,
                    w.`Tipo de Actividad`,
                    w.`Subtipo de la Orden de Trabajo`,
                    w.`Inicio`,
                    w.`Inicio - Fin`,
                    w.`Nodo`,
                    w.`Fecha`,
                    COALESCE(ts.cuota, 1) AS cuota_norma
                FROM wf_futuro_pruebas w
                LEFT JOIN wf_time_slot ts
                    ON TRIM(w.`Subtipo de la Orden de Trabajo`)
                       COLLATE utf8mb4_general_ci
                     = TRIM(ts.SUBTRABAJO_WF)
                       COLLATE utf8mb4_general_ci
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

        # ── Normalizar estados ────────────────────────────────────────────────
        estado_map = {
            "Completado":    "completado",
            "No completado": "no_completado",
            "Iniciado":      "iniciado",
            "Pendiente":     "pendiente",
            "Suspendido":    "suspendido",
            "Cancelado":     "cancelado",
        }
        df["estado_norm"] = df["Estado"].map(estado_map).fillna("otro")

        # ── Peso por cuota: 1/cuota (OT compleja = cuota baja = mayor peso) ──
        df["cuota_norma"] = pd.to_numeric(df["cuota_norma"], errors="coerce").fillna(1).clip(lower=1)
        df["peso"] = 1.0 / df["cuota_norma"]

        # ── Flags de estado ───────────────────────────────────────────────────
        df["is_completado"] = df["estado_norm"] == "completado"
        df["is_cerrada"]    = df["estado_norm"].isin(["completado", "no_completado"])
        df["is_ejecutable"] = df["estado_norm"].isin(
            ["completado", "no_completado", "iniciado", "pendiente", "suspendido"]
        )

        # ── Cumplimiento: inicio real <= fin planificado ──────────────────────
        df["fin_planificado"] = df["Inicio - Fin"].apply(_parse_fin_planificado)
        df["inicio_str"]      = df["Inicio"].astype(str).str.strip()

        def _a_tiempo(row):
            if not row["is_completado"]:
                return None
            fin = row["fin_planificado"]
            ini = row["inicio_str"]
            if not fin or not ini or fin in ("nan", "") or ini in ("nan", ""):
                return None
            try:
                return ini <= fin   # HH:MM — comparación lexicográfica válida en 24 h
            except Exception:
                return None

        df["a_tiempo"] = df.apply(_a_tiempo, axis=1)

        # ── Mapeo de zona ─────────────────────────────────────────────────────
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

        # ── 1. Por técnico ────────────────────────────────────────────────────
        por_tecnico = []
        for tecnico_name, grp in df.groupby("Técnico"):
            tname = str(tecnico_name).strip()
            if not tname:
                continue

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

            ejecutable_count = int(grp["is_ejecutable"].sum())

            # Avance ponderado
            peso_cerradas   = float(grp.loc[grp["is_cerrada"],    "peso"].sum())
            peso_ejecutable = float(grp.loc[grp["is_ejecutable"], "peso"].sum())
            avance = round(peso_cerradas / peso_ejecutable * 100, 1) if peso_ejecutable > 0 else 0.0

            # Efectividad: completado / ejecutable (nunca null)
            efectividad = round(com / ejecutable_count * 100, 1) if ejecutable_count > 0 else 0.0

            # Velocidad: proyección avance ponderado a 18:00
            peso_por_cerrar = peso_ejecutable - peso_cerradas
            velocidad = _proyectar_cierre(current_min, peso_cerradas, peso_por_cerrar)

            # Cumplimiento de ventana horaria
            medibles = grp[grp["a_tiempo"].notna()]
            cumplimiento = (
                round(float(medibles["a_tiempo"].sum()) / len(medibles) * 100, 1)
                if len(medibles) > 0 else None
            )

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
                "ejecutable":    ejecutable_count,
                "cerradas":      com + nc,
                "avance":        avance,
                "efectividad":   efectividad,
                "velocidad":     velocidad,
                "cumplimiento":  cumplimiento,
            })

        por_tecnico.sort(key=lambda x: -(x["avance"] or 0))

        # ── 2. Por microcelda ─────────────────────────────────────────────────
        por_microcelda = []
        for (cel_mc, mc), grp_mc in df.groupby(["celula", "microcelda"]):
            cm  = grp_mc["estado_norm"].value_counts().to_dict()
            com = cm.get("completado",    0)
            nc  = cm.get("no_completado", 0)
            ini = cm.get("iniciado",      0)
            pen = cm.get("pendiente",     0)
            sus = cm.get("suspendido",    0)

            ejecutable_count = int(grp_mc["is_ejecutable"].sum())

            peso_cerradas   = float(grp_mc.loc[grp_mc["is_cerrada"],    "peso"].sum())
            peso_ejecutable = float(grp_mc.loc[grp_mc["is_ejecutable"], "peso"].sum())
            avance      = round(peso_cerradas / peso_ejecutable * 100, 1) if peso_ejecutable > 0 else 0.0
            efectividad = round(com / ejecutable_count * 100, 1) if ejecutable_count > 0 else 0.0

            peso_por_cerrar = peso_ejecutable - peso_cerradas
            velocidad = _proyectar_cierre(current_min, peso_cerradas, peso_por_cerrar)

            medibles_mc = grp_mc[grp_mc["a_tiempo"].notna()]
            cumplimiento = (
                round(float(medibles_mc["a_tiempo"].sum()) / len(medibles_mc) * 100, 1)
                if len(medibles_mc) > 0 else None
            )

            por_microcelda.append({
                "microcelda":    str(mc),
                "celula":        str(cel_mc),
                "n_tecnicos":    int(grp_mc["Técnico"].nunique()),
                "ejecutable":    ejecutable_count,
                "cerradas":      com + nc,
                "completado":    com,
                "no_completado": nc,
                "iniciado":      ini,
                "pendiente":     pen,
                "suspendido":    sus,
                "avance":        avance,
                "efectividad":   efectividad,
                "velocidad":     velocidad,
                "cumplimiento":  cumplimiento,
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
    Métricas de productividad por técnico y microcelda (4 dimensiones).

    - **avance**      : % OTs cerradas ponderadas por cuota / ejecutables ponderadas
    - **efectividad** : % OTs completadas / ejecutables (0..1/n — nunca null)
    - **velocidad**   : % avance ponderado proyectado a las 18:00 según ritmo actual
    - **cumplimiento**: % OTs completadas iniciadas antes de su fin planificado
    """
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, _calcular_productividad, celula)
    return JSONResponse(content=data)
