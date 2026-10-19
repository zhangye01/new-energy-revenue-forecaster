"use strict";

const assert = require("node:assert/strict");
const {
  buildEnergyPreparedCalculationMessage,
  runScenarioCalculation
} = require("../src/ui/result-runner");

const resultCalculation = {
  validateCalculationReadiness: ({ project, scenario, run }) => (
    project && scenario && run
      ? { ok: true, message: "" }
      : { ok: false, message: "请先补齐测算前置条件。" }
  ),
  buildMissingCurveMessage: (result) => `缺失：${result.missingYears.join("、")}`
};

assert.equal(
  buildEnergyPreparedCalculationMessage({ defaultAnnualFilled: true, completed: 3, total: 5 }),
  "已自动补齐默认逐年总量并调用省份典型曲线生成 3/5 年上网电量，并完成测算。"
);
assert.equal(
  buildEnergyPreparedCalculationMessage({ defaultAnnualFilled: false, completed: 5, total: 5 }),
  "已自动调用省份典型曲线生成 5/5 年上网电量，并完成测算。"
);

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
  prepareEnergy: () => ({ changed: true, completed: 1, total: 2 }),
  calculateScenarioResult: () => ({ missingYears: [2026, 2027] }),
  stampResult: () => { throw new Error("未成功计算的结果不得登记来源"); },
  setTopMeta: (message) => notReadyMessages.push(message),
  renderAll: () => {
    missingRendered += 1;
  }
});
assert.equal(missingResult.status, "missing_curves");
assert.equal(missingResult.message, "缺失：2026、2027");
assert.equal(missingRendered, 1);
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
  prepareEnergy: () => ({ changed: true, completed: 2, total: 2, defaultAnnualFilled: false }),
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
assert.deepEqual(metaMessages, ["已自动调用省份典型曲线生成 2/2 年上网电量，并完成测算。"]);

// Stamp after energy preparation and calculation, and save the stamped object itself.
const stampedProject = { id: "project-1", resultsByScenario: {}, statuses: {} };
const stampedScenario = { id: "scenario-1" };
const stampedRun = { id: "run-1" };
const eventOrder = [];
const stamped = runScenarioCalculation({
  project: stampedProject, scenario: stampedScenario, run: stampedRun, resultCalculation,
  prepareEnergy: (currentProject) => {
    eventOrder.push("energy");
    currentProject.energyData = { prepared: true };
    return { changed: false };
  },
  calculateScenarioResult: () => {
    eventOrder.push("calculate");
    return calculationResult;
  },
  stampResult: (currentProject, currentScenario, currentRun, result) => {
    eventOrder.push("stamp");
    assert.equal(currentProject, stampedProject);
    assert.deepEqual(currentProject.energyData, { prepared: true });
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
assert.deepEqual(eventOrder, ["energy", "calculate", "stamp", "render"]);
assert.equal(stamped.result, stampedProject.resultsByScenario[stampedScenario.id]);
assert.notEqual(stamped.result, calculationResult);
assert.equal(calculationResult.sourceContext, undefined);

console.log("result runner tests passed");
