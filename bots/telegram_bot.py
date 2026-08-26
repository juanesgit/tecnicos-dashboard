import os
import json
import re
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Set, Any, List, Optional

import pytz
import requests
from dotenv import load_dotenv
from pathlib import Path
from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
)

# Load env (si se ejecuta desde bots/, cargar .env de la raíz del proyecto)
ROOT_ENV = Path(__file__).resolve().parents[1] / '.env'
if ROOT_ENV.exists():
    load_dotenv(ROOT_ENV)
else:
    load_dotenv()

logging.basicConfig(
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s', level=logging.INFO
)
logger = logging.getLogger("telegram_bot")

# Settings
BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
BACKEND_URL = os.getenv('BACKEND_URL', 'http://127.0.0.1:5000').rstrip('/')
DEFAULT_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '').strip()  # Optional: broadcast target
APP_TZ = os.getenv('APP_TIMEZONE', 'America/Bogota')
API_BOT_KEY = os.getenv('API_BOT_KEY', '').strip()
ALERT_THRESHOLD_MINUTES = int(os.getenv('ALERT_THRESHOLD_MINUTES', '10'))
POLL_INTERVAL_SECONDS = int(os.getenv('BOT_POLL_INTERVAL_SECONDS', '60'))
STATE_FILE = os.getenv('BOT_STATE_FILE', 'telegram_alert_state.json')

if not BOT_TOKEN:
    raise SystemExit("TELEGRAM_BOT_TOKEN no está configurado en el entorno.")

# In-memory state
already_notified: Set[str] = set()
subscribers: Set[int] = set()
# Mapa de mensajes de alerta => contexto (por chat_id y message_id)
alert_index: Dict[str, Dict[str, Any]] = {}


def _load_state():
    global already_notified, subscribers
    try:
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                already_notified = set(data.get('already_notified', []))
                subscribers = set(data.get('subscribers', []))
                # alert_index puede ser grande; conservar tal cual
                ai = data.get('alert_index') or {}
                if isinstance(ai, dict):
                    # asegurar claves como str
                    for k, v in ai.items():
                        alert_index[str(k)] = v
    except Exception as e:
        logger.warning("No se pudo cargar estado del bot: %s", e)


def _save_state():
    data = {
        'already_notified': list(already_notified),
        'subscribers': list(subscribers),
        'alert_index': alert_index,
    }
    try:
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning("No se pudo guardar estado del bot: %s", e)

def _parse_alert_text(text: str) -> Dict[str, Any]:
    """Parsea el texto de la alerta enviada por el bot para reconstruir contexto.
    Permite registrar /motivo aunque el mensaje no esté indexado (alert_index).
    """
    base: Dict[str, Any] = {
        'tecnico': '', 'compania': '', 'ciudad': '', 'actividad_actual': '', 'subtipo_ot': '',
        'ot_actual': '', 'inicio_actual': '', 'estado_actual': '', 'retraso_minutos': 0,
        'cuota_norma': None, 'fin_norma': ''
    }
    if not text:
        return base
    try:
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        for l in lines:
            if l.startswith('👷 '):
                payload = l.replace('👷 ', '', 1)
                parts = payload.split(' — ', 1)
                base['tecnico'] = parts[0].strip()
                if len(parts) > 1:
                    base['compania'] = parts[1].strip()
            elif l.startswith('📍 '):
                base['ciudad'] = l.replace('📍 ', '', 1).strip()
            elif l.startswith('🛠️ '):
                payload = l.replace('🛠️ ', '', 1)
                parts = payload.split(' · ', 1)
                base['actividad_actual'] = parts[0].strip()
                if len(parts) > 1:
                    base['subtipo_ot'] = parts[1].strip()
            elif l.startswith('📄 OT:'):
                base['ot_actual'] = l.split(':', 1)[1].strip()
            elif l.startswith('⏱️ '):
                # Norma: 240 min · Inicio: 09:35 · Fin norma: 13:35
                m = re.search(r"Norma:\s*(\d+)\s*min\s*·\s*Inicio:\s*(\d{2}:\d{2})\s*·\s*Fin norma:\s*(\d{2}:\d{2})", l)
                if m:
                    base['cuota_norma'] = int(m.group(1))
                    base['inicio_actual'] = m.group(2)
                    base['fin_norma'] = m.group(3)
            elif l.startswith('⌛ '):
                # Retraso: 01:21
                m = re.search(r"Retraso:\s*(\d{2}):(\d{2})", l)
                if m:
                    hh = int(m.group(1)); mm = int(m.group(2))
                    base['retraso_minutos'] = hh * 60 + mm
        return base
    except Exception:
        return base


