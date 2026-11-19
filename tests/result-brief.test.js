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
  year: 2030, energyMwh: 2000, spotAvgPrice: 298, capturePrice: 300, spotRevenue: 600000,
  mechanismRatio: 0.35, mechanismRevenue: 40000, ltPnlRevenue: -10000,
  envRevenue: 30000, storageSupplementRevenue: 30000, comprehensiveFee: 20000,
  otherIncome: 0, fullRevenue: 670000, fullRevenuePrice: 335,
  storageDispatch: {
    withStorageFullRevenue: 670000, withoutStorageFullRevenue: 640000,
    incrementalRevenue: 22000, independentSupplementRevenue: 8000, roundTripEfficiency: 0.88,
    dischargeRevenue: 42000, chargeOpportunityCost: 20000, chargeMwh: 100, dischargeMwh: 88
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
    ...row, year: 2031, spotAvgPrice: 307, capturePrice: 310, spotRevenue: 620000, mechanismRatio: 0, mechanismRevenue: 0,
    fullRevenue: 650000, fullRevenuePrice: 325,
    storageDispatch: { ...row.storageDispatch, withStorageFullRevenue: 650000, withoutStorageFullRevenue: 620000 }
  }],
  totalFullRevenue: 1320000, totalEnergy: 4000, avgFullRevenuePrice: 330
};
const before = JSON.stringify({ project, scenario, result });
const brief = buildBrief({ project, scenario, result, labels: { province: "江苏", assetType: "风电", siteType: "海上" } });
assert.equal(brief.title, "基准结果简报");
assert.equal(brief.projectName, "测算时的项目");
assert.equal(brief.syntheticCaseLabel, "合成案例 · 现货电价为模拟数据");
assert.equal(brief.context.find(({ label }) => label === "测算方案").value, "测算时的方案");
assert.equal(brief.context.find(({ label }) => label === "项目类型").value, "江苏 · 风电 · 海上");
assert.equal(brief.versionId, result.resultVersion.id);
assert.deepEqual(brief.metrics.slice(0, 2).map(({ value }) => value), ["132.00 万元", "330.00 元/MWh"]);
assert.equal(brief.trace, undefined);
assert.equal(brief.assumptions, undefined);
assert.match(brief.findings.find(({ label }) => label === "电价变化").value, /2030 至 2031 年.*335\.00 降至 325\.00.*减少 10\.00/);
assert.match(brief.figures.find(({ key }) => key === "price").caption, /现货时均价 302\.50.*捕获电价 305\.00/);
assert.match(brief.sections.find(({ key }) => key === "turning-point").intro.join(""), /差价机制结算贡献 -20\.00/);
assert.match(brief.sections.find(({ key }) => key === "storage").intro.join(""), /无储收入的 4\.76%.*15\.00 元\/MWh/);
assert.match(brief.sections.find(({ key }) => key === "appendix-storage").intro.join(""), /首年往返效率 88\.00%.*充电 100 MWh/);
assert.deepEqual(brief.sections.filter(({ appendix }) => !appendix).map(({ key }) => key), ["results", "turning-point", "storage"]);
assert.deepEqual(brief.tables.find(({ key }) => key === "storage").rows, [
  ["有储全口径收入", "67.00", "132.00"], ["无储全口径收入", "64.00", "126.00"], ["配储全口径增量", "3.00", "6.00"],
  ["其中现货套利增量", "2.20", "4.40"], ["放电收入", "4.20", "8.40"], ["充电机会成本", "2.00", "4.00"],
  ["其中独立配储收益", "0.80", "1.60"]
]);
assert.deepEqual(brief.tables.find(({ key }) => key === "annual").rows, [
  ["2030", "2,000", "300.00", "335.00", "67.00"], ["2031", "2,000", "310.00", "325.00", "65.00"]
]);
assert.deepEqual(brief.figures.find(({ key }) => key === "price").series[0].values, [335, 325]);
assert.deepEqual(brief.figures.find(({ key }) => key === "price").series.at(-1).values, [298, 307]);
assert.deepEqual(brief.figures.find(({ key }) => key === "annual-income").values, [67, 65]);
const bridge = brief.figures.find(({ key }) => key === "first-price-bridge").items;
assert.equal(bridge.at(-1).role, "end");
assert.equal(bridge.slice(0, -1).reduce((sum, item) => sum + item.value, 0), bridge.at(-1).value);
assert.deepEqual(brief.figures.map(({ key, number }) => [key, number]), [
  ["price", 1], ["annual-income", 2], ["annual-energy", 3], ["income", 4], ["turning-point-bridge", 5],
  ["first-price-bridge", 6], ["annual-storage", 7]
]);
assert.deepEqual(brief.tables.map(({ key, number }) => [key, number]), [
  ["income-details", 1], ["turning-point", 2], ["mechanism-settlement", 3], ["storage", 4], ["annual", 5]
]);
assert.deepEqual(brief.tables.find(({ key }) => key === "income-details").rows.at(-1), ["全口径收入合计", "132.00", "330.00", "100.00"]);
const components = brief.figures.find(({ key }) => key === "income").items;
assert.equal(components.reduce((sum, item) => sum + item.value, 0), 10);
assert.ok(!components.some(({ colorKey }) => colorKey === "spot"));
assert.equal(components.find(({ label }) => label === "三项费用").value, -4);
assert.equal(JSON.stringify({ project, scenario, result }), before, "生成简报不修改历史输入和结果");

