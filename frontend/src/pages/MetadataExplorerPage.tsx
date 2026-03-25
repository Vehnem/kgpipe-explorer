import cytoscape, { type ElementDefinition } from "cytoscape";
import cola from "cytoscape-cola";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  constructSparql,
  fetchSavedSparqlExamples,
  saveSparqlExample,
  type SavedSparqlExample,
  type TaskSpec
} from "../api";

cytoscape.use(cola);

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

type GraphLayoutName = "cose" | "breadthfirst" | "circle" | "grid" | "concentric";
type DetailViewMode = "entity" | "queryTable";

type QueryTerm = {
  value: string;
  type: string;
};

type QueryTriple = {
  s: QueryTerm;
  p: QueryTerm;
  o: QueryTerm;
};

type EntityTypeId =
  | "http://github.com/ScaDS/kgpipe/ontology/Task"
  | "http://github.com/ScaDS/kgpipe/ontology/TaskRun"
  | "http://github.com/ScaDS/kgpipe/ontology/Implementation"
  | "http://github.com/ScaDS/kgpipe/ontology/Metric"
  | "http://github.com/ScaDS/kgpipe/ontology/MetricRun";

type EntityTypeFilter = "all" | EntityTypeId;

type ExplorerEntity = {
  id: string;
  label: string;
  typeId: EntityTypeId;
  typeLabel: string;
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

function isInternalKgpipeUri(value: string): boolean {
  return value.startsWith("http://github.com/ScaDS/kgpipe");
}

function addUriToSubjectValuesClause(currentQuery: string, uri: string): string {
  const uriToken = `<${uri}>`;
  const escapedUri = uri.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const uriTokenPattern = new RegExp(`<\\s*${escapedUri}\\s*>`, "i");
  const rawUriPattern = new RegExp(`\\b${escapedUri}\\b`, "i");

  const braceValuesPattern = /(VALUES\s+\?s\s*\{)([\s\S]*?)(\})/i;
  const parenValuesPattern = /(VALUES\s+\?s\s*\()([\s\S]*?)(\))/i;

  const appendIfMissing = (
    fullMatch: string,
    prefix: string,
    valuesBody: string,
    suffix: string
  ): string => {
    if (uriTokenPattern.test(valuesBody) || rawUriPattern.test(valuesBody)) {
      return fullMatch;
    }
    const trimmed = valuesBody.trim();
    const separator = trimmed.length > 0 ? " " : "";
    return `${prefix}${trimmed}${separator}${uriToken}${suffix}`;
  };

  if (braceValuesPattern.test(currentQuery)) {
    return currentQuery.replace(
      braceValuesPattern,
      (fullMatch, prefix: string, valuesBody: string, suffix: string) =>
        appendIfMissing(fullMatch, prefix, valuesBody, suffix)
    );
  }

  if (parenValuesPattern.test(currentQuery)) {
    return currentQuery.replace(
      parenValuesPattern,
      (fullMatch, prefix: string, valuesBody: string, suffix: string) =>
        appendIfMissing(fullMatch, prefix, valuesBody, suffix)
    );
  }

  const whereMatch = /WHERE\s*\{/i.exec(currentQuery);
  if (!whereMatch) {
    return `${currentQuery.trim()}\nWHERE {\n  VALUES ?s { ${uriToken} }\n}`;
  }
  const insertIndex = whereMatch.index + whereMatch[0].length;
  return `${currentQuery.slice(0, insertIndex)}\n  VALUES ?s { ${uriToken} }${currentQuery.slice(insertIndex)}`;
}

function buildGraphFromResult(result: Record<string, unknown>): {
  elements: ElementDefinition[];
  stats: GraphStats;
  triples: QueryTriple[];
} {
  const maybeResults = (result as { results?: unknown }).results;
  if (!maybeResults || typeof maybeResults !== "object") {
    return { elements: [], stats: { triples: 0, nodes: 0, edges: 0 }, triples: [] };
  }

  const maybeBindings = (maybeResults as { bindings?: unknown }).bindings;
  if (!Array.isArray(maybeBindings)) {
    return { elements: [], stats: { triples: 0, nodes: 0, edges: 0 }, triples: [] };
  }

  const nodeMap = new Map<
    string,
    { id: string; label: string; value: string; termType: string }
  >();
  const edgeElements: ElementDefinition[] = [];
  const triples: QueryTriple[] = [];
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
    triples.push({
      s: { value: binding.s.value, type: binding.s.type },
      p: { value: binding.p.value, type: binding.p.type },
      o: { value: binding.o.value, type: binding.o.type }
    });
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
    },
    triples
  };
}

