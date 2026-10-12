# Manual AI evaluation checklist (phase 1)

Run with a fixed Ollama model after ingest of `backend/tests/fixtures/sample.txt` converted to PDF locally, or any small course document.

| Category | Test | Pass? |
|----------|------|-------|
| Vindbaarheid | Ask for a specific fact known to be in the document | |
| Bronbetrouwbaarheid | Citation chip opens correct page/section | |
| Volledigheid | Ask about content not in document; model admits missing info | |
| Kritisch vermogen | Claim document lacks support that is present; model corrects with citation | |
| Onzekerheid | Ask for competence judgment with no evidence; model separates missing proof vs skill | |
| Hallucinaties | No citation chips for non-existent chunk markers | |

Regression scenarios from REQUIREMENTS §10:

1. User claims no justification while justification exists → model finds passage.
2. User claims student lacks competence with only missing evidence → model explains distinction.