const spotRows = result.annualRows.map((item) => ({
  ...item, storageSupplementRevenue: 22000, fullRevenue: item.fullRevenue - 8000,
  fullRevenuePrice: (item.fullRevenue - 8000) / item.energyMwh,
  storageDispatch: {
    ...item.storageDispatch, revenueMode: "spot_increment_only", independentSupplementRevenue: 0,
    withStorageFullRevenue: item.fullRevenue - 8000,
    withoutStorageSpotRevenue: item.spotRevenue, withStorageSpotRevenue: item.spotRevenue + 22000
  }
}));
const spotBrief = buildBrief({ project, scenario, result: {
  ...result, annualRows: spotRows, totalFullRevenue: 1304000, avgFullRevenuePrice: 326
} });
const spotTable = spotBrief.tables.find(({ key }) => key === "storage");
assert.equal(spotTable.title, "有储与无储现货收益对比");
assert.deepEqual(spotTable.rows, [
  ["无储现货收益", "60.00", "122.00"], ["有储现货收益", "62.20", "126.40"], ["配储现货增量", "2.20", "4.40"],
  ["放电收入", "4.20", "8.40"], ["充电机会成本", "2.00", "4.00"]
]);
assert.match(spotBrief.sections.find(({ key }) => key === "storage").intro[0], /折合 11\.00 元\/MWh/);
assert.deepEqual(spotBrief.figures.find(({ key }) => key === "annual-storage").series, [
  { name: "配储现货增量", values: [2.2, 2.2] }
]);

const legacy = buildBrief({
  project: { ...project, hasStorage: false }, scenario,
  result: { annualRows: [{ ...row, storageDispatch: undefined }], totalFullRevenue: 670000, totalEnergy: 2000, avgFullRevenuePrice: 335 }
});
assert.equal(legacy.projectName, project.name);
assert.equal(legacy.versionId, "");
assert.equal(legacy.syntheticCaseLabel, undefined);
const olderCaseRun = { id: "source-example", executionKind: "demo_simulation" };
const olderCaseResult = { ...result, priceSource: { ...result.priceSource, type: "unverified" } };
assert.equal(buildBrief({ project, scenario, result: olderCaseResult, run: olderCaseRun }).syntheticCaseLabel, brief.syntheticCaseLabel);
assert.equal(buildBrief({ project, scenario, result: olderCaseResult, run: { ...olderCaseRun, id: "different-run" } }).syntheticCaseLabel, undefined);
const backendResult = { ...result, priceSource: { ...result.priceSource, type: "backend" } };
assert.equal(buildBrief({ project, scenario, result: backendResult }).syntheticCaseLabel, undefined);
assert.match(legacy.context.find(({ label }) => label === "测算周期").value, /^2030 年$/);
assert.deepEqual(legacy.tables.map(({ key, number }) => [key, number]), [["income-details", 1], ["mechanism-settlement", 2], ["annual", 3]]);
assert.match(legacy.figures.find(({ key }) => key === "income").caption, /费用与其他净收入合计/);
assert.doesNotMatch(legacy.figures.find(({ key }) => key === "income").caption, /三项费用/, "历史结果不从当前参数拆分费用");
const partial = buildBrief({ project, scenario, result: {
  annualRows: [{ ...row, storageDispatch: { ...row.storageDispatch, withStorageFullRevenue: 100 }, spotAvgPrice: undefined, mechanismRevenue: undefined }],
  totalFullRevenue: 670000, totalEnergy: 2000, avgFullRevenuePrice: 335
} });
assert.deepEqual(partial.figures.map(({ key, number }) => [key, number]), [["price", 1], ["annual-income", 2]]);
assert.deepEqual(partial.tables.map(({ key, number }) => [key, number]), [["annual", 1]]);
assert.equal(partial.figures[0].series.length, 2);
const negativeRow = { year: 2030, energyMwh: 1000, spotAvgPrice: -8, capturePrice: -10, spotRevenue: -10000,
  mechanismRevenue: 0, ltPnlRevenue: 0, envRevenue: 0, storageSupplementRevenue: 0, comprehensiveFee: 2000,
  otherIncome: 0, fullRevenue: -12000, fullRevenuePrice: -12 };
