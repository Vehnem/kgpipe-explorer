export type DataPortSpec = {
  name: string;
  format: string;
};

export type ParameterSpec = {
  uri?: string;
  name: string;
  datatype: string;
  required?: boolean;
  default_value?: string | number | boolean | null;
  allowed_values?: Array<string | number | boolean>;
  alias_keys?: string[];
  minimum?: number | null;
  maximum?: number | null;
  unit?: string | null;
};

export type ConfigSpec = {
  uri?: string;
  name: string;
  description?: string | null;
  parameters: ParameterSpec[];
};

export type TaskSpec = {
  uri?: string;
  name: string;
  description?: string | null;
  version?: string | null;
  see_also?: string[];
  inputs: string[];
  outputs: string[];
  input_ports?: DataPortSpec[];
  output_ports?: DataPortSpec[];
  implements_method?: string[];
  uses_tool?: string[];
  has_parameter?: string[];
  config_spec?: ConfigSpec | null;
};

export type SparqlConstructResponse = Record<string, unknown>;

export type SparqlQueryResult = {
  head?: { vars?: string[] };
  boolean?: boolean;
  results?: {
    bindings?: Array<Record<string, SparqlBindingTerm>>;
  };
};

export type SparqlBindingTerm = {
  type: string;
  value: string;
  datatype?: string;
  "xml:lang"?: string;
};

export type DataViewPipelineResult = {
  pipeline: string;
  stage: string | null;
  kg_path: string | null;
  error: string | null;
  result: SparqlQueryResult | null;
};

export type SavedSparqlExample = {
  label: string;
  query: string;
};

/** explorer = Metadata Explorer; dataview = Pipeline Results Data View. */
export type SparqlExampleScope = "explorer" | "dataview";

export type ArtifactFile = {
  name: string;
  description: string;
  mime_type: string;
  size_bytes: number;
  path: string;
  category?: "meta" | "kg" | "tmp" | "file";
};

export type StageArtifacts = {
  files: ArtifactFile[];
  tmp_count: number;
  /** Uncompressed size of intermediate files. The zip download is smaller. */
  tmp_bytes?: number;
};

/** { pipeline_id: { stage_id: StageArtifacts } } */
export type ResultsArtifacts = Record<string, Record<string, StageArtifacts>>;

export type BenchmarkRun = {
  id: string;
  name: string;
  description: string;
};

export type PipelineStepMetadata = {
  step_number: number;
  task_family: string;
  task_name: string;
  description: string;
};

export type PipelineMetadata = {
  id: string;
  uri: string;
  display_name: string;
  kind: "atomic" | "composite";
  description: string;
  task_sequence: string[];
  steps: PipelineStepMetadata[];
  variant?: string | null;
};

/** pipeline_id → metadata */
export type PipelineMetadataMap = Record<string, PipelineMetadata>;

export type MeasurementMetadata = {
  key: string;
  measurement_name: string;
  unit?: string | null;
  alias: string[];
  measurement_uri?: string | null;
  metric_key: string;
  metric_description?: string | null;
  metric_type?: string | null;
};

/** displayed metric name / alias → metadata */
export type MeasurementMetadataMap = Record<string, MeasurementMetadata>;

export type ExamplePipelineNode = {
  id: string;
  task_name: string;
  inputs: string[];
  outputs: string[];
  position_x: number;
  position_y: number;
  node_type?: string;   // "taskNode" (default) | "dataNode"
  format?: string;      // dataNode: format string, e.g. "txt", "ttl"
  data_kind?: string;   // dataNode: "source" | "sink"
  input_ports?: DataPortSpec[];
  output_ports?: DataPortSpec[];
};

export type ExamplePipelineEdge = {
  source: string;
  target: string;
  source_handle: string;
  target_handle: string;
  format_label: string;
};

export type ExamplePipeline = {
  id: string;
  name: string;
  description: string;
  nodes: ExamplePipelineNode[];
  edges: ExamplePipelineEdge[];
};

