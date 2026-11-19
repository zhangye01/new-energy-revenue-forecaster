"use strict";

const assert = require("node:assert/strict");
const { importEnergyDataFromText } = require("../src/domain/energy-import-flow");
const energyData = require("../src/domain/energy-data");
const { normalizeEnergyMode } = require("../src/domain/project-model");

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

const curveFirstProject = {
  startYear: 2028,
  forecastYears: 3,
  capacityMw: 120,
  statuses: { "energy-page": "not_started", "history-page": "not_started" }
};
const curveFirstAppState = {};
const curveFirstServices = makeServices(null, {
  normalizeEnergyMode,
  validateAndBuildEnergyData: energyData.validateAndBuildEnergyData,
  ensureProjectEnergyDataState: energyData.ensureProjectEnergyDataState,
  hasEnergyTypicalCurve: energyData.hasEnergyTypicalCurve,
  rebuildProjectEnergyData: energyData.rebuildProjectEnergyData,
  countCompleteEnergyYears: (project) => energyData.getCompleteEnergyYears(project).length,
  getAnnualInputYearCount: energyData.getAnnualInputYearCount,
  listMissingEnergyYears: (project) => {
    const complete = new Set(energyData.getCompleteEnergyYears(project));
    return Array.from({ length: project.forecastYears }, (_, index) => project.startYear + index)
      .filter((year) => !complete.has(year));
  }
});
const importIntoCurveFirstProject = (mode, csvText) => importEnergyDataFromText({
  project: curveFirstProject,
  mode,
  csvText,
  appState: curveFirstAppState,
  services: curveFirstServices
});
const typicalRows = Array.from({ length: 8760 }, (_, index) => `${index + 1},${index % 24 === 18 ? 2 : 1}`);
const curveFirstImport = importIntoCurveFirstProject(
  "typical_curve_8760",
  ["hour_index,equivalent_hours_h", ...typicalRows].join("\n")
);
assert.equal(curveFirstImport.ok, true);
assert.equal(curveFirstImport.level, "warn");
assert.equal(curveFirstAppState.energyStep2Choice, "typical");
assert.equal(curveFirstProject.statuses["energy-page"], "in_progress");
assert.deepEqual(curveFirstProject.energyData.annualInputByYear, {});
assert.deepEqual(curveFirstProject.energyData.hourlyByYear, {});
const savedProfile = curveFirstProject.energyData.typicalCurveProfile.slice();
assert.equal(savedProfile.length, 8760);
const rejectedReplacement = importIntoCurveFirstProject("typical_curve_8760", "hour_index,equivalent_hours_h\n1,2");
assert.equal(rejectedReplacement.ok, false);
assert.deepEqual(curveFirstProject.energyData.typicalCurveProfile, savedProfile);

const curveFirstAnnualImport = importIntoCurveFirstProject(
  "annual_hours",
  "year,annual_hours_h\n2028,3200\n2029,3150\n2030,3100"
);
assert.equal(curveFirstAnnualImport.ok, true);
assert.equal(curveFirstAnnualImport.level, "success");
assert.match(curveFirstAnnualImport.message, /已生成\s*3\/3\s*年上网电量/);
assert.doesNotMatch(curveFirstAnnualImport.message, /请继续第二步|请.*导入典型年/);
assert.equal(curveFirstProject.statuses["energy-page"], "completed");
assert.equal(curveFirstProject.energyData.typicalCurveSource, "typical_curve_8760");
assert.deepEqual(curveFirstProject.energyData.typicalCurveProfile, savedProfile);
assert.deepEqual(
  Object.values(curveFirstProject.energyData.annualSummary).map((year) => year.energyMwh),
  [384000, 378000, 372000]
);
assert.deepEqual(
  Object.values(curveFirstProject.energyData.hourlyByYear).map((values) => values.length),
  [8760, 8760, 8760]
);

console.log("energy import flow tests passed");
