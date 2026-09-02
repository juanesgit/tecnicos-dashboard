"""Servicio de datos operacionales — portado desde Flask Tecnicos_retrasado.
Usa pymysql + pandas (síncronos). Los routers lo ejecutan en un thread pool
con asyncio.get_event_loop().run_in_executor para no bloquear FastAPI.
"""
from typing import Optional, List, Dict, Any
import pandas as pd
import numpy as np
from datetime import datetime, date, timedelta
import pytz
import time
import sys

from app.mysql_db import get_mysql_connection
from app.config import settings
from app.services.zonas_service import get_zona_map


def ejecutar_consulta_v2() -> pd.DataFrame:
    """Trae datos base del día y calcula ventanas y métricas en pandas."""
    t_global_start = time.time()
    connection = None
    tzname = settings.APP_TIMEZONE
    tz = pytz.timezone(tzname)
    try:
        try:
            connection = get_mysql_connection()
        except Exception as conn_err:
            print(f"[SERVICE] Error creando conexión DB: {conn_err}", file=sys.stderr)
            raise

        t_connect_end = time.time()
        print(f"[SERVICE] Tiempo de conexión DB: {t_connect_end - t_global_start:.3f}s", file=sys.stderr)

        with connection.cursor() as cursor:
            cursor.execute("SHOW TABLES LIKE 'wf_futuro_pruebas'")
            table_exists = cursor.fetchall()
            if not table_exists:
                print("[SERVICE] La tabla wf_futuro_pruebas NO existe", file=sys.stderr)
                return pd.DataFrame()

            query = """
                SELECT
                    w.`Técnico`, w.`Compañia`, w.`Tipo de Actividad`, w.`Orden de trabajo`,
                    w.`Subtipo de la Orden de Trabajo` AS subtipo_ot,
                    ts.cuota AS cuota_norma,
                    w.`Ciudad`, w.`Inicio`, w.`Inicio - Fin`, w.`Estado`, w.`Origen`, w.`Fecha`,
                    w.`Nodo`
                FROM wf_futuro_pruebas w
                LEFT JOIN wf_time_slot ts
                  ON TRIM(w.`Subtipo de la Orden de Trabajo`) COLLATE utf8mb4_general_ci = TRIM(ts.SUBTRABAJO_WF) COLLATE utf8mb4_general_ci
                WHERE w.Origen IN ('REGION OCCIDENTE', 'PYMES OCCIDENTE')
                  AND w.Fecha >= CURRENT_DATE()
                  AND w.Fecha < CURRENT_DATE() + INTERVAL 1 DAY
            """
            t_sql_start = time.time()
            cursor.execute(query)
            results = cursor.fetchall()
            t_sql_end = time.time()
            print(f"[SERVICE] SQL base: {t_sql_end - t_sql_start:.3f}s | filas: {len(results)}", file=sys.stderr)

        if not results:
            return pd.DataFrame()

        df = pd.DataFrame(results)
        if 'subtipo_ot' not in df.columns:
            df['subtipo_ot'] = None

        # Normalización de tipos
        df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
        df['Inicio'] = df['Inicio'].astype(str).str.strip()
        fin_split = df['Inicio - Fin'].astype(str).str.split(' - ', n=1, expand=True)
        df['fin_str'] = fin_split[1].fillna('').str.strip()
        df['ot_base'] = df['Orden de trabajo'].apply(lambda s: str(s).split('_')[0] if pd.notna(s) else None)

        fecha_str = df['Fecha'].dt.strftime('%Y-%m-%d')
        df['inicio_datetime'] = pd.to_datetime(fecha_str + ' ' + df['Inicio'], errors='coerce')
        fin_time_str = df['fin_str'].where(df['fin_str'] != '', df['Inicio'])
        df['fin_datetime'] = pd.to_datetime(fecha_str + ' ' + fin_time_str, errors='coerce')

        try:
            df['inicio_datetime'] = df['inicio_datetime'].dt.tz_localize(tz)
            df['fin_datetime'] = df['fin_datetime'].dt.tz_localize(tz)
        except Exception as _tzerr:
            print(f"[SERVICE] Advertencia TZ: {_tzerr}", file=sys.stderr)

        # LEAD simulado con groupby/shift
        df = df.sort_values(['Técnico', 'Fecha', 'inicio_datetime'])
        grp = df.groupby(['Técnico', 'Fecha'], dropna=False, as_index=False)
        df['siguiente_actividad'] = grp['Tipo de Actividad'].shift(-1)
        df['inicio_siguiente'] = grp['Inicio'].shift(-1)
        df['siguiente_ventana'] = grp['Inicio - Fin'].shift(-1)
        df['ot_siguiente'] = grp['ot_base'].shift(-1)
        df['ciudad_siguiente'] = grp['Ciudad'].shift(-1)
        df['siguiente_inicio_datetime'] = grp['inicio_datetime'].shift(-1)
        df['estado_next'] = grp['Estado'].shift(-1)

        # Excluir supervisión
        df['_is_superv'] = (
            df['Tipo de Actividad'].astype(str).str.startswith('Supervision', na=False) |
            df['Tipo de Actividad'].astype(str).str.startswith('Supervisión', na=False)
        )
        df['has_superv'] = df.groupby(['Técnico', 'Fecha'])['_is_superv'].transform('any')

        mask_elig = (
            (~df['has_superv']) &
            (df['Compañia'] != 'CLARO COLOMBIA') &
            (df['Estado'].isin(['Iniciado', 'Completado', 'No completado']))
        )
        df_actual = df[mask_elig].groupby(['Técnico', 'Fecha'], as_index=False).tail(1).copy()
        if df_actual.empty:
            return pd.DataFrame()

        # Pendientes posteriores
        _excluir_tipos = ['Almuerzo', 'Almacén', 'Almacen', 'ALMACEN', 'ALMACÉN']
        df_pend = df[(df['Estado'] == 'Pendiente') & (~df['Tipo de Actividad'].isin(_excluir_tipos))].copy()

        def comp_pendientes(row):
            m = (
                (df_pend['Técnico'] == row['Técnico']) &
                (df_pend['Fecha'] == row['Fecha']) &
                (df_pend['inicio_datetime'] > row['fin_datetime'])
            )
            return int(m.sum())

        def comp_detalle_pend(row):
            subset = df_pend[
                (df_pend['Técnico'] == row['Técnico']) &
                (df_pend['Fecha'] == row['Fecha']) &
                (df_pend['inicio_datetime'] > row['fin_datetime'])
            ]
            if subset.empty:
                return None
            partes = subset.apply(
                lambda r: f"{r['Inicio']} a {r['fin_str'] or r['Inicio']} ({r['Ciudad']})###{r['Tipo de Actividad']}###{r['ot_base'] or 'Sin OT'}",
                axis=1,
            )
            return '######'.join(partes.tolist())

        df_comp = df[(df['Estado'].isin(['Completado', 'No completado'])) & (~df['Tipo de Actividad'].isin(_excluir_tipos))].copy()

        def comp_detalle_comp(row):
            subset = df_comp[
                (df_comp['Técnico'] == row['Técnico']) &
                (df_comp['Fecha'] == row['Fecha'])
            ]
            if subset.empty:
                return None
            partes = subset.apply(
                lambda r: f"{r['Inicio']} a {r['fin_str'] or r['Inicio']} ({r['Ciudad']})###{r['Tipo de Actividad']}###{r['ot_base'] or 'Sin OT'}###{r['Estado']}",
                axis=1,
            )
            return '######'.join(partes.tolist())

        df_actual['pendientes_post_siguiente'] = df_actual.apply(comp_pendientes, axis=1)
        df_actual['detalle_pendientes'] = df_actual.apply(comp_detalle_pend, axis=1)
        df_actual['detalle_completados'] = df_actual.apply(comp_detalle_comp, axis=1)

        # Métricas de tiempo/estado
        now_ts = pd.Timestamp.now(tz)
        print(f"[SERVICE] TZ: {tzname} | ahora: {now_ts.isoformat()}", file=sys.stderr)

        if 'cuota_norma' not in df_actual.columns:
            df_actual = df_actual.merge(
                df[['Técnico', 'Fecha', 'inicio_datetime', 'cuota_norma']],
                on=['Técnico', 'Fecha', 'inicio_datetime'],
                how='left',
                suffixes=(None, None),
            )

        df_actual['norma_fin_datetime'] = df_actual['inicio_datetime'] + pd.to_timedelta(
            df_actual['cuota_norma'].fillna(0), unit='m'
        )

        cond_norma = (
            (df_actual['Estado'] == 'Iniciado') &
            (df_actual['cuota_norma'].notna()) &
            (df_actual['norma_fin_datetime'].notna()) &
            (df_actual['norma_fin_datetime'] < now_ts)
        )
        cond_fallback = (
            (df_actual['Estado'] == 'Iniciado') &
            (df_actual['cuota_norma'].isna()) &
            (df_actual['fin_datetime'].notna()) &
            (df_actual['fin_datetime'] < now_ts)
        )

        df_actual['minutos_retraso'] = 0
        df_actual.loc[cond_norma, 'minutos_retraso'] = (
            (now_ts - df_actual.loc[cond_norma, 'norma_fin_datetime']) / pd.Timedelta(minutes=1)
        ).round().astype(int)
        df_actual.loc[cond_fallback, 'minutos_retraso'] = (
            (now_ts - df_actual.loc[cond_fallback, 'fin_datetime']) / pd.Timedelta(minutes=1)
        ).round().astype(int)

        df_actual['is_retraso_actual'] = cond_norma | cond_fallback
        cond_retraso_sig = (
            (df_actual['siguiente_inicio_datetime'].notna()) &
            (df_actual['siguiente_inicio_datetime'] < now_ts) &
            (df_actual['estado_next'] == 'Pendiente')
        )
        df_actual['minutos_retraso_siguiente'] = 0
        df_actual.loc[cond_retraso_sig, 'minutos_retraso_siguiente'] = (
            (now_ts - df_actual.loc[cond_retraso_sig, 'siguiente_inicio_datetime']) / pd.Timedelta(minutes=1)
        ).round().astype(int)

        df_actual['minutos_parada'] = 0
        with_next = df_actual['siguiente_inicio_datetime'].notna()
        df_actual.loc[with_next, 'minutos_parada'] = (
            (df_actual.loc[with_next, 'siguiente_inicio_datetime'] - df_actual.loc[with_next, 'fin_datetime']) /
            pd.Timedelta(minutes=1)
        ).clip(lower=0).round().astype(int)
        df_actual['minutos_parada_ajustada'] = (df_actual['minutos_parada'] - df_actual['minutos_retraso']).clip(lower=0)

        # Tiempo REAL restante hasta que inicie el siguiente trabajo (desde ahora)
        # Más accionable que la brecha planificada: si la parada planificada era 90 min
        # pero ya pasaron 60, lo relevante es que quedan 30 min.
        df_actual['minutos_parada_restante'] = 0
        with_next_future = with_next & (df_actual['siguiente_inicio_datetime'] > now_ts)
        df_actual.loc[with_next_future, 'minutos_parada_restante'] = (
            (df_actual.loc[with_next_future, 'siguiente_inicio_datetime'] - now_ts) /
            pd.Timedelta(minutes=1)
        ).clip(lower=0).round().astype(int)

        def calc_estado_actual(row):
            if bool(row.get('is_retraso_actual', False)):
                return 'Retraso actual'
            if (
                row['Estado'] in ('Completado', 'No completado') and
                pd.notna(row['siguiente_inicio_datetime']) and
                row['siguiente_inicio_datetime'] < now_ts and
                row['estado_next'] == 'Pendiente'
            ):
                return 'Retraso en siguiente'
            if row['Estado'] == 'Iniciado':
                return 'En ejecución'
            return 'Finalizado'

        df_actual['estado_actual'] = df_actual.apply(calc_estado_actual, axis=1)
        # Parada futura: gap planificado > 30 min Y el siguiente trabajo inicia
        # dentro de las próximas 2 horas (ventana accionable).
        # Esto evita alertar sobre brechas que ocurrirán en 5-6 horas cuando no hay nada que gestionar aún.
        ventana_2h = now_ts + pd.Timedelta(hours=2)
        cond_parada = (
            df_actual['siguiente_inicio_datetime'].notna() &
            (df_actual['minutos_parada'] > 30) &
            (df_actual['siguiente_inicio_datetime'] <= ventana_2h)
        )
        df_actual['estado_siguiente'] = np.where(cond_parada, 'Parada futura', 'Sin parada')

        def fmt_hhmm(minutes):
            try:
                m = int(minutes); h = m // 60; mm = m % 60
                return f"{h:02d}:{mm:02d}"
            except Exception:
                return '00:00'

        df_actual['retraso_hhmm'] = df_actual['minutos_retraso'].apply(fmt_hhmm)
        df_actual['retraso_siguiente_hhmm'] = df_actual['minutos_retraso_siguiente'].apply(fmt_hhmm)
        # parada_hhmm = tiempo restante real hasta el siguiente trabajo (accionable)
        df_actual['parada_hhmm'] = df_actual['minutos_parada_restante'].apply(fmt_hhmm)
        # parada_planificada_hhmm = brecha original en la agenda (referencia)
        df_actual['parada_planificada_hhmm'] = df_actual['minutos_parada'].apply(fmt_hhmm)
        df_actual['parada_ajustada_hhmm'] = df_actual['minutos_parada_ajustada'].apply(fmt_hhmm)
        df_actual['ventana_fin'] = df_actual['fin_datetime'].dt.strftime('%H:%M')

        # ── Predicción 6pm ──────────────────────────────────────────────────
        # factor_ritmo: velocidad relativa del técnico vs norma (cap 2×)
        df_actual['cuota_norma_num'] = pd.to_numeric(df_actual['cuota_norma'], errors='coerce').fillna(0)
        df_actual['factor_ritmo'] = 1.0
        mask_cuota = df_actual['cuota_norma_num'] > 0
        df_actual.loc[mask_cuota, 'factor_ritmo'] = (
            (df_actual.loc[mask_cuota, 'cuota_norma_num'] +
             df_actual.loc[mask_cuota, 'minutos_retraso'].clip(lower=0)) /
            df_actual.loc[mask_cuota, 'cuota_norma_num']
        ).clip(upper=2.0)

        # Tiempo restante en la actividad actual (solo si Iniciado y norma_fin futura)
        df_actual['t_actual_restante'] = 0.0
        mask_en_curso = (
            (df_actual['Estado'] == 'Iniciado') &
            df_actual['norma_fin_datetime'].notna() &
            (df_actual['norma_fin_datetime'] > now_ts)
        )
        df_actual.loc[mask_en_curso, 't_actual_restante'] = (
            (df_actual.loc[mask_en_curso, 'norma_fin_datetime'] - now_ts) /
            pd.Timedelta(minutes=1)
        ).clip(lower=0)

        # Cuota total de actividades Pendientes (excl. Almuerzo y Almacén) para el día
        df_pend_pred = df[
            (df['Estado'] == 'Pendiente') &
            (~df['Tipo de Actividad'].isin(_excluir_tipos)) &
            df['cuota_norma'].notna()
        ].copy()
        df_pend_pred['cuota_norma_num'] = pd.to_numeric(df_pend_pred['cuota_norma'], errors='coerce').fillna(0)
        df_pend_pred = df_pend_pred[df_pend_pred['cuota_norma_num'] > 0]
        cuota_pend_sum = (
            df_pend_pred.groupby(['Técnico', 'Fecha'])['cuota_norma_num']
            .sum().reset_index().rename(columns={'cuota_norma_num': 'cuota_pend_total'})
        )
        cuota_pend_cnt = (
            df_pend_pred.groupby(['Técnico', 'Fecha'])['cuota_norma_num']
            .count().reset_index().rename(columns={'cuota_norma_num': 'pendientes_con_cuota'})
        )
        df_actual = df_actual.merge(cuota_pend_sum, on=['Técnico', 'Fecha'], how='left')
        df_actual = df_actual.merge(cuota_pend_cnt, on=['Técnico', 'Fecha'], how='left')
        df_actual['cuota_pend_total'] = df_actual['cuota_pend_total'].fillna(0)
        df_actual['pendientes_con_cuota'] = df_actual['pendientes_con_cuota'].fillna(0).astype(int)

        # Tiempo total restante = actividad actual + pendientes (a ritmo normal)
        # + retraso actual como propagación plana (no multiplicamos el factor
        # a todas las actividades futuras; eso da predicciones irrealmente tardías).
        df_actual['minutos_trabajo_restante'] = (
            df_actual['t_actual_restante'] +
            df_actual['cuota_pend_total'] +
            df_actual['minutos_retraso'].clip(lower=0)
        ).round().astype(int)

        hora_limite_ts = now_ts.replace(hour=18, minute=0, second=0, microsecond=0)
        df_actual['hora_fin_estimada_ts'] = now_ts + pd.to_timedelta(
            df_actual['minutos_trabajo_restante'], unit='m'
        )
        df_actual['hora_fin_estimada'] = df_actual['hora_fin_estimada_ts'].dt.strftime('%H:%M')
        # margen_6pm: positivo = termina DESPUÉS de 18:00 (mal), negativo = ANTES (bien)
        df_actual['margen_6pm'] = (
            (df_actual['hora_fin_estimada_ts'] - hora_limite_ts) / pd.Timedelta(minutes=1)
        ).round().astype(int)

        def clasif_riesgo(margen):
            if margen >= 0:   return 'En riesgo'  # termina después de las 18:00
            if margen >= -60: return 'Ajustado'   # termina en la última hora antes (17:00–18:00)
            return 'A tiempo'                      # termina más de 1h antes de las 18:00

        df_actual['riesgo_6pm'] = df_actual['margen_6pm'].apply(clasif_riesgo)
        df_actual['factor_ritmo'] = df_actual['factor_ritmo'].round(2)
        try:
            df_actual['fin_norma'] = df_actual['norma_fin_datetime'].dt.strftime('%H:%M')
        except Exception:
            df_actual['fin_norma'] = ''
        df_actual['hora_actual'] = now_ts.strftime('%H:%M:%S')

        # Cumplimiento del día
        try:
            df_dia = df.copy()
            df_dia['cuota_norma'] = pd.to_numeric(df_dia.get('cuota_norma'), errors='coerce')
            mask_den_dia = (
                (df_dia['cuota_norma'].fillna(0) > 0) &
                (df_dia['Estado'].isin(['Iniciado', 'Completado', 'No completado']))
            )
            denom_dia = int(mask_den_dia.sum())
            cumplimiento_series = pd.Series(False, index=df_dia.index)
            m_ini = mask_den_dia & (df_dia['Estado'] == 'Iniciado') & df_dia['inicio_datetime'].notna()
            cumplimiento_series.loc[m_ini] = now_ts <= (
                df_dia.loc[m_ini, 'inicio_datetime'] + pd.to_timedelta(df_dia.loc[m_ini, 'cuota_norma'], unit='m')
            )
            m_fin = (
                mask_den_dia &
                (df_dia['Estado'].isin(['Completado', 'No completado'])) &
                df_dia['inicio_datetime'].notna() &
                df_dia['fin_datetime'].notna()
            )
            dur_ok = (
                (df_dia.loc[m_fin, 'fin_datetime'] - df_dia.loc[m_fin, 'inicio_datetime']) <=
                pd.to_timedelta(df_dia.loc[m_fin, 'cuota_norma'], unit='m')
            )
            cumplimiento_series.loc[m_fin] = dur_ok
            num_dia = int(cumplimiento_series[mask_den_dia].sum()) if denom_dia > 0 else 0
            cump_time_slot_dia = round((num_dia / denom_dia) * 100, 2) if denom_dia > 0 else 0.0
        except Exception as _err:
            print(f"[SERVICE] Error cumplimiento día: {_err}", file=sys.stderr)
            cump_time_slot_dia = 0.0

        df_actual['cumplimiento_time_slot_dia'] = float(cump_time_slot_dia)

        # Enriquecer con célula, microcelda y ciudad desde el mapa de zonas
        zona_map = get_zona_map()
        if 'Nodo' in df_actual.columns:
            # ── Fallback: último Nodo conocido del técnico en el día ──────────
            # Para actividades sin Nodo (admins, almacén, pre-turno…) tomamos
            # el Nodo de la última actividad ejecutada del mismo técnico que sí
            # tenga un Nodo válido mapeado en zona_map. Todo desde df ya cargado,
            # sin viajes extra a MySQL.
            df_con_nodo = df[
                df['Nodo'].notna() &
                (df['Nodo'].astype(str).str.strip() != '') &
                df['Estado'].isin(['Completado', 'No completado', 'Iniciado'])
            ].sort_values(['Técnico', 'inicio_datetime'])
            ultimo_nodo_map: Dict[str, str] = (
                df_con_nodo.groupby('Técnico')['Nodo']
                .last()
                .apply(lambda n: str(n).strip())
                .to_dict()
            )

            def _resolver_zona(row) -> tuple:
                """Devuelve (celula, microcelda, ciudad, fallback_usado)."""
                n_actual = str(row['Nodo']).strip() if pd.notna(row['Nodo']) else ''
                zona = zona_map.get(n_actual, {}) if n_actual else {}
                if zona.get('celula', 'Sin clasificar') != 'Sin clasificar':
                    return zona.get('celula'), zona.get('microcelda', 'Sin clasificar'), zona.get('ciudad', 'Sin clasificar'), False
                # Fallback: último nodo conocido del técnico
                n_fb = ultimo_nodo_map.get(row['Técnico'], '')
                zona_fb = zona_map.get(n_fb, {}) if n_fb else {}
                if zona_fb.get('celula', 'Sin clasificar') != 'Sin clasificar':
                    return zona_fb.get('celula'), zona_fb.get('microcelda', 'Sin clasificar'), zona_fb.get('ciudad', 'Sin clasificar'), True
                return 'Sin clasificar', 'Sin clasificar', 'Sin clasificar', False

            zona_cols = df_actual.apply(_resolver_zona, axis=1, result_type='expand')
            zona_cols.columns = ['celula', 'microcelda', 'ciudad_nodo', 'zona_fallback']
            df_actual[['celula', 'microcelda', 'ciudad_nodo', 'zona_fallback']] = zona_cols
        else:
            df_actual['celula']       = 'Sin clasificar'
            df_actual['microcelda']   = 'Sin clasificar'
            df_actual['ciudad_nodo']  = 'Sin clasificar'
            df_actual['zona_fallback'] = False

        cols_extra = ['celula', 'microcelda', 'ciudad_nodo', 'zona_fallback']
        if 'Nodo' in df_actual.columns:
            cols_extra = ['Nodo'] + cols_extra

        df_final = df_actual[[
            'Técnico', 'Compañia', 'Tipo de Actividad', 'ot_base', 'subtipo_ot', 'cuota_norma',
            'Ciudad', 'Inicio', 'ventana_fin', 'siguiente_actividad', 'ot_siguiente',
            'ciudad_siguiente', 'inicio_siguiente', 'pendientes_post_siguiente',
            'detalle_pendientes', 'detalle_completados', 'hora_actual', 'estado_actual',
            'estado_siguiente', 'minutos_retraso', 'minutos_retraso_siguiente',
            'minutos_parada', 'minutos_parada_ajustada', 'minutos_parada_restante',
            'retraso_hhmm', 'retraso_siguiente_hhmm',
            'parada_hhmm', 'parada_planificada_hhmm', 'parada_ajustada_hhmm',
            'fin_norma', 'cumplimiento_time_slot_dia',
            'factor_ritmo', 'minutos_trabajo_restante', 'hora_fin_estimada',
            'margen_6pm', 'riesgo_6pm', 'pendientes_con_cuota',
        ] + cols_extra].rename(columns={
            'Tipo de Actividad': 'actividad_actual',
            'ot_base':           'ot_actual',
            'Ciudad':            'ciudad_actual',
            'Inicio':            'inicio_actual',
            'Nodo':              'nodo',
        })

        t_global_end = time.time()
        print(f"[SERVICE] Total: {t_global_end - t_global_start:.3f}s | filas: {len(df_final)}", file=sys.stderr)
        return df_final
    except Exception as e:
        print(f"[SERVICE] ERROR en ejecutar_consulta_v2: {e}", file=sys.stderr)
        import traceback; print(traceback.format_exc(), file=sys.stderr)
        return pd.DataFrame()
    finally:
        if connection:
            connection.close()


