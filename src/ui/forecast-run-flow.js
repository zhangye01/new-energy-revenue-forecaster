"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_FORECAST_RUN_FLOW = api;
  if (root.window && root.window !== root) {
    root.window.NE_FORECAST_RUN_FLOW = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function forecastParameterError(options = {}, isRun = false) {
    const hasWindow = !isRun || options.trainStart !== undefined || options.trainEnd !== undefined;
    if (hasWindow && (![options.trainStart, options.trainEnd].every((year) => Number.isInteger(year) && year >= 2010 && year <= 2100))) {
      return "训练窗口应填写2010至2100之间的整数年份。";
    }
    if (hasWindow && options.trainStart > options.trainEnd) return "训练窗口起始年份不能晚于结束年份。";
    if ((!isRun || options.growth !== undefined) && (!Number.isFinite(options.growth) || options.growth <= -1)) {
      return "价格增长率应为有效数字且大于-100%。";
    }
    if (!isRun && (!Number.isInteger(options.seed) || options.seed < 1 || options.seed > 99999)) {
      return "随机种子应为1至99999之间的整数。";
    }
    return "";
  }

  function canActivateRun(run) {
    return ["publishable", "publishable_warn", "publishable_forced"].includes(run?.status)
      && !forecastParameterError(run, true);
  }

  function statusLabel(run) {
    const labels = {
      validated: "未过硬门槛",
      publishable: "可发布",
      publishable_warn: "可发布(软门槛预警)",
      publishable_forced: "强制发布"
    };
    return labels[run?.status] || run?.status || "-";
  }

  function formatForecastGranularity(run) {
    if (run?.granularityMinutes === 15) {
      return `15分钟 / ${run.pointsPerYear || 35040}点/年`;
    }
    return "小时 / 8760点/年";
  }

  function getActiveRun(project) {
    const runs = Array.isArray(project?.priceRuns) ? project.priceRuns : [];
    return runs.find((run) => run.id === project?.activeRunId) || null;
  }

  function hasActiveActivatableRun(project) {
    return canActivateRun(getActiveRun(project));
  }

  function addActivationLog(input = {}) {
    const {
      project = null,
      fromRunId = "",
      toRunId = "",
      reason = "",
      actions = {}
    } = input;
    if (!project) return null;
    if (!Array.isArray(project.activationLogs)) project.activationLogs = [];
    const log = {
      id: actions.makeId?.("act") || `act-${Date.now()}`,
      fromRunId: fromRunId || "-",
      toRunId,
      reason: reason || "手动切换",
      changedAt: actions.nowIso?.() || new Date().toISOString()
    };
    project.activationLogs.unshift(log);
    return log;
  }

  function readForecastFormInput(input = {}) {
    const {
      documentRef = null,
      project = null,
      nowIso = new Date().toISOString()
    } = input;
    const queryValue = (selector) => String(documentRef?.querySelector?.(selector)?.value || "").trim();
    const algorithmVersion = queryValue("#algo-version") || "1.0.0";
    const featureVersion = queryValue("#feature-version") || "1.0.0";
    const dataSnapshotId = queryValue("#data-snapshot-id") || `snapshot-${nowIso.slice(0, 10)}`;
    const trainStartRaw = queryValue("#train-start");
    const trainEndRaw = queryValue("#train-end");
    const trainStart = trainStartRaw ? Number(trainStartRaw) : Math.max(2010, project.startYear - 8);
    const trainEnd = trainEndRaw ? Number(trainEndRaw) : Math.max(trainStart, project.startYear - 1);
    const seedRaw = queryValue("#algo-seed");
    const seed = seedRaw ? Number(seedRaw) : 2027;
    const growthRaw = queryValue("#algo-growth");
    const growth = growthRaw ? Number(growthRaw) / 100 : 0;
    return {
      algorithmVersion,
      featureVersion,
      dataSnapshotId,
      trainStart,
      trainEnd,
      seed,
      growth
    };
  }

  function markForecastReady(project, services = {}) {
    if (!project.statuses || typeof project.statuses !== "object") project.statuses = {};
    project.statuses["forecast-page"] = hasActiveActivatableRun(project) ? "completed" : "in_progress";
    if (project.statuses["scenario-page"] === "not_started") {
      project.statuses["scenario-page"] = "in_progress";
    }
    services.markDownstreamStale?.(project, "forecast-page");
  }

  function generateForecastRun(input = {}) {
    const {
      project = null,
      documentRef = null,
      modelDefinitions = [],
      services = {},
      actions = {}
    } = input;
    if (!project) return false;
    if (!Number.isInteger(project.startYear) || !Number.isInteger(project.forecastYears) || project.forecastYears < 1) {
      actions.setTopMeta?.("请先保存项目测算起始年份和测算周期，再生成电价预测。");
      return false;
    }

    const options = readForecastFormInput({
      documentRef,
      project,
      nowIso: actions.nowIso?.() || new Date().toISOString()
    });
    const parameterError = forecastParameterError(options);
    if (parameterError) {
      actions.setTopMeta?.(parameterError);
      return false;
    }
    const generatedRuns = modelDefinitions.map((model) => services.createForecastRunForModel?.(project, model, options));
    const validRuns = generatedRuns.filter(Boolean);
    if (!Array.isArray(project.priceRuns)) project.priceRuns = [];
    project.priceRuns.unshift(...validRuns.slice().reverse());

    const preferredRun = validRuns.find((run) => run.algorithmFamily === "ensemble" && canActivateRun(run))
      || validRuns.find((run) => canActivateRun(run));
    if (preferredRun) {
      const oldRunId = project.activeRunId;
      project.activeRunId = preferredRun.id;
      addActivationLog({
        project,
        fromRunId: oldRunId,
        toRunId: preferredRun.id,
        reason: "三模型15分钟模拟完成，融合模型自动生效",
        actions
      });
    }
    markForecastReady(project, services);
    actions.setTopMeta?.(`已生成 LSTM、XGBoost、Ensemble 三套 ${project.startYear}-${project.startYear + project.forecastYears - 1} 年15分钟现货电价模拟曲线。`);
    actions.renderAll?.();
    return true;
  }

  function setActiveRun(input = {}) {
    const {
      project = null,
      runId = "",
      services = {},
      actions = {}
    } = input;
    if (!project) return false;
    const target = Array.isArray(project.priceRuns) ? project.priceRuns.find((run) => run.id === runId) : null;
    if (!target) return false;
    const parameterError = forecastParameterError(target, true);
    if (parameterError) {
      actions.setTopMeta?.(`该版本参数无效，不能生效：${parameterError}`);
      return false;
    }
    if (!canActivateRun(target)) {
      actions.setTopMeta?.("该版本未通过硬门槛，不能直接生效。");
      return false;
    }
    if (project.activeRunId === target.id) return false;
    const oldRunId = project.activeRunId;
    project.activeRunId = target.id;
    addActivationLog({ project, fromRunId: oldRunId, toRunId: target.id, reason: "设置为生效版本", actions });
    if (!project.statuses || typeof project.statuses !== "object") project.statuses = {};
    project.statuses["forecast-page"] = "completed";
    if (project.statuses["scenario-page"] === "not_started") {
      project.statuses["scenario-page"] = "in_progress";
    }
    services.markDownstreamStale?.(project, "forecast-page");
    actions.renderAll?.();
    return true;
  }

  function forceActivateRun(input = {}) {
    const {
      project = null,
      runId = "",
      services = {},
      actions = {}
    } = input;
    if (!project) return false;
    const target = Array.isArray(project.priceRuns) ? project.priceRuns.find((run) => run.id === runId) : null;
    if (!target) return false;
    const parameterError = forecastParameterError(target, true);
    if (parameterError) {
      actions.setTopMeta?.(`该版本参数无效，不能强制生效：${parameterError}`);
      return false;
    }
    const reason = actions.promptForceReason?.();
    if (reason === null) return false;
    target.status = "publishable_forced";
    const oldRunId = project.activeRunId;
    project.activeRunId = target.id;
    addActivationLog({ project, fromRunId: oldRunId, toRunId: target.id, reason: reason || "初版阶段人工放行", actions });
    if (!project.statuses || typeof project.statuses !== "object") project.statuses = {};
    project.statuses["forecast-page"] = "completed";
    if (project.statuses["scenario-page"] === "not_started") {
      project.statuses["scenario-page"] = "in_progress";
    }
    services.markDownstreamStale?.(project, "forecast-page");
    actions.renderAll?.();
    return true;
  }

  return Object.freeze({
    addActivationLog,
    canActivateRun,
    forceActivateRun,
    forecastParameterError,
    formatForecastGranularity,
    generateForecastRun,
    hasActiveActivatableRun,
    readForecastFormInput,
    setActiveRun,
    statusLabel
  });
});
