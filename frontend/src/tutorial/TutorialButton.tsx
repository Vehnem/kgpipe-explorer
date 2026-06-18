import { startTutorialForPage } from "./tutorialDriver";
import type { TutorialPage } from "./tutorialTypes";

type TutorialButtonProps = {
  page: TutorialPage;
};

export function TutorialButton({ page }: TutorialButtonProps) {
  return (
    <button
      type="button"
      className="tutorial-help-button"
      data-tutorial="tutorial-help"
      aria-label="Tutorial fuer diese Seite starten"
      title="Tutorial starten"
      onClick={() => startTutorialForPage(page)}
    >
      ?
    </button>
  );
}
