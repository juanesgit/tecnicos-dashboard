"""Agrega columna 'disponible' a la tabla users."""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "tecnicos.db")

def main():
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()
    # Verificar si ya existe
    cur.execute("PRAGMA table_info(users)")
    cols = [row[1] for row in cur.fetchall()]
    if "disponible" in cols:
        print("Columna 'disponible' ya existe. Nada que hacer.")
        conn.close()
        return
    cur.execute("ALTER TABLE users ADD COLUMN disponible INTEGER NOT NULL DEFAULT 0")
    conn.commit()
    conn.close()
    print("Columna 'disponible' agregada correctamente.")

if __name__ == "__main__":
    main()
