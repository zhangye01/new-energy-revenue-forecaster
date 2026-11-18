"use strict";

const assert = require("node:assert/strict");
const {
  applyResultPageViewModel,
  applyResultReportView,
  bindResultActionEvents,
  buildEmptyMetricCards,
  buildResultMetaHtml,
  buildResultPageRenderState,
  buildResultPageViewModel,
  savedResultPeriod,
  resetResultDom
} = require("../src/ui/result-page");

class FakeTarget {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.handlers = {};
    this.attributes = {};
    this.hidden = false;
    this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => {
        if (enabled) {
          this.classes.add(name);
        } else {
          this.classes.delete(name);
        }
      }
    };
  }

  addEventListener(name, handler) {
    this.handlers[name] = handler;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  dispatch(name) {
    this.handlers[name]?.({ target: this });
  }
}

const resultEventCalls = [];
const resultEventRefs = {
  runCalcButton: new FakeTarget(),
  exportAnnualButton: new FakeTarget(),
  exportHourlyButton: new FakeTarget(),
  printReportButton: new FakeTarget()
};
bindResultActionEvents({
  refs: resultEventRefs,
  handlers: {
    runCalculation: () => resultEventCalls.push("run"),
    exportAnnualCsv: () => resultEventCalls.push("annual"),
    exportHourlyCsv: () => resultEventCalls.push("hourly"),
    printScenarioReport: () => resultEventCalls.push("print")
  }
});
resultEventRefs.runCalcButton.dispatch("click");
resultEventRefs.exportAnnualButton.dispatch("click");
resultEventRefs.exportHourlyButton.dispatch("click");
resultEventRefs.printReportButton.dispatch("click");
assert.deepEqual(resultEventCalls, ["run", "annual", "hourly", "print"]);

const annualTab = new FakeTarget({ resultView: "annual" });
const priceTab = new FakeTarget({ resultView: "price" });
const annualPane = new FakeTarget({ resultPane: "annual" });
const pricePane = new FakeTarget({ resultPane: "price" });
assert.equal(applyResultReportView({
  refs: {
    resultReportTabs: [annualTab, priceTab],
    resultReportPanes: [annualPane, pricePane]
  },
  view: "bad",
  allowedViews: new Set(["annual", "price"])
}), "annual");
assert.equal(annualTab.classes.has("active"), true);
assert.equal(annualTab.attributes["aria-selected"], "true");
assert.equal(priceTab.classes.has("active"), false);
assert.equal(priceTab.attributes["aria-selected"], "false");
assert.equal(annualPane.hidden, false);
assert.equal(pricePane.hidden, true);
assert.equal(applyResultReportView({
  refs: {
    resultReportTabs: [annualTab, priceTab],
    resultReportPanes: [annualPane, pricePane]
  },
  view: "price",
  allowedViews: ["annual", "price"]
}), "price");
assert.equal(priceTab.classes.has("active"), true);
assert.equal(pricePane.hidden, false);
assert.equal(annualPane.hidden, true);

assert.match(buildEmptyMetricCards(), /首年全口径收入/);
assert.match(buildEmptyMetricCards(), /当前方案/);
assert.match(
  buildResultMetaHtml({
    projectName: "江苏<风电>",
    scenarioName: "基准",
    periodText: "2026-2050",
    assetTypeLabel: "风电",
    siteTypeLabel: "海上",
    storageText: "配储"
  }),
  /江苏&lt;风电&gt;/
);

const noProject = buildResultPageViewModel();
assert.equal(noProject.state, "no_project");
assert.equal(noProject.chartPlaceholder, "请选择项目后发起测算");
assert.match(noProject.metaHtml, /项目：-/);
const noProjectState = buildResultPageRenderState();
assert.equal(noProjectState.project, null);
assert.equal(noProjectState.scenario, null);
assert.equal(noProjectState.result, null);
assert.equal(noProjectState.view.state, "no_project");

