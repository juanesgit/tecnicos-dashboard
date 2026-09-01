"""
Migración: agrega soporte de gestión de alarmas.
  - Nueva tabla causas_retraso
  - Nuevas columnas en alarmas: fecha_en_gestion, causa_id, notas_gestion,
    gestionada_por, fecha_gestion
SQLite soporta ADD COLUMN directamente, no necesita rename-create-copy-drop.
"""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "tecnicos.db")

CAUSAS_DEFAULT = [
    ("Tráfico / movilidad",       "Congestión vial, accidentes o cierres de vía."),
    ("Problema de acceso",        "Sin acceso al sitio, permisos o vigilancia."),
    ("Falla de herramienta",      "Equipo o herramienta defectuosa o faltante."),
    ("Espera de material",        "Material no disponible o pendiente de entrega."),
    ("Problema técnico complejo", "La actividad requirió mayor tiempo del estimado."),
    ("Causa externa",             "Factores fuera del control del técnico."),
    ("Sin causa registrada",      "El supervisor no identificó una causa específica."),
]


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    cur = conn.cursor()

    # ── 1. Tabla causas_retraso ───────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS causas_retraso (
            id          INTEGER PRIMARY KEY,
            nombre      VARCHAR(120) NOT NULL UNIQUE,
            descripcion TEXT,
            activa      BOOLEAN NOT NULL DEFAULT 1
        )
    """)
    print("Tabla causas_retraso: OK")

    # Insertar causas por defecto si la tabla está vacía
    cur.execute("SELECT COUNT(*) FROM causas_retraso")
    if cur.fetchone()[0] == 0:
        cur.executemany(
            "INSERT INTO causas_retraso (nombre, descripcion) VALUES (?, ?)",
            CAUSAS_DEFAULT,
        )
        print(f"  → {len(CAUSAS_DEFAULT)} causas por defecto insertadas.")

    # ── 2. Nuevas columnas en alarmas ─────────────────────────────────────────
    cur.execute("PRAGMA table_info(alarmas)")
    cols = {row[1] for row in cur.fetchall()}

    nuevas_cols = [
        ("fecha_en_gestion", "DATETIME"),
        ("causa_id",         "INTEGER"),
        ("notas_gestion",    "TEXT"),
        ("gestionada_por",   "INTEGER"),
        ("fecha_gestion",    "DATETIME"),
    ]
    for col_name, col_type in nuevas_cols:
        if col_name not in cols:
            conn.execute(f"ALTER TABLE alarmas ADD COLUMN {col_name} {col_type}")
            print(f"  + columna alarmas.{col_name} agregada.")
        else:
            print(f"  · columna alarmas.{col_name} ya existe.")

    conn.commit()
    conn.close()
    print("Migración gestion completada.")


if __name__ == "__main__":
    main()
