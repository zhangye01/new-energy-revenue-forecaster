"use strict";

const assert = require("node:assert/strict");
const {
  calculateScenarioResult,
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
approx(row.envRevenue, 10950, "环境价值收益");
approx(row.storageSupplementRevenue, 0, "无配储时配储补充收益");
approx(row.comprehensiveFee, 87600, "综合费用");
approx(row.otherIncome, 17520, "其他收入");
approx(row.fullRevenue, 948270, "全口径收入");
approx(row.fullRevenuePrice, 108.25, "全口径度电收入");
approx(result.totalEnergy, 8760, "周期电量");
approx(result.totalFullRevenue, 948270, "周期全口径收入");
approx(result.avgFullRevenuePrice, 108.25, "周期平均度电收入");

const firstHour = result.hourlyPreview[0];
assert.equal(firstHour.time, "2026-01-01 00:00");
approx(firstHour.energyMwh, 1, "首小时电量");
approx(firstHour.spotRevenue, 100, "首小时现货收入");
approx(firstHour.fullRevenue, 108.25, "首小时全口径收入");

const missing = calculateScenarioResult(
  createProject(),
  createScenario(),
  { pricesByYear: {} }
);
assert.deepEqual(missing.missingYears, [2026]);
assert.deepEqual(missing.missingPriceYears, [2026]);
assert.deepEqual(missing.missingEnergyYears, []);
assert.equal(missing.annualRows[0].note, "缺失曲线");

console.log("revenue calculator tests passed");