const resultDomRefs = {
  resultReportMeta: { innerHTML: "old" },
  resultScenarioHeading: { textContent: "old" },
  resultExecutiveSummary: { textContent: "old" },
  resultMetricGrid: { innerHTML: "old" },
  resultInsightList: { innerHTML: "old" },
  resultAssumptionList: { innerHTML: "old" },
  annualResultBody: { innerHTML: "old" },
  hourlyResultBody: { innerHTML: "old" },
  hourlyPreviewHint: { textContent: "old" }
};
resetResultDom(resultDomRefs);
assert.equal(resultDomRefs.resultMetricGrid.innerHTML, "");
assert.equal(resultDomRefs.resultInsightList.innerHTML, "");
assert.equal(resultDomRefs.annualResultBody.innerHTML, "");
assert.equal(resultDomRefs.hourlyPreviewHint.textContent, "等待测算");
applyResultPageViewModel({
  refs: resultDomRefs,
  view: {
    metaHtml: "<span>项目：测试</span>",
    scenarioHeading: "当前方案 · 压力方案",
    executiveSummary: "摘要",
    metricHtml: "<article>指标</article>",
    insightHtml: "<article>洞察</article>",
    assumptionHtml: "<article>假设</article>",
    annualRowsHtml: "<tr><td>2026</td></tr>",
    hourlyRowsHtml: "<tr><td>小时</td></tr>",
    hourlyPreviewHint: "预览"
  }
});
assert.equal(resultDomRefs.resultReportMeta.innerHTML, "<span>项目：测试</span>");
assert.equal(resultDomRefs.resultScenarioHeading.textContent, "当前方案 · 压力方案");
assert.equal(resultDomRefs.resultExecutiveSummary.textContent, "摘要");
assert.equal(resultDomRefs.resultMetricGrid.innerHTML, "<article>指标</article>");
assert.equal(resultDomRefs.hourlyPreviewHint.textContent, "预览");
applyResultPageViewModel({
  refs: resultDomRefs,
  view: {
    metricHtml: "",
    hourlyPreviewHint: ""
  }
});
assert.equal(resultDomRefs.resultMetricGrid.innerHTML, "");
assert.equal(resultDomRefs.hourlyPreviewHint.textContent, "");

const actionRefs = { runCalcButton: new FakeTarget(), resultValidationButton: new FakeTarget({ jump: "validation-page" }),
  resultReportMeta: { innerHTML: "" }, printReportHeader: { innerHTML: "独立打印页头", hidden: false } };
actionRefs.resultValidationButton.classes.add("next-step-button");
for (const [view, current] of [
  [{ state: "no_project" }, false], [{ state: "no_result" }, false],
  [{ state: "ready", isHistorical: true, metaHtml: "历史期间与来源" }, false],
  [{ state: "invalid_result", isHistorical: true }, false],
  [{ state: "ready", isHistorical: false, metaHtml: "当前项目" }, true]
]) {
  applyResultPageViewModel({ refs: actionRefs, view });
  assert.equal(actionRefs.runCalcButton.classes.has("primary-button"), !current);
  assert.equal(actionRefs.runCalcButton.classes.has("ghost-button"), current);
  assert.equal(actionRefs.resultValidationButton.classes.has("primary-button"), current);
  assert.equal(actionRefs.resultValidationButton.classes.has("ghost-button"), !current);
  assert.equal(actionRefs.runCalcButton.disabled, view.state === "no_project");
  assert.equal(actionRefs.resultReportMeta.hidden, !view.isHistorical);
  if (view.isHistorical) assert.equal(actionRefs.resultReportMeta.innerHTML, "历史期间与来源");
  assert.equal(actionRefs.resultValidationButton.dataset.jump, "validation-page", "CTA层级不改变导航目标");
  assert.equal(actionRefs.resultValidationButton.classes.has("next-step-button"), true);
  assert.deepEqual(actionRefs.printReportHeader, { innerHTML: "独立打印页头", hidden: false }, "屏幕摘要去重不影响打印页头");
}

const project = { name: "江苏海上风电示例项目" };
const scenario = {
  name: "基准场景",
  isBaseline: true,
  config: {
    mechanismEnabled: true,
    mechanismPrice: 365
  }
};

const noResult = buildResultPageViewModel({
  project,
  scenario,
  labels: {
    projectName: project.name,
    scenarioName: scenario.name,
    periodText: "2026-2050",
    assetTypeLabel: "风电",
    siteTypeLabel: "海上",
    storageText: "配储"
  }
});
assert.equal(noResult.state, "no_result");
assert.match(noResult.metricHtml, /周期总上网电量/);
assert.equal(noResult.chartPlaceholder, "请先发起基准测算");
assert.equal(noResult.scenarioHeading, "基准方案 · 基准场景");
assert.equal(noResult.calculationLabel, "发起基准测算");

