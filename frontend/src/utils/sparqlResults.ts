export type SparqlTerm = {
  type: string;
  value: string;
  datatype?: string;
  "xml:lang"?: string;
};

export type SparqlQueryResult = {
  head?: { vars?: string[] };
  boolean?: boolean;
  results?: { bindings?: Array<Record<string, SparqlTerm>> };
};

export function isSparqlTerm(term: unknown): term is SparqlTerm {
  if (!term || typeof term !== "object") return false;
  const record = term as Record<string, unknown>;
  return typeof record.type === "string" && typeof record.value === "string";
}

export function compactLabel(value: string): string {
  const hashIndex = value.lastIndexOf("#");
  const slashIndex = value.lastIndexOf("/");
  const splitIndex = Math.max(hashIndex, slashIndex);
  const label = splitIndex >= 0 ? value.slice(splitIndex + 1) : value;
  return label || value;
}

export function formatSparqlTerm(term: SparqlTerm): string {
  if (term.type === "uri") {
    return compactLabel(term.value);
  }
  if (term.type === "bnode") {
    return `_:${compactLabel(term.value)}`;
  }
  if (term.datatype) {
    return `"${term.value}"^^${compactLabel(term.datatype)}`;
  }
  if (term["xml:lang"]) {
    return `"${term.value}"@${term["xml:lang"]}`;
  }
  return `"${term.value}"`;
}

export function getSparqlBindings(result: SparqlQueryResult | null | undefined): Array<Record<string, SparqlTerm>> {
  const bindings = result?.results?.bindings;
  return Array.isArray(bindings) ? bindings : [];
}

export function getSparqlVars(result: SparqlQueryResult | null | undefined): string[] {
  const vars = result?.head?.vars;
  if (Array.isArray(vars) && vars.length > 0) {
    return vars.map(String);
  }
  const bindings = getSparqlBindings(result);
  if (bindings.length === 0) {
    return [];
  }
  return Object.keys(bindings[0]);
}

export function hasTripleBindings(bindings: Array<Record<string, SparqlTerm>>): boolean {
  return bindings.some((row) => isSparqlTerm(row.s) && isSparqlTerm(row.p) && isSparqlTerm(row.o));
}

export type GraphElement = {
  data: Record<string, string>;
};

export function buildGraphElementsFromBindings(
  bindings: Array<Record<string, SparqlTerm>>
): GraphElement[] {
  const nodeMap = new Map<string, { id: string; label: string; value: string; termType: string }>();
  const edges: GraphElement[] = [];
  let edgeCount = 0;

  const getNodeId = (term: SparqlTerm): string => {
    const key = `${term.type}|${term.value}`;
    const existing = nodeMap.get(key);
    if (existing) return existing.id;
    const id = `n${nodeMap.size}`;
    nodeMap.set(key, {
      id,
      label: term.type === "literal" ? formatSparqlTerm(term) : compactLabel(term.value),
      value: term.value,
      termType: term.type
    });
    return id;
  };

  for (const row of bindings) {
    if (!isSparqlTerm(row.s) || !isSparqlTerm(row.p) || !isSparqlTerm(row.o)) {
      continue;
    }
    const sourceId = getNodeId(row.s);
    const targetId = getNodeId(row.o);
    edges.push({
      data: {
        id: `e${edgeCount++}`,
        source: sourceId,
        target: targetId,
        label: compactLabel(row.p.value)
      }
    });
  }

  const nodes: GraphElement[] = [...nodeMap.values()].map((node) => ({
    data: {
      id: node.id,
      label: node.label,
      value: node.value,
      termType: node.termType
    }
  }));

  return [...nodes, ...edges];
}
