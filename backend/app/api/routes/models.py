from fastapi import APIRouter, HTTPException

from app.agents.ollama_client import list_models

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("")
async def get_models() -> dict:
    try:
        models = await list_models()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama unavailable: {exc}") from exc
    return {"models": models}
