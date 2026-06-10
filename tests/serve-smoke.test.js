"use strict";

const assert = require("node:assert/strict");
const {
  collectCssReferences,
  collectHtmlReferences,
  contentTypeForPath,
  normalizeReference,
  normalizeServePath
} = require("../scripts/serve-smoke");

assert.equal(normalizeReference("./app.js?v=1#boot"), "app.js");
assert.equal(normalizeReference("../secret.txt"), null);
assert.equal(normalizeReference("https://example.com/app.js"), null);
assert.equal(normalizeReference("icons/logo.svg", "assets/css"), "assets/css/icons/logo.svg");

assert.deepEqual(collectHtmlReferences([
  "<link href=\"./styles.css?v=1\" rel=\"stylesheet\">",
  "<script src=\"app.js\"></script>",
  "<img src=\"data:image/png;base64,abc\">",
  "<img onerror=\"this.src='assets/fallback.png'\">"
].join("\n")), [
  "app.js",
  "assets/fallback.png",
  "styles.css"
]);

assert.deepEqual(collectCssReferences([
  ".hero { background: url('../img/hero.png?v=1'); }",
  ".icon { background: url(\"./icons/a.svg\"); }",
  ".remote { background: url(https://example.com/a.png); }"
].join("\n"), "assets/css"), [
  "assets/css/icons/a.svg",
  "assets/img/hero.png"
]);

assert.equal(normalizeServePath("/"), "index.html");
assert.equal(normalizeServePath("/index.html?v=1"), "index.html");
assert.equal(normalizeServePath("/src/domain/app-storage.js"), "src/domain/app-storage.js");
assert.equal(normalizeServePath("/../secret.txt"), null);
assert.equal(normalizeServePath("/%2e%2e/secret.txt"), null);
assert.equal(normalizeServePath("/bad%ZZ"), null);

assert.equal(contentTypeForPath("index.html"), "text/html; charset=utf-8");
assert.equal(contentTypeForPath("styles.css"), "text/css; charset=utf-8");
assert.equal(contentTypeForPath("app.js"), "text/javascript; charset=utf-8");
assert.equal(contentTypeForPath("assets/logo.png"), "image/png");

console.log("serve smoke tests passed");
