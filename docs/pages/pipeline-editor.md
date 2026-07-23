# Pipeline Editor

**UI:** `frontend/src/pages/PipelineBuilderPage.tsx`  
**Export helpers:** `frontend/src/pipelineExport.ts`

## Supports

- React Flow canvas (tasks + source/sink data nodes)
- Live task palette from PipeKG (`GET /tasks`) with search and detail modal
- Parameter editing on configurable tasks
- Data elements palette (`GET /builder/data-elements`)
- Load example pipelines (`GET /pipelines/examples`)
- Client-side format compatibility when connecting handles
- Remove nodes/edges; keyboard delete
- Export `pipeline.conf` as YAML or JSON; copy config and CLI preview

## Does not

- Run or schedule pipelines inside the app
- Persist custom DAGs on the server (export is client-side; examples are fixtures)

## After export

Pipelines are executed **externally**. Results must be reimported into the backend before Results/Leaderboard show them.

See **[Run & reimport](../run-and-reimport.md)**.
