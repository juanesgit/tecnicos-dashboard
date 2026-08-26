from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # Seguridad JWT
    SECRET_KEY: str = "cambia_esto_por_una_clave_segura_en_produccion"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 horas

    # App
    APP_VERSION: str = "20250821-01"
    APP_TIMEZONE: str = "America/Bogota"

    # SQLite (usuarios y suscripciones push)
    DATABASE_URL: str = f"sqlite+aiosqlite:///{BASE_DIR}/tecnicos.db"

    # MySQL (datos operacionales — wf_futuro_pruebas)
    DB_HOST: str = "10.108.34.32"
    DB_PORT: int = 33063
    DB_NAME: str = "ccot"
    DB_USER: str = "ccot"
    DB_PASSWORD: str = "ccot"
    DB_CHARSET: str = "utf8mb4"

    # Caché en memoria para /api/datos (segundos)
    CACHE_DATOS_TIMEOUT: int = 600

    # Admin inicial (se crea automáticamente si no existe)
    ADMIN_USERNAME: str = ""
    ADMIN_PASSWORD: str = ""

    # Web Push VAPID
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_CLAIMS_EMAIL: str = "admin@tecnicos-dashboard.local"

    # API Key para el bot de Telegram (sin sesión)
    API_BOT_KEY: str = ""

    # ── Alertas push ────────────────────────────────────────────────────────
    # % de técnicos con retraso que dispara alerta global (0 = desactivado)
    ALERT_PCT_RETRASO_GLOBAL: int = 20
    # % de técnicos con retraso en una célula que dispara alerta de célula (0 = desactivado)
    ALERT_PCT_RETRASO_CELULA: int = 30
    # Incremento absoluto de retrasos entre dos snapshots consecutivos (0 = desactivado)
    ALERT_SPIKE_RETRASO: int = 10
    # % mínimo de cumplimiento antes de alerta global (0 = desactivado)
    ALERT_CUMPLIMIENTO_MIN: float = 70.0
    # Minutos de silencio entre alertas del mismo tipo (cooldown)
    ALERT_COOLDOWN_MIN: int = 30

    # Ruta al Excel de nodos (actualizable semanalmente)
    NODOS_EXCEL_PATH: str = "Nodos.xlsx"

    class Config:
        env_file = ".env"


settings = Settings()
