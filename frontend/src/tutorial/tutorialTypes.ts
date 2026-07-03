export type TutorialPage = "builder" | "leaderboard" | "explorer" | "results" | "learn";

export type TutorialLanguage = "en" | "de";

export type LocalizedText = Record<TutorialLanguage, string>;

export type TutorialStep = {
  element?: string;
  title: LocalizedText;
  description: LocalizedText;
  side?: "top" | "right" | "bottom" | "left" | "over";
  align?: "start" | "center" | "end";
};
