# Pipeline Leaderboard

**UI:** `frontend/src/pages/PipelineLeaderboardPage.tsx`

## Supports

- Same benchmark / runs TSV source as Results
- Default metric groups and assignment rules from fixtures
- Edit subgroups (name, aggregator, weight); add/remove groups
- Per-metric enable, subgroup assignment, stage selection, stage aggregator
- Pipeline multi-select (All / None / individual)
- Rank preview modes: Table, Distribution, Figure, Bars, Heatmap
- Shareable compact URL state (`?cfg=…`)
- Practice guide: clear selection/groups → RDF pipelines → Accuracy + Coverage → assign metrics → Distribution

## Limitations

- Rankings reflect **fixture metrics**, not an in-app pipeline execution
- Consistency and other default groups may be cleared during practice; Accuracy/Coverage are the guided restore path

## Related

- [Run & reimport](../run-and-reimport.md)
- [Tutorials](./tutorials.md)
