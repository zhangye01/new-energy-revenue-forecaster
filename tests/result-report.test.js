"use strict";

const assert = require("node:assert/strict");
const {
  buildResultChartData,
  buildResultSummaryData,
  getResultContributionItems,
  resultMoneyWan,
  resultSeriesValue
} = require("../src/domain/result-report");

const result = {
  annualRows: [
    {
      year: 2026,
      energyMwh: 20000,
      spotAvgPrice: 300,
      capturePrice: 310,
      fullRevenuePrice: 342.9,
      spotRevenue: 6200000,
      mechanismRevenue: 400000,
      ltPnlRevenue: 96000,
      envRevenue: 162000,
      storageSupplementRevenue: 760000,
      comprehensiveFee: 600000,
      otherIncome: 40000,
      fullRevenue: 7058000,
      nonMechanismEnergy: 12000
    },
    {
      year: 2027,
      energyMwh: 21000,
      spotAvgPrice: 310,
      capturePrice: 315,
      fullRevenuePrice: 338.5,
      spotRevenue: 6615000,
      mechanismRevenue: 0,
      ltPnlRevenue: 105000,
      envRevenue: 170000,
      storageSupplementRevenue: 798000,
      comprehensiveFee: 630000,
      otherIncome: 42000,
      fullRevenue: 7100000,
      nonMechanismEnergy: 21000
    }
  ]
};

const cfg = {
  mechanismEnabled: true,
  mechanismPrice: 350,
  mechanismStartYm: "2026-01",
  mechanismEndYm: "2026-12",
  marketOpFee: 6,
  gridAssessFee: 7,
  ancillaryFee: 14,
  otherFee: 3,
  otherIncome: 2
};

assert.equal(resultMoneyWan(123456), 12.35);
assert.equal(resultSeriesValue(12.345678), 12.3457);

const contributionItems = getResultContributionItems(result, cfg);
assert.deepEqual(
  contributionItems.map((item) => item.label),
  ["现货市场收入", "差价机制结算", "交易策略损益", "环境价值兑现", "配储补充收益", "三项费用", "其他净收入"]
);
assert.equal(contributionItems.find((item) => item.label === "三项费用").amount, -1107000);
assert.equal(contributionItems.find((item) => item.label === "其他净收入").amount, -41000);

const chartData = buildResultChartData(result, cfg);
assert.deepEqual(chartData.years, ["2026", "2027"]);
assert.equal(chartData.annualComponents.length, 7);
assert.deepEqual(
  chartData.annualComponents.find((item) => item.name === "三项费用").data,
  [-54, -56.7]
);
assert.deepEqual(chartData.annualComponents.find((item) => item.name === "其他净收入").data, [-2, -2.1]);
assert.deepEqual(chartData.annualNet.data, [705.8, 710]);

const mechanismSeries = chartData.priceSeries.find((item) => item.name === "机制电价");
assert.ok(mechanismSeries);
assert.deepEqual(mechanismSeries.data, [350, null]);

assert.deepEqual(
  chartData.firstYearBridgeItems.map((item) => item.label),
  ["捕获电价", "差价机制", "交易策略", "环境价值", "配储补充", "三项费用", "其他净收入", "度电净价"]
);
assert.equal(chartData.firstYearBridgeItems.find((item) => item.label === "三项费用").value, -27);
assert.equal(chartData.firstYearBridgeItems.find((item) => item.label === "其他净收入").value, -1);
assert.equal(chartData.contributionItems.find((item) => item.label === "现货市场收入").valueWan, 1281.5);

const noMechanismChartData = buildResultChartData(result, { mechanismEnabled: false });
assert.equal(noMechanismChartData.priceSeries.some((item) => item.name === "机制电价"), false);
assert.deepEqual(noMechanismChartData.annualComponents.at(-1).data, [-56, -58.8]);
assert.equal(noMechanismChartData.annualComponents.at(-1).name, "费用与其他净收入合计");
assert.equal(noMechanismChartData.firstYearBridgeItems.at(-2).value, -28);

const summaryData = buildResultSummaryData(result, cfg);
assert.equal(summaryData.first.year, 2026);
assert.equal(summaryData.maxRevenueRow.year, 2027);
assert.equal(summaryData.minRevenueRow.year, 2026);
assert.equal(summaryData.unitLift, 32.89999999999998);
assert.equal(summaryData.liftText, "增加");
assert.equal(summaryData.leadingPositive.label, "配储补充收益");
assert.equal(summaryData.leadingNegative.label, "三项费用");
assert.equal(summaryData.firstMarketRatio, 0.6);

const emptySummaryData = buildResultSummaryData({ annualRows: [] });
assert.equal(emptySummaryData.first, null);
assert.deepEqual(emptySummaryData.contributionItems, []);

console.log("result report tests passed");
