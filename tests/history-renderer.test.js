"use strict";

const assert = require("node:assert/strict");
const {
  renderHistoryImportState,
  renderHistoryPrices,
  resetHistoryKpis
} = require("../src/ui/history-renderer");

const refs = {
  historySourceProvince: { textContent: "" },
  historyKpiPoints: { textContent: "1" },
  historyKpiAvg: { textContent: "2" },
  historyKpiP50: { textContent: "3" },
  historyKpiP90: { textContent: "4" },
  historyKpiNegative: { textContent: "5" },
  historyMonthTrendChart: {},
  historyInsightBox: { textContent: "", style: {} }
};

renderHistoryImportState(refs, { province: "jiangsu" }, () => "江苏");
assert.equal(refs.historySourceProvince.textContent, "当前省份：江苏");
resetHistoryKpis(refs);
assert.equal(refs.historyKpiPoints.textContent, "-");
assert.equal(refs.historyKpiNegative.textContent, "-");

let noDataMessage = "";
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
  buildHistorySpotAnalysisDataset: () => ({ startYear: 2024, endYear: 2024, years: [{ year: 2024, values: Array(365 * 96).fill(300) }] }),
  historyAnalysis: require("../src/domain/history-analysis"),
  ensureHistoryCharts: () => ({
    monthTrend: {
      clear: () => {},
      setOption: (option) => { noDataMessage = option.graphic[0].style.text; }
    }
  }),
  historyCharts: { buildHistoryNoDataOption: (message) => ({ graphic: [{ style: { text: message } }] }) }
});
assert.match(noDataMessage, /所选日期范围暂无可分析数据/);
assert.match(refs.historyInsightBox.textContent, /不包含2月29日/);
assert.equal(refs.historyKpiAvg.textContent, "-", "a missing leap day must not show a zero or the previous day's price");

console.log("history renderer tests passed");
