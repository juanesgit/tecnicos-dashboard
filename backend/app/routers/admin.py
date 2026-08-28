"""Panel de administración: snapshots, zonas y carga de Excel. Solo admin."""
from __future__ import annotations
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import pytz
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Body
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.snapshot import SnapshotGlobal, ZonaDistritoConfig
from app.models.user import User
from app.services.auth import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])


def _only_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    return current_user


# ─────────────────────────────────────────────────────────────────────────────
#  MONITOR DE SNAPSHOTS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/snapshots")
async def list_snapshots(
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_only_admin),
):
    """Lista los últimos N snapshots globales para el monitor."""
    result = await db.execute(
        select(SnapshotGlobal)
        .order_by(SnapshotGlobal.captured_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return {
        "total": len(rows),
        "snapshots": [
            {
                "id":               r.id,
                "captured_at":      r.captured_at.strftime("%Y-%m-%d %H:%M"),
                "total":            r.total,
                "con_retraso":      r.con_retraso,
                "con_parada":       r.con_parada,
                "cumplimiento_pct": r.cumplimiento_pct,
                "pct_retraso":      round(r.con_retraso / r.total * 100, 1) if r.total else 0,
            }
            for r in rows
        ],
    }


@router.get("/snapshots/stats")
async def snapshot_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_only_admin),
):
    """Estadísticas de snapshots almacenados: conteo, primer y último registro."""
    total_result = await db.execute(select(func.count(SnapshotGlobal.id)))
    total = total_result.scalar() or 0

    primero_result = await db.execute(
        select(SnapshotGlobal.captured_at).order_by(SnapshotGlobal.captured_at.asc()).limit(1)
    )
    primero = primero_result.scalar_one_or_none()

    ultimo_result = await db.execute(
        select(SnapshotGlobal.captured_at).order_by(SnapshotGlobal.captured_at.desc()).limit(1)
    )
    ultimo = ultimo_result.scalar_one_or_none()

    return {
        "total_snapshots":  total,
        "primer_snapshot":  primero.strftime("%Y-%m-%d %H:%M") if primero else None,
        "ultimo_snapshot":  ultimo.strftime("%Y-%m-%d %H:%M") if ultimo else None,
    }


@router.delete("/snapshots/purge")
async def purge_snapshots(
    dias: int = Query(default=7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_only_admin),
):
    """Elimina snapshots más antiguos que N días (cascada a celulas, microceldas, ciudades)."""
    tz    = pytz.timezone(settings.APP_TIMEZONE)
    corte = datetime.now(tz).replace(tzinfo=None) - timedelta(days=dias)
    # SQLAlchemy cascade borrará los child rows por la relación
    result = await db.execute(
        delete(SnapshotGlobal).where(SnapshotGlobal.captured_at < corte)
    )
    await db.commit()
    return {"eliminados": result.rowcount, "corte": corte.strftime("%Y-%m-%d %H:%M")}


# ─────────────────────────────────────────────────────────────────────────────
#  GESTIÓN DE ZONAS (distrito → célula / microcelda)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/zonas")
async def get_zonas(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_only_admin),
):
    """Devuelve todos los distritos con su asignación actual (BD > hardcoded)."""
    from app.services.zonas_service import _DISTRITO_MAP

    result = await db.execute(
        select(ZonaDistritoConfig).order_by(ZonaDistritoConfig.distrito_id)
    )
    db_rows = {r.distrito_id: r for r in result.scalars().all()}

    # Unión: hardcoded + overrides de BD
    merged: dict = {}
    for did, (cel, mc) in _DISTRITO_MAP.items():
        if did in db_rows:
            row = db_rows[did]
            merged[did] = {
                "celula":       row.celula,
                "microcelda":   row.microcelda,
                "descripcion":  row.descripcion,
                "sobreescrito": True,
                "updated_at":   row.updated_at.strftime("%Y-%m-%d %H:%M") if row.updated_at else None,
            }
        else:
            merged[did] = {
                "celula":       cel,
                "microcelda":   mc,
                "descripcion":  None,
                "sobreescrito": False,
                "updated_at":   None,
            }

    # Distritos solo en BD (no estaban en el mapa base)
    for did, row in db_rows.items():
        if did not in merged:
            merged[did] = {
                "celula":       row.celula,
                "microcelda":   row.microcelda,
                "descripcion":  row.descripcion,
                "sobreescrito": True,
                "updated_at":   row.updated_at.strftime("%Y-%m-%d %H:%M") if row.updated_at else None,
            }

    return {
        "total": len(merged),
        "zonas": [
            {"distrito_id": did, **info}
            for did, info in sorted(merged.items())
        ],
    }


