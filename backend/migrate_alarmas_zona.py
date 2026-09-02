#!/usr/bin/env python3
"""
migrate_alarmas_zona.py
=======================
Actualiza celula / microcelda / ciudad en alarmas abiertas (y otras activas)
que quedaron como 'Sin clasificar' antes del deploy del fallback de zonas.

Ejecutar desde el directorio backend/:
    python migrate_alarmas_zona.py [--dry-run] [--todos]

Flags:
  --dry-run   Imprime cambios sin escribir en SQLite.
  --todos     Procesa TODOS los estados (default: solo abierta / en_gestion).
"""

import sys
import os
import argparse
from pathlib import Path
from datetime import date, timedelta
from typing import Dict, Optional, Tuple

# ── Asegurar que el paquete app sea importable ────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import settings
from app.services.zonas_service import get_zona_map, get_ciudad_map

# ── Importar cliente MySQL igual que datos_service ───────────────────────────
try:
    import pymysql
    def get_mysql_connection():
        return pymysql.connect(
            host=settings.DB_HOST,
            port=int(settings.DB_PORT),
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME,
            charset=settings.DB_CHARSET,
            cursorclass=pymysql.cursors.DictCursor,
        )
except ImportError:
    import MySQLdb
    def get_mysql_connection():
        return MySQLdb.connect(
            host=settings.DB_HOST,
            port=int(settings.DB_PORT),
            user=settings.DB_USER,
            passwd=settings.DB_PASSWORD,
            db=settings.DB_NAME,
            charset=settings.DB_CHARSET,
        )

import sqlite3

HISTORICO_DIAS = 60   # ventana más amplia para el script offline


def _cargar_historico(zona_map: Dict) -> Dict[str, Tuple[str, str, str]]:
    """
    Consulta wf_cierre y retorna {tecnico: (celula, microcelda, ciudad)}
    con el último nodo resolvible de los últimos HISTORICO_DIAS días.
    """
    conn = None
    try:
        conn = get_mysql_connection()
        # Verificar que existe columna Nodo
        with conn.cursor() as cur:
            cur.execute("SHOW COLUMNS FROM wf_cierre LIKE 'Nodo'")
            if not cur.fetchone():
                print("[HIST] wf_cierre no tiene columna Nodo.", file=sys.stderr)
                return {}

        fecha_desde = (date.today() - timedelta(days=HISTORICO_DIAS)).isoformat()
        query = """
            SELECT `Técnico`, `Nodo`, `Ciudad`, `Inicio`, `Fecha`
            FROM wf_cierre
            WHERE Origen IN ('REGION OCCIDENTE', 'PYMES OCCIDENTE')
              AND Fecha >= %s
              AND Nodo IS NOT NULL AND Nodo != ''
              AND Estado IN ('Completado', 'No completado', 'Iniciado')
              AND LOWER(`Tipo de Actividad`) NOT LIKE '%%almacen%%'
              AND LOWER(`Tipo de Actividad`) NOT LIKE '%%almacén%%'
              AND LOWER(`Tipo de Actividad`) NOT LIKE '%%almuerzo%%'
              AND LOWER(`Tipo de Actividad`) NOT LIKE '%%pre-turno%%'
              AND LOWER(`Tipo de Actividad`) NOT LIKE '%%preturno%%'
            ORDER BY Fecha ASC, `Inicio` ASC
        """
        with conn.cursor() as cur:
            cur.execute(query, (fecha_desde,))
            rows = cur.fetchall()

        if not rows:
            return {}

        resultado: Dict[str, Tuple[str, str, str]] = {}
        # Iterar en orden (ASC) → el último sobrescribe → guardamos el más reciente
        for row in rows:
            tecnico = str(row.get("Técnico", "") or "").strip()
            nodo = str(row.get("Nodo", "") or "").strip()
            if not tecnico or not nodo:
                continue
            zona = zona_map.get(nodo, {})
            if zona.get("celula", "Sin clasificar") == "Sin clasificar":
                continue
            resultado[tecnico] = (
                zona["celula"],
                zona.get("microcelda", "Sin clasificar"),
                zona.get("ciudad", "Sin clasificar"),
            )

        print(f"[HIST] {len(resultado)} técnicos con nodo histórico resolvible.", file=sys.stderr)
        return resultado

    except Exception as exc:
        print(f"[HIST] Error: {exc}", file=sys.stderr)
        return {}
    finally:
        if conn:
            conn.close()


def _resolver(
    nodo: Optional[str],
    ciudad: Optional[str],
    tecnico: str,
    zona_map: Dict,
    ciudad_map: Dict,
    historico: Dict,
) -> Optional[Tuple[str, str, str]]:
    """
    Devuelve (celula, microcelda, ciudad) resueltos o None si no se pudo.
    Sigue la misma lógica de 4 niveles del servicio principal.
    """
    # Nivel 1: nodo de la alarma
    n = (nodo or "").strip()
    if n:
        zona = zona_map.get(n, {})
        if zona.get("celula", "Sin clasificar") != "Sin clasificar":
            return zona["celula"], zona.get("microcelda", "Sin clasificar"), zona.get("ciudad", "Sin clasificar")

    # Nivel 2: ciudad almacenada en la alarma → _CIUDAD_MAP
    c = (ciudad or "").strip().upper()
    if c and c in ciudad_map:
        cel, mic = ciudad_map[c]
        if cel != "Sin clasificar":
            return cel, mic, ciudad.strip().title() if ciudad else c.title()

    # Nivel 3: histórico de wf_cierre
    if tecnico in historico:
        return historico[tecnico]

    return None


