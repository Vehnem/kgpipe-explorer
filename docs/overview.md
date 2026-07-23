# What the demo supports

KGpipe Explorer is a five-page React + FastAPI workspace for learning knowledge-graph concepts, inspecting PipeKG metadata, sketching pipelines, comparing benchmark results, and exploring rankings.

## Pages at a glance

| Page | Role |
|------|------|
| **Learn** | Welcome, suggested workflow, KG primer, references |
| **Metadata Explorer** | Live SPARQL CONSTRUCT over the system KG; entity graph and detail |
| **Pipeline Editor** | React Flow DAG editor; load examples; export `pipeline.conf` |
| **Pipeline Results** | Compare up to two pipelines (metrics + mock artifacts + Data View UI) |
| **Pipeline Leaderboard** | Configurable two-level ranking; table and distribution previews |

Guided **page tours** and **practice guides** (builder, results, leaderboard) are available from the `?` help menu. See [Tutorials](./pages/tutorials.md).

## What is live vs fixture-backed

**Live (PipeKG / Virtuoso):**

- Task catalog for the builder (`GET /tasks`)
- SPARQL CONSTRUCT in Metadata Explorer
- Metric measurement metadata for tooltips

**Fixture-backed (loaded at backend start):**

- Example pipelines, data elements, leaderboard defaults
- Benchmark runs and metric TSVs
- Mock stage artifacts
- Builtin SPARQL examples, entity-type filters, pipeline naming

Details: [backend/fixtures/README.md](../backend/fixtures/README.md).

## Important limitation: execution is external

The Pipeline Editor **does not run pipelines**. Exported configs are meant to be executed **outside** this app (KGpipe / experiment tooling). Measured results and artifacts must be **reimported into the backend fixtures** (or equivalent data feed) before they appear in Results or the Leaderboard.

See **[Run & reimport](./run-and-reimport.md)**.

## Other known gaps

- Results **Data View** “Run Query” is a UI placeholder (no SPARQL against per-pipeline final KGs yet).
- Artifact listings are **mock templates**, not downloadable run files.
- Pipeline display names use naming conventions, not full PipeKG lookups.
- Custom DAGs are not persisted server-side (examples come from fixtures; export is client-side).

## Stack

- Frontend: React, TypeScript, Vite, React Flow, Cytoscape, driver.js
- Backend: FastAPI, kgpipe / PipeKG, fixture loader, optional Virtuoso via `SYS_KG_URL`
