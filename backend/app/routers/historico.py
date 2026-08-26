"""Endpoints de histórico de snapshots."""
from __future__ import annotations
from datetime import datetime, timedelta
from typing import List, Optional

import pytz
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.snapshot import SnapshotGlobal, SnapshotCelula, RegistroInicioDiario
from app.models.user import User
from app.services.auth import get_current_user, get_current_user_optional

router = APIRouter(prefix="/historico", tags=["Histórico"])


def _tz_now():
    return datetime.now(pytz.timezone(settings.APP_TIMEZONE)).replace(tzinfo=None)


@router.get("/global")
async def historico_global(
    horas: int = Query(default=8, ge=1, le=48),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Serie temporal global: total, con_retraso, con_parada, cumplimiento_pct."""
    desde = _tz_now() - timedelta(hours=horas)
    result = await db.execute(
        select(SnapshotGlobal)
        .where(SnapshotGlobal.captured_at >= desde)
        .order_by(SnapshotGlobal.captured_at)
    )
    rows = result.scalars().all()
    return {
        "horas": horas,
        "puntos": [
            {
                "t": r.captured_at.strftime("%H:%M"),
                "total":            r.total,
                "con_retraso":      r.con_retraso,
                "con_parada":       r.con_parada,
                "cumplimiento_pct": r.cumplimiento_pct,
                "pct_retraso":      round(r.con_retraso / r.total * 100, 1) if r.total else 0,
            }
            for r in rows
        ],
    }


@router.get("/celulas")
async def historico_celulas(
    horas: int = Query(default=8, ge=1, le=48),
    celula: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Serie temporal por célula, con último snapshot por célula."""
    desde = _tz_now() - timedelta(hours=horas)

    # Si el usuario tiene scope restringido, forzar su célula
    if current_user.role == "lider_celula" and current_user.celula:
        celula = current_user.celula
    elif current_user.role == "supervisor_microcelda" and current_user.celula:
        celula = current_user.celula

    q = (
        select(SnapshotGlobal.captured_at, SnapshotCelula)
        .join(SnapshotCelula, SnapshotCelula.snapshot_id == SnapshotGlobal.id)
        .where(SnapshotGlobal.captured_at >= desde)
    )
    if celula:
        q = q.where(SnapshotCelula.celula == celula)

    q = q.order_by(SnapshotGlobal.captured_at)
    result = await db.execute(q)
    rows = result.all()

    # Agrupar por célula → lista de puntos
    from collections import defaultdict
    series: dict = defaultdict(list)
    for captured_at, sc in rows:
        series[sc.celula].append({
            "t":               captured_at.strftime("%H:%M"),
            "total":           sc.total,
            "con_retraso":     sc.con_retraso,
            "con_parada":      sc.con_parada,
            "cumplimiento_pct": sc.cumplimiento_pct,
            "pct_retraso":     round(sc.con_retraso / sc.total * 100, 1) if sc.total else 0,
        })

    return {"horas": horas, "celula": celula, "series": dict(series)}


@router.get("/microceldas")
async def historico_microceldas(
    horas: int = Query(default=8, ge=1, le=48),
    celula: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Matriz de calor: microcelda × snapshots para las últimas N horas."""
    from app.models.snapshot import SnapshotMicrocelda
    desde = _tz_now() - timedelta(hours=horas)

    # Forzar scope si es lider/supervisor
    if current_user.role in ("lider_celula", "supervisor_microcelda") and current_user.celula:
        celula = current_user.celula

    q = (
        select(SnapshotGlobal.captured_at, SnapshotMicrocelda)
        .join(SnapshotMicrocelda, SnapshotMicrocelda.snapshot_id == SnapshotGlobal.id)
        .where(SnapshotGlobal.captured_at >= desde)
    )
    if celula:
        q = q.where(SnapshotMicrocelda.celula == celula)

    q = q.order_by(SnapshotGlobal.captured_at)
    result = await db.execute(q)
    rows = result.all()

    # Agrupar: { microcelda: [ {t, total, con_retraso, pct_retraso, ...}, ... ] }
    from collections import defaultdict
    series: dict = defaultdict(list)
    for captured_at, sm in rows:
        series[sm.microcelda].append({
            "t":               captured_at.strftime("%H:%M"),
            "celula":          sm.celula,
            "total":           sm.total,
            "con_retraso":     sm.con_retraso,
            "con_parada":      sm.con_parada,
            "cumplimiento_pct": sm.cumplimiento_pct,
            "pct_retraso":     round(sm.con_retraso / sm.total * 100, 1) if sm.total else 0,
        })

    # Lista de timestamps únicos ordenados
    all_times = sorted({p["t"] for pts in series.values() for p in pts})

    return {
        "horas":    horas,
        "celula":   celula,
        "tiempos":  all_times,
        "series":   dict(series),
    }


@router.get("/prediccion")
async def historico_prediccion(
    horas: int = Query(default=8, ge=1, le=48),
    celula: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tendencia histórica de % En riesgo 6pm por microcelda."""
    from app.models.snapshot import SnapshotMicrocelda
    desde = _tz_now() - timedelta(hours=horas)

    # Forzar scope si es lider/supervisor
    if current_user.role in ("lider_celula", "supervisor_microcelda") and current_user.celula:
        celula = current_user.celula

    q = (
        select(SnapshotGlobal.captured_at, SnapshotMicrocelda)
        .join(SnapshotMicrocelda, SnapshotMicrocelda.snapshot_id == SnapshotGlobal.id)
        .where(SnapshotGlobal.captured_at >= desde)
    )
    if celula:
        q = q.where(SnapshotMicrocelda.celula == celula)

    q = q.order_by(SnapshotGlobal.captured_at)
    result = await db.execute(q)
    rows = result.all()

    # Agrupar: { microcelda: [ {t, celula, total, en_riesgo, pct_en_riesgo}, ... ] }
    from collections import defaultdict
    series: dict = defaultdict(list)
    for captured_at, sm in rows:
        pct = round(sm.en_riesgo / sm.total * 100, 1) if sm.total else 0.0
        series[sm.microcelda].append({
            "t":            captured_at.strftime("%H:%M"),
            "celula":       sm.celula,
            "total":        sm.total,
            "en_riesgo":    sm.en_riesgo,
            "pct_en_riesgo": pct,
        })

    all_times = sorted({p["t"] for pts in series.values() for p in pts})

    return {
        "horas":   horas,
        "celula":  celula,
        "tiempos": all_times,
        "series":  dict(series),
    }


@router.get("/avance")
async def historico_avance(
    horas: int = Query(default=8, ge=1, le=48),
    celula: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tendencia histórica de avance OT (% completado) por microcelda — granularidad 5 min."""
    from app.models.snapshot import SnapshotMicrocelda
    desde = _tz_now() - timedelta(hours=horas)

    # Forzar scope si es lider/supervisor
    if current_user.role in ("lider_celula", "supervisor_microcelda") and current_user.celula:
        celula = current_user.celula

    q = (
        select(SnapshotGlobal.captured_at, SnapshotMicrocelda)
        .join(SnapshotMicrocelda, SnapshotMicrocelda.snapshot_id == SnapshotGlobal.id)
        .where(SnapshotGlobal.captured_at >= desde)
    )
    if celula:
        q = q.where(SnapshotMicrocelda.celula == celula)

    q = q.order_by(SnapshotGlobal.captured_at)
    result = await db.execute(q)
    rows = result.all()

    # Agrupar: { microcelda: [ {t, celula, completado, no_completado, iniciado,
    #                           pendiente, suspendido, total, pct_avance}, ... ] }
    from collections import defaultdict
    series: dict = defaultdict(list)
    for captured_at, sm in rows:
        series[sm.microcelda].append({
            "t":             captured_at.strftime("%H:%M"),
            "celula":        sm.celula,
            "completado":    sm.ot_completado,
            "no_completado": sm.ot_no_completado,
            "iniciado":      sm.ot_iniciado,
            "pendiente":     sm.ot_pendiente,
            "suspendido":    sm.ot_suspendido,
            "total":         sm.ot_total,
            "pct_avance":    sm.ot_pct_avance,
        })

    all_times = sorted({p["t"] for pts in series.values() for p in pts})

    return {
        "horas":   horas,
        "celula":  celula,
        "tiempos": all_times,
        "series":  dict(series),
    }


@router.get("/inicio/microceldas")
async def historico_inicio_microceldas(
    dias: int = Query(default=7, ge=1, le=30),
    celula: Optional[str] = Query(default=None),
    microcelda: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Agrega diario de hora de inicio por microcelda.

    Devuelve por microcelda y fecha: total técnicos, a_tiempo, pct_a_tiempo, hora_promedio.
    """
    from sqlalchemy import func
    tz = pytz.timezone(settings.APP_TIMEZONE)
    hoy = datetime.now(tz).date()
    desde_str = (hoy - timedelta(days=dias - 1)).isoformat()

    # Scope restrictions
    if current_user.role == "lider_celula" and current_user.celula:
        celula = current_user.celula
    elif current_user.role == "supervisor_microcelda" and current_user.celula:
        celula = current_user.celula
        # Si el supervisor tiene múltiples microceldas, microcelda queda None
        # y filtramos en Python después para soportar la lista completa
        mc_list = current_user.microcelda_list
        if len(mc_list) == 1:
            microcelda = mc_list[0]
        # Si mc_list > 1, filtramos en Python más abajo

    q = select(RegistroInicioDiario).where(RegistroInicioDiario.fecha >= desde_str)
    if celula:
        q = q.where(RegistroInicioDiario.celula == celula)
    if microcelda:
        q = q.where(RegistroInicioDiario.microcelda == microcelda)
    q = q.order_by(RegistroInicioDiario.fecha, RegistroInicioDiario.microcelda)

    result = await db.execute(q)
    registros = result.scalars().all()

    # Si el supervisor tiene múltiples microceldas, filtrar en Python
    if current_user.role == "supervisor_microcelda":
        mc_list = current_user.microcelda_list
        if len(mc_list) > 1:
            mc_set = set(mc_list)
            registros = [r for r in registros if r.microcelda in mc_set]

    # Agrupar por (microcelda, fecha)
    from collections import defaultdict
    grupos: dict = defaultdict(lambda: defaultdict(list))
    for r in registros:
        grupos[r.microcelda][r.fecha].append(r)

    # Calcular hora promedio en minutos desde medianoche
    def promedio_hora(lista):
        if not lista:
            return None
        total_min = 0
        count = 0
        for r in lista:
            try:
                h, m = map(int, r.hora_inicio.split(":"))
                total_min += h * 60 + m
                count += 1
            except Exception:
                pass
        if count == 0:
            return None
        avg = total_min // count
        return f"{avg // 60:02d}:{avg % 60:02d}"

    series = {}
    for mc, fechas in grupos.items():
        puntos = []
        for fecha in sorted(fechas.keys()):
            regs = fechas[fecha]
            total = len(regs)
            a_t   = sum(1 for r in regs if r.a_tiempo)
            puntos.append({
                "fecha":       fecha,
                "total":       total,
                "a_tiempo":    a_t,
                "pct_a_tiempo": round(a_t / total * 100, 1) if total else 0,
                "hora_promedio": promedio_hora(regs),
            })
        series[mc] = puntos

    return {"dias": dias, "celula": celula, "series": series}


@router.get("/inicio/tecnicos")
async def historico_inicio_tecnicos(
    dias: int = Query(default=7, ge=1, le=30),
    celula: Optional[str] = Query(default=None),
    microcelda: Optional[str] = Query(default=None),
    tecnico: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detalle diario por técnico: fecha, hora_inicio, a_tiempo."""
    tz = pytz.timezone(settings.APP_TIMEZONE)
    hoy = datetime.now(tz).date()
    desde_str = (hoy - timedelta(days=dias - 1)).isoformat()

    # Scope restrictions
    if current_user.role == "lider_celula" and current_user.celula:
        celula = current_user.celula
    elif current_user.role == "supervisor_microcelda" and current_user.celula:
        celula = current_user.celula
        if current_user.microcelda:
            microcelda = current_user.microcelda

    q = select(RegistroInicioDiario).where(RegistroInicioDiario.fecha >= desde_str)
    if celula:
        q = q.where(RegistroInicioDiario.celula == celula)
    if microcelda:
        q = q.where(RegistroInicioDiario.microcelda == microcelda)
    if tecnico:
        q = q.where(RegistroInicioDiario.tecnico.ilike(f"%{tecnico}%"))
    q = q.order_by(RegistroInicioDiario.tecnico, RegistroInicioDiario.fecha)

    result = await db.execute(q)
    registros = result.scalars().all()

    from collections import defaultdict
    por_tecnico: dict = defaultdict(list)
    for r in registros:
        por_tecnico[r.tecnico].append({
            "fecha":       r.fecha,
            "hora_inicio": r.hora_inicio,
            "a_tiempo":    r.a_tiempo,
            "celula":      r.celula,
            "microcelda":  r.microcelda,
        })

    # Fechas únicas para la cabecera
    fechas = sorted({r.fecha for r in registros})
    return {
        "dias":      dias,
        "fechas":    fechas,
        "tecnicos":  dict(por_tecnico),
    }


@router.get("/microcelda-drill")
async def microcelda_drill(
    microcelda: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Técnicos actuales en una microcelda: lista en riesgo + total."""
    import asyncio
    from app.services.datos_service import ejecutar_consulta_v2, serializar_datos
    from app.services.cache_service import get_cached_datos

    # Scope restriction
    if current_user.role in ("lider_celula", "supervisor_microcelda") and current_user.microcelda:
        microcelda = current_user.microcelda

    # Usar caché si está disponible
    cached = get_cached_datos()
    if cached is not None:
        todos = cached.get("datos", [])
    else:
        loop = asyncio.get_event_loop()
        df   = await loop.run_in_executor(None, ejecutar_consulta_v2)
        todos = serializar_datos(df)

    filtrados  = [t for t in todos if t.get("microcelda") == microcelda]
    en_riesgo  = [t for t in filtrados if t.get("estado_actual") in ("Retraso actual", "Retraso en siguiente")]
    con_parada = [t for t in filtrados if t.get("estado_siguiente") == "Parada futura"]

    return {
        "microcelda": microcelda,
        "total":       len(filtrados),
        "en_riesgo":   en_riesgo,
        "con_parada":  con_parada,
    }


@router.get("/microcelda-prediccion")
async def microcelda_prediccion_drill(
    microcelda: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Técnicos actuales en una microcelda: desglose por riesgo 6pm."""
    import asyncio
    from app.services.datos_service import ejecutar_consulta_v2, serializar_datos
    from app.services.cache_service import get_cached_datos

    # Scope restriction
    if current_user.role in ("lider_celula", "supervisor_microcelda") and current_user.microcelda:
        microcelda = current_user.microcelda

    cached = get_cached_datos()
    if cached is not None:
        todos = cached.get("datos", [])
    else:
        loop = asyncio.get_event_loop()
        df   = await loop.run_in_executor(None, ejecutar_consulta_v2)
        todos = serializar_datos(df)

    filtrados = [t for t in todos if t.get("microcelda") == microcelda]
    en_riesgo = [t for t in filtrados if t.get("riesgo_6pm") == "En riesgo"]
    ajustado  = [t for t in filtrados if t.get("riesgo_6pm") == "Ajustado"]
    a_tiempo  = [t for t in filtrados if t.get("riesgo_6pm") == "A tiempo"]

    return {
        "microcelda": microcelda,
        "total":       len(filtrados),
        "en_riesgo":   en_riesgo,
        "ajustado":    ajustado,
        "a_tiempo":    a_tiempo,
    }


@router.get("/ultimo")
async def ultimo_snapshot(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Último snapshot global + desglose por célula."""
    result = await db.execute(
        select(SnapshotGlobal).order_by(SnapshotGlobal.captured_at.desc()).limit(1)
    )
    snap = result.scalar_one_or_none()
    if not snap:
        return {"snapshot": None, "celulas": []}

    cel_result = await db.execute(
        select(SnapshotCelula).where(SnapshotCelula.snapshot_id == snap.id)
    )
    celulas = cel_result.scalars().all()
    return {
        "snapshot": {
            "captured_at":      snap.captured_at.strftime("%H:%M"),
            "total":            snap.total,
            "con_retraso":      snap.con_retraso,
            "con_parada":       snap.con_parada,
            "cumplimiento_pct": snap.cumplimiento_pct,
            "pct_retraso":      round(snap.con_retraso / snap.total * 100, 1) if snap.total else 0,
        },
        "celulas": [
            {
                "celula":          c.celula,
                "total":           c.total,
                "con_retraso":     c.con_retraso,
                "con_parada":      c.con_parada,
                "cumplimiento_pct": c.cumplimiento_pct,
                "pct_retraso":     round(c.con_retraso / c.total * 100, 1) if c.total else 0,
            }
            for c in celulas
        ],
    }


@router.get("/admin/regenerar-inicio")
async def regenerar_inicio_diario(
    fecha: Optional[str] = Query(default=None, description="Fecha YYYY-MM-DD (omitir = hoy)"),
    key: Optional[str] = Query(default=None, description="Clave de administración (alternativa al JWT)"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Borra los registros de inicio del día indicado (o de hoy) y los recalcula
    con las reglas actuales (sin Almacén, umbral 07:00).
    Accesible con rol 'admin' (JWT) o con ?key=<ADMIN_SECRET_KEY>.
    """
    import asyncio
    from fastapi import HTTPException
    from sqlalchemy import delete as sa_delete
    from app.models.snapshot import RegistroInicioDiario
    from app.services.datos_service import obtener_hora_inicio_tecnicos
    from app.services.cache_service import get_cached_datos

    ADMIN_KEY = getattr(settings, "ADMIN_SECRET_KEY", "tecnicos-admin-2026")
    autorizado = (key and key == ADMIN_KEY) or (current_user and current_user.role == "admin")
    if not autorizado:
        raise HTTPException(status_code=403, detail="Acceso denegado. Usa ?key=<ADMIN_SECRET_KEY> o inicia sesión como admin.")

    from sqlalchemy import update as sa_update

    now = _tz_now()
    fecha_str = fecha if fecha else now.strftime("%Y-%m-%d")
    es_hoy = fecha_str == now.strftime("%Y-%m-%d")

    # ── Intento 1: MySQL (funciona para hoy; días anteriores pueden no tener datos) ──
    loop = asyncio.get_event_loop()
    registros_mysql = []
    try:
        registros_mysql = await loop.run_in_executor(
            None, lambda: obtener_hora_inicio_tecnicos(fecha=fecha_str)
        )
    except Exception as exc:
        registros_mysql = []

    if registros_mysql:
        # Borrar y reinsertar desde MySQL (datos frescos)
        await db.execute(
            sa_delete(RegistroInicioDiario).where(RegistroInicioDiario.fecha == fecha_str)
        )
        await db.commit()

        # Obtener zonas desde el mapa de nodos (Excel) — misma fuente que el dashboard
        from app.services.zonas_service import get_zona_map as _get_zona_map
        nodo_zona = _get_zona_map()

        # Fallback: mapa técnico→zona desde la caché del día actual
        tec_zona: dict = {}
        cached = get_cached_datos()
        if cached:
            for d in cached.get("datos", []):
                tec = d.get("Técnico") or d.get("técnico") or ""
                nodo = str(d.get("nodo") or "").strip()
                if tec and not tec_zona.get(tec):
                    zona_from_nodo = nodo_zona.get(nodo) if nodo else None
                    tec_zona[tec] = {
                        "celula":     (zona_from_nodo or {}).get("celula")     or d.get("celula", "Sin clasificar") or "Sin clasificar",
                        "microcelda": (zona_from_nodo or {}).get("microcelda") or d.get("microcelda", "Sin clasificar") or "Sin clasificar",
                    }

        insertados = 0
        for reg in registros_mysql:
            tec  = reg["tecnico"]
            nodo = reg.get("nodo", "")
            # 1) por nodo directo del registro histórico
            zona = nodo_zona.get(nodo) if nodo else None
            # 2) por zona habitual del técnico (hoy)
            if not zona or zona.get("celula") == "Sin clasificar":
                zona = tec_zona.get(tec)
            # 3) fallback
            if not zona:
                zona = {"celula": "Sin clasificar", "microcelda": "Sin clasificar"}

            db.add(RegistroInicioDiario(
                fecha       = fecha_str,
                tecnico     = tec,
                celula      = zona["celula"],
                microcelda  = zona["microcelda"],
                hora_inicio = reg["hora_inicio"],
                a_tiempo    = reg["a_tiempo"],
            ))
            insertados += 1
        await db.commit()
        return {
            "ok": True, "fecha": fecha_str, "fuente": "mysql",
            "insertados": insertados,
            "msg": f"{insertados} técnicos procesados desde MySQL con umbral 07:00 y sin Almacén.",
        }

    # ── Intento 2: recalcular a_tiempo desde SQLite (para días anteriores) ──
    # MySQL ya no tiene esos datos, pero SQLite sí guarda hora_inicio.
    # Solo actualizamos a_tiempo con el nuevo umbral (07:00).
    result = await db.execute(
        select(RegistroInicioDiario).where(RegistroInicioDiario.fecha == fecha_str)
    )
    existentes = result.scalars().all()

    if not existentes:
        return {
            "ok": False, "fecha": fecha_str, "insertados": 0,
            "msg": f"No hay registros en SQLite para {fecha_str} y MySQL tampoco devolvió datos. No es posible regenerar.",
        }

    actualizados = 0
    for rec in existentes:
        nuevo_a_tiempo = rec.hora_inicio <= "07:00" if rec.hora_inicio else False
        if rec.a_tiempo != nuevo_a_tiempo:
            rec.a_tiempo = nuevo_a_tiempo
            actualizados += 1

    await db.commit()
    return {
        "ok": True, "fecha": fecha_str, "fuente": "sqlite_recalculo",
        "total": len(existentes),
        "actualizados": actualizados,
        "msg": f"MySQL sin datos históricos para {fecha_str}. Se recalculó a_tiempo en {actualizados} de {len(existentes)} registros existentes usando umbral 07:00.",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Admin: gestión de snapshots
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/admin/snapshots")
async def admin_list_snapshots(
    limit: int = Query(default=100, ge=1, le=500),
    key: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Lista los últimos N snapshots globales con su desglose por célula.
    Accesible con rol 'admin' (JWT) o ?key=<ADMIN_SECRET_KEY>.
    """
    from fastapi import HTTPException

    ADMIN_KEY = getattr(settings, "ADMIN_SECRET_KEY", "tecnicos-admin-2026")
    autorizado = (key and key == ADMIN_KEY) or (current_user and current_user.role == "admin")
    if not autorizado:
        raise HTTPException(status_code=403, detail="Acceso denegado.")

    result = await db.execute(
        select(SnapshotGlobal)
        .order_by(SnapshotGlobal.captured_at.desc())
        .limit(limit)
    )
    snaps = result.scalars().all()

    # Cargar célula-level counts para cada snapshot
    snap_ids = [s.id for s in snaps]
    celulas_result = await db.execute(
        select(SnapshotCelula).where(SnapshotCelula.snapshot_id.in_(snap_ids))
    )
    celulas_rows = celulas_result.scalars().all()

    # Agrupar célula rows por snapshot_id
    from collections import defaultdict
    cel_by_snap: dict = defaultdict(list)
    for c in celulas_rows:
        cel_by_snap[c.snapshot_id].append({
            "celula":          c.celula,
            "total":           c.total,
            "con_retraso":     c.con_retraso,
            "con_parada":      c.con_parada,
            "cumplimiento_pct": round(c.cumplimiento_pct, 1),
        })

    return {
        "total": len(snaps),
        "snapshots": [
            {
                "id":              s.id,
                "captured_at":     s.captured_at.strftime("%Y-%m-%d %H:%M:%S"),
                "total":           s.total,
                "con_retraso":     s.con_retraso,
                "con_parada":      s.con_parada,
                "cumplimiento_pct": round(s.cumplimiento_pct, 1),
                "pct_retraso":     round(s.con_retraso / s.total * 100, 1) if s.total else 0,
                "celulas":         cel_by_snap.get(s.id, []),
            }
            for s in snaps
        ],
    }


@router.delete("/admin/snapshots/{snapshot_id}")
async def admin_delete_snapshot(
    snapshot_id: int,
    key: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Elimina un snapshot global (y sus registros de célula/microcelda en cascada).
    Accesible con rol 'admin' (JWT) o ?key=<ADMIN_SECRET_KEY>.
    """
    from fastapi import HTTPException

    ADMIN_KEY = getattr(settings, "ADMIN_SECRET_KEY", "tecnicos-admin-2026")
    autorizado = (key and key == ADMIN_KEY) or (current_user and current_user.role == "admin")
    if not autorizado:
        raise HTTPException(status_code=403, detail="Acceso denegado.")

    result = await db.execute(select(SnapshotGlobal).where(SnapshotGlobal.id == snapshot_id))
    snap = result.scalar_one_or_none()
    if not snap:
        raise HTTPException(status_code=404, detail=f"Snapshot {snapshot_id} no encontrado.")

    captured_at_str = snap.captured_at.strftime("%Y-%m-%d %H:%M:%S")
    await db.delete(snap)
    await db.commit()

    return {
        "ok": True,
        "deleted_id":  snapshot_id,
        "captured_at": captured_at_str,
        "msg": f"Snapshot {snapshot_id} ({captured_at_str}) eliminado correctamente.",
    }
