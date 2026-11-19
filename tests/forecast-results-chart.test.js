"use strict";

const assert = require("node:assert/strict");
const { buildOption } = require("../src/ui/forecast-results-chart");

const shortSeries = Object.freeze([
  Object.freeze({ code: "lstm", label: "LSTM", prices: Object.freeze([-1234.5, null, 125]) }),
  Object.freeze({ code: "xgboost", label: "XGBoost", prices: Object.freeze([0, 0, Infinity]) }),
  Object.freeze({ code: "ensemble", label: "Ensemble", prices: Object.freeze([320, 400, 380]) })
]);
const source = Object.freeze({ years: Object.freeze([2028, 2029, 2030]), series: shortSeries });
const visibility = { lstm: true, xgboost: true, ensemble: true };
const colors = { blue: "#112233", orange: "#223344", green: "#334455", panel: "#eeeeee", lineStrong: "#123456" };
const option = buildOption(source, visibility, colors, 390);

assert.deepEqual(option.xAxis.data, ["2028", "2029", "2030"]);
assert.equal(option.xAxis.boundaryGap, false);
assert.equal(option.xAxis.axisLabel.interval(0), true);
assert.equal(option.xAxis.axisLabel.interval(2), true);
assert.deepEqual(option.legend, {
  show: false, selectedMode: "multiple", data: ["LSTM", "XGBoost", "Ensemble"],
  selected: { LSTM: true, XGBoost: true, Ensemble: true }
});
assert.deepEqual(option.series.map(({ id, symbol, lineStyle, itemStyle }) => [id, symbol, lineStyle.type, lineStyle.color, itemStyle.color]), [
  ["lstm", "circle", "solid", "#112233", "#112233"],
  ["xgboost", "diamond", "dashed", "#223344", "#223344"],
  ["ensemble", "rect", "solid", "#334455", "#334455"]
]);
assert.ok(option.series.every(({ showSymbol, connectNulls }) => showSymbol && connectNulls === false));
assert.ok(option.series[2].lineStyle.width > option.series[0].lineStyle.width);
assert.deepEqual(option.series.map(({ data }) => data), [[-1234.5, null, 125], [0, 0, null], [320, 400, 380]]);
assert.ok(option.yAxis.min <= -1234.5 && option.yAxis.max >= 400);
assert.equal(option.tooltip.backgroundColor, colors.panel);
assert.equal(option.tooltip.className, "forecast-result-chart-tooltip");
assert.equal(option.tooltip.borderColor, colors.lineStrong);
assert.match(option.tooltip.formatter([{ axisValue: "2028", dataIndex: 2 }]), /2028 年.*元\/MWh.*LSTM　-1,234\.50.*XGBoost　0\.00.*Ensemble　320\.00/);
assert.match(option.tooltip.formatter([{ dataIndex: 1 }]), /2029 年.*LSTM　—/);
assert.equal(option.tooltip.formatter([{ dataIndex: -1 }]), "");

visibility.lstm = false;
const updatedTooltip = option.tooltip.formatter([{ axisValue: "2028" }]);
assert.doesNotMatch(updatedTooltip, /LSTM|-1,234\.50/);
assert.match(updatedTooltip, /XGBoost　0\.00.*Ensemble　320\.00/);
const filtered = buildOption(source, visibility);
assert.equal(filtered.legend.selected.LSTM, false);
assert.deepEqual([filtered.yAxis.min, filtered.yAxis.max, filtered.yAxis.interval],
  [option.yAxis.min, option.yAxis.max, option.yAxis.interval]);
assert.deepEqual(filtered.series.map(({ data }) => data), option.series.map(({ data }) => data));
assert.deepEqual(visibility, { lstm: false, xgboost: true, ensemble: true });

const years = Array.from({ length: 30 }, (_, index) => 2028 + index);
const longSeries = { years, series: [{ code: "lstm", label: "LSTM", prices: years.map((_, index) => 110 + index) }] };
const small = buildOption(longSeries, {}, {}, 320);
const wide = buildOption(longSeries, {}, {}, 1070);
const tickPositions = (chart) => years.map((_, index) => index).filter(chart.xAxis.axisLabel.interval);
assert.equal(tickPositions(small)[0], 0);
assert.equal(tickPositions(small).at(-1), 29);
assert.equal(tickPositions(wide)[0], 0);
assert.equal(tickPositions(wide).at(-1), 29);
assert.ok(tickPositions(small).length < tickPositions(wide).length);

const single = buildOption({ years: [2028], series: [{ code: "lstm", label: "<LSTM>", prices: [-0] }] });
assert.equal(single.xAxis.boundaryGap, true);
assert.equal(single.xAxis.axisLabel.interval(0), true);
assert.ok(single.yAxis.max > 0 && single.yAxis.min < 0);
assert.match(single.tooltip.formatter([{ dataIndex: 0 }]), /&lt;LSTM&gt;　-0\.00/);
const partial = buildOption({ years: source.years, series: [
  source.series[1], { code: "lstm", prices: [null, undefined, Infinity] }
] });
assert.deepEqual(partial.legend.data, ["XGBoost"]);
assert.doesNotMatch(partial.tooltip.formatter([{ dataIndex: 0 }]), /LSTM/);
assert.match(partial.aria.label.description, /各模型/);
const extreme = buildOption({ years: [2028, 2029], series: [
  { code: "ensemble", label: "Ensemble", prices: [-Number.MAX_VALUE, Number.MAX_VALUE] }
] });
assert.ok([extreme.yAxis.min, extreme.yAxis.max, extreme.yAxis.interval].every(Number.isFinite));
assert.ok(extreme.series[0].data.every(Number.isFinite));
assert.match(extreme.yAxis.axisLabel.formatter(extreme.yAxis.max), /e\+308/);
assert.match(extreme.tooltip.formatter([{ dataIndex: 0 }]), /-1\.80E308/);
assert.equal(buildOption({ years: [2028], series: [{ code: "ensemble", prices: [null] }] }), null);
assert.equal(buildOption({ years: [2028], series: [{ code: "unknown", prices: [1] }] }), null);
assert.equal(buildOption({ years: Array(1), series: [{ code: "lstm", prices: [1] }] }), null);
assert.equal(buildOption(), null);

console.log("forecast results chart tests passed");
