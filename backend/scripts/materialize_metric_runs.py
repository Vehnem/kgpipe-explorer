#!/usr/bin/env python3
"""Write MetricRun triples for one stage evaluation, without touching the system graph.

Follows ``MetricRunEntity``, ``MetricEntity``, and ``MeasurementSpecEntity`` in
``kgpipe.common.graph.definitions``, and the ``add_metric`` / ``add_measurement_spec``
property names. ``add_metric_run`` is a no-op in the system graph, so the run
triples are the entity fields themselves: ``status``, ``value``, ``details``,
``computedMetric``, and ``input``.

Each object in ``eval_results.json`` becomes one MetricRun. ``details`` is the
summary plus every measurement. ``value`` is set only when the entry has a
single score (``normalized_score``, else ``f1_score``, else the only numeric
measurement). The file has no start or end time, so those properties are omitted.

The run's ``input`` is the stage ``result.nt`` Data entity, using the same IRI
as ``materialize_pipeline_run.py``. The PipelineRun from that script links here
with ``hasMetricRun``.

Example::

    python scripts/materialize_metric_runs.py \\
        --eval data/results/large/rdf_llm_schema_align_v1/stage_3/eval_results.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from rdflib import Graph, Literal, URIRef
from rdflib.namespace import RDF, XSD

from materialize_pipeline_run import RESOURCE, _add_data, _encode, _pipeline_name, _resource, _term

# Scores that stand in for MetricRun.value when a metric reports several numbers.
_PRIMARY_MEASUREMENTS = ("normalized_score", "f1_score")


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--eval", required=True, type=Path, help="eval_results.json")
    parser.add_argument(
        "--plan",
        type=Path,
        help="exec-plan.json used to read result.path (default: next to the eval file)",
    )
    parser.add_argument(
        "--result",
        help="Absolute path of the evaluated KG, overriding the plan result",
    )
    parser.add_argument(
        "--name",
        help="PipelineRun name to link (default: <pipeline dir>/<stage dir>)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        help="N-Triples output path (default: metric-runs.nt next to the eval file)",
    )
    return parser.parse_args(argv)


def _load_results(path: Path) -> list[dict]:
    if not path.is_file():
        raise SystemExit(f"file not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(data, list):
        raise SystemExit(f"{path} must be a JSON list of metric results")
    return data


def _result_input(eval_path: Path, plan_path: Path | None, result_override: str | None) -> tuple[str, str]:
    if result_override:
        return result_override, "nt"
    plan_file = plan_path or (eval_path.parent / "exec-plan.json")
    if not plan_file.is_file():
        raise SystemExit(f"pass --result or provide a plan with result.path ({plan_file} not found)")
    try:
        plan = json.loads(plan_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid JSON in {plan_file}: {exc}") from exc
    result = plan.get("result") if isinstance(plan, dict) else None
    if not isinstance(result, dict) or "path" not in result:
        raise SystemExit(f"{plan_file} has no result.path")
    return str(result["path"]), str(result.get("format") or "nt")


def _numeric(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _primary_value(measurements: list[dict]) -> float | None:
    by_name = {str(item.get("name")): _numeric(item.get("value")) for item in measurements}
    for name in _PRIMARY_MEASUREMENTS:
        if by_name.get(name) is not None:
            return by_name[name]
    numbers = [value for value in by_name.values() if value is not None]
    if len(numbers) == 1:
        return numbers[0]
    return None


def _measurements(entry: dict, label: str) -> list[dict]:
    raw = entry.get("measurements")
    if not isinstance(raw, list):
        raise SystemExit(f"{label} is missing a measurements list")
    measurements: list[dict] = []
    for item in raw:
        if not isinstance(item, dict) or "name" not in item:
            raise SystemExit(f"{label} measurements must have a name")
        measurements.append(item)
    return measurements


def build_metric_runs(
    results: list[dict],
    pipeline_name: str,
    result_path: str,
    result_format: str,
) -> Graph:
    """Materialize MetricRun triples for one evaluated KG."""
    graph = Graph()
    pipeline_id = _resource("pipeline-run", pipeline_name)
    data_id = _add_data(graph, result_path, result_format, {})

    for entry in results:
        if not isinstance(entry, dict) or "metric" not in entry:
            raise SystemExit("each eval result must be an object with 'metric'")
        metric_name = str(entry["metric"])
        summary = str(entry.get("summary") or "")
        measurements = _measurements(entry, metric_name)

        metric_id = URIRef(RESOURCE + _encode(metric_name))
        graph.add((metric_id, RDF.type, _term("Metric")))
        graph.add((metric_id, _term("name"), Literal(metric_name)))
        if summary:
            graph.add((metric_id, _term("description"), Literal(summary)))

        for measurement in measurements:
            # measurement_spec_to_entity ids are "{metric}_{measurement}".
            spec_id = URIRef(RESOURCE + _encode(f"{metric_name}_{measurement['name']}"))
            graph.add((spec_id, RDF.type, _term("MeasurementSpec")))
            graph.add((spec_id, _term("name"), Literal(str(measurement["name"]))))
            unit = measurement.get("unit")
            if unit is not None:
                graph.add((spec_id, _term("unit"), Literal(str(unit))))
            graph.add((metric_id, _term("hasMeasurement"), spec_id))

        run_id = _resource("metric-run", pipeline_name, metric_name)
        details = json.dumps(
            {"summary": summary, "measurements": measurements},
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
        graph.add((run_id, RDF.type, _term("MetricRun")))
        graph.add((run_id, _term("status"), Literal("success")))
        graph.add((run_id, _term("details"), Literal(details)))
        graph.add((run_id, _term("computedMetric"), metric_id))
        graph.add((run_id, _term("input"), data_id))
        graph.add((pipeline_id, _term("hasMetricRun"), run_id))
        value = _primary_value(measurements)
        if value is not None:
            graph.add((run_id, _term("value"), Literal(value, datatype=XSD.double)))
    return graph


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    results = _load_results(args.eval)
    result_path, result_format = _result_input(args.eval, args.plan, args.result)
    pipeline_name = _pipeline_name({}, args.eval, args.name)
    graph = build_metric_runs(results, pipeline_name, result_path, result_format)
    out = args.out or (args.eval.parent / "metric-runs.nt")
    out.parent.mkdir(parents=True, exist_ok=True)
    graph.serialize(destination=out, format="nt", encoding="utf-8")
    print(
        f"wrote {len(graph)} triples for {len(results)} MetricRuns "
        f"on PipelineRun {pipeline_name!r} to {out}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
