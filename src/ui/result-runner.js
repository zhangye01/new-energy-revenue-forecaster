"use strict";

(function (root, factory) {
  const api = factory(typeof module !== "undefined" && module.exports ? require("../domain/result-versions") : root.NE_RESULT_VERSIONS);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_RESULT_RUNNER = api;
  if (root.window && root.window !== root) {
    root.window.NE_RESULT_RUNNER = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (resultVersions) {
  function runScenarioCalculation(input = {}) {
    const {
      project = null,
      scenario = null,
      run = null,
      scenarioConfig = {},
      scenarioConfirmed = false,
      validateConfig = null,
      validateResult = null,
      resultCalculation = {},
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
      scenarioConfirmed,
      validateConfig
    }) || { ok: false, message: "测算前置校验不可用。" };
    if (!readiness.ok) {
      setTopMeta(readiness.message);
      return { status: "not_ready", message: readiness.message };
    }

    let result;
    try {
      result = calculateScenarioResult(project, scenario, run);
    } catch (error) {
      const message = error?.message || "测算失败，请核对输入。";
      setTopMeta(message);
      return { status: "invalid_input", message };
    }
    if (result?.missingYears?.length) {
      const message = resultCalculation.buildMissingCurveMessage?.(result) || "";
      setTopMeta(message);
      return { status: "missing_curves", message, result };
    }
    let resultValid = Array.isArray(result?.annualRows) && result.annualRows.length > 0;
    try {
      if (resultValid && validateResult) resultValid = validateResult(project, scenario, result);
    } catch (_) {
      resultValid = false;
    }
    if (!resultValid) {
      const message = "本次测算结果未通过明细对账，请核对输入后重试。";
      setTopMeta(message);
      return { status: "invalid_result", message };
    }

    try {
      result = resultVersions.stampComputedResult(project, scenario, run, stampResult(project, scenario, run, result));
    } catch (error) {
      const message = error?.message || "测算结果来源保存失败，请核对后重试。";
      setTopMeta(message);
      return { status: "invalid_input", message };
    }
    const previous = project.resultsByScenario[scenario.id];
    resultVersions.archivePreviousResult(project, scenario.id, previous);
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
    renderAll();
    return { status: "completed", result };
  }

  return Object.freeze({
    runScenarioCalculation
  });
});
