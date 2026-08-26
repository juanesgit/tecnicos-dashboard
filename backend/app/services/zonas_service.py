"""Servicio de segmentación territorial por nodos de red.

Lee el Excel de nodos (FTT + BID activos), construye el mapa
  nodo_code → {celula, microcelda, ciudad, zona_id, distrito_id}
y lo mantiene en memoria. Se recarga llamando a reload_zonas().

Jerarquía definida:
  Célula (6)  →  Microcelda (15)  →  Nodo
"""
import sys
from pathlib import Path
from typing import Dict, Optional
import pandas as pd

from app.config import settings

# ── Mapa estático: (zona_id, distrito_id) → (celula, microcelda) ─────────────
# Zona 582 = CALI NORTE / Zona 584 = CALI SUR → Célula CALI
# Zona 578 = VALLE
# Zona 572 = CAUCA
# Zona 573 = NARIÑO
# Zona 564 = HUILA Y CAQUETÁ
# Zona 561 = TOLIMA
_DISTRITO_MAP: Dict[str, tuple] = {
    # ── CÉLULA CALI ──────────────────────────────────────────────────────────
    # Microcelda Cali Norte (zona 582)
    "50":    ("Cali",          "Cali Norte"),
    "5000":  ("Cali",          "Cali Norte"),
    "54C":   ("Cali",          "Cali Norte"),
    "5C1":   ("Cali",          "Cali Norte"),
    "5O1":   ("Cali",          "Cali Norte"),
    "5O2":   ("Cali",          "Cali Norte"),
    "5O3":   ("Cali",          "Cali Norte"),
    # Microcelda Cali Sur (zona 584)
    "5C2":   ("Cali",          "Cali Sur"),
    "5C3":   ("Cali",          "Cali Sur"),
    "5C4":   ("Cali",          "Cali Sur"),
    "5S1":   ("Cali",          "Cali Sur"),
    "5S2":   ("Cali",          "Cali Sur"),
    "5S3":   ("Cali",          "Cali Sur"),
    "5S5":   ("Cali",          "Cali Sur"),
    # ── CÉLULA VALLE ─────────────────────────────────────────────────────────
    "5CG":   ("Valle",         "Norte Valle"),
    "5U3":   ("Valle",         "Centro Valle"),
    "5VB":   ("Valle",         "Centro Valle"),
    "5P1":   ("Valle",         "Palmira"),
    "5P2":   ("Valle",         "Palmira"),
    "5CV":   ("Valle",         "Palmira"),
    "5SC":   ("Valle",         "Sevilla-Caicedonia"),
    # ── CÉLULA CAUCA ─────────────────────────────────────────────────────────
    "5CU":   ("Cauca",         "Popayán"),
    "5UA":   ("Cauca",         "Popayán"),
    "5UC":   ("Cauca",         "Norte Cauca"),
    # ── CÉLULA NARIÑO ────────────────────────────────────────────────────────
    "5NC":   ("Nariño",        "Pasto"),
    "5NS":   ("Nariño",        "Pasto"),
    "5NO":   ("Nariño",        "Ipiales"),
    # ── CÉLULA HUILA-CAQUETÁ ─────────────────────────────────────────────────
    "56H":   ("Huila-Caquetá", "Neiva"),
    "5HD":   ("Huila-Caquetá", "Neiva"),
    "5UH":   ("Huila-Caquetá", "Neiva"),
    "5L1":   ("Huila-Caquetá", "Pitalito-Garzón"),
    "5Q1":   ("Huila-Caquetá", "Florencia"),
    # ── CÉLULA TOLIMA ────────────────────────────────────────────────────────
    "5T0":   ("Tolima",        "Ibagué"),
    "5T1":   ("Tolima",        "Ibagué"),
    "5T3":   ("Tolima",        "Ibagué"),
    "5T6":   ("Tolima",        "Ibagué"),
    "5T4":   ("Tolima",        "Sur Tolima"),
    "5T8":   ("Tolima",        "Sur Tolima"),
}

# Caché en memoria: nodo_code (str) → dict
_zona_map: Dict[str, Dict] = {}
_loaded = False


def _build_map_from_excel(path: str) -> Dict[str, Dict]:
    """Lee el Excel y construye el mapa nodo → zona."""
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

    # Filtrar FTT + BID activos
    df = df[
        (df["RED"].isin(["FTT", "BID"])) &
        (df["ESTADO"] == "ACT")
    ].copy()

    print(f"[ZONAS] Nodos FTT+BID activos: {len(df)}", file=sys.stderr)

    resultado: Dict[str, Dict] = {}
    for _, row in df.iterrows():
        nodo_code = str(row.get("Nodos", "")).strip()
        distrito_id = str(row.get("DISTRITO", "")).strip()
        ciudad = str(row.get("CIUDAD", "")).strip()

        if not nodo_code or nodo_code == "nan":
            continue

        celula, microcelda = _DISTRITO_MAP.get(distrito_id, ("Sin clasificar", distrito_id or "Sin clasificar"))
        resultado[nodo_code] = {
            "celula":     celula,
            "microcelda": microcelda,
            "ciudad":     ciudad,
            "distrito_id": distrito_id,
        }

    sin_clasif = sum(1 for v in resultado.values() if v["celula"] == "Sin clasificar")
    print(f"[ZONAS] Mapa construido: {len(resultado)} nodos | sin clasificar: {sin_clasif}", file=sys.stderr)
    return resultado


def reload_zonas() -> int:
    """Recarga el Excel y actualiza el mapa en memoria. Retorna cantidad de nodos."""
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


def get_jerarquia() -> Dict:
    """Retorna la jerarquía célula → microceldas → ciudades para el frontend."""
    zm = get_zona_map()
    jerarquia: Dict[str, Dict[str, set]] = {}
    for info in zm.values():
        c = info["celula"]
        m = info["microcelda"]
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
