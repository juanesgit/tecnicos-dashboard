import asyncio
import logging
import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from app.config import settings
from app.database import init_db
from app.routers import auth, datos, feedback, push, users, usuarios, zonas, historico, avance, productividad, admin, actividad
from app.routers.presencia import router as presencia_router, ws_presencia
from app.services.zonas_service import reload_zonas
from app.services.snapshot_service import start_snapshot_task, stop_snapshot_task

logging.basicConfig(level=logging.INFO)

STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Cargar mapa de zonas al arrancar (incluye overrides de BD)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, reload_zonas)
    # Arrancar captura periódica de snapshots
    start_snapshot_task()
    yield
    stop_snapshot_task()


app = FastAPI(
    title="Técnicos Dashboard",
    description="Dashboard PWA de monitoreo de técnicos — Región Occidente",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers API — prefijo /api para compatibilidad con el frontend compilado ──
app.include_router(auth.router,         prefix="/api")
app.include_router(datos.router,        prefix="/api")
app.include_router(feedback.router,     prefix="/api")
app.include_router(push.router,         prefix="/api")
app.include_router(users.router,        prefix="/api")
app.include_router(usuarios.router,     prefix="/api")
app.include_router(zonas.router,        prefix="/api")
app.include_router(historico.router,    prefix="/api")
app.include_router(avance.router,       prefix="/api")
app.include_router(productividad.router, prefix="/api")
app.include_router(admin.router,        prefix="/api")
app.include_router(actividad.router,    prefix="/api")
app.include_router(presencia_router,    prefix="/api")   # REST /api/actividad/online
app.add_api_websocket_route("/ws/presencia", ws_presencia)  # sin /api para evitar proxy


# ── PWA: Service Worker (headers especiales) ──────────────────────────────────
@app.get("/sw.js")
async def service_worker():
    sw_path = STATIC_DIR / "sw.js"
    if not sw_path.exists():
        return Response(status_code=204)
    return FileResponse(
        sw_path,
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Service-Worker-Allowed": "/",
        },
    )


# ── PWA: Manifest ─────────────────────────────────────────────────────────────
@app.get("/manifest.json")
async def manifest():
    m_path = STATIC_DIR / "manifest.json"
    if not m_path.exists():
        return Response(status_code=204)
    return FileResponse(
        m_path,
        media_type="application/manifest+json",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    icon = STATIC_DIR / "icons" / "icon-192.png"
    if icon.exists():
        return FileResponse(icon, media_type="image/png",
                            headers={"Cache-Control": "public, max-age=604800"})
    return Response(status_code=204)


# ── SPA catch-all: sirve archivos estáticos o index.html ─────────────────────
@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    # 1. Intenta servir el archivo estático si existe (assets, iconos, etc.)
    if full_path:
        candidate = STATIC_DIR / full_path
        if candidate.exists() and candidate.is_file():
            mime, _ = mimetypes.guess_type(str(candidate))
            return FileResponse(
                candidate,
                media_type=mime or "application/octet-stream",
                headers={"Cache-Control": "public, max-age=31536000, immutable"}
                if "/assets/" in full_path
                else {"Cache-Control": "public, max-age=3600"},
            )

    # 2. SPA fallback → index.html
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(
            index,
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )
    return Response(
        content="Frontend no desplegado. Ejecuta: cd frontend && npm run build",
        status_code=503,
    )
