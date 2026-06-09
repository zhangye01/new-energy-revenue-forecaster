"use strict";

const assert = require("node:assert/strict");
const { calculateScenarioResult } = require("../src/domain/revenue-calculator");
const {
  buildResultChartData,
  buildResultSummaryData
} = require("../src/domain/result-report");
const {
  detectTopDriver,
  resultComponentTotals
} = require("../src/domain/compare-analysis");
const {
  buildAnnualResultExportRows,
  buildHourlyResultExportRows
} = require("../src/domain/export-builders");

function flatHours(annualHours) {
  return Array.from({ length: 8760 }, () => annualHours / 8760);
}

function flatPrices(price) {
  return Array.from({ length: 8760 }, () => price);
}

function approx(actual, expected, message, tolerance = 1e-4) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function createProject() {
  return {
    id: "handoff-baseline-project",
    name: "交接黄金链路项目",
    province: "jiangsu",
    assetType: "wind",
    siteType: "offshore",
    hasStorage: true,
    capacityMw: 10,
    startYear: 2026,
    forecastYears: 2,
    energyData: {
      hourlyByYear: {
        2026: flatHours(2000),
        2027: flatHours(2100)
      }
    }
  };
}

function createScenario() {
  return {
    id: "baseline",
    name: "基准场景",
    config: {
      mechanismEnabled: true,
      mechanismRatio: 0.4,
      mechanismPrice: 350,
      mechanismStartYm: "2026-01",
      mechanismEndYm: "2026-12",
      ltPricingMode: "auto",
      ltManualPricesByYear: {},
      ltYear1Pnl: 8,
      ltTargetPnl: 2,
      ltConvergeSpeed: 3,
      envValueMode: "global",
      envManualValuesByYear: {},
      greenCertPrice: 20,
      greenCertRealizeRatio: 0.5,
      greenPremiumPrice: 10,
      greenPremiumRealizeRatio: 0.25,
      carbonEnabled: true,
      carbonPrice: 4,
      carbonRealizeRatio: 0.25,
      feeConfigMode: "global",
      feeManualValuesByYear: {},
      marketOpFee: 6,
      gridAssessFee: 7,
      ancillaryFee: 14,
      otherFee: 3,
      otherIncome: 2,
      storageArbitragePrice: 18,
      storageCapacityCompPrice: 7,
      storageAncillaryRevenuePrice: 10,
      storageOtherRevenuePrice: 3
    }
  };
}

const project = createProject();
const scenario = createScenario();
const run = {
  id: "run",
  pricesByYear: {
    2026: flatPrices(300),
    2027: flatPrices(310)
  }
};

const result = calculateScenarioResult(project, scenario, run);
const chartData = buildResultChartData(result, scenario.config);
const summary = buildResultSummaryData(result);
const annualExportRows = buildAnnualResultExportRows(result);
const hourlyExportRows = buildHourlyResultExportRows(result);
const totals = resultComponentTotals(result);

assert.deepEqual(result.missingYears, []);
assert.deepEqual(chartData.years, ["2026", "2027"]);
assert.equal(chartData.priceSeries.find((item) => item.name === "机制电价").data[1], null);
assert.equal(summary.leadingPositive.label, "配储补充收益");
assert.equal(summary.leadingNegative.label, "综合费用");
assert.equal(detectTopDriver(result), "现货收入");
approx(summary.firstMarketRatio, 0.6, "首年市场化交易电量比例");
approx(totals.mechanismRevenue, 400000, "周期机制收入");
approx(totals.comprehensiveFee, -1230000, "周期综合费用以负值参与对比");

assert.equal(annualExportRows.length, 3);
assert.equal(annualExportRows[0][0], "year");
assert.equal(annualExportRows[1][0], 2026);
assert.equal(annualExportRows[1][13], "342.900000");
assert.equal(hourlyExportRows.length, 8761);
assert.equal(hourlyExportRows[0][0], "time");
assert.equal(hourlyExportRows[1][0], "2026-01-01 00:00");

console.log("baseline flow tests passed");

