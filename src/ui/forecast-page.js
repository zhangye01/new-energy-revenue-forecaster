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
  const DEFAULT_GATE_MESSAGE = "质量门槛：MAPE ≤ 15%，sMAPE ≤ 18%，且价格曲线完整覆盖测算周期。";

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

  function buildEmptyForecastRunsView() {
    return {
      runBodyHtml: "",
      activationBodyHtml: "",
      gateMessage: DEFAULT_GATE_MESSAGE
    };
  }

  function buildNoRunsForecastView() {
    return {
      runBodyHtml: `<tr><td colspan="12">还没有电价预测版本，请先生成。</td></tr>`,
      activationBodyHtml: `<tr><td colspan="4">暂无激活日志。</td></tr>`,
      gateMessage: DEFAULT_GATE_MESSAGE
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
    if (!project) return buildEmptyForecastRunsView();
    const priceRuns = Array.isArray(project.priceRuns) ? project.priceRuns : [];
    if (!priceRuns.length) return buildNoRunsForecastView();

    const latest = priceRuns[0];
    const gateMessage =
      `硬门槛：MAPE ≤ 15%，sMAPE ≤ 18%，缺失点=0。软门槛：MAE ≤ ${qualityGate.soft?.mae ?? "-"}，RMSE ≤ ${qualityGate.soft?.rmse ?? "-"}。最新运行 ${escapeHtml(latest.id)} 状态：${escapeHtml(statusLabel(latest))}。`;
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
      gateMessage
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
