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
import type { ConfigSpec, DataElement, DataPortSpec, ExamplePipeline, ParameterSpec, TaskSpec } from "../api";
import { fetchDataElements, fetchExamplePipelines } from "../api";
import {
  buildCliCommand,
  buildPipelineConf,
  extractTaskOrder,
  slugifyPipelineName,
  toPipelineJson,
  toPipelineYaml
} from "../pipelineExport";
import { emitTutorialEvent, TUTORIAL_EVENTS } from "../tutorial/tutorialEvents";
import { PRACTICE_TASK_NAME } from "../tutorial/tutorialTypes";

type ParameterValue = string | number | boolean;

type PipelineNodeData = {
  label: string;
  inputs: string[];
  outputs: string[];
  inputPorts: DataPortSpec[];
  outputPorts: DataPortSpec[];
  parameterValues?: Record<string, ParameterValue>;
  configSpec?: ConfigSpec | null;
  onConfigure?: () => void;
};

type DataNodeData = {
  label: string;
  format: string;
  dataKind: "source" | "sink";
};

type PipelineNode = Node<PipelineNodeData>;
type DataNode = Node<DataNodeData>;
type AnyNode = PipelineNode | DataNode;

type PipelineBuilderPageProps = {
  tasks: TaskSpec[];
};

