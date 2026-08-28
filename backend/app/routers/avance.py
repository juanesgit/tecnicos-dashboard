"""Router de avance operacional — resumen de estados de OT del día."""
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
import time as _time
_mapa_cache: dict   = {}
_avance_cache: dict = {}
_MAPA_TTL    = 180  # segundos (3 min)

router = APIRouter(tags=["Avance"])

# ── Actividades NO operativas — se excluyen del conteo ──────────────────────
# Coincidencia por prefijo (case-insensitive) para cubrir variantes de tilde/mayúsculas
_NO_OPERATIVAS_PREFIJOS = (
    # Logística interna
    'almuerzo', 'almacen', 'almacén', 'actividades de almacen',
    # Administrativo / RRHH
    'supervision', 'supervisión',
    'capacitacion', 'capacitación',
    'recursos humanos',
    'reunion', 'reunión',               # cubre Programada y no Programada
    'backoffice',
    'otros',
    # Operación de red / no campo
    '1o&m',                             # 1O&M - GESTION EQUIPO, TAC, SPRINT, etc.
    'inventario de capacidad',
    'apoyo caso vip',
    # Logística de vehículo
    'vehiculo con fallas', 'vehículo con fallas',
    # Turno
    'pre-turno', 'preturno',
)


def _es_no_operativa(tipo: str) -> bool:
    t = str(tipo).strip().lower()
    return any(t.startswith(p) for p in _NO_OPERATIVAS_PREFIJOS)


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


