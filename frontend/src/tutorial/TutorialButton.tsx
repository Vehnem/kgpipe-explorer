import { useEffect, useRef, useState } from "react";
import { startTutorialForPage } from "./tutorialDriver";
import { getStoredTutorialLanguage, storeTutorialLanguage } from "./tutorialStorage";
import type { TutorialLanguage, TutorialPage } from "./tutorialTypes";

type TutorialButtonProps = {
  page: TutorialPage;
  onOpenLearn: () => void;
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

  function handleOpenLearn() {
    setOpen(false);
    onOpenLearn();
  }

  return (
    <div ref={wrapperRef} className={`tutorial-help${page === "builder" ? " tutorial-help--builder" : ""}`}>
      {open ? (
        <section className="tutorial-help-menu" aria-label="Tutorial help menu">
          <div>
            <h2>Help</h2>
            <p>Start a guided tour or open the Knowledge Graph primer.</p>
          </div>
          <div className="tutorial-help-actions">
            <button type="button" onClick={handleStartTour}>
              Start page tour
            </button>
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
