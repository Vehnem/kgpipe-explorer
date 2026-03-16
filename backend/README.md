# Backend Setup (uv + venv)

This backend uses FastAPI and `PipeKG` integration points.

## Prerequisites

- Python 3.10+ (3.11 recommended)
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

Install:

```bash
uv pip install fastapi pydantic uvicorn kgpipe
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

