from datetime import datetime
from sqlalchemy import String, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ActividadUsuario(Base):
    __tablename__ = "actividad_usuarios"

    id:        Mapped[int]      = mapped_column(primary_key=True)
    user_id:   Mapped[int]      = mapped_column(Integer, nullable=False, index=True)
    username:  Mapped[str]      = mapped_column(String(60),  nullable=False)
    full_name: Mapped[str]      = mapped_column(String(120), nullable=False)
    role:      Mapped[str]      = mapped_column(String(30),  nullable=False)
    # Eventos: login | tab_dashboard | tab_avance | tab_historico | tab_productividad | tab_admin | datos
    evento:    Mapped[str]      = mapped_column(String(50),  nullable=False)
    ts:        Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
