"""Load demo fixtures from JSON/TSV files under backend/fixtures/."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


@dataclass
class Fixtures:
    root: Path = field(default_factory=lambda: FIXTURES_DIR)
    example_pipelines: list[dict[str, Any]] = field(default_factory=list)
    benchmarks: dict[str, Any] = field(default_factory=dict)
    pipeline_naming: dict[str, Any] = field(default_factory=dict)
    stage_artifacts: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    data_elements: list[dict[str, Any]] = field(default_factory=list)
    sparql_builtin_examples: list[dict[str, Any]] = field(default_factory=list)
    entity_types: dict[str, Any] = field(default_factory=dict)
    leaderboard_defaults: dict[str, Any] = field(default_factory=dict)
    # Default metrics file used when a benchmark has no dedicated TSV.
    default_runs_tsv_path: Path = field(
        default_factory=lambda: FIXTURES_DIR / "runs" / "kgi-bench-movie.tsv"
    )

    @property
    def movie_runs_tsv_path(self) -> Path:
        """Backward-compatible alias for the default movie metrics file."""
        return self.default_runs_tsv_path


_CACHE: Fixtures | None = None


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_fixtures(fixtures_dir: Path | None = None) -> Fixtures:
    """Load all fixture files into memory. Idempotent after first call unless force-reload."""
    global _CACHE
    if _CACHE is not None and fixtures_dir is None:
        return _CACHE

    root = fixtures_dir or FIXTURES_DIR
    fixtures = Fixtures(
        root=root,
        example_pipelines=_read_json(root / "example_pipelines.json"),
        benchmarks=_read_json(root / "benchmarks.json"),
        pipeline_naming=_read_json(root / "pipeline_naming.json"),
        stage_artifacts=_read_json(root / "stage_artifacts.json"),
        data_elements=_read_json(root / "data_elements.json"),
        sparql_builtin_examples=_read_json(root / "sparql_builtin_examples.json"),
        entity_types=_read_json(root / "entity_types.json"),
        leaderboard_defaults=_read_json(root / "leaderboard_defaults.json"),
        default_runs_tsv_path=root / "runs" / "kgi-bench-movie.tsv",
    )
    if fixtures_dir is None:
        _CACHE = fixtures
    return fixtures


def get_fixtures() -> Fixtures:
    if _CACHE is None:
        return load_fixtures()
    return _CACHE
