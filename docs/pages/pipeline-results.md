# Pipeline Results

**UI:** `frontend/src/pages/ResultsPage.tsx`

## Supports

- Benchmark run selector (fixture catalog)
- Select up to two pipelines for side-by-side comparison
- Metrics: summary (stage means) and per-stage views
- Data Artifacts panel (mock listings per stage)
- Data View UI: shared SPARQL editor, final-KG targets, table/graph placeholders
- Practice guide: select R_A / R_B → artifacts → Data View → Run Query

## Limitations

- Metric/artifact data comes from **fixtures**, not a live run of the Pipeline Editor export
- **Run Query** in Data View is a placeholder (no SPARQL against per-pipeline final KGs yet)
- Artifact paths are illustrative templates

## Related

- [Run & reimport](../run-and-reimport.md) — how builder exports become Results data
- [Tutorials](./tutorials.md)
