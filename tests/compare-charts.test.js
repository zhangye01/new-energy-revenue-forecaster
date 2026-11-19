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
assert.equal(response.series[0].smooth, false, "比例边界按真实折线展示，不作平滑外插");
assert.deepEqual(response.xAxis.data, ["-20%", "0%", "+20%"]);
assert.equal(response.series[0].markLine.data[0].yAxis, 680.5);
assert.ok(response.tooltip.formatter([{ axisValue: "+20%", value: 760 }]).includes("相对基准"));

const negativeResponse = buildSensitivityResponseOption({ name: "费用", series: [-80, -100.123456, -120] }, -100.123456, ["-20%", "0%", "+20%"], tokens);
assert.equal(negativeResponse.series[0].data[1], -100.123456);
assert.equal(negativeResponse.series[0].markLine.data[0].yAxis, -100.123456, "基准线保留原精度和负值");

const priceTarget = { label: "首年度电净价", unit: "元/MWh", decimals: 2 };
const priceTornado = buildSensitivityTornadoOption(factors, 396.257, { rangePercent: 20, topN: "all" }, tokens, priceTarget);
assert.equal(priceTornado.xAxis.name, "相对基准变化 元/MWh");
assert.match(priceTornado.tooltip.formatter([{ axisValue: "利用小时", marker: "●", seriesName: "+20%", value: -0.053 }]),
  /-0\.05 元\/MWh.*基准首年度电净价：396\.26 元\/MWh/);
const priceResponse = buildSensitivityResponseOption({ name: "现货价格", series: [369.25, 396.257, 421.127] },
  396.257, ["-20%", "0%", "+20%"], tokens, priceTarget);
assert.equal(priceResponse.yAxis.name, "元/MWh");
assert.equal(priceResponse.series[0].markLine.data[0].yAxis, 396.257);
assert.equal(priceResponse.series[0].markLine.label.formatter, "基准 396.26 元/MWh");
assert.match(priceResponse.tooltip.formatter([{ axisValue: "+20%", value: 421.127 }]),
  /首年度电净价：421\.13 元\/MWh.*相对基准：24\.87 元\/MWh/);

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
  primaryFees: -60000,
  otherNetIncome: -10000,
  feesAndOtherNetIncome: -70000
};
const baseTotals = {
  spotRevenue: 400000,
  mechanismRevenue: 80000,
  ltPnlRevenue: 10000,
  envRevenue: 20000,
  storageSupplementRevenue: 20000,
  primaryFees: -50000,
  otherNetIncome: 5000,
  feesAndOtherNetIncome: -45000
};
const bridgeItems = buildScenarioBridgeItems(focusTotals, baseTotals, tokens);
assert.equal(bridgeItems.find((item) => item.label === "现货收入").value, 10);
assert.equal(bridgeItems.find((item) => item.label === "三项费用").value, -1);
assert.equal(bridgeItems.find((item) => item.label === "其他净收入").value, -1.5);

const bridge = buildScenarioBridgeOption(focusTotals, baseTotals, tokens);
assert.deepEqual(bridge.xAxis.data, ["现货收入", "差价机制", "交易策略", "环境价值", "配储补充", "三项费用", "其他净收入"]);
assert.equal(bridge.series[0].data.find((item) => item.value === -1).itemStyle.color, tokens.negative);
const noFeeSource = buildScenarioBridgeItems({ ...focusTotals, primaryFees: null, otherNetIncome: null }, baseTotals, tokens);
assert.equal(noFeeSource.at(-1).label, "费用与其他净收入合计");
assert.equal(noFeeSource.at(-1).value, -2.5);

console.log("compare charts tests passed");
