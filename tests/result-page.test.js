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

const project = { name: "江苏海上风电示例项目" };
const scenario = {
  name: "基准场景",
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
assert.match(ready.assumptionHtml, /环境价值采用逐年导入配置/);
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
assert.match(renderState.view.assumptionHtml, /环境价值采用逐年导入配置/);

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

console.log("result page tests passed");
