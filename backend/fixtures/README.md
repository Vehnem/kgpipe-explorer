# Demo data artifacts

Domain data that is **not** live from Virtuoso SPARQL or the saved-queries SQLite DB lives in this folder. Files are loaded into memory when the FastAPI backend starts (`fixtures_loader.load_fixtures()`).

## Fixture files (this directory)

| File | Served by | Purpose |
|------|-----------|---------|
| `example_pipelines.json` | `GET /pipelines/examples` | Builder “Load example” DAGs |
| `benchmarks.json` | `GET /benchmarks/runs`, leaderboard/results | Benchmark catalog + TSV / filter rules |
| `pipeline_naming.json` | `GET /pipelines/metadata` | Task-family / variant display names |
| `stage_artifacts.json` | `GET /results/artifacts` | Mock artifact templates per stage |
| `data_elements.json` | `GET /builder/data-elements` | Builder source/sink palette |
| `sparql_builtin_examples.json` | `GET /sparql/examples/builtin` | Seed SPARQL CONSTRUCT examples |
| `entity_types.json` | `GET /ontology/entity-types` | Explorer entity filters + discovery query |
| `leaderboard_defaults.json` | `GET /leaderboard/defaults` | Default metric groups + assignment rules |
| `runs/*.tsv` | `GET /leaderboard/runs` | Per-benchmark (or shared base) metric rows |

## How benchmarks connect to runs TSV files

For each entry in `benchmarks.json`:

1. **Dedicated file (preferred)**  
   - Explicit `"tsv": "runs/<id>.tsv"`, **or**  
   - Convention: if `runs/<benchmark_id>.tsv` exists, it is used automatically.  
   That file is returned as-is (no filter / perturb).

2. **Derived (fallback)**  
   If there is no dedicated file, metrics are built from `"base_tsv"` (default: `runs/kgi-bench-movie.tsv`) using `filter` / `perturb` / `pipeline_allowlist`.

Example: add `runs/kgi-bench-people.tsv` and the People benchmark will show those rows on the next backend restart (convention match). You can also set `"tsv": "runs/kgi-bench-people.tsv"` explicitly and drop the filter/perturb fields.

## Live / external artifacts (not fixtures)

| Artifact | Location | Used by | Purpose |
|----------|----------|---------|---------|
| Virtuoso SPARQL endpoint | `SYS_KG_URL` in kgpipe config (e.g. `sparql://localhost:18890/sparql-auth`) | `GET /tasks`, `POST /compatibility/check`, `POST /sparql/construct` | Live PipeKG system graph |
| Saved SPARQL examples DB | `backend/saved_queries.sqlite` | `GET/POST /sparql/examples` | User-persisted queries |

## How to update demo data later

1. Edit or replace the relevant file under `fixtures/`.
2. Restart the backend (fixtures are loaded once at startup).
3. No frontend redeploy is required for catalog changes served by these endpoints.
