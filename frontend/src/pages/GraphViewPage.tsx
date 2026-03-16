import cytoscape, { type ElementDefinition } from "cytoscape";
import { useEffect, useMemo, useRef, useState } from "react";
import { constructSparql, type TaskSpec } from "../api";

type GraphViewPageProps = {
  tasks: TaskSpec[];
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

export function GraphViewPage({ tasks }: GraphViewPageProps) {
  const [queryText, setQueryText] = useState<string>(
    "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o } LIMIT 20"
  );
  const [entitySearch, setEntitySearch] = useState<string>("");
  const [selectedEntity, setSelectedEntity] = useState<string>("");
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

  const filteredEntities = useMemo(() => {
    const q = entitySearch.trim().toLowerCase();
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
  }, [entitySearch, tasks]);

  const selectedTask = useMemo(() => {
    if (selectedEntity) {
      const match = tasks.find((task) => task.name === selectedEntity);
      if (match) return match;
    }
    return filteredEntities[0] ?? null;
  }, [filteredEntities, selectedEntity, tasks]);

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
        <h2>GraphView</h2>
        <p>Draft layout for querying and visual exploration of PipeKG entities.</p>
      </header>

      <div className="graphview-layout">
        <div className="graphview-top">
          <section className="query-panel">
            <h3>Query</h3>
            <label htmlFor="graph-query">Graph query text</label>
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
            <h3>Graph View</h3>
            <div className="graph-canvas-placeholder">
              <div ref={graphContainerRef} className="graph-canvas" />
              {!graphElements.length ? (
                <div className="graph-empty-state">
                  <p>Run a SPARQL query to render graph results.</p>
                </div>
              ) : null}
            </div>
            <p>
              Selected entity: <strong>{selectedTask?.name ?? "none"}</strong>
            </p>
            <p>
              Triples: {graphStats.triples} {" · "} Nodes: {graphStats.nodes} {" · "} Edges:{" "}
              {graphStats.edges}
            </p>
          </section>
        </div>

        <section className="graphview-bottom">
          <div className="search-header">
            <h3>Entity Search</h3>
            <span>{filteredEntities.length} results</span>
          </div>
          <input
            type="text"
            value={entitySearch}
            placeholder="Search entities by name, IO, method, tool, parameter..."
            onChange={(event) => setEntitySearch(event.target.value)}
          />
          <div className="graph-entity-list-wrap">
            <ul className="entity-list">
              {filteredEntities.map((task) => (
                <li key={task.name}>
                  <button
                    type="button"
                    className={
                      task.name === selectedTask?.name ? "entity-btn selected" : "entity-btn"
                    }
                    onClick={() => setSelectedEntity(task.name)}
                  >
                    {task.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </section>
  );
}
