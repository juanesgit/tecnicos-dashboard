"""Servicio de segmentación territorial por nodos de red.

Lee el Excel de nodos (FTT + BID activos), construye el mapa
  nodo_code → {celula, microcelda, ciudad, zona_id, distrito_id}
y lo mantiene en memoria. Se recarga llamando a reload_zonas().

Jerarquía definida:
  Célula (6)  →  Microcelda (15)  →  Nodo

Overrides de BD:
  La tabla zona_distrito_config permite editar desde el panel admin
  qué (célula, microcelda) corresponde a cada distrito_id.
  Al llamar reload_zonas() se leen y fusionan con el mapa base.
"""
import sqlite3
import sys
from pathlib import Path
from typing import Dict, Optional
import pandas as pd

from app.config import settings

# ── Mapa base estático: (zona_id, distrito_id) → (celula, microcelda) ─────────
# Zona 582 = CALI NORTE / Zona 584 = CALI SUR → Célula CALI
# Zona 578 = VALLE
# Zona 572 = CAUCA
# Zona 573 = NARIÑO
# Zona 564 = HUILA Y CAQUETÁ
# Zona 561 = TOLIMA
_DISTRITO_MAP: Dict[str, tuple] = {
    # ── CÉLULA CALI ──────────────────────────────────────────────────────────
    # Microcelda Cali Norte
    "50":    ("Cali", "Cali Norte"),   # CALI: 484
    "5000":  ("Cali", "Cali Norte"),   # CALI: 603
    "5C1":   ("Cali", "Cali Norte"),   # CALI: 814
    "5O1":   ("Cali", "Cali Norte"),   # CALI: 219
    "5O2":   ("Cali", "Cali Norte"),   # CALI: 561
    "5O3":   ("Cali", "Cali Norte"),   # CALI: 548
    # Microcelda Yumbo (independiente)
    "54C":   ("Cali", "Yumbo"),        # YUMBO: 375, CALI: 2
    # Microcelda Cali Sur
    "5C2":   ("Cali", "Cali Sur"),     # CALI: 798
    "5C3":   ("Cali", "Cali Sur"),     # CALI: 652
    "5C4":   ("Cali", "Cali Sur"),     # CALI: 849
    "5S1":   ("Cali", "Cali Sur"),     # CALI: 562
    "5S2":   ("Cali", "Cali Sur"),     # CALI: 271
    "5S3":   ("Cali", "Cali Sur"),     # CALI: 497
    "5SU":   ("Cali", "Cali Sur"),     # CALI: 7
    # Microcelda Jamundí (independiente)
    "5S5":   ("Cali", "Jamundí"),      # JAMUNDI: 779

    # ── CÉLULA VALLE ─────────────────────────────────────────────────────────
    # Microcelda Valle Sur → ciudades: Candelaria, Florida, Pradera (sur de Cali / norte de Valle)
    "5CV":   ("Valle", "Valle Sur"),   # CANDELARIA: 254, FLORIDA: 52, PRADERA: 48
    # Microcelda Valle Norte → ciudades: Cartago, Roldanillo, Zarzal, La Unión
    "5CG":   ("Valle", "Valle Norte"),    # CARTAGO: 413, ROLDANILLO: 148, ZARZAL: 145, LA UNION: 136
    # Microcelda Valle Centro → ciudades: Tuluá, Andalucía, Guadalajara de Buga
    "5U3":   ("Valle", "Valle Centro"),   # TULUA: 738, ANDALUCIA: 94
    "5VB":   ("Valle", "Valle Centro"),   # GUADALAJARA DE BUGA: 357
    # Microcelda Palmira → ciudades: Palmira, El Cerrito
    "5P1":   ("Valle", "Palmira"),        # PALMIRA: 275, EL CERRITO: 20
    "5P2":   ("Valle", "Palmira"),        # PALMIRA: 437
    # Microcelda Sevilla-Caicedonia → ciudades: Sevilla, Caicedonia
    "5SC":   ("Valle", "Sevilla-Caicedonia"),  # SEVILLA: 177, CAICEDONIA: 131

    # ── CÉLULA CAUCA ─────────────────────────────────────────────────────────
    "5CU":   ("Cauca", "Popayán"),        # POPAYAN: 771
    "5UA":   ("Cauca", "Popayán"),        # POPAYAN: 4
    "5UC":   ("Cauca", "Norte Cauca"),    # PUERTO TEJADA: 139, SANTANDER DE QUILICHAO: 34

    # ── CÉLULA NARIÑO ────────────────────────────────────────────────────────
    "5NC":   ("Nariño", "Pasto"),         # PASTO: 648
    "5NS":   ("Nariño", "Pasto"),         # PASTO: 577, IPIALES: 1
    "5NO":   ("Nariño", "Ipiales"),       # IPIALES: 234

    # ── CÉLULA HUILA-CAQUETÁ ─────────────────────────────────────────────────
    "56H":   ("Huila-Caquetá", "Neiva"),          # NEIVA: 577
    "5HD":   ("Huila-Caquetá", "Neiva"),          # NEIVA: 478
    "5UH":   ("Huila-Caquetá", "Neiva"),          # NEIVA: 517
    "5L1":   ("Huila-Caquetá", "Pitalito-Garzón"), # PITALITO: 430, GARZON: 187
    "5Q1":   ("Huila-Caquetá", "Florencia"),      # FLORENCIA: 390

    # ── CÉLULA TOLIMA ────────────────────────────────────────────────────────
    "5T0":   ("Tolima", "Ibagué"),       # IBAGUE: 416
    "5T1":   ("Tolima", "Ibagué"),       # IBAGUE: 592
    "5T3":   ("Tolima", "Ibagué"),       # IBAGUE: 406
    "5T6":   ("Tolima", "Ibagué"),       # IBAGUE: 823
    "5T4":   ("Tolima", "Sur Tolima"),   # ESPINAL: 55, GUAMO: 58
    "5T8":   ("Tolima", "Sur Tolima"),   # FLANDES: 42, MELGAR: 30
}

