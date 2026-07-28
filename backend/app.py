from __future__ import annotations

from contextlib import asynccontextmanager
import logging
from pathlib import Path
from typing import List, Optional

import csv
import hashlib
import sqlite3
from datetime import datetime, timezone

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from rdflib import BNode, Graph, Literal, URIRef
from rdflib.query import Result as SparqlResult

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

APP_LOG_PATH = Path(__file__).resolve().parent / "app.log"
REQUEST_LOGGER = logging.getLogger("kgpipe_explorer.requests")

if not REQUEST_LOGGER.handlers:
    REQUEST_LOGGER.setLevel(logging.INFO)
    REQUEST_LOGGER.propagate = False

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    )

    file_handler = logging.FileHandler(APP_LOG_PATH, encoding="utf-8")
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    )
    REQUEST_LOGGER.addHandler(stream_handler)
    REQUEST_LOGGER.addHandler(file_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "https://vehnem.github.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    response = await call_next(request)
    client = request.client.host if request.client else "unknown"
    REQUEST_LOGGER.info(
        "%s %s -> %s client=%s",
        request.method,
        request.url.path,
        response.status_code,
        client,
    )
    return response


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
# Metric / measurement metadata (PipeKG)
# ---------------------------------------------------------------------------

class MeasurementMetadata(BaseModel):
    """Resolved measurement + parent metric info for UI tooltips."""
    key: str
    measurement_name: str
    unit: str | None = None
    alias: list[str] = []
    measurement_uri: str | None = None
    metric_key: str
    metric_description: str | None = None
    metric_type: str | None = None


def _build_measurement_catalog() -> dict[str, MeasurementMetadata]:
    """
    Index PipeKG measurements by name and alias (case-sensitive first; also
    lower-cased keys for tolerant lookup).
    """
    catalog: dict[str, MeasurementMetadata] = {}
    try:
        metrics = PipeKG.find_metric()
    except Exception:
        return catalog

    for metric in metrics:
        try:
            specs = PipeKG.resolve_measurement_specs(metric.measurements)
        except Exception:
            continue
        for spec in specs:
            info = MeasurementMetadata(
                key=spec.name,
                measurement_name=spec.name,
                unit=spec.unit,
                alias=list(spec.alias),
                measurement_uri=spec.uri,
                metric_key=metric.name,
                metric_description=metric.description,
                metric_type=metric.type,
            )
            keys = [spec.name, *spec.alias]
            for key in keys:
                if not key:
                    continue
                catalog[key] = info.model_copy(update={"key": key})
                catalog.setdefault(key.lower(), catalog[key])
    return catalog


@app.get("/metrics/metadata")
def get_metric_metadata(ids: str | None = None) -> dict[str, MeasurementMetadata]:
    """
    Return measurement metadata keyed by displayed name / alias.

    Looks up PipeKG MeasurementSpec entities (and parent Metric description)
    by measurement ``name`` or ``alias_keys``. Pass comma-separated ``ids``
    (e.g. ``ACC_T,COV_E``); omit to return the full catalog keyed by name+alias.
    """
    catalog = _build_measurement_catalog()
    if not ids:
        # Prefer canonical keys (skip lower-case duplicates).
        return {
            key: value
            for key, value in catalog.items()
            if key == value.measurement_name or key in value.alias
        }

    requested = [item.strip() for item in ids.split(",") if item.strip()]
    result: dict[str, MeasurementMetadata] = {}
    for key in requested:
        hit = catalog.get(key) or catalog.get(key.lower())
        if hit is not None:
            result[key] = hit.model_copy(update={"key": key})
    return result


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

BACKEND_ROOT = Path(__file__).resolve().parent

_STAGE_META_FILES: dict[str, tuple[str, str]] = {
    "exec-plan.json": ("Pipeline execution plan", "application/json"),
    "exec-report.json": ("Task execution report", "application/json"),
    "eval_results.json": ("Stage evaluation metrics", "application/json"),
}

_STAGE_KG_FILES: dict[str, tuple[str, str]] = {
    "result.nt": ("Stage output knowledge graph", "application/n-triples"),
    "result_eval.nt": ("Evaluation subgraph", "application/n-triples"),
}

_TMP_MIME_BY_SUFFIX: dict[str, str] = {
    ".json": "application/json",
    ".nt": "application/n-triples",
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".txt": "text/plain",
    ".prov": "text/plain",
    ".ttl": "text/turtle",
}


class ArtifactFile(BaseModel):
    name: str
    description: str
    mime_type: str
    size_bytes: int
    path: str
    category: str = "file"


class StageArtifacts(BaseModel):
    files: list[ArtifactFile]
    tmp_count: int = 0


def _results_root() -> Path:
    rel = str(get_fixtures().benchmarks.get("results_base", "data/results/large"))
    return (BACKEND_ROOT / rel).resolve()


def _pipeline_results_alias(pipeline_id: str) -> str | None:
    aliases = get_fixtures().benchmarks.get("pipeline_aliases", {})
    if not isinstance(aliases, dict):
        return None
    alias = aliases.get(pipeline_id)
    return str(alias).strip() if alias else None


def _guess_mime_type(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in _TMP_MIME_BY_SUFFIX:
        return _TMP_MIME_BY_SUFFIX[suffix]
    return "application/octet-stream"


def _artifact_file(
    path: Path,
    *,
    display_path: str,
    description: str,
    mime_type: str,
    category: str,
) -> ArtifactFile:
    return ArtifactFile(
        name=path.name,
        description=description,
        mime_type=mime_type,
        size_bytes=path.stat().st_size,
        path=display_path,
        category=category,
    )


def _scan_stage_meta_and_kg(stage_dir: Path, rel_prefix: str) -> list[ArtifactFile]:
    files: list[ArtifactFile] = []
    for filename, (description, mime_type) in _STAGE_META_FILES.items():
        path = stage_dir / filename
        if path.is_file():
            files.append(
                _artifact_file(
                    path,
                    display_path=f"{rel_prefix}/{filename}",
                    description=description,
                    mime_type=mime_type,
                    category="meta",
                )
            )
    for filename, (description, mime_type) in _STAGE_KG_FILES.items():
        path = stage_dir / filename
        if path.is_file():
            files.append(
                _artifact_file(
                    path,
                    display_path=f"{rel_prefix}/{filename}",
                    description=description,
                    mime_type=mime_type,
                    category="kg",
                )
            )
    return files


def _count_tmp_files(tmp_dir: Path) -> int:
    if not tmp_dir.is_dir():
        return 0
    return sum(1 for path in tmp_dir.rglob("*") if path.is_file())


def _list_tmp_files(tmp_dir: Path, rel_prefix: str) -> list[ArtifactFile]:
    if not tmp_dir.is_dir():
        return []
    files: list[ArtifactFile] = []
    for path in sorted(tmp_dir.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(tmp_dir).as_posix()
        files.append(
            _artifact_file(
                path,
                display_path=f"{rel_prefix}/tmp/{rel}",
                description="Intermediate task output",
                mime_type=_guess_mime_type(path.name),
                category="tmp",
            )
        )
    return files


def _resolve_stage_dir(pipeline_id: str, stage_id: str) -> tuple[Path, str] | None:
    alias = _pipeline_results_alias(pipeline_id)
    if not alias:
        return None
    rel_prefix = f"{alias}/{stage_id}"
    stage_dir = _results_root() / alias / stage_id
    if not stage_dir.is_dir():
        return None
    return stage_dir, rel_prefix


def _build_real_artifacts(
    pipeline_stages: dict[str, list[str]],
) -> dict[str, dict[str, StageArtifacts]]:
    result: dict[str, dict[str, StageArtifacts]] = {}
    for pipeline, stages in pipeline_stages.items():
        result[pipeline] = {}
        for stage in stages:
            resolved = _resolve_stage_dir(pipeline, stage)
            if resolved is None:
                result[pipeline][stage] = StageArtifacts(files=[], tmp_count=0)
                continue
            stage_dir, rel_prefix = resolved
            files = _scan_stage_meta_and_kg(stage_dir, rel_prefix)
            tmp_count = _count_tmp_files(stage_dir / "tmp")
            result[pipeline][stage] = StageArtifacts(files=files, tmp_count=tmp_count)
    return result


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


@app.get("/results/artifacts")
def get_results_artifacts(
    run_id: str | None = None,
) -> dict[str, dict[str, StageArtifacts]]:
    """
    Return artifact listings for every (pipeline, stage) in the benchmark run.

    Meta files (plan, report, eval) and KG outputs are listed per stage.
    Intermediate ``tmp/`` files are counted but not listed — use
    ``GET /results/artifacts/tmp`` to fetch them on demand.

    Shape: { pipeline_id: { stage_id: StageArtifacts } }
    """
    pipeline_stages = _read_pipeline_stages(run_id)
    return _build_real_artifacts(pipeline_stages)


@app.get("/results/artifacts/tmp")
def get_results_tmp_artifacts(
    pipeline: str,
    stage: str,
    run_id: str | None = None,
) -> list[ArtifactFile]:
    """Lazy listing of intermediate task outputs under a stage's ``tmp/`` directory."""
    del run_id  # reserved for per-run results roots in the future
    pipeline = pipeline.strip()
    stage = stage.strip()
    if not pipeline or not stage:
        raise HTTPException(status_code=400, detail="pipeline and stage are required")

    resolved = _resolve_stage_dir(pipeline, stage)
    if resolved is None:
        return []
    stage_dir, rel_prefix = resolved
    return _list_tmp_files(stage_dir / "tmp", rel_prefix)


def _resolve_final_kg_path(pipeline_id: str) -> tuple[Path, str, str] | None:
    """Return ``(absolute_path, display_path, stage_id)`` for a pipeline's final ``result.nt``."""
    alias = _pipeline_results_alias(pipeline_id)
    if not alias:
        return None
    pipeline_root = _results_root() / alias
    if not pipeline_root.is_dir():
        return None

    stage_dirs = sorted(
        (
            path
            for path in pipeline_root.iterdir()
            if path.is_dir() and path.name.startswith("stage_")
        ),
        key=lambda path: int(path.name.rsplit("_", 1)[-1])
        if path.name.rsplit("_", 1)[-1].isdigit()
        else 0,
    )
    for stage_dir in reversed(stage_dirs):
        result_nt = stage_dir / "result.nt"
        if result_nt.is_file():
            rel_prefix = f"{alias}/{stage_dir.name}"
            return result_nt, f"{rel_prefix}/result.nt", stage_dir.name
    return None


def _term_to_sparql_json(term: object) -> dict[str, str]:
    if isinstance(term, URIRef):
        return {"type": "uri", "value": str(term)}
    if isinstance(term, BNode):
        return {"type": "bnode", "value": str(term)}
    if isinstance(term, Literal):
        binding: dict[str, str] = {"type": "literal", "value": str(term)}
        if term.language:
            binding["xml:lang"] = term.language
        if term.datatype:
            binding["datatype"] = str(term.datatype)
        return binding
    return {"type": "literal", "value": str(term)}


def _sparql_result_to_json(result: object) -> dict[str, object]:
    """Normalize rdflib query output to SPARQL Results JSON."""
    if isinstance(result, Graph):
        bindings = [
            {
                "s": _term_to_sparql_json(s),
                "p": _term_to_sparql_json(p),
                "o": _term_to_sparql_json(o),
            }
            for s, p, o in result
        ]
        return {"head": {"vars": ["s", "p", "o"]}, "results": {"bindings": bindings}}

    if isinstance(result, SparqlResult):
        if result.type in {"CONSTRUCT", "DESCRIBE"} and result.graph is not None:
            bindings = [
                {
                    "s": _term_to_sparql_json(s),
                    "p": _term_to_sparql_json(p),
                    "o": _term_to_sparql_json(o),
                }
                for s, p, o in result.graph
            ]
            return {"head": {"vars": ["s", "p", "o"]}, "results": {"bindings": bindings}}

        if result.type == "ASK":
            return {
                "head": {"vars": []},
                "boolean": bool(result.askAnswer),
                "results": {"bindings": []},
            }

        variables = [str(var) for var in (result.vars or [])]
        bindings: list[dict[str, dict[str, str]]] = []
        for row in result:
            binding: dict[str, dict[str, str]] = {}
            for var in variables:
                value = row[var]
                if value is not None:
                    binding[var] = _term_to_sparql_json(value)
            bindings.append(binding)
        return {"head": {"vars": variables}, "results": {"bindings": bindings}}

    bindings: list[dict[str, dict[str, str]]] = []
    for row in result:  # type: ignore[union-attr]
        if isinstance(row, tuple) and len(row) == 3:
            s, p, o = row
            bindings.append(
                {
                    "s": _term_to_sparql_json(s),
                    "p": _term_to_sparql_json(p),
                    "o": _term_to_sparql_json(o),
                }
            )
    return {"head": {"vars": ["s", "p", "o"]}, "results": {"bindings": bindings}}


def _execute_sparql_on_nt(kg_path: Path, query: str) -> dict[str, object]:
    graph = Graph()
    graph.parse(kg_path, format="nt")
    result = graph.query(query)
    return _sparql_result_to_json(result)


class DataViewQueryRequest(BaseModel):
    query: str
    pipelines: list[str] = Field(default_factory=list)
    run_id: str | None = None


class DataViewPipelineResult(BaseModel):
    pipeline: str
    stage: str | None = None
    kg_path: str | None = None
    error: str | None = None
    result: dict[str, object] | None = None


@app.post("/results/dataview/query", response_model=list[DataViewPipelineResult])
def query_pipeline_kgs(request: DataViewQueryRequest) -> list[DataViewPipelineResult]:
    """Execute the same SPARQL query against each pipeline's final ``result.nt`` KG."""
    del request.run_id  # reserved for per-run results roots in the future
    query = request.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query must not be empty")

    pipelines = [pipeline.strip() for pipeline in request.pipelines if pipeline.strip()]
    if not pipelines:
        raise HTTPException(status_code=400, detail="at least one pipeline is required")
    if len(pipelines) > 2:
        raise HTTPException(status_code=400, detail="at most two pipelines are supported")

    results: list[DataViewPipelineResult] = []
    for pipeline in pipelines:
        resolved = _resolve_final_kg_path(pipeline)
        if resolved is None:
            results.append(
                DataViewPipelineResult(
                    pipeline=pipeline,
                    error="Final result.nt not found for this pipeline.",
                )
            )
            continue

        kg_path, display_path, stage = resolved
        try:
            sparql_json = _execute_sparql_on_nt(kg_path, query)
        except Exception as exc:  # noqa: BLE001 - surface rdflib parse/query errors to UI
            results.append(
                DataViewPipelineResult(
                    pipeline=pipeline,
                    stage=stage,
                    kg_path=display_path,
                    error=str(exc),
                )
            )
            continue

        results.append(
            DataViewPipelineResult(
                pipeline=pipeline,
                stage=stage,
                kg_path=display_path,
                result=sparql_json,
            )
        )
    return results