def calcular_cumplimiento_dia_por_tecnicos(tecnicos: List[str]) -> float:
    if not tecnicos:
        return 0.0
    tz = pytz.timezone(settings.APP_TIMEZONE)
    connection = None
    try:
        connection = get_mysql_connection()
        placeholders = ','.join(['%s'] * len(tecnicos))
        query = f"""
            SELECT w.`Técnico`, w.`Estado`, w.`Inicio`, w.`Inicio - Fin`, w.`Fecha`, ts.cuota AS cuota_norma
            FROM wf_futuro_pruebas w
            LEFT JOIN wf_time_slot ts
              ON TRIM(w.`Subtipo de la Orden de Trabajo`) COLLATE utf8mb4_general_ci = TRIM(ts.SUBTRABAJO_WF) COLLATE utf8mb4_general_ci
            WHERE w.Origen IN ('REGION OCCIDENTE', 'PYMES OCCIDENTE')
              AND w.Fecha >= CURRENT_DATE()
              AND w.Fecha < CURRENT_DATE() + INTERVAL 1 DAY
              AND w.`Técnico` IN ({placeholders})
        """
        with connection.cursor() as cursor:
            cursor.execute(query, tuple(tecnicos))
            rows = cursor.fetchall()
        if not rows:
            return 0.0
        df = pd.DataFrame(rows)
        df['cuota_norma'] = pd.to_numeric(df.get('cuota_norma'), errors='coerce')
        df['Fecha'] = pd.to_datetime(df['Fecha'], errors='coerce')
        df['Inicio'] = df['Inicio'].astype(str).str.strip()
        fin_split = df['Inicio - Fin'].astype(str).str.split(' - ', n=1, expand=True)
        df['fin_str'] = fin_split[1].fillna('').str.strip()
        fecha_str = df['Fecha'].dt.strftime('%Y-%m-%d')
        df['inicio_datetime'] = pd.to_datetime(fecha_str + ' ' + df['Inicio'], errors='coerce')
        fin_time_str = df['fin_str'].where(df['fin_str'] != '', df['Inicio'])
        df['fin_datetime'] = pd.to_datetime(fecha_str + ' ' + fin_time_str, errors='coerce')
        try:
            df['inicio_datetime'] = df['inicio_datetime'].dt.tz_localize(tz)
            df['fin_datetime'] = df['fin_datetime'].dt.tz_localize(tz)
        except Exception:
            pass
        now_ts = pd.Timestamp.now(tz)
        mask_den = (df['cuota_norma'].fillna(0) > 0) & (df['Estado'].isin(['Iniciado', 'Completado', 'No completado']))
        denom = int(mask_den.sum())
        if denom == 0:
            return 0.0
        cumplimiento = pd.Series(False, index=df.index)
        m_ini = mask_den & (df['Estado'] == 'Iniciado') & df['inicio_datetime'].notna()
        cumplimiento.loc[m_ini] = now_ts <= (df.loc[m_ini, 'inicio_datetime'] + pd.to_timedelta(df.loc[m_ini, 'cuota_norma'], unit='m'))
        m_fin = mask_den & (df['Estado'].isin(['Completado', 'No completado'])) & df['inicio_datetime'].notna() & df['fin_datetime'].notna()
        dur_ok = (df.loc[m_fin, 'fin_datetime'] - df.loc[m_fin, 'inicio_datetime']) <= pd.to_timedelta(df.loc[m_fin, 'cuota_norma'], unit='m')
        cumplimiento.loc[m_fin] = dur_ok
        num = int(cumplimiento[mask_den].sum())
        return round((num / denom) * 100, 2)
    except Exception as e:
        print(f"[SERVICE] Error cumplimiento por tecnicos: {e}", file=sys.stderr)
        return 0.0
    finally:
        if connection:
            connection.close()


