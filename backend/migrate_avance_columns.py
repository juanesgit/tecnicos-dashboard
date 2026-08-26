"""Migración: añade columnas de avance OT a snapshot_microcelda en SQLite.

Ejecutar UNA SOLA VEZ después de actualizar snapshot.py:
    python migrate_avance_columns.py

Si las columnas ya existen, el script las omite sin error.
"""
import os
import sqlite3

DB_PATH = os.environ.get("SQLITE_DB_PATH", "./tecnicos.db")

COLS_TO_ADD = [
    ("ot_completado",    "INTEGER NOT NULL DEFAULT 0"),
    ("ot_no_completado", "INTEGER NOT NULL DEFAULT 0"),
    ("ot_iniciado",      "INTEGER NOT NULL DEFAULT 0"),
    ("ot_pendiente",     "INTEGER NOT NULL DEFAULT 0"),
    ("ot_suspendido",    "INTEGER NOT NULL DEFAULT 0"),
    ("ot_total",         "INTEGER NOT NULL DEFAULT 0"),
    ("ot_pct_avance",    "REAL NOT NULL DEFAULT 0.0"),
]

print(f"Conectando a: {DB_PATH}")
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Obtener columnas existentes
cur.execute("PRAGMA table_info(snapshot_microcelda)")
existing = {row[1] for row in cur.fetchall()}
print(f"Columnas existentes: {sorted(existing)}")

added = 0
for col_name, col_def in COLS_TO_ADD:
    if col_name in existing:
        print(f"  [SKIP] {col_name} ya existe")
        continue
    cur.execute(f"ALTER TABLE snapshot_microcelda ADD COLUMN {col_name} {col_def}")
    print(f"  [OK]   {col_name} añadida")
    added += 1

conn.commit()
conn.close()
print(f"\nMigración completada: {added} columna(s) añadida(s).")
