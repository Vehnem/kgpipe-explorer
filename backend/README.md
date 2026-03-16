# Backend Setup (uv + venv)

This backend uses FastAPI and `PipeKG` integration points.

## Prerequisites

- Python 3.10+ (3.11 recommended for local dev)
- [`uv`](https://docs.astral.sh/uv/)

## Create and activate a virtual environment

From repo root:

```bash
cd backend
uv venv .venv
source .venv/bin/activate
```

## Install backend dependencies

Dependencies scanned from `backend/app.py` imports:

- `fastapi`
- `pydantic`
- `uvicorn` (ASGI server for local dev)
- `kgpipe` (provides `kgpipe.common.*`)

Install base dependencies:

```bash
uv pip install -r requirements.txt
```

Install `kgpipe` from GitHub:

```bash
uv pip install "git+https://github.com/ScaDS/KGpipe.git"
```

Equivalent `pip` command:

```bash
pip install "git+https://github.com/ScaDS/KGpipe.git"
```

If `kgpipe` is local (not on PyPI), install from your local project path instead:

```bash
uv pip install -e /path/to/kgpipe
```

## Run the backend

From `backend/` with the venv activated:

```bash
uv run uvicorn app:app --reload --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

## Run with Docker

The Docker image uses Python 3.12, matching current `kgpipe` requirements.

Build from repo root:

```bash
docker build -f backend/Dockerfile -t kgpipe-explorer-backend .
```

Run:

```bash
docker run --rm -p 8000:8000 kgpipe-explorer-backend
```

Health check:

```bash
curl http://localhost:8000/health
```

The Dockerfile installs `kgpipe` from GitHub by default. To use a different source, override `KGPIPE_PIP_SPEC` at build time:

```bash
docker build \
  --build-arg KGPIPE_PIP_SPEC="git+https://github.com/ORG/REPO.git@main" \
  -f backend/Dockerfile \
  -t kgpipe-explorer-backend .
```

