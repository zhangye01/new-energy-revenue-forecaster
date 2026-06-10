"use strict";

const assert = require("node:assert/strict");
const {
  applyCompareView,
  bindCompareEvents,
  buildCompareAvailabilityView,
  buildCompareOverviewView,
  buildCompareTableRowsHtml,
  buildScenarioFocusListHtml,
  buildSensitivityFactorListHtml,
  renderCompareReadyState,
  resetComparePageState,
  renderCompareNoProjectState,
  renderCompareNoResultsState
} = require("../src/ui/compare-page");

const tokens = {
  primary: "#3f82e6",
  palette: ["#3f82e6", "#3fa096", "#76aa57"]
};

class FakeTarget {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.handlers = {};
    this.checked = false;
  }

  addEventListener(name, handler) {
    this.handlers[name] = handler;
  }

  closest() {
    return this;
  }

  dispatch(name, event = {}) {
    this.handlers[name]?.({ target: this, ...event });
  }
}

const compareEventCalls = [];
const compareTabButton = new FakeTarget({ compareView: "scenario" });
const sensitivityList = new FakeTarget();
const sensitivityFactor = new FakeTarget({ sensitivityFactor: "hours" });
const sensitivityVariable = new FakeTarget({ sensitivityVariable: "price" });
const sensitivityRange = new FakeTarget();
const scenarioFocusList = new FakeTarget();
const scenarioFocus = new FakeTarget({ compareFocusScenario: "up" });
bindCompareEvents({
  refs: {
    compareTabButtons: [compareTabButton],
    compareSensitivityFactorList: sensitivityList,
    compareSensitivityRange: sensitivityRange,
    compareScenarioFocusList: scenarioFocusList
  },
  handlers: {
    changeCompareView: (value) => compareEventCalls.push(`view:${value}`),
    selectSensitivityFactor: (value) => compareEventCalls.push(`factor:${value}`),
    toggleSensitivityVariable: (value, checked) => compareEventCalls.push(`variable:${value}:${checked}`),
    changeSensitivityControls: () => compareEventCalls.push("controls"),
    selectScenarioFocus: (value) => compareEventCalls.push(`scenario:${value}`)
  }
});
compareTabButton.dispatch("click");
sensitivityList.dispatch("click", { target: sensitivityFactor });
sensitivityVariable.checked = true;
sensitivityList.dispatch("change", { target: sensitivityVariable });
sensitivityRange.dispatch("change");
scenarioFocusList.dispatch("click", { target: scenarioFocus });
assert.deepEqual(compareEventCalls, [
  "view:scenario",
  "factor:hours",
  "variable:price:true",
  "controls",
  "scenario:up"
]);

const availabilityView = buildCompareAvailabilityView({
  available: [{ scenario: { id: "base" }, result: {} }],
  comparePeriod: "2026-2056"
});
assert.deepEqual(
  availabilityView.metrics.map((metric) => [metric.refKey, metric.value, metric.hint]),
  [
    ["compareMetricPeriod", "2026-2056", undefined],
    ["compareMetricCompareCount", "1 个", "已完成测算"],
    ["compareMetricScenarioCount", "1 个", "至少 2 个方案"]
  ]
);

const factorHtml = buildSensitivityFactorListHtml({
  tokens,
  activeFactorKey: "hours",
  allFactors: [
    { key: "hours", name: "利用小时", note: "上网电量变化", sensitivity: 20, colorIndex: 0 },
    { key: "price", name: "现货价格", note: "电价变化", sensitivity: 12, colorIndex: 1 }
  ],
  enabledFactors: [
    { key: "hours", name: "利用小时", note: "上网电量变化", sensitivity: 20, colorIndex: 0 }
  ]
});
assert.match(factorHtml, /data-sensitivity-variable="hours" checked/);
assert.match(factorHtml, /compare-variable-option muted/);
assert.match(factorHtml, /data-sensitivity-factor="hours"/);
assert.match(factorHtml, /20.0 万元/);

