"use strict";

const assert = require("node:assert/strict");
const historyCharts = require("../src/ui/history-charts");

const sampleData = {
  monthly: [
    { month: "2024-12", avg: -12, p10: -80, p50: -10, p90: 15, count: 96 },
    { month: "2025-01", avg: 20, p10: -5, p50: 15, p90: 66, count: 190 },
    { month: "2025-02", avg: null, p10: null, p50: null, p90: null, count: 0 },
    { month: "2025-03", avg: 35, p10: 10, p50: 33, p90: 100, count: 95 }
  ],
  heatMin: -63.4,
  heatMax: 120.2,
  heatData: [[0, 0, -63.4, 75, 8], [1, 1, 120.2, 0, 4], [2, 2, null, null, 0], [23, 3, 0, 0, 4]],
  duration: {
    points: [[0, 160, 0], [5, 160, 0], [25, 80, 5], [75, 0, 25], [100, -80, 75]],
    p10: -80,
    p50: 0,
    p90: 80,
    negativeRatio: 25,
    zeroRatio: 50,
    sampleCount: 100
  },
  intraday: [
    { month: "2024-12", p25: 10, p50: 22, p75: 45, count: 1 },
    { month: "2025-01", p25: 15, p50: 27, p75: 55, count: 1 },
    { month: "2025-02", p25: null, p50: null, p75: null, count: 0 }
  ]
};

const light = historyCharts.buildHistoryThemeTokens("light");
const dark = historyCharts.buildHistoryThemeTokens("dark");
const eye = historyCharts.buildHistoryThemeTokens("eye");
assert.equal(light.axisText, "#5b6f89");
assert.equal(dark.tooltipBg, "rgba(19, 31, 46, 0.95)");
assert.equal(eye.legendText, "#435d4d");

const placeholder = historyCharts.buildHistoryNoDataOption("暂无数据", light);
assert.equal(placeholder.graphic[0].style.text, "暂无数据");
assert.equal(placeholder.graphic[0].style.fill, light.axisText);

const snapshotBefore = JSON.stringify(sampleData);
const allOptions = historyCharts.buildHistoryChartOptions(sampleData, light);
assert.deepEqual(Object.keys(allOptions), ["monthTrend", "heatmap", "duration", "intradaySpread"]);
const { monthTrend, heatmap, duration, intradaySpread } = allOptions;

assert.deepEqual(monthTrend.xAxis.data, ["2024-12", "2025-01", "2025-02", "2025-03"]);
assert.equal(monthTrend.yAxis.name, "元/MWh");
const [monthlyBand, monthlyLine] = monthTrend.series;
assert.deepEqual(monthlyLine.data, [-12, 20, null, 35]);
assert.equal(monthlyLine.connectNulls, false);
assert.deepEqual(monthlyBand.encode, { x: 0, y: [1, 2] });
assert.deepEqual(monthlyBand.data, [[0, -80, 15], [1, -5, 66], [3, 10, 100]]);
const renderRange = (band, categoryIndex) => band.renderItem({}, { value: () => categoryIndex, coord: (point) => point });
assert.deepEqual(renderRange(monthlyBand, 0).shape.points, [[0, -80], [1, -5], [1, 66], [0, 15]]);
assert.equal(renderRange(monthlyBand, 1), undefined);
assert.equal(renderRange(monthlyBand, 3).type, "line");
assert.match(monthTrend.tooltip.formatter([{ axisValue: "2025-01" }]), /20\.00 元\/MWh.*-5\.00 元\/MWh 至 66\.00 元\/MWh.*190 段/);
assert.match(monthTrend.tooltip.formatter([{ axisValue: "2025-02" }]), /暂无有效样本/);

const yoy = historyCharts.buildHistoryChartOptions(sampleData, light, { trendMode: "yoy" }).monthTrend;
assert.equal(yoy.xAxis.data.length, 12);
assert.deepEqual(yoy.legend.data, ["2024年", "2025年"]);
assert.equal(yoy.legend.selectedMode, true);
assert.deepEqual(yoy.series.find(({ id }) => id === "year-2024-band").data, [[11, -80, 15]]);
assert.deepEqual(yoy.series.find(({ id }) => id === "year-2025-mean").data.slice(0, 4), [20, null, 35, null]);
assert.match(yoy.tooltip.formatter([{ axisValue: "1月", seriesName: "2025年" }]), /2025年.*20\.00 元\/MWh.*190 段/);
assert.doesNotMatch(yoy.tooltip.formatter([{ axisValue: "1月", seriesName: "2024年" }]), /20\.00/);

assert.equal(heatmap.xAxis.data.length, 24);
assert.equal(heatmap.xAxis.data[0], "00:00");
assert.equal(heatmap.yAxis.data.length, 12);
assert.equal(heatmap.visualMap.dimension, 2);
assert.equal(heatmap.visualMap.seriesIndex, 0);
assert.equal(heatmap.visualMap.min, -121);
assert.equal(heatmap.visualMap.max, 121);
assert.equal(heatmap.visualMap.inRange.color[1], light.heatNeutral);
const [validCells, missingCells] = heatmap.series;
assert.deepEqual(validCells.data, [sampleData.heatData[0], sampleData.heatData[1], sampleData.heatData[3]]);
assert.deepEqual(missingCells.data, [[2, 2, 0, null, 0]]);
assert.equal(missingCells.itemStyle.color, light.missing);
assert.match(heatmap.tooltip.formatter({ value: sampleData.heatData[0] }), /1月 00:00–01:00.*-63\.40 元\/MWh.*75\.00%.*8 段/);
assert.match(heatmap.tooltip.formatter({ value: sampleData.heatData[3] }), /23:00–24:00.*均价 0\.00 元\/MWh/);
assert.match(heatmap.tooltip.formatter({ value: missingCells.data[0] }), /暂无有效样本/);
assert.doesNotMatch(heatmap.tooltip.formatter({ value: missingCells.data[0] }), /均价/);
const positiveMap = historyCharts.buildHeatmapOption({ ...sampleData, heatMin: 10.4, heatMax: 70.3 }, dark);
assert.equal(positiveMap.visualMap.min, 10);
assert.equal(positiveMap.visualMap.max, 71);
assert.notEqual(positiveMap.visualMap.inRange.color[1], dark.heatNeutral);

assert.deepEqual([duration.xAxis.min, duration.xAxis.max], [0, 100]);
assert.deepEqual(duration.series[0].data, sampleData.duration.points);
assert.deepEqual(duration.series[0].markLine.data, [{ yAxis: 0 }]);
assert.match(duration.tooltip.formatter([{ value: [25, 80, 5] }]), /80\.00 元\/MWh.*高于该价位 5\.00%.*负价占比 25\.00%.*P10.*P50.*P90/);
assert.match(duration.tooltip.formatter([{ value: [0, 100, 0.0005] }]), /0\.0005%/);

const [intradayBand, intradayLine] = intradaySpread.series;
assert.deepEqual(intradayBand.data, [[0, 10, 45], [1, 15, 55]]);
assert.deepEqual(intradayLine.data, [22, 27, null]);
assert.equal(intradaySpread.yAxis.min, 0);
assert.match(intradaySpread.tooltip.formatter([{ axisValue: "2025-01" }]), /27\.00 元\/MWh.*15\.00 元\/MWh 至 55\.00 元\/MWh.*1 天/);
assert.match(historyCharts.buildIntradaySpreadOption({ intraday: [sampleData.intraday.at(-1)] }, light).graphic[0].style.text, /没有完整的 96 点样本日/);
assert.equal(JSON.stringify(sampleData), snapshotBefore);

console.log("history charts tests passed");
