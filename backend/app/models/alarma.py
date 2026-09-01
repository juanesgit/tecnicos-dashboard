from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Integer, Boolean, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

SLA_MAP = {
    "leve":     45,
    "moderada": 20,
    "critica":  10,
}

# Estados válidos de alarma
# abierta          → alarma activa asignada a supervisor
# en_gestion       → técnico ya no está retrasado, esperando documentación del supervisor
# cerrada_gestionada   → supervisor documentó causa + notas antes del timeout
# cerrada_sin_gestion  → timeout expiró sin documentación (auto-cierre)
# cerrada          → cierre manual o fin de operación
ESTADOS_ALARMA = {"abierta", "en_gestion", "cerrada_gestionada", "cerrada_sin_gestion", "cerrada"}


class CausaRetraso(Base):
    """Causas configurables de retraso — admin las gestiona, supervisores las eligen al cerrar."""
    __tablename__ = "causas_retraso"

    id:          Mapped[int]           = mapped_column(primary_key=True)
    nombre:      Mapped[str]           = mapped_column(String(120), nullable=False, unique=True)
    descripcion: Mapped[Optional[str]] = mapped_column(Text,        nullable=True)
    activa:      Mapped[bool]          = mapped_column(Boolean,     nullable=False, default=True, server_default="1")


class Alarma(Base):
    __tablename__ = "alarmas"

    id:                     Mapped[int]              = mapped_column(primary_key=True)
    tecnico:                Mapped[str]              = mapped_column(String(120), nullable=False, index=True)
    celula:                 Mapped[str]              = mapped_column(String(50),  nullable=False)
    microcelda:             Mapped[str]              = mapped_column(String(80),  nullable=False)
    ciudad:                 Mapped[Optional[str]]    = mapped_column(String(80),  nullable=True)
    tipo_retraso:           Mapped[Optional[str]]    = mapped_column(String(40),  nullable=True)   # "Retraso actual" | "Retraso en siguiente"
    minutos_retraso_inicio: Mapped[Optional[int]]   = mapped_column(Integer,     nullable=True)   # retraso al crear la alarma
    actividad:              Mapped[Optional[str]]    = mapped_column(String(120), nullable=True)   # tipo de actividad OT actual
    ot:                     Mapped[Optional[str]]    = mapped_column(String(80),  nullable=True)   # número/código OT actual
    nivel:                  Mapped[str]              = mapped_column(String(20),  nullable=False, default="leve")
    estado:                 Mapped[str]              = mapped_column(String(20),  nullable=False, default="abierta", index=True)
    asignado_a:             Mapped[Optional[int]]    = mapped_column(Integer,     nullable=True, index=True)
    asignado_nombre:        Mapped[str]              = mapped_column(String(120), nullable=False, default="Sin asignar")
    fecha_creacion:         Mapped[datetime]         = mapped_column(DateTime,    nullable=False, index=True)
    fecha_cierre:           Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    tiempo_resolucion_min:  Mapped[Optional[int]]   = mapped_column(Integer,     nullable=True)
    notas:                  Mapped[Optional[str]]   = mapped_column(Text,        nullable=True)
    sla_cumplido:           Mapped[Optional[bool]]  = mapped_column(Boolean,     nullable=True)
    # ── Campos de gestión (Opción B) ─────────────────────────────────────────
    fecha_en_gestion:  Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)   # cuando entró a en_gestion
    causa_id:          Mapped[Optional[int]]      = mapped_column(Integer,  ForeignKey("causas_retraso.id"), nullable=True)
    notas_gestion:     Mapped[Optional[str]]      = mapped_column(Text,     nullable=True)
    gestionada_por:    Mapped[Optional[int]]      = mapped_column(Integer,  nullable=True)   # user_id del supervisor
    fecha_gestion:     Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)   # cuando el supervisor documentó


class AlarmaEvento(Base):
    __tablename__ = "alarma_eventos"

    id:             Mapped[int]           = mapped_column(primary_key=True)
    alarma_id:      Mapped[int]           = mapped_column(Integer, ForeignKey("alarmas.id"), nullable=False, index=True)
    tipo:           Mapped[str]           = mapped_column(String(30), nullable=False)
    nivel_anterior: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    nivel_nuevo:    Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    user_id:        Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    descripcion:    Mapped[Optional[str]] = mapped_column(Text,     nullable=True)
    ts:             Mapped[datetime]      = mapped_column(DateTime, nullable=False)
