# Review Assistant

Local document review assistant for teachers (phase 1 MVP).

## Prerequisites

- macOS with [OrbStack](https://orbstack.dev/) or Docker Desktop
- [Ollama](https://ollama.com/) running on the host (Apple Silicon)
- Pull a model, e.g. `ollama pull qwen2.5:7b`

## Quick start

1. Copy environment file:

   ```bash
   cp .env.example .env
   ```

2. Start Ollama on your Mac (not in Docker).

3. Build and run:

   ```bash
   docker compose up --build
   ```

4. Open [http://127.0.0.1:7847](http://127.0.0.1:7847) (change `HOST_WEB_PORT` in `.env` if needed).

5. Drag a PDF or DOCX onto the window, pick an Ollama model, wait for processing, then chat.

API docs (via Vite proxy, same port): [http://127.0.0.1:7847/docs](http://127.0.0.1:7847/docs)

With Docker Compose, the backend is **not** published on the host; only `127.0.0.1:7847` is exposed.

## Local development (without Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1
pip install -e ".[dev]"
export DATA_DIR=../data DATABASE_URL=sqlite:///../data/review_assistant.db
alembic upgrade head
uvicorn app.main:app --reload --app-dir .
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Generate OpenAPI types (backend must be running):

```bash
npm run generate-api-types
```

## Data

Runtime files live in `./data` (gitignored): SQLite DB, uploaded sources, Docling JSON/HTML.

## Windows note

Primary target is macOS + OrbStack. On Windows, ensure `host.docker.internal` resolves for Ollama from containers.

## Tests

```bash
cd backend && pytest
```

Manual AI checklist: [docs/manual-eval-checklist.md](docs/manual-eval-checklist.md)

Architecture decisions: [docs/decisions/](docs/decisions/)
