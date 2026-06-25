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

console.log("result runner tests passed");
