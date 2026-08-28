"""
Script de limpieza de tablas de snapshots.
Ejecutar desde backend/:  python reset_snapshots.py
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "tecnicos.db"

TABLAS = [
    "snapshot_ciudad",
    "snapshot_microcelda",
    "snapshot_celula",
    "snapshot_global",
    "registro_inicio_diario",
]

def main():
    if not DB_PATH.exists():
        print(f"[ERROR] No se encontró la BD en: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        for tabla in TABLAS:
            try:
                antes = conn.execute(f"SELECT COUNT(*) FROM {tabla}").fetchone()[0]
                conn.execute(f"DELETE FROM {tabla}")
                print(f"  ✓ {tabla}: {antes} registros eliminados")
            except Exception as e:
                print(f"  ✗ {tabla}: {e}")
        conn.commit()
        print("\n[OK] Snapshots limpiados. El próximo ciclo (5 min) generará datos con la estructura nueva.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
