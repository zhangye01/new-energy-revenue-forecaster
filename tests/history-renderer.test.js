"use strict";

const assert = require("node:assert/strict");
const {
  renderHistoryImportState,
  renderHistoryPrices,
  resetHistoryKpis
} = require("../src/ui/history-renderer");
const historyAnalysis = require("../src/domain/history-analysis");
const historyPage = require("../src/ui/history-page");
const { sanitizeHistoryAnalysis } = require("../src/domain/project-settings");

const refs = {
  historySourceProvince: { textContent: "" },
  historySourceDetails: { textContent: "" },
  historyTrendMode: {},
  historyKpiPoints: { textContent: "1" },
  historyKpiAvg: { textContent: "2" },
  historyKpiP50: { textContent: "3" },
  historyKpiP90: { textContent: "4" },
  historyKpiNegative: { textContent: "5" },
  historyMonthTrendChart: {},
  historyInsightBox: { textContent: "", style: {} }
};

renderHistoryImportState(refs, { province: "jiangsu" }, () => "江苏");
assert.equal(refs.historySourceProvince.textContent, "江苏");
assert.equal(refs.historySourceDetails.textContent, "工作台提供内置省级模拟样本。");
resetHistoryKpis(refs);
assert.equal(refs.historyKpiPoints.textContent, "-");
assert.equal(refs.historyKpiNegative.textContent, "-");

let noDataMessage = "";
const testDataset = { startYear: 2024, endYear: 2024, mock: true, marketPriceLabel: "省级现货模拟价", modelDays: 365,
  years: [{ year: 2024, values: Array(365 * 96).fill(300) }] };
renderHistoryPrices({
  refs,
  appState: { activePage: "history-page", historyAnalysis: {} },
  windowRef: {},
  resolveVisiblePageId: (page) => page,
  sanitizeHistoryAnalysis: () => ({}),
  resetHistoryExportPayloads: () => {},
  ensureHistoryCharts: () => ({
    monthTrend: {
      clear: () => {},
      setOption: (option) => { noDataMessage = option.graphic[0].style.text; }
    }
  }),
  historyThemeTokens: () => ({}),
  historyCharts: {
    buildHistoryNoDataOption: (message) => ({
      graphic: [{ style: { text: message } }]
    })
  },
  queueHistoryChartsResize: () => {}
});
assert.equal(noDataMessage, "图表引擎未加载完成，请稍后重试。");
assert.equal(refs.historyInsightBox.textContent, "图表引擎未加载完成，请稍后重试。");

renderHistoryPrices({
  refs,
  appState: { activePage: "history-page", historyAnalysis: { startDate: "2024-02-29", endDate: "2024-02-29" } },
  windowRef: { echarts: {} },
  getActiveProject: () => ({ id: "leap-day-test", province: "jiangsu" }),
  isProjectCreateCompleted: () => true,
  buildHistorySpotAnalysisDataset: () => testDataset,
  historyAnalysis,
  historyPage,
  ensureHistoryCharts: () => ({
    monthTrend: {
      clear: () => {},
      setOption: (option) => { noDataMessage = option.graphic[0].style.text; }
    }
  }),
  historyCharts: { buildHistoryNoDataOption: (message) => ({ graphic: [{ style: { text: message } }] }) }
});
assert.match(noDataMessage, /2 月 29 日留空/);
assert.match(refs.historyInsightBox.textContent, /2 月 29 日留空/);
assert.equal(refs.historyKpiAvg.textContent, "-", "a missing leap day must not show a zero or the previous day's price");

const project = { id: "history-view", province: "jiangsu", statuses: {}, roughPrice: { snapshots: [{ id: "saved-rough" }] } };
const chartKeys = ["monthTrend", "heatmap", "duration", "intradaySpread"];
const renderedKeys = [];
const exportKeys = [];
const dates = { startDate: "2024-01-01", endDate: "2024-01-03", trendMode: "yoy", heatMode: "weekend" };
renderHistoryPrices({
  refs, appState: { activePage: "history-page", historyAnalysis: dates }, windowRef: { echarts: {} },
  getActiveProject: () => project, getProvinceName: () => "江苏", isProjectCreateCompleted: () => true, sanitizeHistoryAnalysis,
  buildHistorySpotAnalysisDataset: () => testDataset, historyAnalysis, historyPage,
  setHistoryExportPayload: (key) => exportKeys.push(key),
  ensureHistoryCharts: () => Object.fromEntries(chartKeys.map((key) => [key, {
    setOption: () => renderedKeys.push(key)
  }])),
  historyCharts: { buildHistoryChartOptions(data, tokens, options) {
    assert.equal(options.trendMode, "yoy");
    assert.deepEqual(data.heatData[0], [0, 0, 300, 0, 12], "原有周末选项忽略，按所选三天汇总");
    return Object.fromEntries(chartKeys.map((key) => [key, {}]));
  } }
});
assert.deepEqual(renderedKeys, chartKeys);
assert.deepEqual(exportKeys, chartKeys);
assert.equal(refs.historyTrendMode.value, "yoy");
assert.equal(refs.historyKpiAvg.textContent, "300.0 元/MWh");
assert.equal(refs.historySourceDetails.textContent, "使用省级模拟样本，价格口径为省级现货模拟价。");
assert.equal(refs.historyInsightBox.textContent, "2024-01-01 至 2024-01-03");
assert.deepEqual(project.roughPrice.snapshots, [{ id: "saved-rough" }]);
assert.equal(project.statuses["history-page"], "completed");

console.log("history renderer tests passed");
