# Técnicos Dashboard — PWA

Dashboard de monitoreo de técnicos en campo — **Región Occidente**.  
Migrado de Flask a **FastAPI + React 18 + Vite + Tailwind CSS** con soporte PWA y Web Push.

---

## Estructura

```
tecnicos-dashboard/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI, sirve frontend compilado
│   │   ├── config.py          # Pydantic settings (.env)
│   │   ├── database.py        # SQLAlchemy async (SQLite — usuarios)
│   │   ├── mysql_db.py        # pymysql (MySQL — datos operativos)
│   │   ├── models/            # User, PushSubscription
│   │   ├── schemas/           # Pydantic schemas
│   │   ├── routers/           # auth, datos, feedback, push, users
│   │   ├── services/          # auth, cache, datos_service, feedback
│   │   └── static/            # Frontend compilado + sw.js + manifest.json
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── index.css
│   │   ├── hooks/useAuth.js   # Zustand + JWT localStorage
│   │   ├── services/api.js    # Axios + interceptor Bearer
│   │   ├── pages/             # Login, Dashboard
│   │   └── components/        # Navbar, StatsPanel, Tablas, Modal, PushManager
│   ├── package.json
│   └── vite.config.js         # build.outDir → ../backend/app/static
├── bots/
│   └── telegram_bot.py        # Bot Telegram (proceso independiente)
└── deploy/
    ├── tecnicos.service        # systemd (puerto 8003)
    ├── tecnicos.nginx          # Nginx reverse proxy + SSL
    ├── install.sh              # Primera instalación
    └── update.sh               # Actualización
```

---

## Instalación rápida

```bash
# 1. Sube el proyecto al servidor
scp -r tecnicos-dashboard/ ubuntu@tu-servidor:/opt/

# 2. Primera instalación
cd /opt/tecnicos-dashboard
sudo bash deploy/install.sh

# 3. Configura variables de entorno
nano backend/.env

# 4. Reinicia el servicio
sudo systemctl restart tecnicos-dashboard

# 5. SSL
sudo certbot --nginx -d tecnicos.tudominio.com
```

## Desarrollo local

```bash
# Terminal 1 — Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # editar credenciales
uvicorn app.main:app --reload --port 8003

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev  # http://localhost:5173 con proxy a :8003
```

## Build frontend

```bash
cd frontend
npm run build
# Salida: backend/app/static/  ← FastAPI lo sirve automáticamente
```

## Variables .env requeridas

| Variable | Descripción |
|----------|-------------|
| `SECRET_KEY` | Clave JWT (mín. 32 chars) |
| `ADMIN_USERNAME` | Usuario administrador inicial |
| `ADMIN_PASSWORD` | Contraseña admin |
| `DB_HOST` | Host MySQL (ej. 10.108.34.32) |
| `DB_PORT` | Puerto MySQL (ej. 33063) |
| `DB_NAME` | Base de datos (ccot) |
| `DB_USER` | Usuario MySQL |
| `DB_PASSWORD` | Contraseña MySQL |
| `VAPID_PUBLIC_KEY` | Clave pública VAPID para Web Push |
| `VAPID_PRIVATE_KEY` | Clave privada VAPID |
| `VAPID_CLAIMS_EMAIL` | Email para VAPID |
| `API_BOT_KEY` | API key para el bot de Telegram |

### Generar claves VAPID

```python
from pywebpush import Vapid
v = Vapid()
v.generate_keys()
print("Public:", v.public_key)
print("Private:", v.private_key)
```