# Caché en memoria: nodo_code (str) → dict
_zona_map: Dict[str, Dict] = {}
_loaded = False


def _load_distrito_overrides_sync() -> Dict[str, tuple]:
    """Lee overrides de la tabla zona_distrito_config vía sqlite3 síncrono."""
    db_url = settings.DATABASE_URL  # sqlite+aiosqlite:///...
    db_path = db_url.replace("sqlite+aiosqlite:///", "").replace("sqlite:///", "")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.execute(
            "SELECT distrito_id, celula, microcelda FROM zona_distrito_config"
        )
        overrides = {row[0]: (row[1], row[2]) for row in cursor.fetchall()}
        conn.close()
        if overrides:
            print(f"[ZONAS] {len(overrides)} overrides cargados desde BD", file=sys.stderr)
        return overrides
    except Exception as exc:
        # La tabla puede no existir aún en la primera ejecución
        print(f"[ZONAS] Sin overrides de BD ({exc})", file=sys.stderr)
        return {}


def _build_map_from_excel(path: str) -> Dict[str, Dict]:
    """Lee el Excel y construye el mapa nodo → zona, aplicando overrides de BD."""
    excel_path = Path(path)
    if not excel_path.is_absolute():
        # Buscar relativo al directorio del backend
        base = Path(__file__).resolve().parent.parent.parent
        excel_path = base / path

    if not excel_path.exists():
        print(f"[ZONAS] Excel no encontrado: {excel_path}", file=sys.stderr)
        return {}

    print(f"[ZONAS] Cargando Excel: {excel_path}", file=sys.stderr)
    df = pd.read_excel(excel_path, engine="openpyxl", dtype=str)

    # Normalizar nombres de columnas
    df.columns = [str(c).strip() for c in df.columns]

    required = {"Nodos", "DISTRITO", "CIUDAD", "RED", "ESTADO"}
    missing = required - set(df.columns)
    if missing:
        print(f"[ZONAS] Columnas faltantes en Excel: {missing}", file=sys.stderr)
        return {}

    # Columna DISTRITOO (doble O) — presente en nodos de Cali; se usa como ciudad_nodo
    tiene_distritoo = "DISTRITOO" in df.columns

    # Filtrar FTT + BID activos
    df = df[
        (df["RED"].isin(["FTT", "BID"])) &
        (df["ESTADO"] == "ACT")
    ].copy()

    print(f"[ZONAS] Nodos FTT+BID activos: {len(df)}", file=sys.stderr)

    # Mapa efectivo = base + overrides de BD
    overrides = _load_distrito_overrides_sync()
    mapa_efectivo = {**_DISTRITO_MAP, **overrides}

    resultado: Dict[str, Dict] = {}
    for _, row in df.iterrows():
        nodo_code   = str(row.get("Nodos",    "")).strip()
        distrito_id = str(row.get("DISTRITO", "")).strip()
        ciudad      = str(row.get("CIUDAD",   "")).strip()

        if not nodo_code or nodo_code == "nan":
            continue

        celula, microcelda = mapa_efectivo.get(
            distrito_id, ("Sin clasificar", distrito_id or "Sin clasificar")
        )

        # Para Célula Cali usamos DISTRITOO como ciudad_nodo (barrio/distrito Cali)
        # Para las demás células usamos CIUDAD (nombre de ciudad)
        if celula == "Cali" and tiene_distritoo:
            ciudad_nodo = str(row.get("DISTRITOO", "")).strip() or ciudad
        else:
            ciudad_nodo = ciudad

        resultado[nodo_code] = {
            "celula":      celula,
            "microcelda":  microcelda,
            "ciudad":      ciudad_nodo,
            "distrito_id": distrito_id,
        }

    sin_clasif = sum(1 for v in resultado.values() if v["celula"] == "Sin clasificar")
    print(f"[ZONAS] Mapa construido: {len(resultado)} nodos | sin clasificar: {sin_clasif}", file=sys.stderr)
    return resultado


