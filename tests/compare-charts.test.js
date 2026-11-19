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
  { name: "现货价格水平", lowDelta: -30, highDelta: 30, lowInput: "−100 元/MWh", highInput: "+100 元/MWh" },
  { name: "机制电量占比", lowDelta: 8, highDelta: -7, lowInput: "−1.5 个百分点", highInput: "+20 个百分点" },
  { name: "捕获价差", lowDelta: -1, highDelta: 2, lowInput: "−40%", highInput: "+40%" }
];
const tornado = buildSensitivityTornadoOption(factors, 680.5, tokens);
assert.deepEqual(tornado.yAxis.data, ["捕获价差", "机制电量占比", "现货价格水平"]);
assert.deepEqual(tornado.series.map(({ name }) => name), ["低位扰动", "高位扰动"]);
assert.equal(tornado.series[1].data[1], -7);
const tornadoTip = tornado.tooltip.formatter([
  { dataIndex: 1, seriesIndex: 0, marker: "●", seriesName: "低位扰动", value: 8 },
  { dataIndex: 1, seriesIndex: 1, marker: "●", seriesName: "高位扰动", value: -7 }
]);
assert.match(tornadoTip, /机制电量占比.*低位扰动（−1\.5 个百分点）：\+8\.00 元\/MWh/);
assert.match(tornadoTip, /高位扰动（\+20 个百分点）：-7\.00 元\/MWh.*基准全周期综合度电均价/);
const missingTornado = buildSensitivityTornadoOption([{
  name: "捕获价差", lowDelta: null, highDelta: null, lowInput: "−50 元/MWh", highInput: "+50 元/MWh",
  available: false, note: "缺少完整逐时数据"
}], 680.5, tokens);
assert.deepEqual(missingTornado.series.map(({ data }) => data), [[null], [null]], "缺少测算结果时维持空值");
assert.match(missingTornado.tooltip.formatter([
  { dataIndex: 0, seriesIndex: 0, seriesName: "低位扰动", value: null },
  { dataIndex: 0, seriesIndex: 1, seriesName: "高位扰动", value: null }
]), /低位扰动（−50 元\/MWh）：—.*高位扰动（\+50 元\/MWh）：—.*缺少完整逐时数据/);

const inactiveTornado = buildSensitivityTornadoOption([{
  name: "机制电量占比", lowDelta: 0, highDelta: 0, lowInput: "0%", highInput: "100%", applicable: false
}], 680.5, tokens);
assert.match(inactiveTornado.tooltip.formatter([
  { dataIndex: 0, seriesIndex: 0, seriesName: "低位扰动", value: 0 }
]), /当前基准下此变量不适用/);

const response = buildSensitivityResponseOption(
  { name: "机制电量占比", axisTitle: "机制电量占比调整（百分点）", axisUnit: "个百分点", axisValues: [-1.5, 0, 5, 10],
    axisLabels: ["−1.5 个百分点", "0 个百分点", "+5 个百分点", "+10 个百分点"], series: [681, 680.5, 672, 665] },
  680.5,
  tokens
);
assert.equal(response.series[0].smooth, false, "比例边界按真实折线展示，不作平滑外插");
assert.equal(response.xAxis.type, "value", "边界截断后按真实步幅定位");
assert.equal(response.xAxis.name, "机制电量占比调整（百分点）");
assert.deepEqual([response.xAxis.min, response.xAxis.max], [-1.5, 10]);
assert.deepEqual(response.series[0].data, [[-1.5, 681], [0, 680.5], [5, 672], [10, 665]]);
assert.equal(response.series[0].markLine.data[0].yAxis, 680.5);
assert.match(response.tooltip.formatter([{ dataIndex: 1, value: [0, 680.5] }]), /基准（0 个百分点）.*相对基准：0\.00 元\/MWh/);

const absoluteRatio = {
  name: "机制电量占比", axisTitle: "机制电量占比（%）", axisUnit: "%",
  axisValues: [0, 5, 10], axisLabels: ["0%", "5%", "10%"], series: [682, 680.5, 679],
  baselineInput: 3.75
};
const absoluteResponse = buildSensitivityResponseOption(absoluteRatio, 680.5, tokens);
assert.deepEqual(absoluteResponse.series[0].data, [[0, 682], [5, 680.5], [10, 679]], "基准参考线不增加额外测算点");
assert.equal(absoluteResponse.series[0].markLine.data[1].xAxis, 3.75);
assert.equal(absoluteResponse.series[0].markLine.data[1].label.formatter, "基准输入 3.75%");
assert.doesNotMatch(absoluteResponse.tooltip.formatter([{ dataIndex: 0, value: [0, 682] }]), /基准（0%）/);
const onGrid = buildSensitivityResponseOption({ ...absoluteRatio, baselineInput: 5 }, 680.5, tokens);
assert.match(onGrid.tooltip.formatter([{ dataIndex: 1, value: [5, 680.5] }]), /基准（5%）/);
const inactive = buildSensitivityResponseOption({ ...absoluteRatio, baselineInput: 0, applicable: false }, 680.5, tokens);
assert.equal(inactive.series[0].markLine.data.length, 1);
assert.doesNotMatch(inactive.tooltip.formatter([{ dataIndex: 0, value: [0, 680.5] }]), /基准（0%）/);
assert.match(inactive.tooltip.formatter([{ dataIndex: 0, value: [0, 680.5] }]), /当前基准下此变量不适用/);

const negativeResponse = buildSensitivityResponseOption({ name: "捕获价差", axisTitle: "捕获价差调整（%）", axisUnit: "%",
  axisValues: [-20, 0, 20], axisLabels: ["−20%", "0%", "+20%"], series: [-80, -100.123456, -120] }, -100.123456, tokens);
assert.deepEqual(negativeResponse.series[0].data[1], [0, -100.123456]);
assert.equal(negativeResponse.series[0].markLine.data[0].yAxis, -100.123456, "基准线保留原精度和负值");
assert.equal(negativeResponse.yAxis.axisLine.onZero, false, "横轴包含负值时，纵轴及其单位留在图表左侧");

const priceTarget = { label: "全周期综合度电均价", unit: "元/MWh", decimals: 2 };
const priceTornado = buildSensitivityTornadoOption(factors, 396.257, tokens, priceTarget);
assert.equal(priceTornado.xAxis.name, "相对基准变化 元/MWh");
assert.match(priceTornado.tooltip.formatter([{ dataIndex: 0, seriesIndex: 1, marker: "●", seriesName: "高位扰动", value: -0.053 }]),
  /高位扰动（\+40%）：-0\.05 元\/MWh.*基准全周期综合度电均价：396\.26 元\/MWh/);
const priceResponse = buildSensitivityResponseOption({ name: "现货价格水平", axisTitle: "现货价格水平调整（元/MWh）", axisUnit: "元/MWh",
  axisValues: [-100, 0, 100], axisLabels: ["−100 元/MWh", "0 元/MWh", "+100 元/MWh"], series: [369.25, 396.257, 421.127] },
396.257, tokens, priceTarget);
assert.equal(priceResponse.yAxis.name, "元/MWh");
assert.equal(priceResponse.series[0].markLine.data[0].yAxis, 396.257);
assert.equal(priceResponse.series[0].markLine.label.formatter, "基准 396.26 元/MWh");
assert.match(priceResponse.tooltip.formatter([{ dataIndex: 2, value: [100, 421.127] }]),
  /\+100 元\/MWh.*全周期综合度电均价：421\.13 元\/MWh.*相对基准：24\.87 元\/MWh/);

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