export function PipelineBuilderPage({ tasks }: PipelineBuilderPageProps) {
  const [selectedTask, setSelectedTask] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [configuringNodeId, setConfiguringNodeId] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [connectionError, setConnectionError] = useState<string>("");
  const [nodes, setNodes, onNodesChange] = useNodesState<AnyNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [examples, setExamples] = useState<ExamplePipeline[]>([]);
  const [dataElements, setDataElements] = useState<DataElement[]>([]);
  const [inspectedTask, setInspectedTask] = useState<TaskSpec | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);

  const configureHandlerRef = React.useRef<(nodeId: string) => void>(() => {});
  configureHandlerRef.current = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setConfiguringNodeId(nodeId);
  };

  const taskNodeCount = useMemo(
    () => nodes.filter((node) => node.type === "taskNode").length,
    [nodes]
  );

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
    fetchDataElements()
      .then(setDataElements)
      .catch(() => {
        // Non-critical — silently ignore if data elements are unavailable
      });
  }, []);

  useEffect(() => {
    function onFocusTask(event: Event) {
      const detail = (event as CustomEvent<{ taskName?: string }>).detail;
      if (!detail?.taskName) return;
      setSearch(detail.taskName);
    }
    function onSelectTask(event: Event) {
      const detail = (event as CustomEvent<{ taskName?: string }>).detail;
      if (!detail?.taskName) return;
      const match = nodes.find(
        (node) =>
          node.type === "taskNode" &&
          (node.data as PipelineNodeData).label === detail.taskName
      );
      if (!match) return;
      setSelectedNodeId(match.id);
      setSelectedEdgeId(null);
    }
    function onPracticeStarted() {
      setPracticeMode(true);
    }
    function onPracticeEnded() {
      setPracticeMode(false);
    }
    window.addEventListener(TUTORIAL_EVENTS.focusTask, onFocusTask);
    window.addEventListener(TUTORIAL_EVENTS.selectTask, onSelectTask);
    window.addEventListener(TUTORIAL_EVENTS.practiceStarted, onPracticeStarted);
    window.addEventListener(TUTORIAL_EVENTS.practiceEnded, onPracticeEnded);
    return () => {
      window.removeEventListener(TUTORIAL_EVENTS.focusTask, onFocusTask);
      window.removeEventListener(TUTORIAL_EVENTS.selectTask, onSelectTask);
      window.removeEventListener(TUTORIAL_EVENTS.practiceStarted, onPracticeStarted);
      window.removeEventListener(TUTORIAL_EVENTS.practiceEnded, onPracticeEnded);
    };
  }, [nodes]);

  const taskByName = useMemo(
    () => Object.fromEntries(tasks.map((task) => [task.name, task])),
    [tasks]
  );

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
      const inputPorts = portsFromNode(n.input_ports, n.inputs);
      const outputPorts = portsFromNode(n.output_ports, n.outputs);
      const task = taskByName[n.task_name];
      const nodeId = n.id;
      return {
        id: nodeId,
        position: { x: n.position_x, y: n.position_y },
        type: "taskNode",
        data: {
          label: n.task_name,
          inputs: inputPorts.map((p) => p.format),
          outputs: outputPorts.map((p) => p.format),
          inputPorts,
          outputPorts,
          configSpec: task?.config_spec ?? null,
          parameterValues: defaultParameterValues(task?.config_spec),
          onConfigure: () => configureHandlerRef.current(nodeId)
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
    setSelectedEdgeId(null);
    setConfiguringNodeId(null);
    setConnectionError("");
    emitTutorialEvent(TUTORIAL_EVENTS.exampleLoaded, { exampleId });
  }

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((task) => {
      const portHaystack = [
        ...(task.input_ports ?? []).flatMap((p) => [p.name, p.format]),
        ...(task.output_ports ?? []).flatMap((p) => [p.name, p.format])
      ];
      const haystack = [task.name, task.inputs.join(" "), task.outputs.join(" "), ...portHaystack]
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
    const inputPorts = portsFromTask(task, "input");
    const outputPorts = portsFromTask(task, "output");
    setNodes((prev) => [
      ...prev,
      {
        id,
        position: { x: 120 + offset, y: 120 + offset },
        type: "taskNode",
        data: {
          label: taskName,
          inputs: inputPorts.map((p) => p.format),
          outputs: outputPorts.map((p) => p.format),
          inputPorts,
          outputPorts,
          configSpec: task.config_spec ?? null,
          parameterValues: defaultParameterValues(task.config_spec),
          onConfigure: () => configureHandlerRef.current(id)
        }
      }
    ]);
    emitTutorialEvent(TUTORIAL_EVENTS.taskAdded, { taskName });
  }

  function updateNodeParameter(nodeId: string, name: string, value: ParameterValue) {
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId || node.type !== "taskNode") return node;
        const data = node.data as PipelineNodeData;
        return {
          ...node,
          data: {
            ...data,
            parameterValues: {
              ...(data.parameterValues ?? {}),
              [name]: value
            }
          }
        };
      })
    );
  }

  const configuringNode = useMemo(
    () => nodes.find((node) => node.id === configuringNodeId) ?? null,
    [nodes, configuringNodeId]
  );

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

    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) {
      setConnectionError("Invalid connection endpoints.");
      return;
    }

    const sourceFormat = resolveHandleFormat(sourceNode, connection.sourceHandle, "out");
    const targetFormat = resolveHandleFormat(targetNode, connection.targetHandle, "in");
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
    emitTutorialEvent(TUTORIAL_EVENTS.edgeConnected);
  }

  function removeSelectedNode() {
    if (!selectedNodeId) return;
    const selectedNode = nodes.find((node) => node.id === selectedNodeId);
    const taskName =
      selectedNode?.type === "taskNode"
        ? (selectedNode.data as PipelineNodeData).label
        : undefined;
    setNodes((prev) => prev.filter((node) => node.id !== selectedNodeId));
    setEdges((prev) =>
      prev.filter(
        (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId
      )
    );
    if (configuringNodeId === selectedNodeId) {
      setConfiguringNodeId(null);
    }
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    emitTutorialEvent(TUTORIAL_EVENTS.nodeRemoved, {
      nodeId: selectedNodeId,
      taskName
    });
  }

  function removeSelectedEdge() {
    if (!selectedEdgeId) return;
    setEdges((prev) => prev.filter((edge) => edge.id !== selectedEdgeId));
    setSelectedEdgeId(null);
  }

  function nodeLabel(node: AnyNode): string {
    return node.data.label;
  }

  function findNodeByIdOrLabel(id: string, label: string): AnyNode | undefined {
    return nodes.find((node) => node.id === id) ?? nodes.find((node) => nodeLabel(node) === label);
  }

  function findTaskByLabel(label: string): AnyNode | undefined {
    return nodes.find(
      (node) => node.type === "taskNode" && (node.data as PipelineNodeData).label === label
    );
  }

  /** Restore RDF Base wiring for the newest fusion_first_value node (practice guide). */
  function reconnectPracticeTask(taskName: string) {
    const candidates = nodes.filter(
      (node) => node.type === "taskNode" && (node.data as PipelineNodeData).label === taskName
    );
    const fusion = candidates[candidates.length - 1];
    if (!fusion) return;

    const source = findNodeByIdOrLabel("n-source", "RDF");
    const seed = findNodeByIdOrLabel("n-seed", "Seed KG");
    const parisExchange =
      findNodeByIdOrLabel("n-paris-exchange-1", "paris_exchange") ??
      findTaskByLabel("paris_exchange");
    const typeInference =
      findNodeByIdOrLabel("n-type-inference-ontology-simple-3", "type_inference_ontology_simple") ??
      findTaskByLabel("type_inference_ontology_simple");

    if (!source || !seed || !parisExchange || !typeInference) {
      setConnectionError("Could not find neighbor nodes to reconnect practice task.");
      return;
    }

    const specs: Array<{
      source: string;
      target: string;
      sourceHandle: string;
      targetHandle: string;
      label: string;
    }> = [
      {
        source: source.id,
        target: fusion.id,
        sourceHandle: `out:${(source.data as DataNodeData).format || "nt"}`,
        targetHandle: "in:source",
        label: "nt"
      },
      {
        source: seed.id,
        target: fusion.id,
        sourceHandle: `out:${(seed.data as DataNodeData).format || "nt"}`,
        targetHandle: "in:kg",
        label: "nt"
      },
      {
        source: parisExchange.id,
        target: fusion.id,
        sourceHandle: "out:output",
        targetHandle: "in:matches1",
        label: "er.json"
      },
      {
        source: fusion.id,
        target: typeInference.id,
        sourceHandle: "out:output",
        targetHandle: "in:source",
        label: "nt"
      }
    ];

    setEdges((prev) => {
      const withoutFusion = prev.filter(
        (edge) => edge.source !== fusion.id && edge.target !== fusion.id
      );
      let next = withoutFusion;
      for (const spec of specs) {
        const color = formatColor(spec.label);
        next = addEdge(
          {
            source: spec.source,
            target: spec.target,
            sourceHandle: spec.sourceHandle,
            targetHandle: spec.targetHandle,
            label: spec.label,
            style: { stroke: color, strokeWidth: 2 },
            labelStyle: { fill: color, fontWeight: 600 },
            animated: false
          },
          next
        );
      }
      return next;
    });
    setConnectionError("");
    emitTutorialEvent(TUTORIAL_EVENTS.practiceReconnected, { taskName });
  }

  return (
    <div className="builder-layout">
      <aside className="builder-panel" data-tutorial="builder-sidebar">
        <h2>KGpipe Pipeline Editor</h2>
        <p>React Flow prototype for DAG pipeline editing.</p>

        {examples.length > 0 && (
          <div data-tutorial="builder-examples">
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
          </div>
        )}

        <h3 style={{ marginBottom: 4 }}>Data Elements</h3>
        <p style={{ marginTop: 0, fontSize: 12, color: "#475569" }}>
          Add source or result data nodes to connect to pipeline ends.
        </p>
        <div className="data-element-buttons">
          {dataElements.map((el) => (
            <button
              key={el.label}
              type="button"
              className="data-element-btn"
              style={{
                borderColor: formatColor(el.format),
                color: formatColor(el.format)
              }}
              onClick={() =>
                addDataNode(el.label, el.format, el.data_kind as "source" | "sink")
              }
            >
              {el.data_kind === "source" ? "▶" : "◆"} {el.label}
            </button>
          ))}
        </div>

        <label htmlFor="task-search">Search tasks</label>
        <input
          id="task-search"
          data-tutorial="builder-task-search"
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
        <div className="task-item-list" data-tutorial="builder-task-list">
          {visibleTasks.map((task) => {
            const inputPorts = portsFromTask(task, "input");
            const outputPorts = portsFromTask(task, "output");
            return (
              <div
                key={task.name}
                className={`task-list-item${task.name === selectedTask ? " selected" : ""}`}
                data-tutorial-task={task.name}
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
                    {inputPorts.map((port) => (
                      <span
                        key={`in-${port.name}`}
                        className="fmt-badge"
                        title={port.name !== port.format ? port.name : undefined}
                        style={{
                          backgroundColor: `${formatColor(port.format)}1f`,
                          borderColor: formatColor(port.format),
                          color: formatColor(port.format)
                        }}
                      >
                        {port.format}
                      </span>
                    ))}
                    {inputPorts.length > 0 && outputPorts.length > 0 && (
                      <span className="task-list-io-arrow">→</span>
                    )}
                    {outputPorts.map((port) => (
                      <span
                        key={`out-${port.name}`}
                        className="fmt-badge"
                        title={port.name !== port.format ? port.name : undefined}
                        style={{
                          backgroundColor: `${formatColor(port.format)}1f`,
                          borderColor: formatColor(port.format),
                          color: formatColor(port.format)
                        }}
                      >
                        {port.format}
                      </span>
                    ))}
                    {inputPorts.length === 0 && outputPorts.length === 0 && (
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
          data-tutorial="builder-remove-node"
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
        {practiceMode ? (
          <button
            type="button"
            className="primary-btn"
            data-tutorial="builder-reconnect"
            onClick={() => reconnectPracticeTask(PRACTICE_TASK_NAME)}
            title={`Restore ${PRACTICE_TASK_NAME} connections for the practice guide`}
          >
            Reconnect practice task
          </button>
        ) : null}
        <button
          className="danger-btn"
          onClick={removeSelectedEdge}
          disabled={!selectedEdgeId}
          title={
            selectedEdgeId
              ? "Remove selected connection"
              : "Select a connection on the canvas to remove"
          }
        >
          Remove Selected Connection
        </button>
        <p className="builder-connect-hint">
          {selectedEdgeId
            ? (() => {
                const edge = edges.find((e) => e.id === selectedEdgeId);
                if (!edge) return "Selected connection";
                const sourceLabel =
                  nodes.find((n) => n.id === edge.source)?.data.label ?? edge.source;
                const targetLabel =
                  nodes.find((n) => n.id === edge.target)?.data.label ?? edge.target;
                return `Selected connection: ${sourceLabel} → ${targetLabel}`;
              })()
            : selectedNodeId
              ? `Selected node: ${nodes.find((node) => node.id === selectedNodeId)?.data.label ?? selectedNodeId}`
              : "No node or connection selected"}
        </p>
        {connectionError ? (
          <p className="builder-connect-error">{connectionError}</p>
        ) : (
          <p className="builder-connect-hint">
            Connect from right output handles to left input handles. Click a connection to select it,
            then remove it with the button or Delete/Backspace. Use ⚙ on a task to set parameters.
          </p>
        )}
        <h3>Loose Ends</h3>
        <p>Roots: {countRoots(nodes, edges)}</p>
        <p>Leaves: {countLeaves(nodes, edges)}</p>
        <button
          type="button"
          className="primary-btn"
          data-tutorial="builder-export"
          disabled={taskNodeCount === 0}
          title={
            taskNodeCount === 0
              ? "Add task nodes to the canvas before exporting"
              : "Export pipeline as pipeline.conf (YAML/JSON)"
          }
          onClick={() => {
            setExportOpen(true);
            emitTutorialEvent(TUTORIAL_EVENTS.exportOpened);
          }}
        >
          Export Pipeline Config
        </button>
      </aside>
      <main className="builder-canvas" data-tutorial="builder-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            setSelectedEdgeId(null);
            const taskName =
              node.type === "taskNode"
                ? (node.data as PipelineNodeData).label
                : undefined;
            emitTutorialEvent(TUTORIAL_EVENTS.nodeSelected, {
              nodeId: node.id,
              taskName
            });
          }}
          onEdgeClick={(_, edge) => {
            setSelectedEdgeId(edge.id);
            setSelectedNodeId(null);
          }}
          onEdgesDelete={(deleted) => {
            if (selectedEdgeId && deleted.some((edge) => edge.id === selectedEdgeId)) {
              setSelectedEdgeId(null);
            }
          }}
          onPaneClick={() => {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
          }}
          deleteKeyCode={["Backspace", "Delete"]}
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

      {configuringNode?.type === "taskNode" &&
        (configuringNode.data as PipelineNodeData).configSpec && (
          <TaskConfigModal
            taskName={(configuringNode.data as PipelineNodeData).label}
            configSpec={(configuringNode.data as PipelineNodeData).configSpec!}
            values={(configuringNode.data as PipelineNodeData).parameterValues ?? {}}
            onChange={(name, value) => updateNodeParameter(configuringNode.id, name, value)}
            onClose={() => setConfiguringNodeId(null)}
          />
        )}

      {exportOpen && (
        <PipelineExportModal
          nodes={nodes}
          edges={edges}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline export modal
// ---------------------------------------------------------------------------

type PipelineExportModalProps = {
  nodes: AnyNode[];
  edges: Edge[];
  onClose: () => void;
};

type ExportFormat = "yaml" | "json";

function PipelineExportModal({ nodes, edges, onClose }: PipelineExportModalProps) {
  const exportOrder = useMemo(() => extractTaskOrder(nodes, edges), [nodes, edges]);
  const [pipelineName, setPipelineName] = useState("builder_pipeline");
  const [description, setDescription] = useState(
    "Pipeline exported from KGpipe Pipeline Editor"
  );
  const [format, setFormat] = useState<ExportFormat>("yaml");
  const [copyHint, setCopyHint] = useState("");

  const pipelineConf = useMemo(
    () => buildPipelineConf(pipelineName, description, exportOrder.taskNames),
    [pipelineName, description, exportOrder.taskNames]
  );

  const configText = useMemo(
    () => (format === "yaml" ? toPipelineYaml(pipelineConf) : toPipelineJson(pipelineConf)),
    [format, pipelineConf]
  );

  const cliCommand = useMemo(
    () => buildCliCommand(pipelineName),
    [pipelineName]
  );

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

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(`${label} copied`);
      window.setTimeout(() => setCopyHint(""), 1800);
    } catch {
      setCopyHint(`Could not copy ${label.toLowerCase()}`);
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div
        className="modal-card modal-card--wide"
        data-tutorial="builder-export-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Export pipeline configuration"
      >
        <div className="modal-header">
          <h3>Export Pipeline Config</h3>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="export-form-grid">
            <label className="export-field">
              <span>Pipeline name</span>
              <input
                type="text"
                value={pipelineName}
                onChange={(e) => setPipelineName(slugifyPipelineName(e.target.value))}
                placeholder="builder_pipeline"
              />
            </label>
            <label className="export-field">
              <span>Description</span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pipeline exported from KGpipe Pipeline Editor"
              />
            </label>
          </div>

          {exportOrder.warnings.length > 0 && (
            <div className="export-warnings">
              {exportOrder.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          <div className="modal-section">
            <div className="export-section-head">
              <h4>Configuration</h4>
              <div className="export-format-toggle" role="tablist" aria-label="Config format">
                <button
                  type="button"
                  role="tab"
                  aria-selected={format === "yaml"}
                  className={format === "yaml" ? "active" : ""}
                  onClick={() => setFormat("yaml")}
                >
                  YAML
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={format === "json"}
                  className={format === "json" ? "active" : ""}
                  onClick={() => setFormat("json")}
                >
                  JSON
                </button>
                <button
                  type="button"
                  className="export-copy-btn"
                  onClick={() => copyText("Config", configText)}
                >
                  Copy
                </button>
              </div>
            </div>
            <pre className="export-code-block">{configText}</pre>
          </div>

          <div className="modal-section">
            <div className="export-section-head">
              <h4>CLI command</h4>
              <button
                type="button"
                className="export-copy-btn"
                onClick={() => copyText("CLI command", cliCommand)}
              >
                Copy
              </button>
            </div>
            <p className="export-cli-note">
              Pipelines are executed <strong>outside</strong> this app. After you
              run the config with KGpipe, reimport metrics into the backend
              fixtures before opening Results or the Leaderboard.{" "}
              <a
                href="https://github.com/Vehnem/kgpipe-explorer/blob/main/docs/run-and-reimport.md"
                target="_blank"
                rel="noreferrer"
              >
                See run &amp; reimport
              </a>
              . The CLI line below is a mock preview — <code>kgpipe run</code> is
              not wired here.
            </p>
            <pre className="export-code-block export-code-block--cli">{cliCommand}</pre>
          </div>

          {copyHint ? <p className="export-copy-hint">{copyHint}</p> : null}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
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
            <TagPills values={portLabels(portsFromTask(task, "input"))} empty="No declared inputs" />
          </div>
          <div className="modal-section">
            <h4>Outputs</h4>
            <TagPills values={portLabels(portsFromTask(task, "output"))} empty="No declared outputs" />
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
          <div className="modal-section">
            <h4>Parameters</h4>
            <ParameterOptionsList configSpec={task.config_spec} />
          </div>
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

function ParameterOptionsList({ configSpec }: { configSpec?: ConfigSpec | null }) {
  const parameters = configSpec?.parameters ?? [];
  if (!configSpec || parameters.length === 0) {
    return <p className="muted">No parameters linked</p>;
  }
  return (
    <div className="param-options-list">
      {configSpec.description ? (
        <p className="param-spec-description">{configSpec.description}</p>
      ) : null}
      {parameters.map((param) => (
        <div key={param.name} className="param-option-row">
          <div className="param-option-header">
            <span className="param-option-name">
              {param.name}
              {param.required ? <span className="param-required">*</span> : null}
            </span>
            <span className="param-option-type">{param.datatype}</span>
          </div>
          <div className="param-option-meta">
            {param.default_value !== undefined && param.default_value !== null && (
              <span>default: {String(param.default_value)}</span>
            )}
            {param.minimum != null || param.maximum != null ? (
              <span>
                range: {param.minimum ?? "…"}–{param.maximum ?? "…"}
                {param.unit ? ` ${param.unit}` : ""}
              </span>
            ) : null}
          </div>
          {(param.allowed_values?.length ?? 0) > 0 && (
            <div className="param-option-values">
              {(param.allowed_values ?? []).map((value) => (
                <span key={String(value)} className="tag">
                  {String(value)}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

type TaskConfigModalProps = {
  taskName: string;
  configSpec: ConfigSpec;
  values: Record<string, ParameterValue>;
  onChange: (name: string, value: ParameterValue) => void;
  onClose: () => void;
};

function TaskConfigModal({ taskName, configSpec, values, onChange, onClose }: TaskConfigModalProps) {
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
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={`Configure ${taskName}`}
      >
        <div className="modal-header">
          <h3>Configure · {taskName}</h3>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {configSpec.description ? (
            <p className="param-spec-description">{configSpec.description}</p>
          ) : null}
          <div className="task-config-fields">
            {configSpec.parameters.map((param) => (
              <ParameterField
                key={param.name}
                param={param}
                value={values[param.name]}
                onChange={(next) => onChange(param.name, next)}
              />
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function changedParameterEntries(
  configSpec: ConfigSpec | null | undefined,
  values: Record<string, ParameterValue> | undefined
): Array<{ name: string; value: ParameterValue }> {
  if (!configSpec || !values) return [];
  const entries: Array<{ name: string; value: ParameterValue }> = [];
  for (const param of configSpec.parameters) {
    if (!(param.name in values)) continue;
    const current = values[param.name];
    const fallback = coerceDefault(param.default_value, param.datatype);
    if (fallback === undefined || current !== fallback) {
      entries.push({ name: param.name, value: current });
    }
  }
  return entries;
}

function formatParameterValue(value: ParameterValue): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

type ParameterFieldProps = {
  param: ParameterSpec;
  value: ParameterValue | undefined;
  onChange: (value: ParameterValue) => void;
};

function ParameterField({ param, value, onChange }: ParameterFieldProps) {
  const current = value ?? coerceDefault(param.default_value, param.datatype);
  const label = (
    <span>
      {param.name}
      {param.required ? <span className="param-required">*</span> : null}
      <span className="param-field-type">{param.datatype}</span>
    </span>
  );

  if (param.datatype === "boolean") {
    return (
      <label className="param-field param-field-checkbox">
        <input
          type="checkbox"
          checked={Boolean(current)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
    );
  }

  if ((param.allowed_values?.length ?? 0) > 0 || param.datatype === "enum") {
    return (
      <label className="param-field">
        {label}
        <select
          value={String(current ?? "")}
          onChange={(e) => onChange(coerceInputValue(e.target.value, param.datatype))}
        >
          {(param.allowed_values ?? []).map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (param.datatype === "integer" || param.datatype === "number") {
    return (
      <label className="param-field">
        {label}
        <input
          type="number"
          step={param.datatype === "integer" ? 1 : "any"}
          min={param.minimum ?? undefined}
          max={param.maximum ?? undefined}
          value={current === undefined || current === null ? "" : String(current)}
          onChange={(e) => onChange(coerceInputValue(e.target.value, param.datatype))}
        />
        {param.unit ? <span className="param-field-unit">{param.unit}</span> : null}
      </label>
    );
  }

  return (
    <label className="param-field">
      {label}
      <input
        type="text"
        value={current === undefined || current === null ? "" : String(current)}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function defaultParameterValues(configSpec?: ConfigSpec | null): Record<string, ParameterValue> {
  const values: Record<string, ParameterValue> = {};
  for (const param of configSpec?.parameters ?? []) {
    const coerced = coerceDefault(param.default_value, param.datatype);
    if (coerced !== undefined) {
      values[param.name] = coerced;
    }
  }
  return values;
}

function coerceDefault(
  value: string | number | boolean | null | undefined,
  datatype: string
): ParameterValue | undefined {
  if (value === null || value === undefined) {
    if (datatype === "boolean") return false;
    return undefined;
  }
  return coerceInputValue(String(value), datatype);
}

function coerceInputValue(raw: string, datatype: string): ParameterValue {
  if (datatype === "boolean") {
    return raw === "true" || raw === "1";
  }
  if (datatype === "integer") {
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (datatype === "number") {
    const parsed = Number.parseFloat(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return raw;
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

function normalizeFormat(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  return normalized.startsWith(".") ? normalized.slice(1) : normalized;
}

function synthesizePortsFromFormats(formats: string[]): DataPortSpec[] {
  const used = new Map<string, number>();
  const ports: DataPortSpec[] = [];
  for (const raw of formats) {
    const format = normalizeFormat(raw);
    if (!format) continue;
    const count = used.get(format) ?? 0;
    used.set(format, count + 1);
    // First port keeps format as name (compat with pedagogical out:txt / in:ttl handles);
    // duplicates get a numeric suffix so React Flow handle IDs stay unique.
    const name = count === 0 ? format : `${format}__${count + 1}`;
    ports.push({ name, format });
  }
  return ports;
}

function portsFromNode(
  ports: DataPortSpec[] | undefined,
  formats: string[]
): DataPortSpec[] {
  if (ports && ports.length > 0) {
    return ports.map((port) => ({
      name: port.name.trim(),
      format: normalizeFormat(port.format) || port.format
    }));
  }
  return synthesizePortsFromFormats(formats);
}

function portsFromTask(task: TaskSpec, kind: "input" | "output"): DataPortSpec[] {
  const ports = kind === "input" ? task.input_ports : task.output_ports;
  const formats = kind === "input" ? task.inputs : task.outputs;
  return portsFromNode(ports, formats);
}

function portLabels(ports: DataPortSpec[]): string[] {
  return ports.map((port) =>
    port.name === port.format ? port.format : `${port.name}: ${port.format}`
  );
}

function parseHandleName(handleId: string, expectedKind: "in" | "out"): string | null {
  const [kind, rawName] = handleId.split(":", 2);
  if (kind !== expectedKind) return null;
  const name = rawName?.trim();
  if (!name) return null;
  return name;
}

function resolveHandleFormat(
  node: AnyNode,
  handleId: string,
  expectedKind: "in" | "out"
): string | null {
  const portName = parseHandleName(handleId, expectedKind);
  if (!portName) return null;

  if (node.type === "dataNode") {
    const data = node.data as DataNodeData;
    if (expectedKind === "in" && portName === "any") return "any";
    if (expectedKind === "out" && normalizeFormat(data.format) === normalizeFormat(portName)) {
      return normalizeFormat(data.format);
    }
    return null;
  }

  const data = node.data as PipelineNodeData;
  const ports = expectedKind === "in" ? data.inputPorts : data.outputPorts;
  const port = ports.find((p) => p.name === portName);
  return port ? port.format : null;
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
  const inputPorts =
    data.inputPorts.length > 0
      ? data.inputPorts
      : synthesizePortsFromFormats(data.inputs.length > 0 ? data.inputs : ["any"]);
  const outputPorts =
    data.outputPorts.length > 0
      ? data.outputPorts
      : synthesizePortsFromFormats(data.outputs.length > 0 ? data.outputs : ["any"]);
  const hasConfig = (data.configSpec?.parameters.length ?? 0) > 0;
  const changedParams = changedParameterEntries(data.configSpec, data.parameterValues);

  return (
    <div
      className={`task-node ${selected ? "selected" : ""}`}
      data-tutorial-node={data.label}
    >
      <div className="task-node-header">
        <div className="task-node-title">{data.label}</div>
        {hasConfig && (
          <button
            type="button"
            className="task-node-settings-btn nodrag nopan"
            title="Configure parameters"
            aria-label={`Configure parameters for ${data.label}`}
            onClick={(e) => {
              e.stopPropagation();
              data.onConfigure?.();
            }}
          >
            ⚙
          </button>
        )}
      </div>

      {inputPorts.map((port, idx) => (
        <Handle
          key={`in-${port.name}`}
          type="target"
          id={`in:${port.name}`}
          position={Position.Left}
          title={`${port.name} (${port.format})`}
          style={{
            top: 34 + idx * 16,
            background: formatColor(port.format),
            border: "2px solid #fff",
            width: 10,
            height: 10
          }}
        />
      ))}

      {outputPorts.map((port, idx) => (
        <Handle
          key={`out-${port.name}`}
          type="source"
          id={`out:${port.name}`}
          position={Position.Right}
          title={`${port.name} (${port.format})`}
          style={{
            top: 34 + idx * 16,
            background: formatColor(port.format),
            border: "2px solid #fff",
            width: 10,
            height: 10
          }}
        />
      ))}

      <div className="task-node-io">
        <div>
          <strong>in</strong>: {formatBadges(inputPorts.map((p) => p.format))}
        </div>
        <div>
          <strong>out</strong>: {formatBadges(outputPorts.map((p) => p.format))}
        </div>
      </div>

      {changedParams.length > 0 && (
        <div className="task-node-params" title="Configured parameter values">
          {changedParams.map((entry) => (
            <div key={entry.name} className="task-node-param">
              <span className="task-node-param-name">{entry.name}</span>
              <span className="task-node-param-value">={formatParameterValue(entry.value)}</span>
            </div>
          ))}
        </div>
      )}
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
  return formats.map((fmt, idx) => (
    <span
      key={`${fmt}-${idx}`}
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
