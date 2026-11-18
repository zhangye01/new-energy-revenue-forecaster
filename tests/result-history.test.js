"use strict";

const assert = require("node:assert/strict");
const calculator = require("../src/domain/revenue-calculator");
const scenarioModel = require("../src/domain/scenario-model");
const rough = require("../src/domain/rough-price");
const versions = require("../src/domain/result-versions");
const history = require("../src/ui/result-history");

const run = { id: "demo-2028", executionKind: "demo_model", pricesByYear: { 2028: Array(8760).fill(300) } };
const project = { id: "history-project", name: "案例", startYear: 2028, forecastYears: 1, capacityMw: 10,
  hasStorage: false, siteType: "onshore", energyData: { hourlyByYear: { 2028: Array(8760).fill(0.2) } }, priceRuns: [run] };
const scenario = { id: "pressure", name: "历史压力方案", isBaseline: false, config: scenarioModel.defaultScenarioConfig(project) };
const legacy = rough.stampBaselineResult(project, scenario, run, calculator.calculateScenarioResult(project, scenario, run));
const first = versions.stampComputedResult(project, scenario, run, legacy);
versions.archivePreviousResult(project, scenario.id, legacy);
versions.archivePreviousResult(project, scenario.id, first);
scenario.name = "新方案名称";
scenario.config.otherFee += 10;

const panel = { dataset: {} };
const select = { value: "archive-2" };
const buttons = { "[data-history-annual]": {}, "[data-history-hourly]": {} };
const detail = { innerHTML: "", querySelector(selector) { return this.innerHTML.includes(selector.slice(1, -1)) ? buttons[selector] : null; } };
const content = { querySelector: (selector) => selector === "select" ? select : detail };
const trace = {}, count = {};
const nodes = { "#result-current-trace": trace, "#result-history-panel": panel, "#result-history-content": content, "#result-history-count": count };
const downloads = [];
history.render({ documentRef: { querySelector: (selector) => nodes[selector] }, project, scenario, result: first, view: { state: "ready" },
  downloadCsv: (name, rows) => downloads.push({ name, rows }) });
assert.match(trace.textContent, /测算版本 · result-.+ · 演示现货曲线 · demo-2028/);
assert.equal(count.textContent, "2 份");
assert.equal(panel.hidden, false);
assert.equal(panel.open, false);
assert.equal(detail.innerHTML, "");
panel.open = true;
panel.ontoggle();
assert.match(detail.innerHTML, /历史压力方案/);
assert.match(detail.innerHTML, /2028/);
buttons["[data-history-annual]"].onclick();
buttons["[data-history-hourly]"].onclick();
assert.equal(downloads[0].name, `案例-历史压力方案-历史-年度收入-${first.resultVersion.id}.csv`);
assert.equal(downloads[0].rows.length, 2);
assert.equal(downloads[1].rows.length, 8761);
for (const { rows } of downloads) {
  const row = Object.fromEntries(rows[0].map((header, i) => [header, rows[1][i]]));
  assert.equal(row.result_version, first.resultVersion.id);
  assert.equal(row.result_status, "历史结果");
  assert.equal(row.price_source, "演示现货曲线");
}
select.value = "archive-1";
select.onchange();
assert.match(detail.innerHTML, /旧版归档缺少原测算输入记录/);
assert.doesNotMatch(detail.innerHTML, /data-history-(annual|hourly)/);
assert.match(detail.innerHTML, /300\.00/);

console.log("result history tests passed");