def serializar_datos(df: pd.DataFrame) -> List[Dict[str, Any]]:
    datos: List[Dict[str, Any]] = []
    if df is None or df.empty:
        return datos
    for _, row in df.iterrows():
        row_dict: Dict[str, Any] = {}
        for col, val in row.items():
            if isinstance(val, (datetime, date)):
                row_dict[col] = val.isoformat()
            elif isinstance(val, timedelta):
                row_dict[col] = val.total_seconds()
            elif pd.isna(val):
                row_dict[col] = None
            else:
                row_dict[col] = val
        datos.append(row_dict)
    return datos


def obtener_hora_inicio_tecnicos(fecha: Optional[str] = None) -> List[Dict[str, Any]]:
    """Consulta MySQL para obtener la primera hora de inicio de cada técnico.

    Args:
        fecha: Fecha en formato 'YYYY-MM-DD'. Si es None usa CURRENT_DATE().

    Retorna lista de dicts: {tecnico, hora_inicio (HH:MM), a_tiempo (bool)}
    Solo técnicos que ya tienen al menos una actividad en Estado Iniciado/Completado/No completado.
    """
    from datetime import date as _date
    connection = None
    try:
        connection = get_mysql_connection()
        if fecha:
            # Días anteriores → wf_cierre (histórico); hoy → wf_futuro_pruebas
            es_hoy = fecha == _date.today().isoformat()
            tabla = "wf_futuro_pruebas" if es_hoy else "wf_cierre"
            fecha_clause = f"AND w.Fecha = '{fecha}'"
        else:
            tabla = "wf_futuro_pruebas"
            fecha_clause = "AND w.Fecha >= CURRENT_DATE() AND w.Fecha < CURRENT_DATE() + INTERVAL 1 DAY"

        # Verificar si la tabla tiene columna Nodo (wf_cierre puede no tenerla)
        try:
            with connection.cursor() as _cur:
                _cur.execute(f"SHOW COLUMNS FROM `{tabla}` LIKE 'Nodo'")
                _tiene_nodo = bool(_cur.fetchone())
        except Exception:
            _tiene_nodo = False

        nodo_select = (
            "SUBSTRING_INDEX(GROUP_CONCAT(w.`Nodo` ORDER BY w.`Inicio` ASC SEPARATOR ','), ',', 1) AS nodo"
            if _tiene_nodo else "'' AS nodo"
        )

        query = f"""
            SELECT
                w.`Técnico`   AS tecnico,
                MIN(w.`Inicio`) AS hora_inicio,
                {nodo_select}
            FROM `{tabla}` w
            WHERE w.Origen IN ('REGION OCCIDENTE', 'PYMES OCCIDENTE')
              {fecha_clause}
              AND w.`Estado` IN ('Iniciado', 'Completado', 'No completado')
              AND LOWER(w.`Tipo de Actividad`) NOT LIKE '%almacen%'
              AND LOWER(w.`Tipo de Actividad`) NOT LIKE '%almacén%'
              AND LOWER(w.`Tipo de Actividad`) NOT LIKE '%almuerzo%'
              AND LOWER(w.`Tipo de Actividad`) NOT LIKE '%capacitacion%'
              AND LOWER(w.`Tipo de Actividad`) NOT LIKE '%capacitación%'
              AND LOWER(w.`Tipo de Actividad`) NOT LIKE '%pre-turno%'
              AND LOWER(w.`Tipo de Actividad`) NOT LIKE '%preturno%'
              AND w.`Inicio` IS NOT NULL
              AND w.`Inicio` != ''
            GROUP BY w.`Técnico`
        """
        with connection.cursor() as cursor:
            cursor.execute(query)
            rows = cursor.fetchall()
        if not rows:
            return []
        result = []
        for row in rows:
            tec = row.get("tecnico") or ""
            hora = str(row.get("hora_inicio") or "").strip()
            if not tec or not hora:
                continue
            hora_hhmm = hora[:5]
            a_tiempo = hora_hhmm <= "07:00"
            result.append({
                "tecnico":     tec,
                "hora_inicio": hora_hhmm,
                "a_tiempo":    a_tiempo,
                "nodo":        str(row.get("nodo") or "").strip(),
            })
        return result
    except Exception as e:
        print(f"[SERVICE] Error obtener_hora_inicio_tecnicos: {e}", file=sys.stderr)
        return []
    finally:
        if connection:
            connection.close()


