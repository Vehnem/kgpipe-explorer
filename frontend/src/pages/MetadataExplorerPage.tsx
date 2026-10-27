import { StreamLanguage } from "@codemirror/language";
import { sparql } from "@codemirror/legacy-modes/mode/sparql";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import cytoscape, { type ElementDefinition } from "cytoscape";
import cola from "cytoscape-cola";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  constructSparql,
  fetchBuiltinSparqlExamples,
  fetchEntityTypes,
  fetchSavedSparqlExamples,
  saveSparqlExample,
  type EntityTypeInfo,
  type SavedSparqlExample
} from "../api";

cytoscape.use(cola);

type MetadataExplorerPageProps = {
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

type NodeTypeLegendItem = {
  typeUri: string;
  label: string;
  color: string;
  count: number;
};

type GraphLayoutName = "cose" | "breadthfirst" | "circle" | "grid" | "concentric";
type DetailViewMode = "entity" | "queryTable" | "graph";

type QueryTerm = {
  value: string;
  type: string;
};

type QueryTriple = {
  s: QueryTerm;
  p: QueryTerm;
  o: QueryTerm;
};

type EntityTypeId = string;

type EntityTypeFilter = "all" | EntityTypeId;

type ExplorerEntity = {
  id: string;
  label: string;
  typeId: EntityTypeId;
  typeLabel: string;
};

type FetchedEntitySummary = {
  id: string;
  label: string;
  typeUris: string[];
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

function hashStringToInt(value: string): number {
  // Simple deterministic hash (32-bit) for stable colors across renders.
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function hslToHex(h: number, s: number, l: number): string {
  // h in [0..360), s/l in [0..100]
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const ll = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hh >= 0 && hh < 1) {
    r1 = c;
    g1 = x;
  } else if (hh >= 1 && hh < 2) {
    r1 = x;
    g1 = c;
  } else if (hh >= 2 && hh < 3) {
    g1 = c;
    b1 = x;
  } else if (hh >= 3 && hh < 4) {
    g1 = x;
    b1 = c;
  } else if (hh >= 4 && hh < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  const m = ll - c / 2;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function colorForTypeUri(typeUri: string): string {
  const h = Math.abs(hashStringToInt(typeUri)) % 360;
  // A moderately saturated, mid-lightness palette for readability.
  return hslToHex(h, 65, 52);
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
  typeLegend: NodeTypeLegendItem[];
} {
  const maybeResults = (result as { results?: unknown }).results;
  if (!maybeResults || typeof maybeResults !== "object") {
    return { elements: [], stats: { triples: 0, nodes: 0, edges: 0 }, triples: [], typeLegend: [] };
  }

  const maybeBindings = (maybeResults as { bindings?: unknown }).bindings;
  if (!Array.isArray(maybeBindings)) {
    return { elements: [], stats: { triples: 0, nodes: 0, edges: 0 }, triples: [], typeLegend: [] };
  }

  const nodeMap = new Map<
    string,
    { id: string; label: string; value: string; termType: string }
  >();
  const typeUrisByNodeId = new Map<string, Set<string>>();
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

    if (binding.p.value === RDF_TYPE_URI && binding.o.type === "uri") {
      const set = typeUrisByNodeId.get(sourceId) ?? new Set<string>();
      set.add(binding.o.value);
      typeUrisByNodeId.set(sourceId, set);
    }

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
      termType: node.termType,
      typeUris: [...(typeUrisByNodeId.get(node.id) ?? new Set<string>())].sort(),
      primaryTypeUri: [...(typeUrisByNodeId.get(node.id) ?? new Set<string>())].sort()[0] ?? "",
      nodeColor: (() => {
        const primary = [...(typeUrisByNodeId.get(node.id) ?? new Set<string>())].sort()[0];
        return primary ? colorForTypeUri(primary) : "#94a3b8";
      })()
    }
  }));

  const typeCounts = new Map<string, number>();
  for (const node of nodeElements) {
    const data = node.data as Record<string, unknown>;
    const primaryTypeUri = typeof data.primaryTypeUri === "string" ? data.primaryTypeUri : "";
    if (!primaryTypeUri) continue;
    typeCounts.set(primaryTypeUri, (typeCounts.get(primaryTypeUri) ?? 0) + 1);
  }

  const typeLegend: NodeTypeLegendItem[] = [...typeCounts.entries()]
    .map(([typeUri, count]) => ({
      typeUri,
      label: compactLabel(typeUri),
      color: colorForTypeUri(typeUri),
      count
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    elements: [...nodeElements, ...edgeElements],
    stats: {
      triples: tripleCount,
      nodes: nodeElements.length,
      edges: edgeElements.length
    },
    triples,
    typeLegend
  };
}

type ExampleQuery = {
  label: string;
  query: string;
};

const RDF_TYPE_URI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_LABEL_URI = "http://www.w3.org/2000/01/rdf-schema#label";

function buildEntityOutgoingTriplesFromConstruct(
  result: Record<string, unknown>,
  entityId: string
): QueryTriple[] {
  const maybeResults = (result as { results?: unknown }).results;
  if (!maybeResults || typeof maybeResults !== "object") return [];
  const maybeBindings = (maybeResults as { bindings?: unknown }).bindings;
  if (!Array.isArray(maybeBindings)) return [];

  const triples: QueryTriple[] = [];
  for (const row of maybeBindings) {
    if (!row || typeof row !== "object") continue;
    const binding = row as Record<string, unknown>;
    if (!isSparqlTerm(binding.s) || !isSparqlTerm(binding.p) || !isSparqlTerm(binding.o)) continue;
    if (binding.s.type !== "uri" || binding.s.value !== entityId) continue;
    triples.push({
      s: { value: binding.s.value, type: binding.s.type },
      p: { value: binding.p.value, type: binding.p.type },
      o: { value: binding.o.value, type: binding.o.type }
    });
  }

  // Sort for stable display: predicate, then object
  return triples.sort(
    (a, b) =>
      a.p.value.localeCompare(b.p.value) ||
      a.o.value.localeCompare(b.o.value) ||
      a.o.type.localeCompare(b.o.type)
  );
}

function buildEntitySummaryFromConstruct(
  result: Record<string, unknown>,
  entityId: string
): FetchedEntitySummary | null {
  const maybeResults = (result as { results?: unknown }).results;
  if (!maybeResults || typeof maybeResults !== "object") return null;
  const maybeBindings = (maybeResults as { bindings?: unknown }).bindings;
  if (!Array.isArray(maybeBindings)) return null;

  const typeUris = new Set<string>();
  const labels: string[] = [];

  for (const row of maybeBindings) {
    if (!row || typeof row !== "object") continue;
    const binding = row as Record<string, unknown>;
    if (!isSparqlTerm(binding.s) || !isSparqlTerm(binding.p) || !isSparqlTerm(binding.o)) continue;
    if (binding.s.type !== "uri" || binding.s.value !== entityId) continue;

    if (binding.p.value === RDF_TYPE_URI && binding.o.type === "uri") {
      typeUris.add(binding.o.value);
    }
    if (binding.p.value === RDFS_LABEL_URI && binding.o.type === "literal") {
      const label = binding.o.value.trim();
      if (label) labels.push(label);
    }
  }

  const label = labels[0] ?? compactLabel(entityId);
  return { id: entityId, label, typeUris: [...typeUris].sort() };
}

const SPARQL_EDITOR_EXTENSIONS = [
  StreamLanguage.define(sparql),
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({ id: "graph-query", "aria-label": "Query text" })
];

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

function isEntityTypeId(
  value: string,
  entityTypes: EntityTypeInfo[]
): value is EntityTypeId {
  return entityTypes.some((type) => type.id === value);
}

function buildEntitiesFromConstruct(
  result: Record<string, unknown>,
  entityTypes: EntityTypeInfo[]
): ExplorerEntity[] {
  const maybeResults = (result as { results?: unknown }).results;
  if (!maybeResults || typeof maybeResults !== "object") return [];
  const maybeBindings = (maybeResults as { bindings?: unknown }).bindings;
  if (!Array.isArray(maybeBindings)) return [];

  const labelById = Object.fromEntries(entityTypes.map((type) => [type.id, type.label]));

  const entityMap = new Map<string, { typeId?: EntityTypeId; label?: string }>();
  for (const row of maybeBindings) {
    if (!row || typeof row !== "object") continue;
    const binding = row as Record<string, unknown>;
    if (!isSparqlTerm(binding.s) || !isSparqlTerm(binding.p) || !isSparqlTerm(binding.o)) {
      continue;
    }
    const subjectId = binding.s.value;
    const record = entityMap.get(subjectId) ?? {};
    if (
      binding.p.value === RDF_TYPE_URI &&
      binding.o.type === "uri" &&
      isEntityTypeId(binding.o.value, entityTypes)
    ) {
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
      typeLabel: labelById[record.typeId] ?? compactLabel(record.typeId)
    });
  }
  return entities.sort((a, b) => a.label.localeCompare(b.label));
}

export function MetadataExplorerPage({
  selectedEntityId,
  onSelectedEntityIdChange
}: MetadataExplorerPageProps) {
  const [query, setQuery] = useState<string>("");
  const [queryText, setQueryText] = useState<string>("");
  const [builtinExamples, setBuiltinExamples] = useState<ExampleQuery[]>([]);
  const [entityTypes, setEntityTypes] = useState<EntityTypeInfo[]>([]);
  const [discoveryQuery, setDiscoveryQuery] = useState<string>("");
  const [queryRunning, setQueryRunning] = useState<boolean>(false);
  const [queryStatus, setQueryStatus] = useState<string>("");
  const [savedExamples, setSavedExamples] = useState<SavedSparqlExample[]>([]);
  const [savedExamplesStatus, setSavedExamplesStatus] = useState<string>("");
  const [graphElements, setGraphElements] = useState<ElementDefinition[]>([]);
  const [graphStats, setGraphStats] = useState<GraphStats>({
    triples: 0,
    nodes: 0,
    edges: 0
  });
  const [queryTriples, setQueryTriples] = useState<QueryTriple[]>([]);
  const [nodeTypeLegend, setNodeTypeLegend] = useState<NodeTypeLegendItem[]>([]);
  const [graphLayout, setGraphLayout] = useState<GraphLayoutName>("cose");
  const [dynamicForceLayout, setDynamicForceLayout] = useState<boolean>(false);
  const [graphMaximized, setGraphMaximized] = useState<boolean>(false);
  const [detailViewMode, setDetailViewMode] = useState<DetailViewMode>("entity");
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityTypeFilter>("all");
  const [entities, setEntities] = useState<ExplorerEntity[]>([]);
  const [entityStatus, setEntityStatus] = useState<string>("");
  const [fetchedEntity, setFetchedEntity] = useState<FetchedEntitySummary | null>(null);
  const [fetchedEntityStatus, setFetchedEntityStatus] = useState<string>("");
  const [fetchedEntityTriples, setFetchedEntityTriples] = useState<QueryTriple[]>([]);
  const [leftColumnWidth, setLeftColumnWidth] = useState<number>(360);
  const [isResizingColumns, setIsResizingColumns] = useState<boolean>(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const activeLayoutRef = useRef<cytoscape.Layouts | null>(null);
  const onSelectedEntityIdChangeRef = useRef(onSelectedEntityIdChange);
  onSelectedEntityIdChangeRef.current = onSelectedEntityIdChange;

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const [builtins, ontology] = await Promise.all([
          fetchBuiltinSparqlExamples(),
          fetchEntityTypes()
        ]);
        if (cancelled) return;
        setBuiltinExamples(builtins);
        setEntityTypes(ontology.types);
        setDiscoveryQuery(ontology.discovery_query);
        if (builtins.length > 0) {
          setQueryText((current) => current || builtins[0].query);
        }
      } catch {
        // Non-critical for initial paint; entity discovery will show its own error.
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

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
    return entityTypes
      .map((type) => ({
        ...type,
        entities: filteredEntities.filter((entity) => entity.typeId === type.id)
      }))
      .filter((group) => group.entities.length > 0);
  }, [filteredEntities, entityTypes]);

  useEffect(() => {
    if (!discoveryQuery || entityTypes.length === 0) {
      return;
    }
    let cancelled = false;
    async function loadEntities() {
      setEntityStatus("");
      try {
        const result = await constructSparql(discoveryQuery);
        const discoveredEntities = buildEntitiesFromConstruct(result, entityTypes);
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
  }, [discoveryQuery, entityTypes]);

  useEffect(() => {
    if (!entities.length) return;
    if (selectedEntityId) return;
    const fallback = filteredEntities[0] ?? entities[0];
    if (fallback) {
      onSelectedEntityIdChange(fallback.id);
    }
  }, [entities, filteredEntities, onSelectedEntityIdChange, selectedEntityId]);

  const selectedEntity = useMemo(() => {
    if (!selectedEntityId) return null;
    return entities.find((entity) => entity.id === selectedEntityId) ?? null;
  }, [entities, selectedEntityId]);

  useEffect(() => {
    let cancelled = false;
    async function loadEntityDetails() {
      setFetchedEntity(null);
      setFetchedEntityStatus("");
      setFetchedEntityTriples([]);

      const id = selectedEntityId;
      if (!id) return;

      setFetchedEntityStatus("Loading selected entity…");
      try {
        const query = `CONSTRUCT { <${id}> ?p ?o } WHERE { <${id}> ?p ?o } LIMIT 300`;
        const result = await constructSparql(query);
        const summary = buildEntitySummaryFromConstruct(result, id);
        const outgoing = buildEntityOutgoingTriplesFromConstruct(result, id);
        if (cancelled) return;
        if (summary) setFetchedEntity(summary);
        setFetchedEntityTriples(outgoing);
        setFetchedEntityStatus("");
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Unknown error while loading entity details.";
        setFetchedEntityStatus(message);
      }
    }

    void loadEntityDetails();
    return () => {
      cancelled = true;
    };
  }, [selectedEntityId]);

  useEffect(() => {
    if (detailViewMode !== "graph") return;
    const container = graphContainerRef.current;
    if (!container) return;
    const cy = cytoscape({
      container,
      elements: [],
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "font-size": "10px",
            "text-wrap": "wrap",
            "text-max-width": "120px",
            "background-color": "data(nodeColor)",
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

    const onTapNode = (event: cytoscape.EventObject) => {
      const node = event.target as cytoscape.NodeSingular;
      const termType = node.data("termType") as unknown;
      const value = node.data("value") as unknown;
      if (termType !== "uri" || typeof value !== "string" || !value) return;
      onSelectedEntityIdChangeRef.current(value);
      setDetailViewMode("entity");
    };

    cy.on("tap", "node", onTapNode);
    cyRef.current = cy;
    return () => {
      activeLayoutRef.current?.stop();
      cy.destroy();
      cyRef.current = null;
    };
  }, [detailViewMode]);

  useEffect(() => {
    if (detailViewMode !== "graph") return;
    const cy = cyRef.current;
    if (!cy) return;

    const frame = window.requestAnimationFrame(() => {
      activeLayoutRef.current?.stop();
      cy.resize();
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
    });

    return () => {
      window.cancelAnimationFrame(frame);
      activeLayoutRef.current?.stop();
    };
  }, [detailViewMode, dynamicForceLayout, graphElements, graphLayout]);

  useEffect(() => {
    if (detailViewMode !== "graph") return;
    const cy = cyRef.current;
    if (!cy) return;
    const frame = window.requestAnimationFrame(() => {
      cy.resize();
      if (graphElements.length) {
        cy.fit(undefined, 24);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [detailViewMode, graphElements.length, graphMaximized, leftColumnWidth]);

  useEffect(() => {
    if (detailViewMode === "graph") return;
    setGraphMaximized(false);
  }, [detailViewMode]);

  useEffect(() => {
    if (!graphMaximized) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGraphMaximized(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [graphMaximized]);

  async function handleRunQuery() {
    setQueryRunning(true);
    setQueryStatus("");
    setDetailViewMode("queryTable");
    try {
      const result = await constructSparql(queryText);
      const { elements, stats, triples, typeLegend } = buildGraphFromResult(result);
      setGraphElements(elements);
      setGraphStats(stats);
      setQueryTriples(triples);
      setNodeTypeLegend(typeLegend);
      setQueryStatus(
        stats.triples
          ? `Query completed. Parsed ${stats.triples} triples into ${stats.nodes} nodes and ${stats.edges} edges.`
          : "Query completed but no graph triples were found in s/p/o bindings."
      );
    } catch (error) {
      setGraphElements([]);
      setGraphStats({ triples: 0, nodes: 0, edges: 0 });
      setQueryTriples([]);
      setNodeTypeLegend([]);
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
    <section className={`page-scaffold metadata-explorer-page${graphMaximized ? " is-graph-maximized" : ""}`}>
      <header className="page-header">
        <h2>Metadata Explorer</h2>
        <p>
          Browse task metadata and explore PipeKG entities via SPARQL queries and graph
          visualization.
        </p>
      </header>

      <div
        ref={gridRef}
        className={`metadata-explorer-grid${isResizingColumns ? " is-resizing" : ""}${graphMaximized ? " is-graph-maximized" : ""}`}
        style={{ gridTemplateColumns: `${leftColumnWidth}px 8px minmax(0, 1fr)` }}
      >
        <section className="query-panel" data-tutorial="explorer-query" style={{ gridColumn: "1 / -1", gridRow: 1 }}>
          <h3>SPARQL Query</h3>
          <label htmlFor="example-query-select">Example queries</label>
          <select
            id="example-query-select"
            defaultValue=""
            onChange={(event) => {
              const selectedLabel = event.target.value;
              const chosenSaved = savedExamples.find((q) => q.label === selectedLabel);
              const chosenBuiltin = builtinExamples.find((q) => q.label === selectedLabel);
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
              {builtinExamples.map((q) => (
                <option key={`builtin:${q.label}`} value={q.label}>
                  {q.label}
                </option>
              ))}
            </optgroup>
          </select>
          {savedExamplesStatus ? <p className="muted">Saved examples: {savedExamplesStatus}</p> : null}
          <label htmlFor="graph-query">Query text</label>
          <CodeMirror
            className="sparql-editor"
            value={queryText}
            height="180px"
            extensions={SPARQL_EDITOR_EXTENSIONS}
            basicSetup={{ lineNumbers: true, foldGutter: false }}
            onChange={setQueryText}
          />
          <div className="query-actions">
            <button type="button" onClick={handleRunQuery} disabled={queryRunning}>
              {queryRunning ? "Running..." : "Run Query"}
            </button>
            <button type="button" onClick={handleSaveExample} disabled={queryRunning}>
              Save as example…
            </button>
          </div>
          {queryStatus ? <p>{queryStatus}</p> : null}
        </section>

        <aside className="explorer-sidebar" data-tutorial="explorer-entities" style={{ gridColumn: 1, gridRow: 2 }}>
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
            {entityTypes.map((type) => (
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

        <div
          className="metadata-grid-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize columns"
          onPointerDown={startColumnResize}
          style={{ gridColumn: 2, gridRow: 2 }}
        />

        <article
          className={`explorer-detail${detailViewMode === "graph" ? " is-graph-view" : ""}`}
          data-tutorial="explorer-detail"
          style={graphMaximized ? { gridColumn: "1 / -1", gridRow: "1 / -1" } : { gridColumn: 3, gridRow: 2 }}
        >
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
            <button
              type="button"
              data-tutorial="explorer-graph"
              className={detailViewMode === "graph" ? "active" : ""}
              onClick={() => setDetailViewMode("graph")}
            >
              Graph view
            </button>
          </nav>

          {detailViewMode === "entity" ? (
            selectedEntity ? (
              <>
                <h3>{selectedEntity.label}</h3>
                <p>
                  <strong>Type:</strong> {entityTypes.find((t) => t.id === selectedEntity.typeId)?.prefixed}
                </p>
                <p>
                  <strong>URI:</strong> {selectedEntity.id}
                </p>
                {fetchedEntityStatus ? <p className="muted">{fetchedEntityStatus}</p> : null}
                {fetchedEntityTriples.length ? (
                  <div style={{ overflowX: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Predicate</th>
                          <th>Object</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fetchedEntityTriples.map((triple, index) => (
                          <tr key={`${triple.p.value}|${triple.o.value}|${triple.o.type}|${index}`}>
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
                ) : null}
              </>
            ) : fetchedEntity ? (
              <>
                <h3>{fetchedEntity.label}</h3>
                <p>
                  <strong>Type:</strong>{" "}
                  {fetchedEntity.typeUris.length ? fetchedEntity.typeUris.map(compactLabel).join(", ") : "—"}
                </p>
                <p>
                  <strong>URI:</strong> {fetchedEntity.id}
                </p>
                {fetchedEntityStatus ? <p className="muted">{fetchedEntityStatus}</p> : null}
                {fetchedEntityTriples.length ? (
                  <div style={{ overflowX: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Predicate</th>
                          <th>Object</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fetchedEntityTriples.map((triple, index) => (
                          <tr key={`${triple.p.value}|${triple.o.value}|${triple.o.type}|${index}`}>
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
                ) : null}
              </>
            ) : fetchedEntityStatus ? (
              <p className="muted">{fetchedEntityStatus}</p>
            ) : (
              <p>Select an entity to inspect details.</p>
            )
          ) : detailViewMode === "queryTable" ? (
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
          ) : (
            <div className="graph-tab">
              <div className="graph-toolbar">
                <label htmlFor="graph-layout-select">
                  Layout
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
                </label>
                {graphLayout === "cose" ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={dynamicForceLayout}
                      onChange={(event) => setDynamicForceLayout(event.target.checked)}
                    />
                    Dynamic force layout
                  </label>
                ) : null}
                <button
                  type="button"
                  className="graph-maximize-btn"
                  aria-pressed={graphMaximized}
                  onClick={() => setGraphMaximized((current) => !current)}
                >
                  {graphMaximized ? "Restore" : "Maximize"}
                </button>
              </div>
              <div className="graph-canvas-placeholder">
                <div ref={graphContainerRef} className="graph-canvas" />
                {nodeTypeLegend.length ? (
                  <aside
                    aria-label="Node type legend"
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      width: 240,
                      maxHeight: "calc(100% - 20px)",
                      overflow: "auto",
                      background: "rgba(255,255,255,0.92)",
                      border: "1px solid rgba(148,163,184,0.65)",
                      borderRadius: 10,
                      padding: "10px 10px 8px 10px",
                      boxShadow: "0 8px 18px rgba(15,23,42,0.10)"
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 650, marginBottom: 8 }}>rdf:type</div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                      {nodeTypeLegend.map((item) => (
                        <li
                          key={item.typeUri}
                          title={item.typeUri}
                          style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 4,
                              background: item.color,
                              border: "1px solid rgba(15,23,42,0.22)",
                              flex: "0 0 auto"
                            }}
                          />
                          <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.label} <span className="muted">({item.count})</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </aside>
                ) : null}
                {!graphElements.length ? (
                  <div className="graph-empty-state">
                    <p>Run a SPARQL query to render graph results.</p>
                  </div>
                ) : null}
              </div>
              <p className="graph-stats">
                Triples: {graphStats.triples} {" · "} Nodes: {graphStats.nodes} {" · "} Edges:{" "}
                {graphStats.edges}
              </p>
            </div>
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

