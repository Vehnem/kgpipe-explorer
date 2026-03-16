import { useEffect, useMemo, useState } from "react";
import type { TaskSpec } from "../api";
import { fetchLeaderboardRunsTsv } from "../api";

type PipelineLeaderboardPageProps = {
  tasks: TaskSpec[];
};

type SubgroupId = string;
type MetricGroupId = SubgroupId | "none";
type AggregationMethod = "mean" | "harmonic_mean" | "min" | "max";
type FinalAggregationMethod =
  | "weighted_mean"
  | "mean"
  | "harmonic_mean"
  | "min"
  | "max";

type GroupConfig = {
  id: SubgroupId;
  label: string;
  aggregator: AggregationMethod;
  weight: number;
};

type MetricSetting = {
  enabled: boolean;
  groupId: MetricGroupId;
  stageAggregator: AggregationMethod;
  stageSelection: string;
};

type PreviewMode =
  | "table"
  | "distribution"
  | "distribution_figure"
  | "distribution_bars"
  | "distribution_heatmap";

type PipelineGroupScore = {
  pipeline: string;
  groupScores: Record<SubgroupId, number | null>;
};

type PipelineRank = {
  pipeline: string;
  finalScore: number;
  groupScores: Record<SubgroupId, number | null>;
};

type RankDistributionRow = {
  pipeline: string;
  minRank: number;
  p10Rank: number;
  medianRank: number;
  p90Rank: number;
  maxRank: number;
  meanRank: number;
  samples: number;
  rankCounts: number[];
};

type RankDistributionPreview = {
  step: number;
  permutations: number;
  maxRank: number;
  maxCount: number;
  rows: RankDistributionRow[];
};

const DEFAULT_GROUPS: GroupConfig[] = [
  { id: "core", label: "Core", aggregator: "mean", weight: 1 },
  { id: "coverage", label: "Coverage", aggregator: "mean", weight: 1 },
  { id: "output", label: "Output", aggregator: "mean", weight: 1 }
];