const annualRow = {
  year: 2026,
  annualHours: 3000,
  energyMwh: 10000,
  spotAvgPrice: 300,
  capturePrice: 310,
  fullRevenuePrice: 350,
  spotRevenue: 3100000,
  mechanismRevenue: 100000,
  ltPnlRevenue: 80000,
  envRevenue: 90000,
  storageSupplementRevenue: 120000,
  comprehensiveFee: 70000,
  otherIncome: 20000,
  fullRevenue: 3500000,
  mechanismRatio: 0.36,
  captureSpread: 10
};
const result = {
  totalFullRevenue: 3500000,
  avgFullRevenuePrice: 350,
  totalEnergy: 10000,
  annualRows: [annualRow],
  hourlyPreview: [{
    time: "2026-01-01 00:00",
    equivalentHours: 0.5,
    energyMwh: 2.5,
    spotPrice: 300,
    spotRevenue: 750,
    fullRevenue: 875
  }]
};
const summaryData = {
  rows: [annualRow],
  first: annualRow,
  maxRevenueRow: annualRow,
  minRevenueRow: annualRow,
  unitLift: 40,
  liftText: "增加",
  leadingPositive: { label: "配储补充收益", amount: 120000 },
  leadingNegative: { label: "综合费用", amount: -70000 },
  firstMarketRatio: 0.64
};

const ready = buildResultPageViewModel({
  project,
  scenario,
  result,
  summaryData,
  labels: {
    projectName: project.name,
    scenarioName: scenario.name,
    periodText: "2026-2050",
    assetTypeLabel: "风电",
    siteTypeLabel: "海上",
    storageText: "配储"
  },
  envValueMode: "manual",
  feeConfigMode: "manual"
});
assert.equal(ready.state, "ready");
assert.match(ready.executiveSummary, /周期全口径收入合计350.0 万元/);
assert.match(ready.metricHtml, /首年度电净价/);
assert.match(ready.insightHtml, /主要贡献项/);
assert.match(ready.assumptionHtml, /环境价值采用逐年配置，兑现空间按市场化交易电量核对/);
assert.match(ready.assumptionHtml, /综合费用与其他收入采用逐年导入配置/);
assert.match(ready.annualRowsHtml, /¥3,500,000/);
assert.match(ready.hourlyRowsHtml, /2026-01-01 00:00/);
assert.equal(ready.hourlyPreviewHint, "测算完成 · 首年小时明细 1 条");

const renderState = buildResultPageRenderState({
  project: {
    ...project,
    resultsByScenario: {
      scenario1: result
    },
    assetType: "wind",
    siteType: "offshore"
  },
  getActiveScenario: () => ({ ...scenario, id: "scenario1" }),
  buildResultSummaryData: () => summaryData,
  getForecastPeriodDisplayRange: () => "2026-2050",
  getAssetTypeLabel: () => "风电",
  getSiteTypeLabel: () => "海上",
  getStorageConfigText: () => "配储",
  getEnvValueMode: () => "manual",
  getFeeConfigMode: () => "manual"
});
assert.equal(renderState.scenario.id, "scenario1");
assert.equal(renderState.result, result);
assert.equal(renderState.view.state, "ready");
assert.match(renderState.view.metaHtml, /项目：江苏海上风电示例项目/);
assert.match(renderState.view.assumptionHtml, /环境价值采用逐年配置/);
assert.equal(renderState.view.scenarioHeading, "基准方案 · 基准场景");

const pressureScenario = { id: "pressure", name: "费用压力方案", isBaseline: false, config: { mechanismEnabled: false } };
const pressureResult = { ...result, avgFullRevenuePrice: 348 };
const pressureRender = buildResultPageRenderState({
  project: { ...project, resultsByScenario: { baseline: result, pressure: pressureResult } },
  getActiveScenario: () => pressureScenario,
  buildResultSummaryData: () => summaryData
});
assert.equal(pressureRender.result, pressureResult);
assert.match(pressureRender.view.executiveSummary, /348\.00元/);
assert.doesNotMatch(`${pressureRender.view.executiveSummary}${pressureRender.view.assumptionHtml}`, /基准方案/);
const pressureRefs = { resultScenarioHeading: new FakeTarget(), runCalcButton: new FakeTarget() };
applyResultPageViewModel({ refs: pressureRefs, view: pressureRender.view });
assert.equal(pressureRefs.resultScenarioHeading.textContent, "当前方案 · 费用压力方案");
assert.equal(pressureRefs.runCalcButton.textContent, "发起测算");
applyResultPageViewModel({ refs: pressureRefs, view: renderState.view });
assert.equal(pressureRefs.resultScenarioHeading.textContent, "基准方案 · 基准场景");
assert.equal(pressureRefs.runCalcButton.textContent, "发起基准测算");

