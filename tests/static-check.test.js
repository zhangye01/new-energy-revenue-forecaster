"use strict";

const assert = require("node:assert/strict");
const {
  collectCssEntryReferences,
  collectCssReferences,
  collectHtmlReferences,
  isLocalReference,
  normalizeReference,
  stripReference
} = require("../scripts/static-check");

assert.equal(stripReference("'./app.js?v=1#main'"), "./app.js");
assert.equal(stripReference("\"styles.css?x=1\""), "styles.css");

assert.equal(isLocalReference("./app.js"), true);
assert.equal(isLocalReference("#home"), false);
assert.equal(isLocalReference("https://example.com/app.js"), false);
assert.equal(isLocalReference("data:image/png;base64,abc"), false);

assert.equal(normalizeReference("./src/domain/app-storage.js"), "src/domain/app-storage.js");

assert.deepEqual(collectHtmlReferences([
  "<link href=\"./styles/theme.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/base.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/components/data-display.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/components/forms.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/components/buttons.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/components/workflow.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/components/auth.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/home.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/projects.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/create.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/help.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/energy.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/scenario.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/results.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/compare.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/history.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/responsive.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles.css?v=1\" rel=\"stylesheet\">",
  "<script src=\"./app.js#boot\"></script>",
  "<img src=\"https://example.com/logo.png\">",
  "<img onerror=\"this.src='assets/fallback.png'\">"
].join("\n")), [
  { reference: "styles/theme.css", source: "index.html" },
  { reference: "styles/base.css", source: "index.html" },
  { reference: "styles/components/data-display.css", source: "index.html" },
  { reference: "styles/components/forms.css", source: "index.html" },
  { reference: "styles/components/buttons.css", source: "index.html" },
  { reference: "styles/components/workflow.css", source: "index.html" },
  { reference: "styles/components/auth.css", source: "index.html" },
  { reference: "styles/pages/home.css", source: "index.html" },
  { reference: "styles/pages/projects.css", source: "index.html" },
  { reference: "styles/pages/create.css", source: "index.html" },
  { reference: "styles/pages/help.css", source: "index.html" },
  { reference: "styles/pages/energy.css", source: "index.html" },
  { reference: "styles/pages/scenario.css", source: "index.html" },
  { reference: "styles/pages/results.css", source: "index.html" },
  { reference: "styles/pages/compare.css", source: "index.html" },
  { reference: "styles/pages/history.css", source: "index.html" },
  { reference: "styles/responsive.css", source: "index.html" },
  { reference: "styles.css", source: "index.html" },
  { reference: "app.js", source: "index.html" },
  { reference: "assets/fallback.png", source: "index.html" },
  { reference: "assets/fallback.png", source: "index.html inline fallback" }
]);

assert.deepEqual(collectCssEntryReferences([
  "<link href=\"./styles/theme.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/base.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/components/data-display.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/components/forms.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/components/buttons.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/components/workflow.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/components/auth.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/home.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/projects.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/create.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/help.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/energy.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/scenario.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/results.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/compare.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/pages/history.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles/responsive.css?v=1\" rel=\"stylesheet\">",
  "<link href=\"./styles.css?v=1\" rel=\"stylesheet\">",
  "<script src=\"./app.js\"></script>"
].join("\n")), ["styles/theme.css", "styles/base.css", "styles/components/data-display.css", "styles/components/forms.css", "styles/components/buttons.css", "styles/components/workflow.css", "styles/components/auth.css", "styles/pages/home.css", "styles/pages/projects.css", "styles/pages/create.css", "styles/pages/help.css", "styles/pages/energy.css", "styles/pages/scenario.css", "styles/pages/results.css", "styles/pages/compare.css", "styles/pages/history.css", "styles/responsive.css", "styles.css"]);

assert.deepEqual(collectCssReferences("styles/theme.css"), []);

console.log("static check tests passed");
