"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_RESULT_RUNNER = api;
  if (root.window && root.window !== root) {
    root.window.NE_RESULT_RUNNER = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function buildEnergyPreparedCalculationMessage(energyPrepared = {}) {
    const fillText = energyPrepared.defaultAnnualFilled ? "补齐默认逐年总量并" : "";
    return `已自动${fillText}调用省份典型曲线生成 ${energyPrepared.completed}/${energyPrepared.total} 年上网电量，并完成测算。`;
  }

  function runScenarioCalculation(input = {}) {
    const {
      project = null,
      scenario = null,
      run = null,
      scenarioConfig = {},
      resultCalculation = {},
      prepareEnergy = () => ({ changed: false }),
      calculateScenarioResult = () => null,
      stampResult = (_project, _scenario, _run, result) => result,
      countScenariosForCompare = () => 0,
      setTopMeta = () => {},
      renderAll = () => {}
    } = input;
    const readiness = resultCalculation.validateCalculationReadiness?.({
      project,
      scenario,
      run,
      scenarioConfig
    }) || { ok: false, message: "测算前置校验不可用。" };
    if (!readiness.ok) {
      setTopMeta(readiness.message);
      return { status: "not_ready", message: readiness.message };
    }

    const energyPrepared = prepareEnergy(project) || { changed: false };
    let result = calculateScenarioResult(project, scenario, run);
    if (result?.missingYears?.length) {
      const message = resultCalculation.buildMissingCurveMessage?.(result) || "";
      setTopMeta(message);
      if (energyPrepared.changed) renderAll();
      return { status: "missing_curves", message, result, energyPrepared };
    }

    result = stampResult(project, scenario, run, result);
    project.resultsByScenario[scenario.id] = result;
    project.statuses["results-page"] = "completed";
    project.statuses["compare-page"] = countScenariosForCompare(project) >= 2 ? "completed" : "in_progress";
    if (energyPrepared.changed) {
      setTopMeta(buildEnergyPreparedCalculationMessage(energyPrepared));
    }
    renderAll();
    return { status: "completed", result, energyPrepared };
  }

  return Object.freeze({
    buildEnergyPreparedCalculationMessage,
    runScenarioCalculation
  });
});