const emptyRows = buildResultPageViewModel({
  project,
  scenario,
  result,
  summaryData: {
    rows: [],
    first: null
  },
  labels: {
    periodText: "2026-2050"
  }
});
assert.equal(emptyRows.state, "empty_result");
assert.equal(emptyRows.chartPlaceholder, "暂无年度测算结果");

const staleResultMessage = "项目、电量或收入配置已变化，当前展示历史结果，请重新发起基准测算。";
const staleView = buildResultPageViewModel({
  project, scenario: { ...scenario, config: { mechanismEnabled: true, mechanismPrice: 999 } }, result, summaryData,
  labels: { projectName: project.name, scenarioName: scenario.name, periodText: "2030-2050", assetTypeLabel: "新的项目类型" },
  resultState: { current: false, reason: "stale_context", message: staleResultMessage }
});
assert.equal(staleView.isHistorical, true);
assert.match(staleView.metaHtml, /请重新发起基准测算/);
assert.match(staleView.metaHtml, /周期：2026-2026/);
assert.doesNotMatch(staleView.metaHtml, /2030-2050|新的项目类型/);
assert.match(staleView.metricHtml, /350.00 元\/MWh/, "旧数值仍可查看");
assert.match(staleView.assumptionHtml, /历史计算口径/);
assert.doesNotMatch(staleView.assumptionHtml, /999|机制电价/);
assert.match(staleView.executiveSummary, /已保存结果中/);
assert.match(staleView.executiveSummary, /2026-2026/);
const staleRenderState = buildResultPageRenderState({
  project: { ...project, resultsByScenario: { scenario1: result } },
  getActiveScenario: () => ({ ...scenario, id: "scenario1" }),
  buildResultSummaryData: () => summaryData,
  getBaselineResultState: () => ({ current: false, reason: "stale_run", message: "生效现货预测已变化，请重新测算。" })
});
assert.equal(staleRenderState.result, result);
assert.equal(staleRenderState.view.isHistorical, true);
assert.match(staleRenderState.view.metaHtml, /生效现货预测已变化/);
assert.equal(savedResultPeriod(result), "2026-2026");
assert.equal(savedResultPeriod(null), "");

console.log("result page tests passed");

for (const [view, disabled] of [[{ state: 'ready', isHistorical: true }, true], [{ state: 'no_result' }, true], [{ state: 'ready', isHistorical: false }, false]]) {
  const buttons = { exportAnnualButton: {}, exportHourlyButton: {}, printReportButton: {} };
  require('../src/ui/result-page').applyResultPageViewModel({ refs: buttons, view });
  for (const button of Object.values(buttons)) assert.equal(button.disabled, disabled);
}

// Damaged persisted rows must not reach summary rendering or block the recovery UI.
for (const saved of [
  { annualRows: [null], hourlyPreview: [] },
  { annualRows: [{ year: 2026 }, null], hourlyPreview: [] },
  { annualRows: { 2026: {} }, hourlyPreview: [] },
  { annualRows: [{ year: 2026 }], hourlyPreview: [null] },
  { annualRows: [{ year: 2026 }], hourlyPreview: {} }
]) {
  const original = JSON.stringify(saved);
  for (const reason of ["incomplete_result", "legacy_baseline"]) {
    let summaryCalled = false;
    const damaged = buildResultPageRenderState({
      project: { ...project, resultsByScenario: { scenario1: saved } },
      getActiveScenario: () => ({ ...scenario, id: "scenario1" }),
      getBaselineResultState: () => ({ current: false, reason, message: "请重新测算。" }),
      buildResultSummaryData: (value) => { summaryCalled = true; return require("../src/domain/result-report").buildResultSummaryData(value); }
    });
    assert.equal(summaryCalled, false, "损坏明细不进入摘要或数值渲染");
    assert.equal(damaged.view.state, "invalid_result");
    assert.match(damaged.view.chartPlaceholder, /重新测算/);
    const buttons = { exportAnnualButton: {}, exportHourlyButton: {}, printReportButton: {} };
    applyResultPageViewModel({ refs: buttons, view: damaged.view });
    assert.ok(Object.values(buttons).every((button) => button.disabled));
    assert.doesNotThrow(() => savedResultPeriod(saved), "打印页头的周期读取也必须容忍损坏行");
  }
  assert.equal(JSON.stringify(saved), original, "不清洗或改写原存档数值");
}
assert.equal(savedResultPeriod({ annualRows: [null, { year: 2026 }] }), "2026-2026");
assert.equal(savedResultPeriod({ annualRows: {} }), "");