export function PipelineLeaderboardPage({ tasks }: PipelineLeaderboardPageProps) {
  const [tsvText, setTsvText] = useState<string>("");
  const [loadingError, setLoadingError] = useState<string>("");
  const [stageAggregatorAll, setStageAggregatorAll] = useState<AggregationMethod>("mean");
  const [finalAggregator, setFinalAggregator] =
    useState<FinalAggregationMethod>("weighted_mean");
  const [groupConfigs, setGroupConfigs] = useState<GroupConfig[]>(DEFAULT_GROUPS);
  const [metricSettings, setMetricSettings] = useState<Record<string, MetricSetting>>({});
  const [selectedPipelines, setSelectedPipelines] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("table");

  useEffect(() => {
    fetchLeaderboardRunsTsv()
      .then((text) => {
        setTsvText(text);
        setLoadingError("");
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Failed to load runs.tsv";
        setLoadingError(message);
      });
  }, []);

  const table = useMemo(() => parseTsv(tsvText), [tsvText]);
  const columns = table.headers;
  const rows = table.rows;
  const metricColumns = table.metricColumns;

  useEffect(() => {
    if (metricColumns.length === 0) {
      return;
    }
    setMetricSettings((current) => {
      const next: Record<string, MetricSetting> = {};
      for (const metric of metricColumns) {
        next[metric] = current[metric] ?? {
          enabled: true,
          groupId: defaultGroupForMetric(metric),
          stageAggregator: "mean",
          stageSelection: "all"
        };
      }
      return next;
    });
  }, [metricColumns]);

  const availablePipelines = useMemo(
    () => Array.from(new Set(rows.map((row) => row.pipeline))).sort(),
    [rows]
  );
  const availableStages = useMemo(
    () => Array.from(new Set(rows.map((row) => row.stage))).sort(),
    [rows]
  );

  useEffect(() => {
    const validGroupIds = new Set(groupConfigs.map((group) => group.id));
    const validStageIds = new Set(availableStages);
    setMetricSettings((current) => {
      let changed = false;
      const next: Record<string, MetricSetting> = {};
      for (const [metric, setting] of Object.entries(current)) {
        let updated = setting;
        if (updated.groupId !== "none" && !validGroupIds.has(updated.groupId)) {
          updated = { ...updated, groupId: "none" };
          changed = true;
        }
        if (updated.stageSelection !== "all" && !validStageIds.has(updated.stageSelection)) {
          updated = { ...updated, stageSelection: "all" };
          changed = true;
        }
        next[metric] = updated;
      }
      return changed ? next : current;
    });
  }, [groupConfigs, availableStages]);

  useEffect(() => {
    setSelectedPipelines((current) => {
      if (availablePipelines.length === 0) {
        return [];
      }
      if (current.length === 0) {
        return availablePipelines;
      }
      const valid = current.filter((pipeline) => availablePipelines.includes(pipeline));
      const missing = availablePipelines.filter((pipeline) => !valid.includes(pipeline));
      return [...valid, ...missing];
    });
  }, [availablePipelines]);

  const selectedPipelineSet = useMemo(
    () => new Set(selectedPipelines),
    [selectedPipelines]
  );
  const filteredRows = useMemo(
    () => rows.filter((row) => selectedPipelineSet.has(row.pipeline)),
    [rows, selectedPipelineSet]
  );

  const pipelineGroupScores = useMemo(
    () =>
      computePipelineGroupScores(
        filteredRows,
        metricColumns,
        metricSettings,
        groupConfigs
      ),
    [filteredRows, metricColumns, metricSettings, groupConfigs]
  );
  const rankedPipelines = useMemo(
    () => rankPipelines(pipelineGroupScores, groupConfigs, finalAggregator),
    [pipelineGroupScores, groupConfigs, finalAggregator]
  );
  const rankDistribution = useMemo(
    () => computeRankDistributionPreview(pipelineGroupScores, groupConfigs, 0.1),
    [pipelineGroupScores, groupConfigs]
  );

  const pipelineCount = useMemo(
    () => new Set(rows.map((row) => row.pipeline)).size,
    [rows]
  );
  const enabledMetricCount = useMemo(
    () =>
      metricColumns.filter((metric) => {
        const setting = metricSettings[metric];
        return setting?.enabled && setting.groupId !== "none";
      }).length,
    [metricColumns, metricSettings]
  );

  return (
    <section className="page-scaffold">
      <header className="page-header">
        <h2>Pipeline Leaderboard</h2>
        <p>
          Compose a two-level ranking schema: metrics into subgroups, then subgroup
          scores into a final rank.
        </p>
      </header>

      <div className="leaderboard-summary">
        <div className="stat-card">
          <div className="stat-value">
            {selectedPipelines.length}/{pipelineCount}
          </div>
          <div className="stat-label">Selected pipelines</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{rankedPipelines.length}</div>
          <div className="stat-label">Ranked pipelines</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{enabledMetricCount}</div>
          <div className="stat-label">Active metrics</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{filteredRows.length}</div>
          <div className="stat-label">Selected runs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{tasks.length}</div>
          <div className="stat-label">Registered tasks</div>
        </div>
      </div>

      <section className="leaderboard-editor">
        <div className="leaderboard-editor-left">
          <h3>Ranking Schema Editor</h3>

          <div className="editor-global-controls">
            <label>
              Apply stage aggregation to all metrics
              <select
                value={stageAggregatorAll}
                onChange={(event) => {
                  const nextAggregator = event.target.value as AggregationMethod;
                  setStageAggregatorAll(nextAggregator);
                  setMetricSettings((current) => {
                    const next: Record<string, MetricSetting> = {};
                    for (const metric of Object.keys(current)) {
                      next[metric] = { ...current[metric], stageAggregator: nextAggregator };
                    }
                    return next;
                  });
                }}
              >
                <option value="mean">mean</option>
                <option value="harmonic_mean">harmonic_mean</option>
                <option value="min">min</option>
                <option value="max">max</option>
              </select>
            </label>

            <label>
              Final aggregation (subgroups)
              <select
                value={finalAggregator}
                onChange={(event) =>
                  setFinalAggregator(event.target.value as FinalAggregationMethod)
                }
              >
                <option value="weighted_mean">weighted_mean</option>
                <option value="mean">mean</option>
                <option value="harmonic_mean">harmonic_mean</option>
                <option value="min">min</option>
                <option value="max">max</option>
              </select>
            </label>
          </div>

          <div className="pipeline-filter">
            <div className="pipeline-filter-header">
              <h4>Pipeline Selection</h4>
              <div className="pipeline-filter-actions">
                <button
                  type="button"
                  className="inline-add-btn"
                  onClick={() => setSelectedPipelines(availablePipelines)}
                >
                  All
                </button>
                <button
                  type="button"
                  className="inline-add-btn"
                  onClick={() => setSelectedPipelines([])}
                >
                  None
                </button>
              </div>
            </div>
            <div className="pipeline-filter-list">
              {availablePipelines.map((pipeline) => {
                const checked = selectedPipelineSet.has(pipeline);
                return (
                  <label key={pipeline} className="pipeline-filter-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setSelectedPipelines((current) => {
                          if (event.target.checked) {
                            return current.includes(pipeline) ? current : [...current, pipeline];
                          }
                          return current.filter((item) => item !== pipeline);
                        })
                      }
                    />
                    <span>{pipeline}</span>
                  </label>
                );
              })}
              {availablePipelines.length === 0 && (
                <p className="muted">No pipelines found.</p>
              )}
            </div>
          </div>

          <div className="group-config-grid">
            {groupConfigs.map((group) => {
              return (
                <section key={group.id} className="group-card">
                  <div className="group-card-header">
                    <h4>{group.label}</h4>
                    <button
                      type="button"
                      className="group-remove-btn"
                      disabled={groupConfigs.length <= 1}
                      onClick={() =>
                        setGroupConfigs((current) =>
                          current.filter((item) => item.id !== group.id)
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <label>
                    Name
                    <input
                      type="text"
                      value={group.label}
                      onChange={(event) =>
                        setGroupConfigs((current) =>
                          current.map((item) =>
                            item.id === group.id
                              ? { ...item, label: event.target.value || "Unnamed" }
                              : item
                          )
                        )
                      }
                    />
                  </label>
                  <label>
                    Aggregator
                    <select
                      value={group.aggregator}
                      onChange={(event) =>
                        setGroupConfigs((current) =>
                          current.map((item) =>
                            item.id === group.id
                              ? {
                                  ...item,
                                  aggregator: event.target.value as AggregationMethod
                                }
                              : item
                          )
                        )
                      }
                    >
                      <option value="mean">mean</option>
                      <option value="harmonic_mean">harmonic_mean</option>
                      <option value="min">min</option>
                      <option value="max">max</option>
                    </select>
                  </label>
                  <label>
                    Weight
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={group.weight}
                      onChange={(event) => {
                        const weight = Number(event.target.value);
                        setGroupConfigs((current) =>
                          current.map((item) =>
                            item.id === group.id
                              ? { ...item, weight: Number.isFinite(weight) ? weight : 0 }
                              : item
                          )
                        );
                      }}
                    />
                  </label>
                </section>
              );
            })}
          </div>
          <div className="group-actions-row">
            <button
              type="button"
              className="inline-add-btn"
              onClick={() =>
                setGroupConfigs((current) => {
                  const id = createSubgroupId(current);
                  const label = `Group ${current.length + 1}`;
                  return [
                    ...current,
                    { id, label, aggregator: "mean", weight: 1 }
                  ];
                })
              }
            >
              + Add subgroup
            </button>
          </div>

          <div className="metric-settings">
            <h4>Metric Selection</h4>
            <div className="metric-settings-table-wrap">
              <table className="metric-settings-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Use</th>
                    <th>Stage agg</th>
                    <th>Stage</th>
                    <th>Subgroup</th>
                  </tr>
                </thead>
                <tbody>
                  {metricColumns.map((metric) => {
                    const setting = metricSettings[metric] ?? {
                      enabled: true,
                      groupId: defaultGroupForMetric(metric),
                      stageAggregator: "mean",
                      stageSelection: "all"
                    };
                    return (
                      <tr key={metric}>
                        <td>{metric}</td>
                        <td>
                          <input
                            type="checkbox"
                            checked={setting.enabled}
                            onChange={(event) =>
                              setMetricSettings((current) => ({
                                ...current,
                                [metric]: {
                                  ...setting,
                                  enabled: event.target.checked
                                }
                              }))
                            }
                          />
                        </td>
                        <td>
                          <select
                            value={setting.stageAggregator}
                            onChange={(event) =>
                              setMetricSettings((current) => ({
                                ...current,
                                [metric]: {
                                  ...setting,
                                  stageAggregator: event.target.value as AggregationMethod
                                }
                              }))
                            }
                          >
                            <option value="mean">mean</option>
                            <option value="harmonic_mean">harmonic_mean</option>
                            <option value="min">min</option>
                            <option value="max">max</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={setting.stageSelection}
                            onChange={(event) =>
                              setMetricSettings((current) => ({
                                ...current,
                                [metric]: {
                                  ...setting,
                                  stageSelection: event.target.value
                                }
                              }))
                            }
                          >
                            <option value="all">all</option>
                            {availableStages.map((stage) => (
                              <option key={stage} value={stage}>
                                {stage}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={setting.groupId}
                            onChange={(event) =>
                              setMetricSettings((current) => ({
                                ...current,
                                [metric]: {
                                  ...setting,
                                  groupId: event.target.value as MetricGroupId
                                }
                              }))
                            }
                          >
                            <option value="none">None</option>
                            {groupConfigs.map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                  {metricColumns.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty-cell">
                        No numeric metrics detected in TSV.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="leaderboard-editor-right">
          <div className="preview-header">
            <h3>Rank Preview</h3>
            <div className="preview-mode-toggle" role="tablist" aria-label="Rank preview mode">
              <button
                type="button"
                className={previewMode === "table" ? "active" : ""}
                onClick={() => setPreviewMode("table")}
              >
                Table
              </button>
              <button
                type="button"
                className={previewMode === "distribution" ? "active" : ""}
                onClick={() => setPreviewMode("distribution")}
              >
                Distribution
              </button>
              <button
                type="button"
                className={previewMode === "distribution_figure" ? "active" : ""}
                onClick={() => setPreviewMode("distribution_figure")}
              >
                Figure
              </button>
              <button
                type="button"
                className={previewMode === "distribution_bars" ? "active" : ""}
                onClick={() => setPreviewMode("distribution_bars")}
              >
                Bars
              </button>
              <button
                type="button"
                className={previewMode === "distribution_heatmap" ? "active" : ""}
                onClick={() => setPreviewMode("distribution_heatmap")}
              >
                Heatmap
              </button>
            </div>
          </div>
          <p className="muted">
            {previewMode === "table" &&
              "Live ranking after level-1 subgroup and level-2 final aggregation."}
            {previewMode === "distribution" &&
              `Rank distribution over ${rankDistribution.permutations} weight permutations (step ${rankDistribution.step.toFixed(1)}).`}
            {previewMode === "distribution_figure" &&
              `Rank-frequency figure over ${rankDistribution.permutations} weight permutations (step ${rankDistribution.step.toFixed(1)}).`}
            {previewMode === "distribution_bars" &&
              `Grouped bar chart over ${rankDistribution.permutations} weight permutations (step ${rankDistribution.step.toFixed(1)}).`}
            {previewMode === "distribution_heatmap" &&
              `Heatmap of rank frequencies over ${rankDistribution.permutations} weight permutations (step ${rankDistribution.step.toFixed(1)}).`}
          </p>
          {previewMode === "table" ? (
            <div className="table-frame">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Pipeline</th>
                    <th>Score</th>
                    {groupConfigs.map((group) => (
                      <th key={group.id}>{group.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankedPipelines.map((item, idx) => (
                    <tr key={item.pipeline}>
                      <td>{idx + 1}</td>
                      <td>{item.pipeline}</td>
                      <td>{formatScore(item.finalScore)}</td>
                      {groupConfigs.map((group) => (
                        <td key={`${item.pipeline}-${group.id}`}>
                          {formatOptionalScore(item.groupScores[group.id] ?? null)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rankedPipelines.length === 0 && (
                    <tr>
                      <td colSpan={3 + groupConfigs.length} className="empty-cell">
                        No ranking available for the current schema.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : previewMode === "distribution" ? (
            <div className="table-frame">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Pipeline</th>
                    <th>Rank Distribution</th>
                    <th>Mean Rank</th>
                    <th>Range</th>
                  </tr>
                </thead>
                <tbody>
                  {rankDistribution.rows.map((row) => (
                    <tr key={row.pipeline}>
                      <td>{row.pipeline}</td>
                      <td>
                        <div className="rank-dist-track">
                          <div
                            className="rank-dist-range"
                            style={{
                              left: `${rankToPercent(row.minRank, rankDistribution.maxRank)}%`,
                              width: `${Math.max(
                                1.2,
                                rankToPercent(row.maxRank, rankDistribution.maxRank) -
                                  rankToPercent(row.minRank, rankDistribution.maxRank)
                              )}%`
                            }}
                          />
                          <div
                            className="rank-dist-inner"
                            style={{
                              left: `${rankToPercent(row.p10Rank, rankDistribution.maxRank)}%`,
                              width: `${Math.max(
                                1.2,
                                rankToPercent(row.p90Rank, rankDistribution.maxRank) -
                                  rankToPercent(row.p10Rank, rankDistribution.maxRank)
                              )}%`
                            }}
                          />
                          <div
                            className="rank-dist-median"
                            style={{
                              left: `${rankToPercent(row.medianRank, rankDistribution.maxRank)}%`
                            }}
                          />
                        </div>
                      </td>
                      <td>{row.meanRank.toFixed(2)}</td>
                      <td>
                        {row.minRank} - {row.maxRank}
                      </td>
                    </tr>
                  ))}
                  {rankDistribution.rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="empty-cell">
                        No permutation-based ranking available for current settings.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : previewMode === "distribution_figure" ? (
            <div className="rank-figure-wrap">
              {rankDistribution.rows.length > 0 && rankDistribution.maxRank > 0 ? (
                <RankDistributionFigure preview={rankDistribution} />
              ) : (
                <p className="empty-cell">
                  No permutation-based ranking available for current settings.
                </p>
              )}
            </div>
          ) : previewMode === "distribution_bars" ? (
            <div className="rank-figure-wrap">
              {rankDistribution.rows.length > 0 && rankDistribution.maxRank > 0 ? (
                <RankDistributionBars preview={rankDistribution} />
              ) : (
                <p className="empty-cell">
                  No permutation-based ranking available for current settings.
                </p>
              )}
            </div>
          ) : (
            <div className="rank-figure-wrap">
              {rankDistribution.rows.length > 0 && rankDistribution.maxRank > 0 ? (
                <RankDistributionHeatmap preview={rankDistribution} />
              ) : (
                <p className="empty-cell">
                  No permutation-based ranking available for current settings.
                </p>
              )}
            </div>
          )}
        </aside>
      </section>

      <div className="table-frame">
        <table className="leaderboard-table">
          <thead>
            <tr>
              {columns.map((columnName) => (
                <th key={columnName}>{columnName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.key}>
                {row.values.map((value, idx) => (
                  <td key={`${row.key}-${columns[idx]}`}>{value}</td>
                ))}
              </tr>
            ))}
            {loadingError && (
              <tr>
                <td colSpan={Math.max(1, columns.length)} className="empty-cell">
                  Unable to load runs data: {loadingError}
                </td>
              </tr>
            )}
            {!loadingError && filteredRows.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, columns.length)} className="empty-cell">
                  No run entries available for selected pipelines.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type LeaderboardTable = {
  headers: string[];
  metricColumns: string[];
  rows: Array<{
    key: string;
    pipeline: string;
    stage: string;
    valueByColumn: Record<string, string>;
    numericByColumn: Record<string, number | null>;
    values: string[];
  }>;
};

function parseTsv(tsv: string): LeaderboardTable {
  const lines = tsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { headers: [], metricColumns: [], rows: [] };
  }

  const headers = lines[0].split("\t");
  const rows = lines.slice(1).map((line, idx) => {
    const rawValues = line.split("\t");
    const values = headers.map((_, colIdx) => rawValues[colIdx] ?? "");
    const valueByColumn = headers.reduce<Record<string, string>>((acc, header, colIdx) => {
      acc[header] = values[colIdx];
      return acc;
    }, {});
    const numericByColumn = headers.reduce<Record<string, number | null>>(
      (acc, header, colIdx) => {
        const parsed = Number(values[colIdx]);
        acc[header] = Number.isFinite(parsed) ? parsed : null;
        return acc;
      },
      {}
    );
    return {
      key: `${values[0] ?? "pipeline"}-${values[1] ?? "stage"}-${idx}`,
      pipeline: values[0] ?? "",
      stage: values[1] ?? "",
      valueByColumn,
      numericByColumn,
      values
    };
  });

  const metricColumns = headers.filter((header) =>
    rows.some((row) => row.numericByColumn[header] !== null)
  );
  const filteredMetricColumns = metricColumns.filter(
    (column) => column !== "pipeline" && column !== "stage"
  );

  return { headers, metricColumns: filteredMetricColumns, rows };
}

function defaultGroupForMetric(metric: string): MetricGroupId {
  if (metric === "ACC_T" || metric === "1-DR") {
    return "core";
  }
  if (metric.startsWith("COV_")) {
    return "coverage";
  }
  if (metric.startsWith("O_")) {
    return "output";
  }
  return "none";
}

function computePipelineGroupScores(
  rows: LeaderboardTable["rows"],
  metricColumns: string[],
  metricSettings: Record<string, MetricSetting>,
  groupConfigs: GroupConfig[]
): PipelineGroupScore[] {
  const rowsByPipeline: Record<string, LeaderboardTable["rows"]> = {};
  for (const row of rows) {
    const pipelineRows = rowsByPipeline[row.pipeline] ?? [];
    pipelineRows.push(row);
    rowsByPipeline[row.pipeline] = pipelineRows;
  }

  return Object.entries(rowsByPipeline).map(([pipeline, pipelineRows]) => {
    const stageScoresByMetric: Record<string, number | null> = {};
    for (const metric of metricColumns) {
      const setting = metricSettings[metric];
      const stageSelection = setting?.stageSelection ?? "all";
      const values = pipelineRows
        .filter((row) => stageSelection === "all" || row.stage === stageSelection)
        .map((row) => row.numericByColumn[metric])
        .filter((value): value is number => value !== null);
      stageScoresByMetric[metric] = aggregate(values, setting?.stageAggregator ?? "mean");
    }

    const groupScores: Record<SubgroupId, number | null> = {};
    for (const group of groupConfigs) {
      const selectedValues = metricColumns
        .filter((metric) => {
          const setting = metricSettings[metric];
          return setting?.enabled && setting.groupId === group.id;
        })
        .map((metric) => stageScoresByMetric[metric])
        .filter((value): value is number => value !== null);
      groupScores[group.id] = aggregate(selectedValues, group.aggregator);
    }

    return { pipeline, groupScores };
  });
}

function rankPipelines(
  pipelineGroupScores: PipelineGroupScore[],
  groupConfigs: GroupConfig[],
  finalAggregator: FinalAggregationMethod
): PipelineRank[] {
  const ranked = pipelineGroupScores
    .map((metrics) => {
      const groupScoresWithWeights = groupConfigs.map((group) => ({
        score: metrics.groupScores[group.id] ?? null,
        weight: group.weight
      })).filter((item) => item.score !== null) as Array<{ score: number; weight: number }>;
      const finalScore = aggregateFinal(groupScoresWithWeights, finalAggregator);
      return {
        pipeline: metrics.pipeline,
        finalScore,
        groupScores: metrics.groupScores
      };
    })
    .filter((item) => Number.isFinite(item.finalScore))
    .sort((left, right) => right.finalScore - left.finalScore);

  return ranked;
}

function computeRankDistributionPreview(
  pipelineGroupScores: PipelineGroupScore[],
  groupConfigs: GroupConfig[],
  step: number
): RankDistributionPreview {
  const groupIds = groupConfigs.map((group) => group.id);
  const permutations = enumerateWeightPermutations(groupIds, step);
  const ranksByPipeline: Record<string, number[]> = {};
  let maxRank = 0;

  for (const weights of permutations) {
    const ranked = pipelineGroupScores
      .map((item) => {
        const weightedValues = groupIds.map((groupId) => ({
          score: item.groupScores[groupId] ?? null,
          weight: weights[groupId] ?? 0
        })).filter((entry) => entry.score !== null) as Array<{
          score: number;
          weight: number;
        }>;
        const score = aggregateFinal(weightedValues, "weighted_mean");
        return { pipeline: item.pipeline, score };
      })
      .filter((item) => Number.isFinite(item.score))
      .sort((left, right) => right.score - left.score);

    ranked.forEach((item, index) => {
      const rank = index + 1;
      maxRank = Math.max(maxRank, rank);
      const list = ranksByPipeline[item.pipeline] ?? [];
      list.push(rank);
      ranksByPipeline[item.pipeline] = list;
    });
  }

  const rows = Object.entries(ranksByPipeline)
    .map(([pipeline, ranks]) => {
      const sorted = [...ranks].sort((a, b) => a - b);
      const meanRank = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
      return {
        pipeline,
        minRank: sorted[0],
        p10Rank: quantile(sorted, 0.1),
        medianRank: quantile(sorted, 0.5),
        p90Rank: quantile(sorted, 0.9),
        maxRank: sorted[sorted.length - 1],
        meanRank,
        samples: sorted.length,
        rankCounts: buildRankCounts(sorted, maxRank)
      };
    })
    .sort((left, right) => left.meanRank - right.meanRank);

  return {
    step,
    permutations: permutations.length,
    maxRank,
    maxCount: Math.max(
      0,
      ...rows.flatMap((row) => row.rankCounts)
    ),
    rows
  };
}

function buildRankCounts(sortedRanks: number[], maxRank: number): number[] {
  const counts = Array.from({ length: Math.max(0, maxRank) }, () => 0);
  for (const rank of sortedRanks) {
    if (rank >= 1 && rank <= maxRank) {
      counts[rank - 1] += 1;
    }
  }
  return counts;
}

function enumerateWeightPermutations(
  groupIds: SubgroupId[],
  step: number
): Array<Record<SubgroupId, number>> {
  if (groupIds.length === 0) {
    return [];
  }
  const buckets = Math.round(1 / step);
  const result: Array<Record<SubgroupId, number>> = [];

  function recurse(index: number, remaining: number, current: Record<SubgroupId, number>) {
    const groupId = groupIds[index];
    if (index === groupIds.length - 1) {
      result.push({
        ...current,
        [groupId]: remaining / buckets
      });
      return;
    }
    for (let value = 0; value <= remaining; value += 1) {
      recurse(index + 1, remaining - value, {
        ...current,
        [groupId]: value / buckets
      });
    }
  }

  recurse(0, buckets, {});
  return result;
}

function createSubgroupId(groups: GroupConfig[]): string {
  const taken = new Set(groups.map((group) => group.id));
  let idx = groups.length + 1;
  while (taken.has(`group_${idx}`)) {
    idx += 1;
  }
  return `group_${idx}`;
}

function quantile(sortedValues: number[], fraction: number): number {
  if (sortedValues.length === 0) {
    return Number.NaN;
  }
  const index = (sortedValues.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedValues[lower];
  }
  const interpolation = index - lower;
  return sortedValues[lower] * (1 - interpolation) + sortedValues[upper] * interpolation;
}

function rankToPercent(rank: number, maxRank: number): number {
  if (!Number.isFinite(rank) || maxRank <= 1) {
    return 0;
  }
  return ((rank - 1) / (maxRank - 1)) * 100;
}

function RankDistributionFigure({ preview }: { preview: RankDistributionPreview }) {
  const width = 760;
  const height = 280;
  const margin = { top: 20, right: 16, bottom: 36, left: 38 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxRank = Math.max(1, preview.maxRank);
  const maxCount = Math.max(1, preview.maxCount);

  const x = (rankIndex: number) =>
    margin.left + (rankIndex / Math.max(1, maxRank - 1)) * plotWidth;
  const y = (count: number) => margin.top + (1 - count / maxCount) * plotHeight;

  return (
    <div className="rank-figure-scroll">
      <svg
        className="rank-figure-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Rank frequency distribution by pipeline"
      >
        <line
          x1={margin.left}
          y1={margin.top + plotHeight}
          x2={margin.left + plotWidth}
          y2={margin.top + plotHeight}
          className="rank-axis"
        />
        <line
          x1={margin.left}
          y1={margin.top}
          x2={margin.left}
          y2={margin.top + plotHeight}
          className="rank-axis"
        />

        {Array.from({ length: maxRank }, (_, idx) => idx + 1).map((rank, idx) => (
          <line
            key={`grid-x-${rank}`}
            x1={x(idx)}
            y1={margin.top}
            x2={x(idx)}
            y2={margin.top + plotHeight}
            className="rank-grid"
          />
        ))}

        {preview.rows.map((row, rowIdx) => {
          const points = row.rankCounts
            .map((count, idx) => `${x(idx)},${y(count)}`)
            .join(" ");
          return (
            <polyline
              key={row.pipeline}
              points={points}
              fill="none"
              stroke={pipelineColor(rowIdx)}
              strokeWidth="2"
            />
          );
        })}

        <text x={margin.left + plotWidth / 2} y={height - 8} className="rank-axis-label">
          Rank (1 ... {maxRank})
        </text>
        <text
          x={14}
          y={margin.top + plotHeight / 2}
          transform={`rotate(-90 14 ${margin.top + plotHeight / 2})`}
          className="rank-axis-label"
        >
          Count
        </text>
      </svg>

      <div className="rank-figure-legend">
        {preview.rows.map((row, rowIdx) => (
          <div key={`legend-${row.pipeline}`} className="rank-legend-item">
            <span
              className="rank-legend-color"
              style={{ backgroundColor: pipelineColor(rowIdx) }}
            />
            <span>{row.pipeline}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankDistributionBars({ preview }: { preview: RankDistributionPreview }) {
  const width = Math.max(760, preview.maxRank * 80);
  const height = 320;
  const margin = { top: 20, right: 16, bottom: 44, left: 40 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxRank = Math.max(1, preview.maxRank);
  const maxCount = Math.max(1, preview.maxCount);
  const pipelineCount = Math.max(1, preview.rows.length);
  const rankBand = plotWidth / maxRank;
  const groupGap = 6;
  const barBand = Math.max(1, rankBand - groupGap);
  const barWidth = Math.max(1, barBand / pipelineCount);

  const y = (count: number) => margin.top + (1 - count / maxCount) * plotHeight;

  return (
    <div className="rank-figure-scroll">
      <svg
        className="rank-figure-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Grouped bars for rank frequencies by pipeline"
      >
        <line
          x1={margin.left}
          y1={margin.top + plotHeight}
          x2={margin.left + plotWidth}
          y2={margin.top + plotHeight}
          className="rank-axis"
        />
        <line
          x1={margin.left}
          y1={margin.top}
          x2={margin.left}
          y2={margin.top + plotHeight}
          className="rank-axis"
        />

        {Array.from({ length: maxRank }, (_, idx) => idx + 1).map((rank, rankIdx) => {
          const rankStart = margin.left + rankIdx * rankBand;
          return (
            <g key={`rank-bars-${rank}`}>
              <line
                x1={rankStart}
                y1={margin.top}
                x2={rankStart}
                y2={margin.top + plotHeight}
                className="rank-grid"
              />
              {preview.rows.map((row, rowIdx) => {
                const count = row.rankCounts[rankIdx] ?? 0;
                const top = y(count);
                const barHeight = margin.top + plotHeight - top;
                return (
                  <rect
                    key={`${row.pipeline}-bar-${rank}`}
                    x={rankStart + rowIdx * barWidth}
                    y={top}
                    width={Math.max(1, barWidth - 0.8)}
                    height={Math.max(0, barHeight)}
                    fill={pipelineColor(rowIdx)}
                    opacity="0.92"
                  />
                );
              })}
              <text
                x={rankStart + rankBand / 2}
                y={height - 10}
                textAnchor="middle"
                className="rank-axis-label"
              >
                {rank}
              </text>
            </g>
          );
        })}

        <text x={margin.left + plotWidth / 2} y={height - 2} className="rank-axis-label">
          Rank
        </text>
        <text
          x={14}
          y={margin.top + plotHeight / 2}
          transform={`rotate(-90 14 ${margin.top + plotHeight / 2})`}
          className="rank-axis-label"
        >
          Count
        </text>
      </svg>

      <div className="rank-figure-legend">
        {preview.rows.map((row, rowIdx) => (
          <div key={`bars-legend-${row.pipeline}`} className="rank-legend-item">
            <span
              className="rank-legend-color"
              style={{ backgroundColor: pipelineColor(rowIdx) }}
            />
            <span>{row.pipeline}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankDistributionHeatmap({ preview }: { preview: RankDistributionPreview }) {
  const cellWidth = 24;
  const cellHeight = 18;
  const width = Math.max(760, 130 + preview.maxRank * cellWidth + 24);
  const height = Math.max(260, 48 + preview.rows.length * cellHeight + 40);
  const margin = { top: 24, right: 16, bottom: 34, left: 110 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxRank = Math.max(1, preview.maxRank);
  const maxCount = Math.max(1, preview.maxCount);
  const colWidth = plotWidth / maxRank;
  const rowHeight = plotHeight / Math.max(1, preview.rows.length);

  return (
    <div className="rank-figure-scroll">
      <svg
        className="rank-figure-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Heatmap of rank frequencies by pipeline"
      >
        {preview.rows.map((row, rowIdx) => (
          <g key={`heat-row-${row.pipeline}`}>
            <text
              x={margin.left - 6}
              y={margin.top + rowIdx * rowHeight + rowHeight * 0.66}
              textAnchor="end"
              className="rank-axis-label"
            >
              {truncateLabel(row.pipeline, 12)}
            </text>
            {row.rankCounts.map((count, rankIdx) => (
              <rect
                key={`heat-${row.pipeline}-${rankIdx + 1}`}
                x={margin.left + rankIdx * colWidth}
                y={margin.top + rowIdx * rowHeight}
                width={Math.max(1, colWidth - 1)}
                height={Math.max(1, rowHeight - 1)}
                fill={heatColor(count, maxCount)}
              />
            ))}
          </g>
        ))}

        {Array.from({ length: maxRank }, (_, idx) => idx + 1).map((rank, rankIdx) => (
          <text
            key={`heat-rank-${rank}`}
            x={margin.left + rankIdx * colWidth + colWidth / 2}
            y={height - 12}
            textAnchor="middle"
            className="rank-axis-label"
          >
            {rank}
          </text>
        ))}

        <text x={margin.left + plotWidth / 2} y={height - 2} className="rank-axis-label">
          Rank
        </text>
      </svg>

      <div className="heatmap-legend">
        <span className="rank-axis-label">Low count</span>
        <div className="heatmap-gradient" />
        <span className="rank-axis-label">High count</span>
      </div>
    </div>
  );
}

function pipelineColor(index: number): string {
  const hue = (index * 43) % 360;
  return `hsl(${hue} 70% 45%)`;
}

function heatColor(count: number, maxCount: number): string {
  const ratio = Math.max(0, Math.min(1, count / Math.max(1, maxCount)));
  const lightness = 96 - ratio * 52;
  return `hsl(216 80% ${lightness}%)`;
}

function truncateLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) {
    return label;
  }
  return `${label.slice(0, Math.max(1, maxLength - 3))}...`;
}

function aggregate(values: number[], method: AggregationMethod): number | null {
  if (values.length === 0) {
    return null;
  }
  if (method === "harmonic_mean") {
    return harmonicMean(values);
  }
  if (method === "min") {
    return Math.min(...values);
  }
  if (method === "max") {
    return Math.max(...values);
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function aggregateFinal(
  groupValues: Array<{ score: number; weight: number }>,
  method: FinalAggregationMethod
): number {
  if (groupValues.length === 0) {
    return Number.NaN;
  }
  if (method === "min") {
    return Math.min(...groupValues.map((item) => item.score));
  }
  if (method === "max") {
    return Math.max(...groupValues.map((item) => item.score));
  }
  if (method === "mean") {
    return groupValues.reduce((sum, item) => sum + item.score, 0) / groupValues.length;
  }
  if (method === "harmonic_mean") {
    return harmonicMean(groupValues.map((item) => item.score));
  }
  const positiveWeights = groupValues.filter((item) => item.weight > 0);
  if (positiveWeights.length === 0) {
    return groupValues.reduce((sum, item) => sum + item.score, 0) / groupValues.length;
  }
  const weightedSum = positiveWeights.reduce(
    (sum, item) => sum + item.score * item.weight,
    0
  );
  const weightSum = positiveWeights.reduce((sum, item) => sum + item.weight, 0);
  return weightedSum / weightSum;
}

function harmonicMean(values: number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  // Harmonic mean for n values: n / sum(1 / x_i). Supports any number of scores.
  if (values.some((value) => value <= 0)) {
    return 0;
  }
  const reciprocalSum = values.reduce((sum, value) => sum + 1 / value, 0);
  if (reciprocalSum === 0) {
    return 0;
  }
  return values.length / reciprocalSum;
}

function formatScore(value: number): string {
  return value.toFixed(3);
}

function formatOptionalScore(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return value.toFixed(3);
}
