"use strict";

const assert = require("node:assert/strict");
const { runScenarioCalculation } = require("../src/ui/result-runner");

const resultCalculation = {
  validateCalculationReadiness: ({ project, scenario, run }) => (
    project && scenario && run
      ? { ok: true, message: "" }
      : { ok: false, message: "请先补齐测算前置条件。" }
  ),
  buildMissingCurveMessage: (result) => `缺失：${result.missingYears.join("、")}`
};

const notReadyMessages = [];
const notReady = runScenarioCalculation({
  resultCalculation,
  setTopMeta: (message) => notReadyMessages.push(message)
});
assert.deepEqual(notReady, { status: "not_ready", message: "请先补齐测算前置条件。" });
assert.deepEqual(notReadyMessages, ["请先补齐测算前置条件。"]);

const missingProject = {
  resultsByScenario: {},
  statuses: {}
};
let missingRendered = 0;
const missingResult = runScenarioCalculation({
  project: missingProject,
  scenario: { id: "s1" },
  run: { id: "r1" },
  resultCalculation,
  prepareEnergy: () => { throw new Error("正式测算不得自动补齐电量"); },
  calculateScenarioResult: () => ({ missingYears: [2026, 2027] }),
  stampResult: () => { throw new Error("未成功计算的结果不得登记来源"); },
  setTopMeta: (message) => notReadyMessages.push(message),
  renderAll: () => {
    missingRendered += 1;
  }
});
assert.equal(missingResult.status, "missing_curves");
assert.equal(missingResult.message, "缺失：2026、2027");
assert.equal(missingRendered, 0);
assert.deepEqual(missingProject.resultsByScenario, {});

const project = {
  resultsByScenario: {},
  statuses: {}
};
let rendered = 0;
const metaMessages = [];
const calculationResult = { missingYears: [], annualRows: [{ year: 2026 }] };
const completed = runScenarioCalculation({
  project,
  scenario: { id: "s1" },
  run: { id: "r1" },
  resultCalculation,
  prepareEnergy: () => { throw new Error("正式测算不得自动补齐电量"); },
  calculateScenarioResult: () => calculationResult,
  countScenariosForCompare: () => 2,
  setTopMeta: (message) => metaMessages.push(message),
  renderAll: () => {
    rendered += 1;
  }
});
assert.equal(completed.status, "completed");
assert.equal(project.resultsByScenario.s1, calculationResult);
assert.equal(project.statuses["results-page"], "completed");
assert.equal(project.statuses["compare-page"], "completed");
assert.equal(rendered, 1);
assert.deepEqual(metaMessages, []);

// Stamp the saved input calculation, and save the stamped object itself.
const stampedProject = { id: "project-1", energyData: { saved: true }, resultsByScenario: {}, statuses: {} };
const stampedScenario = { id: "scenario-1" };
const stampedRun = { id: "run-1" };
const eventOrder = [];
const stamped = runScenarioCalculation({
  project: stampedProject, scenario: stampedScenario, run: stampedRun, resultCalculation,
  prepareEnergy: () => { throw new Error("正式测算不得自动补齐电量"); },
  calculateScenarioResult: () => {
    eventOrder.push("calculate");
    return calculationResult;
  },
  stampResult: (currentProject, currentScenario, currentRun, result) => {
    eventOrder.push("stamp");
    assert.equal(currentProject, stampedProject);
    assert.deepEqual(currentProject.energyData, { saved: true });
    assert.equal(currentScenario, stampedScenario);
    assert.equal(currentRun, stampedRun);
    assert.equal(result, calculationResult);
    return { ...result, sourceContext: { runId: currentRun.id } };
  },
  renderAll: () => {
    eventOrder.push("render");
    assert.equal(stampedProject.resultsByScenario[stampedScenario.id].sourceContext.runId, "run-1");
  }
});
assert.deepEqual(eventOrder, ["calculate", "stamp", "render"]);
assert.equal(stamped.result, stampedProject.resultsByScenario[stampedScenario.id]);
assert.notEqual(stamped.result, calculationResult);
assert.equal(calculationResult.sourceContext, undefined);

const formalRules = require("../src/domain/result-calculation");
const oldResult = { annualRows: [{ year: 2026 }], totalFullRevenue: 12345, sourceContext: { historical: true } };
const guardedProject = { id: "old-project", startYear: 2026, forecastYears: 1,
  energyData: { annualInputByYear: { 2026: 2000 } },
  resultsByScenario: { s1: oldResult }, statuses: { "results-page": "completed" } };
const guardedScenario = { id: "s1", config: { otherFee: 3 }, confirmedConfig: {} };
function runBlocked(scenarioConfirmed) {
  const before = structuredClone({ project: guardedProject, scenario: guardedScenario });
  const result = runScenarioCalculation({ project: guardedProject, scenario: guardedScenario,
    run: { id: "r1" }, scenarioConfirmed, resultCalculation: formalRules,
    prepareEnergy: () => { throw new Error("不允许填补电量"); },
    calculateScenarioResult: () => { throw new Error("前置校验未过不得计算"); },
    renderAll: () => { throw new Error("被阻止的测算不得改写页面或触发保存"); } });
  assert.equal(result.status, "not_ready");
  assert.deepEqual({ project: guardedProject, scenario: guardedScenario }, before);
  assert.equal(guardedProject.resultsByScenario.s1, oldResult, "保留同一历史结果对象供查看");
  return result;
}
assert.match(runBlocked(true).message, /完整的逐年8760/);
guardedProject.energyData.hourlyByYear = { 2026: Array(8760).fill(0.2) };
assert.match(runBlocked(false).message, /确认并保存全部适用参数/);
const formalReady = runScenarioCalculation({ project: guardedProject, scenario: guardedScenario,
  run: { id: "r1" }, scenarioConfirmed: true, resultCalculation: formalRules,
  calculateScenarioResult: () => calculationResult });
assert.equal(formalReady.status, "completed", "完整保存的电量和已确认参数可发起正式测算");

console.log("result runner tests passed");
