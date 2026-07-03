import type { TutorialLanguage } from "./tutorialTypes";

const LANGUAGE_KEY = "kgpipe-tutorial-language";

export function getStoredTutorialLanguage(): TutorialLanguage {
  const value = window.localStorage.getItem(LANGUAGE_KEY);
  return value === "de" ? "de" : "en";
}

export function storeTutorialLanguage(language: TutorialLanguage): void {
  window.localStorage.setItem(LANGUAGE_KEY, language);
}
