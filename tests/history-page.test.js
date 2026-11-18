"use strict";

const assert = require("node:assert/strict");
const {
  bindPolicyHistoryEvents,
  buildHistoryExportPlan,
  buildHistoryKpis,
  buildHistoryReadyViewModel,
  createPolicyHistoryEventHandlers
} = require("../src/ui/history-page");

class FakeTarget {
  constructor(value = "") {
    this.value = value;
    this.handlers = {};
  }

  addEventListener(name, handler) {
    this.handlers[name] = handler;
  }

  dispatch(name) {
    this.handlers[name]?.({ target: this });
  }
}

const historyEventCalls = [];
const historyEventRefs = {
  policyFilterProvince: new FakeTarget("jiangsu"),
  policyFilterRegion: new FakeTarget("east"),
  historyStartDate: new FakeTarget("2026-01-01"),
  historyEndDate: new FakeTarget("2026-12-31"),
  historyExportMonthTrendButton: new FakeTarget(),
  historyTrendMode: new FakeTarget("yoy"),
  historyExportHeatmapButton: new FakeTarget(),
  historyExportDurationButton: new FakeTarget(),
  historyExportIntradaySpreadButton: new FakeTarget()
};
bindPolicyHistoryEvents({
  refs: historyEventRefs,
  handlers: {
    changePolicyProvince: (value) => historyEventCalls.push(`province:${value}`),
    changePolicyRegion: (value) => historyEventCalls.push(`region:${value}`),
    changeHistoryStartDate: (value) => historyEventCalls.push(`start:${value}`),
    changeHistoryEndDate: (value) => historyEventCalls.push(`end:${value}`),
    changeHistoryTrendMode: (value) => historyEventCalls.push(`trend:${value}`),
    exportHistoryChart: (type) => historyEventCalls.push(`export:${type}`)
  }
});
historyEventRefs.policyFilterProvince.dispatch("change");
historyEventRefs.policyFilterRegion.dispatch("change");
historyEventRefs.historyStartDate.dispatch("change");
historyEventRefs.historyEndDate.dispatch("change");
historyEventRefs.historyTrendMode.dispatch("change");
historyEventRefs.historyExportMonthTrendButton.dispatch("click");
historyEventRefs.historyExportHeatmapButton.dispatch("click");
historyEventRefs.historyExportDurationButton.dispatch("click");
historyEventRefs.historyExportIntradaySpreadButton.dispatch("click");
assert.deepEqual(historyEventCalls, [
  "province:jiangsu",
  "region:east",
  "start:2026-01-01",
  "end:2026-12-31",
  "trend:yoy",
  "export:monthTrend",
  "export:heatmap",
  "export:duration",
  "export:intradaySpread"
]);

const historyHandlerCalls = [];
let policyFilters = { provinceKey: "jiangsu", regionKey: "east" };
let historyAnalysisState = { startDate: "2026-01-01", endDate: "2026-12-31" };
const historyHandlers = createPolicyHistoryEventHandlers({
  getPolicyFilters: () => policyFilters,
  setPolicyFilters: (nextFilters) => {
    policyFilters = nextFilters;
  },
  getHistoryAnalysis: () => historyAnalysisState,
  setHistoryAnalysis: (nextState) => {
    historyAnalysisState = nextState;
  },
  sanitizeHistoryAnalysis: (state) => ({
    ...state,
    sanitized: true
  }),
  renderPolicyPanel: () => historyHandlerCalls.push("render-policy"),
  renderHistoryPrices: () => historyHandlerCalls.push("render-history"),
  schedulePersistAppData: () => historyHandlerCalls.push("persist"),
  exportHistoryChart: (type) => historyHandlerCalls.push(`export:${type}`)
});
historyHandlers.changePolicyProvince("zhejiang");
historyHandlers.changePolicyRegion("south");
historyHandlers.changeHistoryStartDate("2027-01-01");
historyHandlers.changeHistoryEndDate("2027-12-31");
historyHandlers.changeHistoryTrendMode("yoy");
historyHandlers.exportHistoryChart("monthTrend");
assert.deepEqual(policyFilters, { provinceKey: "zhejiang", regionKey: "south" });
assert.deepEqual(historyAnalysisState, {
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  trendMode: "yoy",
  sanitized: true
});
assert.deepEqual(historyHandlerCalls, [
  "render-policy",
  "persist",
  "render-policy",
  "persist",
  "render-history",
  "persist",
  "render-history",
  "persist",
  "render-history",
  "persist",
  "export:monthTrend"
]);

const exportPlan = buildHistoryExportPlan({
  provinceLabel: "江苏",
  yearsRangeText: "2024-01-01 至 2025-12-31",
  exportRows: {
    monthTrend: [["month"], ["2024-01"]],
    heatmap: [["slot"]],
    duration: [["price"]],
    intradaySpread: [["spread"]]
  },
  sanitizePart: (value) => value.replaceAll("-", "")
});
assert.deepEqual(exportPlan.map(([name]) => name), ["monthTrend", "heatmap", "duration", "intradaySpread"]);
assert.deepEqual(exportPlan[0], ["monthTrend", "江苏-省级模拟样本-20240101 至 20251231-月度电价趋势.csv", [
  ["month", "sample_source", "price_basis"], ["2024-01", "省级模拟样本", "省级现货模拟价"]
]]);
assert.match(exportPlan[1][1], /月份与小时热力图\.csv$/);

const kpis = buildHistoryKpis({
  pointCount: 12345,
  valueAvg: 321.456,
  p50: 310.12,
  p90: 450.98,
  negativeRatio: 0.1234
});
assert.deepEqual(kpis, {
  points: "12,345 点",
  avg: "321.5 元/MWh",
  p50: "310.1 元/MWh",
  p90: "451.0 元/MWh",
  negative: "0.12%"
});

const readyView = buildHistoryReadyViewModel({
  historyData: {
    coverage: { expectedPoints: 4, samplePoints: 3 },
    valueAvg: 2, p50: 2, p90: 3, negativeRatio: 0,
    exportRows: { monthTrend: [["month"], ["2025-01"]] }
  },
  range: { startDate: "2025-01-01", endDate: "2025-12-31" },
  dataset: { mock: true, marketPriceLabel: "省级现货模拟价" },
  provinceLabel: "江苏"
});
assert.equal(readyView.yearsRangeText, "2025-01-01 至 2025-12-31");
assert.equal(readyView.sourceKind, "省级模拟样本");
assert.equal(readyView.basisLabel, "省级现货模拟价");
assert.equal(readyView.coverage, "75.0%");
assert.equal(readyView.exportPlan[0][1], "江苏-省级模拟样本-2025-01-01 至 2025-12-31-月度电价趋势.csv");
assert.equal(readyView.kpis.points, "3 点");
assert.equal(buildHistoryReadyViewModel().coverage, "—");

console.log("history page tests passed");
