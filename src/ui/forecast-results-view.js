"use strict";

(function (root, factory) {
  const utils = typeof module !== "undefined" && module.exports ? require("../domain/app-utils") : root.NE_APP_UTILS;
  const api = factory(utils);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_FORECAST_RESULTS_VIEW = api;
  if (root.window && root.window !== root) root.window.NE_FORECAST_RESULTS_VIEW = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (utils) {
  const MODELS = new Map([["lstm", "LSTM"], ["xgboost", "XGBoost"], ["ensemble", "Ensemble"]]);
  const HOURS_PER_YEAR = 8760;
  const formatPrice = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function modelCode(result) {
    const code = result?.modelCode ?? result?.algorithmFamily;
    return typeof code === "string" ? code.trim().toLowerCase() : "";
  }

  function isHistoricalSimulation(run) {
    return run.executionKind === "demo_model" || run.executionKind === "demo_simulation" ||
      run.supplyDemandInput?.featureConsumption === "not_used_by_demo_model";
  }

  function expectedYears(project) {
    const { startYear, forecastYears } = project;
    if (!Number.isInteger(startYear) || startYear < 1 || !Number.isInteger(forecastYears) ||
        forecastYears < 1 || forecastYears > 30 || startYear + forecastYears > 10000) return [];
    return Array.from({ length: forecastYears }, (_, index) => startYear + index);
  }

  function meanPrice(series, count) {
    if (!Array.isArray(series) || series.length !== count) return undefined;
    let scale = 0;
    for (const price of series) {
      if (!Number.isFinite(price)) return undefined;
      scale = Math.max(scale, Math.abs(price));
    }
    if (!scale) return 0;
    const normalizedSum = series.reduce((sum, price) => sum + price / scale, 0);
    return normalizedSum / count * scale;
  }

  function annualPrice(result, year) {
    if (result?.pricesByYear !== undefined) return meanPrice(result.pricesByYear?.[year], HOURS_PER_YEAR);
    if (result?.quarterPricesByYear !== undefined) return meanPrice(result.quarterPricesByYear?.[year], HOURS_PER_YEAR * 4);
    const summary = result?.annualPrices?.[year];
    return Number.isFinite(summary) ? summary : undefined;
  }

  function validDisplayPrice(result, task) {
    const unit = result.priceUnit ?? task?.priceUnit;
    const calendar = result.calendar ?? task?.calendar;
    const granularity = result.granularityMinutes ?? task?.granularityMinutes;
    return !isHistoricalSimulation(result)
      && (unit === undefined || unit === "CNY/MWh")
      && (calendar === undefined || calendar === "fixed_365_days")
      && (granularity === undefined || [15, 60].includes(granularity));
  }

  function resultsByModel(results, isEligible) {
    const byModel = new Map();
    if (!Array.isArray(results)) return byModel;
    for (const result of results) {
      const code = modelCode(result);
      if (!MODELS.has(code) || !isEligible(result)) continue;
      byModel.set(code, byModel.has(code) ? null : result);
    }
    return byModel;
  }

  function textValue(value) {
    return typeof value === "string" && value.trim() ? utils.escapeHtml(value) : "—";
  }

  function renderModel({ code, label, result, prices }, activeRunId, fromCase, pendingText) {
    const runId = result?.runId ?? result?.id;
    const available = prices.some(Number.isFinite);
    const adopted = available && typeof runId === "string" && runId && activeRunId === runId;
    const status = available ? (fromCase ? "案例价源" : "结果可查看") : pendingText;
    const version = typeof result?.algorithmVersion === "string" && result.algorithmVersion.trim()
      ? `<span>版本 ${textValue(result.algorithmVersion)}</span>` : "";
    const meta = available ? `${version}${adopted ? "<span>测算采用</span>" : ""}` : "";
    return `<article class="forecast-result-model" data-forecast-model="${code}">
      <div class="forecast-result-model-head"><h3>${label}</h3><span class="forecast-result-status${available && !fromCase ? " is-returned" : ""}">${status}</span></div>
      ${meta ? `<div class="forecast-result-meta">${meta}</div>` : ""}
    </article>`;
  }

  function renderAnnual(models, years, pendingText) {
    if (!models.some(({ prices }) => prices.some(Number.isFinite))) return "";
    return `<div class="table-scroll forecast-result-table forecast-result-annual" tabindex="0" aria-label="年度现货均价"><table data-forecast-annual>
      <caption>年度现货均价（元/MWh）</caption>
      <thead><tr><th scope="col">年份</th>${models.map(({ label }) => `<th scope="col">${label}</th>`).join("")}</tr></thead>
      <tbody>${years.map((year, index) => `<tr><th scope="row">${year}</th>${models.map(({ prices }) => Number.isFinite(prices[index])
        ? `<td>${formatPrice.format(prices[index])}</td>` : `<td class="forecast-result-missing">${pendingText}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>`;
  }

  function renderHistory(project, currentRunIds) {
    if (!Array.isArray(project.priceRuns)) return "";
    const archivedRuns = project.priceRuns.filter((run) => run && typeof run === "object" && !currentRunIds.has(run.id));
    if (!archivedRuns.length) return "";
    return `<details class="forecast-result-history" data-forecast-history>
      <summary>历史预测记录</summary>
      <div class="table-scroll forecast-result-table"><table aria-label="历史预测记录">
        <thead><tr><th scope="col">模型</th><th scope="col">来源</th><th scope="col">版本</th><th scope="col">记录编号</th></tr></thead>
        <tbody>${archivedRuns.map((run) => {
          const label = MODELS.get(modelCode(run)) ?? run.algorithmLabel ?? run.algorithmName;
          const source = isHistoricalSimulation(run) ? "历史模拟曲线" : run.executionKind === "real_model" ? "后台算法" : "来源待核对";
          return `<tr><th scope="row">${textValue(label)}</th><td>${source}</td><td>${textValue(run.algorithmVersion)}</td><td>${textValue(run.id)}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </details>`;
  }

  function emptyResultLabel(phase) {
    if (["input-required", "ready", "unavailable"].includes(phase)) return "待提交";
    if (["failed", "completed"].includes(phase)) return "未返回";
    return "待返回";
  }

  function modelPrices(byModel, years) {
    return Array.from(MODELS, ([code, label]) => {
      const result = byModel.get(code);
      return { code, label, result, prices: years.map((year) => annualPrice(result, year)) };
    });
  }

  function hasVisiblePrices(models) {
    return models.some(({ prices }) => prices.some(Number.isFinite));
  }

  function buildView({ project, task, current, serviceReady, phase, caseRuns, publishedRuns } = {}) {
    if (!project) return '<p class="forecast-result-empty">请先选择项目。</p>';
    const years = expectedYears(project);
    const returned = serviceReady && current && task?.status === "succeeded" ? task.results : null;
    const publishedTask = task?.id && publishedRuns?.some((run) => run.backendTaskId === task.id);
    const liveModels = publishedTask ? [] : modelPrices(resultsByModel(returned, (run) => validDisplayPrice(run, task)), years);
    const showLive = hasVisiblePrices(liveModels);
    const backendModels = showLive ? liveModels : modelPrices(resultsByModel(publishedRuns, validDisplayPrice), years);
    const fromCase = !hasVisiblePrices(backendModels);
    const models = fromCase ? modelPrices(resultsByModel(caseRuns, isHistoricalSimulation), years) : backendModels;
    const activeRunId = !showLive ? project.activeRunId : null;
    const pendingText = emptyResultLabel(phase);
    const visibleRuns = !showLive ? models : [];
    const currentRunIds = new Set(visibleRuns.filter(({ prices }) => prices.some(Number.isFinite))
      .map(({ result }) => result?.runId ?? result?.id).filter(Boolean));
    return `<div class="forecast-result-models">${models.map((model) => renderModel(model, activeRunId, fromCase, pendingText)).join("")}</div>
      ${renderAnnual(models, years, pendingText)}${renderHistory(project, currentRunIds)}`;
  }

  return Object.freeze({ buildView });
});
