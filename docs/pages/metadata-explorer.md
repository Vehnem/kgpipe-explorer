# Metadata Explorer

**UI:** `frontend/src/pages/MetadataExplorerPage.tsx`

## Supports

- Live SPARQL CONSTRUCT against PipeKG / Virtuoso (`POST /sparql/construct`)
- Builtin example queries from fixtures; save/load user examples (SQLite)
- Entity-type filters and discovery query from fixtures
- Entity list, search, insert URI into query (`VALUES`)
- Cytoscape graph visualization (several layouts)
- Entity detail (outgoing triples; task specs when the URI matches `/tasks`)
- Deep link: `?page=explorer&entity=<uri>`

## Depends on

- Reachable SPARQL endpoint (`SYS_KG_URL` in kgpipe config)
- Backend `/tasks` for task-linked detail panels
