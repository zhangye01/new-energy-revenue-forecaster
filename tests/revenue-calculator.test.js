"use strict";

const assert = require("node:assert/strict");
const {
  calculateScenarioResult,
  calculateStorageSpotPreview,
  hourIndexToTimestamp
} = require("../src/domain/revenue-calculator");

function approx(actual, expected, message, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function fullYearHours(value) {
  return Array.from({ length: 8760 }, () => value);
}

function createProject() {
  return {
    capacityMw: 1,
    siteType: "offshore",
    hasStorage: false,
    startYear: 2026,
    forecastYears: 1,
    energyData: {
      hourlyByYear: {
        2026: fullYearHours(1)
      }
    }
  };
}

function createScenario() {
  return {
    config: {
      mechanismEnabled: true,
      mechanismRatio: 0.5,
      mechanismPrice: 120,
      mechanismStartYm: "2026-01",
      mechanismEndYm: "2026-12",
      ltPricingMode: "auto",
      ltYear1Pnl: 10,
      ltTargetPnl: 0,
      ltConvergeSpeed: 5,
      envValueMode: "global",
      greenCertPrice: 5,
      greenCertRealizeRatio: 0.2,
      greenPremiumPrice: 4,
      greenPremiumRealizeRatio: 0.3,
      carbonEnabled: true,
      carbonPrice: 3,
      carbonRealizeRatio: 0.1,
      feeConfigMode: "global",
      marketOpFee: 1,
      gridAssessFee: 2,
      ancillaryFee: 3,
      otherFee: 4,
      otherIncome: 2,
      storageArbitragePrice: 99,
      storageCapacityCompPrice: 99,
      storageAncillaryRevenuePrice: 99,
      storageOtherRevenuePrice: 99
    }
  };
}

assert.equal(hourIndexToTimestamp(2026, 0), "2026-01-01 00:00");
assert.equal(hourIndexToTimestamp(2026, 8759), "2026-12-31 23:00");

const result = calculateScenarioResult(
  createProject(),
  createScenario(),
  { pricesByYear: { 2026: fullYearHours(100) } }
);

assert.deepEqual(result.missingYears, []);
assert.equal(result.annualRows.length, 1);
assert.equal(result.hourlyPreview.length, 8760);

const row = result.annualRows[0];
approx(row.annualHours, 8760, "年度等效小时");
approx(row.energyMwh, 8760, "年度电量");
approx(row.spotAvgPrice, 100, "现货均价");
approx(row.capturePrice, 100, "捕获电价");
approx(row.spotRevenue, 876000, "现货收入");
approx(row.mechanismRatio, 0.5, "机制占比");
approx(row.mechanismRevenue, 87600, "机制收入");
approx(row.nonMechanismEnergy, 4380, "市场化交易电量");
approx(row.ltPnlPrice, 10, "交易策略度电损益");
approx(row.ltPnlRevenue, 43800, "交易策略损益");
approx(row.envRevenue, 9636, "环境价值收益只计绿证与绿电溢价");
approx(row.storageSupplementRevenue, 0, "无配储时配储补充收益");
approx(row.comprehensiveFee, 87600, "综合费用");
approx(row.otherIncome, 17520, "其他收入");
approx(row.fullRevenue, 946956, "全口径收入");
approx(row.fullRevenuePrice, 108.1, "全口径度电收入");
approx(result.totalEnergy, 8760, "周期电量");
approx(result.totalFullRevenue, 946956, "周期全口径收入");
approx(result.avgFullRevenuePrice, 108.1, "周期平均度电收入");

const firstHour = result.hourlyPreview[0];
assert.equal(firstHour.time, "2026-01-01 00:00");
approx(firstHour.energyMwh, 1, "首小时电量");
approx(firstHour.spotRevenue, 100, "首小时现货收入");
approx(firstHour.fullRevenue, 108.1, "首小时全口径收入与年度一致");

for (const net of [-7.5, 0, 2.75]) {
  const scenario = createScenario();
  scenario.config.feeConfigMode = "manual";
  scenario.config.feeManualValuesByYear = { 2026: { marketOpFee: 1, gridAssessFee: 2, ancillaryFee: 3,
    otherNetIncome: net, otherFee: 400, otherIncome: 200 } };
  const signed = calculateScenarioResult(createProject(), scenario, { pricesByYear: { 2026: fullYearHours(100) } });
  approx(signed.annualRows[0].fullRevenuePrice, 110.1 + net, "逐年录入净值只计一次");
  approx(signed.hourlyPreview[0].fullRevenue, 110.1 + net, "年度和逐时净额计算一致");
}

const missing = calculateScenarioResult(
  createProject(),
  createScenario(),
  { pricesByYear: {} }
);
assert.deepEqual(missing.missingYears, [2026]);
assert.deepEqual(missing.missingPriceYears, [2026]);
assert.deepEqual(missing.missingEnergyYears, []);
assert.equal(missing.annualRows[0].note, "缺失曲线");

for (const hasStorage of [false, true]) for (const value of [null, undefined, NaN, Infinity, "0", false]) {
  const project = { ...createProject(), hasStorage, storagePowerMw: 0.2, storageDurationH: 2 };
  const prices = fullYearHours(100);
  prices[123] = value;
  const before = structuredClone(prices);
  const rejected = calculateScenarioResult(project, createScenario(), { pricesByYear: { 2026: prices } });
  assert.deepEqual(rejected.missingPriceYears, [2026]);
  assert.deepEqual(rejected.missingYears, [2026]);
  assert.equal(rejected.hourlyPreview.length, 0);
  assert.equal(rejected.totalFullRevenue, 0);
  assert.deepEqual(prices, before);
}
const sparse = fullYearHours(0);
delete sparse[8759];
assert.deepEqual(calculateScenarioResult(createProject(), createScenario(), { pricesByYear: { 2026: sparse } }).missingYears, [2026]);
const quarterBad = { granularityMinutes: 15, pricesByYear: { 2026: fullYearHours(100) },
  quarterPricesByYear: { 2026: Array(35040).fill(100) } };
quarterBad.quarterPricesByYear[2026][0] = null;
assert.deepEqual(calculateScenarioResult(createProject(), createScenario(), quarterBad).missingYears, [2026],
  "calculation independently checks the declared 15-minute source even when hourly prices look valid");
const signed = fullYearHours(0);
signed[0] = -100;
const signedResult = calculateScenarioResult(createProject(), createScenario(), { pricesByYear: { 2026: signed } });
assert.deepEqual(signedResult.missingYears, []);
assert.equal(signedResult.hourlyPreview[0].spotRevenue, -100);
assert.equal(signedResult.hourlyPreview[1].spotRevenue, 0);

const storageProject = { ...createProject(), hasStorage: true, forecastYears: 2,
  storagePowerMw: 1, storageDurationH: 1, storageRoundTripEfficiency: 0.8 };
const storageScenario = createScenario();
storageScenario.config.storageRoundTripEfficiency = 0.95;
const storageHours = storageProject.energyData.hourlyByYear;
storageHours[2026] = fullYearHours(0);
storageHours[2026][0] = 1;
storageHours[2027] = [...storageHours[2026]];
const storagePrices = fullYearHours(100);
storagePrices[1] = 300;
const storageRun = { pricesByYear: { 2026: storagePrices, 2027: [...storagePrices] } };
const storageBefore = structuredClone({ storageProject, storageScenario, storageRun });
const storagePreview = calculateStorageSpotPreview(storageProject, storageScenario, storageRun);
const newStorageResult = calculateScenarioResult(storageProject, storageScenario, storageRun);
assert.deepEqual(storagePreview, {
  annualRows: [2026, 2027].map((year) => ({ year, withoutStorageSpotRevenue: 100, withStorageSpotRevenue: 240, incrementalRevenue: 140 })),
  totalWithoutStorageSpotRevenue: 200, totalWithStorageSpotRevenue: 480, totalIncrementalRevenue: 280, roundTripEfficiency: 0.8
});
newStorageResult.annualRows.forEach((row, index) => {
  assert.equal(row.storageDispatch.revenueMode, "spot_increment_only");
  assert.equal(row.storageDispatch.roundTripEfficiency, 0.8, "设备往返效率优先");
  assert.equal(row.storageDispatch.independentSupplementRevenue, 0);
  assert.equal(row.storageSupplementRevenue, storagePreview.annualRows[index].incrementalRevenue);
  assert.equal(row.storageDispatch.withStorageSpotRevenue, storagePreview.annualRows[index].withStorageSpotRevenue);
});
assert.deepEqual({ storageProject, storageScenario, storageRun }, storageBefore, "自动测算与正式测算都保留原输入");
const { storageRoundTripEfficiency, ...legacyEquipment } = storageProject;
const legacyPreview = calculateStorageSpotPreview(legacyEquipment, storageScenario, storageRun);
assert.equal(legacyPreview.totalIncrementalRevenue, 370,
  "旧项目在补录设备效率前沿用原方案效率");
assert.equal(legacyPreview.roundTripEfficiency, 0.95);
assert.equal(calculateStorageSpotPreview(legacyEquipment, { config: {} }, storageRun).roundTripEfficiency, 0.9);
assert.equal(calculateStorageSpotPreview(storageProject, storageScenario, { pricesByYear: { 2026: storagePrices } }), null,
  "测算周期还有年份缺少价格时不展示不完整的合计");
const missingSecondYear = { ...storageProject, energyData: { hourlyByYear: { 2026: storageHours[2026] } } };
assert.equal(calculateStorageSpotPreview(missingSecondYear, storageScenario, storageRun), null,
  "测算周期还有年份缺少电量时不展示不完整的合计");

// A later-year fault must never replace a previously saved complete result with
// a partial first-year total, even when activation/readiness flags were forged.
const runner = require("../src/ui/result-runner");
const calculationChecks = require("../src/domain/result-calculation");
const protectedProject = { ...createProject(), forecastYears: 2, statuses: { "results-page": "completed" },
  resultsByScenario: { saved: { marker: "original complete result" } } };
protectedProject.energyData.hourlyByYear[2027] = fullYearHours(1);
const protectedBefore = structuredClone(protectedProject);
const damagedRun = { id: "forced", status: "publishable_forced", qualityGatePassed: true,
  pricesByYear: { 2026: fullYearHours(100), 2027: fullYearHours(100) } };
damagedRun.pricesByYear[2027][100] = null;
const rejectedSave = runner.runScenarioCalculation({ project: protectedProject, scenario: { id: "saved", ...createScenario() },
  run: damagedRun, resultCalculation: { ...calculationChecks, validateCalculationReadiness: () => ({ ok: true }) }, calculateScenarioResult });
assert.equal(rejectedSave.status, "missing_curves");
assert.deepEqual(rejectedSave.result.missingPriceYears, [2027]);
assert.deepEqual(protectedProject, protectedBefore);
for (const badPeriod of [{ startYear: null }, { startYear: 2026.5 }, { forecastYears: 0 }, { forecastYears: null }]) {
  assert.throws(() => calculateScenarioResult({ ...createProject(), ...badPeriod }, createScenario(),
    { pricesByYear: { 2026: fullYearHours(100) } }), /有效测算年份/,
  "an empty invalid-year list from a malformed period must not permit calculation");
}

console.log("revenue calculator tests passed");
