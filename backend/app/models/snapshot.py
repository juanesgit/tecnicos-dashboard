"""Modelos para snapshots históricos de técnicos."""
from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, Boolean, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class SnapshotGlobal(Base):
    __tablename__ = "snapshot_global"

    id:               Mapped[int]      = mapped_column(primary_key=True)
    captured_at:      Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    total:            Mapped[int]      = mapped_column(Integer, nullable=False, default=0)
    con_retraso:      Mapped[int]      = mapped_column(Integer, nullable=False, default=0)
    con_parada:       Mapped[int]      = mapped_column(Integer, nullable=False, default=0)
    cumplimiento_pct: Mapped[float]    = mapped_column(Float, nullable=False, default=0.0)

    celulas: Mapped[list["SnapshotCelula"]] = relationship(
        "SnapshotCelula", back_populates="snapshot", cascade="all, delete-orphan"
    )
    microceldas: Mapped[list["SnapshotMicrocelda"]] = relationship(
        "SnapshotMicrocelda", back_populates="snapshot", cascade="all, delete-orphan"
    )
    ciudades: Mapped[list["SnapshotCiudad"]] = relationship(
        "SnapshotCiudad", back_populates="snapshot", cascade="all, delete-orphan"
    )


class SnapshotCelula(Base):
    __tablename__ = "snapshot_celula"

    id:               Mapped[int]      = mapped_column(primary_key=True)
    snapshot_id:      Mapped[int]      = mapped_column(ForeignKey("snapshot_global.id"), nullable=False, index=True)
    celula:           Mapped[str]      = mapped_column(String(50), nullable=False)
    total:            Mapped[int]      = mapped_column(Integer, nullable=False, default=0)
    con_retraso:      Mapped[int]      = mapped_column(Integer, nullable=False, default=0)
    con_parada:       Mapped[int]      = mapped_column(Integer, nullable=False, default=0)
    cumplimiento_pct: Mapped[float]    = mapped_column(Float, nullable=False, default=0.0)

    snapshot: Mapped["SnapshotGlobal"] = relationship("SnapshotGlobal", back_populates="celulas")


class SnapshotMicrocelda(Base):
    __tablename__ = "snapshot_microcelda"

    id:               Mapped[int]   = mapped_column(primary_key=True)
    snapshot_id:      Mapped[int]   = mapped_column(ForeignKey("snapshot_global.id"), nullable=False, index=True)
    celula:           Mapped[str]   = mapped_column(String(50), nullable=False)
    microcelda:       Mapped[str]   = mapped_column(String(80), nullable=False)
    total:            Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    con_retraso:      Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    con_parada:       Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    cumplimiento_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    en_riesgo:        Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    # Avance OT — conteo de estados de OT por microcelda (snapshot cada 5 min)
    ot_completado:    Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    ot_no_completado: Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    ot_iniciado:      Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    ot_pendiente:     Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    ot_suspendido:    Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    ot_total:         Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    ot_pct_avance:    Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    snapshot: Mapped["SnapshotGlobal"] = relationship("SnapshotGlobal", back_populates="microceldas")


class SnapshotCiudad(Base):
    """Snapshot por ciudad — agrupa todos los técnicos cuyo nodo pertenece a esa ciudad."""
    __tablename__ = "snapshot_ciudad"

    id:               Mapped[int]   = mapped_column(primary_key=True)
    snapshot_id:      Mapped[int]   = mapped_column(ForeignKey("snapshot_global.id"), nullable=False, index=True)
    ciudad:           Mapped[str]   = mapped_column(String(100), nullable=False)
    celula:           Mapped[str]   = mapped_column(String(50),  nullable=False)
    microcelda:       Mapped[str]   = mapped_column(String(80),  nullable=False)  # microcelda a la que pertenece
    total:            Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    con_retraso:      Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    con_parada:       Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    cumplimiento_pct: Mapped[float] = mapped_column(Float,   nullable=False, default=0.0)
    en_riesgo:        Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    # Avance OT — conteo exacto de estados de OT para esta ciudad (capturado desde _calcular_avance)
    ot_completado:    Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    ot_no_completado: Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    ot_iniciado:      Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    ot_pendiente:     Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    ot_suspendido:    Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    ot_total:         Mapped[int]   = mapped_column(Integer, nullable=False, default=0)
    ot_pct_avance:    Mapped[float] = mapped_column(Float,   nullable=False, default=0.0)

    snapshot: Mapped["SnapshotGlobal"] = relationship("SnapshotGlobal", back_populates="ciudades")


class RegistroInicioDiario(Base):
    """Registro de la primera actividad iniciada de cada técnico por día."""
    __tablename__ = "registro_inicio_diario"

    id:         Mapped[int]  = mapped_column(primary_key=True)
    fecha:      Mapped[str]  = mapped_column(String(10), nullable=False, index=True)   # YYYY-MM-DD
    tecnico:    Mapped[str]  = mapped_column(String(120), nullable=False, index=True)
    celula:     Mapped[str]  = mapped_column(String(50), nullable=False)
    microcelda: Mapped[str]  = mapped_column(String(80), nullable=False)
    # HH:MM en hora local (Colombia UTC-5)
    hora_inicio: Mapped[str] = mapped_column(String(5), nullable=False)
    # True si hora_inicio <= "07:30"
    a_tiempo:   Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class ZonaDistritoConfig(Base):
    """Override editable de la asignación distrito → (célula, microcelda).

    Si un distrito_id tiene fila aquí, prevalece sobre el mapa hardcoded
    en zonas_service._DISTRITO_MAP. Vacío = sin overrides (se usa mapa base).
    """
    __tablename__ = "zona_distrito_config"

    id:          Mapped[int]                = mapped_column(primary_key=True)
    distrito_id: Mapped[str]                = mapped_column(String(20), unique=True, nullable=False, index=True)
    celula:      Mapped[str]                = mapped_column(String(50), nullable=False)
    microcelda:  Mapped[str]                = mapped_column(String(80), nullable=False)
    descripcion: Mapped[Optional[str]]      = mapped_column(String(200), nullable=True)
    updated_at:  Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
