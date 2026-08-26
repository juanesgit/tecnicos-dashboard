#!/usr/bin/env bash
# ============================================================
# install.sh — Primera instalación de tecnicos-dashboard
# Ejecutar como: sudo bash deploy/install.sh
# ============================================================
set -euo pipefail

APP_DIR="/opt/tecnicos-dashboard"
SERVICE_NAME="tecnicos-dashboard"
NGINX_CONF="/etc/nginx/sites-available/tecnicos"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
PYTHON_BIN="python3"

echo "▶  Instalando tecnicos-dashboard en $APP_DIR"

# ── 1. Dependencias del sistema ──────────────────────────────────────────────
apt-get update -q
apt-get install -y -q python3 python3-venv python3-pip nodejs npm nginx certbot python3-certbot-nginx
echo "✓  Dependencias del sistema instaladas"

# ── 2. Clonar / copiar código ────────────────────────────────────────────────
# Si ya existe el directorio, omite la copia (usa update.sh para actualizar)
if [ ! -d "$APP_DIR" ]; then
  cp -r "$(pwd)" "$APP_DIR"
  echo "✓  Código copiado a $APP_DIR"
else
  echo "!  $APP_DIR ya existe, omitiendo copia"
fi

# ── 3. Entorno virtual Python ────────────────────────────────────────────────
cd "$APP_DIR"
if [ ! -d "venv" ]; then
  $PYTHON_BIN -m venv venv
  echo "✓  Virtualenv creado"
fi
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q -r backend/requirements.txt
echo "✓  Dependencias Python instaladas"

# ── 4. Archivo .env ──────────────────────────────────────────────────────────
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "⚠  Copia backend/.env.example → backend/.env"
  echo "   Edita backend/.env con tus credenciales antes de continuar"
fi

# ── 5. Frontend ──────────────────────────────────────────────────────────────
cd "$APP_DIR/frontend"
npm install --silent
npm run build
echo "✓  Frontend compilado"

# ── 6. Systemd service ───────────────────────────────────────────────────────
cp "$APP_DIR/deploy/tecnicos.service" "$SERVICE_FILE"
# Ajustar usuario si no es ubuntu
sed -i "s/User=ubuntu/User=$(logname 2>/dev/null || echo ubuntu)/" "$SERVICE_FILE"
sed -i "s/Group=ubuntu/Group=$(logname 2>/dev/null || echo ubuntu)/" "$SERVICE_FILE"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"
echo "✓  Servicio systemd habilitado e iniciado"

# ── 7. Nginx ─────────────────────────────────────────────────────────────────
cp "$APP_DIR/deploy/tecnicos.nginx" "$NGINX_CONF"
echo "⚠  Edita $NGINX_CONF y reemplaza 'tecnicos.tudominio.com' con tu dominio real"
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/tecnicos
nginx -t && systemctl reload nginx
echo "✓  Nginx configurado"

# ── 8. SSL con Certbot ───────────────────────────────────────────────────────
echo ""
echo "Para activar SSL ejecuta:"
echo "  sudo certbot --nginx -d tecnicos.tudominio.com"
echo ""
echo "✅  Instalación base completada"
echo "   Status: sudo systemctl status $SERVICE_NAME"
echo "   Logs:   sudo journalctl -u $SERVICE_NAME -f"
