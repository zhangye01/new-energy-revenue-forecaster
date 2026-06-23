"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const APP_JS_MAX_LINES = 5133;
const APP_JS_MAX_FUNCTION_LINES = 38;
const STYLES_CSS_MAX_LINES = 20;
const REQUIRED_CSS_ORDER = ["styles/theme.css", "styles/base.css", "styles/components/data-display.css", "styles/components/forms.css", "styles/components/buttons.css", "styles/components/workflow.css", "styles/components/auth.css", "styles/pages/home.css", "styles/pages/projects.css", "styles/pages/create.css", "styles/pages/help.css", "styles/pages/energy.css", "styles/pages/scenario.css", "styles/pages/results.css", "styles/pages/compare.css", "styles/pages/history.css", "styles/responsive.css", "styles.css"];
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

function listCssFiles(relativeDir) {
  const dir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".css"))
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

function collectStylesheetHrefsFromHtml(html) {
  const links = [];
  const linkPattern = /<link\b[^>]*>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const tag = match[0];
    if (!/\brel=["']stylesheet["']/i.test(tag)) continue;
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    links.push(hrefMatch[1].split("?")[0].replace(/^\.\//, ""));
  }
  return links;
}

function collectScriptSourcesFromHtml(html) {
  const scripts = [];
  const scriptPattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    scripts.push(match[1].split("?")[0].replace(/^\.\//, ""));
  }
  return scripts;
}

function collectAppWindowGlobalsFromText(sourceText) {
  const globals = new Set();
  const globalPattern = /\bwindow\.(NE_[A-Z0-9_]+)/g;
  for (const match of sourceText.matchAll(globalPattern)) {
    globals.add(match[1]);
  }
  return Array.from(globals).sort();
}

function collectWindowGlobalExportsFromText(sourceText) {
  const globals = new Set();
  const exportPattern = /\b(?:window|root|root\.window)\.(NE_[A-Z0-9_]+)\s*=/g;
  for (const match of sourceText.matchAll(exportPattern)) {
    globals.add(match[1]);
  }
  return Array.from(globals).sort();
}

function collectLoadedWindowGlobalExports(scriptPaths) {
  const exportsByGlobal = new Map();
  scriptPaths.forEach((scriptPath) => {
    const fullPath = path.join(ROOT, scriptPath);
    if (!fs.existsSync(fullPath)) return;
    collectWindowGlobalExportsFromText(readText(scriptPath)).forEach((globalName) => {
      if (!exportsByGlobal.has(globalName)) {
        exportsByGlobal.set(globalName, []);
      }
      exportsByGlobal.get(globalName).push(scriptPath);
    });
  });
  return exportsByGlobal;
}

function assertCssLoadOrder() {
  const stylesheets = collectStylesheetHrefsFromHtml(readText("index.html"));
  REQUIRED_CSS_ORDER.forEach((requiredPath) => {
    if (!stylesheets.includes(requiredPath)) {
      fail(`${requiredPath} must be loaded by index.html`);
    }
  });
  const indexes = REQUIRED_CSS_ORDER.map((requiredPath) => stylesheets.indexOf(requiredPath));
  for (let index = 1; index < indexes.length; index += 1) {
    if (indexes[index] <= indexes[index - 1]) {
      fail(`CSS load order must be ${REQUIRED_CSS_ORDER.join(" before ")}`);
      break;
    }
  }
}

function collectUnloadedCssFiles(cssFiles, loadedStylesheets) {
  const loadedSet = new Set(loadedStylesheets);
  return cssFiles.filter((cssFile) => !loadedSet.has(cssFile));
}

function assertAllGovernedCssFilesLoaded() {
  const stylesheets = collectStylesheetHrefsFromHtml(readText("index.html"));
  const governedCssFiles = [
    "styles/theme.css",
    "styles/base.css",
    ...listCssFiles("styles/components"),
    ...listCssFiles("styles/pages"),
    "styles/responsive.css",
    "styles.css"
  ];
  const unloaded = collectUnloadedCssFiles(governedCssFiles, stylesheets);
  if (unloaded.length) {
    fail(`CSS files are not loaded by index.html: ${unloaded.join(", ")}`);
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

function assertModuleLoadSmokeCheckIsRequired() {
  const packageJson = JSON.parse(readText("package.json"));
  const moduleScript = packageJson.scripts?.["check:modules"] || "";
  const checkScript = packageJson.scripts?.check || "";
  if (moduleScript !== "node scripts/module-load-smoke.js") {
    fail("npm run check:modules must use scripts/module-load-smoke.js");
  }
  if (!checkScript.includes("npm run check:modules")) {
    fail("npm run check must include npm run check:modules");
  }
}

function assertAppBootstrapSmokeCheckIsRequired() {
  const packageJson = JSON.parse(readText("package.json"));
  const bootstrapScript = packageJson.scripts?.["check:bootstrap"] || "";
  const checkScript = packageJson.scripts?.check || "";
  if (bootstrapScript !== "node scripts/app-bootstrap-smoke.js") {
    fail("npm run check:bootstrap must use scripts/app-bootstrap-smoke.js");
  }
  if (!checkScript.includes("npm run check:bootstrap")) {
    fail("npm run check must include npm run check:bootstrap");
  }
}

function assertServeSmokeCheckIsRequired() {
  const packageJson = JSON.parse(readText("package.json"));
  const serveScript = packageJson.scripts?.["check:serve"] || "";
  const checkScript = packageJson.scripts?.check || "";
  if (serveScript !== "node scripts/serve-smoke.js") {
    fail("npm run check:serve must use scripts/serve-smoke.js");
  }
  if (!checkScript.includes("npm run check:serve")) {
    fail("npm run check must include npm run check:serve");
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

function assertAppWindowGlobalsAreExported() {
  const html = readText("index.html");
  const scripts = collectScriptSourcesFromHtml(html).filter((scriptPath) => scriptPath !== "app.js");
  const loadedExports = collectLoadedWindowGlobalExports(scripts);
  const missing = collectAppWindowGlobalsFromText(readText("app.js"))
    .filter((globalName) => !loadedExports.has(globalName));
  if (missing.length) {
    fail(`app.js depends on window globals that are not exported by loaded scripts: ${missing.join(", ")}`);
  }
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
  assertCssLoadOrder();
  assertAllGovernedCssFilesLoaded();
  assertModulesHaveTests();
  assertModulesAreInSyntaxCheck();
  assertTestsUseDiscovery();
  assertStaticCheckIsRequired();
  assertReleaseCheckIsRequired();
  assertSmokeCheckIsRequired();
  assertModuleLoadSmokeCheckIsRequired();
  assertAppBootstrapSmokeCheckIsRequired();
  assertServeSmokeCheckIsRequired();
  assertBrowserModulesAreLoaded();
  assertAppWindowGlobalsAreExported();
  assertSingleWorkflow();
  if (!process.exitCode) {
    console.log("architecture checks passed");
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  collectAppWindowGlobalsFromText,
  collectLoadedWindowGlobalExports,
  collectScriptSourcesFromHtml,
  collectTopLevelFunctionSizesFromText,
  collectStylesheetHrefsFromHtml,
  collectUnloadedCssFiles,
  collectWindowGlobalExportsFromText,
  findForbiddenAppPatternsFromText
};
