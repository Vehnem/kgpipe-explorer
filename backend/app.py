from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

import csv
import hashlib
import sqlite3
from datetime import datetime, timezone

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from fixtures_loader import get_fixtures, load_fixtures
from kgpipe.common.graph.definitions import ImplementationEntity
from kgpipe.common.graph.systemgraph import PipeKG


class DataPortSpec(BaseModel):
    """Named IO port on a task implementation (preserves same-format multiplicity)."""
    name: str
    format: str


class ParameterSpec(BaseModel):
    """Configuration parameter declared on a task's ConfigSpec."""
    uri: Optional[str] = None
    name: str
    datatype: str
    required: bool = False
    default_value: Optional[str | int | float | bool] = None
    allowed_values: list[str | int | float | bool] = []
    alias_keys: list[str] = []
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    unit: Optional[str] = None


class ConfigSpec(BaseModel):
    """Task configuration specification (options available in the builder)."""
    uri: Optional[str] = None
    name: str
    description: Optional[str] = None
    parameters: list[ParameterSpec] = []


class TaskImplSpec(BaseModel):
    uri: Optional[str] = None
    name: str
    # Format lists derived from ports (may contain duplicates when multiple ports share a format).
    inputs: list[str] = []
    outputs: list[str] = []
    input_ports: list[DataPortSpec] = []
    output_ports: list[DataPortSpec] = []
    implements_method: list[str] = []
    uses_tool: list[str] = []
    has_parameter: list[str] = []
    config_spec: Optional[ConfigSpec] = None


class EdgeCheckRequest(BaseModel):
    source_task: str
    target_task: str


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_fixtures()
    yield


