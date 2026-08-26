"""Caché en memoria (TTL) para /api/datos. Thread-safe con cachetools."""
import threading
from cachetools import TTLCache
from app.config import settings

_lock = threading.Lock()
_cache: TTLCache = TTLCache(maxsize=4, ttl=settings.CACHE_DATOS_TIMEOUT)

DATOS_KEY = "datos_v2"


def get_cached_datos():
    with _lock:
        return _cache.get(DATOS_KEY)


def set_cached_datos(value):
    with _lock:
        _cache[DATOS_KEY] = value


def invalidate_datos():
    with _lock:
        _cache.pop(DATOS_KEY, None)
