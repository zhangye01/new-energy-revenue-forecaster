"use strict";

(function (root, factory) {
  const priceForecast = typeof module !== "undefined" && module.exports
    ? require("../domain/price-forecast") : root.NE_PRICE_FORECAST;
  const api = factory(priceForecast);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_FORECAST_RUN_FLOW = api;
  if (root.window && root.window !== root) {
    root.window.NE_FORECAST_RUN_FLOW = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (priceForecast) {
  const BACKEND_MODELS = new Map(priceForecast.FORECAST_MODEL_DEFINITIONS.map((model) => [model.family, model]));
  const BACKUP_UNSAFE_IDS = new Set(["__proto__", "constructor", "prototype"]);
  const validId = (id) => typeof id === "string" && Boolean(id.trim()) && !BACKUP_UNSAFE_IDS.has(id);

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

  function canActivateRun(run, project = null) {
    return ["publishable", "publishable_warn", "publishable_forced"].includes(run?.status)
      && (run.executionKind !== "real_model" || !project?.hasStorage || run.marketPriceBasis === priceForecast.MARKET_PRICE_BASIS)
      && !forecastParameterError(run, true) && priceForecast.validateForecastPriceData(project, run).ok;
  }

  function statusLabel(run, project = null) {
    if (!priceForecast.validateForecastPriceData(project, run).ok) return "电价数据无效";
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
    return runs.find((run) => run?.id === project?.activeRunId) || null;
  }

  function hasActiveActivatableRun(project, services = {}) {
    const run = getActiveRun(project);
    return canActivateRun(run, project) && !supplyDemandRunError(project, run, services);
  }

  function getArchivedCaseRuns(project) {
    const active = getActiveRun(project);
    const source = active?.supplyDemandInput;
    if (active?.executionKind !== "demo_simulation" || typeof active.algorithmVersion !== "string"
        || !active.algorithmVersion.startsWith("synthetic-case-") || !source?.fingerprint
        || !canActivateRun(active, project) || !priceForecast.validateSupplyDemandRun(project, active).ok) return [];

    // A restored copy binds the active run only. Check its companion curves under the original identity for display.
    const sourceProject = source.projectId === project.id ? project : { ...project, id: source.projectId };
    return project.priceRuns.filter((run) => run === active || (run?.executionKind === active.executionKind
      && run.algorithmVersion === active.algorithmVersion && run.supplyDemandInput?.projectId === source.projectId
      && run.supplyDemandInput.fingerprint === source.fingerprint && canActivateRun(run, project)
      && priceForecast.validateSupplyDemandRun(sourceProject, run).ok));
  }

  function getPublishedBackendResults(project) {
    const active = getActiveRun(project);
    if (active?.executionKind !== "real_model" || !canActivateRun(active, project)
        || !priceForecast.validateSupplyDemandRun(project, active).ok) return [];
    const source = active.supplyDemandInput;
    const sourceProject = source.projectId === project.id ? project : { ...project, id: source.projectId };
    const companions = project.priceRuns.filter((run) => run !== active && run?.executionKind === "real_model"
      && run.backendTaskId === active.backendTaskId && run.supplyDemandInput?.fingerprint === source.fingerprint
      && priceForecast.validateForecastPriceData(project, run).ok && priceForecast.validateSupplyDemandRun(sourceProject, run).ok);
    const summaries = Array.isArray(active.backendDisplayResults) ? active.backendDisplayResults : [];
    return [active, ...companions, ...summaries];
  }

  function backendModelRows(task) {
    if (!Array.isArray(task.results) || task.results.length !== BACKEND_MODELS.size) {
      throw new Error("后台尚未完整返回三种预测模型的结果。");
    }
    const rowsByModel = new Map(), seenIds = new Set();
    for (const result of task.results) {
      const code = result?.modelCode ?? result?.algorithmFamily;
      const model = typeof code === "string" && BACKEND_MODELS.get(code.trim().toLowerCase());
      const id = result?.runId ?? result?.id;
      if (!model || !validId(id) || rowsByModel.has(model.family) || seenIds.has(id)
          || (result.executionKind !== undefined && result.executionKind !== "real_model")
          || result.supplyDemandInput?.featureConsumption === "not_used_by_demo_model") {
        throw new Error("后台模型标识、运行编号或价格来源无效。");
      }
      seenIds.add(id);
      rowsByModel.set(model.family, { model, id, result, complete: result.pricesByYear !== undefined || result.quarterPricesByYear !== undefined });
    }
    return [...BACKEND_MODELS.keys()].map((code) => rowsByModel.get(code));
  }

  function backendAnnualSummary(project, task, { model, id, result }) {
    const years = Array.from({ length: project.forecastYears }, (_, index) => project.startYear + index);
    const prices = result.annualPrices;
    const unit = result.priceUnit ?? task.priceUnit;
    const calendar = result.calendar ?? task.calendar;
    if ((unit !== undefined && unit !== "CNY/MWh") || (calendar !== undefined && calendar !== "fixed_365_days")
        || !prices || typeof prices !== "object" || Array.isArray(prices) || Object.keys(prices).length !== years.length
        || years.some((year) => !Number.isFinite(prices[year]))) {
      throw new Error(`${model.name} 的年度现货均价未完整覆盖测算周期。`);
    }
    return {
      modelCode: model.family, runId: id, annualPrices: Object.fromEntries(years.map((year) => [year, prices[year]])),
      ...(typeof result.algorithmVersion === "string" ? { algorithmVersion: result.algorithmVersion } : {})
    };
  }

  function samePriceArrays(before, after) {
    if (!after) return before === after;
    const years = Object.keys(after);
    return Boolean(before) && Object.keys(before).length === years.length && years.every((year) => {
      const known = before[year], incoming = after[year];
      return Array.isArray(known) && known.length === incoming.length && incoming.every((value, index) => value === known[index]);
    });
  }

  function sameBackendRun(before, after) {
    const metadata = ["executionKind", "status", "backendTaskId", "algorithmFamily", "algorithmVersion",
      "marketPriceBasis", "priceUnit", "calendar", "granularityMinutes", "pointsPerYear"];
    return metadata.every((key) => before[key] === after[key])
      && before.supplyDemandInput?.fingerprint === after.supplyDemandInput.fingerprint
      && before.supplyDemandInput?.featureConsumption === after.supplyDemandInput.featureConsumption
      && JSON.stringify(before.backendDisplayResults) === JSON.stringify(after.backendDisplayResults)
      && samePriceArrays(before.pricesByYear, after.pricesByYear)
      && samePriceArrays(before.quarterPricesByYear, after.quarterPricesByYear);
  }

  function prepareBackendPublication(project, task, services, actions) {
    if (!task || task.status !== "succeeded" || !validId(task.id) || task.projectId !== project.id) {
      throw new Error("后台预测任务与当前项目不一致。");
    }
    const rows = backendModelRows(task);
    const selected = rows.find(({ id }) => task.activeRunId === id);
    if (!selected?.complete) throw new Error("后台尚未发布可用于收益测算的完整小时电价。");
    const basis = selected.result.marketPriceBasis ?? task.marketPriceBasis;
    if (project.hasStorage && basis !== priceForecast.MARKET_PRICE_BASIS) {
      throw new Error("后台有效价源尚未确认独立于项目配储参数，暂无法用于配储收益测算。");
    }
    const prepared = services.prepareSupplyDemand?.(project);
    if (!prepared?.ok || !prepared.dataset || prepared.dataset.source?.inputFingerprint !== task.inputFingerprint) {
      throw new Error("当前供需版本与后台结果不一致，请重新提交预测。");
    }
    const source = priceForecast.snapshotBackendSupplyDemandInput(project, prepared);
    const createdAt = typeof task.completedAt === "string" && task.completedAt.trim()
      ? task.completedAt : (actions.nowIso?.() || new Date().toISOString());
    const runs = rows.filter(({ complete }) => complete)
      .map(({ result, model }) => priceForecast.createBackendPriceRun(project, task, result, model, source, createdAt));
    const active = runs.find(({ id }) => id === task.activeRunId);
    if (!priceForecast.validateSupplyDemandRun(project, active).ok) {
      throw new Error("当前供需版本与后台结果不一致，请重新提交预测。");
    }
    const summaries = rows.filter(({ complete }) => !complete).map((row) => backendAnnualSummary(project, task, row));
    if (summaries.length) active.backendDisplayResults = summaries;
    return { runs, active };
  }

  function acceptBackendTask({ project, task, expectedActiveRunId, services = {}, actions = {} } = {}) {
    if (!project) return { ok: false, changed: false, errors: ["请先选择项目。"] };
    const oldRunId = project.activeRunId ?? null;
    if (oldRunId !== (expectedActiveRunId ?? null) && oldRunId !== task?.activeRunId) {
      return { ok: false, changed: false, errors: ["有效价源已更新，请刷新后台预测结果。"] };
    }
    try {
      const { runs, active } = prepareBackendPublication(project, task, services, actions);
      const previous = Array.isArray(project.priceRuns) ? project.priceRuns : [];
      const previousById = new Map(previous.map((run) => [run?.id, run]));
      if (active.backendDisplayResults?.some(({ runId }) => previousById.has(runId))) {
        throw new Error("后台重复返回的运行与已保存版本不一致。");
      }
      const newRuns = runs.filter((run) => {
        const existing = previousById.get(run.id);
        if (existing && !sameBackendRun(existing, run)) throw new Error("后台重复返回的运行与已保存版本不一致。");
        return !existing;
      });
      const priceRuns = newRuns.length ? [...newRuns, ...previous] : previous;
      if (oldRunId !== active.id) {
        const next = { ...project, priceRuns, activeRunId: active.id, statuses: { ...project.statuses },
          activationLogs: Array.isArray(project.activationLogs) ? [...project.activationLogs] : [] };
        addActivationLog({ project: next, fromRunId: oldRunId, toRunId: active.id, reason: "后台发布有效价源", actions });
        services.markDownstreamStale?.(next, "forecast-page");
        markForecastReady(next, { validateSupplyDemandRun: priceForecast.validateSupplyDemandRun });
        project.priceRuns = priceRuns;
        project.activeRunId = active.id;
        project.statuses = next.statuses;
        project.activationLogs = next.activationLogs;
      } else if (newRuns.length) {
        project.priceRuns = priceRuns;
      }
      return { ok: true, changed: Boolean(newRuns.length || oldRunId !== active.id), errors: [] };
    } catch (error) {
      return { ok: false, changed: false, errors: [error?.message || "后台返回的电价结果校验失败。"] };
    }
  }

  function buildRestoredForecastBinding(project, targetProjectId) {
    const run = getActiveRun(project);
    const saved = run?.supplyDemandInput;
    if (!saved || !canActivateRun(run, project) || !priceForecast.validateSupplyDemandRun(project, run).ok) return null;
    // Bind the verified source to the new identity without rewriting the historical run.
    return priceForecast.normalizeRestoredForecastBinding(targetProjectId, {
      targetProjectId, sourceProjectId: saved.projectId, runId: run.id, inputFingerprint: saved.fingerprint
    });
  }

  function supplyDemandRunError(project, run, services = {}) {
    if (!services.validateSupplyDemandRun) return "";
    try {
      const validation = services.validateSupplyDemandRun(project, run);
      return validation?.ok ? "" : (validation?.errors?.join("；") || "请先核对供需输入并重新生成预测。");
    } catch (error) {
      return error.message || "供需输入版本校验失败。";
    }
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
    project.statuses["forecast-page"] = hasActiveActivatableRun(project, services) ? "completed" : "in_progress";
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
    let validRuns;
    try {
      if (services.prepareSupplyDemand) {
        const prepared = services.prepareSupplyDemand(project);
        if (!prepared?.ok || !prepared.dataset || !prepared.config) {
          actions.setTopMeta?.(prepared?.errors?.join("；") || "请先完整填写并保存供需输入。");
          return false;
        }
        options.supplyDemandInput = { config: prepared.config, dataset: prepared.dataset };
      }
      validRuns = modelDefinitions.map((model) => services.createForecastRunForModel?.(project, model, options));
      if (!validRuns.length || validRuns.some((run) => !run)) throw new Error("预测版本未完整生成，请重试。");
      const priceError = validRuns.map((run) => priceForecast.validateForecastPriceData(project, run)).find((state) => !state.ok);
      if (priceError) throw new Error(priceError.errors.join("；"));
      const inputError = validRuns.map((run) => supplyDemandRunError(project, run, services)).find(Boolean);
      if (inputError) throw new Error(inputError);
    } catch (error) {
      actions.setTopMeta?.(error.message || "电价预测生成失败，请核对输入。");
      return false;
    }
    if (!Array.isArray(project.priceRuns)) project.priceRuns = [];
    project.priceRuns.unshift(...validRuns.slice().reverse());

    const preferredRun = validRuns.find((run) => run.algorithmFamily === "ensemble" && canActivateRun(run, project))
      || validRuns.find((run) => canActivateRun(run, project));
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
    const supplyError = supplyDemandRunError(project, target, services);
    if (supplyError) { actions.setTopMeta?.(supplyError); return false; }
    const parameterError = forecastParameterError(target, true);
    if (parameterError) {
      actions.setTopMeta?.(`该版本参数无效，不能生效：${parameterError}`);
      return false;
    }
    const integrity = priceForecast.validateForecastPriceData(project, target);
    if (!integrity.ok) { actions.setTopMeta?.(integrity.errors.join("；")); return false; }
    if (!canActivateRun(target, project)) {
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
    const supplyError = supplyDemandRunError(project, target, services);
    if (supplyError) { actions.setTopMeta?.(supplyError); return false; }
    const parameterError = forecastParameterError(target, true);
    if (parameterError) {
      actions.setTopMeta?.(`该版本参数无效，不能强制生效：${parameterError}`);
      return false;
    }
    const integrity = priceForecast.validateForecastPriceData(project, target);
    if (!integrity.ok) { actions.setTopMeta?.(integrity.errors.join("；")); return false; }
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
    acceptBackendTask,
    addActivationLog,
    buildRestoredForecastBinding,
    canActivateRun,
    forceActivateRun,
    forecastParameterError,
    formatForecastGranularity,
    generateForecastRun,
    getArchivedCaseRuns,
    getPublishedBackendResults,
    hasActiveActivatableRun,
    readForecastFormInput,
    setActiveRun,
    statusLabel
  });
});
