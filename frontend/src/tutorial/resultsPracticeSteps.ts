import { TUTORIAL_EVENTS } from "./tutorialEvents";
import {
  PRACTICE_RESULTS_PIPELINE_A,
  PRACTICE_RESULTS_PIPELINE_B,
  type TutorialStep
} from "./tutorialTypes";

/** Interactive results guide: pick R_A + R_B → artifacts → data view → run query. */
export const resultsPracticeSteps: TutorialStep[] = [
  {
    element: `[data-tutorial-pipeline="${PRACTICE_RESULTS_PIPELINE_A}"]`,
    title: {
      en: "1. Select pipeline R_A",
      de: "1. Pipeline R_A waehlen"
    },
    description: {
      en: "Click R_A to choose the first pipeline for comparison. Results stay empty until at least one pipeline is selected.",
      de: "Klicke auf R_A, um die erste Pipeline fuer den Vergleich zu waehlen. Ergebnisse bleiben leer, bis mindestens eine Pipeline ausgewaehlt ist."
    },
    side: "bottom",
    deferElement: true,
    advanceOn: {
      event: TUTORIAL_EVENTS.pipelinesSelected,
      requirePipelines: [PRACTICE_RESULTS_PIPELINE_A]
    }
  },
  {
    element: `[data-tutorial-pipeline="${PRACTICE_RESULTS_PIPELINE_B}"]`,
    title: {
      en: "2. Select pipeline R_B",
      de: "2. Pipeline R_B waehlen"
    },
    description: {
      en: "Click R_B as the second pipeline. You can compare up to two runs side by side.",
      de: "Klicke auf R_B als zweite Pipeline. Du kannst bis zu zwei Runs nebeneinander vergleichen."
    },
    side: "bottom",
    deferElement: true,
    advanceOn: {
      event: TUTORIAL_EVENTS.pipelinesSelected,
      requirePipelines: [PRACTICE_RESULTS_PIPELINE_A, PRACTICE_RESULTS_PIPELINE_B]
    }
  },
  {
    element: '[data-tutorial="results-artifacts"]',
    title: {
      en: "3. Inspect data artifacts",
      de: "3. Data Artifacts ansehen"
    },
    description: {
      en: "Data Artifacts lists output files per stage for each selected pipeline — candidate tables, logs, RDF dumps, and similar run products. This is evidence of what each stage produced.",
      de: "Data Artifacts listet Ausgabedateien pro Stage fuer jede ausgewaehlte Pipeline — Kandidatentabellen, Logs, RDF-Dumps und aehnliche Run-Produkte. Das ist Evidenz dafuer, was jede Stage erzeugt hat."
    },
    side: "top",
    deferElement: true
  },
  {
    element: '[data-tutorial="results-dataview-tab"]',
    title: {
      en: "4. Open Data View",
      de: "4. Data View oeffnen"
    },
    description: {
      en: "Switch to Data View to query the final knowledge graphs of the selected pipelines with the same SPARQL query.",
      de: "Wechsle zu Data View, um die finalen Knowledge Graphs der ausgewaehlten Pipelines mit derselben SPARQL-Query abzufragen."
    },
    side: "bottom",
    deferElement: true,
    advanceOn: {
      event: TUTORIAL_EVENTS.dataTabChanged,
      dataTab: "dataview"
    }
  },
  {
    element: '[data-tutorial="results-run-query"]',
    title: {
      en: "5. Run the query",
      de: "5. Query ausfuehren"
    },
    description: {
      en: "Click Run Query to execute the SPARQL against each selected final KG. Result tables (and later graphs) appear below per pipeline.",
      de: "Klicke auf Run Query, um die SPARQL-Query gegen jeden ausgewaehlten finalen KG auszufuehren. Ergebnistabellen (spaeter auch Graphen) erscheinen darunter pro Pipeline."
    },
    side: "top",
    deferElement: true,
    advanceOn: { event: TUTORIAL_EVENTS.queryRan }
  },
  {
    element: '[data-tutorial="results-dataview"]',
    title: {
      en: "Done — compare the outputs",
      de: "Fertig — Ausgaben vergleichen"
    },
    description: {
      en: "You selected two pipelines, reviewed their artifacts, and ran a shared query in Data View. Use this flow whenever you want to compare how pipeline choices show up in the final graphs.",
      de: "Du hast zwei Pipelines gewaehlt, ihre Artifacts angesehen und eine gemeinsame Query in Data View ausgefuehrt. Nutze diesen Ablauf, wenn du Pipeline-Unterschiede in den finalen Graphen vergleichen willst."
    },
    side: "top",
    deferElement: true
  }
];
