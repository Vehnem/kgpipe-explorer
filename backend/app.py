from __future__ import annotations

from pathlib import Path
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from kgpipe.common.definitions import ImplementationEntity
from kgpipe.common.systemgraph import PipeKG
from typing import List
from typing import Optional

import csv
import hashlib

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "https://vehnem.github.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_task_specs() -> dict[str, TaskImplSpec]:
    pipekg = PipeKG()
    implementations: List[ImplementationEntity] = pipekg.list_taskImplementations()

    task_specs: dict[str, TaskImplSpec] = {}
    for implementation in implementations:
        task_name = implementation.name
        input_formats = {str(fmt) for fmt in implementation.input_spec}
        output_formats = {str(fmt) for fmt in implementation.output_spec}
        task_specs[task_name] = TaskImplSpec(
            uri=str(implementation.uri),
            name=task_name,
            inputs=sorted(input_formats),
            outputs=sorted(output_formats),
            implements_method=sorted(set(implementation.implementsMethod)),
            uses_tool=sorted(set(implementation.usesTool)),
            has_parameter=sorted(set(implementation.hasParameter)),
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

from fastapi import Body

@app.post("/sparql/construct")
def construct_sparql(query: str = Body(..., embed=True)) -> dict[str, object]:
    result = PipeKG.sparql_construct(query)
    return result


@app.get("/leaderboard/runs")
def get_leaderboard_runs() -> dict[str, str]:
    if not RUNS_TSV_PATH.exists():
        raise HTTPException(status_code=404, detail="runs.tsv not found")
    return {"tsv": RUNS_TSV_PATH.read_text(encoding="utf-8")}


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


def _read_pipeline_stages() -> dict[str, list[str]]:
    """Return {pipeline: [stage, …]} read from runs.tsv (preserves order)."""
    if not RUNS_TSV_PATH.exists():
        return {}
    seen: dict[str, list[str]] = {}
    with RUNS_TSV_PATH.open(encoding="utf-8") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
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
def get_results_artifacts() -> dict[str, dict[str, list[ArtifactFile]]]:
    """
    Mock endpoint — returns deterministic artifact file listings for every
    (pipeline, stage) combination found in runs.tsv.

    Shape: { pipeline_id: { stage_id: [ArtifactFile, …] } }
    """
    if not RUNS_TSV_PATH.exists():
        raise HTTPException(status_code=404, detail="runs.tsv not found")
    pipeline_stages = _read_pipeline_stages()
    return _build_mock_artifacts(pipeline_stages)