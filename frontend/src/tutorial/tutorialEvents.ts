export const TUTORIAL_EVENTS = {
  exampleLoaded: "kgpipe-tutorial:example-loaded",
  nodeSelected: "kgpipe-tutorial:node-selected",
  nodeRemoved: "kgpipe-tutorial:node-removed",
  taskAdded: "kgpipe-tutorial:task-added",
  edgeConnected: "kgpipe-tutorial:edge-connected",
  practiceReconnected: "kgpipe-tutorial:practice-reconnected",
  exportOpened: "kgpipe-tutorial:export-opened",
  focusTask: "kgpipe-tutorial:focus-task",
  selectTask: "kgpipe-tutorial:select-task",
  practiceStarted: "kgpipe-tutorial:practice-started",
  practiceEnded: "kgpipe-tutorial:practice-ended",
  pipelinesSelected: "kgpipe-tutorial:pipelines-selected",
  dataTabChanged: "kgpipe-tutorial:data-tab-changed",
  queryRan: "kgpipe-tutorial:query-ran",
  groupsChanged: "kgpipe-tutorial:groups-changed",
  metricsAssigned: "kgpipe-tutorial:metrics-assigned",
  previewModeChanged: "kgpipe-tutorial:preview-mode-changed"
} as const;

export type TutorialEventName = (typeof TUTORIAL_EVENTS)[keyof typeof TUTORIAL_EVENTS];

export type TutorialEventDetail = {
  exampleId?: string;
  taskName?: string;
  nodeId?: string;
  pipelines?: string[];
  dataTab?: string;
  groupIds?: string[];
  previewMode?: string;
};

export function emitTutorialEvent(
  name: TutorialEventName,
  detail: TutorialEventDetail = {}
): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
