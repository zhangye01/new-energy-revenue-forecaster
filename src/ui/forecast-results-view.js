"use strict";

(function (root, factory) {
  const commonJs = typeof module !== "undefined" && module.exports;
  const api = factory(commonJs ? require("../domain/app-utils") : root.NE_APP_UTILS,
    commonJs ? require("./forecast-results-chart") : root.NE_FORECAST_RESULTS_CHART);
  if (commonJs) module.exports = api;
  root.NE_FORECAST_RESULTS_VIEW = api;
  if (root.window && root.window !== root) root.window.NE_FORECAST_RESULTS_VIEW = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (utils, trendChart) {
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

  function renderChart({ series }) {
    const legend = series.map(({ code, label }) =>
      `<button type="button" class="forecast-result-legend-toggle" data-forecast-legend="${code}" aria-pressed="true" aria-controls="forecast-results-annual-plot">${label}</button>`).join("");
    return `<figure class="forecast-result-chart" data-forecast-chart>
      <figcaption class="forecast-result-chart-head">
        <h3 class="forecast-result-chart-title">年度现货均价趋势 <span class="forecast-result-chart-unit">元/MWh</span></h3>
        <div class="forecast-result-legend" data-forecast-chart-legend role="group" aria-label="显示的模型曲线" hidden>${legend}</div>
      </figcaption>
      <div class="forecast-result-plot" id="forecast-results-annual-plot" data-forecast-chart-plot role="img" aria-label="各模型年度现货均价曲线，具体数值见下方年度均价表" hidden></div>
      <p class="forecast-result-chart-fallback" data-forecast-chart-fallback>图表暂不可用，可查看下方年度均价表。</p>
    </figure>`;
  }

  function bindChartLegend(chart, buttons, { series }, visible) {
    if (series.every(({ code }) => visible[code] === false)) visible[series[0].code] = true;
    const byCode = new Map(series.map((entry) => [entry.code, entry]));
    const sync = () => {
      const count = series.filter(({ code }) => visible[code] !== false).length;
      for (const button of buttons) {
        const selected = visible[button.dataset.forecastLegend] !== false;
        const required = selected && count === 1;
        button.setAttribute("aria-pressed", String(selected));
        if (required) button.setAttribute("aria-disabled", "true");
        else button.removeAttribute("aria-disabled");
        button.title = required ? "至少保留一条曲线" : "";
      }
    };
    for (const button of buttons) {
      const { code, label } = byCode.get(button.dataset.forecastLegend);
      button.onclick = () => {
        if (button.getAttribute("aria-disabled") === "true") return;
        visible[code] = visible[code] === false;
        chart.dispatchAction({ type: "hideTip" });
        chart.dispatchAction({ type: visible[code] ? "legendSelect" : "legendUnSelect", name: label });
        sync();
      };
    }
    sync();
  }

  function mountChart(container, data, visible) {
    const windowRef = container.ownerDocument?.defaultView;
    const plot = container.querySelector("[data-forecast-chart-plot]");
    if (!data || !plot || !trendChart || !windowRef?.echarts?.init) return null;
    const legend = container.querySelector("[data-forecast-chart-legend]");
    const fallback = container.querySelector("[data-forecast-chart-fallback]");
    const buttons = Array.from(legend.querySelectorAll("[data-forecast-legend]"));
    const tokenNames = { blue: "blue", orange: "orange", green: "green", ink: "ink", muted: "muted",
      line: "line", lineStrong: "line-strong", panel: "panel" };
    plot.hidden = false;
    let chart;
    let width = plot.clientWidth;
    const draw = () => {
      const style = windowRef.getComputedStyle(plot);
      const tokens = Object.fromEntries(Object.entries(tokenNames).map(([key, name]) => [key, style.getPropertyValue(`--${name}`).trim()]));
      chart.setOption(trendChart.buildOption(data, visible, tokens, width), true);
    };
    try {
      chart = windowRef.echarts.init(plot, null, { renderer: "canvas" });
      bindChartLegend(chart, buttons, data, visible);
      draw();
    } catch {
      chart?.dispose();
      plot.hidden = true;
      return null;
    }
    legend.hidden = false;
    fallback.hidden = true;
    const resize = () => {
      if (!plot.clientWidth || chart.isDisposed()) return;
      chart.resize();
      if (width === plot.clientWidth) return;
      width = plot.clientWidth;
      draw();
    };
    const observer = windowRef.ResizeObserver ? new windowRef.ResizeObserver(resize) : null;
    if (observer) observer.observe(plot);
    else windowRef.addEventListener("resize", resize);
    const themeObserver = windowRef.MutationObserver ? new windowRef.MutationObserver(() => {
      if (!chart.isDisposed() && plot.clientWidth) draw();
    }) : null;
    themeObserver?.observe(container.ownerDocument.body, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      themeObserver?.disconnect();
      if (observer) observer.disconnect();
      else windowRef.removeEventListener("resize", resize);
      buttons.forEach((button) => { button.onclick = null; });
      chart.dispose();
      plot.hidden = true;
      legend.hidden = true;
      fallback.hidden = false;
    };
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
    if (!project) return { html: '<p class="forecast-result-empty">请先选择项目。</p>', chart: null };
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
    const series = models.filter(({ prices }) => prices.some(Number.isFinite)).map(({ code, label, prices }) => ({
      code, label, prices: prices.map((price) => Number.isFinite(price) ? price : null)
    }));
    const chart = series.length ? { years, series } : null;
    const html = `<div class="forecast-result-models">${models.map((model) => renderModel(model, activeRunId, fromCase, pendingText)).join("")}</div>
      ${chart ? renderChart(chart) : ""}${renderAnnual(models, years, pendingText)}${renderHistory(project, currentRunIds)}`;
    return { html, chart };
  }

  function renderStorageSummary(result) {
    const metrics = [
      ["without", "无储现货收益", result.totalWithoutStorageSpotRevenue],
      ["with", "有储现货收益", result.totalWithStorageSpotRevenue],
      ["increment", "配储现货增量", result.totalIncrementalRevenue]
    ];
    return `<div class="forecast-result-models">${metrics.map(([key, label, value]) => `
      <div class="forecast-result-model"><h3>${label}</h3><strong class="forecast-storage-value" data-storage-spot="${key}">${formatPrice.format(value / 10000)} 万元</strong></div>`).join("")}</div>`;
  }

  function createStorageSpotPreview(documentRef, calculate) {
    const panel = documentRef?.querySelector("#forecast-storage-preview");
    const summary = documentRef?.querySelector("#forecast-storage-summary");
    let cache = null;
    return function render({ project, scenario, run }) {
      if (!panel || !summary) return;
      panel.hidden = !project?.hasStorage;
      if (panel.hidden) { cache = null; return; }
      let html = '<p class="forecast-result-empty">等待生效的逐时现货电价。</p>';
      if (run) {
        const years = expectedYears(project);
        const inputs = [project, run, project.capacityMw, project.storagePowerMw, project.storageDurationH,
          project.storageRoundTripEfficiency ?? scenario?.config?.storageRoundTripEfficiency,
          ...years.flatMap((year) => [year, project.energyData?.hourlyByYear?.[year], run.pricesByYear?.[year]])];
        if (!cache || cache.inputs.length !== inputs.length || !inputs.every((value, index) => value === cache.inputs[index])) {
          cache = { inputs, result: calculate(project, scenario, run) };
        }
        html = cache.result ? renderStorageSummary(cache.result)
          : '<p class="forecast-result-empty">请核对储能设备参数和全周期逐时发电量。</p>';
      }
      if (summary.innerHTML !== html) summary.innerHTML = html;
    };
  }

  return Object.freeze({ buildView, mountChart, createStorageSpotPreview });
});
