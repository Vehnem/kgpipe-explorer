import type { TutorialPage, TutorialStep } from "./tutorialTypes";

export const tutorialStepsByPage: Record<TutorialPage, TutorialStep[]> = {
  builder: [
    {
      element: '[data-tutorial="app-tabs"]',
      title: {
        en: "Main areas",
        de: "Hauptbereiche"
      },
      description: {
        en: "Use the tabs to move between learning, metadata exploration, pipeline design, results, and rankings.",
        de: "Nutze die Tabs, um zwischen Lernen, Metadaten-Exploration, Pipeline-Design, Ergebnissen und Rankings zu wechseln."
      },
      side: "bottom"
    },
    {
      element: '[data-tutorial="builder-sidebar"]',
      title: {
        en: "Build from data and tasks",
        de: "Aus Daten und Tasks bauen"
      },
      description: {
        en: "A pipeline is a directed chain of processing steps. Sources provide data, tasks transform it, and sinks collect results such as a final knowledge graph.",
        de: "Eine Pipeline ist eine gerichtete Kette von Verarbeitungsschritten. Quellen liefern Daten, Tasks transformieren sie, und Senken sammeln Ergebnisse wie einen finalen Knowledge Graph."
      },
      side: "right"
    },
    {
      element: '[data-tutorial="builder-task-search"]',
      title: {
        en: "Find compatible tasks",
        de: "Kompatible Tasks finden"
      },
      description: {
        en: "Tasks declare input and output formats. In KG workflows this matters because text, JSON, RDF, and Turtle cannot always be connected directly.",
        de: "Tasks deklarieren Eingabe- und Ausgabeformate. In KG-Workflows ist das wichtig, weil Text, JSON, RDF und Turtle nicht immer direkt verbunden werden koennen."
      },
      side: "right"
    },
    {
      element: '[data-tutorial="builder-canvas"]',
      title: {
        en: "Draw the data flow",
        de: "Datenfluss zeichnen"
      },
      description: {
        en: "The canvas is a DAG sketch: data flows from sources through tasks to outputs. Connections should match formats so every step can consume what the previous step produced.",
        de: "Der Canvas ist eine DAG-Skizze: Daten fliessen von Quellen durch Tasks zu Outputs. Verbindungen sollten Formate matchen, damit jeder Schritt die Ausgabe des vorherigen Schritts nutzen kann."
      },
      side: "left"
    }
  ],
  explorer: [
    {
      element: '[data-tutorial="app-tabs"]',
      title: {
        en: "Where you are",
        de: "Wo du bist"
      },
      description: {
        en: "The Metadata Explorer is the graph view of KGpipe knowledge: tasks, implementations, metrics, runs, and their relationships.",
        de: "Der Metadata Explorer ist die Graph-Ansicht des KGpipe-Wissens: Tasks, Implementierungen, Metriken, Runs und ihre Beziehungen."
      },
      side: "bottom"
    },
    {
      element: '[data-tutorial="explorer-query"]',
      title: {
        en: "Ask graph-shaped questions",
        de: "Graph-Fragen stellen"
      },
      description: {
        en: "SPARQL is the query language for RDF knowledge graphs. Instead of rows and columns, it searches for graph patterns such as task -> produces -> format.",
        de: "SPARQL ist die Abfragesprache fuer RDF Knowledge Graphs. Statt Zeilen und Spalten sucht sie Graph-Muster wie Task -> produziert -> Format."
      },
      side: "right"
    },
    {
      element: '[data-tutorial="explorer-graph"]',
      title: {
        en: "Read triples visually",
        de: "Triples visuell lesen"
      },
      description: {
        en: "Each edge represents a statement: subject, predicate, object. For example, a task can use a tool or produce a data format.",
        de: "Jede Kante repraesentiert eine Aussage: Subjekt, Praedikat, Objekt. Zum Beispiel kann ein Task ein Tool nutzen oder ein Datenformat erzeugen."
      },
      side: "left"
    },
    {
      element: '[data-tutorial="explorer-entities"]',
      title: {
        en: "Filter entities",
        de: "Entitaeten filtern"
      },
      description: {
        en: "Entities are the things in a knowledge graph. Here they can be tasks, implementations, metrics, metric runs, or other KGpipe concepts.",
        de: "Entitaeten sind die Dinge in einem Knowledge Graph. Hier koennen das Tasks, Implementierungen, Metriken, Metrik-Runs oder andere KGpipe-Konzepte sein."
      },
      side: "right"
    },
    {
      element: '[data-tutorial="explorer-detail"]',
      title: {
        en: "Inspect meaning",
        de: "Bedeutung pruefen"
      },
      description: {
        en: "Details help translate graph structure into meaning: what an entity is, what it consumes, what it produces, and how it relates to the pipeline ecosystem.",
        de: "Details uebersetzen Graph-Struktur in Bedeutung: was eine Entitaet ist, was sie konsumiert, was sie produziert und wie sie mit dem Pipeline-Oekosystem zusammenhaengt."
      },
      side: "top"
    }
  ],
  results: [
    {
      element: '[data-tutorial="results-pipelines"]',
      title: {
        en: "Choose runs to compare",
        de: "Runs zum Vergleich waehlen"
      },
      description: {
        en: "Pipeline results connect graph-building decisions to measurable outcomes. Select one or two pipelines to compare their behavior.",
        de: "Pipeline Results verbinden Graph-Building-Entscheidungen mit messbaren Ergebnissen. Waehle eine oder zwei Pipelines zum Vergleich."
      },
      side: "bottom"
    },
    {
      element: '[data-tutorial="results-metrics"]',
      title: {
        en: "Read metrics as evidence",
        de: "Metriken als Evidenz lesen"
      },
      description: {
        en: "Metrics summarize quality signals such as coverage, consistency, or accuracy. They are not the graph itself, but evidence about how well a pipeline performed.",
        de: "Metriken fassen Qualitaetssignale wie Coverage, Konsistenz oder Genauigkeit zusammen. Sie sind nicht der Graph selbst, sondern Evidenz zur Pipeline-Leistung."
      },
      side: "top"
    },
    {
      element: '[data-tutorial="results-artifacts"]',
      title: {
        en: "Inspect artifacts",
        de: "Artefakte pruefen"
      },
      description: {
        en: "Artifacts are files produced by pipeline stages: candidate tables, logs, triple dumps, evaluation reports, or final KG serializations.",
        de: "Artefakte sind Dateien aus Pipeline-Stages: Kandidatentabellen, Logs, Triple-Dumps, Evaluationsberichte oder finale KG-Serialisierungen."
      },
      side: "top"
    }
  ],
  leaderboard: [
    {
      element: '[data-tutorial="leaderboard-summary"]',
      title: {
        en: "Ranking is a model",
        de: "Ranking ist ein Modell"
      },
      description: {
        en: "A leaderboard turns many measurements into one ordering. That ordering depends on selected metrics, groups, aggregators, and weights.",
        de: "Ein Leaderboard macht aus vielen Messwerten eine Rangfolge. Diese Rangfolge haengt von Metriken, Gruppen, Aggregatoren und Gewichten ab."
      },
      side: "bottom"
    },
    {
      element: '[data-tutorial="leaderboard-config"]',
      title: {
        en: "Define priorities",
        de: "Prioritaeten definieren"
      },
      description: {
        en: "Metric groups express what you care about, for example coverage, accuracy, or consistency. Weights decide which concerns matter more.",
        de: "Metrikgruppen zeigen, was wichtig ist, zum Beispiel Coverage, Accuracy oder Konsistenz. Gewichte entscheiden, welche Ziele staerker zaehlen."
      },
      side: "right"
    },
    {
      element: '[data-tutorial="leaderboard-preview"]',
      title: {
        en: "Check robustness",
        de: "Robustheit pruefen"
      },
      description: {
        en: "The preview shows whether a pipeline wins consistently or only under a specific weighting. This helps avoid over-interpreting a single score.",
        de: "Die Vorschau zeigt, ob eine Pipeline stabil gewinnt oder nur bei bestimmten Gewichtungen. Das hilft, einzelne Scores nicht zu ueberinterpretieren."
      },
      side: "left"
    }
  ],
  learn: [
    {
      element: '[data-tutorial="learn-workflow"]',
      title: {
        en: "Start with the workflow",
        de: "Mit dem Workflow starten"
      },
      description: {
        en: "Use the workflow cards to jump into the main features: inspect metadata, sketch a pipeline, compare outputs, and reason about rankings.",
        de: "Nutze die Workflow-Karten, um die Hauptfunktionen zu entdecken: Metadaten ansehen, Pipeline skizzieren, Outputs vergleichen und Rankings bewerten."
      },
      side: "bottom"
    },
    {
      element: '[data-tutorial="learn-basics"]',
      title: {
        en: "Then review the concepts",
        de: "Danach die Konzepte nachlesen"
      },
      description: {
        en: "Below the workflow, the Learn page explains knowledge graphs, triples, RDF, SPARQL, pipelines, metrics, and how those ideas connect in KGpipe Explorer.",
        de: "Unter dem Workflow erklaert die Learn-Seite Knowledge Graphs, Triples, RDF, SPARQL, Pipelines, Metriken und wie diese Ideen im KGpipe Explorer zusammenhaengen."
      },
      side: "top"
    }
  ]
};
