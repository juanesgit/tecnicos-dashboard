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


class Alarma(Base):
    __tablename__ = "alarmas"

    id:                     Mapped[int]              = mapped_column(primary_key=True)
    tecnico:                Mapped[str]              = mapped_column(String(120), nullable=False, index=True)
    celula:                 Mapped[str]              = mapped_column(String(50),  nullable=False)
    microcelda:             Mapped[str]              = mapped_column(String(80),  nullable=False)
    ciudad:                 Mapped[Optional[str]]    = mapped_column(String(80),  nullable=True)
    tipo_retraso:           Mapped[Optional[str]]    = mapped_column(String(40),  nullable=True)   # "Retraso actual" | "Retraso en siguiente"
    minutos_retraso_inicio: Mapped[Optional[int]]   = mapped_column(Integer,     nullable=True)   # retraso al crear la alarma
    nivel:                  Mapped[str]              = mapped_column(String(20),  nullable=False, default="leve")
    estado:                 Mapped[str]              = mapped_column(String(20),  nullable=False, default="abierta", index=True)
    asignado_a:             Mapped[int]              = mapped_column(Integer,     nullable=False, index=True)
    asignado_nombre:        Mapped[str]              = mapped_column(String(120), nullable=False)
    fecha_creacion:         Mapped[datetime]         = mapped_column(DateTime,    nullable=False, index=True)
    fecha_cierre:           Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    tiempo_resolucion_min:  Mapped[Optional[int]]   = mapped_column(Integer,     nullable=True)
    notas:                  Mapped[Optional[str]]   = mapped_column(Text,        nullable=True)
    sla_cumplido:           Mapped[Optional[bool]]  = mapped_column(Boolean,     nullable=True)


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