type ExampleQuery = {
  label: string;
  query: string;
};

const BUILTIN_EXAMPLE_QUERIES: ExampleQuery[] = [
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

const ENTITY_TYPES: Array<{ id: EntityTypeId; label: string; prefixed: string }> = [
  {
    id: "http://github.com/ScaDS/kgpipe/ontology/Task",
    label: "Tasks",
    prefixed: "kgo:Task"
  },
  {
    id: "http://github.com/ScaDS/kgpipe/ontology/TaskRun",
    label: "Task Runs",
    prefixed: "kgo:TaskRun"
  },
  {
    id: "http://github.com/ScaDS/kgpipe/ontology/Implementation",
    label: "Implementations",
    prefixed: "kgo:Implementation"
  },
  {
    id: "http://github.com/ScaDS/kgpipe/ontology/Metric",
    label: "Metrics",
    prefixed: "kgo:Metric"
  },
  {
    id: "http://github.com/ScaDS/kgpipe/ontology/MetricRun",
    label: "Metric Runs",
    prefixed: "kgo:MetricRun"
  }
];

const ENTITY_TYPE_LABEL_BY_ID: Record<EntityTypeId, string> = {
  "http://github.com/ScaDS/kgpipe/ontology/Task": "Tasks",
  "http://github.com/ScaDS/kgpipe/ontology/TaskRun": "Task Runs",
  "http://github.com/ScaDS/kgpipe/ontology/Implementation": "Implementations",
  "http://github.com/ScaDS/kgpipe/ontology/Metric": "Metrics",
  "http://github.com/ScaDS/kgpipe/ontology/MetricRun": "Metric Runs"
};

const RDF_TYPE_URI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_LABEL_URI = "http://www.w3.org/2000/01/rdf-schema#label";

const ENTITY_DISCOVERY_QUERY = `PREFIX kgo: <http://github.com/ScaDS/kgpipe/ontology/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
CONSTRUCT {
  ?entity a ?type .
  ?entity rdfs:label ?label .
}
WHERE {
  VALUES ?type {
    kgo:Task
    kgo:TaskRun
    kgo:Implementation
    kgo:Metric
    kgo:MetricRun
  }
  ?entity a ?type .
  OPTIONAL { ?entity rdfs:label ?label . }
}`;

const GRAPH_LAYOUT_OPTIONS: Array<{ value: GraphLayoutName; label: string }> = [
  { value: "cose", label: "Force-directed (CoSE)" },
  { value: "breadthfirst", label: "Breadthfirst" },
  { value: "circle", label: "Circle" },
  { value: "grid", label: "Grid" },
  { value: "concentric", label: "Concentric" }
];

function runLayout(cy: cytoscape.Core, layoutName: GraphLayoutName, dynamicForceLayout: boolean) {
  const common = { fit: true, padding: 24 };
  switch (layoutName) {
    case "breadthfirst":
      cy.layout({ ...common, name: "breadthfirst", animate: false, directed: true, spacingFactor: 1.1 }).run();
      return;
    case "circle":
      cy.layout({ ...common, name: "circle", animate: false, spacingFactor: 1.15 }).run();
      return;
    case "grid":
      cy.layout({ ...common, name: "grid", animate: false, avoidOverlap: true, condense: false }).run();
      return;
    case "concentric":
      cy.layout({ ...common, name: "concentric", animate: false, minNodeSpacing: 30, spacingFactor: 1.1 }).run();
      return;
    case "cose":
    default:
      if (dynamicForceLayout) {
        cy.layout({
          ...common,
          name: "cola",
          animate: true,
          infinite: true,
          randomize: true,
          avoidOverlap: true,
          edgeLength: 160,
          nodeSpacing: 35
        } as cytoscape.LayoutOptions).run();
      } else {
        cy.layout({
          ...common,
          name: "cose",
          animate: false,
          randomize: true,
          nodeRepulsion: 400000,
          idealEdgeLength: 100,
          gravity: 0.25,
          numIter: 1000
        }).run();
      }
  }
}

function isEntityTypeId(value: string): value is EntityTypeId {
  return ENTITY_TYPES.some((type) => type.id === value);
}

function buildEntitiesFromConstruct(result: Record<string, unknown>): ExplorerEntity[] {
  const maybeResults = (result as { results?: unknown }).results;
  if (!maybeResults || typeof maybeResults !== "object") return [];
  const maybeBindings = (maybeResults as { bindings?: unknown }).bindings;
  if (!Array.isArray(maybeBindings)) return [];

  const entityMap = new Map<string, { typeId?: EntityTypeId; label?: string }>();
  for (const row of maybeBindings) {
    if (!row || typeof row !== "object") continue;
    const binding = row as Record<string, unknown>;
    if (!isSparqlTerm(binding.s) || !isSparqlTerm(binding.p) || !isSparqlTerm(binding.o)) {
      continue;
    }
    const subjectId = binding.s.value;
    const record = entityMap.get(subjectId) ?? {};
    if (binding.p.value === RDF_TYPE_URI && binding.o.type === "uri" && isEntityTypeId(binding.o.value)) {
      record.typeId = binding.o.value;
    }
    if (binding.p.value === RDFS_LABEL_URI && binding.o.type === "literal") {
      record.label = binding.o.value;
    }
    entityMap.set(subjectId, record);
  }

  const entities: ExplorerEntity[] = [];
  for (const [id, record] of entityMap.entries()) {
    if (!record.typeId) continue;
    entities.push({
      id,
      label: record.label?.trim() || compactLabel(id),
      typeId: record.typeId,
      typeLabel: ENTITY_TYPE_LABEL_BY_ID[record.typeId]
    });
  }
  return entities.sort((a, b) => a.label.localeCompare(b.label));
}

export function MetadataExplorerPage({
  tasks,
  selectedEntityId,
  onSelectedEntityIdChange
}: MetadataExplorerPageProps) {
  const [query, setQuery] = useState<string>("");
  const [queryText, setQueryText] = useState<string>(BUILTIN_EXAMPLE_QUERIES[0].query);
  const [queryRunning, setQueryRunning] = useState<boolean>(false);
  const [queryStatus, setQueryStatus] = useState<string>("");
  const [savedExamples, setSavedExamples] = useState<SavedSparqlExample[]>([]);
  const [savedExamplesStatus, setSavedExamplesStatus] = useState<string>("");
  const [graphElements, setGraphElements] = useState<ElementDefinition[]>([]);
  const [graphHeight, setGraphHeight] = useState<number>(420);
  const [graphStats, setGraphStats] = useState<GraphStats>({
    triples: 0,
    nodes: 0,
    edges: 0
  });
  const [queryTriples, setQueryTriples] = useState<QueryTriple[]>([]);
  const [graphLayout, setGraphLayout] = useState<GraphLayoutName>("cose");
  const [dynamicForceLayout, setDynamicForceLayout] = useState<boolean>(false);
  const [detailViewMode, setDetailViewMode] = useState<DetailViewMode>("entity");
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityTypeFilter>("all");
  const [entities, setEntities] = useState<ExplorerEntity[]>([]);
  const [entityStatus, setEntityStatus] = useState<string>("");
  const [leftColumnWidth, setLeftColumnWidth] = useState<number>(360);
  const [isResizingColumns, setIsResizingColumns] = useState<boolean>(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const activeLayoutRef = useRef<cytoscape.Layouts | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSavedExamples() {
      setSavedExamplesStatus("");
      try {
        const examples = await fetchSavedSparqlExamples();
        if (cancelled) return;
        setSavedExamples(examples);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Unknown error while loading saved examples.";
        setSavedExamplesStatus(message);
      }
    }
    void loadSavedExamples();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredEntities = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entities.filter((entity) => {
      if (entityTypeFilter !== "all" && entity.typeId !== entityTypeFilter) {
        return false;
      }
      if (!q) return true;
      return `${entity.label} ${entity.id} ${entity.typeLabel}`.toLowerCase().includes(q);
    });
  }, [entities, entityTypeFilter, query]);

  const groupedFilteredEntities = useMemo(() => {
    return ENTITY_TYPES.map((type) => ({
      ...type,
      entities: filteredEntities.filter((entity) => entity.typeId === type.id)
    })).filter((group) => group.entities.length > 0);
  }, [filteredEntities]);

  useEffect(() => {
    let cancelled = false;
    async function loadEntities() {
      setEntityStatus("");
      try {
        const result = await constructSparql(ENTITY_DISCOVERY_QUERY);
        const discoveredEntities = buildEntitiesFromConstruct(result);
        if (cancelled) return;
        setEntities(discoveredEntities);
        if (!discoveredEntities.length) {
          setEntityStatus("No typed entities found for the configured kgo:* classes.");
        }
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Unknown error while loading entities.";
        setEntityStatus(`Entity discovery failed: ${message}`);
      }
    }
    void loadEntities();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!entities.length) return;
    if (selectedEntityId) return;
    const fallback = filteredEntities[0] ?? entities[0];
    if (fallback) {
      onSelectedEntityIdChange(fallback.id);
    }
  }, [entities, filteredEntities, onSelectedEntityIdChange, selectedEntityId]);

  const selectedTask = useMemo(() => {
    if (selectedEntityId) {
      const exact = tasks.find((task) => (task.uri ?? task.name) === selectedEntityId);
      if (exact) return exact;
    }
    return null;
  }, [selectedEntityId, tasks]);

  const selectedEntity = useMemo(() => {
    if (!selectedEntityId) return null;
    return entities.find((entity) => entity.id === selectedEntityId) ?? null;
  }, [entities, selectedEntityId]);

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
    activeLayoutRef.current?.stop();
    cy.nodes().unlock();
    cy.elements().remove();
    if (!graphElements.length) return;
    cy.add(graphElements);

    const common = { fit: true, padding: 24 };
    let layoutOpts: cytoscape.LayoutOptions;

    if (graphLayout === "cose") {
      if (dynamicForceLayout) {
        layoutOpts = {
          ...common,
          name: "cola",
          animate: true,
          infinite: true,
          randomize: true,
          avoidOverlap: true,
          edgeLength: 160,
          nodeSpacing: 35
        } as cytoscape.LayoutOptions;
      } else {
        layoutOpts = {
          ...common,
          name: "cose",
          animate: false,
          randomize: true,
          nodeRepulsion: 400000,
          idealEdgeLength: 100,
          gravity: 0.25,
          numIter: 1000
        };
      }
    } else if (graphLayout === "breadthfirst") {
      layoutOpts = { ...common, name: "breadthfirst", animate: false, directed: true, spacingFactor: 1.1 };
    } else if (graphLayout === "circle") {
      layoutOpts = { ...common, name: "circle", animate: false, spacingFactor: 1.15 };
    } else if (graphLayout === "grid") {
      layoutOpts = { ...common, name: "grid", animate: false, avoidOverlap: true, condense: false };
    } else {
      layoutOpts = { ...common, name: "concentric", animate: false, minNodeSpacing: 30, spacingFactor: 1.1 };
    }

    const layout = cy.layout(layoutOpts);
    activeLayoutRef.current = layout;
    layout.run();
  }, [dynamicForceLayout, graphElements, graphLayout]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.resize();
    if (graphElements.length) {
      cy.fit(undefined, 24);
    }
  }, [graphElements.length, graphHeight, leftColumnWidth]);

  async function handleRunQuery() {
    setQueryRunning(true);
    setQueryStatus("");
    try {
      const result = await constructSparql(queryText);
      const { elements, stats, triples } = buildGraphFromResult(result);
      setGraphElements(elements);
      setGraphStats(stats);
      setQueryTriples(triples);
      setQueryStatus(
        stats.triples
          ? `Query completed. Parsed ${stats.triples} triples into ${stats.nodes} nodes and ${stats.edges} edges.`
          : "Query completed but no graph triples were found in s/p/o bindings."
      );
    } catch (error) {
      setGraphElements([]);
      setGraphStats({ triples: 0, nodes: 0, edges: 0 });
      setQueryTriples([]);
      const message =
        error instanceof Error ? error.message : "Unknown error while running query.";
      setQueryStatus(`Query failed: ${message}`);
    } finally {
      setQueryRunning(false);
    }
  }

  async function handleSaveExample() {
    const trimmedQuery = queryText.trim();
    if (!trimmedQuery) {
      setQueryStatus("Cannot save an empty query.");
      return;
    }
    const name = window.prompt("Save current query as example. Name:");
    if (name === null) return;
    const label = name.trim();
    if (!label) {
      setQueryStatus("Example name cannot be empty.");
      return;
    }
    try {
      await saveSparqlExample({ label, query: trimmedQuery });
      const refreshed = await fetchSavedSparqlExamples();
      setSavedExamples(refreshed);
      setQueryStatus(`Saved example "${label}".`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error while saving example.";
      setQueryStatus(message);
    }
  }

  function handleAddEntityToQuery(entityId: string) {
    setQueryText((previous) => addUriToSubjectValuesClause(previous, entityId));
  }

  function startColumnResize(event: React.PointerEvent<HTMLDivElement>) {
    const container = gridRef.current;
    if (!container) return;
    event.preventDefault();
    setIsResizingColumns(true);
    event.currentTarget.setPointerCapture(event.pointerId);

    const containerRect = container.getBoundingClientRect();
    const minLeft = 260;
    const minRight = 320;
    const maxLeft = Math.max(minLeft, containerRect.width - minRight);

    const updateFromClientX = (clientX: number) => {
      const next = clientX - containerRect.left;
      const clamped = Math.min(maxLeft, Math.max(minLeft, next));
      setLeftColumnWidth(clamped);
    };

    updateFromClientX(event.clientX);

    const onPointerMove = (moveEvent: PointerEvent) => {
      updateFromClientX(moveEvent.clientX);
    };

    const stopResize = () => {
      setIsResizingColumns(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
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

      <div
        ref={gridRef}
        className={`metadata-explorer-grid${isResizingColumns ? " is-resizing" : ""}`}
        style={{ gridTemplateColumns: `${leftColumnWidth}px 8px minmax(0, 1fr)` }}
      >
        <section className="query-panel" style={{ gridColumn: 1, gridRow: 1 }}>
          <h3>SPARQL Query</h3>
          <label htmlFor="example-query-select">Example queries</label>
          <select
            id="example-query-select"
            defaultValue=""
            onChange={(event) => {
              const selectedLabel = event.target.value;
              const chosenSaved = savedExamples.find((q) => q.label === selectedLabel);
              const chosenBuiltin = BUILTIN_EXAMPLE_QUERIES.find((q) => q.label === selectedLabel);
              const chosen = chosenSaved ?? chosenBuiltin;
              if (chosen) setQueryText(chosen.query);
              event.target.value = "";
            }}
          >
            <option value="" disabled>
              — select an example —
            </option>
            {savedExamples.length ? (
              <optgroup label="Saved">
                {savedExamples.map((q) => (
                  <option key={`saved:${q.label}`} value={q.label}>
                    {q.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="Built-in">
              {BUILTIN_EXAMPLE_QUERIES.map((q) => (
                <option key={`builtin:${q.label}`} value={q.label}>
                  {q.label}
                </option>
              ))}
            </optgroup>
          </select>
          {savedExamplesStatus ? <p className="muted">Saved examples: {savedExamplesStatus}</p> : null}
          <label htmlFor="graph-query">Query text</label>
          <textarea
            id="graph-query"
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
            rows={9}
          />
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" onClick={handleRunQuery} disabled={queryRunning}>
              {queryRunning ? "Running..." : "Run Query"}
            </button>
            <button type="button" onClick={handleSaveExample} disabled={queryRunning}>
              Save as example…
            </button>
          </div>
          {queryStatus ? <p>{queryStatus}</p> : null}
        </section>

        <div
          className="metadata-grid-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize query and graph panels"
          onPointerDown={startColumnResize}
          style={{ gridColumn: 2, gridRow: "1 / span 2" }}
        />

        <section className="graph-panel" style={{ gridColumn: 3, gridRow: 1 }}>
          <h3>Graph</h3>
          <label htmlFor="graph-layout-select">Layout</label>
          <select
            id="graph-layout-select"
            value={graphLayout}
            onChange={(event) => setGraphLayout(event.target.value as GraphLayoutName)}
          >
            {GRAPH_LAYOUT_OPTIONS.map((layout) => (
              <option key={layout.value} value={layout.value}>
                {layout.label}
              </option>
            ))}
          </select>
          {graphLayout === "cose" ? (
            <label>
              <input
                type="checkbox"
                checked={dynamicForceLayout}
                onChange={(event) => setDynamicForceLayout(event.target.checked)}
              />{" "}
              Dynamic force layout
            </label>
          ) : null}
          <label htmlFor="graph-height">
            Graph height{" "}
            <span className="muted" style={{ marginLeft: 6 }}>
              {Math.round(graphHeight)}px
            </span>
          </label>
          <input
            id="graph-height"
            type="range"
            min={260}
            max={900}
            step={10}
            value={graphHeight}
            onChange={(event) => setGraphHeight(Number(event.target.value))}
          />
          <div className="graph-canvas-placeholder" style={{ height: graphHeight }}>
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

        <aside className="explorer-sidebar" style={{ gridColumn: 1, gridRow: 2 }}>
          <label htmlFor="kg-search">Search entities</label>
          <input
            id="kg-search"
            type="text"
            value={query}
            placeholder="Entity label or URI..."
            onChange={(event) => setQuery(event.target.value)}
          />
          <label htmlFor="entity-type-filter">Entity type</label>
          <select
            id="entity-type-filter"
            value={entityTypeFilter}
            onChange={(event) => setEntityTypeFilter(event.target.value as EntityTypeFilter)}
          >
            <option value="all">All supported types</option>
            {ENTITY_TYPES.map((type) => (
              <option key={type.id} value={type.id}>
                {type.prefixed}
              </option>
            ))}
          </select>
          <div className="explorer-list-meta">{filteredEntities.length} entities</div>
          {entityStatus ? <p className="muted">{entityStatus}</p> : null}
          {groupedFilteredEntities.map((group) => (
            <section key={group.id}>
              <h4>{group.prefixed}</h4>
              <ul className="entity-list">
                {group.entities.map((entity) => (
                  <li key={entity.id}>
                    <div className="entity-row">
                      <button
                        type="button"
                        className={entity.id === selectedEntityId ? "entity-btn selected" : "entity-btn"}
                        onClick={() => onSelectedEntityIdChange(entity.id)}
                      >
                        {entity.label}
                      </button>
                      <button
                        type="button"
                        className="entity-insert-btn"
                        onClick={() => handleAddEntityToQuery(entity.id)}
                        title="Add this entity URI to VALUES ?s"
                        aria-label={`Add ${entity.label} to VALUES ?s in query`}
                      >
                        + VALUES ?s
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </aside>

        <article className="explorer-detail" style={{ gridColumn: 3, gridRow: 2 }}>
          <nav className="page-tabs" aria-label="Detail view switch">
            <button
              type="button"
              className={detailViewMode === "entity" ? "active" : ""}
              onClick={() => setDetailViewMode("entity")}
            >
              Entity view
            </button>
            <button
              type="button"
              className={detailViewMode === "queryTable" ? "active" : ""}
              onClick={() => setDetailViewMode("queryTable")}
            >
              Query result table
            </button>
          </nav>

          {detailViewMode === "entity" ? (
            selectedTask ? (
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
            ) : selectedEntity ? (
              <>
                <h3>{selectedEntity.label}</h3>
                <p>
                  <strong>Type:</strong> {ENTITY_TYPES.find((t) => t.id === selectedEntity.typeId)?.prefixed}
                </p>
                <p>
                  <strong>URI:</strong> {selectedEntity.id}
                </p>
              </>
            ) : (
              <p>Select an entity to inspect details.</p>
            )
          ) : (
            <>
              <h3>Construct Query Result</h3>
              {queryTriples.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Predicate</th>
                        <th>Object</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queryTriples.map((triple, index) => (
                        <tr
                          key={`${triple.s.value}|${triple.p.value}|${triple.o.value}|${index}`}
                        >
                          <td>
                            <QueryTermCell
                              term={triple.s}
                              onSelectEntity={(entityId) => {
                                onSelectedEntityIdChange(entityId);
                                setDetailViewMode("entity");
                              }}
                            />
                          </td>
                          <td>
                            <QueryTermCell
                              term={triple.p}
                              onSelectEntity={(entityId) => {
                                onSelectedEntityIdChange(entityId);
                                setDetailViewMode("entity");
                              }}
                            />
                          </td>
                          <td>
                            <QueryTermCell
                              term={triple.o}
                              onSelectEntity={(entityId) => {
                                onSelectedEntityIdChange(entityId);
                                setDetailViewMode("entity");
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Run a CONSTRUCT query to populate the result table.</p>
              )}
            </>
          )}
        </article>
      </div>
    </section>
  );
}

type QueryTermCellProps = {
  term: QueryTerm;
  onSelectEntity: (entityId: string) => void;
};

function QueryTermCell({ term, onSelectEntity }: QueryTermCellProps) {
  if (term.type !== "uri") {
    return <span>{term.value}</span>;
  }

  if (isInternalKgpipeUri(term.value)) {
    return (
      <button type="button" className="entity-btn" onClick={() => onSelectEntity(term.value)}>
        {term.value}
      </button>
    );
  }

  return (
    <a href={term.value} target="_blank" rel="noopener noreferrer">
      {term.value}
    </a>
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
