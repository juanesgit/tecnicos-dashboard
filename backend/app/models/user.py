from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(256), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="supervisor_microcelda")
    celula: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    microcelda: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    # Lista de microceldas (JSON). Tiene prioridad sobre el campo legacy `microcelda`.
    microceldas: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    @property
    def microcelda_list(self) -> list:
        """Lista efectiva de microceldas. Usa `microceldas` (JSON) si existe, o `microcelda` como fallback."""
        if self.microceldas:
            return list(self.microceldas)
        if self.microcelda:
            return [self.microcelda]
        return []
