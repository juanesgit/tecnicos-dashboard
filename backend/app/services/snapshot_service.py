"""Captura periódica de snapshots cada 5 minutos."""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime
from typing import List, Dict, Any

import pytz

from app.config import settings

logger = logging.getLogger(__name__)
_task: asyncio.Task | None = None


def _calcular_stats(datos: List[Dict[str, Any]]):
    """Calcula métricas globales y por célula a partir de la lista de técnicos."""
    ESTADOS_RETRASO = {"Retraso actual", "Retraso en siguiente"}

    total         = len(datos)
    con_retraso   = sum(1 for d in datos if d.get("estado_actual") in ESTADOS_RETRASO)
    con_parada    = sum(1 for d in datos if d.get("estado_siguiente") == "Parada futura")
    cump_vals     = [d.get("cumplimiento_time_slot_dia", 0) for d in datos if d.get("cumplimiento_time_slot_dia") is not None]
    cumplimiento  = round(sum(cump_vals) / len(cump_vals), 1) if cump_vals else 0.0

    # Agrupar por célula
    from collections import defaultdict
    grupos: Dict[str, list] = defaultdict(list)
    for d in datos:
        cel = d.get("celula", "Sin célula") or "Sin célula"
        grupos[cel].append(d)

    por_celula = []
    for cel, items in grupos.items():
        c_total   = len(items)
        c_retraso = sum(1 for d in items if d.get("estado_actual") in ESTADOS_RETRASO)
        c_parada  = sum(1 for d in items if d.get("estado_siguiente") == "Parada futura")
        c_vals    = [d.get("cumplimiento_time_slot_dia", 0) for d in items if d.get("cumplimiento_time_slot_dia") is not None]
        c_cump    = round(sum(c_vals) / len(c_vals), 1) if c_vals else 0.0
        por_celula.append({
            "celula": cel,
            "total": c_total,
            "con_retraso": c_retraso,
            "con_parada": c_parada,
            "cumplimiento_pct": c_cump,
        })

    # Agrupar por microcelda (dentro de cada célula)
    grupos_mc: Dict[tuple, list] = defaultdict(list)
    for d in datos:
        cel = d.get("celula", "Sin célula") or "Sin célula"
        mc  = d.get("microcelda", "Sin microcelda") or "Sin microcelda"
        grupos_mc[(cel, mc)].append(d)

    por_microcelda = []
    for (cel, mc), items in grupos_mc.items():
        mc_total    = len(items)
        mc_retraso  = sum(1 for d in items if d.get("estado_actual") in ESTADOS_RETRASO)
        mc_parada   = sum(1 for d in items if d.get("estado_siguiente") == "Parada futura")
        mc_en_riesgo = sum(1 for d in items if d.get("riesgo_6pm") == "En riesgo")
        mc_vals     = [d.get("cumplimiento_time_slot_dia", 0) for d in items if d.get("cumplimiento_time_slot_dia") is not None]
        mc_cump     = round(sum(mc_vals) / len(mc_vals), 1) if mc_vals else 0.0
        por_microcelda.append({
            "celula": cel, "microcelda": mc,
            "total": mc_total, "con_retraso": mc_retraso,
            "con_parada": mc_parada, "cumplimiento_pct": mc_cump,
            "en_riesgo": mc_en_riesgo,
        })

    # Agrupar por ciudad (campo ciudad_nodo añadido por datos_service)
    grupos_ciudad: Dict[str, list] = defaultdict(list)
    for d in datos:
        ciudad = d.get("ciudad_nodo", "Sin clasificar") or "Sin clasificar"
        grupos_ciudad[ciudad].append(d)

    por_ciudad = []
    for ciudad, items in grupos_ciudad.items():
        # Tomar célula y microcelda del primer elemento (todos deberían ser iguales para esa ciudad)
        ct_celula    = items[0].get("celula", "Sin clasificar") or "Sin clasificar"
        ct_mc        = items[0].get("microcelda", "Sin clasificar") or "Sin clasificar"
        ct_total     = len(items)
        ct_retraso   = sum(1 for d in items if d.get("estado_actual") in ESTADOS_RETRASO)
        ct_parada    = sum(1 for d in items if d.get("estado_siguiente") == "Parada futura")
        ct_en_riesgo = sum(1 for d in items if d.get("riesgo_6pm") == "En riesgo")
        ct_vals      = [d.get("cumplimiento_time_slot_dia", 0) for d in items if d.get("cumplimiento_time_slot_dia") is not None]
        ct_cump      = round(sum(ct_vals) / len(ct_vals), 1) if ct_vals else 0.0
        por_ciudad.append({
            "ciudad": ciudad, "celula": ct_celula, "microcelda": ct_mc,
            "total": ct_total, "con_retraso": ct_retraso,
            "con_parada": ct_parada, "cumplimiento_pct": ct_cump,
            "en_riesgo": ct_en_riesgo,
        })

    return {
        "total": total,
        "con_retraso": con_retraso,
        "con_parada": con_parada,
        "cumplimiento_pct": cumplimiento,
        "por_celula": por_celula,
        "por_microcelda": por_microcelda,
        "por_ciudad": por_ciudad,
    }


