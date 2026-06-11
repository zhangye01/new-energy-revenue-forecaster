"use strict";

const assert = require("node:assert/strict");
const {
  collectAppWindowGlobalsFromText,
  collectLoadedWindowGlobalExports,
  collectScriptSourcesFromHtml,
  collectTopLevelFunctionSizesFromText,
  collectStylesheetHrefsFromHtml,
  collectUnloadedCssFiles,
  collectWindowGlobalExportsFromText,
  findForbiddenAppPatternsFromText
} = require("../scripts/architecture-check");

const sizes = collectTopLevelFunctionSizesFromText([
  "\"use strict\";",
  "",
  "function withDefaultObject(options = {}) {",
  "  const config = { enabled: true };",
  "  if (config.enabled) {",
  "    return options.value || 1;",
  "  }",
  "  return 0;",
  "}",
  "",
  "function simple() {",
  "  return true;",
  "}"
].join("\n"));

assert.deepEqual(sizes, [
  {
    name: "withDefaultObject",
    start: 3,
    end: 9,
    lines: 7
  },
  {
    name: "simple",
    start: 11,
    end: 13,
    lines: 3
  }
]);

assert.deepEqual(findForbiddenAppPatternsFromText([
  "function createProjectFromForm() {",
  "  applyEnergyModeUi(project.energyMode);",
  "}"
].join("\n")), [
  {
    name: "stale energy mode UI sync",
    line: 2,
    message: "do not reintroduce the removed no-op; sync through the energy workspace model"
  }
]);

assert.deepEqual(collectStylesheetHrefsFromHtml([
  "<link rel=\"icon\" href=\"data:,\">",
  "<link rel=\"stylesheet\" href=\"./styles/theme.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/base.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/components/data-display.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/components/forms.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/components/buttons.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/components/workflow.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/components/auth.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/home.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/projects.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/create.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/help.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/energy.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/scenario.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/results.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/compare.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/history.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/responsive.css?v=1\">",
  "<link href=\"./styles.css?v=1\" rel=\"stylesheet\">"
].join("\n")), ["styles/theme.css", "styles/base.css", "styles/components/data-display.css", "styles/components/forms.css", "styles/components/buttons.css", "styles/components/workflow.css", "styles/components/auth.css", "styles/pages/home.css", "styles/pages/projects.css", "styles/pages/create.css", "styles/pages/help.css", "styles/pages/energy.css", "styles/pages/scenario.css", "styles/pages/results.css", "styles/pages/compare.css", "styles/pages/history.css", "styles/responsive.css", "styles.css"]);

assert.deepEqual(collectUnloadedCssFiles([
  "styles/theme.css",
  "styles/components/forms.css",
  "styles/pages/new-page.css"
], [
  "styles/theme.css",
  "styles/components/forms.css"
]), ["styles/pages/new-page.css"]);

assert.deepEqual(collectScriptSourcesFromHtml([
  "<script src=\"./config.js?v=1\" defer></script>",
  "<script src=\"src/domain/app-utils.js?v=2\" defer></script>"
].join("\n")), ["config.js", "src/domain/app-utils.js"]);

assert.deepEqual(collectAppWindowGlobalsFromText([
  "const appUtils = window.NE_APP_UTILS;",
  "const optionalMap = window.NE_MAP_GEO;",
  "const appUtilsAgain = window.NE_APP_UTILS;"
].join("\n")), ["NE_APP_UTILS", "NE_MAP_GEO"]);

assert.deepEqual(collectWindowGlobalExportsFromText([
  "window.NE_CONFIG = {};",
  "root.NE_APP_UTILS = api;",
  "root.window.NE_APP_UTILS = api;"
].join("\n")), ["NE_APP_UTILS", "NE_CONFIG"]);

const loadedWindowExports = collectLoadedWindowGlobalExports([
  "config.js",
  "runtime.js",
  "map-data.js",
  "src/domain/app-utils.js"
]);
assert.deepEqual(loadedWindowExports.get("NE_CONFIG"), ["config.js"]);
assert.deepEqual(loadedWindowExports.get("NE_RUNTIME"), ["runtime.js"]);
assert.deepEqual(loadedWindowExports.get("NE_MAP_GEO"), ["map-data.js"]);
assert.deepEqual(loadedWindowExports.get("NE_APP_UTILS"), ["src/domain/app-utils.js"]);

console.log("architecture check tests passed");
