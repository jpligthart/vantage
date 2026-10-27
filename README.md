# Vantage

Local **document review** and **concept-feedback** assistant for teachers and policy reviewers (phase 1 MVP). Chat to analyse student work; draft your own notes, then let the AI help formulate concept feedback — you stay the editor.

## Prerequisites

- macOS with [OrbStack](https://orbstack.dev/) or Docker Desktop, or Windows with Docker Desktop
- [Ollama](https://ollama.com/) running on the host
- Pull a model, e.g. `ollama pull qwen2.5:7b`

## Quick start (Docker Compose)

1. Copy environment file:

   ```bash
   cp .env.example .env
   ```

2. Start Ollama on your host machine (not in Docker).

3. Build and run locally:

   ```bash
   docker compose up -d --build
   ```

4. Open [http://127.0.0.1:7847](http://127.0.0.1:7847) (change `HOST_WEB_PORT` in `.env` if needed).

5. Drag a PDF or DOCX onto the window, pick an Ollama model, wait for processing, then chat.

With Docker Compose, the backend is **not** published directly on the host; only `127.0.0.1:7847` is exposed and proxies `/api/` to the backend container.

## Building & Publishing Images (Multi-Arch)

`compose.yaml` builds multi-architecture (`linux/arm64` + `linux/amd64`) images. Without `IMAGE_REGISTRY` the tags stay local:

- `vantage-backend:latest`
- `vantage-frontend:latest`

Set `IMAGE_REGISTRY` in `.env` to a registry prefix **with a trailing slash** (for example `registry.example.com/myorg/`) before pushing.

```bash
# Log in to your registry
docker login registry.example.com

# Build multi-arch images and push directly
docker compose build --push
```

## Production / Pre-built Deployment

To run Vantage from pre-built registry images without cloning the full repository, copy `compose.prod.yaml` and `.env.example` (as `.env`) to a folder, set `IMAGE_REGISTRY` (trailing slash required), and run:

```bash
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d
```

All persistent data (SQLite database, uploaded documents, Docling output, and HuggingFace model cache) is stored in `./data` relative to the Compose file. The UI is bound to `127.0.0.1` only (see [Security](#security)).

## Local development (without Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1
pip install -e ".[dev]"
export DATA_DIR=../data DATABASE_URL=sqlite:///../data/vantage.db
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

Runtime files live in `./data` (gitignored): SQLite DB (`vantage.db`), uploaded sources, Docling JSON/HTML, and local OCR/layout model cache. Never commit or share `./data` — it can contain student work and names.

## Security

Vantage is a **local single-user** tool. There is **no authentication**. Compose binds the UI to `127.0.0.1` only. Do not expose it on a LAN, VPN, or public host without a reverse proxy and access control in front. Web/DokuWiki import makes outbound HTTP(S) requests from the server; only run that against sources you trust.

## Tests

```bash
cd backend && pytest
```

Manual AI checklist: [docs/manual-eval-checklist.md](docs/manual-eval-checklist.md)

Architecture decisions: [docs/decisions/](docs/decisions/)

## License

Copyright (C) 2026 JP Ligthart.

This program is free software: you can redistribute it and/or modify it under the terms of the [GNU General Public License](LICENSE) as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
