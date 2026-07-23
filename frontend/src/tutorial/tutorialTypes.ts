export type TutorialPage = "builder" | "leaderboard" | "explorer" | "results" | "learn";

export type TutorialLanguage = "en" | "de";

export type LocalizedText = Record<TutorialLanguage, string>;

export type TutorialAdvanceOn = {
  /** Custom window event name that advances this step when dispatched. */
  event: string;
  /** Optional CustomEvent detail field that must equal this value. */
  exampleId?: string;
  taskName?: string;
  /** Advance only when all of these pipeline ids are selected. */
  requirePipelines?: string[];
  /** Advance only when all of these subgroup ids exist. */
  requireGroups?: string[];
  /** Advance only when the active data tab matches. */
  dataTab?: string;
  /** Advance only when the preview mode matches. */
  previewMode?: string;
};

export type TutorialStep = {
  element?: string;
  title: LocalizedText;
  description: LocalizedText;
  side?: "top" | "right" | "bottom" | "left" | "over";
  align?: "start" | "center" | "end";
  /** When set, the step waits for this user action instead of Next. */
  advanceOn?: TutorialAdvanceOn;
  /**
   * Keep this step even if its element is not in the DOM yet
   * (e.g. a control that appears only after prior practice actions).
   */
  deferElement?: boolean;
  /** When this step is shown, ask the builder to focus/search this task. */
  focusTask?: string;
  /** When this step is shown, auto-select this task node on the canvas. */
  selectTask?: string;
};

/** Example / task used by the builder practice guide. */
export const PRACTICE_EXAMPLE_ID = "rdf_base";
export const PRACTICE_EXAMPLE_NAME = "RDF Base";
export const PRACTICE_TASK_NAME = "fusion_first_value";

/** Pipelines used by the results practice guide. */
export const PRACTICE_RESULTS_PIPELINE_A = "R_A";
export const PRACTICE_RESULTS_PIPELINE_B = "R_B";

/** Pipelines / subgroups used by the leaderboard practice guide. */
export const PRACTICE_LEADERBOARD_PIPELINES = ["R_A", "R_B", "R_C"] as const;
/** Accuracy is the correctness-oriented subgroup in leaderboard defaults. */
export const PRACTICE_LEADERBOARD_GROUP_ACCURACY = "accuracy";
export const PRACTICE_LEADERBOARD_GROUP_COVERAGE = "coverage";
