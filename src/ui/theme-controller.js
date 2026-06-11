"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_THEME_CONTROLLER = api;
  if (root.window && root.window !== root) {
    root.window.NE_THEME_CONTROLLER = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const DEFAULT_THEME_SEQUENCE = ["light", "dark", "eye"];
  const DEFAULT_THEME_LABELS = {
    light: "浅色",
    dark: "深色",
    eye: "护眼"
  };
  const THEME_STORAGE_KEY = "ne_ui_theme";

  function normalizeTheme(theme, themeSequence = DEFAULT_THEME_SEQUENCE) {
    return themeSequence.includes(theme) ? theme : "light";
  }

  function getNextTheme(theme, themeSequence = DEFAULT_THEME_SEQUENCE) {
    const current = normalizeTheme(theme, themeSequence);
    const index = themeSequence.indexOf(current);
    return themeSequence[(index + 1) % themeSequence.length];
  }

  function applyTheme(input = {}) {
    const {
      theme,
      appState = {},
      refs = {},
      documentRef = null,
      themeSequence = DEFAULT_THEME_SEQUENCE,
      themeLabels = DEFAULT_THEME_LABELS
    } = input;
    const targetTheme = normalizeTheme(theme, themeSequence);
    appState.theme = targetTheme;
    if (documentRef?.body) {
      documentRef.body.setAttribute("data-theme", targetTheme);
    }
    if (refs.themeToggleButton) {
      refs.themeToggleButton.textContent = `切换${themeLabels[getNextTheme(targetTheme, themeSequence)]}`;
    }
    if (refs.themeCurrentLabel) {
      refs.themeCurrentLabel.textContent = `当前：${themeLabels[targetTheme]}`;
    }
    return targetTheme;
  }

  function readSavedTheme(input = {}) {
    const {
      storageApi = null,
      storageArea = null,
      storageKey = THEME_STORAGE_KEY,
      onError = null
    } = input;
    if (!storageApi || typeof storageApi.readRawFromStorage !== "function") return null;
    return storageApi.readRawFromStorage(storageArea, storageKey, { onError });
  }

  function writeSavedTheme(input = {}) {
    const {
      theme,
      storageApi = null,
      storageArea = null,
      storageKey = THEME_STORAGE_KEY,
      onError = null
    } = input;
    if (!storageApi || typeof storageApi.writeRawToStorage !== "function") return false;
    return storageApi.writeRawToStorage(storageArea, storageKey, theme, { onError });
  }

  function initTheme(input = {}) {
    const saved = readSavedTheme(input);
    return applyTheme({
      ...input,
      theme: normalizeTheme(saved, input.themeSequence)
    });
  }

  function toggleTheme(input = {}) {
    const next = getNextTheme(input.appState?.theme, input.themeSequence);
    const applied = applyTheme({
      ...input,
      theme: next
    });
    writeSavedTheme({
      ...input,
      theme: applied
    });
    return applied;
  }

  return Object.freeze({
    normalizeTheme,
    getNextTheme,
    applyTheme,
    initTheme,
    toggleTheme,
    readSavedTheme,
    writeSavedTheme
  });
});
