"use strict";

const assert = require("node:assert/strict");
const {
  collectAttributeValues,
  collectDataPages,
  collectIds,
  collectScriptSources
} = require("../scripts/smoke-check");

const html = [
  "<section id=\"home-page\"></section>",
  "<button data-page=\"home-page\"></button>",
  "<button data-jump=\"results-page\"></button>",
  "<button data-result-view=\"annual\"></button>",
  "<section data-result-pane=\"annual\"></section>",
  "<button data-compare-view=\"scenario\"></button>",
  "<section data-compare-pane=\"scenario\"></section>",
  "<script src=\"./config.js?v=1\" defer></script>",
  "<script src=\"app.js\" defer></script>"
].join("\n");

assert.deepEqual([...collectIds(html)], ["home-page"]);
assert.deepEqual([...collectDataPages(html)], ["home-page"]);
assert.deepEqual([...collectAttributeValues(html, "data-jump")], ["results-page"]);
assert.deepEqual([...collectAttributeValues(html, "data-result-view")], ["annual"]);
assert.deepEqual([...collectAttributeValues(html, "data-result-pane")], ["annual"]);
assert.deepEqual(collectScriptSources(html), ["config.js", "app.js"]);

console.log("smoke check tests passed");
