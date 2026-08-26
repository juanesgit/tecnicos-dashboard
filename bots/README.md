# Bot de Telegram — Técnicos Dashboard

## Ejecución

```bash
# En el servidor, desde /opt/tecnicos-dashboard/
source venv/bin/activate
python bots/telegram_bot.py
```

## Como servicio systemd independiente

Crea `/etc/systemd/system/tecnicos-bot.service`:

```ini
[Unit]
Description=Tecnicos Dashboard – Telegram Bot
After=network.target tecnicos-dashboard.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/tecnicos-dashboard
EnvironmentFile=/opt/tecnicos-dashboard/backend/.env
ExecStart=/opt/tecnicos-dashboard/venv/bin/python bots/telegram_bot.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable tecnicos-bot
sudo systemctl start tecnicos-bot
```

## Variables de entorno requeridas

El bot lee las mismas variables del `backend/.env`:
- `TELEGRAM_BOT_TOKEN` — Token del bot
- `TELEGRAM_CHAT_ID` — Chat o grupo destino
- `API_BOT_KEY` — Clave para autenticarse contra la API interna