def reload_zonas() -> int:
    """Recarga el Excel (+ overrides de BD) y actualiza el mapa en memoria. Retorna cantidad de nodos."""
    global _zona_map, _loaded
    _zona_map = _build_map_from_excel(settings.NODOS_EXCEL_PATH)
    _loaded = True
    return len(_zona_map)


def get_zona_map() -> Dict[str, Dict]:
    """Devuelve el mapa (carga si aún no se ha hecho)."""
    global _loaded
    if not _loaded:
        reload_zonas()
    return _zona_map


def get_zona_de_nodo(nodo_code: str) -> Optional[Dict]:
    """Retorna la info de zona para un código de nodo, o None si no existe."""
    return get_zona_map().get(str(nodo_code).strip())


def get_microcelda_ciudad_map() -> Dict[str, str]:
    """Retorna {microcelda_name: ciudad_más_frecuente} construido desde el Excel.

    Útil para enriquecer los puntos de series históricas con la ciudad,
    sin depender de que haya OTs activas hoy.
    """
    from collections import Counter
    zm = get_zona_map()
    mc_ciudades: Dict[str, list] = {}
    for info in zm.values():
        mc = info.get('microcelda')
        ciudad = info.get('ciudad', 'Sin clasificar') or 'Sin clasificar'
        if mc:
            mc_ciudades.setdefault(mc, []).append(ciudad)
    return {
        mc: Counter(ciudades).most_common(1)[0][0]
        for mc, ciudades in mc_ciudades.items()
    }


def get_jerarquia() -> Dict:
    """Retorna la jerarquía célula → microceldas → ciudades para el frontend."""
    zm = get_zona_map()
    jerarquia: Dict[str, Dict[str, set]] = {}
    for info in zm.values():
        c      = info["celula"]
        m      = info["microcelda"]
        ciudad = info["ciudad"]
        jerarquia.setdefault(c, {}).setdefault(m, set()).add(ciudad)

    # Convertir sets a listas ordenadas
    return {
        celula: {
            mc: sorted(ciudades)
            for mc, ciudades in microceldas.items()
        }
        for celula, microceldas in sorted(jerarquia.items())
    }
