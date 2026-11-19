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
  createCompareEventHandlers,
  renderCompareFrame,
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
const sensitivityTargetSelect = new FakeTarget();
const sensitivityRange = new FakeTarget();
const scenarioFocusList = new FakeTarget();
const scenarioFocus = new FakeTarget({ compareFocusScenario: "up" });
bindCompareEvents({
  refs: {
    compareTabButtons: [compareTabButton],
    compareSensitivityFactorList: sensitivityList,
    compareSensitivityTarget: sensitivityTargetSelect,
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
sensitivityTargetSelect.dispatch("change");
sensitivityRange.dispatch("change");
scenarioFocusList.dispatch("click", { target: scenarioFocus });
assert.deepEqual(compareEventCalls, [
  "view:scenario",
  "factor:hours",
  "variable:price:true",
  "controls",
  "controls",
  "scenario:up"
]);

const handlerCalls = [];
const sensitivitySettings = {
  target: "first_revenue",
  selectedKeys: ["hours"],
  rangePercent: 20,
  stepPercent: 5,
  responseScalePercent: 100,
  topN: 5
};
let compareView = "scenario";
let activeFactor = "hours";
let activeScenario = "";
sensitivityTargetSelect.value = "first_revenue";
const compareHandlers = createCompareEventHandlers({
  refs: {
    compareSensitivityTarget: sensitivityTargetSelect,
    compareSensitivityRange: { value: "30" },
    compareSensitivityStep: { value: "10" },
    compareSensitivityScale: { value: "80" },
    compareSensitivityTopn: { value: "all" }
  },
  sensitivitySettings,
  getCompareView: () => compareView,
  setCompareView: (value) => {
    compareView = value;
  },
  sanitizeCompareView: (value) => (value === "sensitivity" ? "sensitivity" : "scenario"),
  getActiveSensitivityFactorKey: () => activeFactor,
  setActiveSensitivityFactorKey: (value) => {
    activeFactor = value;
  },
  setActiveCompareScenarioId: (value) => {
    activeScenario = value;
  },
  sanitizeCompareSensitivitySettings: () => {
    handlerCalls.push("sanitize");
  },
  renderCompareWorkspaceState: () => handlerCalls.push("workspace"),
  renderCompare: () => handlerCalls.push("render"),
  queueCompareChartsResize: () => handlerCalls.push("resize"),
  schedulePersistAppData: () => handlerCalls.push("persist")
});
compareHandlers.changeCompareView("sensitivity");
compareHandlers.changeCompareView("sensitivity");
compareHandlers.selectSensitivityFactor("price");
compareHandlers.toggleSensitivityVariable("hours", false);
compareHandlers.toggleSensitivityVariable("price", true);
compareHandlers.changeSensitivityControls();
compareHandlers.selectScenarioFocus("up");
assert.equal(compareView, "sensitivity");
assert.equal(activeFactor, "price");
assert.equal(activeScenario, "up");
assert.deepEqual(sensitivitySettings.selectedKeys, ["price"]);
assert.equal(sensitivitySettings.rangePercent, 30);
assert.equal(sensitivitySettings.stepPercent, 10);
assert.equal(sensitivitySettings.responseScalePercent, 100, "历史响应强度输入不再参与测算");
assert.equal(sensitivitySettings.topN, "all");
assert.deepEqual(handlerCalls, [
  "workspace",
  "resize",
  "persist",
  "render",
  "render",
  "render",
  "sanitize",
  "render",
  "render"
]);

sensitivityTargetSelect.value = "first_net_price";
compareHandlers.changeSensitivityControls();
assert.equal(sensitivitySettings.target, "first_net_price");
assert.deepEqual(sensitivitySettings.selectedKeys, []);
assert.equal(activeFactor, "");
compareHandlers.toggleSensitivityVariable("fee", true);
compareHandlers.selectSensitivityFactor("fee");
sensitivityTargetSelect.value = "first_revenue";
compareHandlers.changeSensitivityControls();
assert.equal(sensitivitySettings.target, "first_revenue");
assert.deepEqual(sensitivitySettings.selectedKeys, ["price"]);
assert.equal(activeFactor, "price");
sensitivityTargetSelect.value = "first_net_price";
compareHandlers.changeSensitivityControls();
assert.equal(sensitivitySettings.target, "first_net_price");
assert.deepEqual(sensitivitySettings.selectedKeys, ["fee"]);
assert.equal(activeFactor, "fee");
assert.equal(sensitivitySettings.rangePercent, 30);
assert.equal(sensitivitySettings.stepPercent, 10);

const availabilityView = buildCompareAvailabilityView({
  available: [{ scenario: { id: "base" }, result: {} }],
  comparePeriod: "2026-2056"
});
assert.deepEqual(
  availabilityView.metrics.map((metric) => [metric.refKey, metric.value, metric.hint]),
  [
    ["compareMetricPeriod", "2026-2056", undefined],
    ["compareMetricCompareCount", "1 个", "当前有效结果"],
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
const netPriceTarget = { key: "first_net_price", label: "首年度电净价", unit: "元/MWh" };
const netPriceFactors = [{ key: "fee", name: "费用", note: "费用同比变化", sensitivity: 12.345 }];
const netPriceFactorsHtml = buildSensitivityFactorListHtml({
  allFactors: netPriceFactors, enabledFactors: netPriceFactors, sensitivityTarget: netPriceTarget
});
assert.match(netPriceFactorsHtml, /12.35 元\/MWh/);
assert.doesNotMatch(netPriceFactorsHtml, /万元/);

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
  detectTopDriver: (result, baselineResult) => { assert.equal(baselineResult, available[0].result); return "交易<策略>"; }
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
assert.match(overviewView.messages.compareSensitivityMessage, /首年全口径收入 40万元/);
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

const netPriceOverview = buildCompareOverviewView({
  available, baseline: available[0], sensitivityTarget: netPriceTarget, sensitivityBaseline: 431.654,
  sensitivityFactors: netPriceFactors, sensitivitySettings: { rangePercent: 20, stepPercent: 5 },
  asCompactMoney: () => assert.fail("度电净价不使用货币金额缩写")
});
assert.equal(netPriceOverview.labels.compareMetricBaselineRevenueLabel, "基准首年度电净价");
assert.match(netPriceOverview.messages.compareSensitivityMessage, /首年度电净价 431.65 元\/MWh/);
assert.equal(netPriceOverview.metrics.find(({ refKey }) => refKey === "compareMetricBaselineRevenue").value, "431.65 元/MWh");

const singleOverview = buildCompareOverviewView({ available: [available[0]], baseline: available[0], bestScenario: available[0], excludedCount: 1 });
assert.equal(singleOverview.metrics.find((item) => item.refKey === "compareMetricBestScenario").value, "待比较");
assert.match(singleOverview.messages.compareScenarioMessage, /1 个历史或无效结果已排除/);

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
  compareMetricBaselineRevenueLabel: makeNode(),
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
assert.equal(refs.compareSensitivityMessage.textContent, "请先在收益参数补充与细化中完成基准方案测算，再查看敏感性分析。");
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
assert.equal(refs.compareMetricBaselineRevenueLabel.textContent, "基准首年全口径收入");
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
assert.match(refs.compareBody.innerHTML, /暂无当前有效的基准结果/);
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

function makeFrameRefs() {
  return {
    compareBody: makeNode(),
    compareSensitivityBody: makeNode(),
    compareSensitivityFactorList: makeNode(),
    compareScenarioFocusList: makeNode(),
    compareMetricBaselineScenario: makeNode(),
    compareMetricBaselineRevenue: makeNode(),
    compareMetricBaselineRevenueLabel: makeNode(),
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
}

const framePlaceholders = [];
let frameSyncCount = 0;
const noProjectStatus = renderCompareFrame({
  refs: makeFrameRefs(),
  setCompareMetric: () => {},
  syncCompareSensitivityControls: () => {
    frameSyncCount += 1;
  },
  project: null,
  renderPlaceholder: (key, node, message) => framePlaceholders.push({ key, node, message })
});
assert.equal(noProjectStatus, "no-project");
assert.equal(frameSyncCount, 1);
assert.equal(framePlaceholders.length, 5);
assert.match(framePlaceholders[0].message, /请选择项目/);

framePlaceholders.length = 0;
const noResultsRefs = makeFrameRefs();
const noResultsStatus = renderCompareFrame({
  refs: noResultsRefs,
  setCompareMetric: () => {},
  syncCompareSensitivityControls: () => {
    frameSyncCount += 1;
  },
  project: { id: "project-1" },
  available: [],
  comparePeriod: "2026-2056",
  renderPlaceholder: (key, node, message) => framePlaceholders.push({ key, node, message })
});
assert.equal(noResultsStatus, "no-results");
assert.match(noResultsRefs.compareBody.innerHTML, /暂无当前有效的基准结果/);
assert.equal(framePlaceholders.length, 5);

const frameReadyCalls = [];
const readyFrameStatus = renderCompareFrame({
  refs: makeFrameRefs(),
  setCompareMetric: () => {},
  syncCompareSensitivityControls: () => {
    frameSyncCount += 1;
  },
  project: { id: "project-1" },
  available,
  compareState: {
    baseline: available[0],
    baselineFirst: available[0].result.annualRows[0],
    baselineRevenueWan: 40,
    sensitivityTarget: netPriceTarget,
    sensitivityBaseline: 431.65,
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
    renderSensitivityTornadoChart: (_factors, base, target) => {
      assert.equal(base, 431.65);
      assert.equal(target, netPriceTarget);
      frameReadyCalls.push("tornado");
    },
    renderSensitivityFactorList: (_all, _enabled, target) => {
      assert.equal(target, netPriceTarget);
      frameReadyCalls.push("factor-list");
    },
    renderSensitivityResponseChart: (_factors, base, target) => {
      assert.equal(base, 431.65);
      assert.equal(target, netPriceTarget);
      frameReadyCalls.push("response");
    },
    renderSensitivityTable: (_factors, target) => {
      assert.equal(target, netPriceTarget);
      frameReadyCalls.push("table");
    },
    renderScenarioRankingChart: () => frameReadyCalls.push("ranking"),
    renderCompareTrendChart: () => frameReadyCalls.push("trend"),
    renderScenarioFocusList: () => frameReadyCalls.push("focus"),
    renderScenarioBridgeChart: () => frameReadyCalls.push("bridge"),
    queueCompareChartsResize: () => frameReadyCalls.push("resize")
  }
});
assert.equal(readyFrameStatus, "ready");
assert.deepEqual(frameReadyCalls, [
  "tornado",
  "factor-list",
  "response",
  "table",
  "ranking",
  "trend",
  "focus",
  "bridge",
  "resize"
]);

const invalidHoursRefs = makeFrameRefs();
const invalidHoursText = "首年配储小时明细缺失或对账未通过，请重新测算后查看敏感性。";
const invalidHoursCharts = [];
assert.equal(renderCompareFrame({
  refs: invalidHoursRefs,
  project: { id: "hourly-reconciliation" },
  available,
  compareState: { baseline: available[0], sensitivityNotice: invalidHoursText, sensitivityFactors: [] },
  renderPlaceholder: (key, node, message) => invalidHoursCharts.push({ key, message }),
  renderers: {
    renderSensitivityTornadoChart: () => assert.fail("待重算时清除敏感性排序"),
    renderSensitivityResponseChart: () => assert.fail("待重算时清除敏感性响应")
  }
}), "ready", "年度对标不受小时对账错误影响");
assert.equal(invalidHoursRefs.compareSensitivityMessage.textContent, invalidHoursText);
assert.deepEqual(invalidHoursCharts, ["sensitivityTornado", "sensitivityResponse"].map((key) => ({ key, message: invalidHoursText })));

console.log("compare page tests passed");
