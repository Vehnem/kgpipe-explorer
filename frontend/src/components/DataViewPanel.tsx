import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import type {
  ArtifactFile,
  DataViewPipelineResult,
  ResultsArtifacts,
  SavedSparqlExample
} from "../api";
import {
  fetchBuiltinSparqlExamples,
  fetchSavedSparqlExamples,
  queryPipelineKgs,
  saveSparqlExample
} from "../api";
import { PipelineName } from "./PipelineName";
import { emitTutorialEvent, TUTORIAL_EVENTS } from "../tutorial/tutorialEvents";
import {
  buildGraphElementsFromBindings,
  formatSparqlTerm,
  getSparqlBindings,
  getSparqlVars,
  hasTripleBindings,
  isSparqlTerm,
  type SparqlQueryResult,
  type SparqlTerm
} from "../utils/sparqlResults";

const DEFAULT_DATA_VIEW_QUERY = `CONSTRUCT { ?s ?p ?o }
WHERE { ?s ?p ?o }
LIMIT 50`;

type DataViewResultMode = "table" | "graph";

type RunRow = {
  pipeline: string;
  stage: string;
};

type FinalKgTarget = {
  pipeline: string;
  stage: string | null;
  file: ArtifactFile | null;
};

function resolveFinalKgTarget(
  pipeline: string,
  rows: RunRow[],
  artifacts: ResultsArtifacts | null
): FinalKgTarget {
  const stages = [...new Set(rows.filter((r) => r.pipeline === pipeline).map((r) => r.stage))];
  const pipelineArtifacts = artifacts?.[pipeline];
  const lastStage = stages.length > 0 ? stages[stages.length - 1] : null;

  if (lastStage && pipelineArtifacts) {
    const files = pipelineArtifacts[lastStage]?.files ?? [];
    const resultNt = files.find((f) => f.name === "result.nt");
    if (resultNt) {
      return { pipeline, stage: lastStage, file: resultNt };
    }
  }

  if (pipelineArtifacts) {
    for (const stage of [...stages].reverse()) {
      const files = pipelineArtifacts[stage]?.files ?? [];
      const rdfFile =
        files.find(
          (f) =>
            f.category === "kg" ||
            f.mime_type === "text/turtle" ||
            f.mime_type === "application/n-triples" ||
            /\.(ttl|nt|rdf)$/i.test(f.name)
        ) ?? null;
      if (rdfFile) {
        return { pipeline, stage, file: rdfFile };
      }
    }
  }

  return { pipeline, stage: lastStage, file: null };
}

