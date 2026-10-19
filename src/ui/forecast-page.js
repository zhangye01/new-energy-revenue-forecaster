"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_FORECAST_PAGE = api;
  if (root.window && root.window !== root) {
    root.window.NE_FORECAST_PAGE = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const DEFAULT_GATE_MESSAGE = "尚未生成预测版本";

  function escapeHtml(text) {
    return String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatNumber(value, digits = 2) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(digits) : "-";
  }

  function formatPercent(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(2)}%` : "-";
  }

  function buildGateHelpText(qualityGate = {}) {
    const hard = qualityGate.hard || {};
    const mape = Number(((hard.mape ?? 0.15) * 100).toFixed(2));
    const smape = Number(((hard.smape ?? 0.18) * 100).toFixed(2));
    return `硬门槛：MAPE ≤ ${mape}%，sMAPE ≤ ${smape}%，缺失点 ≤ ${hard.missingPoints ?? 0}；按完整测算周期检查价格曲线。软门槛：MAE ≤ ${qualityGate.soft?.mae ?? "-"}，RMSE ≤ ${qualityGate.soft?.rmse ?? "-"}。`;
  }

  function buildEmptyForecastRunsView(qualityGate = {}) {
    return {
      runBodyHtml: "",
      activationBodyHtml: "",
      gateMessage: "请选择项目",
      gateHelpText: buildGateHelpText(qualityGate)
    };
  }

  function buildNoRunsForecastView(qualityGate = {}) {
    return {
      runBodyHtml: `<tr><td colspan="12">还没有电价预测版本，请先生成。</td></tr>`,
      activationBodyHtml: `<tr><td colspan="4">暂无激活日志。</td></tr>`,
      gateMessage: DEFAULT_GATE_MESSAGE,
      gateHelpText: buildGateHelpText(qualityGate)
    };
  }

  function buildForecastRunsView(input = {}) {
    const {
      project = null,
      qualityGate = {},
      statusLabel = () => "-",
      formatForecastGranularity = () => "-",
      canActivateRun = () => false,
      formatDateTime = (value) => new Date(value).toLocaleString("zh-CN", { hour12: false })
    } = input;
    if (!project) return buildEmptyForecastRunsView(qualityGate);
    const priceRuns = Array.isArray(project.priceRuns) ? project.priceRuns : [];
    if (!priceRuns.length) return buildNoRunsForecastView(qualityGate);

    const latest = priceRuns[0];
    const gateMessage =
      `最新运行 ${latest.id} · ${statusLabel(latest)}`;
    const runBodyHtml = priceRuns.map((run) => {
      const runId = escapeHtml(run.id);
      const activeSuffix = project.activeRunId === run.id ? " / 生效中" : "";
      const actionHtml = canActivateRun(run)
        ? `<button class="ghost-button" data-active-run="${runId}">设为生效</button>`
        : `<button class="ghost-button" data-force-run="${runId}">强制发布</button>`;
      return `
    <tr>
      <td>${runId}</td>
      <td>${escapeHtml(run.algorithmLabel || run.algorithmName || run.algorithmFamily)}</td>
      <td>${escapeHtml(run.algorithmVersion)}</td>
      <td>${escapeHtml(run.featureVersion)}</td>
      <td>${escapeHtml(formatForecastGranularity(run))}</td>
      <td>${escapeHtml(run.trainStart)}-${escapeHtml(run.trainEnd)}</td>
      <td>${formatPercent(run.mape)}</td>
      <td>${formatPercent(run.smape)}</td>
      <td>${formatNumber(run.mae)}</td>
      <td>${formatNumber(run.rmse)}</td>
      <td>${escapeHtml(statusLabel(run))}${activeSuffix}</td>
      <td>${actionHtml}</td>
    </tr>
  `;
    }).join("");

    const activationLogs = Array.isArray(project.activationLogs) ? project.activationLogs : [];
    const activationBodyHtml = activationLogs.length
      ? activationLogs.map((log) => `
      <tr>
        <td>${escapeHtml(formatDateTime(log.changedAt))}</td>
        <td>${escapeHtml(log.fromRunId)}</td>
        <td>${escapeHtml(log.toRunId)}</td>
        <td>${escapeHtml(log.reason)}</td>
      </tr>
    `).join("")
      : `<tr><td colspan="4">暂无激活日志。</td></tr>`;

    return {
      runBodyHtml,
      activationBodyHtml,
      gateMessage,
      gateHelpText: buildGateHelpText(qualityGate)
    };
  }

  function applyForecastRunsView(input = {}) {
    const {
      refs = {},
      view = buildEmptyForecastRunsView()
    } = input;
    if (refs.forecastRunBody) refs.forecastRunBody.innerHTML = view.runBodyHtml;
    if (refs.forecastActivationBody) refs.forecastActivationBody.innerHTML = view.activationBodyHtml;
    if (refs.forecastGateMessage) refs.forecastGateMessage.textContent = view.gateMessage;
    const gateHelp = refs.forecastGateMessage?.parentElement?.querySelector("[data-forecast-gate-help]");
    if (gateHelp) gateHelp.textContent = view.gateHelpText;
  }

  function bindForecastRunActions(input = {}) {
    const {
      documentRef = null,
      handlers = {}
    } = input;
    if (!documentRef || typeof documentRef.querySelectorAll !== "function") return;
    documentRef.querySelectorAll("[data-active-run]").forEach((button) => {
      button.addEventListener("click", () => handlers.setActiveRun?.(button.dataset.activeRun));
    });
    documentRef.querySelectorAll("[data-force-run]").forEach((button) => {
      button.addEventListener("click", () => handlers.forceActivateRun?.(button.dataset.forceRun));
    });
  }

  return Object.freeze({
    DEFAULT_GATE_MESSAGE,
    applyForecastRunsView,
    bindForecastRunActions,
    buildForecastRunsView
  });
});
