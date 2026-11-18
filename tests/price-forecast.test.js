"use strict";

const assert = require("node:assert/strict");
const {
  FORECAST_MODEL_DEFINITIONS,
  getHistoryMockShapeFactors,
  hourlyPricesFromQuarterPrices,
  buildForecastPriceSeries,
  countForecastPriceMissing,
  createForecastRunForModel,
  validateSupplyDemandRun,
  validateSupplyDemandDataset
} = require("../src/domain/price-forecast");
const supplyDemand = require("../src/domain/supply-demand");

function createProject(overrides = {}) {
  return {
    id: "forecast-project",
    province: "jiangsu",
    assetType: "photovoltaic",
    siteType: "onshore",
    hasStorage: true,
    storagePowerMw: 20,
    storageDurationH: 2,
    capacityMw: 100,
    startYear: 2026,
    forecastYears: 2,
    ...overrides
  };
}

const project = createProject();
const ensemble = FORECAST_MODEL_DEFINITIONS.find((model) => model.family === "ensemble");
assert.ok(ensemble, "应存在融合模型定义");

const factors = getHistoryMockShapeFactors(project);
assert.ok(factors.storageScale > 0);
assert.ok(factors.noiseAmplitude > 0);

assert.deepEqual(hourlyPricesFromQuarterPrices([1, 2, 3]), []);
const flatQuarterPrices = Array.from({ length: 35040 }, () => 100);
const hourly = hourlyPricesFromQuarterPrices(flatQuarterPrices);
assert.equal(hourly.length, 8760);
assert.ok(hourly.every((value) => value === 100));

const series = buildForecastPriceSeries(project, ensemble, 2300, 0.01, {
  provinceBenchmarks: { jiangsu: { historyPrice: 365 } }
});
assert.equal(series.quarterPricesByYear[2026].length, 35040);
assert.equal(series.quarterPricesByYear[2027].length, 35040);
assert.equal(series.pricesByYear[2026].length, 8760);
assert.equal(series.pricesByYear[2027].length, 8760);
assert.ok(series.quarterPricesByYear[2026].every((value) => Number.isFinite(value) && value >= -150 && value <= 950));

const run = createForecastRunForModel(project, ensemble, {
  id: "run-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  algorithmVersion: "1.0.0",
  featureVersion: "1.0.0",
  dataSnapshotId: "snapshot-test",
  trainStart: 2018,
  trainEnd: 2025,
  seed: 2027,
  growth: 0.01,
  provinceBenchmarks: { jiangsu: { historyPrice: 365 } },
  qualityGate: {
    hard: { mape: 0.15, smape: 0.18, missingPoints: 0 },
    soft: { mae: 55, rmse: 80 }
  }
});

assert.equal(run.id, "run-test");
assert.equal(run.algorithmFamily, "ensemble");
assert.equal(run.granularityMinutes, 15);
assert.equal(run.pointsPerYear, 35040);
assert.equal(run.missingPoints, 0);
assert.ok(["publishable", "publishable_warn", "validated"].includes(run.status));
assert.equal(countForecastPriceMissing(project, run), 0);

const incompleteRun = {
  pricesByYear: { 2026: Array.from({ length: 8760 }, () => 100) },
  quarterPricesByYear: {},
  granularityMinutes: 15
};
assert.equal(countForecastPriceMissing(project, incompleteRun), 8760 + 35040 + 35040);