export type DataElement = {
  label: string;
  format: string;
  data_kind: "source" | "sink";
};

export type EntityTypeInfo = {
  id: string;
  label: string;
  prefixed: string;
};

export type EntityTypesResponse = {
  types: EntityTypeInfo[];
  discovery_query: string;
};

export type LeaderboardGroupConfig = {
  id: string;
  label: string;
  aggregator: string;
  weight: number;
};

export type MetricGroupRule = {
  match: "exact" | "prefix" | string;
  value: string;
  group_id: string;
};

export type LeaderboardDefaults = {
  groups: LeaderboardGroupConfig[];
  metric_group_rules: MetricGroupRule[];
  fallback_group_id: string;
  default_benchmark_run_id: string;
};

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ??
  "http://localhost:18000";

export async function fetchTasks(): Promise<TaskSpec[]> {
  const res = await fetch(`${API_BASE}/tasks`);
  if (!res.ok) {
    throw new Error(`Failed to fetch tasks (${res.status})`);
  }
  return (await res.json()) as TaskSpec[];
}

export async function constructSparql(
  query: string
): Promise<SparqlConstructResponse> {
  const res = await fetch(`${API_BASE}/sparql/construct`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
  });
  if (!res.ok) {
    throw new Error(`Failed to run SPARQL construct (${res.status})`);
  }
  return (await res.json()) as SparqlConstructResponse;
}

export async function fetchSavedSparqlExamples(
  scope: SparqlExampleScope = "explorer"
): Promise<SavedSparqlExample[]> {
  const url = new URL(`${API_BASE}/sparql/examples`);
  url.searchParams.set("scope", scope);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch saved SPARQL examples (${res.status})`);
  }
  return (await res.json()) as SavedSparqlExample[];
}

export async function saveSparqlExample(
  payload: SavedSparqlExample,
  scope: SparqlExampleScope = "explorer"
): Promise<SavedSparqlExample> {
  const url = new URL(`${API_BASE}/sparql/examples`);
  url.searchParams.set("scope", scope);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const maybe = (await res.json().catch(() => null)) as { detail?: unknown } | null;
    const detail = typeof maybe?.detail === "string" ? `: ${maybe.detail}` : "";
    throw new Error(`Failed to save SPARQL example (${res.status})${detail}`);
  }
  return (await res.json()) as SavedSparqlExample;
}

export async function fetchPipelineMetadata(
  runId?: string,
  ids?: string[]
): Promise<PipelineMetadataMap> {
  const url = new URL(`${API_BASE}/pipelines/metadata`);
  if (runId) {
    url.searchParams.set("run_id", runId);
  }
  if (ids && ids.length > 0) {
    url.searchParams.set("ids", ids.join(","));
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch pipeline metadata (${res.status})`);
  }
  return (await res.json()) as PipelineMetadataMap;
}

export async function fetchMeasurementMetadata(
  ids?: string[]
): Promise<MeasurementMetadataMap> {
  const url = new URL(`${API_BASE}/metrics/metadata`);
  if (ids && ids.length > 0) {
    url.searchParams.set("ids", ids.join(","));
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch measurement metadata (${res.status})`);
  }
  return (await res.json()) as MeasurementMetadataMap;
}

export async function fetchBenchmarkRuns(): Promise<BenchmarkRun[]> {
  const res = await fetch(`${API_BASE}/benchmarks/runs`);
  if (!res.ok) {
    throw new Error(`Failed to fetch benchmark runs (${res.status})`);
  }
  return (await res.json()) as BenchmarkRun[];
}

export async function fetchLeaderboardRunsTsv(runId?: string): Promise<string> {
  const url = new URL(`${API_BASE}/leaderboard/runs`);
  if (runId) {
    url.searchParams.set("run_id", runId);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch leaderboard runs (${res.status})`);
  }
  const payload = (await res.json()) as { tsv?: unknown };
  if (typeof payload.tsv !== "string") {
    throw new Error("Leaderboard runs response missing TSV payload");
  }
  return payload.tsv;
}

