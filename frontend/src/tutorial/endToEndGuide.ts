import { driver, type AllowedButtons, type Driver } from "driver.js";
import { TUTORIAL_EVENTS, type TutorialEventDetail } from "./tutorialEvents";
import type { TutorialAdvanceOn, TutorialLanguage, TutorialPage } from "./tutorialTypes";
import {
  PRACTICE_EXAMPLE_ID,
  PRACTICE_EXAMPLE_NAME,
  PRACTICE_LEADERBOARD_PIPELINES,
  PRACTICE_RESULTS_PIPELINE_A,
  PRACTICE_RESULTS_PIPELINE_B
} from "./tutorialTypes";

type EndToEndGuideStep = {
  page: TutorialPage;
  element: string;
  title: Record<TutorialLanguage, string>;
  summary: Record<TutorialLanguage, string>;
  details?: Record<TutorialLanguage, string>;
  side?: "top" | "right" | "bottom" | "left" | "over";
  align?: "start" | "center" | "end";
  advanceOn?: TutorialAdvanceOn;
};

type NavigateToPage = (page: TutorialPage) => void;

const endToEndSteps: EndToEndGuideStep[] = [
  {
    page: "learn",
    element: '[data-tutorial="learn-workflow"]',
    title: {
      en: "Start with one story",
      de: "Mit einer Story starten"
    },
    summary: {
      en: "We will follow one question: how can a Movie Knowledge Graph be built, and how can we judge whether one build recipe is better than another?",
      de: "Wir folgen einer Frage: Wie kann ein Movie Knowledge Graph gebaut werden, und woran erkennt man, ob eine Bauvariante besser ist als eine andere?"
    },
    details: {
      en: "A knowledge graph stores facts as connected entities and relationships. A KGpipe pipeline is the recipe that turns source data into that graph. This walkthrough follows the main workflow first: design, results, ranking, then metadata inspection for debugging.",
      de: "Ein Knowledge Graph speichert Fakten als verknuepfte Entitaeten und Beziehungen. Eine KGpipe-Pipeline ist das Rezept, das Quelldaten in diesen Graph ueberfuehrt. Dieser Walkthrough folgt zuerst dem Hauptworkflow: Design, Results, Ranking und danach Metadaten-Inspektion zum Debugging."
    },
    side: "bottom"
  },
  {
    page: "builder",
    element: '[data-tutorial="builder-examples"]',
    title: {
      en: `Load ${PRACTICE_EXAMPLE_NAME}`,
      de: `${PRACTICE_EXAMPLE_NAME} laden`
    },
    summary: {
      en: `Open the example menu and choose ${PRACTICE_EXAMPLE_NAME}. The guide continues after that example is loaded on the canvas.`,
      de: `Oeffne das Beispielmenue und waehle ${PRACTICE_EXAMPLE_NAME}. Der Guide geht weiter, sobald dieses Beispiel auf dem Canvas liegt.`
    },
    details: {
      en: "Think of RDF Base as a compact Movie-KG recipe: source RDF plus seed KG, matching, fusion, type inference, and final KG output. It is not the only possible recipe; it is a readable starting point.",
      de: "Stell dir RDF Base als kompaktes Movie-KG-Rezept vor: Source RDF plus Seed KG, Matching, Fusion, Type Inference und finaler KG-Output. Es ist nicht das einzige moegliche Rezept, sondern ein gut lesbarer Startpunkt."
    },
    side: "right",
    advanceOn: {
      event: TUTORIAL_EVENTS.exampleLoaded,
      exampleId: PRACTICE_EXAMPLE_ID
    }
  },
  {
    page: "builder",
    element: '[data-tutorial="builder-canvas"]',
    title: {
      en: "Read the build recipe",
      de: "Das Bau-Rezept lesen"
    },
    summary: {
      en: "Read the canvas left to right. Data nodes are ingredients, task nodes are processing steps, and edges show which artifact flows into which step.",
      de: "Lies den Canvas von links nach rechts. Data Nodes sind Zutaten, Task Nodes sind Verarbeitungsschritte, und Kanten zeigen, welches Artefakt in welchen Schritt fliesst."
    },
    details: {
      en: "Different task choices can build different KGs from similar input data. That is why the pipeline is a modelling decision: it shapes what entities, links, and inferred facts may appear in the final graph.",
      de: "Unterschiedliche Task-Auswahl kann aus aehnlichen Daten unterschiedliche KGs bauen. Darum ist die Pipeline eine Modellierungsentscheidung: Sie beeinflusst, welche Entitaeten, Links und abgeleiteten Fakten im finalen Graph landen."
    },
    side: "left"
  },
  {
    page: "builder",
    element: '[data-tutorial="builder-export"]',
    title: {
      en: "Export the runnable config",
      de: "Ausfuehrbare Config exportieren"
    },
    summary: {
      en: "Click Export Pipeline Config. This turns the visual recipe into a KGpipe configuration. The guide continues when the export dialog opens.",
      de: "Klicke auf Export Pipeline Config. Dadurch wird aus dem visuellen Rezept eine KGpipe-Konfiguration. Der Guide geht weiter, sobald der Export-Dialog offen ist."
    },
    details: {
      en: "The browser demo designs and exports. It does not execute new pipelines itself. The next pages inspect prepared run data from pipeline variants so you can see how design choices show up in metrics and artifacts.",
      de: "Die Browser-Demo entwirft und exportiert. Sie fuehrt keine neuen Pipelines selbst aus. Die naechsten Seiten zeigen vorbereitete Run-Daten von Pipeline-Varianten, damit du siehst, wie Designentscheidungen in Metriken und Artefakten sichtbar werden."
    },
    side: "right",
    advanceOn: { event: TUTORIAL_EVENTS.exportOpened }
  },
  {
    page: "results",
    element: '[data-tutorial="results-pipelines"]',
    title: {
      en: "Compare two pipeline runs",
      de: "Zwei Pipeline-Runs vergleichen"
    },
    summary: {
      en: `Select ${PRACTICE_RESULTS_PIPELINE_A} and ${PRACTICE_RESULTS_PIPELINE_B}. These are prepared variants of the same KG-building problem.`,
      de: `Waehle ${PRACTICE_RESULTS_PIPELINE_A} und ${PRACTICE_RESULTS_PIPELINE_B}. Das sind vorbereitete Varianten derselben KG-Building-Aufgabe.`
    },
    details: {
      en: "R_A and R_B are short demo labels, not domain concepts. Treat them like two recipes for the same dish: both try to build a Movie KG, but their steps may capture entities, links, and facts differently.",
      de: "R_A und R_B sind kurze Demo-Labels, keine Fachbegriffe. Stell sie dir wie zwei Rezepte fuer dasselbe Gericht vor: Beide bauen einen Movie KG, aber ihre Schritte koennen Entitaeten, Links und Fakten unterschiedlich erfassen."
    },
    side: "bottom",
    advanceOn: {
      event: TUTORIAL_EVENTS.pipelinesSelected,
      requirePipelines: [PRACTICE_RESULTS_PIPELINE_A, PRACTICE_RESULTS_PIPELINE_B]
    }
  },
  {
    page: "results",
    element: '[data-tutorial="results-artifacts"]',
    title: {
      en: "Connect metrics to outputs",
      de: "Metriken mit Outputs verbinden"
    },
    summary: {
      en: "Results are evidence. Metrics summarize quality signals, while artifacts are the concrete files produced by pipeline stages.",
      de: "Results sind Evidenz. Metriken fassen Qualitaetssignale zusammen, waehrend Artefakte die konkreten Dateien aus Pipeline-Stages sind."
    },
    details: {
      en: "A pipeline can be better at coverage, accuracy, consistency, or robustness. Artifacts such as candidate matches, logs, RDF dumps, and final graph outputs help explain where a metric value came from.",
      de: "Eine Pipeline kann besser bei Coverage, Accuracy, Konsistenz oder Robustheit sein. Artefakte wie Kandidaten-Matches, Logs, RDF-Dumps und finale Graph-Outputs helfen zu verstehen, woher ein Metrikwert kommt."
    },
    side: "top"
  },
  {
    page: "leaderboard",
    element: '[data-tutorial="leaderboard-pipelines"]',
    title: {
      en: "Compare variants fairly",
      de: "Varianten fair vergleichen"
    },
    summary: {
      en: `Use the RDF variants (${PRACTICE_LEADERBOARD_PIPELINES.join(", ")}) as the comparison set. The goal is to compare recipes for the same KG-building problem.`,
      de: `Nutze die RDF-Varianten (${PRACTICE_LEADERBOARD_PIPELINES.join(", ")}) als Vergleichsset. Ziel ist, Rezepte fuer dieselbe KG-Building-Aufgabe zu vergleichen.`
    },
    details: {
      en: "A leaderboard is a model of priorities. It groups many metric columns into concerns such as accuracy and coverage, then uses aggregators and weights to turn them into a final ranking.",
      de: "Ein Leaderboard ist ein Prioritaetenmodell. Es gruppiert viele Metrikspalten nach Zielen wie Accuracy und Coverage und nutzt Aggregatoren und Gewichte, um daraus ein finales Ranking zu bilden."
    },
    side: "right"
  },
  {
    page: "leaderboard",
    element: '[data-tutorial="leaderboard-preview-distribution"]',
    title: {
      en: "Check ranking robustness",
      de: "Ranking-Robustheit pruefen"
    },
    summary: {
      en: "Click Distribution. This view helps you see whether a pipeline ranks well across many possible weight settings.",
      de: "Klicke auf Distribution. Diese Ansicht zeigt, ob eine Pipeline ueber viele moegliche Gewichtungen hinweg gut rankt."
    },
    details: {
      en: "A single final score can hide trade-offs. One pipeline may cover more data, while another may be more precise. Distribution makes that uncertainty visible instead of pretending there is only one obvious winner.",
      de: "Ein einzelner Final Score kann Trade-offs verdecken. Eine Pipeline deckt vielleicht mehr Daten ab, eine andere ist praeziser. Distribution macht diese Unsicherheit sichtbar, statt so zu tun, als gaebe es nur einen offensichtlichen Gewinner."
    },
    side: "bottom",
    advanceOn: {
      event: TUTORIAL_EVENTS.previewModeChanged,
      previewMode: "distribution"
    }
  },
  {
    page: "leaderboard",
    element: '[data-tutorial="leaderboard-preview"]',
    title: {
      en: "Inspect metadata when needed",
      de: "Metadaten bei Bedarf pruefen"
    },
    summary: {
      en: "The main workflow is complete. Next, the guide opens Metadata Explorer, which is useful when you want to inspect the underlying KGpipe concepts behind the demo.",
      de: "Der Hauptworkflow ist abgeschlossen. Als Naechstes oeffnet der Guide den Metadata Explorer; er hilft, wenn du die KGpipe-Konzepte hinter der Demo genauer pruefen willst."
    },
    details: {
      en: "Metadata is data about the system itself: tasks, formats, methods, tools, metrics, and their relationships. It is not the Movie KG output; it is the map that explains which pipeline components exist and how they can fit together.",
      de: "Metadaten sind Daten ueber das System selbst: Tasks, Formate, Methoden, Tools, Metriken und ihre Beziehungen. Das ist nicht der Movie-KG-Output, sondern die Karte, die erklaert, welche Pipeline-Komponenten existieren und wie sie zusammenpassen koennen."
    },
    side: "left"
  },
  {
    page: "explorer",
    element: '[data-tutorial="explorer-graph"]',
    title: {
      en: "Read KGpipe as a graph",
      de: "KGpipe als Graph lesen"
    },
    summary: {
      en: "Here you can inspect KGpipe's own system knowledge graph: tasks, implementations, metrics, runs, and how they relate.",
      de: "Hier kannst du den System-Knowledge-Graph von KGpipe inspizieren: Tasks, Implementierungen, Metriken, Runs und ihre Beziehungen."
    },
    details: {
      en: "Use this view when the workflow raises deeper questions: Which task produces which format? Which metric describes which kind of quality? Which implementation belongs to which method?",
      de: "Nutze diese Ansicht, wenn im Workflow tiefere Fragen entstehen: Welcher Task produziert welches Format? Welche Metrik beschreibt welche Qualitaet? Welche Implementierung gehoert zu welcher Methode?"
    },
    side: "left"
  },
  {
    page: "explorer",
    element: '[data-tutorial="explorer-graph"]',
    title: {
      en: "One workflow, five views",
      de: "Ein Workflow, fuenf Ansichten"
    },
    summary: {
      en: "You followed the core demo logic: the editor designs a KG-building recipe, results show evidence, the leaderboard compares variants, and metadata explains the underlying pieces.",
      de: "Du hast die Kernlogik der Demo gesehen: Der Editor entwirft ein KG-Building-Rezept, Results zeigen Evidenz, das Leaderboard vergleicht Varianten, und Metadaten erklaeren die Bausteine darunter."
    },
    details: {
      en: "That is the intended mental model: KG building is iterative. You choose a pipeline, run it externally, inspect outputs and metrics, then adjust the recipe or the ranking priorities.",
      de: "Das ist das gewollte mentale Modell: KG-Building ist iterativ. Du waehlst eine Pipeline, fuehrst sie extern aus, pruefst Outputs und Metriken und passt danach Rezept oder Ranking-Prioritaeten an."
    },
    side: "left"
  }
];

