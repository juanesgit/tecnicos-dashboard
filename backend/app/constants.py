"""
Estructura jerárquica de Células y Microceldas — Región Occidente.
Fuente: diseño operacional de la red.
"""
from __future__ import annotations
from typing import Optional, Dict, List, FrozenSet

CELULAS: Dict[str, List[str]] = {
    "Cali": [
        "Cali Norte",
        "Cali Sur",
    ],
    "Valle": [
        "Norte Valle",
        "Centro Valle",
        "Palmira",
        "Sevilla-Caicedonia",
    ],
    "Cauca": [
        "Popayán",
        "Norte Cauca",
    ],
    "Nariño": [
        "Pasto",
        "Ipiales",
    ],
    "Huila-Caquetá": [
        "Neiva",
        "Pitalito-Garzón",
        "Florencia",
    ],
    "Tolima": [
        "Ibagué",
        "Sur Tolima",
    ],
}

# Conjuntos para validación rápida
VALID_CELULAS: FrozenSet[str] = frozenset(CELULAS.keys())
VALID_MICROCELDAS: FrozenSet[str] = frozenset(m for micros in CELULAS.values() for m in micros)


def get_celula_de_microcelda(microcelda: str) -> Optional[str]:
    """Devuelve la célula padre de una microcelda, o None si no existe."""
    for celula, micros in CELULAS.items():
        if microcelda in micros:
            return celula
    return None
