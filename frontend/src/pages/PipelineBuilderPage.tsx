import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type NodeProps,
  type Edge,
  type Node,
  addEdge,
  type Connection
} from "@xyflow/react";
import type { TaskSpec } from "../api";

type PipelineNodeData = {
  label: string;
  inputs: string[];
  outputs: string[];
};

type PipelineNode = Node<PipelineNodeData>;

type PipelineBuilderPageProps = {
  tasks: TaskSpec[];
};

export function PipelineBuilderPage({ tasks }: PipelineBuilderPageProps) {
  const [selectedTask, setSelectedTask] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [connectionError, setConnectionError] = useState<string>("");
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTask("");
      return;
    }
    if (!selectedTask || !tasks.some((task) => task.name === selectedTask)) {
      setSelectedTask(tasks[0].name);
    }
  }, [tasks, selectedTask]);

  const taskByName = useMemo(
    () => Object.fromEntries(tasks.map((task) => [task.name, task])),
    [tasks]
  );

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((task) => {
      const haystack = [task.name, task.inputs.join(" "), task.outputs.join(" ")]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [search, tasks]);

  const visibleTasks = useMemo(() => filteredTasks.slice(0, 30), [filteredTasks]);

  function addNode(taskName: string = selectedTask) {
    if (!taskName) return;
    const task = taskByName[taskName];
    if (!task) return;
    const id = `n-${crypto.randomUUID().slice(0, 8)}`;
    const offset = nodes.length * 40;
    setNodes((prev) => [
      ...prev,
      {
        id,
        position: { x: 120 + offset, y: 120 + offset },
        type: "taskNode",
        data: {
          label: taskName,
          inputs: normalizeFormats(task.inputs),
          outputs: normalizeFormats(task.outputs)
        }
      }
    ]);
  }

  function onConnect(connection: Connection) {
    setConnectionError("");

    if (
      !connection.source ||
      !connection.target ||
      !connection.sourceHandle ||
      !connection.targetHandle
    ) {
      setConnectionError("Connect from output handle to input handle.");
      return;
    }
    if (connection.source === connection.target) {
      setConnectionError("Cannot connect a node to itself.");
      return;
    }

    const sourceFormat = parseHandleFormat(connection.sourceHandle, "out");
    const targetFormat = parseHandleFormat(connection.targetHandle, "in");
    if (!sourceFormat || !targetFormat) {
      setConnectionError("Invalid handle selection.");
      return;
    }

    const isCompatible =
      sourceFormat === targetFormat ||
      sourceFormat === "any" ||
      targetFormat === "any";
    if (!isCompatible) {
      setConnectionError(
        `Format mismatch: output "${sourceFormat}" cannot connect to input "${targetFormat}".`
      );
      return;
    }

    const edgeLabel =
      sourceFormat === targetFormat
        ? sourceFormat
        : sourceFormat === "any"
          ? targetFormat
          : sourceFormat;
    const edgeColor = formatColor(edgeLabel);

    setEdges((prev) =>
      addEdge(
        {
          ...connection,
          label: edgeLabel,
          style: { stroke: edgeColor, strokeWidth: 2 },
          labelStyle: { fill: edgeColor, fontWeight: 600 },
          animated: false
        },
        prev
      )
    );
  }

  function removeSelectedNode() {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.filter((node) => node.id !== selectedNodeId));
    setEdges((prev) =>
      prev.filter(
        (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId
      )
    );
    setSelectedNodeId(null);
  }

  return (
    <div className="builder-layout">
      <aside className="builder-panel">
        <h2>KGpipe Pipeline Editor</h2>
        <p>React Flow prototype for DAG pipeline editing.</p>
        <label htmlFor="task-search">Search tasks</label>
        <input
          id="task-search"
          type="text"
          value={search}
          placeholder="Search by name, input, output..."
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="builder-task-list-meta">
          Showing {visibleTasks.length} of {filteredTasks.length} matches
          {filteredTasks.length > 30 ? " (limited to 30)" : ""}
        </div>
        <div className="builder-task-table-wrap">
          <table className="builder-task-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>In</th>
                <th>Out</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((task) => (
                <tr
                  key={task.name}
                  className={task.name === selectedTask ? "selected" : ""}
                  onClick={() => setSelectedTask(task.name)}
                >
                  <td>{task.name}</td>
                  <td>{task.inputs.join(", ") || "-"}</td>
                  <td>{task.outputs.join(", ") || "-"}</td>
                  <td>
                    <button
                      className="inline-add-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedTask(task.name);
                        addNode(task.name);
                      }}
                    >
                      + Add
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={() => addNode()}>Add Selected Task</button>
        <button
          className="danger-btn"
          onClick={removeSelectedNode}
          disabled={!selectedNodeId}
          title={
            selectedNodeId
              ? "Remove selected node and its connected edges"
              : "Select a node on the canvas to remove"
          }
        >
          Remove Selected Node
        </button>
        <p className="builder-connect-hint">
          {selectedNodeId
            ? `Selected node: ${nodes.find((node) => node.id === selectedNodeId)?.data.label ?? selectedNodeId}`
            : "No node selected"}
        </p>
        {connectionError ? (
          <p className="builder-connect-error">{connectionError}</p>
        ) : (
          <p className="builder-connect-hint">
            Connect from right output handles to left input handles.
          </p>
        )}
        <h3>Loose Ends</h3>
        <p>Roots: {countRoots(nodes, edges)}</p>
        <p>Leaves: {countLeaves(nodes, edges)}</p>
        {selectedTask && taskByName[selectedTask] && (
          <pre>{JSON.stringify(taskByName[selectedTask], null, 2)}</pre>
        )}
      </aside>
      <main className="builder-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          nodeTypes={{ taskNode: TaskNode }}
          fitView
        >
          <MiniMap />
          <Controls />
          <Background />
        </ReactFlow>
      </main>
    </div>
  );
}

