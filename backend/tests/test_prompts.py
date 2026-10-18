from app.agents.prompts import (
    BASE_SYSTEM_PROMPT,
    CHAT_STYLE_PROMPT,
    FEEDBACK_STYLE_PROMPT,
    MODE_PROMPTS,
)


def test_spar_mode_critical_wording():
    spar = MODE_PROMPTS["spar"]
    assert "tegenbewijs" in spar.lower() or "kritisch" in spar.lower()


def test_base_prompt_missing_proof():
    lower = BASE_SYSTEM_PROMPT.lower()
    assert "ontbrekend bewijs" in lower
    assert "competentie" in lower


def test_style_prompts_cover_length_not_role():
    chat = CHAT_STYLE_PROMPT.lower()
    feedback = FEEDBACK_STYLE_PROMPT.lower()
    assert "beknopt" in chat or "kort" in chat
    assert "filler" in chat or "inleid" in chat
    assert "je" in feedback
    assert "constructief" in feedback
    assert "chunk:" not in chat
    assert "chunk:" not in feedback
