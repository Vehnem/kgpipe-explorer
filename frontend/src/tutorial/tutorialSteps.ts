import type { TutorialPage, TutorialStep } from "./tutorialTypes";

export const tutorialStepsByPage: Record<TutorialPage, TutorialStep[]> = {
  builder: [
    {
      element: '[data-tutorial="app-tabs"]',
      title: "Bereiche wechseln",
      description:
        "Die Tabs fuehren zu Pipeline-Editor, Metadata Explorer, Ergebnissen und Leaderboard.",
      side: "bottom"
    },
    {
      element: '[data-tutorial="builder-sidebar"]',
      title: "Pipeline vorbereiten",
      description:
        "Links findest du Beispielpipelines, Daten-Elemente und Tasks, die du auf die Arbeitsflaeche bringen kannst.",
      side: "right"
    },
    {
      element: '[data-tutorial="builder-task-search"]',
      title: "Tasks finden",
      description:
        "Die Suche filtert nach Task-Namen sowie deklarierten Ein- und Ausgabeformaten.",
      side: "right"
    },
    {
      element: '[data-tutorial="builder-canvas"]',
      title: "Pipeline zeichnen",
      description:
        "Auf dem Canvas verbindest du Ausgaben mit Eingaben. Format-Mismatches werden direkt abgefangen.",
      side: "left"
    }
  ],
  explorer: [
    {
      element: '[data-tutorial="app-tabs"]',
      title: "Bereiche wechseln",
      description:
        "Die Tabs bleiben global sichtbar, damit du zwischen Exploration, Editor und Auswertung springen kannst.",
      side: "bottom"
    },
    {
      element: '[data-tutorial="explorer-query"]',
      title: "SPARQL-Abfragen",
      description:
        "Hier laedst du Beispielqueries, passt sie an und fuehrst sie gegen die KGpipe-Metadaten aus.",
      side: "right"
    },
    {
      element: '[data-tutorial="explorer-graph"]',
      title: "Graph verstehen",
      description:
        "Die Query-Ergebnisse werden als interaktiver Graph mit Layout- und Hoehensteuerung visualisiert.",
      side: "left"
    },
    {
      element: '[data-tutorial="explorer-entities"]',
      title: "Entitaeten durchsuchen",
      description:
        "Die Seitenleiste hilft beim Filtern von Tasks, Implementierungen, Metriken und Runs.",
      side: "right"
    },
    {
      element: '[data-tutorial="explorer-detail"]',
      title: "Details pruefen",
      description:
        "Unten rechts siehst du Details zur ausgewaehlten Entitaet oder die Query-Ergebnisse als Tabelle.",
      side: "top"
    }
  ],
  results: [
    {
      element: '[data-tutorial="results-pipelines"]',
      title: "Pipelines auswaehlen",
      description:
        "Waehle eine oder zwei Pipelines, um Metriken und Artefakte nebeneinander zu vergleichen.",
      side: "bottom"
    },
    {
      element: '[data-tutorial="results-metrics"]',
      title: "Metriken vergleichen",
      description:
        "Die Tabellen zeigen Summary- oder Stage-Werte und markieren Unterschiede zwischen zwei Pipelines.",
      side: "top"
    },
    {
      element: '[data-tutorial="results-artifacts"]',
      title: "Artefakte ansehen",
      description:
        "Hier findest du erzeugte Dateien und Run-Artefakte pro Pipeline und Stage.",
      side: "top"
    }
  ],
  leaderboard: [
    {
      element: '[data-tutorial="leaderboard-summary"]',
      title: "Ranking-Ueberblick",
      description:
        "Die Kennzahlen zeigen, wie viele Pipelines, Runs und Metriken gerade in das Ranking eingehen.",
      side: "bottom"
    },
    {
      element: '[data-tutorial="leaderboard-config"]',
      title: "Schema konfigurieren",
      description:
        "Links legst du Pipeline-Auswahl, Metrikgruppen, Gewichtungen und Aggregationen fest.",
      side: "right"
    },
    {
      element: '[data-tutorial="leaderboard-preview"]',
      title: "Ranking pruefen",
      description:
        "Rechts siehst du sofort, wie sich deine Einstellungen auf Rangfolge und Verteilungen auswirken.",
      side: "left"
    }
  ]
};
