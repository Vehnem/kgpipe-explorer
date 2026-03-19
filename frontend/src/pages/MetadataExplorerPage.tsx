import cytoscape, { type ElementDefinition } from "cytoscape";
import { useEffect, useMemo, useRef, useState } from "react";
import { constructSparql, type TaskSpec } from "../api";

type MetadataExplorerPageProps = {
  tasks: TaskSpec[];
  selectedEntityId: string;
  onSelectedEntityIdChange: (entityId: string) => void;
};

type SparqlTerm = {
  type: string;
  value: string;
};

type GraphStats = {
  triples: number;
  nodes: number;
  edges: number;
};

function isSparqlTerm(term: unknown): term is SparqlTerm {
  if (!term || typeof term !== "object") return false;
  const record = term as Record<string, unknown>;
  return typeof record.type === "string" && typeof record.value === "string";
}

function compactLabel(value: string): string {
  const hashIndex = value.lastIndexOf("#");
  const slashIndex = value.lastIndexOf("/");
  const splitIndex = Math.max(hashIndex, slashIndex);
  const label = splitIndex >= 0 ? value.slice(splitIndex + 1) : value;
  return label || value;
}

function buildGraphFromResult(result: Record<string, unknown>): {
  elements: ElementDefinition[];
  stats: GraphStats;
} {
  const maybeResults = (result as { results?: unknown }).results;
  if (!maybeResults || typeof maybeResults !== "object") {
    return { elements: [], stats: { triples: 0, nodes: 0, edges: 0 } };
  }

  const maybeBindings = (maybeResults as { bindings?: unknown }).bindings;
  if (!Array.isArray(maybeBindings)) {
    return { elements: [], stats: { triples: 0, nodes: 0, edges: 0 } };
  }

  const nodeMap = new Map<
    string,
    { id: string; label: string; value: string; termType: string }
  >();
  const edgeElements: ElementDefinition[] = [];
  let edgeCount = 0;
  let tripleCount = 0;

  const getNodeId = (term: SparqlTerm): string => {
    const key = `${term.type}|${term.value}`;
    const existing = nodeMap.get(key);
    if (existing) return existing.id;
    const id = `n${nodeMap.size}`;
    nodeMap.set(key, {
      id,
      label: compactLabel(term.value),
      value: term.value,
      termType: term.type
    });
    return id;
  };

  for (const row of maybeBindings) {
    if (!row || typeof row !== "object") continue;
    const binding = row as Record<string, unknown>;
    if (!isSparqlTerm(binding.s) || !isSparqlTerm(binding.p) || !isSparqlTerm(binding.o)) {
      continue;
    }

    tripleCount += 1;
    const sourceId = getNodeId(binding.s);
    const targetId = getNodeId(binding.o);
    edgeElements.push({
      data: {
        id: `e${edgeCount++}`,
        source: sourceId,
        target: targetId,
        label: compactLabel(binding.p.value),
        predicate: binding.p.value,
        predicateType: binding.p.type
      }
    });
  }

  const nodeElements: ElementDefinition[] = [...nodeMap.values()].map((node) => ({
    data: {
      id: node.id,
      label: node.label,
      value: node.value,
      termType: node.termType
    }
  }));

  return {
    elements: [...nodeElements, ...edgeElements],
    stats: {
      triples: tripleCount,
      nodes: nodeElements.length,
      edges: edgeElements.length
    }
  };
}

type ExampleQuery = {
  label: string;
  query: string;
};

