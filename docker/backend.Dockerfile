FROM python:3.12-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/data/model-cache/huggingface \
    TRANSFORMERS_CACHE=/app/data/model-cache/huggingface

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/pyproject.toml backend/README.md /app/backend/
RUN pip install --upgrade pip \
    && pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN pip install /app/backend

COPY --chown=1000:1000 backend /app/backend
RUN pip install --no-deps -e /app/backend

RUN useradd -m -u 1000 appuser \
    && mkdir -p /app/data/model-cache/huggingface \
    && mkdir -p /usr/local/lib/python3.12/site-packages/rapidocr/models \
    && chown -R appuser:appuser /app/data /usr/local/lib/python3.12/site-packages/rapidocr/models
USER appuser
WORKDIR /app/backend

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