def calcular_estadisticas(df: pd.DataFrame) -> Dict[str, Any]:
    empty = {
        'total_tecnicos': 0, 'tecnicos_retrasados': 0, 'tecnicos_retraso_siguiente': 0,
        'tecnicos_con_parada_futura': 0, 'promedio_retraso': 0.0, 'max_retraso': 0.0,
        'total_pendientes': 0, 'promedio_completados': 0.0, 'promedio_no_completados': 0.0,
        'porcentaje_retrasados': 0.0, 'cumplimiento_norma': 0.0, 'cumplimiento_time_slot_dia': 0.0,
    }
    if df is None or df.empty:
        return empty

    total_dur_comp = 0.0; count_comp = 0
    total_dur_no_comp = 0.0; count_no_comp = 0
    if 'detalle_completados' in df.columns:
        for detalle_str in df['detalle_completados'].dropna():
            for evento in str(detalle_str).split('######'):
                try:
                    partes = evento.split('###')
                    if len(partes) == 4:
                        rango, _, _, estado = partes
                        inicio_s, fin_s = rango.split(' a ')
                        inicio_s = inicio_s.strip()
                        fin_s = fin_s.split(' (')[0].strip()
                        fmt_i = '%H:%M:%S' if inicio_s.count(':') == 2 else '%H:%M'
                        fmt_f = '%H:%M:%S' if fin_s.count(':') == 2 else '%H:%M'
                        dur = (datetime.strptime(fin_s, fmt_f) - datetime.strptime(inicio_s, fmt_i)).total_seconds() / 60.0
                        if estado == 'Completado':
                            total_dur_comp += dur; count_comp += 1
                        elif estado == 'No completado':
                            total_dur_no_comp += dur; count_no_comp += 1
                except Exception:
                    continue

    prom_comp = (total_dur_comp / count_comp) if count_comp > 0 else 0.0
    prom_no_comp = (total_dur_no_comp / count_no_comp) if count_no_comp > 0 else 0.0

    df['minutos_retraso'] = df.get('minutos_retraso', 0).fillna(0)
    df['minutos_retraso_siguiente'] = df.get('minutos_retraso_siguiente', 0).fillna(0)

    df['_min_ret_metric'] = np.where(
        df['estado_actual'] == 'Retraso en siguiente',
        df['minutos_retraso_siguiente'],
        df['minutos_retraso'],
    )
    mask_ret = (
        ((df['estado_actual'] == 'Retraso actual') & (df['minutos_retraso'] > 0)) |
        ((df['estado_actual'] == 'Retraso en siguiente') & (df['minutos_retraso_siguiente'] > 0))
    )
    prom_ret = float(round(df.loc[mask_ret, '_min_ret_metric'].mean(), 2)) if mask_ret.any() else 0.0
    max_ret = float(df.loc[mask_ret, '_min_ret_metric'].max()) if mask_ret.any() else 0.0
    tec_ret = int(len(df[df['estado_actual'].isin(['Retraso actual', 'Retraso en siguiente'])]))
    tec_ret_sig = int(len(df[df['estado_actual'] == 'Retraso en siguiente']))
    tec_parada = int(len(df[df['estado_siguiente'] == 'Parada futura']))
    total = int(len(df))
    pct_ret = round((tec_ret / total * 100) if total > 0 else 0.0, 2)
    total_pend = int(df['pendientes_post_siguiente'].sum()) if 'pendientes_post_siguiente' in df.columns else 0

    cump_norma = 0.0
    try:
        df_cn = df.copy()
        df_cn['cuota_norma'] = pd.to_numeric(df_cn.get('cuota_norma', 0), errors='coerce')
        mask_den = df_cn['cuota_norma'].fillna(0) > 0
        mask_act = df_cn['estado_actual'].isin(['En ejecución', 'Retraso actual'])
        den = int((mask_den & mask_act).sum())
        if den > 0:
            num = int((mask_den & (df_cn['estado_actual'] == 'En ejecución')).sum())
            cump_norma = round((num / den) * 100, 2)
    except Exception:
        pass

    cump_dia = 0.0
    try:
        if 'cumplimiento_time_slot_dia' in df.columns:
            serie = df['cumplimiento_time_slot_dia'].dropna()
            if not serie.empty:
                cump_dia = float(serie.iloc[0])
    except Exception:
        pass

    return {
        'total_tecnicos': total,
        'tecnicos_retrasados': tec_ret,
        'tecnicos_retraso_siguiente': tec_ret_sig,
        'tecnicos_con_parada_futura': tec_parada,
        'promedio_retraso': prom_ret,
        'max_retraso': max_ret,
        'total_pendientes': total_pend,
        'promedio_completados': prom_comp,
        'promedio_no_completados': prom_no_comp,
        'porcentaje_retrasados': pct_ret,
        'cumplimiento_norma': cump_norma,
        'cumplimiento_time_slot_dia': cump_dia,
    }
