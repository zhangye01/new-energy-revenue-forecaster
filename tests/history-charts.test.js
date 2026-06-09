"use strict";

const assert = require("node:assert/strict");
const historyCharts = require("../src/ui/history-charts");

const sampleData = {
  lineColors: ["#111111", "#222222"],
  trendSeries: [
    { name: "2026年", type: "line", data: [100, 120], color: "#111111" }
  ],
  typicalWorkday: Array.from({ length: 96 }, (_, index) => index),
  typicalWeekend: Array.from({ length: 96 }, (_, index) => index + 100),
  histogramBins: 3,
  histogramLabels: ["0-100", "100-200", "200-300"],
  histogramCounts: [2, 5, 1],
  heatMin: 12.3,
  heatMax: 456.7,
  heatData: [[0, 0, 100], [1, 1, 120]],
  boxplotData: [[1, 2, 3, 4, 5]]
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

const monthTrend = historyCharts.buildMonthTrendOption(sampleData, light);
assert.deepEqual(monthTrend.color, sampleData.lineColors);
assert.equal(monthTrend.xAxis.data.length, 12);
assert.equal(monthTrend.yAxis.name, "元/MWh");
assert.equal(monthTrend.series[0].name, "2026年");

const typicalDay = historyCharts.buildTypicalDayOption(sampleData, light);
assert.equal(typicalDay.xAxis.data.length, 96);
assert.equal(typicalDay.xAxis.axisLabel.interval, 7);
assert.deepEqual(typicalDay.series.map((item) => item.name), ["工作日", "周末"]);
assert.equal(typicalDay.series[1].lineStyle.type, "dashed");

const distribution = historyCharts.buildDistributionOption(sampleData, light);
assert.deepEqual(distribution.xAxis.data, sampleData.histogramLabels);
assert.deepEqual(distribution.series[0].data, sampleData.histogramCounts);
assert.equal(distribution.series[0].itemStyle.color({ dataIndex: 0 }), "#ff8a1f");
assert.equal(distribution.series[0].itemStyle.color({ dataIndex: 1 }), "#2f78e8");
assert.equal(distribution.series[0].itemStyle.color({ dataIndex: 2 }), "#6c46d1");

const heatmap = historyCharts.buildHeatmapOption(sampleData, light);
assert.equal(heatmap.xAxis.data.length, 24);
assert.equal(heatmap.yAxis.data.length, 12);
assert.equal(heatmap.visualMap.min, 12);
assert.equal(heatmap.visualMap.max, 457);
assert.equal(heatmap.tooltip.formatter({ value: [0, 0, 100] }), "1月 00时<br>100 元/MWh");

const boxplot = historyCharts.buildBoxplotOption(sampleData, light);
assert.equal(boxplot.tooltip.trigger, "item");
assert.deepEqual(boxplot.series[0].data, sampleData.boxplotData);

const allOptions = historyCharts.buildHistoryChartOptions(sampleData, light);
assert.equal(allOptions.monthTrend.yAxis.name, "元/MWh");
assert.equal(allOptions.heatmap.series[0].type, "heatmap");
assert.equal(allOptions.boxplot.series[0].type, "boxplot");

console.log("history charts tests passed");
