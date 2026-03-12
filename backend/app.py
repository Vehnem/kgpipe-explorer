from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from kgpipe.common.systemgraph import PipeKG


class TaskSpec(BaseModel):
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


def _load_task_specs() -> dict[str, TaskSpec]:
    pipekg = PipeKG()
    implementations = pipekg.list_taskImplementations()
    io_specs = pipekg.list_task_io_specs()

    task_specs: dict[str, TaskSpec] = {}
    for implementation in implementations:
        task_name = implementation.name
        io = io_specs.get(task_name, {"inputs": set(), "outputs": set()})
        task_specs[task_name] = TaskSpec(
            name=task_name,
            inputs=sorted(io.get("inputs", set())),
            outputs=sorted(io.get("outputs", set())),
            implements_method=sorted(set(implementation.implementsMethod)),
            uses_tool=sorted(set(implementation.usesTool)),
            has_parameter=sorted(set(implementation.hasParameter)),
        )

    # Include any IO-only names if no ImplementationEntity exists for them.
    for task_name, io in io_specs.items():
        if task_name not in task_specs:
            task_specs[task_name] = TaskSpec(
                name=task_name,
                inputs=sorted(io.get("inputs", set())),
                outputs=sorted(io.get("outputs", set())),
            )

    return task_specs


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/tasks", response_model=list[TaskSpec])
def list_tasks() -> list[TaskSpec]:
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
