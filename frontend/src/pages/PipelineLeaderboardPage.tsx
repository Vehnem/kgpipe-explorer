import { useMemo } from "react";
import type { TaskSpec } from "../api";

type PipelineLeaderboardPageProps = {
  tasks: TaskSpec[];
};

type LeaderboardRow = {
  rank: number;
  taskName: string;
  graphFit: number;
  qualityScore: number;
  avgRuntimeSec: number;
  runs: number;
};

export function PipelineLeaderboardPage({ tasks }: PipelineLeaderboardPageProps) {
  const rows = useMemo<LeaderboardRow[]>(() => {
    return tasks
      .map((task) => {
        const seed = hash(task.name);
        const ioSpread = task.inputs.length + task.outputs.length;
        const graphFit = Math.min(100, 52 + ioSpread * 7 + (seed % 11));
        const qualityScore = Math.min(100, 58 + ioSpread * 6 + ((seed >> 3) % 13));
        const avgRuntimeSec = Number((0.25 + ((seed % 260) + ioSpread * 10) / 80).toFixed(2));
        const runs = 6 + (seed % 45);
        return {
          rank: 0,
          taskName: task.name,
          graphFit,
          qualityScore,
          avgRuntimeSec,
          runs
        };
      })
      .sort(
        (left, right) =>
          right.qualityScore - left.qualityScore ||
          right.graphFit - left.graphFit ||
          left.avgRuntimeSec - right.avgRuntimeSec
      )
      .slice(0, 25)
      .map((row, idx) => ({ ...row, rank: idx + 1 }));
  }, [tasks]);

  return (
    <section className="page-scaffold">
      <header className="page-header">
        <h2>Pipeline Leaderboard</h2>
        <p>
          Draft view for ranking tasks by synthetic quality and graph fitness metrics.
          Replace these placeholders with evaluation-run aggregates when available.
        </p>
      </header>

      <div className="leaderboard-summary">
        <div className="stat-card">
          <div className="stat-value">{tasks.length}</div>
          <div className="stat-label">Registered tasks</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{rows.length}</div>
          <div className="stat-label">Ranked entries</div>
        </div>
      </div>

      <div className="table-frame">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Task</th>
              <th>Graph Fit</th>
              <th>Quality</th>
              <th>Avg Runtime (s)</th>
              <th>Runs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.taskName}>
                <td>{row.rank}</td>
                <td>{row.taskName}</td>
                <td>{row.graphFit}</td>
                <td>{row.qualityScore}</td>
                <td>{row.avgRuntimeSec}</td>
                <td>{row.runs}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-cell">
                  No tasks available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function hash(text: string): number {
  let value = 0;
  for (let idx = 0; idx < text.length; idx += 1) {
    value = (value * 33 + text.charCodeAt(idx)) >>> 0;
  }
  return value;
}
