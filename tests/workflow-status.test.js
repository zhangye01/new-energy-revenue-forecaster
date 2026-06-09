"use strict";

const assert = require("node:assert/strict");
const {
  DEFAULT_WORKFLOW_PAGES,
  statusMapTemplate,
  sanitizeStatuses,
  reconcileStatuses,
  markDownstreamStale,
  statusText
} = require("../src/domain/workflow-status");

const template = statusMapTemplate();
assert.equal(Object.keys(template).length, DEFAULT_WORKFLOW_PAGES.length);
assert.ok(Object.values(template).every((value) => value === "not_started"));

const sanitized = sanitizeStatuses({
  "create-page": "completed",
  "energy-page": "invalid",
  "forecast-page": "stale",
  "unknown-page": "completed"
});
assert.equal(sanitized["create-page"], "completed");
assert.equal(sanitized["energy-page"], "not_started");
assert.equal(sanitized["forecast-page"], "stale");
assert.equal(sanitized["unknown-page"], undefined);

const reconciled = reconcileStatuses(template, {
  createCompleted: true,
  energyCompleted: false,
  historyReady: true,
  historyCompleted: false,
  forecastCompleted: false,
  hasPriceRuns: true,
  scenarioCompleted: false,
  resultsCompleted: false,
  compareCompleted: false,
  compareReadyCount: 0
});
assert.equal(reconciled["create-page"], "completed");
assert.equal(reconciled["energy-page"], "in_progress");
assert.equal(reconciled["history-page"], "in_progress");
assert.equal(reconciled["forecast-page"], "in_progress");
assert.equal(reconciled["scenario-page"], "not_started");

const stalePreserved = reconcileStatuses({
  ...template,
  "scenario-page": "stale"
}, {
  createCompleted: true,
  energyCompleted: true,
  historyReady: true,
  historyCompleted: true,
  forecastCompleted: false,
  scenarioCompleted: false
});
assert.equal(stalePreserved["scenario-page"], "stale");

const completedOverridesStale = reconcileStatuses({
  ...template,
  "results-page": "stale"
}, {
  createCompleted: true,
  energyCompleted: true,
  historyReady: true,
  historyCompleted: true,
  forecastCompleted: true,
  scenarioCompleted: true,
  resultsCompleted: true,
  compareCompleted: false,
  compareReadyCount: 1
});
assert.equal(completedOverridesStale["results-page"], "completed");
assert.equal(completedOverridesStale["compare-page"], "in_progress");

const downstream = markDownstreamStale({
  ...template,
  "forecast-page": "completed",
  "scenario-page": "completed",
  "results-page": "completed",
  "compare-page": "not_started"
}, "energy-page");
assert.equal(downstream["forecast-page"], "stale");
assert.equal(downstream["scenario-page"], "stale");
assert.equal(downstream["results-page"], "stale");
assert.equal(downstream["compare-page"], "not_started");

assert.equal(statusText("completed"), "已完成");
assert.equal(statusText("in_progress"), "进行中");
assert.equal(statusText("stale"), "需复核");
assert.equal(statusText("other"), "未开始");

console.log("workflow status tests passed");