def main():
    parser = argparse.ArgumentParser(description="Migrar zonas de alarmas Sin clasificar")
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra cambios, no escribe")
    parser.add_argument("--todos", action="store_true", help="Procesa todos los estados, no solo abierta/en_gestion")
    args = parser.parse_args()

    dry_run = args.dry_run
    if dry_run:
        print("═══ DRY-RUN: no se escribirá nada en SQLite ═══")

    # ── Cargar mapas de zona ──────────────────────────────────────────────────
    print("[ZONAS] Cargando mapa de nodos...", file=sys.stderr)
    zona_map = get_zona_map()
    ciudad_map = get_ciudad_map()
    print(f"[ZONAS] {len(zona_map)} nodos cargados.", file=sys.stderr)

    # ── Cargar histórico MySQL ────────────────────────────────────────────────
    historico = _cargar_historico(zona_map)

    # ── Conectar SQLite ───────────────────────────────────────────────────────
    # Deducir ruta SQLite desde DATABASE_URL
    # Formatos posibles: sqlite:///ruta, sqlite+aiosqlite:///ruta, sqlite+aiosqlite:////ruta_absoluta
    db_url = getattr(settings, "DATABASE_URL", "")
    db_path = None
    for prefix in ("sqlite+aiosqlite:///", "sqlite:///"):
        if db_url.startswith(prefix):
            raw = db_url[len(prefix):]
            # Si queda una / inicial es ruta absoluta Unix (/opt/...)
            db_path = Path(raw if raw.startswith("/") else raw)
            break

    if db_path is None or not db_path.exists():
        # Probar rutas comunes junto al script
        for candidate in [
            Path(__file__).resolve().parent / "tecnicos.db",
            Path(__file__).resolve().parent / "alarmas.db",
            Path(__file__).resolve().parent / "app" / "tecnicos.db",
        ]:
            if candidate.exists():
                db_path = candidate
                break

    if not db_path or not db_path.exists():
        print(f"[ERROR] No se encontró la base SQLite.", file=sys.stderr)
        print(f"[ERROR] DATABASE_URL={db_url}", file=sys.stderr)
        print(f"[ERROR] Ruta intentada: {db_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[SQLITE] Usando: {db_path}", file=sys.stderr)
    conn_sqlite = sqlite3.connect(str(db_path))
    conn_sqlite.row_factory = sqlite3.Row

    try:
        cur = conn_sqlite.cursor()

        # ── Seleccionar alarmas a actualizar ──────────────────────────────────
        estados_clause = (
            "estado IN ('abierta','en_gestion')"
            if not args.todos
            else "1=1"
        )
        sin_zona_clause = "(celula = 'Sin clasificar' OR microcelda = 'Sin clasificar' OR ciudad IS NULL OR ciudad = '' OR ciudad = 'Sin clasificar')"

        cur.execute(
            f"SELECT id, tecnico, celula, microcelda, ciudad, nodo FROM alarmas WHERE {estados_clause} AND {sin_zona_clause}"
        )
        alarmas = cur.fetchall()

        if not alarmas:
            print("✅ No hay alarmas con zona Sin clasificar para actualizar.")
            return

        print(f"\n[ALARMAS] {len(alarmas)} alarmas con zona Sin clasificar encontradas.")
        print(f"{'ID':>6}  {'Técnico':<35}  {'Nodo':<12}  {'Ciudad orig':<20}  {'→ Célula':<15}  {'→ Microcelda':<25}  {'→ Ciudad'}")
        print("─" * 140)

        actualizadas = 0
        no_resueltas = 0

        for alarma in alarmas:
            aid = alarma["id"]
            tecnico = alarma["tecnico"] or ""
            nodo = alarma["nodo"] or ""
            ciudad_orig = alarma["ciudad"] or ""

            resultado = _resolver(nodo, ciudad_orig, tecnico, zona_map, ciudad_map, historico)

            if resultado is None:
                print(f"{aid:>6}  {tecnico:<35}  {nodo:<12}  {ciudad_orig:<20}  {'— no resuelta':>15}")
                no_resueltas += 1
                continue

            nueva_celula, nueva_micro, nueva_ciudad = resultado
            ciudad_display = nueva_ciudad if nueva_ciudad and nueva_ciudad != "Sin clasificar" else ciudad_orig or "Sin clasificar"

            print(f"{aid:>6}  {tecnico:<35}  {nodo:<12}  {ciudad_orig:<20}  {nueva_celula:<15}  {nueva_micro:<25}  {ciudad_display}")

            if not dry_run:
                cur.execute(
                    """UPDATE alarmas
                       SET celula = ?, microcelda = ?, ciudad = ?
                       WHERE id = ?""",
                    (nueva_celula, nueva_micro, ciudad_display, aid),
                )
            actualizadas += 1

        if not dry_run:
            conn_sqlite.commit()

        print("\n" + "═" * 80)
        print(f"  Actualizadas : {actualizadas}")
        print(f"  No resueltas : {no_resueltas}")
        if dry_run:
            print("  (DRY-RUN: no se escribió nada)")
        print("═" * 80)

    finally:
        conn_sqlite.close()


if __name__ == "__main__":
    main()
