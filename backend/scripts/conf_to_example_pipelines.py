#!/usr/bin/env python3
"""Convert a kgpipe pipeline.conf catalog into builder example_pipelines.json entries.

Looks up each task's named IO ports from the Python Registry (same declarations
PipeKG syncs from), then builds a React Flow DAG with source/sink data nodes and
port-based handles (``out:{port}`` / ``in:{port}``).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

# Use absolute() (not resolve()) so a symlinked dashboard/ still points at the
# demo workspace root (…/demo) rather than the symlink target (…/kgpipe-explorer).
_SCRIPT_FILE = Path(__file__).absolute()
_BACKEND_DIR = _SCRIPT_FILE.parents[1]
_WORKSPACE_ROOT = _SCRIPT_FILE.parents[3]
DEFAULT_CONF = _WORKSPACE_ROOT / "kgpipe" / "experiments" / "moviekg" / "pipeline.conf"
DEFAULT_OUT = _BACKEND_DIR / "fixtures" / "example_pipelines.json"
PEDAGOGICAL_IDS = frozenset({"example_ner_to_kg", "example_pdf_to_kg"})

# Pipeline-family prefix → (source label, source format) for the leading dataNode.
FAMILY_SOURCE: dict[str, tuple[str, str]] = {
    "text": ("Text", "txt"),
    "json": ("JSON", "json"),
    "rdf": ("RDF", "nt"),
}

# Moviekg pipelines always integrate a format source into a seed KG (.nt).
SEED_LABEL = "Seed KG"
SEED_FORMAT = "nt"
SEED_NODE_ID = "n-seed"
SOURCE_NODE_ID = "n-source"

# Port names that conventionally bind to the seed KG (mirrors KgPipe.build "kg" special-case).
SEED_PORT_NAMES = frozenset({"kg", "target", "rdf2"})
# Port names that conventionally bind to the pipeline source artifact.
SOURCE_PORT_NAMES = frozenset({"source", "input", "rdf1"})

X_STEP = 220.0
Y_POS = 140.0
Y_SOURCE = 80.0
Y_SEED = 220.0

Port = dict[str, str]  # {name, format}
Producer = tuple[str, str, str]  # (node_id, port_name, format)


def _format_value(fmt: Any) -> str:
    return str(fmt.value) if hasattr(fmt, "value") else str(fmt)


def _spec_ports(spec: dict[str, Any]) -> list[Port]:
    """Named ports from a Registry input_spec/output_spec (preserves multiplicity)."""
    return [{"name": name, "format": _format_value(fmt)} for name, fmt in spec.items()]


def _humanize_id(pipeline_id: str) -> str:
    parts = pipeline_id.split("_")
    return " ".join(p.upper() if p in {"rdf", "llm"} else p.capitalize() for p in parts)


def _family_prefix(pipeline_id: str) -> str:
    return pipeline_id.split("_", 1)[0]


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _ensure_tasks_registered() -> None:
    from kgpipe.common.discovery import discover_kgpipe_llm, discover_kgpipe_tasks

    discover_kgpipe_tasks()
    discover_kgpipe_llm()


def conf_to_example_pipeline(pipeline_id: str, description: str, task_names: list[str]) -> dict[str, Any]:
    from kgpipe.common.registry import Registry

    family = _family_prefix(pipeline_id)
    if family not in FAMILY_SOURCE:
        raise ValueError(f"Unknown pipeline family '{family}' for id '{pipeline_id}'")
    src_label, src_format = FAMILY_SOURCE[family]

    task_nodes: list[dict[str, Any]] = []
    for i, task_name in enumerate(task_names):
        try:
            task = Registry.get_task(task_name)
        except KeyError as exc:
            raise KeyError(f"Task '{task_name}' (pipeline '{pipeline_id}') is not in the Registry") from exc
        input_ports = _spec_ports(dict(task.input_spec))
        output_ports = _spec_ports(dict(task.output_spec))
        task_nodes.append(
            {
                "id": f"n-{_slug(task_name)}-{i}",
                "task_name": task.name,
                "inputs": [p["format"] for p in input_ports],
                "outputs": [p["format"] for p in output_ports],
                "input_ports": input_ports,
                "output_ports": output_ports,
                "position_x": 20 + (i + 1) * X_STEP,
                "position_y": Y_POS,
            }
        )

    source_node = {
        "id": SOURCE_NODE_ID,
        "task_name": src_label,
        "inputs": [],
        "outputs": [],
        "position_x": 20.0,
        "position_y": Y_SOURCE,
        "node_type": "dataNode",
        "format": src_format,
        "data_kind": "source",
    }
    seed_node = {
        "id": SEED_NODE_ID,
        "task_name": SEED_LABEL,
        "inputs": [],
        "outputs": [],
        "position_x": 20.0,
        "position_y": Y_SEED,
        "node_type": "dataNode",
        "format": SEED_FORMAT,
        "data_kind": "source",
    }

    last_outs = task_nodes[-1]["output_ports"] if task_nodes else [{"name": src_format, "format": src_format}]
    sink_format = last_outs[0]["format"] if last_outs else "nt"
    sink_node = {
        "id": "n-kg-sink",
        "task_name": "KG",
        "inputs": [],
        "outputs": [],
        "position_x": 20 + (len(task_nodes) + 1) * X_STEP,
        "position_y": Y_POS,
        "node_type": "dataNode",
        "format": sink_format,
        "data_kind": "sink",
    }

    # Producers: format source + seed KG, then each task's output ports.
    # Seed stays available for every "kg"/"target" port (runtime catalog behavior).
    available: list[Producer] = [
        (SOURCE_NODE_ID, src_format, src_format),
        (SEED_NODE_ID, SEED_FORMAT, SEED_FORMAT),
    ]
    used_producers: set[tuple[str, str]] = set()
    edges: list[dict[str, str]] = []

    def add_edge(
        source_id: str,
        target_id: str,
        source_port: str,
        target_port: str,
        fmt: str,
        *,
        sink: bool = False,
    ) -> None:
        edges.append(
            {
                "source": source_id,
                "target": target_id,
                "source_handle": f"out:{source_port}",
                "target_handle": "in:any" if sink else f"in:{target_port}",
                "format_label": fmt,
            }
        )
        used_producers.add((source_id, source_port))

    def pick_producer(
        fmt: str,
        prefer_node: str | None = None,
        *,
        avoid_nodes: set[str] | None = None,
        allow_seed: bool = True,
    ) -> Producer | None:
        """Pick a producer matching ``fmt``, preferring unused ports / distinct nodes."""
        candidates = [p for p in available if p[2] == fmt]
        if not allow_seed:
            non_seed = [p for p in candidates if p[0] != SEED_NODE_ID]
            if non_seed:
                candidates = non_seed
        if not candidates:
            return None
        avoid = avoid_nodes or set()

        def rank(prod: Producer) -> tuple[int, int, int]:
            node_id, port_name, _ = prod
            preferred = 0 if prefer_node is not None and node_id == prefer_node else 1
            distinct = 0 if node_id not in avoid else 1
            unused = 0 if (node_id, port_name) not in used_producers else 1
            return (preferred, distinct, unused)

        return sorted(candidates, key=rank)[0]

    def preferred_producer_node(port: Port, prev_node_id: str | None) -> str | None:
        name = port["name"]
        fmt = port["format"]
        if name in SEED_PORT_NAMES and fmt == SEED_FORMAT:
            return SEED_NODE_ID
        if name in SOURCE_PORT_NAMES and fmt == src_format:
            # Bind the static source only until a task has produced this format.
            has_task_producer = any(
                p[0] not in {SOURCE_NODE_ID, SEED_NODE_ID} and p[2] == fmt for p in available
            )
            if not has_task_producer:
                return SOURCE_NODE_ID
        return prev_node_id

    for node in task_nodes:
        # Prefer the most recently added *task* producer when chaining (skip static sources).
        prev_node_id = None
        for prod in reversed(available):
            if prod[0] not in {SOURCE_NODE_ID, SEED_NODE_ID}:
                prev_node_id = prod[0]
                break
        wired_from: set[str] = set()
        for port in node["input_ports"]:
            prefer = preferred_producer_node(port, prev_node_id)
            # Seed is reserved for kg/target/rdf2; other nt ports use staging artifacts.
            allow_seed = port["name"] in SEED_PORT_NAMES
            producer = pick_producer(
                port["format"],
                prefer_node=prefer,
                avoid_nodes=wired_from,
                allow_seed=allow_seed,
            )
            if producer is None:
                continue
            add_edge(producer[0], node["id"], producer[1], port["name"], port["format"])
            wired_from.add(producer[0])
        for port in node["output_ports"]:
            available.append((node["id"], port["name"], port["format"]))

    if task_nodes:
        last_id = task_nodes[-1]["id"]
        producer = pick_producer(sink_format, prefer_node=last_id)
        if producer is None and available:
            producer = available[-1]
        if producer is not None:
            add_edge(producer[0], sink_node["id"], producer[1], "any", producer[2], sink=True)

    return {
        "id": pipeline_id,
        "name": _humanize_id(pipeline_id),
        "description": description,
        "nodes": [source_node, seed_node, *task_nodes, sink_node],
        "edges": edges,
    }


def convert_catalog(conf_path: Path) -> list[dict[str, Any]]:
    from kgpipe.generation.loaders import load_pipeline_catalog

    _ensure_tasks_registered()
    catalog = load_pipeline_catalog(conf_path)
    return [
        conf_to_example_pipeline(pid, entry.description, list(entry.tasks))
        for pid, entry in catalog.root.items()
    ]


def merge_examples(existing: list[dict[str, Any]], generated: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep only hand-authored pedagogical fixtures; replace catalog entries from conf."""
    pedagogical = [item for item in existing if item.get("id") in PEDAGOGICAL_IDS]
    return [*pedagogical, *generated]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--conf", type=Path, default=DEFAULT_CONF, help="Path to pipeline.conf")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Path to example_pipelines.json")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print generated JSON to stdout without writing --out",
    )
    parser.add_argument(
        "--replace-all",
        action="store_true",
        help="Write only generated pipelines (drop existing pedagogical examples)",
    )
    args = parser.parse_args(argv)

    if not args.conf.is_file():
        print(f"error: conf not found: {args.conf}", file=sys.stderr)
        return 1

    generated = convert_catalog(args.conf)

    if args.replace_all:
        merged = generated
    elif args.out.is_file():
        existing = json.loads(args.out.read_text(encoding="utf-8"))
        if not isinstance(existing, list):
            print(f"error: expected a JSON array in {args.out}", file=sys.stderr)
            return 1
        merged = merge_examples(existing, generated)
    else:
        merged = generated

    payload = json.dumps(merged, indent=2) + "\n"
    if args.dry_run:
        sys.stdout.write(payload)
    else:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(payload, encoding="utf-8")
        print(f"Wrote {len(merged)} pipelines ({len(generated)} from conf) → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