const supplyConfig = supplyDemand.createConfig(project);
Object.values(supplyConfig.elements).forEach((element) => {
  element.baseEnergyMwh = 0;
  element.growthRatesByYear[2027] = 0;
});
supplyConfig.elements.load.baseEnergyMwh = 8760;
supplyConfig.elements.load.monthlyWeights = [...supplyDemand.MONTH_DAYS];
supplyConfig.elements.load.hourlyWeightsByMonth = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, Array(24).fill(1)]));
supplyConfig.elements.load.growthRatesByYear[2027] = 10;
const supplyDataset = supplyDemand.buildDataset(project, supplyConfig);
assert.equal(supplyDataset.ok, true);
const boundOptions = {
  id: "bound", createdAt: "2026-11-13T00:00:00.000Z", algorithmVersion: "1.0.0", featureVersion: "1.0.0",
  dataSnapshotId: "supply-test", trainStart: 2018, trainEnd: 2025, seed: 2027, growth: 0.01,
  provinceBenchmarks: { jiangsu: { historyPrice: 365 } }
};
const unchangedLegacyRun = createForecastRunForModel(project, ensemble, boundOptions);
const originalSupply = JSON.stringify(supplyConfig);
const boundRun = createForecastRunForModel(project, ensemble, { ...boundOptions, supplyDemandInput: { config: supplyConfig, dataset: supplyDataset } });
assert.deepEqual(boundRun.pricesByYear, unchangedLegacyRun.pricesByYear, "接入供需版本不能假装现有模拟算法消费了新输入");
assert.deepEqual(boundRun.quarterPricesByYear, unchangedLegacyRun.quarterPricesByYear);
assert.equal(boundRun.supplyDemandInput.featureConsumption, "not_used_by_demo_model");
assert.equal(boundRun.supplyDemandInput.fingerprint, supplyDataset.fingerprint);
assert.deepEqual(boundRun.supplyDemandInput.configSnapshot, supplyConfig);
assert.deepEqual(boundRun.supplyDemandInput.annualSummary, supplyDataset.annualRows);
assert.deepEqual(boundRun.supplyDemandInput.period, { startYear: 2026, forecastYears: 2 });
assert.deepEqual(boundRun.supplyDemandInput.units, { energy: "MWh", averagePower: "MW", intervalHours: 1 });
assert.equal(boundRun.supplyDemandInput.hourlyByYear, undefined, "版本快照不保存庞大的小时数组");
assert.equal(boundRun.supplyDemandInput.typicalRows, undefined);
assert.equal(JSON.stringify(supplyConfig), originalSupply, "生成预测不修改供需原件");
const configuredProject = { ...project, supplyDemand: { config: supplyConfig } };
assert.equal(validateSupplyDemandRun(configuredProject, boundRun).ok, true);
assert.equal(validateSupplyDemandRun(project, unchangedLegacyRun).ok, true, "未配置供需的历史项目保留原行为");
assert.equal(validateSupplyDemandRun(configuredProject, unchangedLegacyRun).ok, false, "已配置项目不能切回未绑定供需的历史预测");
assert.equal(validateSupplyDemandRun(project, boundRun).ok, false);
assert.equal(validateSupplyDemandRun({ ...configuredProject, province: "shanxi" }, boundRun).ok, false);
assert.equal(validateSupplyDemandRun({ ...configuredProject, startYear: 2027 }, boundRun).ok, false);
assert.equal(validateSupplyDemandRun({ ...configuredProject, id: "different-project" }, boundRun).ok, false);
const snapshotString = JSON.stringify(boundRun.supplyDemandInput);
const changedSupply = JSON.parse(originalSupply);
changedSupply.elements.load.monthlyWeights = changedSupply.elements.load.monthlyWeights.map((value) => value * 2);
assert.equal(validateSupplyDemandRun({ ...project, supplyDemand: { config: changedSupply } }, boundRun).ok, false, "原始配置改动即产生新版本，即使归一化结果相同");
assert.throws(() => createForecastRunForModel(project, ensemble, { ...boundOptions, supplyDemandInput: { config: changedSupply, dataset: supplyDataset } }), /配置版本不一致/);
for (const invalidDataset of [
  { ...supplyDataset, annualRows: supplyDataset.annualRows.slice(1) },
  { ...supplyDataset, typicalRows: supplyDataset.typicalRows.slice(1) },
  { ...supplyDataset, source: { ...supplyDataset.source, intervalHours: 0.25 } },
  { ...supplyDataset, hourlyByYear: { ...supplyDataset.hourlyByYear, 2026: { ...supplyDataset.hourlyByYear[2026], load: Array(8760).fill(2) } } }
]) {
  assert.throws(() => createForecastRunForModel(project, ensemble, { ...boundOptions, supplyDemandInput: { config: supplyConfig, dataset: invalidDataset } }), /供需输入无效/);
}
supplyConfig.elements.load.baseEnergyMwh = 9000;
supplyDataset.annualRows[0].load = 9000;
assert.equal(JSON.stringify(boundRun.supplyDemandInput), snapshotString, "配置和数据后续编辑不能修改预测来源快照");