app = FastAPI(title="KGpipe Explorer API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "https://vehnem.github.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _default_benchmark_run_id() -> str:
    return str(get_fixtures().benchmarks.get("default_run_id", "kgi-bench-movie"))


def _benchmark_run_defs() -> list[dict]:
    return list(get_fixtures().benchmarks.get("runs", []))


def _benchmark_run_by_id(run_id: str) -> dict | None:
    for run in _benchmark_run_defs():
        if run.get("id") == run_id:
            return run
    return None


def _benchmark_run_ids() -> set[str]:
    return {str(run["id"]) for run in _benchmark_run_defs() if "id" in run}


def _fixture_path(relative: str) -> Path:
    """Resolve a path relative to the fixtures root."""
    return (get_fixtures().root / relative).resolve()


def _dedicated_runs_tsv_path(run_def: dict) -> Path | None:
    """
    Return a dedicated metrics TSV for this benchmark if configured or present.

    Resolution order:
    1. Explicit ``tsv`` field in benchmarks.json (path relative to fixtures/)
    2. Convention file ``runs/{benchmark_id}.tsv`` if it exists
    """
    explicit = run_def.get("tsv")
    if isinstance(explicit, str) and explicit.strip():
        path = _fixture_path(explicit.strip())
        return path

    run_id = str(run_def.get("id", "")).strip()
    if not run_id:
        return None
    conventional = get_fixtures().root / "runs" / f"{run_id}.tsv"
    if conventional.exists():
        return conventional
    return None


def _base_runs_tsv_path(run_def: dict) -> Path:
    """Metrics file used when deriving a benchmark via filter/perturb."""
    base = run_def.get("base_tsv")
    if isinstance(base, str) and base.strip():
        return _fixture_path(base.strip())
    return get_fixtures().default_runs_tsv_path



def _load_task_specs() -> dict[str, TaskImplSpec]:
    implementations: List[ImplementationEntity] = PipeKG.find_implementation()
    task_specs: dict[str, TaskImplSpec] = {}
    for implementation in implementations:
        input_ports = [
            DataPortSpec.model_validate(port)
            for port in PipeKG.resolve_data_spec_ports(implementation.input_spec)
        ]
        output_ports = [
            DataPortSpec.model_validate(port)
            for port in PipeKG.resolve_data_spec_ports(implementation.output_spec)
        ]
        input_ports.sort(key=lambda p: p.name)
        output_ports.sort(key=lambda p: p.name)

        config_entity, parameters = PipeKG.resolve_config_spec_parameters(
            implementation.config_spec
        )
        config_spec: ConfigSpec | None = None
        has_parameter: list[str] = []
        if config_entity is not None:
            param_specs = [
                ParameterSpec(
                    uri=str(param.uri) if param.uri else None,
                    name=param.key,
                    datatype=param.datatype,
                    required=param.required,
                    default_value=param.default_value,
                    allowed_values=list(param.allowed_values),
                    alias_keys=list(param.alias_keys),
                    minimum=param.minimum,
                    maximum=param.maximum,
                    unit=param.unit,
                )
                for param in parameters
            ]
            has_parameter = [param.name for param in param_specs]
            config_spec = ConfigSpec(
                uri=str(config_entity.uri) if config_entity.uri else None,
                name=config_entity.name,
                description=config_entity.description,
                parameters=param_specs,
            )

        task_specs[implementation.name] = TaskImplSpec(
            uri=str(implementation.uri),
            name=implementation.name,
            inputs=[port.format for port in input_ports],
            outputs=[port.format for port in output_ports],
            input_ports=input_ports,
            output_ports=output_ports,
            implements_method=sorted(set(implementation.realizesTask)),
            uses_tool=sorted(set(implementation.usesTool)),
            has_parameter=has_parameter,
            config_spec=config_spec,
        )
    return task_specs


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/tasks", response_model=list[TaskImplSpec])
def list_tasks() -> list[TaskImplSpec]:
    return sorted(_load_task_specs().values(), key=lambda task: task.name)


@app.post("/compatibility/check")
def check_compatibility(request: EdgeCheckRequest) -> dict[str, object]:
    task_specs = _load_task_specs()
    source = task_specs.get(request.source_task)
    target = task_specs.get(request.target_task)
    if source is None or target is None:
        return {"compatible": False, "shared_formats": []}

    # Keep compatibility behavior aligned with the Streamlit prototype:
    # missing declared IO on either side is permissive.
    if not source.outputs or not target.inputs:
        return {"compatible": True, "shared_formats": []}

    shared = sorted(set(source.outputs).intersection(target.inputs))
    return {"compatible": bool(shared), "shared_formats": shared}


@app.post("/sparql/construct")
def construct_sparql(query: str = Body(..., embed=True)) -> dict[str, object]:
    result = PipeKG.sparql_construct(query)
    return result


# ---------------------------------------------------------------------------
# Saved SPARQL query examples (sqlite)
# ---------------------------------------------------------------------------

SAVED_QUERIES_DB_PATH = Path(__file__).resolve().parent / "saved_queries.sqlite"


class SavedSparqlExample(BaseModel):
    label: str
    query: str


def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(SAVED_QUERIES_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sparql_examples (
            label TEXT PRIMARY KEY,
            query TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    return conn


@app.get("/sparql/examples/builtin", response_model=list[SavedSparqlExample])
def list_builtin_sparql_examples() -> list[SavedSparqlExample]:
    """Return builtin SPARQL example queries from fixtures."""
    return [
        SavedSparqlExample(label=item["label"], query=item["query"])
        for item in get_fixtures().sparql_builtin_examples
    ]


@app.get("/sparql/examples", response_model=list[SavedSparqlExample])
def list_saved_sparql_examples() -> list[SavedSparqlExample]:
    with _get_db() as conn:
        rows = conn.execute(
            "SELECT label, query FROM sparql_examples ORDER BY created_at DESC, label ASC"
        ).fetchall()
    return [SavedSparqlExample(label=row["label"], query=row["query"]) for row in rows]


@app.post("/sparql/examples", response_model=SavedSparqlExample)
def save_sparql_example(example: SavedSparqlExample) -> SavedSparqlExample:
    label = example.label.strip()
    query = example.query.strip()
    if not label:
        raise HTTPException(status_code=400, detail="label must not be empty")
    if not query:
        raise HTTPException(status_code=400, detail="query must not be empty")

    created_at = datetime.now(timezone.utc).isoformat()
    with _get_db() as conn:
        conn.execute(
            """
            INSERT INTO sparql_examples(label, query, created_at)
            VALUES(?, ?, ?)
            ON CONFLICT(label) DO UPDATE SET
                query=excluded.query,
                created_at=excluded.created_at
            """,
            (label, query, created_at),
        )
        conn.commit()
    return SavedSparqlExample(label=label, query=query)


# ---------------------------------------------------------------------------
# Example / saved pipelines
# ---------------------------------------------------------------------------

class ExamplePipelineNode(BaseModel):
    id: str
    task_name: str
    inputs: list[str]
    outputs: list[str]
    position_x: float
    position_y: float
    # For data-element nodes (sources / sinks); omit for normal task nodes.
    node_type: str = "taskNode"  # "taskNode" | "dataNode"
    format: Optional[str] = None  # data format for dataNode (e.g. "txt", "ttl")
    data_kind: Optional[str] = None  # "source" | "sink" for dataNode
    # Named ports (preferred). When absent, builder synthesizes ports from inputs/outputs.
    input_ports: list[DataPortSpec] = []
    output_ports: list[DataPortSpec] = []


class ExamplePipelineEdge(BaseModel):
    source: str  # node id
    target: str  # node id
    source_handle: str  # e.g. "out:ttl"
    target_handle: str  # e.g. "in:ttl"
    format_label: str  # edge label / shared format


class ExamplePipeline(BaseModel):
    id: str
    name: str
    description: str
    nodes: list[ExamplePipelineNode]
    edges: list[ExamplePipelineEdge]


@app.get("/pipelines/examples", response_model=list[ExamplePipeline])
def list_example_pipelines() -> list[ExamplePipeline]:
    """Return named / saved example pipeline templates."""
    return [ExamplePipeline.model_validate(item) for item in get_fixtures().example_pipelines]


# ---------------------------------------------------------------------------
# Builder data elements
# ---------------------------------------------------------------------------

class DataElement(BaseModel):
    label: str
    format: str
    data_kind: str  # "source" | "sink"


@app.get("/builder/data-elements", response_model=list[DataElement])
def list_data_elements() -> list[DataElement]:
    """Return builder source/sink palette entries from fixtures."""
    return [DataElement.model_validate(item) for item in get_fixtures().data_elements]


# ---------------------------------------------------------------------------
# Ontology entity types
# ---------------------------------------------------------------------------

class EntityTypeInfo(BaseModel):
    id: str
    label: str
    prefixed: str


class EntityTypesResponse(BaseModel):
    types: list[EntityTypeInfo]
    discovery_query: str


@app.get("/ontology/entity-types", response_model=EntityTypesResponse)
def get_entity_types() -> EntityTypesResponse:
    """Return ontology entity-type filters and discovery query from fixtures."""
    payload = get_fixtures().entity_types
    return EntityTypesResponse.model_validate(payload)


# ---------------------------------------------------------------------------
# Pipeline metadata (mock — will be backed by PipeKG lookups)
# ---------------------------------------------------------------------------

class PipelineStepMetadata(BaseModel):
    step_number: int
    task_family: str
    task_name: str
    description: str


class PipelineMetadata(BaseModel):
    id: str
    uri: str
    display_name: str
    kind: str
    description: str
    task_sequence: list[str]
    steps: list[PipelineStepMetadata]
    variant: str | None = None


def _build_pipeline_metadata(pipeline_id: str) -> PipelineMetadata:
    naming = get_fixtures().pipeline_naming
    resource_prefix = str(naming.get("resource_prefix", "http://github.com/ScaDS/kgpipe/resource/"))
    task_family_names: dict[str, str] = dict(naming.get("task_family_names", {}))
    variant_descriptions: dict[str, str] = dict(naming.get("variant_descriptions", {}))

    if "_" in pipeline_id:
        family, variant = pipeline_id.split("_", 1)
        task_sequence = [family]
        family_name = task_family_names.get(family, family)
        variant_desc = variant_descriptions.get(variant, f"variant {variant}")
        description = f"{family_name} pipeline, {variant_desc}"
        steps = [
            PipelineStepMetadata(
                step_number=1,
                task_family=family,
                task_name=family_name,
                description=f"{family_name} ({variant_desc})",
            )
        ]
        return PipelineMetadata(
            id=pipeline_id,
            uri=f"{resource_prefix}{pipeline_id}",
            display_name=pipeline_id,
            kind="atomic",
            description=description,
            task_sequence=task_sequence,
            steps=steps,
            variant=variant,
        )

    task_sequence = list(pipeline_id)
    step_names = [task_family_names.get(letter, letter) for letter in task_sequence]
    description = f"Composite pipeline: {' → '.join(step_names)}"
    steps = [
        PipelineStepMetadata(
            step_number=index + 1,
            task_family=letter,
            task_name=task_family_names.get(letter, letter),
            description=f"Step {index + 1}: {task_family_names.get(letter, letter)}",
        )
        for index, letter in enumerate(task_sequence)
    ]
    return PipelineMetadata(
        id=pipeline_id,
        uri=f"{resource_prefix}{pipeline_id}",
        display_name=pipeline_id,
        kind="composite",
        description=description,
        task_sequence=task_sequence,
        steps=steps,
    )


@app.get("/pipelines/metadata")
def get_pipeline_metadata(
    run_id: str | None = None,
    ids: str | None = None,
) -> dict[str, PipelineMetadata]:
    """
    Return pipeline metadata keyed by pipeline ID.

    Mock data derived from pipeline naming conventions until PipeKG lookups
    are wired in. Pass comma-separated ``ids`` or scope by benchmark ``run_id``.
    """
    if ids:
        pipeline_ids = [item.strip() for item in ids.split(",") if item.strip()]
    else:
        pipeline_ids = list(_read_pipeline_stages(run_id).keys())
    return {pipeline_id: _build_pipeline_metadata(pipeline_id) for pipeline_id in pipeline_ids}


# ---------------------------------------------------------------------------
# Benchmark runs (fixture catalog)
# ---------------------------------------------------------------------------

class BenchmarkRunInfo(BaseModel):
    id: str
    name: str
    description: str


def _resolve_benchmark_run_id(run_id: str | None) -> str:
    resolved = (run_id or _default_benchmark_run_id()).strip()
    if resolved not in _benchmark_run_ids():
        raise HTTPException(status_code=404, detail=f"Unknown benchmark run: {resolved}")
    return resolved


def _load_tsv_rows(path: Path) -> tuple[list[str], list[list[str]]]:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"runs TSV not found: {path.name}")
    lines = [
        line
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if len(lines) < 2:
        return [], []
    headers = lines[0].split("\t")
    rows = [line.split("\t") for line in lines[1:]]
    return headers, rows


def _is_atomic_pipeline(pipeline: str) -> bool:
    parts = pipeline.split("_", 1)
    return len(parts) == 2 and len(parts[0]) == 1 and len(parts[1]) == 1


def _perturb_metric_value(
    value: float, run_id: str, pipeline: str, stage: str, metric: str
) -> float:
    digest = hashlib.md5(f"{run_id}|{pipeline}|{stage}|{metric}".encode()).digest()
    offset = (int.from_bytes(digest[:2], "big") % 161) / 1000.0
    factor = 0.92 + offset
    return min(1.0, max(0.0, value * factor))


def _filter_rows_for_benchmark(run_def: dict, rows: list[list[str]]) -> list[list[str]]:
    filter_mode = run_def.get("filter", "none")
    if filter_mode == "none":
        return rows
    if filter_mode == "atomic_only":
        return [row for row in rows if len(row) >= 2 and _is_atomic_pipeline(row[0].strip())]
    if filter_mode == "allowlist":
        allowed = set(run_def.get("pipeline_allowlist", []))
        return [row for row in rows if len(row) >= 2 and row[0].strip() in allowed]
    return rows


def _rows_to_tsv(headers: list[str], rows: list[list[str]]) -> str:
    lines = ["\t".join(headers)]
    lines.extend("\t".join(row) for row in rows)
    return "\n".join(lines) + "\n"


def _get_runs_tsv_text(run_id: str | None = None) -> str:
    resolved = _resolve_benchmark_run_id(run_id)
    run_def = _benchmark_run_by_id(resolved)
    if run_def is None:
        raise HTTPException(status_code=404, detail=f"Unknown benchmark run: {resolved}")

    # Prefer a dedicated per-benchmark TSV when present or explicitly configured.
    dedicated = _dedicated_runs_tsv_path(run_def)
    if dedicated is not None:
        if not dedicated.exists():
            raise HTTPException(
                status_code=404,
                detail=f"runs TSV not found for {resolved}: {dedicated.name}",
            )
        return dedicated.read_text(encoding="utf-8")

    # Otherwise derive from a base TSV using filter / perturb rules.
    base_path = _base_runs_tsv_path(run_def)
    headers, rows = _load_tsv_rows(base_path)
    if not headers:
        return ""

    needs_filter = run_def.get("filter", "none") != "none"
    needs_perturb = bool(run_def.get("perturb", False))
    if not needs_filter and not needs_perturb:
        return base_path.read_text(encoding="utf-8")

    metric_headers = headers[2:]
    filtered = _filter_rows_for_benchmark(run_def, rows)
    if not needs_perturb:
        return _rows_to_tsv(headers, filtered)

    perturbed: list[list[str]] = []
    for row in filtered:
        if len(row) < 2:
            continue
        pipeline = row[0].strip()
        stage = row[1].strip()
        out = [pipeline, stage]
        for idx, metric in enumerate(metric_headers):
            raw = row[idx + 2].strip() if idx + 2 < len(row) else ""
            try:
                value = float(raw)
            except ValueError:
                out.append(raw)
                continue
            out.append(f"{_perturb_metric_value(value, resolved, pipeline, stage, metric):.3f}")
        perturbed.append(out)
    return _rows_to_tsv(headers, perturbed)


@app.get("/benchmarks/runs", response_model=list[BenchmarkRunInfo])
def list_benchmark_runs() -> list[BenchmarkRunInfo]:
    """Return available benchmark run configurations from fixtures."""
    return [
        BenchmarkRunInfo(
            id=str(run["id"]),
            name=str(run["name"]),
            description=str(run["description"]),
        )
        for run in _benchmark_run_defs()
    ]


@app.get("/leaderboard/runs")
def get_leaderboard_runs(run_id: str | None = None) -> dict[str, str]:
    return {"tsv": _get_runs_tsv_text(run_id)}


# ---------------------------------------------------------------------------
# Leaderboard defaults
# ---------------------------------------------------------------------------

class LeaderboardGroupConfig(BaseModel):
    id: str
    label: str
    aggregator: str
    weight: float


class MetricGroupRule(BaseModel):
    match: str  # "exact" | "prefix"
    value: str
    group_id: str


class LeaderboardDefaults(BaseModel):
    groups: list[LeaderboardGroupConfig]
    metric_group_rules: list[MetricGroupRule]
    fallback_group_id: str
    default_benchmark_run_id: str


@app.get("/leaderboard/defaults", response_model=LeaderboardDefaults)
def get_leaderboard_defaults() -> LeaderboardDefaults:
    """Return default metric groups and assignment rules from fixtures."""
    payload = get_fixtures().leaderboard_defaults
    return LeaderboardDefaults(
        groups=[LeaderboardGroupConfig.model_validate(g) for g in payload.get("groups", [])],
        metric_group_rules=[
            MetricGroupRule.model_validate(r) for r in payload.get("metric_group_rules", [])
        ],
        fallback_group_id=str(payload.get("fallback_group_id", "none")),
        default_benchmark_run_id=_default_benchmark_run_id(),
    )


# ---------------------------------------------------------------------------
# Results / artifacts
# ---------------------------------------------------------------------------

class ArtifactFile(BaseModel):
    name: str
    description: str
    mime_type: str
    size_bytes: int
    path: str


def _seed(pipeline: str, stage: str, salt: str = "") -> int:
    """Deterministic seed from (pipeline, stage, salt) for mock size variation."""
    digest = hashlib.md5(f"{pipeline}|{stage}|{salt}".encode()).digest()
    return int.from_bytes(digest[:4], "big")


def _vary(base: int, pipeline: str, stage: str, salt: str = "", spread: int = 0) -> int:
    """Return *base* ± spread, deterministically varied by the inputs."""
    if spread == 0:
        return base
    offset = (_seed(pipeline, stage, salt) % (2 * spread + 1)) - spread
    return base + offset


def _read_pipeline_stages(run_id: str | None = None) -> dict[str, list[str]]:
    """Return {pipeline: [stage, …]} for the selected benchmark run (preserves order)."""
    tsv_text = _get_runs_tsv_text(run_id)
    if not tsv_text.strip():
        return {}
    seen: dict[str, list[str]] = {}
    lines = [line for line in tsv_text.splitlines() if line.strip()]
    if len(lines) < 2:
        return {}
    reader = csv.DictReader(lines, delimiter="\t")
    for row in reader:
        pipeline = row.get("pipeline", "").strip()
        stage = row.get("stage", "").strip()
        if not pipeline or not stage:
            continue
        if pipeline not in seen:
            seen[pipeline] = []
        if stage not in seen[pipeline]:
            seen[pipeline].append(stage)
    return seen


def _build_mock_artifacts(
    pipeline_stages: dict[str, list[str]],
) -> dict[str, dict[str, list[ArtifactFile]]]:
    """
    Generate deterministic mock artifact listings for every (pipeline, stage)
    combination present in the runs data.
    """
    stage_artifacts = get_fixtures().stage_artifacts
    result: dict[str, dict[str, list[ArtifactFile]]] = {}
    for pipeline, stages in pipeline_stages.items():
        result[pipeline] = {}
        for stage in stages:
            templates = stage_artifacts.get(stage, [])
            files: list[ArtifactFile] = []
            for tpl in templates:
                size = _vary(
                    tpl["base_size"], pipeline, stage, tpl["name"], tpl["spread"]
                )
                files.append(
                    ArtifactFile(
                        name=tpl["name"],
                        description=tpl["description"],
                        mime_type=tpl["mime_type"],
                        size_bytes=size,
                        path=f"runs/{pipeline}/{stage}/{tpl['name']}",
                    )
                )
            result[pipeline][stage] = files
    return result


@app.get("/results/artifacts")
def get_results_artifacts(
    run_id: str | None = None,
) -> dict[str, dict[str, list[ArtifactFile]]]:
    """
    Mock endpoint — returns deterministic artifact file listings for every
    (pipeline, stage) combination in the selected benchmark run.

    Shape: { pipeline_id: { stage_id: [ArtifactFile, …] } }
    """
    pipeline_stages = _read_pipeline_stages(run_id)
    return _build_mock_artifacts(pipeline_stages)
