import httpx

from app.core.config import get_settings


async def list_models() -> list[dict]:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{settings.ollama_host}/api/tags")
        resp.raise_for_status()
        data = resp.json()
    models = []
    for item in data.get("models", []):
        name = item.get("name", "")
        models.append({"name": name, "size": item.get("size")})
    return models


async def get_model_context_length(model: str) -> int | None:
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.ollama_host}/api/show",
                json={"name": model},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError:
        return None

    for key in ("model_info",):
        block = data.get(key) or {}
        for k, v in block.items():
            if "context_length" in k.lower() and isinstance(v, int):
                return v
    params = data.get("parameters") or ""
    for line in str(params).split("\n"):
        if "num_ctx" in line:
            parts = line.split()
            if len(parts) >= 2:
                try:
                    return int(parts[-1])
                except ValueError:
                    pass
    return None
