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
  const modules = [
    ...listJsFiles("src/domain"),
    ...listJsFiles("src/ui")
  ];
  modules.forEach((modulePath) => {
    if (!syntaxScript.includes(`node --check ${modulePath}`)) {
      fail(`${modulePath} is not included in npm run check:syntax`);
    }
  });
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

function run() {
  assertAppJsBudget();
  assertModulesHaveTests();
  assertModulesAreInSyntaxCheck();
  assertBrowserModulesAreLoaded();
  if (!process.exitCode) {
    console.log("architecture checks passed");
  }
}

run();
