import { useEffect, useMemo, useState } from "react";
import type { TaskSpec } from "../api";

type PipeKGExplorerPageProps = {
  tasks: TaskSpec[];
  selectedEntityId: string;
  onSelectedEntityIdChange: (entityId: string) => void;
};

export function PipeKGExplorerPage({
  tasks,
  selectedEntityId,
  onSelectedEntityIdChange
}: PipeKGExplorerPageProps) {
  const [query, setQuery] = useState<string>("");

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((task) => {
      const haystack = [
        task.name,
        task.inputs.join(" "),
        task.outputs.join(" "),
        (task.implements_method ?? []).join(" "),
        (task.uses_tool ?? []).join(" "),
        (task.has_parameter ?? []).join(" ")
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, tasks]);

  useEffect(() => {
    if (tasks.length === 0) return;
    if (
      selectedEntityId &&
      tasks.some((task) => (task.uri ?? task.name) === selectedEntityId)
    ) {
      return;
    }
    onSelectedEntityIdChange(tasks[0].uri ?? tasks[0].name);
  }, [onSelectedEntityIdChange, selectedEntityId, tasks]);

  const selectedTask = useMemo(() => {
    if (selectedEntityId) {
      const exact = tasks.find((task) => (task.uri ?? task.name) === selectedEntityId);
      if (exact) return exact;
    }
    return filteredTasks[0] ?? tasks[0] ?? null;
  }, [filteredTasks, selectedEntityId, tasks]);

  return (
    <section className="page-scaffold">
      <header className="page-header">
        <h2>PipeKG Explorer</h2>
        <p>
          Draft graph explorer over task entities and their metadata. This is a starter UI
          for browsing implementation details before adding full graph traversal.
        </p>
      </header>

      <div className="explorer-layout">
        <aside className="explorer-sidebar">
          <label htmlFor="kg-search">Search entities</label>
          <input
            id="kg-search"
            type="text"
            value={query}
            placeholder="Task, IO format, method, tool, parameter..."
            onChange={(event) => setQuery(event.target.value)}
          />

          <div className="explorer-list-meta">
            {filteredTasks.length} task entities
          </div>
          <ul className="entity-list">
            {filteredTasks.map((task) => {
              const taskId = task.uri ?? task.name;
              return (
                <li key={taskId}>
                  <button
                    id={taskId}
                    type="button"
                    className={
                      taskId === (selectedTask?.uri ?? selectedTask?.name)
                        ? "entity-btn selected"
                        : "entity-btn"
                    }
                    onClick={() => onSelectedEntityIdChange(taskId)}
                  >
                    {task.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <article className="explorer-detail">
          {selectedTask ? (
            <>
              <h3>{selectedTask.name}</h3>
              <div className="detail-grid">
                <section>
                  <h4>Inputs</h4>
                  <TagList values={selectedTask.inputs} emptyLabel="No declared inputs" />
                </section>
                <section>
                  <h4>Outputs</h4>
                  <TagList values={selectedTask.outputs} emptyLabel="No declared outputs" />
                </section>
                <section>
                  <h4>Implements Methods</h4>
                  <TagList
                    values={selectedTask.implements_method ?? []}
                    emptyLabel="No methods linked"
                  />
                </section>
                <section>
                  <h4>Uses Tools</h4>
                  <TagList values={selectedTask.uses_tool ?? []} emptyLabel="No tools linked" />
                </section>
                <section>
                  <h4>Parameters</h4>
                  <TagList
                    values={selectedTask.has_parameter ?? []}
                    emptyLabel="No parameters linked"
                  />
                </section>
              </div>
            </>
          ) : (
            <p>Select a task entity to inspect details.</p>
          )}
        </article>
      </div>
    </section>
  );
}

type TagListProps = {
  values: string[];
  emptyLabel: string;
};

function TagList({ values, emptyLabel }: TagListProps) {
  if (values.length === 0) {
    return <p className="muted">{emptyLabel}</p>;
  }
  return (
    <div className="tag-list">
      {values.map((value) => (
        <span key={value} className="tag">
          {value}
        </span>
      ))}
    </div>
  );
}
