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
      validateConfig = null,
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
      scenarioConfig,
      validateConfig
    }) || { ok: false, message: "测算前置校验不可用。" };
    if (!readiness.ok) {
      setTopMeta(readiness.message);
      return { status: "not_ready", message: readiness.message };
    }

    const energyPrepared = prepareEnergy(project) || { changed: false };
    let result;
    try {
      result = calculateScenarioResult(project, scenario, run);
    } catch (error) {
      const message = error?.message || "测算失败，请核对输入。";
      setTopMeta(message);
      if (energyPrepared.changed) renderAll();
      return { status: "invalid_input", message };
    }
    if (result?.missingYears?.length) {
      const message = resultCalculation.buildMissingCurveMessage?.(result) || "";
      setTopMeta(message);
      if (energyPrepared.changed) renderAll();
      return { status: "missing_curves", message, result, energyPrepared };
    }

    result = stampResult(project, scenario, run, result);
    const previous = project.resultsByScenario[scenario.id];
    if (Array.isArray(previous?.annualRows) && previous.annualRows.length
        && !previous.annualRows.some((row) => row?.storageDispatch)
        && (project.hasStorage || previous.sourceContext?.storageContext?.hasStorage
          || previous.annualRows.some((row) => row?.storageSupplementRevenue > 0))) {
      project.legacyStorageResultsByScenario ||= {};
      project.legacyStorageResultsByScenario[scenario.id] ??= previous;
    }
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