def _fmt_delay_row(r: Dict[str, Any]) -> str:
    tecnico = r.get('Técnico') or r.get('Tecnico') or '—'
    compania = r.get('Compañia') or r.get('Compania') or '—'
    ciudad = r.get('ciudad_actual') or r.get('Ciudad') or '—'
    actividad = r.get('actividad_actual') or r.get('Tipo de Actividad') or '—'
    subtipo = r.get('subtipo_ot') or '—'
    ot = r.get('ot_actual') or r.get('ot_base') or r.get('Orden de trabajo') or '—'
    inicio = r.get('inicio_actual') or r.get('Inicio') or '—'
    fin_norma = r.get('fin_norma') or '—'
    norma = r.get('cuota_norma')
    retraso = r.get('retraso_hhmm') or '00:00'
    estado = r.get('estado_actual') or '—'
    return (
        f"🚨 <b>{estado}</b>\n"
        f"👷 {tecnico} — {compania}\n"
        f"📍 {ciudad}\n"
        f"🛠️ {actividad} · {subtipo}\n"
        f"📄 OT: {ot}\n"
        f"⏱️ Norma: {norma if norma is not None else '—'} min · Inicio: {inicio} · Fin norma: {fin_norma}\n"
        f"⌛ Retraso: <b>{retraso}</b>"
    )


def _make_key(r: Dict[str, Any]) -> str:
    tecnico = str(r.get('Técnico') or r.get('Tecnico') or '')
    ot = str(r.get('ot_actual') or r.get('ot_base') or r.get('Orden de trabajo') or '')
    inicio = str(r.get('inicio_actual') or r.get('Inicio') or '')
    return f"{tecnico}|{ot}|{inicio}"


def _row_to_feedback_payload(r: Dict[str, Any]) -> Dict[str, Any]:
    """Convierte una fila de /api/datos en el payload base para /api/feedback-retraso."""
    return {
        'tecnico': r.get('Técnico') or r.get('Tecnico') or '',
        'compania': r.get('Compañia') or r.get('Compania') or '',
        'ciudad': r.get('ciudad_actual') or r.get('Ciudad') or '',
        'actividad_actual': r.get('actividad_actual') or r.get('Tipo de Actividad') or '',
        'subtipo_ot': r.get('subtipo_ot') or '',
        'ot_actual': r.get('ot_actual') or r.get('ot_base') or r.get('Orden de trabajo') or '',
        'inicio_actual': r.get('inicio_actual') or r.get('Inicio') or '',
        'estado_actual': r.get('estado_actual') or '',
        'retraso_minutos': r.get('minutos_retraso') or 0,
        'cuota_norma': r.get('cuota_norma') or None,
        'fin_norma': r.get('fin_norma') or '',
    }


