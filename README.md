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

Backend setup instructions (including `uv` venv + dependencies) are in:

- `backend/README.md`

Quick run from repo root:

```bash
uv run uvicorn app:app --app-dir backend --reload --port 8000
```

### Frontend

From `frontend`:

```bash
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:8000`.

### Frontend GitHub Pages Deploy

The repo includes a workflow at `.github/workflows/deploy-frontend-pages.yml` that builds and deploys `frontend/` to GitHub Pages on pushes to `main` when frontend files change.
The workflow sets `VITE_API_BASE` to `https://kgpipe-demo.v122.de/` for production builds.

One-time repository setup:

1. In GitHub, go to **Settings -> Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

## Next Steps

1. Replace mock API responses with live `PipeKG` queries.
2. Add compatibility checks on edge creation.
3. Persist/load pipeline DAG JSON.

