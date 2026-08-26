import asyncio
from fastapi import APIRouter, Depends, HTTPException
from app.services.auth import get_current_user
from app.services.feedback_service import insertar_feedback_retraso

router = APIRouter(tags=["Feedback"])


@router.post("/feedback-retraso", status_code=201)
async def feedback_retraso(payload: dict, _=Depends(get_current_user)):
    tecnico = (payload.get("tecnico") or "").strip()
    motivo_texto = (payload.get("motivo_texto") or "").strip()
    if not tecnico or not motivo_texto:
        raise HTTPException(status_code=400, detail="Campos requeridos: tecnico, motivo_texto")
    loop = asyncio.get_event_loop()
    new_id = await loop.run_in_executor(None, insertar_feedback_retraso, payload)
    return {"status": "ok", "id": new_id}
