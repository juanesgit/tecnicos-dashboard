"""
Migración: agrega columna nodo a la tabla alarmas.
El nodo es la fuente de verdad para resolver célula/microcelda/ciudad.
Correr desde backend/: python migrate_nodo.py
"""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "tecnicos.db")


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(alarmas)")
    cols = {row[1] for row in cur.fetchall()}

    if "nodo" not in cols:
        conn.execute("ALTER TABLE alarmas ADD COLUMN nodo VARCHAR(80)")
        conn.commit()
        print("+ columna alarmas.nodo agregada.")
    else:
        print("· columna alarmas.nodo ya existe.")

    conn.close()
    print("Migración nodo completada.")


if __name__ == "__main__":
    main()