export async function fetchExamplePipelines(): Promise<ExamplePipeline[]> {
  const res = await fetch(`${API_BASE}/pipelines/examples`);
  if (!res.ok) {
    throw new Error(`Failed to fetch example pipelines (${res.status})`);
  }
  return (await res.json()) as ExamplePipeline[];
}

export async function fetchResultsArtifacts(runId?: string): Promise<ResultsArtifacts> {
  const url = new URL(`${API_BASE}/results/artifacts`);
  if (runId) {
    url.searchParams.set("run_id", runId);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch results artifacts (${res.status})`);
  }
  return (await res.json()) as ResultsArtifacts;
}

export function resultsArtifactFileUrl(
  pipeline: string,
  stage: string,
  name: string,
  runId?: string
): string {
  const url = new URL(`${API_BASE}/results/artifacts/file`);
  url.searchParams.set("pipeline", pipeline);
  url.searchParams.set("stage", stage);
  url.searchParams.set("name", name);
  if (runId) {
    url.searchParams.set("run_id", runId);
  }
  return url.toString();
}

export function resultsTmpZipUrl(pipeline: string, stage: string, runId?: string): string {
  const url = new URL(`${API_BASE}/results/artifacts/tmp.zip`);
  url.searchParams.set("pipeline", pipeline);
  url.searchParams.set("stage", stage);
  if (runId) {
    url.searchParams.set("run_id", runId);
  }
  return url.toString();
}

export async function fetchResultsTmpArtifacts(
  pipeline: string,
  stage: string,
  runId?: string
): Promise<ArtifactFile[]> {
  const url = new URL(`${API_BASE}/results/artifacts/tmp`);
  url.searchParams.set("pipeline", pipeline);
  url.searchParams.set("stage", stage);
  if (runId) {
    url.searchParams.set("run_id", runId);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch tmp artifacts (${res.status})`);
  }
  return (await res.json()) as ArtifactFile[];
}

export async function queryPipelineKgs(
  query: string,
  pipelines: string[],
  runId?: string
): Promise<DataViewPipelineResult[]> {
  const res = await fetch(`${API_BASE}/results/dataview/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, pipelines, run_id: runId ?? null })
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      detail ? `Failed to run pipeline KG query (${res.status}): ${detail}` : `Failed to run pipeline KG query (${res.status})`
    );
  }
  return (await res.json()) as DataViewPipelineResult[];
}

export async function fetchDataElements(): Promise<DataElement[]> {
  const res = await fetch(`${API_BASE}/builder/data-elements`);
  if (!res.ok) {
    throw new Error(`Failed to fetch data elements (${res.status})`);
  }
  return (await res.json()) as DataElement[];
}

export async function fetchBuiltinSparqlExamples(
  scope: SparqlExampleScope = "explorer"
): Promise<SavedSparqlExample[]> {
  const url = new URL(`${API_BASE}/sparql/examples/builtin`);
  url.searchParams.set("scope", scope);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch builtin SPARQL examples (${res.status})`);
  }
  return (await res.json()) as SavedSparqlExample[];
}

export async function fetchEntityTypes(): Promise<EntityTypesResponse> {
  const res = await fetch(`${API_BASE}/ontology/entity-types`);
  if (!res.ok) {
    throw new Error(`Failed to fetch entity types (${res.status})`);
  }
  return (await res.json()) as EntityTypesResponse;
}

export async function fetchLeaderboardDefaults(): Promise<LeaderboardDefaults> {
  const res = await fetch(`${API_BASE}/leaderboard/defaults`);
  if (!res.ok) {
    throw new Error(`Failed to fetch leaderboard defaults (${res.status})`);
  }
  return (await res.json()) as LeaderboardDefaults;
}
