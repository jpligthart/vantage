import tiktoken

from app.core.config import get_settings

_encoding = tiktoken.get_encoding("cl100k_base")
RESPONSE_RESERVE = 2048


def count_tokens(text: str) -> int:
    return len(_encoding.encode(text))


def fits_context(
    *,
    system: str,
    document: str,
    history: str,
    user_message: str,
    model_context: int | None,
) -> tuple[bool, int]:
    settings = get_settings()
    limit = model_context or settings.default_context_tokens
    used = count_tokens(system) + count_tokens(document) + count_tokens(history) + count_tokens(user_message)
    budget = limit - RESPONSE_RESERVE
    return used <= budget, budget - used
