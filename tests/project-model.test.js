"use strict";

const assert = require("node:assert/strict");
const {
  normalizeEnergyMode,
  createEmptyEnergyDataState,
  createEmptyEnergyTemplateExports,
  sanitizeProjectBase,
  sanitizePriceRuns,
  resolveActiveRunId,
  sanitizeActivationLogs
} = require("../src/domain/project-model");

const options = {
  currentYear: 2026,
  nowIso: "2026-06-09T00:00:00.000Z",
  provinceKeys: ["jiangsu", "shandong"],
  makeId: (prefix) => `${prefix}-test`,
  resolveUniqueName: (name) => `${name}2`
};

assert.equal(normalizeEnergyMode("hourly_8760"), "hourly_8760");
assert.equal(normalizeEnergyMode("bad"), "annual_hours");
assert.deepEqual(createEmptyEnergyDataState("bad"), {
  mode: "annual_hours",
  annualInputByYear: {},
  typicalCurveSource: "",
  typicalCurveProfile: [],
  hourlyByYear: {},
  annualSummary: {}
});
assert.deepEqual(createEmptyEnergyTemplateExports(), {
  hourly_8760: "",
  annual_hours: "",
  typical_curve_8760: "",
  province_typical_curve: ""
});

const historyProject = sanitizeProjectBase({
  account: " legacy ",
  workspaceBucket: "history",
  province: "jiangsu",
  assetType: "wind",
  siteType: "offshore",
  hasStorage: true,
  capacityMw: "320",
  storagePowerMw: "",
  storageDurationH: "",
  startYear: "2026.8",
  forecastYears: "40",
  energyMode: "typical_curve_8760",
  note: "note"
}, 0, options);
assert.equal(historyProject.id, "proj-test");
assert.equal(historyProject.ownerAccount, "legacy");
assert.equal(historyProject.name, "项目1");
assert.equal(historyProject.province, "jiangsu");
assert.equal(historyProject.storagePowerMw, 64);
assert.equal(historyProject.storageDurationH, 2);
assert.equal(historyProject.startYear, 2026);
assert.equal(historyProject.forecastYears, 30);
assert.equal(historyProject.energyMode, "typical_curve_8760");
assert.equal(historyProject.createdAt, "2026-06-09T00:00:00.000Z");

const draftProject = sanitizeProjectBase({
  workspaceBucket: "new",
  province: "bad",
  assetType: "bad",
  siteType: "bad",
  capacityMw: "bad",
  startYear: "bad",
  forecastYears: "bad"
}, 2, options);
assert.equal(draftProject.workspaceBucket, "new");
assert.equal(draftProject.name, "新建项目2");
assert.equal(draftProject.province, "");
assert.equal(draftProject.assetType, "");
assert.equal(draftProject.siteType, "");
assert.equal(draftProject.capacityMw, null);
assert.equal(draftProject.startYear, null);
assert.equal(draftProject.forecastYears, null);

const runs = sanitizePriceRuns([
  null,
  {
    algorithmFamily: "ensemble",
    pricesByYear: { 2026: [1, 2] }
  },
  {
    id: "run-keep",
    createdAt: "2026-01-01T00:00:00.000Z",
    pricesByYear: []
  }
], options);
assert.equal(runs.length, 2);
assert.equal(runs[0].id, "run-test");
assert.deepEqual(runs[0].pricesByYear, { 2026: [1, 2] });
assert.equal(runs[1].id, "run-keep");
assert.deepEqual(runs[1].pricesByYear, {});
assert.equal(resolveActiveRunId(runs, "run-keep"), "run-keep");
assert.equal(resolveActiveRunId(runs, "missing"), null);

const logs = sanitizeActivationLogs([
  {},
  {
    id: "act-keep",
    fromRunId: "a",
    toRunId: "b",
    reason: "手动切换",
    changedAt: "2026-01-01T00:00:00.000Z"
  }
], options);
assert.equal(logs[0].id, "act-test");
assert.equal(logs[0].fromRunId, "-");
assert.equal(logs[0].changedAt, "2026-06-09T00:00:00.000Z");
assert.equal(logs[1].reason, "手动切换");

console.log("project model tests passed");
