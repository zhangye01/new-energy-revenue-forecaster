"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FAILURES = [];
const REQUIRED_PAGE_IDS = [
  "home-page",
  "projects-page",
  "create-page",
  "energy-page",
  "history-page",
  "forecast-page",
  "scenario-page",
  "results-page",
  "compare-page",
  "help-page",
  "settings-page"
];
const REQUIRED_STATUS_DOT_IDS = [
  "status-create-page",
  "status-energy-page",
  "status-history-page",
  "status-forecast-page",
  "status-scenario-page",
  "status-results-page",
  "status-compare-page"
];
const CRITICAL_IDS = [
  "login-entry-button",
  "login-modal",
  "login-account",
  "login-password",
  "project-list",
  "create-project-form",
  "create-save-only-button",
  "create-to-energy-button",
  "energy-project-context",
  "energy-import-message",
  "energy-annual-chart",
  "energy-curve-chart",
  "energy-to-history-button",
  "history-source-province",
  "history-month-trend-chart",
  "history-typical-day-chart",
  "forecast-run-form",
  "forecast-run-body",
  "scenario-selector",
  "scenario-form",
  "scenario-message",
  "scenario-visual-energy-chart",
  "scenario-visual-trend-chart",
  "scenario-visual-unit-chart",
  "result-metric-grid",
  "result-annual-stack-chart",
  "run-calc-button",
  "export-annual-button",
  "export-hourly-button",
  "print-report-button",
  "compare-sensitivity-target",
  "compare-sensitivity-range",
  "compare-sensitivity-step",
  "compare-sensitivity-tornado-chart",
  "compare-sensitivity-body",
  "compare-ranking-chart",
  "compare-body"
];
const REQUIRED_BOOTSTRAP_SCRIPTS = [
  "config.js",
  "runtime.js",
  "src/domain/app-storage.js",
  "app.js"
];

function fail(message) {
  FAILURES.push(message);
  console.error(`smoke-check failed: ${message}`);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function stripReference(rawValue) {
  return String(rawValue || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .split("#")[0]
    .split("?")[0]
    .replace(/^\.\//, "");
}

function collectIds(html) {
  const ids = new Set();
  const idPattern = /\bid=["']([^"']+)["']/gi;
  for (const match of html.matchAll(idPattern)) {
    ids.add(match[1]);
  }
  return ids;
}

function collectDataPages(html) {
  return collectAttributeValues(html, "data-page");
}

function collectAttributeValues(html, attributeName) {
  const values = new Set();
  const attrPattern = new RegExp(`\\b${attributeName}=["']([^"']+)["']`, "gi");
  for (const match of html.matchAll(attrPattern)) {
    values.add(match[1]);
  }
  return values;
}

function collectScriptSources(html) {
  const scripts = [];
  const scriptPattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    scripts.push(stripReference(match[1]));
  }
  return scripts;
}

function assertIdsExist(ids, requiredIds, label) {
  requiredIds.forEach((id) => {
    if (!ids.has(id)) {
      fail(`${label} missing #${id}`);
    }
  });
}

function assertNavTargetsExist(ids, dataPages) {
  dataPages.forEach((pageId) => {
    if (!ids.has(pageId)) {
      fail(`navigation data-page="${pageId}" has no matching page id`);
    }
  });
}

function assertAttributeTargetsExist(ids, values, attributeName) {
  values.forEach((targetId) => {
    if (!ids.has(targetId)) {
      fail(`${attributeName}="${targetId}" has no matching page id`);
    }
  });
}

function assertPairedAttributeValues(sourceValues, targetValues, sourceAttribute, targetAttribute) {
  sourceValues.forEach((value) => {
    if (!targetValues.has(value)) {
      fail(`${sourceAttribute}="${value}" has no matching ${targetAttribute}`);
    }
  });
}

function scriptIndex(scripts, expected) {
  return scripts.findIndex((script) => script === expected || script.startsWith(`${expected}?`));
}

function assertScriptOrder(scripts) {
  const appIndex = scriptIndex(scripts, "app.js");
  if (appIndex < 0) {
    fail("index.html does not load app.js");
    return;
  }
  if (appIndex !== scripts.length - 1) {
    fail("app.js must be the last script so all window.NE_* modules are available before boot");
  }
  REQUIRED_BOOTSTRAP_SCRIPTS.forEach((script) => {
    const index = scriptIndex(scripts, script);
    if (index < 0) {
      fail(`index.html does not load required script ${script}`);
    } else if (script !== "app.js" && index > appIndex) {
      fail(`${script} must load before app.js`);
    }
  });
}

function run() {
  const html = readText("index.html");
  const ids = collectIds(html);
  const dataPages = collectDataPages(html);
  const jumpTargets = collectAttributeValues(html, "data-jump");
  const resultViews = collectAttributeValues(html, "data-result-view");
  const resultPanes = collectAttributeValues(html, "data-result-pane");
  const compareViews = collectAttributeValues(html, "data-compare-view");
  const comparePanes = collectAttributeValues(html, "data-compare-pane");
  const scripts = collectScriptSources(html);
  assertIdsExist(ids, REQUIRED_PAGE_IDS, "page contract");
  assertIdsExist(ids, REQUIRED_STATUS_DOT_IDS, "workflow status contract");
  assertIdsExist(ids, CRITICAL_IDS, "critical UI contract");
  assertNavTargetsExist(ids, dataPages);
  assertAttributeTargetsExist(ids, jumpTargets, "data-jump");
  assertPairedAttributeValues(resultViews, resultPanes, "data-result-view", "data-result-pane");
  assertPairedAttributeValues(compareViews, comparePanes, "data-compare-view", "data-compare-pane");
  assertScriptOrder(scripts);
  if (FAILURES.length) process.exit(1);
  console.log(`smoke checks passed (${REQUIRED_PAGE_IDS.length} pages, ${CRITICAL_IDS.length} critical ids)`);
}

if (require.main === module) {
  run();
}

module.exports = {
  collectAttributeValues,
  collectDataPages,
  collectIds,
  collectScriptSources
};
