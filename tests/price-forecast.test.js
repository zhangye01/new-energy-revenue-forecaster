"use strict";

const assert = require("node:assert/strict");
const {
  FORECAST_MODEL_DEFINITIONS,
  MARKET_PRICE_BASIS,
  getHistoryMockShapeFactors,
  hourlyPricesFromQuarterPrices,
  buildForecastPriceSeries,
  countForecastPriceMissing,
  evaluateRunQuality,
  validateForecastPriceData,
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
assert.deepEqual(factors, getHistoryMockShapeFactors(createProject({ hasStorage: false, storagePowerMw: null, storageDurationH: null })));
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
for (const storageFields of [
  { hasStorage: false, storagePowerMw: null, storageDurationH: null },
  { hasStorage: true, storagePowerMw: 80, storageDurationH: 6, storageNote: "更新配储" }
]) {
  assert.deepEqual(buildForecastPriceSeries(createProject(storageFields), ensemble, 2300, 0.01, {
    provinceBenchmarks: { jiangsu: { historyPrice: 365 } }
  }), series, "配储开关、功率和时长不能改变项目面对的市场价");
}

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
assert.equal(run.marketPriceBasis, MARKET_PRICE_BASIS);
assert.equal(MARKET_PRICE_BASIS, "project_storage_independent_v1");
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

// Stored flags and correct array lengths cannot turn a missing/non-number price
// into a real zero. Sparse holes must be visited as well.
const integrityProject = createProject({ forecastYears: 1 });
const integrityRun = { status: "publishable_forced", qualityGatePassed: true, missingPoints: 0,
  pricesByYear: { 2026: Array(8760).fill(0) }, mape: 0, smape: 0, mae: 0, rmse: 0 };
integrityRun.pricesByYear[2026][10] = -125.5;
assert.equal(validateForecastPriceData(integrityProject, integrityRun).ok, true, "negative and zero prices are valid");
assert.equal(validateForecastPriceData(null, integrityRun).ok, true, "legacy hourly versions do not require new metadata");
for (const value of [null, undefined, NaN, Infinity, -Infinity, "0", "", false]) {
  const bad = structuredClone(integrityRun);
  bad.pricesByYear[2026][16] = value;
  const before = structuredClone(bad);
  assert.deepEqual(validateForecastPriceData(integrityProject, bad).invalidYears, [2026]);
  assert.equal(countForecastPriceMissing(integrityProject, bad), 1);
  assert.deepEqual(bad, before, "validation preserves the original invalid value for inspection");
  evaluateRunQuality(integrityProject, bad, { hard: { mape: 1, smape: 1, missingPoints: 99 }, soft: { mae: 100, rmse: 100 } });
  assert.equal(bad.status, "validated", "a permissive quality threshold cannot bypass price integrity");
  assert.equal(bad.qualityGatePassed, false);
  assert.deepEqual(bad.pricesByYear, before.pricesByYear);
}
const sparsePrices = structuredClone(integrityRun);
delete sparsePrices.pricesByYear[2026][400];
assert.equal(countForecastPriceMissing(integrityProject, sparsePrices), 1);
for (const prices of [Array(8759).fill(0), Array(8761).fill(0), new Array(8760), { length: 8760 }]) {
  assert.equal(validateForecastPriceData(integrityProject, { pricesByYear: { 2026: prices } }).ok, false);
}
const quarterRun = { ...integrityRun, granularityMinutes: 15, pointsPerYear: 35040,
  quarterPricesByYear: { 2026: Array(35040).fill(-50) } };
assert.equal(validateForecastPriceData(integrityProject, quarterRun).ok, true);
assert.ok(hourlyPricesFromQuarterPrices(quarterRun.quarterPricesByYear[2026]).every((value) => value === -50));
for (const prices of [undefined, Array(35039).fill(0), Array(35041).fill(0), new Array(35040), { length: 35040 }]) {
  assert.equal(validateForecastPriceData(integrityProject, { ...quarterRun, quarterPricesByYear: { 2026: prices } }).ok, false);
}
const badQuarters = Array(35040).fill(0);
badQuarters[13] = null;
assert.equal(validateForecastPriceData(integrityProject, { ...quarterRun, quarterPricesByYear: { 2026: badQuarters } }).ok, false);
assert.deepEqual(hourlyPricesFromQuarterPrices(badQuarters), [], "quarter conversion never coerces null to zero");
assert.equal(badQuarters[13], null);
assert.equal(validateForecastPriceData({ ...integrityProject, forecastYears: 2 }, integrityRun).ok, false, "the project period is authoritative");

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
const duplicatedProject = { ...configuredProject, id: "copied-forecast", duplicationTargetProjectId: "copied-forecast",
  duplicatedFromProjectIds: [project.id] };
const preservedRunBytes = JSON.stringify(boundRun);
assert.equal(validateSupplyDemandRun(duplicatedProject, boundRun).ok, true, "相同项目副本可沿用原现货预测来源");
assert.equal(validateSupplyDemandRun({ ...duplicatedProject, id: "copied-twice", duplicationTargetProjectId: "copied-twice",
  duplicatedFromProjectIds: [duplicatedProject.id, project.id] }, boundRun).ok, true);
for (const change of [
  { duplicatedFromProjectIds: ["unrelated"] }, { duplicationTargetProjectId: "old-copy" },
  { id: "backup-collision", restoredFromProjectIds: [duplicatedProject.id] },
  { province: "shanxi" }, { startYear: 2027 }, { forecastYears: 1 },
  { supplyDemand: { config: { ...supplyConfig, extraEditedInput: true } } }
]) {
  assert.equal(validateSupplyDemandRun({ ...duplicatedProject, ...change }, boundRun).ok, false,
    `复制来源验证仍拒绝真实边界/配置变化及失效身份:${JSON.stringify(change).slice(0, 120)}`);
}
assert.equal(JSON.stringify(boundRun), preservedRunBytes, "复制来源验证不能改写现货预测任何字段");
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

const shareConfig = supplyDemand.prepareShareConfig(project, JSON.parse(originalSupply));
shareConfig.elements.load.curveOverridesByYear = { 2027: {
  monthlyWeights: [0.5, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0],
  hourlyWeightsByMonth: { 7: Array.from({ length: 24 }, (_, hour) => hour === 5 ? 1 : 0) }
} };
const shareDataset = supplyDemand.buildDataset(project, shareConfig);
assert.equal(shareDataset.ok, true, shareDataset.errors.join("；"));
assert.equal(shareDataset.source.curveReuse, "default_with_year_overrides");
const shareProject = { ...project, supplyDemand: { config: shareConfig } };
const shareRun = createForecastRunForModel(shareProject, ensemble, {
  ...boundOptions, supplyDemandInput: { config: shareConfig, dataset: shareDataset }
});
assert.equal(validateSupplyDemandRun(shareProject, shareRun).ok, true);
assert.equal(validateSupplyDemandRun(shareProject, boundRun).ok, false, "单年曲线调整应使旧供需指纹退出生效");
assert.deepEqual(shareRun.supplyDemandInput.configSnapshot.elements.load.curveOverridesByYear, shareConfig.elements.load.curveOverridesByYear);

const alternateConfig = structuredClone(shareConfig);
const alternateWind = alternateConfig.elements.wind;
supplyDemand.switchGenerationMode(project, alternateWind, "capacity_hours");
alternateWind.capacityHours.baseCapacityMw = 120;
alternateWind.capacityHours.baseUtilizationHours = 1800;
supplyDemand.switchGenerationMode(project, alternateWind, "energy");
assert.notEqual(supplyDemand.fingerprint(project, alternateConfig), shareDataset.fingerprint);
assert.equal(validateSupplyDemandRun({ ...shareProject, supplyDemand: { config: alternateConfig } }, shareRun).ok, true);
const alteredSnapshot = { ...shareRun, supplyDemandInput: { ...shareRun.supplyDemandInput, configSnapshot: alternateConfig } };
assert.equal(validateSupplyDemandRun(shareProject, alteredSnapshot).ok, false, "历史快照须与原始完整指纹一致");
alternateConfig.elements.load.baseEnergyMwh += 1;
assert.equal(validateSupplyDemandRun({ ...shareProject, supplyDemand: { config: alternateConfig } }, shareRun).ok, false);
assert.equal(validateSupplyDemandRun({ ...shareProject, supplyDemand: { config: shareConfig, requiresProvinceReview: true } }, shareRun).ok, false);

assert.throws(() => validateSupplyDemandDataset(shareProject, { config: shareConfig, dataset: { ...shareDataset,
  source: { ...shareDataset.source, curveReuse: grossDataset.source.curveReuse }
} }), /曲线复用方式.*不一致/);

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
