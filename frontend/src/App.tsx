import { useEffect, useState } from "react";
import { fetchTasks, type TaskSpec } from "./api";
import { PipelineBuilderPage } from "./pages/PipelineBuilderPage";
import { PipelineLeaderboardPage } from "./pages/PipelineLeaderboardPage";
import { MetadataExplorerPage } from "./pages/MetadataExplorerPage";
import { ResultsPage } from "./pages/ResultsPage";

type PageId = "builder" | "leaderboard" | "explorer" | "results";

export function App() {
  const [tasks, setTasks] = useState<TaskSpec[]>([]);
  const [activePage, setActivePage] = useState<PageId>("builder");
  const [selectedExplorerEntityId, setSelectedExplorerEntityId] = useState<string>("");
  const [loadingError, setLoadingError] = useState<string>("");

  useEffect(() => {
    const route = parseRoute(window.location.search);
    setActivePage(route.page);
    setSelectedExplorerEntityId(route.entity);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const route = parseRoute(window.location.search);
      setActivePage(route.page);
      setSelectedExplorerEntityId(route.entity);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    fetchTasks()
      .then((data) => setTasks(data))
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Failed to load task specs";
        setLoadingError(message);
      });
  }, []);

  function navigateToPage(page: PageId) {
    setActivePage(page);
    writeRoute({ page, entity: page === "explorer" ? selectedExplorerEntityId : "" }, true);
  }

  function handleExplorerEntityChange(entityId: string) {
    setSelectedExplorerEntityId(entityId);
    if (activePage === "explorer") {
      writeRoute({ page: "explorer", entity: entityId }, true);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>KGpipe Explorer</h1>
          <p className="header-subtitle">Prototype workspace for pipeline design and inspection</p>
        </div>
        <nav className="page-tabs" aria-label="Explorer pages">
          <button
            type="button"
            className={activePage === "explorer" ? "active" : ""}
            onClick={() => navigateToPage("explorer")}
          >
            Metadata Explorer
          </button>
          <button
            type="button"
            className={activePage === "builder" ? "active" : ""}
            onClick={() => navigateToPage("builder")}
          >
            Pipeline Editor
          </button>
          <button
            type="button"
            className={activePage === "results" ? "active" : ""}
            onClick={() => navigateToPage("results")}
          >
            Pipeline Results
          </button>
          <button
            type="button"
            className={activePage === "leaderboard" ? "active" : ""}
            onClick={() => navigateToPage("leaderboard")}
          >
            Pipeline Leaderboard
          </button>
        </nav>
      </header>

      {loadingError ? (
        <main className="page-scaffold">
          <p className="error-banner">Unable to load tasks: {loadingError}</p>
        </main>
      ) : (
        <main className="app-content">
          {activePage === "explorer" && (
            <MetadataExplorerPage
              tasks={tasks}
              selectedEntityId={selectedExplorerEntityId}
              onSelectedEntityIdChange={handleExplorerEntityChange}
            />
          )}
          {activePage === "builder" && <PipelineBuilderPage tasks={tasks} />}
          {activePage === "results" && <ResultsPage tasks={tasks} />}
          {activePage === "leaderboard" && <PipelineLeaderboardPage tasks={tasks} />}
        </main>
      )}
    </div>
  );
}

type RouteState = {
  page: PageId;
  entity: string;
};

function parseRoute(search: string): RouteState {
  const params = new URLSearchParams(search);
  const pageParam = params.get("page");
  const entityParam = params.get("entity");
  const parsedEntity = entityParam?.trim() ?? "";
  const page = isPageId(pageParam) ? pageParam : parsedEntity ? "explorer" : "builder";
  return {
    page,
    entity: parsedEntity
  };
}

function writeRoute(route: RouteState, push: boolean) {
  const params = new URLSearchParams(window.location.search);
  params.set("page", route.page);
  if (route.page === "explorer" && route.entity.trim()) {
    params.set("entity", route.entity.trim());
  } else {
    params.delete("entity");
  }
  const search = params.toString();
  const targetUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  const method = push ? "pushState" : "replaceState";
  window.history[method](null, "", targetUrl);
}

function isPageId(value: string | null): value is PageId {
  return (
    value === "builder" ||
    value === "leaderboard" ||
    value === "explorer" ||
    value === "results"
  );
}
