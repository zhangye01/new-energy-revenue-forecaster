"use strict";

const assert = require("node:assert/strict");
const {
  bindPolicyHistoryEvents,
  buildHistoryExportPlan,
  buildHistoryInsightText,
  buildHistoryKpis,
  buildHistoryReadyViewModel
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
  historyExportTypicalDayButton: new FakeTarget(),
  historyExportDistributionButton: new FakeTarget(),
  historyExportHeatmapButton: new FakeTarget(),
  historyExportBoxplotButton: new FakeTarget()
};
bindPolicyHistoryEvents({
  refs: historyEventRefs,
  handlers: {
    changePolicyProvince: (value) => historyEventCalls.push(`province:${value}`),
    changePolicyRegion: (value) => historyEventCalls.push(`region:${value}`),
    changeHistoryStartDate: (value) => historyEventCalls.push(`start:${value}`),
    changeHistoryEndDate: (value) => historyEventCalls.push(`end:${value}`),
    exportHistoryChart: (type) => historyEventCalls.push(`export:${type}`)
  }
});
historyEventRefs.policyFilterProvince.dispatch("change");
historyEventRefs.policyFilterRegion.dispatch("change");
historyEventRefs.historyStartDate.dispatch("change");
historyEventRefs.historyEndDate.dispatch("change");
historyEventRefs.historyExportMonthTrendButton.dispatch("click");
historyEventRefs.historyExportTypicalDayButton.dispatch("click");
historyEventRefs.historyExportDistributionButton.dispatch("click");
historyEventRefs.historyExportHeatmapButton.dispatch("click");
historyEventRefs.historyExportBoxplotButton.dispatch("click");
assert.deepEqual(historyEventCalls, [
  "province:jiangsu",
  "region:east",
  "start:2026-01-01",
  "end:2026-12-31",
  "export:monthTrend",
  "export:typicalDay",
  "export:distribution",
  "export:heatmap",
  "export:boxplot"
]);

const exportPlan = buildHistoryExportPlan({
  provinceLabel: "江苏",
  assetLabel: "风电",
  siteLabel: "海上",
  yearsRangeText: "2026-01-01至2030-12-31",
  exportRows: {
    monthTrend: [["year"]],
    typicalDay: [["hour"]],
    distribution: [["bucket"]],
    heatmap: [["slot"]],
    boxplot: [["month"]]
  },
  sanitizePart: (value) => String(value).replaceAll("-", "")
});
assert.equal(exportPlan.length, 5);
assert.deepEqual(exportPlan[0], ["monthTrend", "江苏-历史现货-风电-海上-20260101至20301231-月度均价趋势对比.csv", [["year"]]]);
assert.equal(exportPlan[4][0], "boxplot");

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

const insight = buildHistoryInsightText({
  dataset: { sourceType: "database", mock: true },
  provinceLabel: "江苏",
  assetLabel: "风电",
  siteLabel: "海上",
  hasStorage: true,
  storagePowerMw: 64,
  storageDurationH: 2,
  yearsRangeText: "2026-01-01至2030-12-31",
  peakTime: "18:00",
  maxStdMonthLabel: "7月",
  maxStd: 42.18
});
assert.match(insight, /江苏省级现货模拟库/);
assert.match(insight, /配储\(64MW \/ 2h\)/);
assert.match(insight, /18:00/);
assert.match(insight, /7月/);
assert.match(insight, /42.2 元\/MWh/);

const fallbackInsight = buildHistoryInsightText({
  dataset: { sourceType: "upload" },
  provinceLabel: "上海",
  assetLabel: "光伏",
  siteLabel: "陆上"
});
assert.match(fallbackInsight, /历史现货数据库/);
assert.doesNotMatch(fallbackInsight, /配储/);

const readyView = buildHistoryReadyViewModel({
  historyData: {
    allValues: [1, 2, 3],
    valueAvg: 2,
    p50: 2,
    p90: 3,
    negativeRatio: 0,
    typicalWorkday: [100, 120, 110],
    maxStdMonth: 0,
    maxStd: 12.34,
    exportRows: { monthTrend: [["year"]] }
  },
  range: {
    startDate: "2026-01-01",
    endDate: "2026-12-31"
  },
  dataset: { sourceType: "database", mock: false },
  project: { hasStorage: false },
  labels: {
    provinceLabel: "江苏",
    assetLabel: "风电",
    siteLabel: "海上"
  },
  monthLabels: ["1月"],
  quarterLabels: ["00:00", "00:15", "00:30"],
  sanitizePart: (value) => String(value)
});
assert.equal(readyView.yearsRangeText, "2026-01-01至2026-12-31");
assert.equal(readyView.exportPlan[0][1], "江苏-历史现货-风电-海上-2026-01-01至2026-12-31-月度均价趋势对比.csv");
assert.equal(readyView.kpis.points, "3 点");
assert.match(readyView.insightText, /00:15/);

console.log("history page tests passed");