const grossConfig = JSON.parse(originalSupply);
grossConfig.elements.tieLine.mode = "bidirectional";
for (const direction of ["export", "import"]) {
  const side = grossConfig.elements.tieLine[direction];
  side.baseEnergyMwh = 1e12;
  side.growthRatesByYear[2027] = 0;
  side.monthlyWeights = Array.from({ length: 12 }, (_, month) => direction === "export" ? month + 1 : 12 - month);
  side.hourlyWeightsByMonth = Object.fromEntries(Array.from({ length: 12 }, (_, month) => [month + 1,
    Array.from({ length: 24 }, (_, hour) => direction === "export" ? hour + 1 : 24 - hour)]));
}
const grossDataset = supplyDemand.buildDataset(project, grossConfig);
assert.equal(grossDataset.ok, true);
assert.equal(grossDataset.annualRows[0].tieLine, 0);
assert.doesNotThrow(() => validateSupplyDemandDataset(project, { config: grossConfig, dataset: grossDataset }), "合法大额双向送受不能因浮点抵消被预测接口拒绝");
const reordered = JSON.parse(JSON.stringify(grossDataset));
[reordered.hourlyByYear[2026].tieLine[0], reordered.hourlyByYear[2026].tieLine[1]] = [reordered.hourlyByYear[2026].tieLine[1], reordered.hourlyByYear[2026].tieLine[0]];
assert.throws(() => validateSupplyDemandDataset(project, { config: grossConfig, dataset: reordered }), /时序不一致/, "年度总量相同也不能接受错序小时数据");
// With all-feature rescaling internal conservation still holds,
// but the copied fingerprint must not permit totals unrelated to the raw input.
const wrongTotals = JSON.parse(JSON.stringify(grossDataset));
for (const row of [...wrongTotals.annualRows, ...wrongTotals.typicalRows]) {
  Object.keys(row).filter((key) => !["year", "month", "hour", "representedDays"].includes(key)).forEach((key) => { row[key] *= 2; });
}
Object.values(wrongTotals.hourlyByYear).forEach((year) => Object.keys(year).forEach((key) => { year[key] = year[key].map((value) => value * 2); }));
assert.throws(() => validateSupplyDemandDataset(project, { config: grossConfig, dataset: wrongTotals }), /原始供需配置不一致/, "复制合法指纹不得掩盖与配置不同的供需数值");

// Missing rows must be rejected before forEach / some can silently skip holes.
for (const field of ["annualRows", "typicalRows"]) {
  const count = grossDataset[field].length;
  for (const rows of [new Array(count), [null, ...grossDataset[field].slice(1)], [1, ...grossDataset[field].slice(1)]]) {
    const candidate = { ...grossDataset, [field]: rows };
    assert.throws(() => validateSupplyDemandDataset(project, { config: grossConfig, dataset: candidate }), /供需时序未覆盖完整测算周期/);
  }
}
for (const [field, value] of [
  ["version", 99], ["daysPerYear", 366], ["hourIndexBase", 0], ["typicalDayExpansion", false],
  ["tieLinePositiveDirection", "import"], ["tieLineNegativeDirection", "export"], ["curveReuse", "year_specific"]
]) {
  assert.throws(() => validateSupplyDemandDataset(project, { config: grossConfig,
    dataset: { ...grossDataset, source: { ...grossDataset.source, [field]: value } } }), /不一致/);
}

