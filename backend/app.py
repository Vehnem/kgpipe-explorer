from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from kgpipe.common.definitions import ImplementationEntity
from kgpipe.common.systemgraph import PipeKG
from typing import List
from typing import Optional

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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