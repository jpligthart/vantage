from app.agents.prompts import BASE_SYSTEM_PROMPT, MODE_PROMPTS


def test_spar_mode_critical_wording():
    spar = MODE_PROMPTS["spar"]
    assert "tegenbewijs" in spar.lower() or "kritisch" in spar.lower()


def test_base_prompt_missing_proof():
    lower = BASE_SYSTEM_PROMPT.lower()
    assert "ontbrekend bewijs" in lower
    assert "competentie" in lower
