"""
Migración: agrega columna `nodo` a la tabla alarmas si no existe.
Ejecutar: python migrate_nodo_alarmas.py
"""
import sqlite3, sys
from pathlib import Path

DB_PATH = Path(__file__).parent / "tecnicos.db"

if not DB_PATH.exists():
    print(f"[ERROR] No se encontró {DB_PATH}", file=sys.stderr)
    sys.exit(1)

conn = sqlite3.connect(DB_PATH)
cur  = conn.cursor()

# Verificar columnas existentes
cur.execute("PRAGMA table_info(alarmas)")
cols = {row[1] for row in cur.fetchall()}
print(f"[INFO] Columnas actuales en alarmas: {sorted(cols)}")

added = []
to_add = {
    "nodo":            "ALTER TABLE alarmas ADD COLUMN nodo VARCHAR(80)",
    "actividad":       "ALTER TABLE alarmas ADD COLUMN actividad VARCHAR(120)",
    "ot":              "ALTER TABLE alarmas ADD COLUMN ot VARCHAR(80)",
    "sla_cumplido":    "ALTER TABLE alarmas ADD COLUMN sla_cumplido BOOLEAN",
    "fecha_en_gestion":"ALTER TABLE alarmas ADD COLUMN fecha_en_gestion DATETIME",
    "causa_id":        "ALTER TABLE alarmas ADD COLUMN causa_id INTEGER",
    "notas_gestion":   "ALTER TABLE alarmas ADD COLUMN notas_gestion TEXT",
    "gestionada_por":  "ALTER TABLE alarmas ADD COLUMN gestionada_por INTEGER",
    "fecha_gestion":   "ALTER TABLE alarmas ADD COLUMN fecha_gestion DATETIME",
}

for col, sql in to_add.items():
    if col not in cols:
        cur.execute(sql)
        added.append(col)
        print(f"[OK] Columna '{col}' agregada.")
    else:
        print(f"[SKIP] Columna '{col}' ya existe.")

conn.commit()
conn.close()

if added:
    print(f"\n✅ Migración completada — columnas agregadas: {added}")
else:
    print("\n✅ Nada que migrar — todas las columnas ya existían.")
