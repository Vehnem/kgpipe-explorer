import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { tutorialStepsByPage } from "./tutorialSteps";
import type { TutorialLanguage, TutorialPage, TutorialStep } from "./tutorialTypes";

function toDriveStep(step: TutorialStep, language: TutorialLanguage): DriveStep {
  return {
    element: step.element,
    popover: {
      title: step.title[language],
      description: step.description[language],
      side: step.side ?? "bottom",
      align: step.align ?? "center"
    }
  };
}

function isVisibleStep(step: TutorialStep): boolean {
  if (!step.element) return true;
  return Boolean(document.querySelector(step.element));
}

export function startTutorialForPage(page: TutorialPage, language: TutorialLanguage): void {
  const steps = tutorialStepsByPage[page]
    .filter(isVisibleStep)
    .map((step) => toDriveStep(step, language));
  if (steps.length === 0) return;

  const isEnglish = language === "en";

  const tutorial = driver({
    steps,
    animate: true,
    allowClose: true,
    allowKeyboardControl: true,
    disableActiveInteraction: false,
    overlayClickBehavior: "close",
    overlayOpacity: 0.55,
    popoverClass: "kgpipe-tutorial-popover",
    showButtons: ["previous", "next", "close"],
    showProgress: true,
    nextBtnText: isEnglish ? "Next" : "Weiter",
    prevBtnText: isEnglish ? "Back" : "Zurueck",
    doneBtnText: isEnglish ? "Done" : "Fertig",
    progressText: isEnglish ? "{{current}} of {{total}}" : "{{current}} von {{total}}",
    stagePadding: 8,
    stageRadius: 10
  });

  tutorial.drive();
}
