"use strict";

const assert = require("node:assert/strict");
const {
  buildCompareTableRowsHtml,
  buildScenarioFocusListHtml,
  buildSensitivityFactorListHtml,
  resetComparePageState,
  renderCompareNoProjectState,
  renderCompareNoResultsState
} = require("../src/ui/compare-page");

const tokens = {
  primary: "#3f82e6",
  palette: ["#3f82e6", "#3fa096", "#76aa57"]
};

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

console.log("compare page tests passed");
