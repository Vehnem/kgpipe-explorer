import type { Edge, Node } from "@xyflow/react";

export type PipelineParameterValue = string | number | boolean;

export type PipelineTaskConfig = {
  name: string;
  parameters: Record<string, PipelineParameterValue>;
};

/** A bare task name, or a task plus the parameter values configured on that node. */
export type PipelineTaskEntry = string | PipelineTaskConfig;

export type OrderedPipelineTask = {
  name: string;
  parameters: Record<string, PipelineParameterValue>;
};

export type PipelineConfEntry = {
  description: string;
  tasks: PipelineTaskEntry[];
};

export type PipelineConf = Record<string, PipelineConfEntry>;

type TaskNodeData = {
  label: string;
  parameterValues?: Record<string, PipelineParameterValue>;
  configSpec?: {
    parameters?: Array<{ name: string }>;
  } | null;
};

function parametersFromNode(data: TaskNodeData): Record<string, PipelineParameterValue> {
  const values = data.parameterValues ?? {};
  const specOrder = (data.configSpec?.parameters ?? []).map((param) => param.name);
  const names = [
    ...specOrder.filter((name) => values[name] !== undefined),
    ...Object.keys(values).filter((name) => !specOrder.includes(name) && values[name] !== undefined)
  ];
  const parameters: Record<string, PipelineParameterValue> = {};
  for (const name of names) {
    const value = values[name];
    if (value === undefined) continue;
    parameters[name] = value;
  }
  return parameters;
}

export function extractTaskOrder(
  nodes: Node[],
  edges: Edge[]
): { tasks: OrderedPipelineTask[]; warnings: string[] } {
  const taskNodes = nodes.filter((node) => node.type === "taskNode");
  if (taskNodes.length === 0) {
    return { tasks: [], warnings: ["Add at least one task node to export a pipeline."] };
  }

  const taskIds = new Set(taskNodes.map((node) => node.id));
  const labelById = new Map(
    taskNodes.map((node) => [node.id, (node.data as TaskNodeData).label])
  );
  const parametersById = new Map(
    taskNodes.map((node) => [node.id, parametersFromNode(node.data as TaskNodeData)])
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
    tasks: orderedIds.map((id) => ({
      name: labelById.get(id) ?? id,
      parameters: parametersById.get(id) ?? {}
    })),
    warnings
  };
}

function toTaskEntry(task: OrderedPipelineTask): PipelineTaskEntry {
  if (Object.keys(task.parameters).length === 0) return task.name;
  return { name: task.name, parameters: task.parameters };
}

export function buildPipelineConf(
  pipelineName: string,
  description: string,
  tasks: OrderedPipelineTask[]
): PipelineConf {
  const key = pipelineName.trim() || "builder_pipeline";
  return {
    [key]: {
      description: description.trim() || "Pipeline exported from KGpipe Pipeline Editor",
      tasks: tasks.map(toTaskEntry)
    }
  };
}

function yamlToken(value: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value)) return value;
  return JSON.stringify(value);
}

function yamlScalar(value: PipelineParameterValue): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

export function toPipelineYaml(conf: PipelineConf): string {
  const lines: string[] = [];
  for (const [name, entry] of Object.entries(conf)) {
    lines.push(`${yamlToken(name)}:`);
    lines.push(`    description: ${JSON.stringify(entry.description)}`);
    lines.push("    tasks:");
    entry.tasks.forEach((task, index) => {
      const taskName = typeof task === "string" ? task : task.name;
      lines.push(`        # ${index + 1} ${taskName}`);
      if (typeof task === "string" || Object.keys(task.parameters).length === 0) {
        lines.push(`        - ${yamlToken(taskName)}`);
        return;
      }
      lines.push(`        - name: ${yamlToken(taskName)}`);
      lines.push("          parameters:");
      for (const [key, value] of Object.entries(task.parameters)) {
        lines.push(`            ${yamlToken(key)}: ${yamlScalar(value)}`);
      }
    });
  }
  return `${lines.join("\n")}\n`;
}

export function toPipelineJson(conf: PipelineConf): string {
  return `${JSON.stringify(conf, null, 2)}\n`;
}

function shellToken(value: string): string {
  if (/^[A-Za-z0-9_./:+@=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildCliCommand(
  pipelineName: string,
  options: {
    configFile?: string;
    sourceFile?: string;
    seedKg?: string;
    ontology?: string;
  } = {}
): string {
  const name = pipelineName.trim() || "builder_pipeline";
  const configFile = options.configFile?.trim() || "pipeline.conf";
  const sourceFile = options.sourceFile?.trim() || "SOURCE_FILE";
  const seedKg = options.seedKg?.trim() || "SEED_KG";
  const ontology = options.ontology?.trim() || "";
  const parts = [
    "kgpipe",
    "run",
    shellToken(configFile),
    "--pipeline",
    shellToken(name),
    "--input",
    shellToken(sourceFile),
    "--target",
    shellToken(seedKg)
  ];
  if (ontology) {
    parts.push("--ontology", shellToken(ontology));
  }
  parts.push("--output", "./output", "--dry-run");
  return parts.join(" ");
}

export function slugifyPipelineName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "builder_pipeline";
}
