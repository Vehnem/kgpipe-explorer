from __future__ import annotations

from pathlib import Path
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from kgpipe.common.graph.definitions import ImplementationEntity
from kgpipe.common.graph.systemgraph import PipeKG
from typing import List
from typing import Optional

import csv
import hashlib
import sqlite3
from datetime import datetime, timezone

class TaskImplSpec(BaseModel):
    uri: Optional[str] = None
    name: str
    inputs: list[str] = []
    outputs: list[str] = []
    implements_method: list[str] = []
    uses_tool: list[str] = []
    has_parameter: list[str] = []


class EdgeCheckRequest(BaseModel):
    source_task: str
    target_task: str


app = FastAPI(title="KGpipe Explorer API", version="0.1.0")
RUNS_TSV_PATH = Path(__file__).resolve().parent.parent / "runs.tsv"
DEFAULT_BENCHMARK_RUN_ID = "kgi-bench-movie"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "https://vehnem.github.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_task_specs() -> dict[str, TaskImplSpec]:
    implementations: List[ImplementationEntity] = PipeKG.find_implementation()
    task_specs: dict[str, TaskImplSpec] = {implementation.name: TaskImplSpec(
        uri=str(implementation.uri),
        name=implementation.name,
        inputs=PipeKG.resolve_data_spec_formats(implementation.input_spec),
        outputs=PipeKG.resolve_data_spec_formats(implementation.output_spec),
        implements_method=sorted(set(implementation.realizesTask)),
        uses_tool=sorted(set(implementation.usesTool)),
        has_parameter=[],
    ) for implementation in implementations}
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

