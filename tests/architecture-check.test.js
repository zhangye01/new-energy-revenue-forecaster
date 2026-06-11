"use strict";

const assert = require("node:assert/strict");
const {
  collectTopLevelFunctionSizesFromText,
  collectStylesheetHrefsFromHtml,
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
  "<link rel=\"stylesheet\" href=\"./styles/pages/home.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/projects.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/help.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/energy.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/scenario.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/results.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/compare.css?v=1\">",
  "<link rel=\"stylesheet\" href=\"./styles/pages/history.css?v=1\">",
  "<link href=\"./styles.css?v=1\" rel=\"stylesheet\">"
].join("\n")), ["styles/theme.css", "styles/base.css", "styles/pages/home.css", "styles/pages/projects.css", "styles/pages/help.css", "styles/pages/energy.css", "styles/pages/scenario.css", "styles/pages/results.css", "styles/pages/compare.css", "styles/pages/history.css", "styles.css"]);

console.log("architecture check tests passed");
