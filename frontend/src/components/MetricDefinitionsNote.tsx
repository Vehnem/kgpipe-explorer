import { BENCHMARK_PAPER } from "../benchmarkPaper";

export function MetricDefinitionsNote() {
  return (
    <aside className="metric-definitions-note">
      <strong>KGI-Bench metric definitions.</strong>{" "}
      These metrics follow the KGI-Bench evaluation framework for KG integration
      pipelines: coverage, correctness/accuracy, and consistency. Detailed metric
      definitions are provided in the{" "}
      <a href={BENCHMARK_PAPER.url} target="_blank" rel="noreferrer">
        benchmark paper
      </a>{" "}
      ({BENCHMARK_PAPER.title}).
    </aside>
  );
}
