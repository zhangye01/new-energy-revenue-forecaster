"use strict";

const assert = require("node:assert/strict");
const {
  collectTopLevelFunctionSizesFromText
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

console.log("architecture check tests passed");
