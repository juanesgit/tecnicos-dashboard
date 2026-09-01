"""
Migración: hace asignado_a nullable en la tabla alarmas.
SQLite no soporta ALTER COLUMN, se usa el patrón rename-create-copy-drop.
"""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "tecnicos.db")


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    cur = conn.cursor()

    # Verificar si ya es nullable (si asignado_a ya acepta NULL, no hacer nada)
    cur.execute("PRAGMA table_info(alarmas)")
    cols = {row[1]: row[3] for row in cur.fetchall()}  # name: notnull
    if cols.get("asignado_a") == 0:
        print("asignado_a ya es nullable. Nada que hacer.")
        conn.close()
        return

    print("Iniciando migración: asignado_a → nullable...")

    conn.execute("BEGIN")
    try:
        # 1. Renombrar tabla actual
        conn.execute("ALTER TABLE alarmas RENAME TO alarmas_old")

        # 2. Crear tabla nueva con asignado_a nullable
        conn.execute("""
            CREATE TABLE alarmas (
                id                     INTEGER PRIMARY KEY,
                tecnico                VARCHAR(120) NOT NULL,
                celula                 VARCHAR(50)  NOT NULL,
                microcelda             VARCHAR(80)  NOT NULL,
                ciudad                 VARCHAR(80),
                tipo_retraso           VARCHAR(40),
                minutos_retraso_inicio INTEGER,
                actividad              VARCHAR(120),
                ot                     VARCHAR(80),
                nivel                  VARCHAR(20)  NOT NULL DEFAULT 'leve',
                estado                 VARCHAR(20)  NOT NULL DEFAULT 'abierta',
                asignado_a             INTEGER,
                asignado_nombre        VARCHAR(120) NOT NULL DEFAULT 'Sin asignar',
                fecha_creacion         DATETIME     NOT NULL,
                fecha_cierre           DATETIME,
                tiempo_resolucion_min  INTEGER,
                notas                  TEXT,
                sla_cumplido           BOOLEAN
            )
        """)

        # 3. Copiar datos
        conn.execute("""
            INSERT INTO alarmas
            SELECT id, tecnico, celula, microcelda, ciudad, tipo_retraso,
                   minutos_retraso_inicio, actividad, ot, nivel, estado,
                   asignado_a, asignado_nombre, fecha_creacion, fecha_cierre,
                   tiempo_resolucion_min, notas, sla_cumplido
            FROM alarmas_old
        """)

        # 4. Recrear índices
        conn.execute("CREATE INDEX IF NOT EXISTS ix_alarmas_tecnico ON alarmas(tecnico)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_alarmas_estado  ON alarmas(estado)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_alarmas_asignado_a ON alarmas(asignado_a)")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_alarmas_fecha_creacion ON alarmas(fecha_creacion)")

        # 5. Eliminar tabla vieja
        conn.execute("DROP TABLE alarmas_old")

        conn.execute("COMMIT")
        print("Migración completada correctamente.")
    except Exception as e:
        conn.execute("ROLLBACK")
        print(f"Error — rollback ejecutado: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