from fastapi import Body

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
            """
            ,
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
    node_type: str = "taskNode"      # "taskNode" | "dataNode"
    format: Optional[str] = None     # data format for dataNode (e.g. "txt", "ttl")
    data_kind: Optional[str] = None  # "source" | "sink" for dataNode


class ExamplePipelineEdge(BaseModel):
    source: str       # node id
    target: str       # node id
    source_handle: str  # e.g. "out:ttl"
    target_handle: str  # e.g. "in:ttl"
    format_label: str   # edge label / shared format


class ExamplePipeline(BaseModel):
    id: str
    name: str
    description: str
    nodes: list[ExamplePipelineNode]
    edges: list[ExamplePipelineEdge]


# ---------------------------------------------------------------------------
# Mock pipelines — replace / extend this list once real pipelines are stored.
# ---------------------------------------------------------------------------

_EXAMPLE_PIPELINES: list[ExamplePipeline] = [
    ExamplePipeline(
        id="example_ner_to_kg",
        name="NER → KG Linker",
        description=(
            "Text source fed into a named-entity recogniser, "
            "whose Turtle output is consumed by a KG linker. "
            "The final linked graph is collected by a KG sink."
        ),
        nodes=[
            ExamplePipelineNode(
                id="n-text-src",
                task_name="Text",
                inputs=[],
                outputs=[],
                position_x=20,
                position_y=140,
                node_type="dataNode",
                format="txt",
                data_kind="source",
            ),
            ExamplePipelineNode(
                id="n-ner",
                task_name="NERExtractor",
                inputs=["txt"],
                outputs=["ttl"],
                position_x=220,
                position_y=140,
            ),
            ExamplePipelineNode(
                id="n-linker",
                task_name="KGLinker",
                inputs=["ttl"],
                outputs=["ttl", "json"],
                position_x=480,
                position_y=140,
            ),
            ExamplePipelineNode(
                id="n-kg-sink",
                task_name="KG",
                inputs=[],
                outputs=[],
                position_x=740,
                position_y=140,
                node_type="dataNode",
                format="ttl",
                data_kind="sink",
            ),
        ],
        edges=[
            ExamplePipelineEdge(
                source="n-text-src",
                target="n-ner",
                source_handle="out:txt",
                target_handle="in:txt",
                format_label="txt",
            ),
            ExamplePipelineEdge(
                source="n-ner",
                target="n-linker",
                source_handle="out:ttl",
                target_handle="in:ttl",
                format_label="ttl",
            ),
            ExamplePipelineEdge(
                source="n-linker",
                target="n-kg-sink",
                source_handle="out:ttl",
                target_handle="in:any",
                format_label="ttl",
            ),
        ],
    ),
    ExamplePipeline(
        id="example_pdf_to_kg",
        name="PDF → KG",
        description=(
            "A PDF document is converted to Markdown, then processed in "
            "parallel by a content extractor and a metadata extractor. "
            "Both extraction branches produce Turtle triples that are "
            "collected into a knowledge graph."
        ),
        nodes=[
            ExamplePipelineNode(
                id="n-pdf-src",
                task_name="PDF",
                inputs=[],
                outputs=[],
                position_x=20,
                position_y=200,
                node_type="dataNode",
                format="pdf",
                data_kind="source",
            ),
            ExamplePipelineNode(
                id="n-pdf2md",
                task_name="PDFtoMarkdown",
                inputs=["pdf"],
                outputs=["md"],
                position_x=220,
                position_y=200,
            ),
            ExamplePipelineNode(
                id="n-content-ext",
                task_name="ContentExtractor",
                inputs=["md"],
                outputs=["ttl"],
                position_x=480,
                position_y=100,
            ),
            ExamplePipelineNode(
                id="n-meta-ext",
                task_name="MetadataExtractor",
                inputs=["md"],
                outputs=["ttl"],
                position_x=480,
                position_y=300,
            ),
            ExamplePipelineNode(
                id="n-kg-sink",
                task_name="KG",
                inputs=[],
                outputs=[],
                position_x=740,
                position_y=200,
                node_type="dataNode",
                format="ttl",
                data_kind="sink",
            ),
        ],
        edges=[
            ExamplePipelineEdge(
                source="n-pdf-src",
                target="n-pdf2md",
                source_handle="out:pdf",
                target_handle="in:pdf",
                format_label="pdf",
            ),
            ExamplePipelineEdge(
                source="n-pdf2md",
                target="n-content-ext",
                source_handle="out:md",
                target_handle="in:md",
                format_label="md",
            ),
            ExamplePipelineEdge(
                source="n-pdf2md",
                target="n-meta-ext",
                source_handle="out:md",
                target_handle="in:md",
                format_label="md",
            ),
            ExamplePipelineEdge(
                source="n-content-ext",
                target="n-kg-sink",
                source_handle="out:ttl",
                target_handle="in:any",
                format_label="ttl",
            ),
            ExamplePipelineEdge(
                source="n-meta-ext",
                target="n-kg-sink",
                source_handle="out:ttl",
                target_handle="in:any",
                format_label="ttl",
            ),
        ],
    ),
]


@app.get("/pipelines/examples", response_model=list[ExamplePipeline])
def list_example_pipelines() -> list[ExamplePipeline]:
    """Return named / saved example pipeline templates."""
    return _EXAMPLE_PIPELINES


# ---------------------------------------------------------------------------
# Pipeline metadata (mock — will be backed by PipeKG lookups)
# ---------------------------------------------------------------------------

PIPEKG_RESOURCE_PREFIX = "http://github.com/ScaDS/kgpipe/resource/"

_TASK_FAMILY_NAMES: dict[str, str] = {
    "J": "Join",
    "R": "Resolution",
    "T": "Transform",
}

_VARIANT_DESCRIPTIONS: dict[str, str] = {
    "A": "baseline variant",
    "B": "balanced variant",
    "C": "high-recall variant",
}


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
    if "_" in pipeline_id:
        family, variant = pipeline_id.split("_", 1)
        task_sequence = [family]
        family_name = _TASK_FAMILY_NAMES.get(family, family)
        variant_desc = _VARIANT_DESCRIPTIONS.get(variant, f"variant {variant}")
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
            uri=f"{PIPEKG_RESOURCE_PREFIX}{pipeline_id}",
            display_name=pipeline_id,
            kind="atomic",
            description=description,
            task_sequence=task_sequence,
            steps=steps,
            variant=variant,
        )

    task_sequence = list(pipeline_id)
    step_names = [_TASK_FAMILY_NAMES.get(letter, letter) for letter in task_sequence]
    description = f"Composite pipeline: {' → '.join(step_names)}"
    steps = [
        PipelineStepMetadata(
            step_number=index + 1,
            task_family=letter,
            task_name=_TASK_FAMILY_NAMES.get(letter, letter),
            description=f"Step {index + 1}: {_TASK_FAMILY_NAMES.get(letter, letter)}",
        )
        for index, letter in enumerate(task_sequence)
    ]
    return PipelineMetadata(
        id=pipeline_id,
        uri=f"{PIPEKG_RESOURCE_PREFIX}{pipeline_id}",
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
# Benchmark runs (mock catalog)
# ---------------------------------------------------------------------------

class BenchmarkRunInfo(BaseModel):
    id: str
    name: str
    description: str


_BENCHMARK_RUNS: list[BenchmarkRunInfo] = [
    BenchmarkRunInfo(
        id="kgi-bench-movie",
        name="KGI-Bench: Movies",
        description="Movie-domain knowledge graph induction (15 pipelines)",
    ),
    BenchmarkRunInfo(
        id="kgi-bench-books",
        name="KGI-Bench: Books",
        description="Book-domain benchmark — atomic pipelines only (9 pipelines)",
    ),
    BenchmarkRunInfo(
        id="kgi-bench-people",
        name="KGI-Bench: People",
        description="Person entity linking — R-pipeline focus (6 pipelines)",
    ),
]

_BENCHMARK_RUN_IDS = {run.id for run in _BENCHMARK_RUNS}


def _resolve_benchmark_run_id(run_id: str | None) -> str:
    resolved = (run_id or DEFAULT_BENCHMARK_RUN_ID).strip()
    if resolved not in _BENCHMARK_RUN_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown benchmark run: {resolved}")
    return resolved


def _load_base_tsv_rows() -> tuple[list[str], list[list[str]]]:
    if not RUNS_TSV_PATH.exists():
        raise HTTPException(status_code=404, detail="runs.tsv not found")
    lines = [
        line
        for line in RUNS_TSV_PATH.read_text(encoding="utf-8").splitlines()
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


def _filter_rows_for_benchmark(run_id: str, rows: list[list[str]]) -> list[list[str]]:
    if run_id == "kgi-bench-movie":
        return rows
    if run_id == "kgi-bench-books":
        return [row for row in rows if len(row) >= 2 and _is_atomic_pipeline(row[0].strip())]
    if run_id == "kgi-bench-people":
        allowed = {"R_A", "R_B", "R_C", "J_A", "J_B", "RJT"}
        return [row for row in rows if len(row) >= 2 and row[0].strip() in allowed]
    return rows


def _rows_to_tsv(headers: list[str], rows: list[list[str]]) -> str:
    lines = ["\t".join(headers)]
    lines.extend("\t".join(row) for row in rows)
    return "\n".join(lines) + "\n"


def _get_runs_tsv_text(run_id: str | None = None) -> str:
    resolved = _resolve_benchmark_run_id(run_id)
    if resolved == DEFAULT_BENCHMARK_RUN_ID:
        if not RUNS_TSV_PATH.exists():
            raise HTTPException(status_code=404, detail="runs.tsv not found")
        return RUNS_TSV_PATH.read_text(encoding="utf-8")

    headers, rows = _load_base_tsv_rows()
    if not headers:
        return ""

    metric_headers = headers[2:]
    filtered = _filter_rows_for_benchmark(resolved, rows)
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
    """Return available benchmark run configurations (mock catalog)."""
    return _BENCHMARK_RUNS


@app.get("/leaderboard/runs")
def get_leaderboard_runs(run_id: str | None = None) -> dict[str, str]:
    return {"tsv": _get_runs_tsv_text(run_id)}


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


# Artifact templates per stage, parameterised by (pipeline, stage).
_STAGE_ARTIFACTS: dict[str, list[dict]] = {
    "stage_1": [
        {
            "name": "candidates.tsv",
            "description": "Entity and relation candidates extracted from source text",
            "mime_type": "text/tab-separated-values",
            "base_size": 48_000,
            "spread": 12_000,
        },
        {
            "name": "raw_triples.nt",
            "description": "Initial triple dump in N-Triples format before linking",
            "mime_type": "application/n-triples",
            "base_size": 31_500,
            "spread": 8_000,
        },
        {
            "name": "stage1_log.json",
            "description": "Processing log with token counts and timing",
            "mime_type": "application/json",
            "base_size": 4_200,
            "spread": 600,
        },
    ],
    "stage_2": [
        {
            "name": "linked_triples.nt",
            "description": "Triples after entity linking and disambiguation",
            "mime_type": "application/n-triples",
            "base_size": 29_800,
            "spread": 7_500,
        },
        {
            "name": "linking_report.json",
            "description": "Linking statistics: hit rate, NIL counts, confidence histogram",
            "mime_type": "application/json",
            "base_size": 2_900,
            "spread": 400,
        },
    ],
    "stage_3": [
        {
            "name": "final_kg.ttl",
            "description": "Final knowledge graph serialised as Turtle",
            "mime_type": "text/turtle",
            "base_size": 85_000,
            "spread": 20_000,
        },
        {
            "name": "eval_report.json",
            "description": "Full evaluation metrics dump (precision, recall, F1 per relation type)",
            "mime_type": "application/json",
            "base_size": 6_800,
            "spread": 1_200,
        },
        {
            "name": "run_summary.json",
            "description": "High-level run metadata: pipeline ID, timestamp, total triples, wall time",
            "mime_type": "application/json",
            "base_size": 980,
            "spread": 120,
        },
    ],
}


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
    result: dict[str, dict[str, list[ArtifactFile]]] = {}
    for pipeline, stages in pipeline_stages.items():
        result[pipeline] = {}
        for stage in stages:
            templates = _STAGE_ARTIFACTS.get(stage, [])
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