const EXAMPLE_QUERIES: ExampleQuery[] = [
  {
    label: "All triples (sample, limit 20)",
    query: "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o } LIMIT 20"
  },
  {
    label: "All task implementations",
    query: `PREFIX kgo: <http://github.com/ScaDS/kgpipe/ontology/>
CONSTRUCT { ?impl ?p ?o }
WHERE {
  ?impl a kgo:Implementation ;
        ?p ?o .
} LIMIT 60`
  },
  {
    label: "Tasks and their tools",
    query: `PREFIX kgo: <http://github.com/ScaDS/kgpipe/ontology/>
PREFIX kgr: <http://github.com/ScaDS/kgpipe/resource/>
CONSTRUCT { ?impl kgo:usesTool ?tool }
WHERE {
  ?impl a kgo:Implementation ;
        kgo:usesTool ?tool .
} LIMIT 80`
  },
  {
    label: "Tasks and their implemented methods",
    query: `PREFIX kgo: <http://github.com/ScaDS/kgpipe/ontology/>
CONSTRUCT { ?impl kgo:implementsMethod ?method }
WHERE {
  ?impl a kgo:Implementation ;
        kgo:implementsMethod ?method .
} LIMIT 80`
  },
  {
    label: "Tasks and their parameters",
    query: `PREFIX kgo: <http://github.com/ScaDS/kgpipe/ontology/>
CONSTRUCT { ?impl kgo:hasParameter ?param }
WHERE {
  ?impl a kgo:Implementation ;
        kgo:hasParameter ?param .
} LIMIT 80`
  },
  {
    label: "Tasks with inputs and outputs",
    query: `PREFIX kgo: <http://github.com/ScaDS/kgpipe/ontology/>
CONSTRUCT { ?impl ?rel ?format }
WHERE {
  ?impl a kgo:Implementation .
  { ?impl kgo:hasInput ?format . BIND(kgo:hasInput AS ?rel) }
  UNION
  { ?impl kgo:hasOutput ?format . BIND(kgo:hasOutput AS ?rel) }
} LIMIT 100`
  },
  {
    label: "Full neighbourhood of one task (limit 1)",
    query: `PREFIX kgo: <http://github.com/ScaDS/kgpipe/ontology/>
CONSTRUCT { ?impl ?p ?o }
WHERE {
  ?impl a kgo:Implementation ; ?p ?o .
} LIMIT 30`
  }
];

