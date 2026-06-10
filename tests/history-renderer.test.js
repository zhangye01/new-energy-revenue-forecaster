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

console.log("history renderer tests passed");
