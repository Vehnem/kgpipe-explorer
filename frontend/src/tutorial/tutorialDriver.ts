import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { tutorialStepsByPage } from "./tutorialSteps";
import type { TutorialPage, TutorialStep } from "./tutorialTypes";

function toDriveStep(step: TutorialStep): DriveStep {
  return {
    element: step.element,
    popover: {
      title: step.title,
      description: step.description,
      side: step.side ?? "bottom",
      align: step.align ?? "center"
    }
  };
}

function isVisibleStep(step: TutorialStep): boolean {
  if (!step.element) return true;
  return Boolean(document.querySelector(step.element));
}

export function startTutorialForPage(page: TutorialPage): void {
  const steps = tutorialStepsByPage[page].filter(isVisibleStep).map(toDriveStep);
  if (steps.length === 0) return;

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
    nextBtnText: "Weiter",
    prevBtnText: "Zurueck",
    doneBtnText: "Fertig",
    progressText: "{{current}} von {{total}}",
    stagePadding: 8,
    stageRadius: 10
  });

  tutorial.drive();
}