const negative = buildBrief({ project: { ...project, hasStorage: false }, scenario,
  result: { annualRows: [negativeRow], totalFullRevenue: -12000, totalEnergy: 1000, avgFullRevenuePrice: -12 } });
assert.deepEqual(negative.tables.find(({ key }) => key === "income-details").rows.at(-1), ["全口径收入合计", "-1.20", "-12.00", "—"]);
assert.equal(negative.figures.find(({ key }) => key === "first-price-bridge").items.at(-1).value, -12);
const noEnergy = buildBrief({ project, scenario,
  result: { annualRows: [{ ...negativeRow, energyMwh: 0, capturePrice: 0, spotRevenue: 0, fullRevenue: -2000, fullRevenuePrice: 0 }],
    totalFullRevenue: -2000, totalEnergy: 0, avgFullRevenuePrice: 0 } });
assert.equal(noEnergy.figures.some(({ key }) => key === "first-price-bridge"), false);
assert.deepEqual(noEnergy.tables.find(({ key }) => key === "income-details").rows.at(-1), ["全口径收入合计", "-0.20", "—", "—"]);
assert.equal(buildBrief({ project, scenario, result: null }), null);
assert.equal(buildBrief({ project, scenario, result: { ...result, annualRows: [] } }), null);
assert.equal(buildBrief({ project, scenario, result: { ...result, annualRows: [{ ...row, fullRevenue: NaN }] } }), null);

const root = { innerHTML: "" };
render({ root, brief: { ...brief, projectName: "<script>项目</script>" } });
assert.match(root.innerHTML, /&lt;script&gt;项目&lt;\/script&gt;/);
assert.equal((root.innerHTML.match(/data-brief-synthetic-case/g) || []).length, 1);
assert.match(root.innerHTML, /data-brief-synthetic-case>合成案例 · 现货电价为模拟数据</);
assert.match(root.innerHTML, /data-brief-chart="price"/);
assert.match(root.innerHTML, /data-brief-chart="income"/);
assert.match(root.innerHTML, /data-brief-table="annual"/);
const visible = root.innerHTML.replace(/<[^>]*>/g, "");
assert.match(visible, /图 1\s*年度电价对比/);
assert.match(visible, /配储收入增量[\s\S]*附录[\s\S]*表 5\s*年度测算结果/);
assert.doesNotMatch(root.innerHTML, /result-archived-example|测算口径|演示现货曲线/);
assert.doesNotMatch(root.innerHTML, /<(?:script|button|a\s|input|select|details)\b/i, "简报正文仅展示图文和表格");
render({ root, brief: buildBrief({ project, scenario, result: backendResult }) });
assert.doesNotMatch(root.innerHTML, /data-brief-synthetic-case/);
render({ root, brief: null, message: "恢复后 <请重新测算>" });
assert.match(root.innerHTML, /恢复后 &lt;请重新测算&gt;/);
console.log("result brief tests passed");
