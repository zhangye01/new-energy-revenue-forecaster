"use strict";

const assert = require("node:assert/strict");
const {
  buildScenarioVisualThemeTokens,
  buildScenarioVisualEmptyOption,
  scenarioVisualYearInterval,
  buildScenarioVisualOptions
} = require("../src/ui/scenario-charts");

const tokens = buildScenarioVisualThemeTokens("light");
assert.equal(tokens.mechanism, "#3d7ce0");
assert.equal(buildScenarioVisualThemeTokens("dark").axisText, "#b8cae1");
assert.equal(buildScenarioVisualThemeTokens("eye").market, "#78a86e");

const placeholder = buildScenarioVisualEmptyOption("请选择方案", tokens);
assert.equal(placeholder.graphic[0].style.text, "请选择方案");
assert.equal(placeholder.xAxis.show, false);
assert.equal(scenarioVisualYearInterval(Array.from({ length: 24 }), 8), 2);
assert.equal(scenarioVisualYearInterval([], 8), 0);

const rows = [
  {
    yearLabel: "2026",
    energyMwh: 100000,
    marketEnergy: 64000,
    mechanismEnergy: 36000,
    greenCertEnergy: 20000,
    greenPremiumEnergy: 12000,
    carbonEnergy: 16000,
    unredeemedMarketEnergy: 16000,
    mechanismActive: true,
    mechanismPrice: 365,
    tradeImpact: 5.12,
    envImpact: 8.2,
    storageImpact: 38,
    otherIncomeImpact: 2,
    feeImpact: -30,
    netImpact: 23.32,
    ltPnlPrice: 8,
    envUnitValue: 12.8,
    feeTotal: 30,
    storageSupplementPerMwh: 38
  },
  {
    yearLabel: "2030",
    energyMwh: 110000,
    marketEnergy: 110000,
    mechanismEnergy: 0,
    greenCertEnergy: 44000,
    greenPremiumEnergy: 22000,
    carbonEnergy: 44000,
    unredeemedMarketEnergy: 0,
    mechanismActive: false,
    mechanismPrice: 365,
    tradeImpact: 2,
    envImpact: 12.8,
    storageImpact: 38,
    otherIncomeImpact: 2,
    feeImpact: -30,
    netImpact: 24.8,
    ltPnlPrice: 2,
    envUnitValue: 12.8,
    feeTotal: 30,
    storageSupplementPerMwh: 38
  }
];

const options = buildScenarioVisualOptions(rows, tokens);
assert.deepEqual(Object.keys(options), ["energy", "unit", "trend"]);
assert.deepEqual(options.energy.xAxis.data, ["2026", "2030"]);
assert.equal(options.energy.yAxis.length, 2);
assert.deepEqual(options.energy.series.map((item) => item.name), [
  "机制电量",
  "绿证电量",
  "绿电溢价电量",
  "碳收益电量",
  "未兑现市场化电量",
  "机制电价"
]);
assert.deepEqual(options.energy.series[5].data, [365, null]);
assert.equal(options.energy.series[0].data[0], 3.6);
assert.ok(options.energy.tooltip.formatter([
  { axisValueLabel: "2026", dataIndex: 0, marker: "●", seriesName: "机制电量", value: 3.6 },
  { axisValueLabel: "2026", dataIndex: 0, marker: "●", seriesName: "机制电价", value: 365 }
]).includes("市场化交易电量合计：64000 MWh"));

assert.equal(options.unit.series.at(-1).name, "净影响");
assert.deepEqual(options.unit.series.at(-1).data, [23.32, 24.8]);
assert.deepEqual(options.trend.series.map((item) => item.name), [
  "交易策略损益",
  "环境价值度电收益",
  "综合费用",
  "配储补充收益",
  "其他收入"
]);
assert.deepEqual(options.trend.series[0].data, [8, 2]);
assert.equal(options.trend.tooltip.valueFormatter(12.345), "12.35 元/MWh");

const emptyOptions = buildScenarioVisualOptions([{ yearLabel: "2026", energyMwh: 0 }], tokens);
assert.equal(emptyOptions.energy.graphic[0].style.text, "请先完成上网电量配置");

console.log("scenario charts tests passed");
