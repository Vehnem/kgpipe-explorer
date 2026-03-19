export type TaskSpec = {
  uri?: string;
  name: string;
  inputs: string[];
  outputs: string[];
  implements_method?: string[];
  uses_tool?: string[];
  has_parameter?: string[];
};

export type SparqlConstructResponse = Record<string, unknown>;

export type ArtifactFile = {
  name: string;
  description: string;
  mime_type: string;
  size_bytes: number;
  path: string;
};

/** { pipeline_id: { stage_id: ArtifactFile[] } } */
export type ResultsArtifacts = Record<string, Record<string, ArtifactFile[]>>;

export type ExamplePipelineNode = {
  id: string;
  task_name: string;
  inputs: string[];
  outputs: string[];
  position_x: number;
  position_y: number;
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

export async function fetchLeaderboardRunsTsv(): Promise<string> {
  const res = await fetch(`${API_BASE}/leaderboard/runs`);
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

export async function fetchResultsArtifacts(): Promise<ResultsArtifacts> {
  const res = await fetch(`${API_BASE}/results/artifacts`);
  if (!res.ok) {
    throw new Error(`Failed to fetch results artifacts (${res.status})`);
  }
  return (await res.json()) as ResultsArtifacts;
}
