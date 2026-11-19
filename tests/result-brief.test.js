"use strict";

const assert = require("node:assert/strict");
const { buildBrief } = require("../src/domain/result-brief");
const { render } = require("../src/ui/result-brief");

const project = {
  id: "current-project", name: "项目现名", startYear: 2030, forecastYears: 2, capacityMw: 100,
  province: "jiangsu", assetType: "wind", siteType: "offshore",
  hasStorage: true, storagePowerMw: 20, storageDurationH: 2
};
const scenario = { id: "current-scenario", name: "方案现名", config: { mechanismEnabled: false } };
const baselineConfig = {
  mechanismEnabled: true, mechanismPrice: 365, ltPricingMode: "manual", envValueMode: "manual",
  feeConfigMode: "global", marketOpFee: 3, gridAssessFee: 3, ancillaryFee: 4, otherNetIncome: 0
};
const row = {
  year: 2030, energyMwh: 2000, capturePrice: 300, spotRevenue: 600000,
  mechanismRatio: 0.35, mechanismRevenue: 40000, ltPnlRevenue: -10000,
  envRevenue: 30000, storageSupplementRevenue: 30000, comprehensiveFee: 20000,
  otherIncome: 0, fullRevenue: 670000, fullRevenuePrice: 335,
  storageDispatch: {
    withStorageFullRevenue: 670000, withoutStorageFullRevenue: 640000,
    incrementalRevenue: 22000, independentSupplementRevenue: 8000, roundTripEfficiency: 0.88
  }
};
const result = {
  resultVersion: {
    id: "result-archived-example", schemaVersion: 1, scenarioName: "测算时的方案",
    project: { ...project, name: "测算时的项目" }, scenarioConfig: baselineConfig
  },
  sourceContext: {
    projectId: project.id, scenarioId: scenario.id, runId: "source-example",
    generatedAt: "2026-02-04T05:06:07.000Z"
  },
  priceSource: { type: "demo", runId: "source-example", fingerprint: "price-v1-0123456789abcdef" },
  annualRows: [row, {
    ...row, year: 2031, capturePrice: 310, spotRevenue: 620000, mechanismRatio: 0, mechanismRevenue: 0,
    fullRevenue: 650000, fullRevenuePrice: 325,
    storageDispatch: { ...row.storageDispatch, withStorageFullRevenue: 650000, withoutStorageFullRevenue: 620000 }
  }],
  totalFullRevenue: 1320000, totalEnergy: 4000, avgFullRevenuePrice: 330
};
const before = JSON.stringify({ project, scenario, result });
const brief = buildBrief({ project, scenario, result, labels: { province: "江苏", assetType: "风电", siteType: "海上" } });
assert.equal(brief.title, "基准结果简报");
assert.equal(brief.projectName, "测算时的项目");
assert.equal(brief.context.find(({ label }) => label === "测算方案").value, "测算时的方案");
assert.equal(brief.context.find(({ label }) => label === "项目类型").value, "江苏 · 风电 · 海上");
assert.equal(brief.versionId, result.resultVersion.id);
assert.equal(brief.trace.find(({ label }) => label === "电价曲线版本").value, result.sourceContext.runId);
assert.match(brief.trace.find(({ label }) => label === "测算时间").value, /13:06:07/);
assert.match(brief.summary, /132\.00 万元.*330\.00 元\/MWh.*演示现货曲线/);
assert.match(brief.assumptions.find(({ label }) => label === "差价机制").value, /35\.00%.*365\.00 元\/MWh/);
assert.match(brief.assumptions.find(({ label }) => label === "交易策略与环境价值").value, /逐年录入.*逐年配置/);
assert.match(brief.assumptions.find(({ label }) => label === "配储调度").value, /88\.00%/);
assert.deepEqual(brief.tables.find(({ key }) => key === "storage").rows, [
  ["有储全口径收入", "132.00"], ["无储全口径收入", "126.00"], ["配储全口径增量", "6.00"],
  ["其中现货套利增量", "4.40"], ["其中独立配储收益", "1.60"]
]);
assert.deepEqual(brief.tables.find(({ key }) => key === "annual").rows, [
  ["2030", "2,000", "300.00", "335.00", "67.00"], ["2031", "2,000", "310.00", "325.00", "65.00"]
]);
assert.deepEqual(brief.figures.find(({ key }) => key === "price").series[0].values, [335, 325]);
const components = brief.figures.find(({ key }) => key === "income").items;
assert.equal(components.reduce((sum, item) => sum + item.value, 0), 132);
assert.equal(components.find(({ label }) => label === "三项费用").value, -4);
assert.equal(JSON.stringify({ project, scenario, result }), before, "生成简报不修改历史输入和结果");

const legacy = buildBrief({
  project: { ...project, hasStorage: false }, scenario,
  result: { annualRows: [{ ...row, storageDispatch: undefined }], totalFullRevenue: 670000, totalEnergy: 2000, avgFullRevenuePrice: 335 }
});
assert.equal(legacy.projectName, project.name);
assert.equal(legacy.trace.find(({ label }) => label === "测算版本").value, "旧版未编号");
assert.equal(legacy.trace.find(({ label }) => label === "电价来源").value, "价格来源待核对");
assert.match(legacy.context.find(({ label }) => label === "测算周期").value, /^2030 年$/);
assert.deepEqual(legacy.tables.map(({ key }) => key), ["annual"]);
assert.equal(legacy.assumptions.length, 1, "历史结果不从当前参数补造口径");
assert.equal(buildBrief({ project, scenario, result: null }), null);
assert.equal(buildBrief({ project, scenario, result: { ...result, annualRows: [] } }), null);
assert.equal(buildBrief({ project, scenario, result: { ...result, annualRows: [{ ...row, fullRevenue: NaN }] } }), null);

const root = { innerHTML: "" };
render({ root, brief: { ...brief, projectName: "<script>项目</script>" } });
assert.match(root.innerHTML, /&lt;script&gt;项目&lt;\/script&gt;/);
assert.match(root.innerHTML, /data-brief-chart="price"/);
assert.match(root.innerHTML, /data-brief-chart="income"/);
assert.match(root.innerHTML, /data-brief-table="annual"/);
assert.match(root.innerHTML, /result-archived-example/);
assert.doesNotMatch(root.innerHTML, /<(?:script|button|a\s|input|select|details)\b/i, "简报正文仅展示图文和表格");
render({ root, brief: null, message: "恢复后 <请重新测算>" });
assert.match(root.innerHTML, /恢复后 &lt;请重新测算&gt;/);
console.log("result brief tests passed");