const available = [
  {
    scenario: { id: "base", name: "基准<场景>", isBaseline: true },
    result: {
      totalFullRevenue: 1000000,
      avgFullRevenuePrice: 30.123,
      annualRows: [{ energyMwh: 100, fullRevenue: 400000, capturePrice: 280.567 }]
    }
  },
  {
    scenario: { id: "up", name: "乐观", isBaseline: false },
    result: {
      totalFullRevenue: 1200000,
      avgFullRevenuePrice: 35.5,
      annualRows: [{ energyMwh: 100, fullRevenue: 500000, capturePrice: 300 }]
    }
  }
];

const focusHtml = buildScenarioFocusListHtml({
  available,
  baseline: available[0],
  activeScenarioId: "up",
  asCompactMoney: (value) => `${Math.round(value / 10000)}万元`
});
assert.match(focusHtml, /基准&lt;场景&gt;/);
assert.match(focusHtml, /compare-factor-button active/);
assert.match(focusHtml, /\+20.0 万元/);

const tableHtml = buildCompareTableRowsHtml({
  available,
  baseline: available[0],
  asCompactMoney: (value) => `${Math.round(value / 10000)}万元`,
  detectTopDriver: () => "交易<策略>"
});
assert.match(tableHtml, /基准&lt;场景&gt; <span class="table-tag">基准<\/span>/);
assert.match(tableHtml, /交易&lt;策略&gt;/);
assert.match(tableHtml, /280.57 元\/MWh/);
assert.match(tableHtml, /\+20万元/);

const overviewView = buildCompareOverviewView({
  available,
  baseline: available[0],
  baselineFirst: available[0].result.annualRows[0],
  baselineRevenueWan: 40,
  comparePeriod: "2026-2056",
  sensitivityFactors: [{ name: "利用小时" }],
  sensitivitySettings: { rangePercent: 20, stepPercent: 5 },
  bestScenario: available[1],
  maxGapWan: 20,
  asCompactMoney: (value) => `${Math.round(value / 10000)}万元`,
  asNum: (value, digits = 1) => Number(value).toFixed(digits)
});
assert.equal(overviewView.labels.compareBaselineLabel, "基准：基准<场景>");
assert.match(overviewView.messages.compareSensitivityMessage, /首年总收益 40万元/);
assert.match(overviewView.messages.compareScenarioMessage, /2 个已测算方案/);
assert.deepEqual(
  overviewView.metrics.map((metric) => [metric.refKey, metric.value]),
  [
    ["compareMetricBaselineScenario", "基准<场景>"],
    ["compareMetricBaselineRevenue", "40.0 万元"],
    ["compareMetricSensitiveFactors", "1 项"],
    ["compareMetricBestScenario", "乐观"],
    ["compareMetricMaxGap", "20.0 万元"]
  ]
);

function makeNode() {
  return {
    textContent: "old",
    innerHTML: "old"
  };
}

const metricCalls = [];
const refs = {
  compareBody: makeNode(),
  compareSensitivityBody: makeNode(),
  compareSensitivityFactorList: makeNode(),
  compareScenarioFocusList: makeNode(),
  compareMetricBaselineScenario: makeNode(),
  compareMetricBaselineRevenue: makeNode(),
  compareMetricSensitiveFactors: makeNode(),
  compareMetricCompareCount: makeNode(),
  compareMetricScenarioCount: makeNode(),
  compareMetricBestScenario: makeNode(),
  compareMetricMaxGap: makeNode(),
  compareMetricPeriod: makeNode(),
  compareSensitivityResponseLabel: makeNode(),
  compareScenarioBridgeLabel: makeNode(),
  compareSensitivityVariableSummary: makeNode(),
  compareBaselineLabel: makeNode(),
  compareScenarioLabel: makeNode(),
  compareSensitivityMessage: makeNode(),
  compareScenarioMessage: makeNode(),
  compareSensitivityTornadoChart: makeNode(),
  compareSensitivityResponseChart: makeNode(),
  compareRankingChart: makeNode(),
  compareTrendChart: makeNode(),
  compareBridgeChart: makeNode()
};
let synced = false;
resetComparePageState({
  refs,
  setCompareMetric: (node, value, hint) => metricCalls.push({ node, value, hint }),
  syncCompareSensitivityControls: () => {
    synced = true;
  }
});
assert.equal(refs.compareBody.innerHTML, "");
assert.equal(refs.compareSensitivityResponseLabel.textContent, "等待变量选择");
assert.equal(refs.compareSensitivityMessage.textContent, "请先在基准结果总览完成基准方案测算，再查看敏感性分析。");
assert.equal(metricCalls.length, 8);
assert.equal(metricCalls[2].value, "0 项");
assert.equal(synced, true);

