"use strict";

const assert = require("node:assert/strict");
const {
  collectBrowserModuleScripts,
  collectExpectedGlobalsFromSources,
  collectMissingGlobals,
  createBrowserSandbox,
  createFakeDocument,
  createMemoryStorage,
  executeBrowserModuleSources,
  isBrowserModuleScript
} = require("../scripts/module-load-smoke");

const html = [
  "<script src=\"./vendor/xlsx.full.min.js?v=1\" defer></script>",
  "<script src=\"./config.js?v=1\" defer></script>",
  "<script src=\"./runtime.js?v=1\" defer></script>",
  "<script src=\"./src/domain/app-utils.js?v=1\" defer></script>",
  "<script src=\"./app.js?v=1\" defer></script>"
].join("\n");

assert.equal(isBrowserModuleScript("config.js"), true);
assert.equal(isBrowserModuleScript("src/ui/result-page.js"), true);
assert.equal(isBrowserModuleScript("vendor/echarts.min.js"), false);
assert.equal(isBrowserModuleScript("app.js"), false);
assert.deepEqual(collectBrowserModuleScripts(html), [
  "config.js",
  "runtime.js",
  "src/domain/app-utils.js"
]);

const storage = createMemoryStorage();
storage.setItem("theme", "light");
assert.equal(storage.getItem("theme"), "light");
storage.removeItem("theme");
assert.equal(storage.getItem("theme"), null);

const documentRef = createFakeDocument();
assert.equal(documentRef.querySelector("#app").selector, "#app");
assert.deepEqual(Array.from(documentRef.querySelectorAll(".item")), []);
const fakeElement = documentRef.createElement("div");
fakeElement.style.setProperty("--offset", "1px");
fakeElement.style.removeProperty("--offset");
fakeElement.setAttribute("aria-hidden", "true");
assert.equal(fakeElement.getAttribute("aria-hidden"), "true");
fakeElement.removeAttribute("aria-hidden");
assert.equal(fakeElement.getAttribute("aria-hidden"), null);

const scriptSources = [
  {
    scriptPath: "one.js",
    sourceText: "window.NE_ONE = { ok: true };"
  },
  {
    scriptPath: "two.js",
    sourceText: "(function (root) { root.NE_TWO = root.NE_ONE.ok; })(globalThis);"
  }
];
const expectedGlobals = collectExpectedGlobalsFromSources(scriptSources);
assert.deepEqual(expectedGlobals, ["NE_ONE", "NE_TWO"]);

const sandbox = createBrowserSandbox();
const result = executeBrowserModuleSources(scriptSources, sandbox);
assert.deepEqual(result.loaded, ["one.js", "two.js"]);
assert.equal(sandbox.NE_ONE.ok, true);
assert.equal(sandbox.NE_TWO, true);
assert.deepEqual(collectMissingGlobals(sandbox, expectedGlobals), []);
assert.deepEqual(collectMissingGlobals(sandbox, ["NE_MISSING"]), ["NE_MISSING"]);

console.log("module load smoke tests passed");
