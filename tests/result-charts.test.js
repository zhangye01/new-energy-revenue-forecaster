"use strict";

const assert = require("node:assert/strict");
const {
  buildResultChartTokens,
  buildResultPlaceholderOption,
  buildResultChartOptions
} = require("../src/ui/result-charts");

const baseTokens = {
  axisText: "#5b6f89",
  axisLine: "#bfd0e4",
  splitLine: "rgba(151, 170, 196, 0.24)",
  legendText: "#5b6f89",
  tooltipBg: "rgba(255, 255, 255, 0.96)",
  tooltipBorder: "#c9d8eb",
  baseline: "#ea9150",
  primary: "#3f82e6",
  secondary: "#3fa096",
  tertiary: "#76aa57",
  negative: "#d77762"
};

const tokens = buildResultChartTokens(baseTokens);
assert.equal(tokens.spot, baseTokens.primary);
assert.equal(tokens.mechanism, baseTokens.baseline);
assert.equal(tokens.fee, baseTokens.negative);

const placeholder = buildResultPlaceholderOption("请先发起基准测算", tokens);
assert.equal(placeholder.graphic[0].style.text, "请先发起基准测算");
assert.equal(placeholder.xAxis.show, false);

const chartData = {
  years: ["2026", "2027"],
  annualComponents: [
    { name: "现货收入", colorKey: "spot", data: [600, 650] },
    { name: "综合费用", colorKey: "fee", data: [-60, -63] }
  ],
  annualNet: { name: "全口径收入", data: [685.8, 710.85] },
  priceSeries: [
    { name: "捕获电价", colorKey: "spot", data: [300, 310] },
    { name: "机制电价", colorKey: "mechanism", data: [350, null] }
  ],
  firstYearBridgeItems: [
    { label: "捕获电价", value: 300, colorKey: "spot" },
    { label: "综合费用", value: -30, colorKey: "fee" }
  ],
  contributionItems: [
    { label: "现货市场收入", valueWan: 1250, colorKey: "spot" },
    { label: "综合费用", valueWan: -123, colorKey: "fee" }
  ]
};

const options = buildResultChartOptions(chartData, tokens, { yearInterval: 2 });
assert.deepEqual(Object.keys(options), ["annualStack", "pricePath", "waterfall", "contribution"]);
assert.equal(options.annualStack.xAxis.axisLabel.interval, 2);
assert.equal(options.annualStack.series[0].type, "bar");
assert.equal(options.annualStack.series[0].stack, "revenue");
assert.equal(options.annualStack.series[2].type, "line");
assert.deepEqual(options.pricePath.series[1].data, [350, null]);
assert.equal(options.pricePath.series[1].connectNulls, false);
assert.deepEqual(options.waterfall.xAxis.data, ["捕获电价", "综合费用"]);
assert.equal(options.waterfall.series[0].data[1].itemStyle.color, tokens.fee);
assert.deepEqual(options.contribution.yAxis.data, ["现货市场收入", "综合费用"]);
assert.equal(options.contribution.series[0].data[1].value, -123);
assert.equal(options.annualStack.tooltip.valueFormatter(12.345), "12.35 万元");
assert.equal(options.pricePath.tooltip.valueFormatter(301.236), "301.24 元/MWh");

console.log("result charts tests passed");

