#!/usr/bin/env python3
"""Write one PipelineRun as N-Triples, without touching the system graph.

The triples follow ``PipelineRunEntity`` / ``TaskRunEntity`` and the
``PipeKG.add_task_run`` / ``add_data_entity`` / ``add_data_type`` shape in
``kgpipe.common.graph``: same namespace, types, and predicates. This script
does not import ``systemgraph``, because that module opens the configured
system-graph backend and would send the entities there.

Inputs are a stage ``exec-report.json`` (timings and status) and the matching
``exec-plan.json`` (step order and file paths). Step task names and data
paths must agree.

Example::

    python scripts/materialize_pipeline_run.py \\
        --report data/results/large/rdf_llm_schema_align_v1/stage_3/exec-report.json \\
        --plan data/results/large/rdf_llm_schema_align_v1/stage_3/exec-plan.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from rdflib import Graph, Literal, URIRef
from rdflib.namespace import RDF, XSD

# kgpipe.common.graph.definitions.KGPIPE_NS and KgPipeConfig.PIPEKG_PREFIX.
NS = "http://github.com/ScaDS/kgpipe/"
RESOURCE = "http://github.com/ScaDS/kgpipe/resource/"


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", required=True, type=Path, help="exec-report.json")
    parser.add_argument("--plan", required=True, type=Path, help="exec-plan.json")
    parser.add_argument(
        "--out",
        type=Path,
        help="N-Triples output path (default: pipeline-run.nt next to the report)",
    )
    parser.add_argument(
        "--name",
        help="PipelineRun name (default: <pipeline dir>/<stage_name>)",
    )
    return parser.parse_args(argv)


def _load_json(path: Path) -> dict:
    if not path.is_file():
        raise SystemExit(f"file not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise SystemExit(f"expected a JSON object in {path}")
    return data


def _encode(value: str) -> str:
    """Local name: ``encode_string``, with ``/`` turned into ``-`` so the IRI stays one segment."""
    return value.replace(" ", "_").replace("/", "-").lower()


def _resource(*parts: str) -> URIRef:
    return URIRef(RESOURCE + "-".join(_encode(part) for part in parts))


def _term(name: str) -> URIRef:
    return URIRef(NS + name)


def _file_iri(path: str) -> URIRef:
    file_path = Path(path)
    if not file_path.is_absolute():
        raise SystemExit(f"data path must be absolute: {path}")
    return URIRef(file_path.as_uri())


def _data_id(location: URIRef) -> URIRef:
    digest = hashlib.sha256(str(location).encode("utf-8")).hexdigest()[:16]
    return URIRef(RESOURCE + "data-" + digest)


def _data_type_id(fmt: str) -> URIRef:
    # add_data_type uses encode_string(format + "-" + schema); both are the format.
    return URIRef(RESOURCE + _encode(f"{fmt}-{fmt}"))


def _require_list(payload: dict, key: str, path: Path) -> list:
    value = payload.get(key)
    if not isinstance(value, list):
        raise SystemExit(f"{path} is missing a '{key}' list")
    return value


def _data_refs(items: object, label: str) -> list[tuple[str, str]]:
    if not isinstance(items, list):
        raise SystemExit(f"{label} is not a list of {{path, format}} objects")
    refs: list[tuple[str, str]] = []
    for item in items:
        if not isinstance(item, dict) or "path" not in item or "format" not in item:
            raise SystemExit(f"{label} entries must have path and format")
        refs.append((str(item["path"]), str(item["format"])))
    return refs


def _data_keys(refs: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Filename and format. Report and plan often store the same file under different prefixes."""
    return [(Path(path).name, fmt) for path, fmt in refs]


def _check_plan_matches_report(report: dict, plan: dict, report_path: Path, plan_path: Path) -> None:
    tasks = _require_list(report, "task_reports", report_path)
    steps = _require_list(plan, "steps", plan_path)
    if len(tasks) != len(steps):
        raise SystemExit(
            f"{report_path.name} has {len(tasks)} task reports but "
            f"{plan_path.name} has {len(steps)} steps"
        )
    for index, (task, step) in enumerate(zip(tasks, steps)):
        task_name = task.get("task_name")
        step_name = step.get("task")
        if task_name != step_name:
            raise SystemExit(
                f"step {index} task mismatch: report {task_name!r} vs plan {step_name!r}"
            )
        report_inputs = _data_refs(task.get("inputs"), f"report task {index} inputs")
        plan_inputs = _data_refs(step.get("input"), f"plan step {index} input")
        report_outputs = _data_refs(task.get("outputs"), f"report task {index} outputs")
        plan_outputs = _data_refs(step.get("output"), f"plan step {index} output")
        if _data_keys(report_inputs) != _data_keys(plan_inputs) or _data_keys(report_outputs) != _data_keys(plan_outputs):
            raise SystemExit(
                f"step {index} ({task_name}) filenames or formats differ between report and plan"
            )