function countRoots(nodes: Node[], edges: Edge[]): number {
  const incoming = new Map<string, number>();
  nodes.forEach((node) => incoming.set(node.id, 0));
  edges.forEach((edge) => incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1));
  return [...incoming.values()].filter((count) => count === 0).length;
}

function countLeaves(nodes: Node[], edges: Edge[]): number {
  const outgoing = new Map<string, number>();
  nodes.forEach((node) => outgoing.set(node.id, 0));
  edges.forEach((edge) => outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1));
  return [...outgoing.values()].filter((count) => count === 0).length;
}

function normalizeFormats(values: string[]): string[] {
  const normalized = values
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
    .map((value) => (value.startsWith(".") ? value.slice(1) : value));
  return [...new Set(normalized)];
}

function parseHandleFormat(handleId: string, expectedKind: "in" | "out"): string | null {
  const [kind, rawFormat] = handleId.split(":", 2);
  if (kind !== expectedKind) return null;
  const format = rawFormat?.trim().toLowerCase();
  if (!format) return null;
  return format;
}

function formatColor(format: string): string {
  const key = format.trim().toLowerCase();
  const palette: Record<string, string> = {
    txt: "#1f9d55",
    json: "#1d4ed8",
    rdf: "#7c3aed",
    ttl: "#7c3aed",
    nt: "#7c3aed",
    csv: "#b45309",
    xml: "#0f766e",
    pdf: "#be123c",
    any: "#6b7280"
  };
  if (palette[key]) return palette[key];

  let hash = 0;
  for (let idx = 0; idx < key.length; idx += 1) {
    hash = (hash * 31 + key.charCodeAt(idx)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 60% 45%)`;
}

function TaskNode({ data, selected }: NodeProps<PipelineNode>) {
  const inputFormats = data.inputs.length > 0 ? data.inputs : ["any"];
  const outputFormats = data.outputs.length > 0 ? data.outputs : ["any"];

  return (
    <div className={`task-node ${selected ? "selected" : ""}`}>
      <div className="task-node-title">{data.label}</div>

      {inputFormats.map((fmt, idx) => (
        <Handle
          key={`in-${fmt}`}
          type="target"
          id={`in:${fmt}`}
          position={Position.Left}
          style={{
            top: 34 + idx * 16,
            background: formatColor(fmt),
            border: "2px solid #fff",
            width: 10,
            height: 10
          }}
        />
      ))}

      {outputFormats.map((fmt, idx) => (
        <Handle
          key={`out-${fmt}`}
          type="source"
          id={`out:${fmt}`}
          position={Position.Right}
          style={{
            top: 34 + idx * 16,
            background: formatColor(fmt),
            border: "2px solid #fff",
            width: 10,
            height: 10
          }}
        />
      ))}

      <div className="task-node-io">
        <div>
          <strong>in</strong>: {formatBadges(inputFormats)}
        </div>
        <div>
          <strong>out</strong>: {formatBadges(outputFormats)}
        </div>
      </div>
    </div>
  );
}

function formatBadges(formats: string[]) {
  return formats.map((fmt) => (
    <span
      key={fmt}
      className="fmt-badge"
      style={{
        backgroundColor: `${formatColor(fmt)}1f`,
        borderColor: formatColor(fmt),
        color: formatColor(fmt)
      }}
    >
      {fmt}
    </span>
  ));
}
