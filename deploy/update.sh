#!/usr/bin/env bash
# ============================================================
# update.sh — Deploy/actualización de tecnicos-dashboard
# Uso: bash deploy/update.sh
# ============================================================
set -euo pipefail

APP_DIR="/opt/tecnicos-dashboard"
SERVICE_NAME="tecnicos-dashboard"
FRONTEND_DIR="$APP_DIR/frontend"
BACKEND_DIR="$APP_DIR/backend"
VENV="$APP_DIR/venv"

echo "▶  Actualizando tecnicos-dashboard…"

# 1. Pull del repositorio
cd "$APP_DIR"
git pull origin main
echo "✓  Código actualizado"

# 2. Instalar dependencias Python (si cambiaron)
"$VENV/bin/pip" install -q -r "$BACKEND_DIR/requirements.txt"
echo "✓  Dependencias Python instaladas"

# 3. Instalar dependencias Node y compilar frontend
cd "$FRONTEND_DIR"
npm install --silent
npm run build
echo "✓  Frontend compilado → backend/app/static"

# 4. Reiniciar servicio
sudo systemctl restart "$SERVICE_NAME"
echo "✓  Servicio reiniciado"

# 5. Recargar Nginx (por si hubo cambios en configuración)
sudo nginx -t && sudo systemctl reload nginx
echo "✓  Nginx recargado"

echo ""
echo "✅  Despliegue completado"
echo "   Status: sudo systemctl status $SERVICE_NAME"