function DataViewResultTable({ result }: { result: SparqlQueryResult | null }) {
  const bindings = getSparqlBindings(result);
  if (bindings.length === 0) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Query returned no rows.
      </p>
    );
  }

  if (hasTripleBindings(bindings)) {
    return (
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Predicate</th>
            <th>Object</th>
          </tr>
        </thead>
        <tbody>
          {bindings.map((row, index) => (
            <tr key={index}>
              <td>{isSparqlTerm(row.s) ? formatSparqlTerm(row.s) : "—"}</td>
              <td>{isSparqlTerm(row.p) ? formatSparqlTerm(row.p) : "—"}</td>
              <td>{isSparqlTerm(row.o) ? formatSparqlTerm(row.o) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const columns = getSparqlVars(result);
  return (
    <table className="leaderboard-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {bindings.map((row, index) => (
          <tr key={index}>
            {columns.map((column) => {
              const term = row[column];
              return (
                <td key={column}>{isSparqlTerm(term) ? formatSparqlTerm(term) : "—"}</td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DataViewGraph({ bindings }: { bindings: Array<Record<string, SparqlTerm>> }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const elements = buildGraphElementsFromBindings(bindings);
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "font-size": "9px",
            "text-wrap": "wrap",
            "text-max-width": "100px",
            "background-color": "#60a5fa",
            color: "#0f172a"
          }
        },
        {
          selector: "edge",
          style: {
            width: 1.4,
            "line-color": "#64748b",
            "target-arrow-color": "#64748b",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": "8px",
            "text-rotation": "autorotate"
          }
        }
      ],
      layout: { name: "cose", animate: false, fit: true, padding: 24 }
    });
    return () => {
      cy.destroy();
    };
  }, [bindings]);

  if (bindings.length === 0) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        No graph triples to render.
      </p>
    );
  }

  return <div ref={containerRef} style={{ minHeight: 280, width: "100%" }} />;
}

export type DataViewPanelProps = {
  pipelines: string[];
  rows: RunRow[];
  artifacts: ResultsArtifacts | null;
  runId: string;
};

export function DataViewPanel({ pipelines, rows, artifacts, runId }: DataViewPanelProps) {
  const [queryText, setQueryText] = useState(DEFAULT_DATA_VIEW_QUERY);
  const [builtinExamples, setBuiltinExamples] = useState<SavedSparqlExample[]>([]);
  const [savedExamples, setSavedExamples] = useState<SavedSparqlExample[]>([]);
  const [savedExamplesStatus, setSavedExamplesStatus] = useState("");
  const [resultMode, setResultMode] = useState<DataViewResultMode>("table");
  const [queryStatus, setQueryStatus] = useState("");
  const [queryRunning, setQueryRunning] = useState(false);
  const [queryResults, setQueryResults] = useState<DataViewPipelineResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadExamples() {
      try {
        const builtins = await fetchBuiltinSparqlExamples("dataview");
        if (!cancelled) setBuiltinExamples(builtins);
      } catch {
        if (!cancelled) setBuiltinExamples([]);
      }
    }
    void loadExamples();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSavedExamples() {
      setSavedExamplesStatus("");
      try {
        const examples = await fetchSavedSparqlExamples("dataview");
        if (!cancelled) setSavedExamples(examples);
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

  const targets = useMemo(
    () => pipelines.map((p) => resolveFinalKgTarget(p, rows, artifacts)),
    [pipelines, rows, artifacts]
  );

  const resultsByPipeline = useMemo(() => {
    const map = new Map<string, DataViewPipelineResult>();
    for (const item of queryResults) {
      map.set(item.pipeline, item);
    }
    return map;
  }, [queryResults]);

  async function handleRunQuery() {
    const trimmed = queryText.trim();
    if (!trimmed) {
      setQueryStatus("Cannot run an empty query.");
      return;
    }
    if (pipelines.length === 0) {
      setQueryStatus("Select 1 or 2 pipelines to query their final KGs.");
      return;
    }

    setQueryRunning(true);
    setQueryStatus("");
    try {
      const results = await queryPipelineKgs(trimmed, pipelines, runId);
      setQueryResults(results);
      const totalRows = results.reduce(
        (sum, item) => sum + getSparqlBindings(item.result).length,
        0
      );
      const errors = results.filter((item) => item.error).length;
      if (errors > 0) {
        setQueryStatus(
          `Completed with ${errors} error${errors === 1 ? "" : "s"}. ${totalRows} row${
            totalRows === 1 ? "" : "s"
          } returned across ${results.length} pipeline${results.length === 1 ? "" : "s"}.`
        );
      } else {
        setQueryStatus(
          `Query completed. ${totalRows} row${totalRows === 1 ? "" : "s"} returned across ${
            results.length
          } pipeline${results.length === 1 ? "" : "s"}.`
        );
      }
      emitTutorialEvent(TUTORIAL_EVENTS.queryRan);
    } catch (error) {
      setQueryResults([]);
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
      await saveSparqlExample({ label, query: trimmedQuery }, "dataview");
      const refreshed = await fetchSavedSparqlExamples("dataview");
      setSavedExamples(refreshed);
      setSavedExamplesStatus("");
      setQueryStatus(`Saved example "${label}".`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error while saving example.";
      setQueryStatus(message);
    }
  }

  return (
    <div className="results-dataview" data-tutorial="results-dataview">
      <section className="results-dataview-query">
        <div className="results-section-header" style={{ marginBottom: 8 }}>
          <h4 style={{ margin: 0, fontSize: 13 }}>SPARQL Query</h4>
          <span className="muted" style={{ fontSize: 12 }}>
            Same query runs against each selected pipeline&apos;s final result.nt
          </span>
        </div>
        <label
          htmlFor="results-dataview-example"
          className="muted"
          style={{ fontSize: 12, display: "block" }}
        >
          Example queries
        </label>
        <select
          id="results-dataview-example"
          className="results-dataview-select"
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
        {savedExamplesStatus ? (
          <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>
            Saved examples: {savedExamplesStatus}
          </p>
        ) : null}
        <label htmlFor="results-dataview-query" className="muted" style={{ fontSize: 12 }}>
          Query text
        </label>
        <textarea
          id="results-dataview-query"
          className="results-dataview-textarea"
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          rows={8}
          spellCheck={false}
        />
        <div className="results-dataview-targets">
          {targets.map((t, idx) => (
            <div key={t.pipeline} className="results-dataview-target">
              <span className="results-pipeline-index">{idx + 1}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12 }}>
                  <PipelineName id={t.pipeline} />
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {t.file
                    ? `${t.stage} · ${t.file.name}`
                    : t.stage
                    ? `${t.stage} · final KG not listed yet`
                    : "No stage data for final KG"}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            data-tutorial="results-run-query"
            onClick={() => void handleRunQuery()}
            disabled={queryRunning}
          >
            {queryRunning ? "Running…" : "Run Query"}
          </button>
          <button type="button" onClick={() => void handleSaveExample()} disabled={queryRunning}>
            Save as example…
          </button>
          <div className="preview-mode-toggle" role="tablist" aria-label="Result view mode">
            <button
              type="button"
              role="tab"
              aria-selected={resultMode === "table"}
              className={resultMode === "table" ? "active" : ""}
              onClick={() => setResultMode("table")}
            >
              Result table
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={resultMode === "graph"}
              className={resultMode === "graph" ? "active" : ""}
              onClick={() => setResultMode("graph")}
            >
              Graph
            </button>
          </div>
        </div>
        {queryStatus ? <p style={{ margin: "8px 0 0", fontSize: 13 }}>{queryStatus}</p> : null}
      </section>

      <div className="results-dataview-results">
        {targets.map((t) => {
          const pipelineResult = resultsByPipeline.get(t.pipeline);
          const bindings = getSparqlBindings(pipelineResult?.result);
          const tripleBindings = hasTripleBindings(bindings) ? bindings : [];

          return (
            <div key={t.pipeline} className="results-dataview-result-card">
              <h4 className="results-artifact-pipeline">
                <PipelineName id={t.pipeline} />
              </h4>
              {pipelineResult?.kg_path ? (
                <p className="muted" style={{ margin: "0 0 8px", fontSize: 11 }}>
                  {pipelineResult.kg_path}
                </p>
              ) : null}
              {pipelineResult?.error ? (
                <p className="error-banner" style={{ fontSize: 12 }}>
                  {pipelineResult.error}
                </p>
              ) : null}
              {resultMode === "table" ? (
                <div className="table-frame results-dataview-table-placeholder">
                  {pipelineResult ? (
                    <DataViewResultTable result={pipelineResult.result} />
                  ) : (
                    <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                      Run a SPARQL query to populate the result table.
                    </p>
                  )}
                </div>
              ) : (
                <div className="graph-canvas-placeholder" style={{ minHeight: 280 }}>
                  {pipelineResult ? (
                    tripleBindings.length > 0 ? (
                      <DataViewGraph bindings={tripleBindings} />
                    ) : (
                      <div className="graph-empty-state">
                        <p>
                          {bindings.length > 0
                            ? "Graph view needs s/p/o triple bindings. Try a CONSTRUCT query."
                            : "Run a SPARQL CONSTRUCT query to render graph results."}
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="graph-empty-state">
                      <p>Run a SPARQL CONSTRUCT query to render graph results.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
