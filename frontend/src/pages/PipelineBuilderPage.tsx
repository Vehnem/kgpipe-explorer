import React, { useEffect, useMemo, useState } from "react";
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
import type { ExamplePipeline, TaskSpec } from "../api";
import { fetchExamplePipelines } from "../api";

type PipelineNodeData = {
  label: string;
  inputs: string[];
  outputs: string[];
};

type DataNodeData = {
  label: string;
  format: string;
  dataKind: "source" | "sink";
};

type PipelineNode = Node<PipelineNodeData>;
type DataNode = Node<DataNodeData>;
type AnyNode = PipelineNode | DataNode;

const DATA_ELEMENTS: { label: string; format: string; dataKind: "source" | "sink" }[] = [
  { label: "Text", format: "txt",  dataKind: "source" },
  { label: "JSON", format: "json", dataKind: "source" },
  { label: "RDF",  format: "rdf",  dataKind: "source" },
  { label: "KG",   format: "ttl",  dataKind: "sink"   },
];

type PipelineBuilderPageProps = {
  tasks: TaskSpec[];
};

export function PipelineBuilderPage({ tasks }: PipelineBuilderPageProps) {
  const [selectedTask, setSelectedTask] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [connectionError, setConnectionError] = useState<string>("");
  const [nodes, setNodes, onNodesChange] = useNodesState<AnyNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [examples, setExamples] = useState<ExamplePipeline[]>([]);
  const [inspectedTask, setInspectedTask] = useState<TaskSpec | null>(null);

  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTask("");
      return;
    }
    if (!selectedTask || !tasks.some((task) => task.name === selectedTask)) {
      setSelectedTask(tasks[0].name);
    }
  }, [tasks, selectedTask]);

  useEffect(() => {
    fetchExamplePipelines()
      .then(setExamples)
      .catch(() => {
        // Non-critical — silently ignore if examples are unavailable
      });
  }, []);

  function loadExample(exampleId: string) {
    const example = examples.find((e) => e.id === exampleId);
    if (!example) return;

    const newNodes: AnyNode[] = example.nodes.map((n) => {
      if (n.node_type === "dataNode") {
        return {
          id: n.id,
          position: { x: n.position_x, y: n.position_y },
          type: "dataNode",
          data: {
            label: n.task_name,
            format: n.format ?? "",
            dataKind: (n.data_kind ?? "source") as "source" | "sink"
          }
        } as DataNode;
      }
      return {
        id: n.id,
        position: { x: n.position_x, y: n.position_y },
        type: "taskNode",
        data: {
          label: n.task_name,
          inputs: normalizeFormats(n.inputs),
          outputs: normalizeFormats(n.outputs)
        }
      } as PipelineNode;
    });

    const newEdges: Edge[] = example.edges.map((e, idx) => {
      const color = formatColor(e.format_label);
      return {
        id: `e-${idx}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        sourceHandle: e.source_handle,
        targetHandle: e.target_handle,
        label: e.format_label,
        style: { stroke: color, strokeWidth: 2 },
        labelStyle: { fill: color, fontWeight: 600 }
      };
    });

    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedNodeId(null);
    setConnectionError("");
  }

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

  function addDataNode(label: string, format: string, dataKind: "source" | "sink") {
    const id = `d-${crypto.randomUUID().slice(0, 8)}`;
    const offset = nodes.length * 30;
    const x = dataKind === "source" ? 20 : 700;
    setNodes((prev) => [
      ...prev,
      {
        id,
        position: { x, y: 100 + offset },
        type: "dataNode",
        data: { label, format, dataKind }
      } as DataNode
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

        {examples.length > 0 && (
          <>
            <label htmlFor="example-select">Load example pipeline</label>
            <select
              id="example-select"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) loadExample(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                — select an example —
              </option>
              {examples.map((ex) => (
                <option key={ex.id} value={ex.id} title={ex.description}>
                  {ex.name}
                </option>
              ))}
            </select>
          </>
        )}

        <h3 style={{ marginBottom: 4 }}>Data Elements</h3>
        <p style={{ marginTop: 0, fontSize: 12, color: "#475569" }}>
          Add source or result data nodes to connect to pipeline ends.
        </p>
        <div className="data-element-buttons">
          {DATA_ELEMENTS.map((el) => (
            <button
              key={el.label}
              type="button"
              className="data-element-btn"
              style={{
                borderColor: formatColor(el.format),
                color: formatColor(el.format)
              }}
              onClick={() => addDataNode(el.label, el.format, el.dataKind)}
            >
              {el.dataKind === "source" ? "▶" : "◆"} {el.label}
            </button>
          ))}
        </div>

        <label htmlFor="task-search">Search tasks</label>
        <input
          id="task-search"
          type="text"
          value={search}
          placeholder="Search by name, input, output..."
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="builder-task-list-meta">
          {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
          {filteredTasks.length > 30 ? " (showing first 30)" : ""}
          {" — click to inspect, "}
          <strong>+</strong>
          {" to add"}
        </div>
        <div className="task-item-list">
          {visibleTasks.map((task) => {
            const inputs = normalizeFormats(task.inputs);
            const outputs = normalizeFormats(task.outputs);
            return (
              <div
                key={task.name}
                className={`task-list-item${task.name === selectedTask ? " selected" : ""}`}
                onClick={() => {
                  setSelectedTask(task.name);
                  setInspectedTask(task);
                }}
              >
                <div className="task-list-item-main">
                  <span className="task-list-item-name" title={task.name}>
                    {task.name}
                  </span>
                  <div className="task-list-item-io">
                    {inputs.map((fmt) => (
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
                    ))}
                    {inputs.length > 0 && outputs.length > 0 && (
                      <span className="task-list-io-arrow">→</span>
                    )}
                    {outputs.map((fmt) => (
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
                    ))}
                    {inputs.length === 0 && outputs.length === 0 && (
                      <span className="muted" style={{ fontSize: 10 }}>no IO declared</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="task-list-add-btn"
                  title={`Add ${task.name} to canvas`}
                  onClick={(e) => {
                    e.stopPropagation();
                    addNode(task.name);
                  }}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
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
          nodeTypes={{ taskNode: TaskNode, dataNode: DataNode }}
          fitView
        >
          <MiniMap />
          <Controls />
          <Background />
        </ReactFlow>
      </main>

      {inspectedTask && (
        <TaskDetailModal
          task={inspectedTask}
          onClose={() => setInspectedTask(null)}
          onAddToCanvas={() => addNode(inspectedTask.name)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task detail modal
// ---------------------------------------------------------------------------

type TaskDetailModalProps = {
  task: TaskSpec;
  onClose: () => void;
  onAddToCanvas: () => void;
};

function TagPills({ values, empty }: { values: string[]; empty: string }) {
  if (values.length === 0) return <span className="muted">{empty}</span>;
  return (
    <div className="tag-list">
      {values.map((v) => (
        <span key={v} className="tag">
          {v}
        </span>
      ))}
    </div>
  );
}

function TaskDetailModal({ task, onClose, onAddToCanvas }: TaskDetailModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={task.name}>
        <div className="modal-header">
          <h3>{task.name}</h3>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {task.uri && (
            <div className="modal-section">
              <h4>URI</h4>
              <code className="modal-uri">{task.uri}</code>
            </div>
          )}
          <div className="modal-section">
            <h4>Inputs</h4>
            <TagPills values={task.inputs} empty="No declared inputs" />
          </div>
          <div className="modal-section">
            <h4>Outputs</h4>
            <TagPills values={task.outputs} empty="No declared outputs" />
          </div>
          {(task.implements_method?.length ?? 0) > 0 && (
            <div className="modal-section">
              <h4>Implements Method</h4>
              <TagPills values={task.implements_method ?? []} empty="" />
            </div>
          )}
          {(task.uses_tool?.length ?? 0) > 0 && (
            <div className="modal-section">
              <h4>Uses Tool</h4>
              <TagPills values={task.uses_tool ?? []} empty="" />
            </div>
          )}
          {(task.has_parameter?.length ?? 0) > 0 && (
            <div className="modal-section">
              <h4>Parameters</h4>
              <TagPills values={task.has_parameter ?? []} empty="" />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onAddToCanvas();
              onClose();
            }}
          >
            + Add to Canvas
          </button>
        </div>
      </div>
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

function DataNode({ data, selected }: NodeProps<DataNode>) {
  const color = formatColor(data.format);
  const isSink = data.dataKind === "sink";

  return (
    <div
      className={`data-node${isSink ? " data-node--sink" : " data-node--source"}${selected ? " selected" : ""}`}
      style={{ borderColor: color }}
    >
      {isSink && (
        <Handle
          type="target"
          id="in:any"
          position={Position.Left}
          style={{ background: color, border: "2px solid #fff", width: 10, height: 10 }}
        />
      )}
      <span className="data-node-icon" style={{ color }}>
        {isSink ? "◆" : "▶"}
      </span>
      <span className="data-node-label">{data.label}</span>
      {!isSink && (
        <Handle
          type="source"
          id={`out:${data.format}`}
          position={Position.Right}
          style={{ background: color, border: "2px solid #fff", width: 10, height: 10 }}
        />
      )}
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
