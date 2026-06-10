"use strict";

const assert = require("node:assert/strict");
const { importEnergyDataFromText } = require("../src/domain/energy-import-flow");

const missingProject = importEnergyDataFromText({});
assert.equal(missingProject.ok, false);
assert.equal(missingProject.message, "请先创建项目。");

function makeServices(parsed, overrides = {}) {
  return {
    isProjectCreateCompleted: () => true,
    normalizeEnergyMode: (mode) => mode,
    validateAndBuildEnergyData: () => parsed,
    alignDefaultForecastYearsToAnnualTemplate: () => false,
    ensureProjectEnergyTemplateExports: (project) => {
      project.energyTemplateExports = project.energyTemplateExports || {};
      return project.energyTemplateExports;
    },
    ensureProjectEnergyDataState: (project) => {
      project.energyData = project.energyData || {};
      return project.energyData;
    },
    hasEnergyTypicalCurve: () => false,
    rebuildProjectEnergyData: () => {},
    countCompleteEnergyYears: (project) => Object.keys(project.energyData.annualInputByYear || {}).length,
    markDownstreamStale: (project, pageId) => { project.staleFrom = pageId; },
    getAnnualInputYearCount: (project) => Object.keys(project.energyData.annualInputByYear || {}).length,
    listMissingEnergyYears: () => [2027],
    ...overrides
  };
}

const invalidProject = { forecastYears: 1 };
const createBlocked = importEnergyDataFromText({
  project: invalidProject,
  mode: "annual_hours",
  services: makeServices({ ok: true }, { isProjectCreateCompleted: () => false })
});
assert.equal(createBlocked.ok, false);
assert.equal(createBlocked.level, "warn");

const annualProject = {
  forecastYears: 2,
  statuses: { "energy-page": "not_started", "history-page": "not_started" }
};
const annualResult = importEnergyDataFromText({
  project: annualProject,
  mode: "annual_hours",
  csvText: "csv",
  sourceLabel: "模板",
  appState: {},
  services: makeServices({
    ok: true,
    annualInputByYear: { 2026: 2400, 2027: 2300 }
  })
});
assert.equal(annualResult.ok, true);
assert.equal(annualResult.level, "success");
assert.match(annualResult.message, /逐年总量导入成功/);
assert.equal(annualProject.statuses["energy-page"], "completed");
assert.equal(annualProject.statuses["history-page"], "in_progress");
assert.equal(annualProject.staleFrom, "energy-page");

const typicalProject = {
  forecastYears: 2,
  statuses: { "energy-page": "not_started", "history-page": "completed" },
  energyData: { annualInputByYear: { 2026: 2400 } }
};
const appState = {};
const typicalResult = importEnergyDataFromText({
  project: typicalProject,
  mode: "typical_curve_8760",
  appState,
  services: makeServices(
    { ok: true, typicalCurveProfile: [1] },
    { countCompleteEnergyYears: () => 1 }
  )
});
assert.equal(typicalResult.ok, true);
assert.equal(typicalResult.level, "warn");
assert.equal(appState.energyStep2Choice, "typical");
assert.match(typicalResult.message, /待补年份/);

console.log("energy import flow tests passed");