export function startEndToEndGuide(language: TutorialLanguage, navigateToPage: NavigateToPage): void {
  const guide = new EndToEndGuide(language, navigateToPage);
  guide.start();
}

class EndToEndGuide {
  private activeDriver: Driver | null = null;
  private cleanupActionListener: (() => void) | null = null;
  private index = 0;

  constructor(
    private readonly language: TutorialLanguage,
    private readonly navigateToPage: NavigateToPage
  ) {}

  start(): void {
    this.showStep(0);
  }

  private showStep(index: number): void {
    this.cleanup();
    const step = endToEndSteps[index];
    if (!step) return;
    this.index = index;
    this.navigateToPage(step.page);
    this.waitForElement(step.element, () => this.driveStep(step));
  }

  private driveStep(step: EndToEndGuideStep): void {
    const element = document.querySelector(step.element);
    element?.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });

    const isLast = this.index === endToEndSteps.length - 1;
    const waitsForAction = Boolean(step.advanceOn);
    const buttons = waitsForAction
      ? (["close"] as AllowedButtons[])
      : isLast
        ? (["close"] as AllowedButtons[])
        : (["next", "close"] as AllowedButtons[]);

    this.activeDriver = driver({
      animate: true,
      allowClose: true,
      allowKeyboardControl: true,
      disableActiveInteraction: false,
      overlayClickBehavior: "close",
      overlayOpacity: 0.55,
      popoverClass: "kgpipe-tutorial-popover kgpipe-end-to-end-popover",
      showButtons: buttons,
      showProgress: false,
      stagePadding: 8,
      stageRadius: 10,
      nextBtnText: this.language === "en" ? "Next" : "Weiter",
      doneBtnText: this.language === "en" ? "Done" : "Fertig",
      onDestroyed: () => this.cleanupAction(),
      steps: [
        {
          element: step.element,
          popover: {
            title: this.stepTitle(step),
            description: this.description(step),
            side: step.side ?? "bottom",
            align: step.align ?? "center",
            onNextClick: () => this.showStep(this.index + 1)
          }
        }
      ]
    });

    if (step.advanceOn) {
      const onAction = (event: Event) => {
        if (!eventMatches(step.advanceOn!, event)) return;
        this.cleanupAction();
        window.setTimeout(() => this.showStep(this.index + 1), 250);
      };
      window.addEventListener(step.advanceOn.event, onAction);
      this.cleanupActionListener = () => window.removeEventListener(step.advanceOn!.event, onAction);
    }

    this.activeDriver.drive();
    window.setTimeout(() => this.activeDriver?.refresh(), 100);
    window.setTimeout(() => this.activeDriver?.refresh(), 350);
  }

  private waitForElement(selector: string, onReady: () => void, attempt = 0): void {
    if (document.querySelector(selector)) {
      onReady();
      return;
    }
    if (attempt > 40) return;
    window.setTimeout(() => this.waitForElement(selector, onReady, attempt + 1), 100);
  }

  private stepTitle(step: EndToEndGuideStep): string {
    return `${this.index + 1}/${endToEndSteps.length} - ${step.title[this.language]}`;
  }

  private description(step: EndToEndGuideStep): string {
    const summary = `<p>${escapeHtml(step.summary[this.language])}</p>`;
    const details = step.details
      ? `<details><summary>${this.language === "en" ? "More context" : "Mehr Kontext"}</summary><p>${escapeHtml(step.details[this.language])}</p></details>`
      : "";
    const actionHint = step.advanceOn ? `<p class="tutorial-action-hint">${this.actionHint()}</p>` : "";
    return `${summary}${details}${actionHint}`;
  }

  private actionHint(): string {
    return this.language === "en"
      ? "Use the highlighted action to continue; the guide advances automatically."
      : "Nutze die hervorgehobene Aktion, um fortzufahren; der Guide springt automatisch weiter.";
  }

  private cleanup(): void {
    this.cleanupAction();
    this.activeDriver?.destroy();
    this.activeDriver = null;
  }

  private cleanupAction(): void {
    this.cleanupActionListener?.();
    this.cleanupActionListener = null;
  }
}

function eventMatches(advanceOn: TutorialAdvanceOn, event: Event): boolean {
  const detail = (event as CustomEvent<TutorialEventDetail>).detail ?? {};
  if (advanceOn.exampleId !== undefined && detail.exampleId !== advanceOn.exampleId) return false;
  if (advanceOn.taskName !== undefined && detail.taskName !== advanceOn.taskName) return false;
  if (advanceOn.dataTab !== undefined && detail.dataTab !== advanceOn.dataTab) return false;
  if (advanceOn.previewMode !== undefined && detail.previewMode !== advanceOn.previewMode) return false;
  if (advanceOn.requirePipelines) {
    const selected = detail.pipelines ?? [];
    if (!advanceOn.requirePipelines.every((id) => selected.includes(id))) return false;
  }
  if (advanceOn.requireGroups) {
    const groupIds = detail.groupIds ?? [];
    if (!advanceOn.requireGroups.every((id) => groupIds.includes(id))) return false;
  }
  return true;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
