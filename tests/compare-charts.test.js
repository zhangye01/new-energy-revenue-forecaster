"use strict";

const assert = require("node:assert/strict");
const {
  buildCompareThemeTokens,
  buildComparePlaceholderOption,
  buildSensitivityTornadoOption,
  buildSensitivityResponseOption,
  buildScenarioTrendOption,
  buildScenarioRankingOption,
  buildScenarioBridgeItems,
  buildScenarioBridgeOption
} = require("../src/ui/compare-charts");

const tokens = buildCompareThemeTokens("light");
assert.equal(tokens.primary, "#3f82e6");
assert.equal(buildCompareThemeTokens("dark").axisText, "#c0d0e5");
assert.equal(buildCompareThemeTokens("eye").baseline, "#cf8f48");

const placeholder = buildComparePlaceholderOption("暂无方案结果", tokens);
assert.equal(placeholder.graphic[0].style.text, "暂无方案结果");
assert.equal(placeholder.xAxis.show, false);

const factors = [
  { name: "利用小时", lowDelta: -30, highDelta: 30 },
  { name: "现货价格", lowDelta: -10, highDelta: 12 },
  { name: "综合费用", lowDelta: 8, highDelta: -7 }
];
const tornado = buildSensitivityTornadoOption(factors, 680.5, { rangePercent: 20, topN: 2 }, tokens);
assert.deepEqual(tornado.yAxis.data, ["现货价格", "利用小时"]);
assert.equal(tornado.series[0].name, "-20%");
assert.equal(tornado.series[1].data[0], 12);
assert.ok(tornado.tooltip.formatter([{ axisValue: "利用小时", marker: "●", seriesName: "+20%", value: 30 }]).includes("基准首年收益"));

const response = buildSensitivityResponseOption(
  { name: "利用小时", series: [600, 680.5, 760] },
  680.5,
  ["-20%", "0%", "+20%"],
  tokens
);
assert.deepEqual(response.xAxis.data, ["-20%", "0%", "+20%"]);
assert.equal(response.series[0].markLine.data[0].yAxis, 680.5);
assert.ok(response.tooltip.formatter([{ axisValue: "+20%", value: 760 }]).includes("相对基准"));

const available = [
  {
    scenario: { name: "基准", isBaseline: true },
    result: {
      totalFullRevenue: 1000000,
      annualRows: [
        { year: 2026, fullRevenue: 400000 },
        { year: 2027, fullRevenue: 600000 }
      ]
    }
  },
  {
    scenario: { name: "乐观", isBaseline: false },
    result: {
      totalFullRevenue: 1200000,
      annualRows: [
        { year: 2026, fullRevenue: 500000 },
        { year: 2027, fullRevenue: 700000 }
      ]
    }
  }
];

const trend = buildScenarioTrendOption(available, tokens);
assert.deepEqual(trend.xAxis.data, ["2026", "2027"]);
assert.equal(trend.series[0].lineStyle.width, 3.5);
assert.deepEqual(trend.series[1].data, [50, 70]);

const ranking = buildScenarioRankingOption(available, available[0], tokens);
assert.deepEqual(ranking.yAxis.data, ["基准", "乐观"]);
assert.equal(ranking.series[0].data[0].value, 100);
assert.equal(ranking.series[0].markLine.data[0].xAxis, 100);
assert.ok(ranking.tooltip.formatter([{ axisValue: "乐观", value: 120 }]).includes("+20.0 万元"));

const focusTotals = {
  spotRevenue: 500000,
  mechanismRevenue: 100000,
  ltPnlRevenue: 20000,
  envRevenue: 30000,
  storageSupplementRevenue: 40000,
  comprehensiveFee: -60000,
  otherIncome: 10000
};
const baseTotals = {
  spotRevenue: 400000,
  mechanismRevenue: 80000,
  ltPnlRevenue: 10000,
  envRevenue: 20000,
  storageSupplementRevenue: 20000,
  comprehensiveFee: -50000,
  otherIncome: 5000
};
const bridgeItems = buildScenarioBridgeItems(focusTotals, baseTotals, tokens);
assert.equal(bridgeItems.find((item) => item.label === "现货收入").value, 10);
assert.equal(bridgeItems.find((item) => item.label === "综合费用").value, -1);

const bridge = buildScenarioBridgeOption(focusTotals, baseTotals, tokens);
assert.deepEqual(bridge.xAxis.data, ["现货收入", "差价机制", "交易策略", "环境价值", "配储补充", "综合费用", "其他收入"]);
assert.equal(bridge.series[0].data.find((item) => item.value === -1).itemStyle.color, tokens.negative);

console.log("compare charts tests passed");