async def _registrar_inicio_tecnicos(datos: list, now: "datetime"):
    """Detecta la primera hora de inicio de cada técnico hoy y la persiste (solo una vez/día)."""
    from app.database import AsyncSessionLocal
    from app.models.snapshot import RegistroInicioDiario
    from sqlalchemy import select as sa_select, text
    import asyncio

    fecha_str = now.strftime("%Y-%m-%d")

    # Construir mapa celula/microcelda desde los datos del snapshot
    zona_map: dict = {}
    for d in datos:
        tec = d.get("Técnico") or d.get("técnico") or ""
        if tec:
            zona_map[tec] = {
                "celula":     d.get("celula", "Sin clasificar") or "Sin clasificar",
                "microcelda": d.get("microcelda", "Sin clasificar") or "Sin clasificar",
            }

    # Consultar MySQL para hora de inicio real (ejecutar en thread pool)
    loop = asyncio.get_event_loop()
    try:
        from app.services.datos_service import obtener_hora_inicio_tecnicos
        registros = await loop.run_in_executor(None, obtener_hora_inicio_tecnicos)
    except Exception as exc:
        logger.warning("[Inicio] Error consultando MySQL: %s", exc)
        return

    if not registros:
        return

    async with AsyncSessionLocal() as session:
        # Cargar técnicos ya registrados hoy
        result = await session.execute(
            sa_select(RegistroInicioDiario.tecnico)
            .where(RegistroInicioDiario.fecha == fecha_str)
        )
        ya_registrados = {row[0] for row in result.fetchall()}

        nuevos = 0
        for reg in registros:
            tec = reg["tecnico"]
            if tec in ya_registrados:
                continue
            zona = zona_map.get(tec, {"celula": "Sin clasificar", "microcelda": "Sin clasificar"})
            session.add(RegistroInicioDiario(
                fecha       = fecha_str,
                tecnico     = tec,
                celula      = zona["celula"],
                microcelda  = zona["microcelda"],
                hora_inicio = reg["hora_inicio"],
                a_tiempo    = reg["a_tiempo"],
            ))
            nuevos += 1

        if nuevos:
            await session.commit()
            logger.info("[Inicio] %d técnicos registrados para %s", nuevos, fecha_str)