def _get_datos() -> Dict[str, Any]:
    url = f"{BACKEND_URL}/api/datos"
    headers = {}
    params = {}
    if API_BOT_KEY:
        headers['X-Api-Key'] = API_BOT_KEY
        params['api_key'] = API_BOT_KEY  # redundante pero inofensivo
    r = requests.get(url, headers=headers, params=params, timeout=25)
    try:
        r.raise_for_status()
        return r.json()
    except Exception:
        # Log ayuda de diagnóstico
        snippet = (r.text or '')[:300]
        logger.error("Backend no devolvió JSON. status=%s content-type=%s body[0:300]=%r",
                     r.status_code, r.headers.get('Content-Type'), snippet)
        raise


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    await update.message.reply_text(
        "Hola! Soy el bot de alertas de Técnicos. Usa /help para ver comandos."
    )
    # No auto-suscribir para broadcast; usar /subscribe


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "/help - ayuda\n"
        "/status - ver resumen actual\n"
        "/subscribe - suscribir este chat a alertas\n"
        "/unsubscribe - quitar suscripción a alertas\n"
        "/motivo <texto> - responde a un mensaje de alerta con este comando para registrar el motivo"
    )


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        data = _get_datos()
        est = data.get('estadisticas') or {}
        total = est.get('total_tecnicos', 0)
        retrasados = est.get('tecnicos_retrasados', 0)
        pct = est.get('porcentaje_retrasados', 0)
        cump = est.get('cumplimiento_norma', 0)
        cump_dia = est.get('cumplimiento_time_slot_dia', 0)
        prom = est.get('promedio_retraso', 0)
        maxr = est.get('max_retraso', 0)
        msg = (
            f"📊 Resumen:\n"
            f"• Técnicos: {total}\n"
            f"• Retrasados: {retrasados} ({pct}%)\n"
            f"• Cump Time Slot: {cump}%\n"
            f"• Cump Time Slot Dia: {cump_dia}%\n"
            f"• Prom Retraso: {int(prom)} min · Max: {int(maxr)} min"
        )
        await update.message.reply_text(msg)
    except Exception as e:
        logger.exception("/status error: %s", e)
        await update.message.reply_text("Error obteniendo el estado.")


async def cmd_motivo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        msg = update.message
        if not msg:
            return
        # Debe ser una respuesta a un mensaje de alerta
        if not msg.reply_to_message:
            await msg.reply_text("Por favor, responde a un mensaje de alerta con /motivo <texto>.")
            return
        # Obtener texto del motivo (args luego del comando)
        text_full = msg.text or ''
        parts = text_full.split(' ', 1)
        if len(parts) < 2 or not parts[1].strip():
            await msg.reply_text("Uso: /motivo <texto>. Debes incluir el motivo del retraso.")
            return
        motivo_texto = parts[1].strip()

        chat_id = msg.chat_id
        replied_id = msg.reply_to_message.message_id
        idx_key = f"{chat_id}|{replied_id}"
        base = alert_index.get(idx_key)
        if not base:
            # Fallback: intentar parsear el texto del mensaje de alerta
            replied_text = msg.reply_to_message.text or msg.reply_to_message.caption or ''
            parsed = _parse_alert_text(replied_text)
            if parsed.get('tecnico'):
                base = parsed
            else:
                await msg.reply_text("No encuentro el contexto de esa alerta. Envía el motivo respondiendo exactamente al mensaje de alerta.")
                return

        payload = dict(base)
        payload.update({
            'motivo_texto': motivo_texto,
            'canal': 'telegram',
            'chat_user_id': update.effective_user.id if update.effective_user else None,
            'chat_username': (update.effective_user.username if update.effective_user else None),
        })

        url = f"{BACKEND_URL}/api/feedback-retraso"
        headers = {'Content-Type': 'application/json'}
        params = {}
        if API_BOT_KEY:
            headers['X-Api-Key'] = API_BOT_KEY
            params['api_key'] = API_BOT_KEY
        resp = requests.post(url, headers=headers, params=params, json=payload, timeout=20)
        try:
            resp.raise_for_status()
            j = resp.json()
            fid = j.get('id')
            await msg.reply_text(f"✅ Feedback registrado (ID {fid}). ¡Gracias!")
        except Exception:
            snippet = (resp.text or '')[:200]
            await msg.reply_text(f"No se pudo registrar el feedback. Respuesta: {resp.status_code} {snippet}")
    except Exception as e:
        logger.exception("/motivo error: %s", e)
        await update.message.reply_text("Ocurrió un error registrando el feedback.")