const sourceProject = { ...project, supplyDemand: { config: JSON.parse(originalSupply) } };
const sourceRun = JSON.parse(JSON.stringify(boundRun));
const rejectSavedSource = (mutate) => {
  const candidate = JSON.parse(JSON.stringify(sourceRun));
  mutate(candidate);
  const before = JSON.stringify(candidate);
  assert.equal(validateSupplyDemandRun(sourceProject, candidate).ok, false);
  assert.equal(JSON.stringify(candidate), before, "invalid saved metadata is retained unchanged for review");
};
for (const [field, value] of [
  ["version", 99], ["version", undefined], ["calendar", "actual_leap_year"], ["hoursPerYear", 8784],
  ["units", null], ["featureConsumption", "used_by_live_model"], ["configSnapshot", null],
  ["annualSummary", []], ["annualSummary", null], ["annualSummary", new Array(project.forecastYears)]
]) rejectSavedSource((candidate) => { candidate.supplyDemandInput[field] = value; });
for (const [field, value] of [["energy", "kWh"], ["averagePower", "kW"], ["intervalHours", 0.25]]) {
  rejectSavedSource((candidate) => { candidate.supplyDemandInput.units[field] = value; });
}
for (const key of ["year", ...supplyDemand.ELEMENTS.map(({ key }) => key), "residualDemand", "tieLineExport", "tieLineImport"]) {
  rejectSavedSource((candidate) => { candidate.supplyDemandInput.annualSummary[0][key] += 1; });
  rejectSavedSource((candidate) => { delete candidate.supplyDemandInput.annualSummary[0][key]; });
}
rejectSavedSource((candidate) => { candidate.supplyDemandInput.annualSummary[0] = null; });
rejectSavedSource((candidate) => { candidate.supplyDemandInput.configSnapshot.elements.load.growthRatesByYear[2027] = null; });
for (const value of [null, false, 0, "", undefined]) {
  assert.equal(validateSupplyDemandRun(project, { supplyDemandInput: value }).ok, false,
    "an existing damaged source field must not fall back to legacy compatibility");
}
assert.equal(validateSupplyDemandRun(project, { id: "legacy-no-source" }).legacy, true);
assert.equal(validateSupplyDemandRun(sourceProject, sourceRun).ok, true);

// Source checks run for every listed version on render. Prohibit the costly
// hourly builder while verifying a full 30-year source using a browser adapter.
const vm = require("node:vm"), fs = require("node:fs");
const sandbox = {
  NE_ENERGY_PROFILES: require("../src/domain/energy-profiles"),
  NE_SUPPLY_DEMAND: { ...supplyDemand, buildDataset() { throw new Error("source checks must not rebuild 8760 data"); } }
};
vm.runInNewContext(fs.readFileSync(require.resolve("../src/domain/price-forecast"), "utf8"), sandbox);
const longProject = { ...project, forecastYears: 30 }, longConfig = supplyDemand.createConfig(longProject);
for (const element of Object.values(longConfig.elements)) {
  element.baseEnergyMwh = 0;
  Object.keys(element.growthRatesByYear).forEach((year) => { element.growthRatesByYear[year] = 0; });
}
const longSource = { ...sourceRun.supplyDemandInput,
  fingerprint: supplyDemand.fingerprint(longProject, longConfig), configSnapshot: longConfig,
  period: { startYear: longProject.startYear, forecastYears: 30 },
  annualSummary: supplyDemand.buildAnnualSummary(longProject, longConfig).annualRows
};
longProject.supplyDemand = { config: longConfig };
for (let index = 0; index < 20; index += 1) {
  assert.equal(sandbox.NE_PRICE_FORECAST.validateSupplyDemandRun(longProject, { supplyDemandInput: longSource }).ok, true);
}

console.log("price forecast tests passed");
