"""Web Push VAPID — mismo patrón que pereira-alerta."""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.services.auth import get_current_user

log = logging.getLogger(__name__)
router = APIRouter(tags=["Push"])


@router.get("/push/vapid-public-key")
async def vapid_public_key():
    return {"public_key": settings.VAPID_PUBLIC_KEY}


@router.post("/push/subscribe/auth")
async def subscribe_auth(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = body.get("subscription", {})
    endpoint = sub.get("endpoint", "")
    p256dh = (sub.get("keys") or {}).get("p256dh", "")
    auth_key = (sub.get("keys") or {}).get("auth", "")
    if not endpoint or not p256dh or not auth_key:
        raise HTTPException(400, "Suscripción incompleta")

    existing = (await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == endpoint)
    )).scalar_one_or_none()

    if existing:
        existing.p256dh = p256dh
        existing.auth = auth_key
        existing.user_id = current_user.id
        await db.commit()
        return {"status": "updated"}

    ps = PushSubscription(user_id=current_user.id, endpoint=endpoint, p256dh=p256dh, auth=auth_key)
    db.add(ps)
    await db.commit()
    return {"status": "subscribed"}


@router.delete("/push/unsubscribe")
async def unsubscribe(body: dict, db: AsyncSession = Depends(get_db)):
    endpoint = body.get("endpoint", "")
    if endpoint:
        await db.execute(delete(PushSubscription).where(PushSubscription.endpoint == endpoint))
        await db.commit()
    return {"status": "unsubscribed"}


async def send_push_to_all_users(db: AsyncSession, title: str, body: str, url: str = "/") -> None:
    """Envía push a todos los usuarios suscritos (para alertas de retrasos)."""
    subs = (await db.execute(select(PushSubscription))).scalars().all()
    await _send_to_subs(subs, title, body, url)


async def _send_to_subs(subs, title: str, body: str, url: str) -> None:
    if not subs:
        return
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        log.warning("pywebpush no instalado — push deshabilitado")
        return

    payload = json.dumps({"title": title, "body": body, "url": url})
    vapid_claims = {"sub": f"mailto:{settings.VAPID_CLAIMS_EMAIL}"}

    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims=vapid_claims,
            )
        except Exception as e:
            status_code = getattr(getattr(e, "response", None), "status_code", 0)
            if status_code in (404, 410):
                log.info("Suscripción expirada: %s", sub.endpoint[:60])
            else:
                log.warning("Push error (%s): %s", status_code, str(e)[:120])