@router.put("/zonas/{distrito_id}")
async def update_zona(
    distrito_id: str,
    data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_only_admin),
):
    """Crea o actualiza el override de BD para un distrito."""
    celula     = (data.get("celula")     or "").strip()
    microcelda = (data.get("microcelda") or "").strip()
    descripcion = (data.get("descripcion") or "").strip() or None

    if not celula or not microcelda:
        raise HTTPException(status_code=422, detail="celula y microcelda son requeridos")

    result = await db.execute(
        select(ZonaDistritoConfig).where(ZonaDistritoConfig.distrito_id == distrito_id)
    )
    row = result.scalar_one_or_none()

    now = datetime.utcnow()
    if row:
        row.celula      = celula
        row.microcelda  = microcelda
        row.descripcion = descripcion
        row.updated_at  = now
    else:
        db.add(ZonaDistritoConfig(
            distrito_id = distrito_id,
            celula      = celula,
            microcelda  = microcelda,
            descripcion = descripcion,
            updated_at  = now,
        ))

    await db.commit()

    # Recargar el mapa de zonas en memoria para que el cambio surta efecto
    import asyncio
    from app.services.zonas_service import reload_zonas
    await asyncio.get_event_loop().run_in_executor(None, reload_zonas)

    return {
        "ok":          True,
        "distrito_id": distrito_id,
        "celula":      celula,
        "microcelda":  microcelda,
    }


@router.delete("/zonas/{distrito_id}")
async def delete_zona_override(
    distrito_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_only_admin),
):
    """Elimina el override de BD para un distrito (vuelve al valor hardcoded)."""
    result = await db.execute(
        select(ZonaDistritoConfig).where(ZonaDistritoConfig.distrito_id == distrito_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="No existe override para este distrito")

    await db.delete(row)
    await db.commit()

    import asyncio
    from app.services.zonas_service import reload_zonas
    await asyncio.get_event_loop().run_in_executor(None, reload_zonas)

    return {"ok": True, "distrito_id": distrito_id}


# ─────────────────────────────────────────────────────────────────────────────
#  CARGA DE EXCEL
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_excel_path() -> Path:
    """Resuelve la ruta absoluta del Excel de nodos."""
    p = Path(settings.NODOS_EXCEL_PATH)
    if not p.is_absolute():
        p = Path(__file__).resolve().parent.parent.parent / settings.NODOS_EXCEL_PATH
    return p


@router.get("/excel-info")
async def excel_info(_: User = Depends(_only_admin)):
    """Información del Excel de nodos actualmente en uso."""
    from app.services.zonas_service import get_zona_map
    excel_path = _resolve_excel_path()
    zm = get_zona_map()

    stat = None
    if excel_path.exists():
        stat = excel_path.stat()

    return {
        "excel_path":    str(excel_path),
        "excel_exists":  excel_path.exists(),
        "excel_size_kb": round(stat.st_size / 1024, 1) if stat else None,
        "excel_mtime":   datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M") if stat else None,
        "nodos_cargados": len(zm),
        "backup_exists": excel_path.with_suffix(".xlsx.bak").exists(),
    }


@router.post("/upload-excel")
async def upload_excel(
    file: UploadFile = File(...),
    _: User = Depends(_only_admin),
):
    """Sube un nuevo Nodos.xlsx, lo guarda y recarga el mapa de zonas."""
    fname = file.filename or ""
    if not fname.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=422, detail="Solo se aceptan archivos .xlsx o .xls")

    excel_path = _resolve_excel_path()

    # Backup del archivo anterior
    if excel_path.exists():
        backup = excel_path.with_suffix(".xlsx.bak")
        shutil.copy2(excel_path, backup)

    # Guardar nuevo archivo
    content = await file.read()
    excel_path.parent.mkdir(parents=True, exist_ok=True)
    excel_path.write_bytes(content)

    # Recargar mapa en memoria
    import asyncio
    from app.services.zonas_service import reload_zonas
    nodos = await asyncio.get_event_loop().run_in_executor(None, reload_zonas)

    return {
        "ok":             True,
        "filename":       fname,
        "bytes":          len(content),
        "nodos_cargados": nodos,
    }
