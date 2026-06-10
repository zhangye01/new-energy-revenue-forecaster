"use strict";

const assert = require("node:assert/strict");
const {
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
  "<link href=\"./styles.css?v=1\" rel=\"stylesheet\">",
  "<script src=\"./app.js#boot\"></script>",
  "<img src=\"https://example.com/logo.png\">",
  "<img onerror=\"this.src='assets/fallback.png'\">"
].join("\n")), [
  { reference: "styles.css", source: "index.html" },
  { reference: "app.js", source: "index.html" },
  { reference: "assets/fallback.png", source: "index.html" },
  { reference: "assets/fallback.png", source: "index.html inline fallback" }
]);

console.log("static check tests passed");
