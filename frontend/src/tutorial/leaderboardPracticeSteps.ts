import { TUTORIAL_EVENTS } from "./tutorialEvents";
import {
  PRACTICE_LEADERBOARD_GROUP_ACCURACY,
  PRACTICE_LEADERBOARD_GROUP_COVERAGE,
  PRACTICE_LEADERBOARD_PIPELINES,
  type TutorialStep
} from "./tutorialTypes";

/**
 * Leaderboard practice guide:
 * reset → select RDF pipelines → restore Accuracy + Coverage → assign metrics → Figure view.
 */
export const leaderboardPracticeSteps: TutorialStep[] = [
  {
    element: '[data-tutorial="leaderboard-pipelines"]',
    title: {
      en: "1. Select the RDF pipelines",
      de: "1. RDF-Pipelines waehlen"
    },
    description: {
      en: "Pipelines and subgroups were cleared for this practice. Check R_A, R_B, and R_C — the three RDF variants — to continue.",
      de: "Pipelines und Subgroups wurden fuer diese Uebung geleert. Aktiviere R_A, R_B und R_C — die drei RDF-Varianten —, um fortzufahren."
    },
    side: "right",
    deferElement: true,
    advanceOn: {
      event: TUTORIAL_EVENTS.pipelinesSelected,
      requirePipelines: [...PRACTICE_LEADERBOARD_PIPELINES]
    }
  },
  {
    element: '[data-tutorial="leaderboard-add-accuracy"]',
    title: {
      en: "2. Re-add Accuracy (correctness)",
      de: "2. Accuracy (Correctness) wieder hinzufuegen"
    },
    description: {
      en: "In the practice actions bar, click Add Accuracy subgroup. This correctness-oriented group will hold metrics such as ACC_T.",
      de: "In der Practice-Actions-Leiste auf Add Accuracy subgroup klicken. Diese Correctness-Gruppe nimmt Metriken wie ACC_T auf."
    },
    side: "bottom",
    align: "start",
    deferElement: true,
    advanceOn: {
      event: TUTORIAL_EVENTS.groupsChanged,
      requireGroups: [PRACTICE_LEADERBOARD_GROUP_ACCURACY]
    }
  },
  {
    element: '[data-tutorial="leaderboard-add-coverage"]',
    title: {
      en: "3. Re-add Coverage",
      de: "3. Coverage wieder hinzufuegen"
    },
    description: {
      en: "Still in the practice actions bar, click Add Coverage subgroup. Coverage metrics (COV_*) will be assigned next.",
      de: "Weiter in der Practice-Actions-Leiste auf Add Coverage subgroup klicken. Coverage-Metriken (COV_*) folgen als Naechstes."
    },
    side: "bottom",
    align: "start",
    deferElement: true,
    advanceOn: {
      event: TUTORIAL_EVENTS.groupsChanged,
      requireGroups: [
        PRACTICE_LEADERBOARD_GROUP_ACCURACY,
        PRACTICE_LEADERBOARD_GROUP_COVERAGE
      ]
    }
  },
  {
    element: '[data-tutorial="leaderboard-restore-metrics"]',
    title: {
      en: "4. Assign metrics to the groups",
      de: "4. Metriken den Gruppen zuordnen"
    },
    description: {
      en: "Click Assign metrics to subgroups to map Accuracy and Coverage metrics back onto the groups you just created.",
      de: "Klicke auf Assign metrics to subgroups, um Accuracy- und Coverage-Metriken wieder den eben erstellten Gruppen zuzuordnen."
    },
    side: "bottom",
    align: "start",
    deferElement: true,
    advanceOn: { event: TUTORIAL_EVENTS.metricsAssigned }
  },
  {
    element: '[data-tutorial="leaderboard-preview-distribution"]',
    title: {
      en: "5. Open the distribution view",
      de: "5. Distribution-Ansicht oeffnen"
    },
    description: {
      en: "Click Distribution in the rank preview. This shows how often each pipeline lands at each rank across weight permutations.",
      de: "Klicke in der Rank-Vorschau auf Distribution. So siehst du, wie oft jede Pipeline bei Gewichtungs-Permutationen auf welchem Rang landet."
    },
    side: "bottom",
    align: "center",
    deferElement: true,
    advanceOn: {
      event: TUTORIAL_EVENTS.previewModeChanged,
      previewMode: "distribution"
    }
  },
  {
    element: '[data-tutorial="leaderboard-preview"]',
    title: {
      en: "Done — read the distribution",
      de: "Fertig — Distribution lesen"
    },
    description: {
      en: "You rebuilt a focused RDF leaderboard: three pipelines, Accuracy + Coverage subgroups, restored metrics, and the distribution preview. Try changing weights next to see ranks move.",
      de: "Du hast ein fokussiertes RDF-Leaderboard gebaut: drei Pipelines, Accuracy- und Coverage-Subgroups, wieder zugewiesene Metriken und die Distribution-Vorschau. Aendere als Naechstes Gewichte und beobachte die Raenge."
    },
    side: "left"
  }
];