async def _capture_once():
    """Captura un snapshot y lo persiste."""
    from app.services.datos_service import ejecutar_consulta_v2, serializar_datos
    from app.services.cache_service import get_cached_datos, set_cached_datos
    from app.database import AsyncSessionLocal
    from app.models.snapshot import SnapshotGlobal, SnapshotCelula, SnapshotMicrocelda, SnapshotCiudad

    try:
        # Reutilizar caché si existe, si no consultar
        cached = get_cached_datos()
        if cached:
            datos = cached.get("datos", [])
        else:
            loop = asyncio.get_event_loop()
            df   = await loop.run_in_executor(None, ejecutar_consulta_v2)
            if df is None or df.empty:
                logger.info("[Snapshot] Sin datos disponibles, omitiendo captura.")
                return
            datos = serializar_datos(df)
            # Actualizar caché
            from app.services.datos_service import calcular_estadisticas
            payload = {"datos": datos, "estadisticas": calcular_estadisticas(df), "version_backend": settings.APP_VERSION}
            set_cached_datos(payload)

        if not datos:
            logger.info("[Snapshot] Lista de técnicos vacía, omitiendo captura.")
            return

        stats = _calcular_stats(datos)
        tz    = pytz.timezone(settings.APP_TIMEZONE)
        now   = datetime.now(tz).replace(tzinfo=None)  # naive UTC-equivalente local

        # ── Capturar avance OT por microcelda y por ciudad ─────────────────────
        avance_mc: dict   = {}
        avance_ct: dict   = {}
        try:
            loop = asyncio.get_event_loop()
            from app.routers.avance import _calcular_avance
            avance_data = await loop.run_in_executor(None, _calcular_avance)
            for item in avance_data.get("por_microcelda", []):
                key = (item.get("celula", ""), item.get("microcelda", ""))
                avance_mc[key] = item
            for item in avance_data.get("por_ciudad", []):
                avance_ct[item.get("ciudad", "")] = item
            logger.debug(
                "[Snapshot] Avance OT: %d microceldas, %d ciudades",
                len(avance_mc), len(avance_ct),
            )
        except Exception as avance_exc:
            logger.warning("[Snapshot] Error capturando avance OT: %s", avance_exc)

        # ── Procesar alarmas en CADA captura (antes del dedup de snapshot) ──────
        # Se ejecuta cada 5 min independientemente de si el snapshot cambia,
        # porque los técnicos retrasados pueden cambiar aunque los totales sean iguales.
        try:
            from app.services.alarma_service import procesar_alarmas
            await procesar_alarmas(datos)
        except Exception as alarma_exc:
            logger.warning("[Alarma] Error en procesamiento: %s", alarma_exc)

        async with AsyncSessionLocal() as session:
            from sqlalchemy import select as sa_select

            # ── Deduplicación: omitir si los conteos son idénticos al último snapshot ──
            ultimo_result = await session.execute(
                sa_select(SnapshotGlobal)
                .order_by(SnapshotGlobal.captured_at.desc())
                .limit(1)
            )
            ultimo = ultimo_result.scalar_one_or_none()
            if (
                ultimo is not None
                and ultimo.total       == stats["total"]
                and ultimo.con_retraso == stats["con_retraso"]
                and ultimo.con_parada  == stats["con_parada"]
            ):
                logger.info(
                    "[Snapshot] %s — sin cambios en datos (total=%d, retraso=%d), omitiendo.",
                    now.strftime("%H:%M"), stats["total"], stats["con_retraso"]
                )
                return

            snap = SnapshotGlobal(
                captured_at      = now,
                total            = stats["total"],
                con_retraso      = stats["con_retraso"],
                con_parada       = stats["con_parada"],
                cumplimiento_pct = stats["cumplimiento_pct"],
            )
            session.add(snap)
            await session.flush()  # para obtener snap.id

            for c in stats["por_celula"]:
                session.add(SnapshotCelula(
                    snapshot_id      = snap.id,
                    celula           = c["celula"],
                    total            = c["total"],
                    con_retraso      = c["con_retraso"],
                    con_parada       = c["con_parada"],
                    cumplimiento_pct = c["cumplimiento_pct"],
                ))

            for m in stats["por_microcelda"]:
                # Buscar datos de avance OT para esta microcelda
                ot = avance_mc.get((m["celula"], m["microcelda"]), {})
                # Fallback: buscar solo por nombre de microcelda
                if not ot:
                    ot = avance_mc.get(("", m["microcelda"]), {})
                session.add(SnapshotMicrocelda(
                    snapshot_id      = snap.id,
                    celula           = m["celula"],
                    microcelda       = m["microcelda"],
                    total            = m["total"],
                    con_retraso      = m["con_retraso"],
                    con_parada       = m["con_parada"],
                    cumplimiento_pct = m["cumplimiento_pct"],
                    en_riesgo        = m["en_riesgo"],
                    ot_completado    = int(ot.get("completado", 0)),
                    ot_no_completado = int(ot.get("no_completado", 0)),
                    ot_iniciado      = int(ot.get("iniciado", 0)),
                    ot_pendiente     = int(ot.get("pendiente", 0)),
                    ot_suspendido    = int(ot.get("suspendido", 0)),
                    ot_total         = int(ot.get("total", 0)),
                    ot_pct_avance    = float(ot.get("pct_avance", 0.0)),
                ))

            for ct in stats.get("por_ciudad", []):
                ot_ct = avance_ct.get(ct["ciudad"], {})
                session.add(SnapshotCiudad(
                    snapshot_id      = snap.id,
                    ciudad           = ct["ciudad"],
                    celula           = ct["celula"],
                    microcelda       = ct["microcelda"],
                    total            = ct["total"],
                    con_retraso      = ct["con_retraso"],
                    con_parada       = ct["con_parada"],
                    cumplimiento_pct = ct["cumplimiento_pct"],
                    en_riesgo        = ct["en_riesgo"],
                    ot_completado    = int(ot_ct.get("completado",    0)),
                    ot_no_completado = int(ot_ct.get("no_completado", 0)),
                    ot_iniciado      = int(ot_ct.get("iniciado",      0)),
                    ot_pendiente     = int(ot_ct.get("pendiente",     0)),
                    ot_suspendido    = int(ot_ct.get("suspendido",    0)),
                    ot_total         = int(ot_ct.get("total",         0)),
                    ot_pct_avance    = float(ot_ct.get("pct_avance",  0.0)),
                ))

            await session.commit()
            logger.info(
                "[Snapshot] Capturado %s — %d técnicos, %d con retraso, %d ciudades",
                now.strftime("%H:%M"), stats["total"], stats["con_retraso"],
                len(stats.get("por_ciudad", [])),
            )

        # ── Registrar hora de inicio diaria ───────────────────────────────
        try:
            await _registrar_inicio_tecnicos(datos, now)
        except Exception as inicio_exc:
            logger.warning("[Inicio] Error en registro: %s", inicio_exc)

        # ── Evaluar alertas fuera de la sesión de snapshot ─────────────────
        try:
            from app.services.alert_service import evaluar_y_notificar
            await evaluar_y_notificar(stats, ultimo)
        except Exception as alert_exc:
            logger.warning("[Alerta] Error en evaluación: %s", alert_exc)

    except Exception as exc:
        logger.exception("[Snapshot] Error en captura: %s", exc)


async def _snapshot_loop():
    """Loop infinito: captura cada 5 minutos alineado al reloj."""
    import math
    while True:
        try:
            tz  = pytz.timezone(settings.APP_TIMEZONE)
            now = datetime.now(tz)
            # Esperar hasta el próximo múltiplo de 5 min
            minuto_actual   = now.minute
            minutos_a_esperar = 5 - (minuto_actual % 5)
            segundos_a_esperar = minutos_a_esperar * 60 - now.second
            if segundos_a_esperar <= 0:
                segundos_a_esperar = 5
            logger.info("[Snapshot] Próxima captura en %ds", segundos_a_esperar)
            await asyncio.sleep(segundos_a_esperar)
            await _capture_once()
        except asyncio.CancelledError:
            logger.info("[Snapshot] Loop cancelado.")
            break
        except Exception as exc:
            logger.exception("[Snapshot] Error inesperado en loop: %s", exc)
            await asyncio.sleep(60)


def start_snapshot_task():
    """Arranca el loop de captura como tarea asyncio."""
    global _task
    _task = asyncio.create_task(_snapshot_loop())
    logger.info("[Snapshot] Tarea de captura iniciada.")


def stop_snapshot_task():
    global _task
    if _task and not _task.done():
        _task.cancel()