export function MetadataExplorerPage({
  tasks,
  selectedEntityId,
  onSelectedEntityIdChange
}: MetadataExplorerPageProps) {
  const [query, setQuery] = useState<string>("");
  const [queryText, setQueryText] = useState<string>(EXAMPLE_QUERIES[0].query);
  const [queryRunning, setQueryRunning] = useState<boolean>(false);
  const [queryStatus, setQueryStatus] = useState<string>("");
  const [graphElements, setGraphElements] = useState<ElementDefinition[]>([]);
  const [graphStats, setGraphStats] = useState<GraphStats>({
    triples: 0,
    nodes: 0,
    edges: 0
  });
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((task) => {
      const haystack = [
        task.name,
        task.inputs.join(" "),
        task.outputs.join(" "),
        (task.implements_method ?? []).join(" "),
        (task.uses_tool ?? []).join(" "),
        (task.has_parameter ?? []).join(" ")
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, tasks]);

  useEffect(() => {
    if (tasks.length === 0) return;
    if (
      selectedEntityId &&
      tasks.some((task) => (task.uri ?? task.name) === selectedEntityId)
    ) {
      return;
    }
    onSelectedEntityIdChange(tasks[0].uri ?? tasks[0].name);
  }, [onSelectedEntityIdChange, selectedEntityId, tasks]);

  const selectedTask = useMemo(() => {
    if (selectedEntityId) {
      const exact = tasks.find((task) => (task.uri ?? task.name) === selectedEntityId);
      if (exact) return exact;
    }
    return filteredTasks[0] ?? tasks[0] ?? null;
  }, [filteredTasks, selectedEntityId, tasks]);

  useEffect(() => {
    if (!graphContainerRef.current) return;
    const cy = cytoscape({
      container: graphContainerRef.current,
      elements: [],
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "font-size": "10px",
            "text-wrap": "wrap",
            "text-max-width": "120px",
            "background-color": "#2563eb",
            color: "#0f172a"
          }
        },
        {
          selector: "edge",
          style: {
            width: 1.6,
            "line-color": "#64748b",
            "target-arrow-color": "#64748b",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": "8px",
            "text-rotation": "autorotate",
            "text-background-opacity": 1,
            "text-background-color": "#ffffff",
            "text-background-padding": "2px"
          }
        }
      ]
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().remove();
    if (!graphElements.length) return;
    cy.add(graphElements);
    cy.layout({
      name: "cose",
      animate: false,
      fit: true,
      padding: 24,
      nodeRepulsion: 4500,
      idealEdgeLength: 110
    }).run();
  }, [graphElements]);

  async function handleRunQuery() {
    setQueryRunning(true);
    setQueryStatus("");
    try {
      const result = await constructSparql(queryText);
      const { elements, stats } = buildGraphFromResult(result);
      setGraphElements(elements);
      setGraphStats(stats);
      setQueryStatus(
        stats.triples
          ? `Query completed. Parsed ${stats.triples} triples into ${stats.nodes} nodes and ${stats.edges} edges.`
          : "Query completed but no graph triples were found in s/p/o bindings."
      );
    } catch (error) {
      setGraphElements([]);
      setGraphStats({ triples: 0, nodes: 0, edges: 0 });
      const message =
        error instanceof Error ? error.message : "Unknown error while running query.";
      setQueryStatus(`Query failed: ${message}`);
    } finally {
      setQueryRunning(false);
    }
  }

  return (
    <section className="page-scaffold">
      <header className="page-header">
        <h2>Metadata Explorer</h2>
        <p>
          Browse task metadata and explore PipeKG entities via SPARQL queries and graph
          visualization.
        </p>
      </header>

      <div className="metadata-explorer-grid">
        <section className="query-panel">
          <h3>SPARQL Query</h3>
          <label htmlFor="example-query-select">Example queries</label>
          <select
            id="example-query-select"
            defaultValue=""
            onChange={(event) => {
              const chosen = EXAMPLE_QUERIES.find(
                (q) => q.label === event.target.value
              );
              if (chosen) setQueryText(chosen.query);
              event.target.value = "";
            }}
          >
            <option value="" disabled>
              — select an example —
            </option>
            {EXAMPLE_QUERIES.map((q) => (
              <option key={q.label} value={q.label}>
                {q.label}
              </option>
            ))}
          </select>
          <label htmlFor="graph-query">Query text</label>
          <textarea
            id="graph-query"
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
            rows={9}
          />
          <button type="button" onClick={handleRunQuery} disabled={queryRunning}>
            {queryRunning ? "Running..." : "Run Query"}
          </button>
          {queryStatus ? <p>{queryStatus}</p> : null}
        </section>

        <section className="graph-panel">
          <h3>Graph</h3>
          <div className="graph-canvas-placeholder">
            <div ref={graphContainerRef} className="graph-canvas" />
            {!graphElements.length ? (
              <div className="graph-empty-state">
                <p>Run a SPARQL query to render graph results.</p>
              </div>
            ) : null}
          </div>
          <p>
            Triples: {graphStats.triples} {" · "} Nodes: {graphStats.nodes} {" · "} Edges:{" "}
            {graphStats.edges}
          </p>
        </section>

        <aside className="explorer-sidebar">
          <label htmlFor="kg-search">Search entities</label>
          <input
            id="kg-search"
            type="text"
            value={query}
            placeholder="Task, IO format, method, tool, parameter..."
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="explorer-list-meta">{filteredTasks.length} task entities</div>
          <ul className="entity-list">
            {filteredTasks.map((task) => {
              const taskId = task.uri ?? task.name;
              return (
                <li key={taskId}>
                  <button
                    type="button"
                    className={
                      taskId === (selectedTask?.uri ?? selectedTask?.name)
                        ? "entity-btn selected"
                        : "entity-btn"
                    }
                    onClick={() => onSelectedEntityIdChange(taskId)}
                  >
                    {task.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <article className="explorer-detail">
          {selectedTask ? (
            <>
              <h3>{selectedTask.name}</h3>
              <div className="detail-grid">
                <section>
                  <h4>Inputs</h4>
                  <TagList values={selectedTask.inputs} emptyLabel="No declared inputs" />
                </section>
                <section>
                  <h4>Outputs</h4>
                  <TagList values={selectedTask.outputs} emptyLabel="No declared outputs" />
                </section>
                <section>
                  <h4>Implements Methods</h4>
                  <TagList
                    values={selectedTask.implements_method ?? []}
                    emptyLabel="No methods linked"
                  />
                </section>
                <section>
                  <h4>Uses Tools</h4>
                  <TagList
                    values={selectedTask.uses_tool ?? []}
                    emptyLabel="No tools linked"
                  />
                </section>
                <section>
                  <h4>Parameters</h4>
                  <TagList
                    values={selectedTask.has_parameter ?? []}
                    emptyLabel="No parameters linked"
                  />
                </section>
              </div>
            </>
          ) : (
            <p>Select a task entity to inspect details.</p>
          )}
        </article>
      </div>
    </section>
  );
}

type TagListProps = {
  values: string[];
  emptyLabel: string;
};

function TagList({ values, emptyLabel }: TagListProps) {
  if (values.length === 0) {
    return <p className="muted">{emptyLabel}</p>;
  }
  return (
    <div className="tag-list">
      {values.map((value) => (
        <span key={value} className="tag">
          {value}
        </span>
      ))}
    </div>
  );
}
