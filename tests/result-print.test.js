"use strict";

const assert = require("node:assert/strict");
const { printScenarioReport } = require("../src/ui/result-print");

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
    chart: { isDisposed: () => false, resize: () => {} }
  },
  documentRef: {
    body: { classList: bodyClassList },
    querySelectorAll: () => [disclosure]
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
assert.equal(bodyClassList.contains("print-report-mode"), true);
afterPrint();
assert.equal(pane.hidden, true);
assert.equal(disclosure.open, false);
assert.equal(activePage, "compare-page");
assert.equal(bodyClassList.contains("print-report-mode"), false);

console.log("result print tests passed");
