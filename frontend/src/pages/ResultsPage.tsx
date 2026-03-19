import { useEffect, useMemo, useState } from "react";
import type { ArtifactFile, ResultsArtifacts, TaskSpec } from "../api";
import { fetchLeaderboardRunsTsv, fetchResultsArtifacts } from "../api";

export type ResultsPageProps = {
  tasks: TaskSpec[];
};

type RunRow = {
  pipeline: string;
  stage: string;
  metrics: Record<string, number>;
};

// ---------------------------------------------------------------------------
// TSV parsing
// ---------------------------------------------------------------------------

function parseTsv(text: string): { rows: RunRow[]; metricNames: string[] } {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], metricNames: [] };
  const headers = lines[0].split("\t");
  const metricHeaders = headers.slice(2); // first two cols: pipeline, stage
  const rows: RunRow[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    const pipeline = parts[0].trim();
    const stage = parts[1].trim();
    const metrics: Record<string, number> = {};
    for (let i = 0; i < metricHeaders.length; i++) {
      const val = parseFloat(parts[i + 2] ?? "");
      if (!isNaN(val)) metrics[metricHeaders[i]] = val;
    }
    rows.push({ pipeline, stage, metrics });
  }
  return { rows, metricNames: metricHeaders };
}

/** Mean of a metric across all stages for a given pipeline. */
function stageMean(rows: RunRow[], pipeline: string, metric: string): number | null {
  const vals = rows
    .filter((r) => r.pipeline === pipeline && metric in r.metrics)
    .map((r) => r.metrics[metric]);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------

/** Horizontal progress bar + value label. Bar colour shifts with delta direction. */
function MetricBar({ value, delta }: { value: number; delta?: number | null }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  let barColor = "#2563eb";
  if (delta !== undefined && delta !== null) {
    barColor = delta > 0.001 ? "#16a34a" : delta < -0.001 ? "#dc2626" : "#2563eb";
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "#e2e8f0",
          borderRadius: 999,
          minWidth: 60
        }}
      >
        <div
          style={{
            width: `${pct.toFixed(1)}%`,
            height: "100%",
            background: barColor,
            borderRadius: 999,
            transition: "width 200ms ease"
          }}
        />
      </div>
      <span style={{ fontSize: 12, minWidth: 38, color: "#334155" }}>
        {value.toFixed(3)}
      </span>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  const isPos = delta > 0.001;
  const isNeg = delta < -0.001;
  const color = isPos ? "#16a34a" : isNeg ? "#dc2626" : "#64748b";
  const prefix = isPos ? "+" : "";
  return (
    <span style={{ fontSize: 12, color, fontWeight: 600 }}>
      {prefix}
      {delta.toFixed(3)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Metrics tables (shared between summary and per-stage views)
// ---------------------------------------------------------------------------

type MetricsTableProps = {
  metricNames: string[];
  pA: string | undefined;
  pB: string | undefined;
  /** Resolver: given pipeline + metric, return value or null */
  getValue: (pipeline: string, metric: string) => number | null;
};

function MetricsTable({ metricNames, pA, pB, getValue }: MetricsTableProps) {
  return (
    <div className="table-frame">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Metric</th>
            {pA && <th>{pA}</th>}
            {pB && <th>{pB}</th>}
            {pA && pB && <th>&#916; (B &#8722; A)</th>}
          </tr>
        </thead>
        <tbody>
          {metricNames.map((metric) => {
            const valA = pA ? getValue(pA, metric) : null;
            const valB = pB ? getValue(pB, metric) : null;
            const delta = valA !== null && valB !== null ? valB - valA : null;
            return (
              <tr key={metric}>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{metric}</td>
                {pA && (
                  <td>
                    {valA !== null ? (
                      <MetricBar value={valA} delta={pB ? delta : undefined} />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                )}
                {pB && (
                  <td>
                    {valB !== null ? (
                      <MetricBar value={valB} delta={pA ? delta : undefined} />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                )}
                {pA && pB && (
                  <td>
                    {delta !== null ? (
                      <DeltaBadge delta={delta} />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Artifacts panel
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Icon glyph chosen by MIME type family. */
function mimeIcon(mimeType: string): string {
  if (mimeType === "text/turtle" || mimeType === "application/n-triples") return "◈";
  if (mimeType === "application/json") return "{ }";
  if (mimeType.startsWith("text/")) return "≡";
  return "□";
}

type ArtifactRowProps = { file: ArtifactFile };

function ArtifactRow({ file }: ArtifactRowProps) {
  return (
    <div className="results-artifact-file">
      <span className="results-artifact-icon" title={file.mime_type}>
        {mimeIcon(file.mime_type)}
      </span>
      <div className="results-artifact-file-info">
        <span className="results-artifact-filename">{file.name}</span>
        <span className="muted" style={{ fontSize: 11 }}>{file.description}</span>
      </div>
      <span className="results-artifact-size">{formatBytes(file.size_bytes)}</span>
      <span className="results-artifact-path" title={file.path}>{file.path}</span>
    </div>
  );
}

type ArtifactsPanelProps = {
  pipelines: string[];
  rows: RunRow[];
  artifacts: ResultsArtifacts | null;
  artifactsError: string;
};

function ArtifactsPanel({ pipelines, rows, artifacts, artifactsError }: ArtifactsPanelProps) {
  if (artifactsError) {
    return <p className="error-banner">{artifactsError}</p>;
  }

  return (
    <div className="results-artifacts-grid">
      {pipelines.map((p) => {
        const pipelineStages = [...new Set(rows.filter((r) => r.pipeline === p).map((r) => r.stage))];
        const pipelineArtifacts = artifacts?.[p];
        return (
          <div key={p} className="results-artifact-card">
            <h4 className="results-artifact-pipeline">{p}</h4>
            {pipelineStages.length === 0 ? (
              <p className="muted">No stage data found.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {pipelineStages.map((stage) => {
                  const files = pipelineArtifacts?.[stage] ?? null;
                  return (
                    <div key={stage} className="results-artifact-stage">
                      <div className="results-artifact-stage-label">{stage}</div>
                      {artifacts === null ? (
                        <p className="muted" style={{ margin: "6px 0 0", fontSize: 11 }}>
                          Loading…
                        </p>
                      ) : files === null || files.length === 0 ? (
                        <p className="muted" style={{ margin: "6px 0 0", fontSize: 11 }}>
                          No artifacts recorded for this stage.
                        </p>
                      ) : (
                        <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                          {files.map((file) => (
                            <ArtifactRow key={file.name} file={file} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function ResultsPage({ tasks: _tasks }: ResultsPageProps) {
  const [tsvText, setTsvText] = useState<string>("");
  const [loadingError, setLoadingError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const [artifacts, setArtifacts] = useState<ResultsArtifacts | null>(null);
  const [artifactsError, setArtifactsError] = useState<string>("");

  // Up to 2 selected pipelines; index 0 = "A", index 1 = "B"
  const [selectedPipelines, setSelectedPipelines] = useState<string[]>([]);

  type MetricsView = "summary" | "perstage";
  const [metricsView, setMetricsView] = useState<MetricsView>("summary");
  const [selectedStage, setSelectedStage] = useState<string>("");

  useEffect(() => {
    fetchLeaderboardRunsTsv()
      .then((tsv) => {
        setTsvText(tsv);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setLoadingError(err instanceof Error ? err.message : "Failed to load results data");
        setLoading(false);
      });

    fetchResultsArtifacts()
      .then(setArtifacts)
      .catch((err: unknown) => {
        setArtifactsError(
          err instanceof Error ? err.message : "Failed to load artifact data"
        );
      });
  }, []);

  const { rows, metricNames } = useMemo(() => parseTsv(tsvText), [tsvText]);

  const allPipelines = useMemo(
    () => [...new Set(rows.map((r) => r.pipeline))].sort(),
    [rows]
  );

  const allStages = useMemo(
    () => [...new Set(rows.map((r) => r.stage))].sort(),
    [rows]
  );

  // Auto-select first stage when stages become available
  useEffect(() => {
    if (allStages.length > 0 && !selectedStage) {
      setSelectedStage(allStages[0]);
    }
  }, [allStages, selectedStage]);

  function togglePipeline(pipeline: string) {
    setSelectedPipelines((prev) => {
      if (prev.includes(pipeline)) return prev.filter((p) => p !== pipeline);
      // Slide the window: replacing the oldest selection when cap is reached
      if (prev.length >= 2) return [prev[1], pipeline];
      return [...prev, pipeline];
    });
  }

  const [pA, pB] = selectedPipelines;

  // Value resolvers for the two table views
  const summaryValue = (pipeline: string, metric: string) =>
    stageMean(rows, pipeline, metric);

  const stageValue = (pipeline: string, metric: string) => {
    const row = rows.find((r) => r.pipeline === pipeline && r.stage === selectedStage);
    return row?.metrics[metric] ?? null;
  };

  return (
    <section className="page-scaffold">
      <header className="page-header">
        <h2>Pipeline Results</h2>
        <p>
          Browse and compare evaluation metrics and data artifacts across pipeline runs.
          Select up to two pipelines to see a side-by-side comparison with deltas.
        </p>
      </header>

      {loadingError && <p className="error-banner">{loadingError}</p>}

      {/* ------------------------------------------------------------------ */}
      {/* Pipeline picker                                                      */}
      {/* ------------------------------------------------------------------ */}
      {!loading && !loadingError && (
        <div className="results-section">
          <div className="results-section-header">
            <h3>Pipelines</h3>
            <span className="muted">
              {selectedPipelines.length === 0
                ? `${allPipelines.length} available — select up to 2`
                : selectedPipelines.length === 1
                ? "1 selected — pick another to compare"
                : "2 selected"}
            </span>
          </div>
          <div className="results-pipeline-list">
            {allPipelines.map((p) => {
              const selIdx = selectedPipelines.indexOf(p);
              const isSelected = selIdx >= 0;
              return (
                <button
                  key={p}
                  type="button"
                  className={`results-pipeline-btn${isSelected ? " selected" : ""}`}
                  onClick={() => togglePipeline(p)}
                  title={isSelected ? `Deselect ${p}` : `Select ${p}`}
                >
                  {isSelected && (
                    <span className="results-pipeline-index">{selIdx + 1}</span>
                  )}
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {selectedPipelines.length === 0 && !loading && !loadingError && (
        <p className="muted" style={{ marginTop: 12 }}>
          Select a pipeline above to view results.
        </p>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Metrics                                                              */}
      {/* ------------------------------------------------------------------ */}
      {selectedPipelines.length > 0 && (
        <div className="results-section">
          <div className="results-section-header">
            <h3>Metrics</h3>
            <div className="preview-mode-toggle">
              <button
                type="button"
                className={metricsView === "summary" ? "active" : ""}
                onClick={() => setMetricsView("summary")}
              >
                Summary
              </button>
              <button
                type="button"
                className={metricsView === "perstage" ? "active" : ""}
                onClick={() => setMetricsView("perstage")}
              >
                Per Stage
              </button>
            </div>
          </div>

          {metricsView === "summary" && (
            <>
              <p className="muted" style={{ marginBottom: 8, fontSize: 12 }}>
                Values are means across all stages.
              </p>
              <MetricsTable
                metricNames={metricNames}
                pA={pA}
                pB={pB}
                getValue={summaryValue}
              />
            </>
          )}

          {metricsView === "perstage" && (
            <>
              {/* Stage tabs */}
              <div className="preview-mode-toggle" style={{ marginBottom: 10 }}>
                {allStages.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={selectedStage === s ? "active" : ""}
                    onClick={() => setSelectedStage(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {selectedStage && (
                <MetricsTable
                  metricNames={metricNames}
                  pA={pA}
                  pB={pB}
                  getValue={stageValue}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Data Artifacts                                                       */}
      {/* ------------------------------------------------------------------ */}
      {selectedPipelines.length > 0 && (
        <div className="results-section">
          <div className="results-section-header">
            <h3>Data Artifacts</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              Output files and run artifacts per stage
            </span>
          </div>
          <ArtifactsPanel
            pipelines={selectedPipelines}
            rows={rows}
            artifacts={artifacts}
            artifactsError={artifactsError}
          />
        </div>
      )}
    </section>
  );
}
