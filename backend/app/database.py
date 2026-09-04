from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        from app.models import user, push_subscription, snapshot, actividad, alarma, alarma  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)

    await _migrate_users()
    await _seed_admin()


async def _migrate_users():
    """Aplica migraciones incrementales a la tabla users (try/except por columna)."""
    from sqlalchemy import text
    migrations = [
        "ALTER TABLE users ADD COLUMN celula VARCHAR(50)",
        "ALTER TABLE users ADD COLUMN microcelda VARCHAR(80)",
        "ALTER TABLE users ADD COLUMN microceldas TEXT",
        "ALTER TABLE users ADD COLUMN celulas TEXT",
        "ALTER TABLE snapshot_microcelda ADD COLUMN en_riesgo INTEGER NOT NULL DEFAULT 0",
        """CREATE TABLE IF NOT EXISTS registro_inicio_diario (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha VARCHAR(10) NOT NULL,
            tecnico VARCHAR(120) NOT NULL,
            celula VARCHAR(50) NOT NULL,
            microcelda VARCHAR(80) NOT NULL,
            hora_inicio VARCHAR(5) NOT NULL,
            a_tiempo INTEGER NOT NULL DEFAULT 0
        )""",
        "CREATE INDEX IF NOT EXISTS ix_rid_fecha ON registro_inicio_diario(fecha)",
        "CREATE INDEX IF NOT EXISTS ix_rid_tecnico ON registro_inicio_diario(tecnico)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_rid_fecha_tecnico ON registro_inicio_diario(fecha, tecnico)",
        # OT exacto por ciudad en snapshot_ciudad
        "ALTER TABLE snapshot_ciudad ADD COLUMN ot_completado INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE snapshot_ciudad ADD COLUMN ot_no_completado INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE snapshot_ciudad ADD COLUMN ot_iniciado INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE snapshot_ciudad ADD COLUMN ot_pendiente INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE snapshot_ciudad ADD COLUMN ot_suspendido INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE snapshot_ciudad ADD COLUMN ot_total INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE snapshot_ciudad ADD COLUMN ot_pct_avance REAL NOT NULL DEFAULT 0.0",
        # Tabla de actividad / adherencia
        """CREATE TABLE IF NOT EXISTS actividad_usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            username VARCHAR(60) NOT NULL,
            full_name VARCHAR(120) NOT NULL,
            role VARCHAR(30) NOT NULL,
            evento VARCHAR(50) NOT NULL,
            ts DATETIME NOT NULL
        )""",
        "CREATE INDEX IF NOT EXISTS ix_actividad_user_id ON actividad_usuarios(user_id)",
        "CREATE INDEX IF NOT EXISTS ix_actividad_ts ON actividad_usuarios(ts)",
        # Tablas de alarmas
        """CREATE TABLE IF NOT EXISTS alarmas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tecnico VARCHAR(120) NOT NULL,
            celula VARCHAR(50) NOT NULL,
            microcelda VARCHAR(80) NOT NULL,
            nivel VARCHAR(20) NOT NULL DEFAULT 'leve',
            estado VARCHAR(20) NOT NULL DEFAULT 'abierta',
            asignado_a INTEGER NOT NULL,
            asignado_nombre VARCHAR(120) NOT NULL,
            fecha_creacion DATETIME NOT NULL,
            fecha_cierre DATETIME,
            tiempo_resolucion_min INTEGER,
            notas TEXT,
            sla_cumplido INTEGER
        )""",
        "CREATE INDEX IF NOT EXISTS ix_alarmas_tecnico ON alarmas(tecnico)",
        "CREATE INDEX IF NOT EXISTS ix_alarmas_estado ON alarmas(estado)",
        "CREATE INDEX IF NOT EXISTS ix_alarmas_asignado_a ON alarmas(asignado_a)",
        "CREATE INDEX IF NOT EXISTS ix_alarmas_fecha_creacion ON alarmas(fecha_creacion)",
        """CREATE TABLE IF NOT EXISTS alarma_eventos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alarma_id INTEGER NOT NULL REFERENCES alarmas(id),
            tipo VARCHAR(30) NOT NULL,
            nivel_anterior VARCHAR(20),
            nivel_nuevo VARCHAR(20),
            user_id INTEGER,
            descripcion TEXT,
            ts DATETIME NOT NULL
        )""",
        "CREATE INDEX IF NOT EXISTS ix_alarma_eventos_alarma_id ON alarma_eventos(alarma_id)",
        # Columnas extra en alarmas (ciudad, tipo_retraso, minutos_retraso_inicio)
        "ALTER TABLE alarmas ADD COLUMN ciudad VARCHAR(80)",
        "ALTER TABLE alarmas ADD COLUMN tipo_retraso VARCHAR(40)",
        "ALTER TABLE alarmas ADD COLUMN minutos_retraso_inicio INTEGER",
        "ALTER TABLE alarmas ADD COLUMN actividad VARCHAR(120)",
        "ALTER TABLE alarmas ADD COLUMN ot VARCHAR(80)",
        # last_login en users para tier de asignación de alarmas
        "ALTER TABLE users ADD COLUMN last_login DATETIME",
        # disponible: indica si el técnico/supervisor está disponible para recibir alarmas
        "ALTER TABLE users ADD COLUMN disponible INTEGER NOT NULL DEFAULT 0",
    ]
    async with engine.begin() as conn:
        for sql in migrations:
            try:
                await conn.execute(text(sql))
            except Exception:
                pass  # columna ya existe

        # Renombrar roles legacy → nuevos nombres
        await conn.execute(text(
            "UPDATE users SET role = 'lider_celula' WHERE role = 'supervisor_celula'"
        ))
        await conn.execute(text(
            "UPDATE users SET role = 'supervisor_microcelda' WHERE role = 'coordinador'"
        ))

        # Crear tabla snapshot_microcelda si no existe
        import logging as _logging
        _logger = _logging.getLogger(__name__)
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS snapshot_microcelda (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    snapshot_id INTEGER NOT NULL REFERENCES snapshot_global(id),
                    celula VARCHAR(50) NOT NULL,
                    microcelda VARCHAR(80) NOT NULL,
                    total INTEGER NOT NULL DEFAULT 0,
                    con_retraso INTEGER NOT NULL DEFAULT 0,
                    con_parada INTEGER NOT NULL DEFAULT 0,
                    cumplimiento_pct REAL NOT NULL DEFAULT 0.0
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_snapshot_microcelda_snapshot_id ON snapshot_microcelda(snapshot_id)"))
            await conn.commit()
        except Exception as e:
            _logger.warning("Migración snapshot_microcelda: %s", e)


async def _seed_admin():
    from app.config import settings
    from app.models.user import User
    from app.services.auth import hash_password
    from sqlalchemy import select

    if not settings.ADMIN_USERNAME or not settings.ADMIN_PASSWORD:
        return

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.username == settings.ADMIN_USERNAME)
        )
        if result.scalar_one_or_none():
            return

        admin = User(
            username=settings.ADMIN_USERNAME,
            full_name="Administrador",
            hashed_password=hash_password(settings.ADMIN_PASSWORD),
            role="admin",
            is_active=True,
        )
        session.add(admin)
        await session.commit()
        import logging
        logging.getLogger(__name__).info("Admin creado: %s", settings.ADMIN_USERNAME)
