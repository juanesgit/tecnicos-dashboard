"""Router de avance operacional — resumen de estados de OT del día."""
import asyncio
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
    """Consulta TODAS las OT del día y calcula el avance operacional."""
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

        return {
            'resumen':    resumen,
            'curva_s':    curva_s,
            'por_celula': por_celula,
            'por_tipo':   por_tipo,
        }

    except Exception as e:
        import sys, traceback
        print(f"[AVANCE] ERROR: {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return _empty()
    finally:
        if connection:
            connection.close()


def _empty():
    return {'resumen': {}, 'curva_s': [], 'por_celula': []}


@router.get("/avance-ot")
async def avance_ot(
    celula: Optional[str] = Query(default=None),
    auth: _AuthResult = Depends(_require_auth),
):
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, _calcular_avance, celula)
    return JSONResponse(content=data)
