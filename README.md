# KGpipe Explorer Development Notes

This folder is the playground for a richer pipeline explorer UI.

## Goal

Move from Streamlit prototyping to a small web app architecture:

- React frontend for DAG editing/visualization
- Python API backend for compatibility logic and KG-backed data

## Layout

- `frontend/`: React + TypeScript + Vite + React Flow
- `backend/`: FastAPI API stub (to be connected to `PipeKG`)

## Quick Start

### Backend

From repo root:

```bash
uv run uvicorn app:app --app-dir experiments/explorer/backend --reload --port 8000
```

### Frontend

From `experiments/explorer/frontend`:

```bash
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:8000`.

## Next Steps

1. Replace mock API responses with live `PipeKG` queries.
2. Add compatibility checks on edge creation.
3. Persist/load pipeline DAG JSON.

