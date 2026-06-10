"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const APP_JS_MAX_LINES = 6040;
const APP_JS_MAX_FUNCTION_LINES = 120;
const STYLES_CSS_MAX_LINES = 5500;
const FORBIDDEN_APP_JS_PATTERNS = [
  {
    name: "stale energy mode UI sync",
    pattern: /\bapplyEnergyModeUi\(/,
    message: "do not reintroduce the removed no-op; sync through the energy workspace model"
  }
];

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

function collectTopLevelFunctionSizesFromText(sourceText) {
  const lines = sourceText.split(/\r?\n/);
  const functions = [];
  const declarationPattern = /^function\s+([A-Za-z0-9_$]+)/;

  lines.forEach((line, index) => {
    const match = line.match(declarationPattern);
    if (!match) return;
    let depth = 0;
    let seenOpeningBrace = false;
    let foundEnd = false;
    for (let lineIndex = index; lineIndex < lines.length; lineIndex += 1) {
      const currentLine = lines[lineIndex];
      const startAt = lineIndex === index
        ? currentLine.indexOf("{", currentLine.indexOf(")") + 1)
        : 0;
      if (startAt < 0) continue;
      for (let charIndex = startAt; charIndex < currentLine.length; charIndex += 1) {
        const char = currentLine[charIndex];
        if (char === "{") {
          depth += 1;
          seenOpeningBrace = true;
        } else if (char === "}") {
          depth -= 1;
          if (seenOpeningBrace && depth === 0) {
            functions.push({
              name: match[1],
              start: index + 1,
              end: lineIndex + 1,
              lines: lineIndex - index + 1
            });
            foundEnd = true;
            break;
          }
        }
      }
      if (foundEnd) break;
    }
  });

  return functions;
}

function collectTopLevelFunctionSizes(relativePath) {
  return collectTopLevelFunctionSizesFromText(readText(relativePath));
}

function findForbiddenAppPatternsFromText(sourceText) {
  const lines = sourceText.split(/\r?\n/);
  const issues = [];
  lines.forEach((line, index) => {
    FORBIDDEN_APP_JS_PATTERNS.forEach((rule) => {
      if (rule.pattern.test(line)) {
        issues.push({
          name: rule.name,
          line: index + 1,
          message: rule.message
        });
      }
    });
  });
  return issues;
}

function assertNoForbiddenAppPatterns() {
  findForbiddenAppPatternsFromText(readText("app.js")).forEach((issue) => {
    fail(`app.js contains ${issue.name} at line ${issue.line}: ${issue.message}.`);
  });
}

function assertAppJsFunctionBudget() {
  const oversized = collectTopLevelFunctionSizes("app.js")
    .filter((item) => item.lines > APP_JS_MAX_FUNCTION_LINES)
    .sort((a, b) => b.lines - a.lines);
  oversized.forEach((item) => {
    fail(`app.js function ${item.name} has ${item.lines} lines (${item.start}-${item.end}); maximum is ${APP_JS_MAX_FUNCTION_LINES}.`);
  });
}

function assertStylesCssBudget() {
  const count = lineCount("styles.css");
  if (count > STYLES_CSS_MAX_LINES) {
    fail(`styles.css has ${count} lines; maximum is ${STYLES_CSS_MAX_LINES}. Split or reorganize styles before adding more.`);
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

function assertSmokeCheckIsRequired() {
  const packageJson = JSON.parse(readText("package.json"));
  const smokeScript = packageJson.scripts?.["check:smoke"] || "";
  const checkScript = packageJson.scripts?.check || "";
  if (smokeScript !== "node scripts/smoke-check.js") {
    fail("npm run check:smoke must use scripts/smoke-check.js");
  }
  if (!checkScript.includes("npm run check:smoke")) {
    fail("npm run check must include npm run check:smoke");
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
  assertAppJsFunctionBudget();
  assertNoForbiddenAppPatterns();
  assertStylesCssBudget();
  assertModulesHaveTests();
  assertModulesAreInSyntaxCheck();
  assertTestsUseDiscovery();
  assertStaticCheckIsRequired();
  assertReleaseCheckIsRequired();
  assertSmokeCheckIsRequired();
  assertBrowserModulesAreLoaded();
  assertSingleWorkflow();
  if (!process.exitCode) {
    console.log("architecture checks passed");
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  collectTopLevelFunctionSizesFromText,
  findForbiddenAppPatternsFromText
};