async def cmd_subscribe(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    subscribers.add(chat_id)
    _save_state()
    await update.message.reply_text("Suscrito a alertas de retrasos.")


async def cmd_unsubscribe(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    if chat_id in subscribers:
        subscribers.remove(chat_id)
        _save_state()
    await update.message.reply_text("Suscripción eliminada.")


async def broadcast_text(context: ContextTypes.DEFAULT_TYPE, text: str, parse_mode: Optional[str] = ParseMode.HTML):
    # Priority to env default chat id; else all subscribers
    targets: Set[int] = set()
    if DEFAULT_CHAT_ID:
        try:
            targets.add(int(DEFAULT_CHAT_ID))
        except Exception:
            logger.warning("TELEGRAM_CHAT_ID inválido: %s", DEFAULT_CHAT_ID)
    targets |= subscribers

    for chat_id in targets:
        try:
            await context.bot.send_message(chat_id=chat_id, text=text, parse_mode=parse_mode)
        except Exception as e:
            logger.warning("Fallo al enviar mensaje a %s: %s", chat_id, e)


def _get_targets() -> Set[int]:
    targets: Set[int] = set()
    if DEFAULT_CHAT_ID:
        try:
            targets.add(int(DEFAULT_CHAT_ID))
        except Exception:
            logger.warning("TELEGRAM_CHAT_ID inválido: %s", DEFAULT_CHAT_ID)
    targets |= subscribers
    return targets


async def job_check_retrasos(context: ContextTypes.DEFAULT_TYPE):
    try:
        data = _get_datos()
        items: List[Dict[str, Any]] = data.get('datos') or []
        # Filtrar retrasos actuales por norma o fallback
        candidatos = [r for r in items if (r.get('estado_actual') == 'Retraso actual' and (r.get('minutos_retraso') or 0) >= ALERT_THRESHOLD_MINUTES)]
        if not candidatos:
            return
        nuevos: List[Dict[str, Any]] = []
        for r in candidatos:
            k = _make_key(r)
            if k not in already_notified:
                nuevos.append(r)
                already_notified.add(k)
        if nuevos:
            for r in nuevos:
                text = _fmt_delay_row(r)
                base_payload = _row_to_feedback_payload(r)
                for chat_id in _get_targets():
                    try:
                        msg = await context.bot.send_message(chat_id=chat_id, text=text, parse_mode=ParseMode.HTML)
                        key = f"{chat_id}|{msg.message_id}"
                        alert_index[key] = base_payload
                    except Exception as e:
                        logger.warning("No se pudo enviar alerta a %s: %s", chat_id, e)
            _save_state()
    except Exception as e:
        logger.warning("job_check_retrasos error: %s", e)


def main():
    _load_state()
    application = ApplicationBuilder().token(BOT_TOKEN).build()

    application.add_handler(CommandHandler('start', cmd_start))
    application.add_handler(CommandHandler('help', cmd_help))
    application.add_handler(CommandHandler('status', cmd_status))
    application.add_handler(CommandHandler('subscribe', cmd_subscribe))
    application.add_handler(CommandHandler('unsubscribe', cmd_unsubscribe))
    application.add_handler(CommandHandler('motivo', cmd_motivo))

    # Job para revisar retrasos
    application.job_queue.run_repeating(job_check_retrasos, interval=POLL_INTERVAL_SECONDS, first=5)

    logger.info(
        "Bot iniciado. BACKEND_URL=%s, threshold=%s min, interval=%ss",
        BACKEND_URL,
        ALERT_THRESHOLD_MINUTES,
        POLL_INTERVAL_SECONDS,
    )
    # Bloqueante
    application.run_polling()


if __name__ == '__main__':
    try:
        main()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Bot detenido.")