def _calcular_avance(celula: Optional[str] = None) -> dict:
    """Consulta TODAS las OT del día y calcula el avance operacional (caché 3 min)."""
    cache_key = f"avance:{celula or '__all__'}"
    cached = _avance_cache.get(cache_key)
    if cached and (_time.monotonic() - cached["ts"]) < _MAPA_TTL:
        return cached["data"]

    tz = pytz.timezone(settings.APP_TIMEZONE)
    connection = None
    try:
        connection = get_mysql_connection()
        with connection.cursor() as cursor:
            cursor.execute("SHOW TABLES LIKE 'wf_futuro_pruebas'")
            if not cursor.fetchall():
                return _empty()

            query = """
                SELECT
                    w.`Técnico`, w.`Estado`, w.`Tipo de Actividad`,
                    w.`Inicio`, w.`Inicio - Fin`, w.`Nodo`, w.`Fecha`
                FROM wf_futuro_pruebas w
                WHERE w.Origen IN ('REGION OCCIDENTE', 'PYMES OCCIDENTE')
                  AND w.Fecha >= CURRENT_DATE()
                  AND w.Fecha < CURRENT_DATE() + INTERVAL 1 DAY
            """
            cursor.execute(query)
            results = cursor.fetchall()

        if not results:
            return _empty()

        df = pd.DataFrame(results)
        df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
        fecha_str = df['Fecha'].dt.strftime('%Y-%m-%d')

        # Excluir actividades no operativas
        df = df[~df['Tipo de Actividad'].apply(_es_no_operativa)].copy()
        if df.empty:
            return _empty()

        # Parsear hora de cierre para curva S
        fin_split = df['Inicio - Fin'].astype(str).str.split(' - ', n=1, expand=True)
        df['fin_str'] = fin_split[1].fillna('').str.strip()
        fin_time_str = df['fin_str'].where(df['fin_str'] != '', df['Inicio'].astype(str).str.strip())
        df['fin_datetime'] = pd.to_datetime(fecha_str + ' ' + fin_time_str, errors='coerce')
        try:
            df['fin_datetime'] = df['fin_datetime'].dt.tz_localize(tz)
        except Exception:
            pass

        # ── Normalizar estados ───────────────────────────────────────────────
        # 'No completado' = visita inefectiva (OT cerrada, pero NO exitosa)
        # Se cuenta por separado: entra al denominador pero NO al numerador
        estado_map = {
            'Completado':     'completado',
            'No completado':  'no_completado',   # visita inefectiva — cerrada pero fallida
            'Iniciado':       'iniciado',
            'Pendiente':      'pendiente',
            'Suspendido':     'suspendido',
            'Cancelado':      'cancelado',
        }
        df['estado_norm'] = df['Estado'].map(estado_map).fillna('otro')

        # ── 1. Resumen global ────────────────────────────────────────────────
        conteo = df['estado_norm'].value_counts().to_dict()
        total         = len(df)
        cancelados    = conteo.get('cancelado', 0)
        completados   = conteo.get('completado', 0)
        no_completados = conteo.get('no_completado', 0)
        efectivo = total - cancelados   # OTs que la operación debía ejecutar
        tasa_cumplimiento = round(completados / efectivo * 100, 1) if efectivo > 0 else 0.0

        # Avance de operación:
        # (Completadas + Inefectivas) / (Completadas + Inefectivas + Iniciadas + Pendientes + Suspendidas)
        # Excluye canceladas (no eran trabajo a ejecutar)
        cerradas   = completados + no_completados
        denom_avance = (
            completados +
            no_completados +
            conteo.get('iniciado', 0) +
            conteo.get('pendiente', 0) +
            conteo.get('suspendido', 0)
        )
        tasa_avance = round(cerradas / denom_avance * 100, 1) if denom_avance > 0 else 0.0

        resumen = {
            'total':            total,
            'completado':       completados,
            'no_completado':    no_completados,
            'iniciado':         conteo.get('iniciado', 0),
            'pendiente':        conteo.get('pendiente', 0),
            'suspendido':       conteo.get('suspendido', 0),
            'cancelado':        cancelados,
            'efectivo':         efectivo,
            'cerradas':         cerradas,
            'tasa_cumplimiento': tasa_cumplimiento,   # Completadas / (Total - Canceladas)
            'tasa_avance':      tasa_avance,           # (Comp+Inefect) / carga ejecutable
        }

        # ── 2. Curva S — completadas acumuladas por hora ─────────────────────
        # Solo OTs 'Completado' (exitosas), usando hora de cierre de ventana
        df_comp = df[df['estado_norm'] == 'completado'].dropna(subset=['fin_datetime']).copy()
        curva_s = []
        if not df_comp.empty:
            df_comp['hora'] = df_comp['fin_datetime'].dt.strftime('%H:00')
            por_hora = df_comp.groupby('hora').size().reset_index(name='count').sort_values('hora')
            acum = 0
            for _, row in por_hora.iterrows():
                acum += row['count']
                curva_s.append({'hora': row['hora'], 'completadas': int(row['count']), 'acumulado': acum})

        # ── 3. Breakdown por célula ──────────────────────────────────────────
        zona_map = get_zona_map()
        df['celula'] = df['Nodo'].apply(
            lambda n: zona_map.get(str(n).strip(), {}).get('celula', 'Sin clasificar')
            if pd.notna(n) else 'Sin clasificar'
        )
        # ── Filtrar por célula si se indicó ────────────────────────────────────
        if celula:
            df = df[df['celula'] == celula].copy()
            if df.empty:
                return _empty()
            # Recalcular resumen con df filtrado
            conteo         = df['estado_norm'].value_counts().to_dict()
            total          = len(df)
            cancelados     = conteo.get('cancelado', 0)
            completados    = conteo.get('completado', 0)
            no_completados = conteo.get('no_completado', 0)
            efectivo       = total - cancelados
            tasa_cumplimiento = round(completados / efectivo * 100, 1) if efectivo > 0 else 0.0
            cerradas     = completados + no_completados
            denom_avance = (completados + no_completados +
                            conteo.get('iniciado', 0) + conteo.get('pendiente', 0) +
                            conteo.get('suspendido', 0))
            tasa_avance = round(cerradas / denom_avance * 100, 1) if denom_avance > 0 else 0.0
            resumen = {
                'total':             total,
                'completado':        completados,
                'no_completado':     no_completados,
                'iniciado':          conteo.get('iniciado', 0),
                'pendiente':         conteo.get('pendiente', 0),
                'suspendido':        conteo.get('suspendido', 0),
                'cancelado':         cancelados,
                'efectivo':          efectivo,
                'cerradas':          cerradas,
                'tasa_cumplimiento': tasa_cumplimiento,
                'tasa_avance':       tasa_avance,
            }

        por_celula = []
        for cel, grp in df.groupby('celula'):
            c = grp['estado_norm'].value_counts().to_dict()
            tot = len(grp)
            can = c.get('cancelado', 0)
            com = c.get('completado', 0)
            ef  = tot - can
            por_celula.append({
                'celula':         str(cel),
                'total':          tot,
                'completado':     com,
                'no_completado':  c.get('no_completado', 0),
                'iniciado':       c.get('iniciado', 0),
                'pendiente':      c.get('pendiente', 0),
                'suspendido':     c.get('suspendido', 0),
                'cancelado':      can,
                'tasa':           round(com / ef * 100, 1) if ef > 0 else 0.0,
            })
        por_celula.sort(key=lambda x: x['tasa'])  # menor cumplimiento primero

        # ── 3b. Breakdown por microcelda ────────────────────────────────────
        df['microcelda'] = df['Nodo'].apply(
            lambda n: zona_map.get(str(n).strip(), {}).get('microcelda', 'Sin clasificar')
            if pd.notna(n) else 'Sin clasificar'
        )
        df['ciudad'] = df['Nodo'].apply(
            lambda n: zona_map.get(str(n).strip(), {}).get('ciudad', 'Sin clasificar')
            if pd.notna(n) else 'Sin clasificar'
        )
        por_microcelda = []
        for (cel_mc, mc), grp_mc in df.groupby(['celula', 'microcelda']):
            cm = grp_mc['estado_norm'].value_counts().to_dict()
            tot_mc  = len(grp_mc)
            com_mc  = cm.get('completado', 0)
            nc_mc   = cm.get('no_completado', 0)
            ini_mc  = cm.get('iniciado', 0)
            pen_mc  = cm.get('pendiente', 0)
            sus_mc  = cm.get('suspendido', 0)
            ejec_mc = com_mc + nc_mc + ini_mc + pen_mc + sus_mc

            # Sub-breakdown por tipo de actividad (ya excluidas las no-operativas)
            tipos_list = []
            for tipo_val, grp_tipo in grp_mc.groupby('Tipo de Actividad'):
                tipo_str = str(tipo_val).strip() if pd.notna(tipo_val) else 'Sin tipo'
                tc = grp_tipo['estado_norm'].value_counts().to_dict()
                t_com = tc.get('completado', 0)
                t_nc  = tc.get('no_completado', 0)
                t_ini = tc.get('iniciado', 0)
                t_pen = tc.get('pendiente', 0)
                t_sus = tc.get('suspendido', 0)
                t_ej  = t_com + t_nc + t_ini + t_pen + t_sus
                tipos_list.append({
                    'tipo':          tipo_str,
                    'total':         len(grp_tipo),
                    'completado':    t_com,
                    'no_completado': t_nc,
                    'iniciado':      t_ini,
                    'pendiente':     t_pen,
                    'suspendido':    t_sus,
                    'pct_avance':    round((t_com + t_nc) / t_ej * 100, 1) if t_ej > 0 else 0.0,
                })
            tipos_list.sort(key=lambda x: -x['total'])

            # Ciudad desde zona_map (modo del grupo)
            ciudad_vals = grp_mc['ciudad'].mode()
            ciudad_mc   = str(ciudad_vals.iloc[0]) if not ciudad_vals.empty else 'Sin clasificar'

            por_microcelda.append({
                'microcelda':    str(mc),
                'celula':        str(cel_mc),
                'ciudad':        ciudad_mc,
                'total':         tot_mc,
                'completado':    com_mc,
                'no_completado': nc_mc,
                'iniciado':      ini_mc,
                'pendiente':     pen_mc,
                'suspendido':    sus_mc,
                'cancelado':     cm.get('cancelado', 0),
                'pct_avance':    round((com_mc + nc_mc) / ejec_mc * 100, 1) if ejec_mc > 0 else 0.0,
                'por_tipo':      tipos_list,
            })

        # ── 3c. Breakdown por ciudad ─────────────────────────────────────────
        por_ciudad = []
        for ciudad_val, grp_c in df.groupby('ciudad'):
            if not ciudad_val or ciudad_val == 'Sin clasificar':
                continue
            cc      = grp_c['estado_norm'].value_counts().to_dict()
            tot_c   = len(grp_c)
            com_c   = cc.get('completado', 0)
            nc_c    = cc.get('no_completado', 0)
            ini_c   = cc.get('iniciado', 0)
            pen_c   = cc.get('pendiente', 0)
            sus_c   = cc.get('suspendido', 0)
            ejec_c  = com_c + nc_c + ini_c + pen_c + sus_c
            mc_vals  = grp_c['microcelda'].mode()
            mc_c     = str(mc_vals.iloc[0]) if not mc_vals.empty else 'Sin clasificar'
            cel_vals = grp_c['celula'].mode()
            cel_c    = str(cel_vals.iloc[0]) if not cel_vals.empty else 'Sin clasificar'
            por_ciudad.append({
                'ciudad':        str(ciudad_val),
                'celula':        cel_c,
                'microcelda':    mc_c,
                'completado':    com_c,
                'no_completado': nc_c,
                'iniciado':      ini_c,
                'pendiente':     pen_c,
                'suspendido':    sus_c,
                'total':         tot_c,
                'pct_avance':    round((com_c + nc_c) / ejec_c * 100, 1) if ejec_c > 0 else 0.0,
            })

        # ── 4. Derrotero por tipo de actividad (sobre df ANTES del filtro) ────
        # Recalculamos sobre el df completo (incluye excluidas) para mostrar todo
        connection2 = get_mysql_connection()
        try:
            with connection2.cursor() as cur2:
                if celula:
                    nodos_celula = [n for n, v in zona_map.items() if v.get('celula') == celula]
                    if nodos_celula:
                        ph = ', '.join(['%s'] * len(nodos_celula))
                        cur2.execute(
                            "SELECT `Tipo de Actividad`, `Estado`, COUNT(*) as cnt "
                            "FROM wf_futuro_pruebas "
                            "WHERE Origen IN ('REGION OCCIDENTE', 'PYMES OCCIDENTE') "
                            "  AND Fecha >= CURRENT_DATE() "
                            "  AND Fecha < CURRENT_DATE() + INTERVAL 1 DAY "
                            f"  AND Nodo IN ({ph}) "
                            "GROUP BY `Tipo de Actividad`, `Estado` ORDER BY cnt DESC",
                            nodos_celula,
                        )
                        tipo_rows = cur2.fetchall()
                    else:
                        tipo_rows = []
                else:
                    cur2.execute("""
                        SELECT `Tipo de Actividad`, `Estado`, COUNT(*) as cnt
                        FROM wf_futuro_pruebas
                        WHERE Origen IN ('REGION OCCIDENTE', 'PYMES OCCIDENTE')
                          AND Fecha >= CURRENT_DATE()
                          AND Fecha < CURRENT_DATE() + INTERVAL 1 DAY
                        GROUP BY `Tipo de Actividad`, `Estado`
                        ORDER BY cnt DESC
                    """)
                    tipo_rows = cur2.fetchall()
        finally:
            connection2.close()

        # Agrupar por tipo de actividad
        tipo_map = {}
        for r in tipo_rows:
            tipo = str(r['Tipo de Actividad'] or 'Sin tipo').strip()
            estado = str(r['Estado'] or '').strip()
            cnt = int(r['cnt'])
            excluida = _es_no_operativa(tipo)
            if tipo not in tipo_map:
                tipo_map[tipo] = {
                    'tipo': tipo,
                    'excluida': excluida,
                    'total': 0,
                    'estados': {},
                }
            tipo_map[tipo]['total'] += cnt
            tipo_map[tipo]['estados'][estado] = tipo_map[tipo]['estados'].get(estado, 0) + cnt

        por_tipo = sorted(tipo_map.values(), key=lambda x: (-x['total'], x['tipo']))

        result = {
            'resumen':        resumen,
            'curva_s':        curva_s,
            'por_celula':     por_celula,
            'por_microcelda': por_microcelda,
            'por_ciudad':     por_ciudad,
            'por_tipo':       por_tipo,
        }
        _avance_cache[cache_key] = {"data": result, "ts": _time.monotonic()}
        return result

    except Exception as e:
        import sys, traceback
        print(f"[AVANCE] ERROR: {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return _empty()
    finally:
        if connection:
            connection.close()


def _empty():
    return {'resumen': {}, 'curva_s': [], 'por_celula': [], 'por_microcelda': [], 'por_ciudad': []}


@router.get("/avance-ot")
async def avance_ot(
    celula: Optional[str] = Query(default=None),
    auth: _AuthResult = Depends(_require_auth),
):
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, _calcular_avance, celula)
    return JSONResponse(content=data)


