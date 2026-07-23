import { driver, type AllowedButtons, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { builderPracticeSteps } from "./builderPracticeSteps";
import { leaderboardPracticeSteps } from "./leaderboardPracticeSteps";
import { resultsPracticeSteps } from "./resultsPracticeSteps";
import { emitTutorialEvent, TUTORIAL_EVENTS, type TutorialEventDetail } from "./tutorialEvents";
import { tutorialStepsByPage } from "./tutorialSteps";
import type { TutorialLanguage, TutorialPage, TutorialStep } from "./tutorialTypes";

function toDriveStep(step: TutorialStep, language: TutorialLanguage): DriveStep {
  const waitsForAction = Boolean(step.advanceOn);
  return {
    element: step.element,
    popover: {
      title: step.title[language],
      description: step.description[language],
      side: step.side ?? "bottom",
      align: step.align ?? "center",
      ...(waitsForAction
        ? {
            showButtons: ["previous", "close"] as AllowedButtons[],
            description:
              step.description[language] +
              (language === "en"
                ? "\n\nComplete this action to continue."
                : "\n\nFuehre diese Aktion aus, um fortzufahren.")
          }
        : {})
    }
  };
}

function isVisibleStep(step: TutorialStep): boolean {
  if (!step.element) return true;
  return Boolean(document.querySelector(step.element));
}

function localizedDriverLabels(language: TutorialLanguage) {
  const isEnglish = language === "en";
  return {
    nextBtnText: isEnglish ? "Next" : "Weiter",
    prevBtnText: isEnglish ? "Back" : "Zurueck",
    doneBtnText: isEnglish ? "Done" : "Fertig",
    progressText: isEnglish ? "{{current}} of {{total}}" : "{{current}} von {{total}}"
  };
}

function baseDriverConfig(language: TutorialLanguage) {
  return {
    animate: true,
    allowClose: true,
    allowKeyboardControl: true,
    disableActiveInteraction: false,
    overlayClickBehavior: "close" as const,
    overlayOpacity: 0.55,
    popoverClass: "kgpipe-tutorial-popover",
    showButtons: ["previous", "next", "close"] as AllowedButtons[],
    showProgress: true,
    stagePadding: 8,
    stageRadius: 10,
    ...localizedDriverLabels(language)
  };
}

export function startTutorialForPage(page: TutorialPage, language: TutorialLanguage): void {
  const steps = tutorialStepsByPage[page]
    .filter(isVisibleStep)
    .map((step) => toDriveStep(step, language));
  if (steps.length === 0) return;

  const tutorial = driver({
    ...baseDriverConfig(language),
    steps
  });

  tutorial.drive();
}

function eventMatchesStep(
  advanceOn: NonNullable<TutorialStep["advanceOn"]>,
  event: Event
): boolean {
  const detail = (event as CustomEvent<TutorialEventDetail>).detail ?? {};
  if (advanceOn.exampleId !== undefined && detail.exampleId !== advanceOn.exampleId) {
    return false;
  }
  if (advanceOn.taskName !== undefined && detail.taskName !== advanceOn.taskName) {
    return false;
  }
  if (advanceOn.dataTab !== undefined && detail.dataTab !== advanceOn.dataTab) {
    return false;
  }
  if (advanceOn.previewMode !== undefined && detail.previewMode !== advanceOn.previewMode) {
    return false;
  }
  if (advanceOn.requirePipelines) {
    const selected = detail.pipelines ?? [];
    if (!advanceOn.requirePipelines.every((id) => selected.includes(id))) {
      return false;
    }
  }
  if (advanceOn.requireGroups) {
    const groupIds = detail.groupIds ?? [];
    if (!advanceOn.requireGroups.every((id) => groupIds.includes(id))) {
      return false;
    }
  }
  return true;
}

function advanceAfterAction(activeDriver: Driver, delayMs = 250): void {
  window.setTimeout(() => {
    if (!activeDriver.isActive()) return;
    activeDriver.moveNext();
    window.setTimeout(() => {
      if (activeDriver.isActive()) activeDriver.refresh();
    }, 300);
  }, delayMs);
}

function startPracticeGuide(sourceSteps: TutorialStep[], language: TutorialLanguage): void {
  const steps = sourceSteps.filter((step) => step.deferElement || isVisibleStep(step));
  if (steps.length === 0) return;

  let detachActionListener: (() => void) | undefined;
  document.body.classList.add("kgpipe-practice-guide");
  emitTutorialEvent(TUTORIAL_EVENTS.practiceStarted);

  const clearPractice = () => {
    document.body.classList.remove("kgpipe-practice-guide");
    emitTutorialEvent(TUTORIAL_EVENTS.practiceEnded);
  };

  const tutorial: Driver = driver({
    ...baseDriverConfig(language),
    steps: steps.map((step) => toDriveStep(step, language)),
    onHighlighted: (_element, _step, { driver: activeDriver }) => {
      detachActionListener?.();
      detachActionListener = undefined;

      const index = activeDriver.getActiveIndex();
      if (index === undefined) return;
      const sourceStep = steps[index];
      if (!sourceStep) return;

      if (sourceStep.focusTask) {
        emitTutorialEvent(TUTORIAL_EVENTS.focusTask, { taskName: sourceStep.focusTask });
      }
      if (sourceStep.selectTask) {
        emitTutorialEvent(TUTORIAL_EVENTS.selectTask, { taskName: sourceStep.selectTask });
      }
      if (sourceStep.focusTask || sourceStep.selectTask) {
        window.setTimeout(() => {
          if (activeDriver.isActive()) activeDriver.refresh();
        }, 100);
      }

      if (!sourceStep.advanceOn) return;

      const onAction = (event: Event) => {
        if (!eventMatchesStep(sourceStep.advanceOn!, event)) return;
        detachActionListener?.();
        detachActionListener = undefined;
        advanceAfterAction(activeDriver);
      };

      window.addEventListener(sourceStep.advanceOn.event, onAction);
      detachActionListener = () => {
        window.removeEventListener(sourceStep.advanceOn!.event, onAction);
      };
    },
    onDeselected: () => {
      detachActionListener?.();
      detachActionListener = undefined;
    },
    onDestroyed: () => {
      detachActionListener?.();
      detachActionListener = undefined;
      clearPractice();
    }
  });

  tutorial.drive();
}

/** Sidebar-oriented builder practice guide (avoids React Flow canvas clicks). */
export function startBuilderPracticeGuide(language: TutorialLanguage): void {
  startPracticeGuide(builderPracticeSteps, language);
}

/** Results practice guide: select R_A/R_B, review artifacts, run Data View query. */
export function startResultsPracticeGuide(language: TutorialLanguage): void {
  startPracticeGuide(resultsPracticeSteps, language);
}

/** Leaderboard practice guide: RDF pipelines, Accuracy/Coverage groups, figure view. */
export function startLeaderboardPracticeGuide(language: TutorialLanguage): void {
  startPracticeGuide(leaderboardPracticeSteps, language);
}
