"use strict";

const assert = require("node:assert/strict");
const { SERIES, buildOption } = require("../src/ui/rough-trend-chart");

function row(year, fields = {}) {
  return { year, spotAvgPrice: 210, capturePrice: 200, fullRevenuePrice: 260,
    mechanismRatio: 1, mechanismAdjustment: 65, ltPnlPrice: 0, envValue: 0,
    storageSupplement: 0, fee: 5, otherIncome: 0, ...fields };
}

const source = Object.freeze({
  rows: Object.freeze([
    Object.freeze(row(2030, { spotAvgPrice: 230, capturePrice: 215, fullRevenuePrice: 210, mechanismRatio: 0, mechanismAdjustment: 0 })),
    Object.freeze(row(2028)), Object.freeze(row(2029))
  ]),
  draft: Object.freeze({ spotNodes: Object.freeze([Object.freeze({ year: 2028, value: 210 })]) }),
  config: Object.freeze({ mechanismEnabled: true, mechanismEndYm: "2029-12", marketOpFee: 1, gridAssessFee: 2, ancillaryFee: 2, otherNetIncome: 0 })
});
const before = JSON.stringify(source);
const visibility = {};
const option = buildOption(source, visibility, {}, 1000);
assert.deepEqual(option.xAxis.data, ["2028", "2029", "2030"]);
assert.deepEqual(option.series.map(({ id }) => id), SERIES.map(({ key }) => key));
assert.equal(option.series.every((series) => series.smooth === false), true);
assert.equal(option.series[1].lineStyle.type, "dashed");
assert.ok(option.series[2].lineStyle.width > option.series[0].lineStyle.width);
assert.equal(option.tooltip.axisPointer.axis, "x");
assert.deepEqual(option.series[0].markPoint.data.map(({ name, coord, symbol }) => [name, coord, symbol]), [
  ["价格节点", ["2028", 210], "circle"], ["测算末年", ["2030", 230], "diamond"]
]);
assert.deepEqual(option.legend.selected, { "现货均价": true, "捕获电价": true, "综合结算价": true });
assert.deepEqual(option.series.map(({ data }) => data), [[210, 210, 230], [200, 200, 215], [260, 260, 210]]);

const hover = (year) => option.tooltip.formatter([{ axisValue: String(year) }]);
assert.match(hover(2028), /价格节点.*现货均价.*210\.00.*捕获电价.*200\.00.*综合结算价.*260\.00.*结算价较捕获价.*\+60\.00/);
assert.match(hover(2030), /测算末年.*较上年主要变动 机制补差（机制到期） -65\.00/);
assert.doesNotMatch(hover(2029), /较上年主要变动|测算末年/);
const unverified = buildOption({ ...source, config: { ...source.config, mechanismEndYm: "2035-12" } }, {});
assert.match(unverified.tooltip.formatter([{ axisValue: "2030" }]), /较上年主要变动 机制补差 -65\.00/);
visibility.spotAvgPrice = false;
visibility.capturePrice = false;
assert.match(hover(2030), /综合结算价.*较上年主要变动/);
assert.doesNotMatch(hover(2030), /现货均价|捕获电价|结算价较捕获价|测算末年/);
const hidden = buildOption(source, visibility);
assert.deepEqual(hidden.legend.selected, { "现货均价": false, "捕获电价": false, "综合结算价": true });
assert.deepEqual(hidden.yAxis, { ...option.yAxis, axisLabel: { ...option.yAxis.axisLabel, formatter: hidden.yAxis.axisLabel.formatter } });
assert.equal(JSON.stringify(source), before, "chart options and hover never mutate snapshots");

const large = { rows: Array.from({ length: 30 }, (_, index) => row(2026 + index, {
  spotAvgPrice: 200 + index, capturePrice: 190 + index, fullRevenuePrice: 280 - index
})) };
const desktop = buildOption(large, {}, {}, 1100);
const narrow = buildOption(large, {}, {}, 350);
const axisYears = ({ xAxis }) => xAxis.data.filter((year, index) => xAxis.axisLabel.interval(index, year));
assert.deepEqual(axisYears(desktop), ["2026", "2030", "2035", "2040", "2045", "2050", "2055"]);
assert.ok(axisYears(narrow).length < axisYears(desktop).length);
assert.equal(axisYears(narrow)[0], "2026");
assert.equal(axisYears(narrow).at(-1), "2055");
assert.ok(desktop.yAxis.min < 190 && desktop.yAxis.max > 280);
assert.equal((desktop.yAxis.max - desktop.yAxis.min) % desktop.yAxis.interval, 0);

const single = buildOption({ rows: [row(2026, { spotAvgPrice: -21, capturePrice: -21, fullRevenuePrice: -21 })], draft: { spotNodes: {} } });
assert.equal(single.xAxis.boundaryGap, true);
assert.deepEqual(axisYears(single), ["2026"]);
assert.ok(single.yAxis.min < -21 && single.yAxis.max > -21 && single.yAxis.max < 0);
assert.equal(single.series[0].markPoint.data[0].symbol, "diamond");
assert.equal(single.series[1].showSymbol, true);

const extreme = buildOption({ rows: [row(2028, { spotAvgPrice: -Number.MAX_VALUE, fullRevenuePrice: Number.MAX_VALUE })] });
assert.ok(Number.isFinite(extreme.yAxis.max) && Number.isFinite(extreme.yAxis.min));
assert.ok(extreme.yAxis.max > extreme.series[2].data[0]);
assert.match(extreme.yAxis.axisLabel.formatter(extreme.yAxis.max), /e\+308$/);

console.log("rough trend chart tests passed");