def _calcular_mapa_calor_avance(celula: Optional[str] = None) -> dict:
    """Heatmap de avance de operación: microcelda × hora del día (caché 3 min)."""
    cache_key = f"mapa_avance:{celula or '__all__'}"
    cached = _mapa_cache.get(cache_key)
    if cached and (_time.monotonic() - cached["ts"]) < _MAPA_TTL:
        return cached["data"]

    tz = pytz.timezone(settings.APP_TIMEZONE)
    connection = None
    try:
        connection = get_mysql_connection()
        with connection.cursor() as cursor:
            cursor.execute("SHOW TABLES LIKE 'wf_futuro_pruebas'")
            if not cursor.fetchall():
                return {"horas": [], "series": {}}

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
            return {"horas": [], "series": {}}

        df = pd.DataFrame(results)
        df = df[~df["Tipo de Actividad"].apply(_es_no_operativa)].copy()
        if df.empty:
            return {"horas": [], "series": {}}

        # Parsear hora de cierre
        fecha_str = pd.to_datetime(df["Fecha"], errors="coerce").dt.strftime("%Y-%m-%d")
        fin_split = df["Inicio - Fin"].astype(str).str.split(" - ", n=1, expand=True)
        df["fin_str"] = fin_split[1].fillna("").str.strip() if fin_split.shape[1] > 1 else ""
        fin_time_str = df["fin_str"].where(df["fin_str"] != "", df["Inicio"].astype(str).str.strip())
        df["fin_datetime"] = pd.to_datetime(fecha_str + " " + fin_time_str, errors="coerce")
        try:
            df["fin_datetime"] = df["fin_datetime"].dt.tz_localize(tz)
        except Exception:
            pass

        estado_map = {
            "Completado":    "completado",
            "No completado": "no_completado",
            "Iniciado":      "iniciado",
            "Pendiente":     "pendiente",
            "Suspendido":    "suspendido",
            "Cancelado":     "cancelado",
        }
        df["estado_norm"] = df["Estado"].map(estado_map).fillna("otro")

        zona_map = get_zona_map()
        df["microcelda"] = df["Nodo"].apply(
            lambda n: zona_map.get(str(n).strip(), {}).get("microcelda", "Sin clasificar")
            if pd.notna(n) else "Sin clasificar"
        )
        df["celula"] = df["Nodo"].apply(
            lambda n: zona_map.get(str(n).strip(), {}).get("celula", "Sin clasificar")
            if pd.notna(n) else "Sin clasificar"
        )
        df["ciudad"] = df["Nodo"].apply(
            lambda n: zona_map.get(str(n).strip(), {}).get("ciudad", "Sin clasificar")
            if pd.notna(n) else "Sin clasificar"
        )

        if celula:
            df = df[df["celula"] == celula].copy()
            if df.empty:
                return {"horas": [], "series": {}}

        # Buckets de hora: 07:00 hasta hora actual (máx 18:00)
        now = datetime.now(tz)
        hora_fin = min(now.hour, 18)
        horas = [f"{h:02d}:00" for h in range(7, hora_fin + 1)]

        series = {}
        for mc, grp in df.groupby("microcelda"):
            operativas = grp[grp["estado_norm"] != "cancelado"]
            total_op = len(operativas)
            if total_op == 0:
                continue
            cel = grp["celula"].iloc[0]
            pts = []
            for hora_str in horas:
                h = int(hora_str[:2])
                cerradas_df = grp[
                    grp["estado_norm"].isin(["completado", "no_completado"]) &
                    grp["fin_datetime"].notna() &
                    (grp["fin_datetime"].dt.hour <= h)
                ]
                n_cerradas    = len(cerradas_df)
                n_completadas = int((cerradas_df["estado_norm"] == "completado").sum())
                pct_avance    = round(n_cerradas / total_op * 100, 1) if total_op > 0 else 0.0
                pts.append({
                    "t":           hora_str,
                    "cerradas":    n_cerradas,
                    "completadas": n_completadas,
                    "total":       total_op,
                    "pct_avance":  pct_avance,
                    "celula":      cel,
                })
            if pts:
                series[mc] = pts

        result = {"horas": horas, "series": series}
        _mapa_cache[cache_key] = {"data": result, "ts": _time.monotonic()}
        return result

    except Exception as e:
        import sys, traceback
        print(f"[AVANCE MAPA] ERROR: {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return {"horas": [], "series": {}}
    finally:
        if connection:
            connection.close()


@router.get("/avance-ot/mapa-calor")
async def avance_mapa_calor(
    celula: Optional[str] = Query(default=None),
    auth: _AuthResult = Depends(_require_auth),
):
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, _calcular_mapa_calor_avance, celula)
    return JSONResponse(content=data)
