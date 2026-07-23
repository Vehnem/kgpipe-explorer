# Run pipelines externally and reimport results

The Pipeline Editor helps you **design** and **export** a pipeline. It does **not** execute tasks inside the browser or the dashboard API.

## Intended loop

```text
Pipeline Editor  →  export pipeline.conf
        ↓
External KGpipe / experiment run  →  metrics, stages, artifacts
        ↓
Update backend fixtures (or data feed)  →  restart backend
        ↓
Pipeline Results / Leaderboard
```

1. **Design** the DAG in the Pipeline Editor (examples, tasks, connections).
2. **Export** YAML or JSON `pipeline.conf` (and the CLI preview if useful).
3. **Run outside** this app with KGpipe / your experiment scripts (see KGpipe docs and moviekg experiment notes under `kgpipe/`).
4. **Reimport** measured outputs into the demo backend:
   - Metric tables as `backend/fixtures/runs/<benchmark-id>.tsv` (or update `benchmarks.json` to point at a new TSV).
   - Optionally adjust artifact templates in `stage_artifacts.json` if you want Results → Data Artifacts to reflect new stage files.
5. **Restart the backend** so fixtures reload.
6. Open **Pipeline Results** / **Leaderboard** and select the updated benchmark run and pipelines.

## Why this split exists

- Execution depends on Docker tasks, data mounts, and experiment configs that belong in KGpipe, not the explorer UI.
- The demo Results/Leaderboard surfaces are built around **benchmark fixtures** so the UI stays reproducible without a live run cluster.

## Where this is mentioned in the UI

- Learn page — workflow note on export → external run → reimport
- Pipeline Editor export dialog — short reminder under the CLI preview
- Builder practice guide — final export step points here

## Fixture update pointers

- [fixtures/README.md](../backend/fixtures/README.md) — which files feed Results/Leaderboard
- Dedicated TSV: add `runs/<id>.tsv` or set `"tsv"` on a benchmark in `benchmarks.json`
- Restart: fixtures load once at FastAPI startup

## Related KGpipe material

- KGpipe pipeline catalog / `pipeline.conf` usage in the KGpipe repository docs
- Experiment READMEs under `kgpipe/experiments/` (when working in the full monorepo)
