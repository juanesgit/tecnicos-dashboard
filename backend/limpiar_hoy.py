"""
Elimina los snapshots de HOY para que el backend arranque con la nueva
estructura de snapshot_ciudad (con campos OT exactos por ciudad).

Ejecutar desde backend/:  python limpiar_hoy.py
"""
import sqlite3
from datetime import date
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "tecnicos.db"


def main():
    if not DB_PATH.exists():
        print(f"[ERROR] No se encontró la BD en: {DB_PATH}")
        return

    hoy = date.today().isoformat()   # YYYY-MM-DD
    print(f"[INFO] Limpiando snapshots del {hoy} ...")

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        # IDs de snapshot_global de hoy
        ids = [
            r[0] for r in conn.execute(
                "SELECT id FROM snapshot_global WHERE DATE(captured_at) = ?", (hoy,)
            ).fetchall()
        ]

        if not ids:
            print("[OK] No hay snapshots de hoy — nada que limpiar.")
            return

        placeholders = ",".join("?" * len(ids))

        tablas_hijo = ["snapshot_ciudad", "snapshot_microcelda", "snapshot_celula"]
        for tabla in tablas_hijo:
            antes = conn.execute(
                f"SELECT COUNT(*) FROM {tabla} WHERE snapshot_id IN ({placeholders})", ids
            ).fetchone()[0]
            conn.execute(
                f"DELETE FROM {tabla} WHERE snapshot_id IN ({placeholders})", ids
            )
            print(f"  ✓ {tabla}: {antes} registros eliminados")

        # Eliminar el padre
        conn.execute(
            f"DELETE FROM snapshot_global WHERE id IN ({placeholders})", ids
        )
        print(f"  ✓ snapshot_global: {len(ids)} snapshots eliminados")

        # registro_inicio_diario también tiene fecha de hoy
        antes_rid = conn.execute(
            "SELECT COUNT(*) FROM registro_inicio_diario WHERE fecha = ?", (hoy,)
        ).fetchone()[0]
        conn.execute(
            "DELETE FROM registro_inicio_diario WHERE fecha = ?", (hoy,)
        )
        print(f"  ✓ registro_inicio_diario: {antes_rid} registros eliminados")

        conn.commit()
        print(
            f"\n[OK] {len(ids)} snapshots de hoy eliminados.\n"
            "     El próximo ciclo (~5 min) generará datos con los campos OT exactos por ciudad."
        )
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