metricCalls.length = 0;
applyCompareView({
  refs,
  view: overviewView,
  setCompareMetric: (node, value, hint) => metricCalls.push({ node, value, hint })
});
assert.equal(refs.compareBaselineLabel.textContent, "基准：基准<场景>");
assert.match(refs.compareScenarioMessage.textContent, /2 个已测算方案/);
assert.equal(metricCalls.length, 5);
assert.equal(metricCalls[3].value, "乐观");

const placeholders = [];
const renderPlaceholder = (key, node, message) => placeholders.push({ key, node, message });
renderCompareNoProjectState({ refs, renderPlaceholder });
assert.equal(placeholders.length, 5);
assert.equal(placeholders[0].key, "sensitivityTornado");
assert.match(placeholders[0].message, /请选择项目/);

placeholders.length = 0;
renderCompareNoResultsState({ refs, renderPlaceholder });
assert.match(refs.compareBody.innerHTML, /暂无可对比结果/);
assert.equal(placeholders.length, 5);
assert.equal(placeholders[2].key, "scenarioRanking");
assert.match(placeholders[2].message, /暂无方案结果/);

const readyRenderCalls = [];
const readyMetricCalls = [];
renderCompareReadyState({
  refs,
  setCompareMetric: (node, value, hint) => readyMetricCalls.push({ node, value, hint }),
  available,
  compareState: {
    baseline: available[0],
    baselineFirst: available[0].result.annualRows[0],
    baselineRevenueWan: 40,
    allSensitivityFactors: [{ key: "hours", name: "利用小时", note: "上网电量变化", sensitivity: 20 }],
    sensitivityFactors: [{ key: "hours", name: "利用小时", note: "上网电量变化", sensitivity: 20 }],
    bestScenario: available[1],
    maxGapWan: 20,
    focusScenario: available[1]
  },
  comparePeriod: "2026-2056",
  sensitivitySettings: { rangePercent: 20, stepPercent: 5 },
  asCompactMoney: (value) => `${Math.round(value / 10000)}万元`,
  asNum: (value, digits = 1) => Number(value).toFixed(digits),
  detectTopDriver: () => "现货收入",
  renderers: {
    renderSensitivityTornadoChart: (factors, revenue) => readyRenderCalls.push(`tornado:${factors.length}:${revenue}`),
    renderSensitivityFactorList: (allFactors, factors) => readyRenderCalls.push(`factor-list:${allFactors.length}:${factors.length}`),
    renderSensitivityResponseChart: (factors, revenue) => readyRenderCalls.push(`response:${factors.length}:${revenue}`),
    renderSensitivityTable: (factors) => readyRenderCalls.push(`table:${factors.length}`),
    renderScenarioRankingChart: (items, baseline) => readyRenderCalls.push(`ranking:${items.length}:${baseline.scenario.id}`),
    renderCompareTrendChart: (items) => readyRenderCalls.push(`trend:${items.length}`),
    renderScenarioFocusList: (items, baseline) => readyRenderCalls.push(`focus:${items.length}:${baseline.scenario.id}`),
    renderScenarioBridgeChart: (focus, baseline) => readyRenderCalls.push(`bridge:${focus.scenario.id}:${baseline.scenario.id}`),
    queueCompareChartsResize: () => readyRenderCalls.push("resize")
  }
});
assert.deepEqual(readyRenderCalls, [
  "tornado:1:40",
  "factor-list:1:1",
  "response:1:40",
  "table:1",
  "ranking:2:base",
  "trend:2",
  "focus:2:base",
  "bridge:up:base",
  "resize"
]);
assert.equal(readyMetricCalls.length, 5);
assert.match(refs.compareBody.innerHTML, /现货收入/);
assert.equal(refs.compareBaselineLabel.textContent, "基准：基准<场景>");

console.log("compare page tests passed");
