export type TaskSpec = {
  name: string;
  inputs: string[];
  outputs: string[];
};

const API_BASE = "http://localhost:7777";

export async function fetchTasks(): Promise<TaskSpec[]> {
  const res = await fetch(`${API_BASE}/tasks`);
  if (!res.ok) {
    throw new Error(`Failed to fetch tasks (${res.status})`);
  }
  return (await res.json()) as TaskSpec[];
}