def _pipeline_name(report: dict, report_path: Path, override: str | None) -> str:
    if override:
        return override
    stage = str(report.get("stage_name") or report_path.parent.name)
    return f"{report_path.parent.parent.name}/{stage}"


def _add_data(graph: Graph, path: str, fmt: str, seen: dict[str, URIRef]) -> URIRef:
    if path in seen:
        return seen[path]
    location = _file_iri(path)
    data_id = _data_id(location)
    type_id = _data_type_id(fmt)
    graph.add((type_id, RDF.type, _term("DataType")))
    graph.add((type_id, _term("format"), Literal(fmt)))
    graph.add((type_id, _term("schema"), Literal(fmt)))
    graph.add((data_id, RDF.type, _term("Data")))
    graph.add((data_id, _term("location"), location))
    graph.add((data_id, _term("data_type"), type_id))
    seen[path] = data_id
    return data_id


def build_pipeline_run(report: dict, name: str) -> Graph:
    """Materialize one PipelineRun and its TaskRun / Data / DataType triples."""
    graph = Graph()
    run_id = _resource("pipeline-run", name)
    started = float(report["start_ts"])
    ended = started + float(report["duration"])
    graph.add((run_id, RDF.type, _term("PipelineRun")))
    graph.add((run_id, _term("name"), Literal(name)))
    graph.add((run_id, _term("status"), Literal(str(report["status"]))))
    graph.add((run_id, _term("started_at"), Literal(started, datatype=XSD.double)))
    graph.add((run_id, _term("ended_at"), Literal(ended, datatype=XSD.double)))

    data_ids: dict[str, URIRef] = {}
    for index, task in enumerate(report["task_reports"]):
        task_name = str(task["task_name"])
        task_id = _resource("task-run", name, str(index), task_name)
        task_started = float(task["start_ts"])
        task_ended = task_started + float(task["duration"])
        graph.add((task_id, RDF.type, _term("TaskRun")))
        graph.add((task_id, _term("status"), Literal(str(task["status"]))))
        graph.add((task_id, _term("started_at"), Literal(task_started, datatype=XSD.double)))
        graph.add((task_id, _term("ended_at"), Literal(task_ended, datatype=XSD.double)))
        graph.add((run_id, _term("hasTaskRun"), task_id))

        impl_id = URIRef(RESOURCE + _encode(task_name))
        graph.add((impl_id, RDF.type, _term("Implementation")))
        graph.add((impl_id, _term("name"), Literal(task_name)))
        graph.add((task_id, _term("usesImplementation"), impl_id))

        for path, fmt in _data_refs(task.get("inputs"), f"task {index} inputs"):
            graph.add((task_id, _term("input"), _add_data(graph, path, fmt, data_ids)))
        for path, fmt in _data_refs(task.get("outputs"), f"task {index} outputs"):
            graph.add((task_id, _term("output"), _add_data(graph, path, fmt, data_ids)))
    return graph


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    report = _load_json(args.report)
    plan = _load_json(args.plan)
    _check_plan_matches_report(report, plan, args.report, args.plan)
    for key in ("start_ts", "duration", "status", "task_reports"):
        if key not in report:
            raise SystemExit(f"{args.report} is missing '{key}'")

    name = _pipeline_name(report, args.report, args.name)
    graph = build_pipeline_run(report, name)
    out = args.out or (args.report.parent / "pipeline-run.nt")
    out.parent.mkdir(parents=True, exist_ok=True)
    graph.serialize(destination=out, format="nt", encoding="utf-8")
    print(
        f"wrote {len(graph)} triples for PipelineRun {name!r} "
        f"({len(report['task_reports'])} task runs) to {out}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
