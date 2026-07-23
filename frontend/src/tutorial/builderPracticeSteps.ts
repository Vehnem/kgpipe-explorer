import { TUTORIAL_EVENTS } from "./tutorialEvents";
import {
  PRACTICE_EXAMPLE_ID,
  PRACTICE_EXAMPLE_NAME,
  PRACTICE_TASK_NAME,
  type TutorialStep
} from "./tutorialTypes";

/**
 * Interactive builder guide that only uses sidebar controls.
 * Canvas clicks are unreliable under driver.js + React Flow, so we
 * auto-select the practice node and offer a reconnect button instead.
 */
export const builderPracticeSteps: TutorialStep[] = [
  {
    element: '[data-tutorial="builder-examples"]',
    title: {
      en: "1. Load RDF Base",
      de: "1. RDF Base laden"
    },
    description: {
      en: `Open the menu and select “${PRACTICE_EXAMPLE_NAME}”. The tour continues only after that example is on the canvas.`,
      de: `Oeffne das Menue und waehle „${PRACTICE_EXAMPLE_NAME}“. Die Tour geht erst weiter, wenn dieses Beispiel auf dem Canvas liegt.`
    },
    side: "right",
    advanceOn: {
      event: TUTORIAL_EVENTS.exampleLoaded,
      exampleId: PRACTICE_EXAMPLE_ID
    }
  },
  {
    element: '[data-tutorial="builder-remove-node"]',
    title: {
      en: "2. Remove fusion_first_value",
      de: "2. fusion_first_value entfernen"
    },
    description: {
      en: `“${PRACTICE_TASK_NAME}” is selected for you. Click Remove Selected Node. Its edges disappear — you will restore the task next.`,
      de: `„${PRACTICE_TASK_NAME}“ ist bereits ausgewaehlt. Klicke auf Remove Selected Node. Die Kanten verschwinden — als Naechstes setzt du den Task wieder ein.`
    },
    side: "right",
    selectTask: PRACTICE_TASK_NAME,
    advanceOn: {
      event: TUTORIAL_EVENTS.nodeRemoved,
      taskName: PRACTICE_TASK_NAME
    }
  },
  {
    element: `[data-tutorial-task="${PRACTICE_TASK_NAME}"]`,
    title: {
      en: "3. Add fusion_first_value again",
      de: "3. fusion_first_value wieder einfuegen"
    },
    description: {
      en: `The list is filtered to “${PRACTICE_TASK_NAME}”. Click + to place it back on the canvas.`,
      de: `Die Liste ist auf „${PRACTICE_TASK_NAME}“ gefiltert. Klicke +, um den Task wieder auf den Canvas zu setzen.`
    },
    side: "right",
    deferElement: true,
    focusTask: PRACTICE_TASK_NAME,
    advanceOn: {
      event: TUTORIAL_EVENTS.taskAdded,
      taskName: PRACTICE_TASK_NAME
    }
  },
  {
    element: '[data-tutorial="builder-reconnect"]',
    title: {
      en: "4. Reconnect the flow",
      de: "4. Datenfluss wieder verbinden"
    },
    description: {
      en: "Dragging on the canvas is blocked during the tour. Click Reconnect practice task to restore the fusion_first_value links.",
      de: "Ziehen auf dem Canvas ist waehrend der Tour blockiert. Klicke auf Reconnect practice task, um die fusion_first_value-Verbindungen wiederherzustellen."
    },
    side: "right",
    deferElement: true,
    advanceOn: { event: TUTORIAL_EVENTS.practiceReconnected }
  },
  {
    element: '[data-tutorial="builder-export"]',
    title: {
      en: "5. Export the config",
      de: "5. Config exportieren"
    },
    description: {
      en: "Click Export Pipeline Config to open the dialog. You can copy YAML or JSON for a runnable pipeline.conf.",
      de: "Klicke auf Export Pipeline Config, um den Dialog zu oeffnen. Dort kannst du YAML oder JSON fuer eine pipeline.conf kopieren."
    },
    side: "right",
    advanceOn: { event: TUTORIAL_EVENTS.exportOpened }
  },
  {
    element: '[data-tutorial="builder-export-modal"]',
    title: {
      en: "Done — review the export",
      de: "Fertig — Export pruefen"
    },
    description: {
      en: "Name the pipeline, switch YAML/JSON if needed, and copy the config or CLI command. Close the dialog when you are finished.",
      de: "Benenne die Pipeline, wechsle bei Bedarf zwischen YAML/JSON und kopiere Config oder CLI-Befehl. Schliesse den Dialog, wenn du fertig bist."
    },
    side: "left",
    deferElement: true
  }
];
