"use strict";

const assert = require("node:assert/strict");
const {
  findSensitiveTextIssues,
  isForbiddenTrackedFile,
  isTextFile,
  shouldScanForSecrets
} = require("../scripts/release-check");

assert.equal(isForbiddenTrackedFile(".env.local"), true);
assert.equal(isForbiddenTrackedFile("ui-demos/demo.html"), true);
assert.equal(isForbiddenTrackedFile("src/domain/revenue-rules.js"), false);

assert.equal(isTextFile("index.html"), true);
assert.equal(isTextFile("docs/README.md"), true);
assert.equal(isTextFile("assets/logo.png"), false);

assert.equal(shouldScanForSecrets("map-data.js"), false);
assert.equal(shouldScanForSecrets("vendor/echarts.min.js"), false);
assert.equal(shouldScanForSecrets("app.js"), true);

const fakeOpenAiKey = "sk-" + "A".repeat(20);
assert.deepEqual(findSensitiveTextIssues("app.js", `const key = "${fakeOpenAiKey}";`), [
  "app.js contains a possible OpenAI-style API key"
]);

const fakePersonalPath = "/" + "Users/alice/project";
assert.deepEqual(findSensitiveTextIssues("README.md", `path: ${fakePersonalPath}`), [
  "README.md contains an absolute personal filesystem path"
]);

assert.deepEqual(findSensitiveTextIssues("map-data.js", `const key = "${fakeOpenAiKey}";`), []);

console.log("release check tests passed");
