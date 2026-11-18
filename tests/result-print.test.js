"use strict";

const assert = require("node:assert/strict");
const { printScenarioReport, renderVersionTrace } = require("../src/ui/result-print");

let topMeta = "";
assert.equal(printScenarioReport({ setTopMeta: (message) => { topMeta = message; } }), false);
assert.equal(topMeta, "请先选择项目，再打印报告。");

topMeta = "";
assert.equal(printScenarioReport({ project: { id: "p1" }, setTopMeta: (message) => { topMeta = message; } }), false);
assert.equal(topMeta, "请先在基准结果总览页发起测算，再打印报告。");

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add: (name) => values.add(name),
    remove: (name) => values.delete(name),
    contains: (name) => values.has(name),
    toggle: (name, force) => (force ? values.add(name) : values.delete(name)),
    values
  };
}

const pane = { hidden: true, classList: makeClassList([]) };
const disclosure = { open: false, classList: makeClassList([]) };
const archive = { open: false, classList: makeClassList(["result-history"]) };
const bodyClassList = makeClassList([]);
let afterPrint = null;
let printed = false;
let activePage = "";
const ok = printScenarioReport({
  project: { id: "p1" },
  scenario: { id: "s1" },
  result: { totalFullRevenue: 1 },
  appState: { activePage: "compare-page" },
  refs: { resultReportPanes: [pane] },
  resultChartInstances: {
    chart: { isDisposed: () => false, resize: () => assert.equal(bodyClassList.contains("print-report-mode"), true) }
  },
  documentRef: {
    body: { classList: bodyClassList },
    querySelectorAll: () => [disclosure, archive]
  },
  windowRef: {
    addEventListener: (_name, handler) => { afterPrint = handler; },
    print: () => { printed = true; },
    setTimeout: () => {}
  },
  updatePrintReportHeader: () => {},
  setActivePage: (page) => { activePage = page; },
  renderAll: () => {}
});
assert.equal(ok, true);
assert.equal(printed, true);
assert.equal(activePage, "results-page");
assert.equal(pane.hidden, false);
assert.equal(disclosure.open, true);
assert.equal(archive.open, false);
assert.equal(bodyClassList.contains("print-report-mode"), true);
afterPrint();
assert.equal(pane.hidden, true);
assert.equal(disclosure.open, false);
assert.equal(activePage, "compare-page");
assert.equal(bodyClassList.contains("print-report-mode"), false);

const trace = {};
renderVersionTrace(trace, {}, { sourceContext: { generatedAt: "2026-01-02T03:04:05Z", runId: "run-old" },
  resultVersion: { id: "result-traced", schemaVersion: 1 },
  priceSource: { type: "demo", runId: "run-old", fingerprint: "price-v1-0011223344556677" } });
assert.equal(trace.hidden, false);
assert.match(trace.textContent, /测算版本 result-traced.*测算时间.*演示现货曲线.*价格版本 run-old/);
renderVersionTrace(trace, {}, undefined);
assert.equal(trace.hidden, true);

console.log("result print tests passed");
