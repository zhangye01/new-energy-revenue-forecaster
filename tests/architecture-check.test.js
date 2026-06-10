"use strict";

const assert = require("node:assert/strict");
const {
  collectTopLevelFunctionSizesFromText,
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

console.log("architecture check tests passed");
