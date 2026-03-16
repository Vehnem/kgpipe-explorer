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

const API_BASE = "http://localhost:7777";

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
