"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const APP_JS_MAX_LINES = 9000;

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function listJsFiles(relativeDir) {
  const dir = path.join(ROOT, relativeDir);
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => `${relativeDir}/${file}`)
    .sort();
}

function lineCount(relativePath) {
  return readText(relativePath).split(/\r?\n/).length;
}

function fail(message) {
  console.error(`architecture-check failed: ${message}`);
  process.exitCode = 1;
}

function assertAppJsBudget() {
  const count = lineCount("app.js");
  if (count > APP_JS_MAX_LINES) {
    fail(`app.js has ${count} lines; maximum is ${APP_JS_MAX_LINES}. Split page logic before adding more.`);
  }
}

function assertModulesHaveTests() {
  const modules = [
    ...listJsFiles("src/domain"),
    ...listJsFiles("src/ui")
  ];
  modules.forEach((modulePath) => {
    const baseName = path.basename(modulePath, ".js");
    const testPath = path.join(ROOT, "tests", `${baseName}.test.js`);
    if (!fs.existsSync(testPath)) {
      fail(`${modulePath} is missing tests/${baseName}.test.js`);
    }
  });
}

function assertModulesAreInSyntaxCheck() {
  const packageJson = JSON.parse(readText("package.json"));
  const syntaxScript = packageJson.scripts?.["check:syntax"] || "";
  if (syntaxScript !== "node scripts/check-syntax.js") {
    fail("npm run check:syntax must use scripts/check-syntax.js automatic discovery");
  }
}

function assertTestsUseDiscovery() {
  const packageJson = JSON.parse(readText("package.json"));
  const testScript = packageJson.scripts?.test || "";
  if (testScript !== "node scripts/run-tests.js") {
    fail("npm test must use scripts/run-tests.js automatic discovery");
  }
}

function assertStaticCheckIsRequired() {
  const packageJson = JSON.parse(readText("package.json"));
  const staticScript = packageJson.scripts?.["check:static"] || "";
  const checkScript = packageJson.scripts?.check || "";
  if (staticScript !== "node scripts/static-check.js") {
    fail("npm run check:static must use scripts/static-check.js");
  }
  if (!checkScript.includes("npm run check:static")) {
    fail("npm run check must include npm run check:static");
  }
}

function assertReleaseCheckIsRequired() {
  const packageJson = JSON.parse(readText("package.json"));
  const releaseScript = packageJson.scripts?.["check:release"] || "";
  const checkScript = packageJson.scripts?.check || "";
  if (releaseScript !== "node scripts/release-check.js") {
    fail("npm run check:release must use scripts/release-check.js");
  }
  if (!checkScript.includes("npm run check:release")) {
    fail("npm run check must include npm run check:release");
  }
}

function assertBrowserModulesAreLoaded() {
  const html = readText("index.html");
  const modules = [
    ...listJsFiles("src/domain"),
    ...listJsFiles("src/ui")
  ];
  modules.forEach((modulePath) => {
    if (!html.includes(modulePath)) {
      fail(`${modulePath} is not loaded by index.html`);
    }
  });
}

function assertSingleWorkflow() {
  const workflowDir = path.join(ROOT, ".github", "workflows");
  if (!fs.existsSync(workflowDir)) return;
  const workflows = fs.readdirSync(workflowDir)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"));
  if (workflows.length > 1) {
    fail(`multiple GitHub Actions workflows found: ${workflows.join(", ")}. Keep one check workflow unless there is a clear split.`);
  }
}

function run() {
  assertAppJsBudget();
  assertModulesHaveTests();
  assertModulesAreInSyntaxCheck();
  assertTestsUseDiscovery();
  assertStaticCheckIsRequired();
  assertReleaseCheckIsRequired();
  assertBrowserModulesAreLoaded();
  assertSingleWorkflow();
  if (!process.exitCode) {
    console.log("architecture checks passed");
  }
}

run();
