"use strict";

const assert = require("node:assert/strict");
const themeController = require("../src/ui/theme-controller");

assert.equal(themeController.normalizeTheme("dark"), "dark");
assert.equal(themeController.normalizeTheme("unknown"), "light");
assert.equal(themeController.getNextTheme("light"), "dark");
assert.equal(themeController.getNextTheme("eye"), "light");

const appState = { theme: "light" };
const bodyAttrs = {};
const documentRef = {
  body: {
    setAttribute(name, value) {
      bodyAttrs[name] = value;
    }
  }
};
const refs = {
  themeToggleButton: { textContent: "" },
  themeCurrentLabel: { textContent: "" }
};

const applied = themeController.applyTheme({
  theme: "dark",
  appState,
  refs,
  documentRef,
  themeSequence: ["light", "dark", "eye"],
  themeLabels: {
    light: "浅色",
    dark: "深色",
    eye: "护眼"
  }
});

assert.equal(applied, "dark");
assert.equal(appState.theme, "dark");
assert.equal(bodyAttrs["data-theme"], "dark");
assert.equal(refs.themeToggleButton.textContent, "切换护眼");
assert.equal(refs.themeCurrentLabel.textContent, "当前：深色");

const storageCalls = [];
const storageApi = {
  readRawFromStorage(area, key) {
    storageCalls.push(`read:${key}:${area.name}`);
    return "eye";
  },
  writeRawToStorage(area, key, value) {
    storageCalls.push(`write:${key}:${area.name}:${value}`);
    return true;
  }
};
const storageArea = { name: "local" };

const initialized = themeController.initTheme({
  appState,
  refs,
  documentRef,
  storageApi,
  storageArea
});

assert.equal(initialized, "eye");
assert.equal(appState.theme, "eye");
assert.equal(refs.themeToggleButton.textContent, "切换浅色");

const toggled = themeController.toggleTheme({
  appState,
  refs,
  documentRef,
  storageApi,
  storageArea
});

assert.equal(toggled, "light");
assert.equal(appState.theme, "light");
assert.deepEqual(storageCalls, [
  "read:ne_ui_theme:local",
  "write:ne_ui_theme:local:light"
]);

console.log("theme controller tests passed");
