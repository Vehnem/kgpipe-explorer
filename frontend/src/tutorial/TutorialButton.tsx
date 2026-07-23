import { useEffect, useRef, useState } from "react";
import {
  startBuilderPracticeGuide,
  startLeaderboardPracticeGuide,
  startResultsPracticeGuide,
  startTutorialForPage
} from "./tutorialDriver";
import { getStoredTutorialLanguage, storeTutorialLanguage } from "./tutorialStorage";
import type { TutorialLanguage, TutorialPage } from "./tutorialTypes";

type TutorialButtonProps = {
  page: TutorialPage;
  onOpenLearn: () => void;
};

const PRACTICE_LABELS: Partial<Record<TutorialPage, string>> = {
  builder: "Practice: edit a pipeline",
  results: "Practice: compare results",
  leaderboard: "Practice: rebuild ranking"
};

export function TutorialButton({ page, onOpenLearn }: TutorialButtonProps) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<TutorialLanguage>(() => getStoredTutorialLanguage());
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function handleLanguageChange(nextLanguage: TutorialLanguage) {
    setLanguage(nextLanguage);
    storeTutorialLanguage(nextLanguage);
  }

  function handleStartTour() {
    setOpen(false);
    startTutorialForPage(page, language);
  }

  function handleStartPracticeGuide() {
    setOpen(false);
    if (page === "builder") {
      startBuilderPracticeGuide(language);
      return;
    }
    if (page === "results") {
      startResultsPracticeGuide(language);
      return;
    }
    if (page === "leaderboard") {
      startLeaderboardPracticeGuide(language);
    }
  }

  function handleOpenLearn() {
    setOpen(false);
    onOpenLearn();
  }

  const practiceLabel = PRACTICE_LABELS[page];
  const helpBlurb =
    page === "builder"
      ? "Take the overview tour, or practice editing a pipeline step by step."
      : page === "results"
        ? "Take the overview tour, or practice comparing two pipelines step by step."
        : page === "leaderboard"
          ? "Take the overview tour, or practice rebuilding a ranking step by step."
          : "Start a guided tour or open the Knowledge Graph primer.";

  return (
    <div ref={wrapperRef} className={`tutorial-help${page === "builder" ? " tutorial-help--builder" : ""}`}>
      {open ? (
        <section className="tutorial-help-menu" aria-label="Tutorial help menu">
          <div>
            <h2>Help</h2>
            <p>{helpBlurb}</p>
          </div>
          <div className="tutorial-help-actions">
            <button type="button" onClick={handleStartTour}>
              Start page tour
            </button>
            {practiceLabel ? (
              <button type="button" onClick={handleStartPracticeGuide}>
                {practiceLabel}
              </button>
            ) : null}
            <button type="button" onClick={handleOpenLearn}>
              Open Learn page
            </button>
          </div>
          <fieldset className="tutorial-language-toggle">
            <legend>Tour language</legend>
            <label>
              <input
                type="radio"
                name="tutorial-language"
                checked={language === "en"}
                onChange={() => handleLanguageChange("en")}
              />
              EN
            </label>
            <label>
              <input
                type="radio"
                name="tutorial-language"
                checked={language === "de"}
                onChange={() => handleLanguageChange("de")}
              />
              DE
            </label>
          </fieldset>
        </section>
      ) : null}
      <button
        type="button"
        className="tutorial-help-button"
        data-tutorial="tutorial-help"
        aria-label="Open help and tutorial menu"
        aria-expanded={open}
        title="Help"
        onClick={() => setOpen((current) => !current)}
      >
        ?
      </button>
    </div>
  );
}
