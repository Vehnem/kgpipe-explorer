import type { Edge, Node } from "@xyflow/react";

export type PipelineConfEntry = {
  description: string;
  tasks: string[];
};

export type PipelineConf = Record<string, PipelineConfEntry>;

type TaskNodeData = {
  label: string;
};

export function extractTaskOrder(
  nodes: Node[],
  edges: Edge[]
): { taskNames: string[]; warnings: string[] } {
  const taskNodes = nodes.filter((node) => node.type === "taskNode");
  if (taskNodes.length === 0) {
    return { taskNames: [], warnings: ["Add at least one task node to export a pipeline."] };
  }

  const taskIds = new Set(taskNodes.map((node) => node.id));
  const labelById = new Map(
    taskNodes.map((node) => [node.id, (node.data as TaskNodeData).label])
  );
  const positionById = new Map(taskNodes.map((node) => [node.id, node.position.x]));

  const adjacency = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  for (const id of taskIds) {
    adjacency.set(id, new Set());
    inDegree.set(id, 0);
  }

  for (const edge of edges) {
    if (!taskIds.has(edge.source) || !taskIds.has(edge.target)) continue;
    const next = adjacency.get(edge.source);
    if (!next || next.has(edge.target)) continue;
    next.add(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const warnings: string[] = [];
  const queue = [...taskIds]
    .filter((id) => (inDegree.get(id) ?? 0) === 0)
    .sort((a, b) => (positionById.get(a) ?? 0) - (positionById.get(b) ?? 0));

  const orderedIds: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    queue.sort((a, b) => (positionById.get(a) ?? 0) - (positionById.get(b) ?? 0));
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    orderedIds.push(current);

    for (const nextId of adjacency.get(current) ?? []) {
      inDegree.set(nextId, (inDegree.get(nextId) ?? 0) - 1);
      if ((inDegree.get(nextId) ?? 0) === 0) {
        queue.push(nextId);
      }
    }
  }

  if (visited.size < taskIds.size) {
    warnings.push("The graph contains a cycle — task order may be incomplete.");
    const remaining = [...taskIds]
      .filter((id) => !visited.has(id))
      .sort((a, b) => (positionById.get(a) ?? 0) - (positionById.get(b) ?? 0));
    orderedIds.push(...remaining);
  }

  const connected = new Set<string>();
  for (const edge of edges) {
    if (taskIds.has(edge.source)) connected.add(edge.source);
    if (taskIds.has(edge.target)) connected.add(edge.target);
  }

  const orderedIdSet = new Set(orderedIds);
  const disconnected = taskNodes
    .filter((node) => !connected.has(node.id) && !orderedIdSet.has(node.id))
    .sort((a, b) => a.position.x - b.position.x);

  if (disconnected.length > 0) {
    warnings.push(`${disconnected.length} task node(s) are not connected and were appended.`);
    orderedIds.push(...disconnected.map((node) => node.id));
  }

  return {
    taskNames: orderedIds.map((id) => labelById.get(id) ?? id),
    warnings
  };
}

export function buildPipelineConf(
  pipelineName: string,
  description: string,
  tasks: string[]
): PipelineConf {
  const key = pipelineName.trim() || "builder_pipeline";
  return {
    [key]: {
      description: description.trim() || "Pipeline exported from KGpipe Pipeline Editor",
      tasks
    }
  };
}

export function toPipelineYaml(conf: PipelineConf): string {
  const lines: string[] = [];
  for (const [name, entry] of Object.entries(conf)) {
    lines.push(`${name}:`);
    lines.push(`    description: ${JSON.stringify(entry.description)}`);
    lines.push("    tasks:");
    entry.tasks.forEach((task, index) => {
      lines.push(`        # ${index + 1} ${task}`);
      lines.push(`        - ${task}`);
    });
  }
  return `${lines.join("\n")}\n`;
}

export function toPipelineJson(conf: PipelineConf): string {
  return `${JSON.stringify(conf, null, 2)}\n`;
}

export function buildCliCommand(pipelineName: string, configFile = "pipeline.conf"): string {
  const name = pipelineName.trim() || "builder_pipeline";
  return `kgpipe run ${configFile} --pipeline ${name} --output ./output --dry-run`;
}

export function slugifyPipelineName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "builder_pipeline";
}
