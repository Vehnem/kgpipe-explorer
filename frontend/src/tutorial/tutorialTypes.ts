export type TutorialPage = "builder" | "leaderboard" | "explorer" | "results";

export type TutorialStep = {
  element?: string;
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left" | "over";
  align?: "start" | "center" | "end";
};
