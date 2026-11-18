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

  function supplyInputState(project, run, validateSupplyDemandRun) {
    if (!validateSupplyDemandRun) return { ok: true, errors: [] };
    try {
      return validateSupplyDemandRun(project, run) || { ok: false, errors: ["供需版本尚未核验。"] };
    } catch (error) {
      return { ok: false, errors: [error.message || "供需版本校验失败。"] };
    }
  }

  function supplyInputHtml(run) {
    const source = run.supplyDemandInput;
    if (!source) return "";
    const period = source.period || {};
    const help = `输入版本：${source.fingerprint || "未知"}。测算周期：${period.startYear}-${Number(period.startYear) + Number(period.forecastYears) - 1}。小时输入单位MWh，按365天模型年展开；正联络线为送出、负值为受入。当前价格仍由原模拟算法生成，供需输入已保存溯源，但尚未参与定价。`;
    return `<br><small>供需已绑定</small><span data-help="供需输入来源">${escapeHtml(help)}</span>`;
  }

  function buildForecastRunsView(input = {}) {
    const {
      project = null,
      qualityGate = {},
      statusLabel = () => "-",
      formatForecastGranularity = () => "-",
      canActivateRun = () => false,
      validateSupplyDemandRun = null,
      formatDateTime = (value) => new Date(value).toLocaleString("zh-CN", { hour12: false })
    } = input;
    if (!project) return buildEmptyForecastRunsView(qualityGate);
    const priceRuns = Array.isArray(project.priceRuns) ? project.priceRuns : [];
    if (!priceRuns.length) return buildNoRunsForecastView(qualityGate);

    const latest = priceRuns[0];
    const latestSupplyState = supplyInputState(project, latest, validateSupplyDemandRun);
    const gateMessage =
      `最新运行 ${latest.id} · ${statusLabel(latest)}${latestSupplyState.ok ? "" : " · 供需输入待更新"}`;
    const runBodyHtml = priceRuns.map((run) => {
      const runId = escapeHtml(run.id);
      const supplyState = supplyInputState(project, run, validateSupplyDemandRun);
      const activeSuffix = project.activeRunId === run.id && supplyState.ok ? " / 生效中" : "";
      const supplyStatus = supplyState.ok ? "" : ` / ${run.supplyDemandInput ? "供需已过期" : "未绑定供需"}`;
      const actionHtml = !supplyState.ok
        ? `<span>需重新生成</span><span data-help="供需版本核对">${escapeHtml(supplyState.errors?.join("；") || "请核对供需输入。")}</span>`
        : canActivateRun(run)
        ? `<button class="ghost-button" data-active-run="${runId}">设为生效</button>`
        : `<button class="ghost-button" data-force-run="${runId}">强制发布</button>`;
      return `
    <tr>
      <td>${runId}</td>
      <td>${escapeHtml(run.algorithmLabel || run.algorithmName || run.algorithmFamily)}${run.supplyDemandInput ? "<br><small>模拟 · 未使用供需</small>" : ""}</td>
      <td>${escapeHtml(run.algorithmVersion)}</td>
      <td>${escapeHtml(run.featureVersion)}${supplyInputHtml(run)}</td>
      <td>${escapeHtml(formatForecastGranularity(run))}</td>
      <td>${escapeHtml(run.trainStart)}-${escapeHtml(run.trainEnd)}</td>
      <td>${formatPercent(run.mape)}</td>
      <td>${formatPercent(run.smape)}</td>
      <td>${formatNumber(run.mae)}</td>
      <td>${formatNumber(run.rmse)}</td>
      <td>${escapeHtml(statusLabel(run))}${activeSuffix}${supplyStatus}</td>
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

  const BACKEND_STATUS_LABELS = {
    queued: "任务已排队",
    running: "后台计算中",
    validating: "正在校验价格结果",
    succeeded: "价格已返回，等待采用",
    failed: "后台预测失败"
  };

  function createBackendForecastPanel({ documentRef, getProject, getService, inspectInput, prepareInput, isRunActive }) {
    const nodes = Object.fromEntries(["status", "note", "submit", "refresh", "activate", "next"]
      .map((key) => [key, documentRef.querySelector(`#backend-forecast-${key}`)]));
    const states = new WeakMap();

    function context() {
      const project = getProject();
      const service = getService();
      if (!project) return { project, service };
      if (!states.has(project)) states.set(project, { task: null, busy: false, error: "" });
      const state = states.get(project);
      const input = inspectInput(project);
      const task = state.task;
      const current = Boolean(task && input.ok && task.inputFingerprint === input.fingerprint);
      const pending = current && ["queued", "running", "validating"].includes(task.status);
      const ready = current && task.status === "succeeded" && task.canActivate === true && Boolean(task.runId);
      const active = ready && isRunActive(project, task.runId);
      return { project, service, state, input, task, current, pending, ready, active };
    }

    function render() {
      if (!nodes.status) return;
      const { project, service, state, input, task, current, pending, ready, active } = context();
      const busy = state?.busy;
      let label = "请选择项目";
      let note = "";
      if (project) {
        label = !service ? "后台算法待接入" : "等待提交预测";
        note = input.ok ? "小时供需已准备。" : (input.errors?.[0] || "请先生成并保存小时供需。");
        if (service && task) {
          label = !current ? "任务对应旧供需或待保存输入" : BACKEND_STATUS_LABELS[task.status];
          if (current && task.status === "succeeded" && !ready) label = "价格已返回，待校验";
          if (active) label = "后台电价已生效";
          note = current && task.message ? task.message : note;
        }
        if (busy) label = "正在处理请求…";
        if (state.error) note = state.error;
      }
      if (nodes.status.textContent !== label) nodes.status.textContent = label;
      if (nodes.note && nodes.note.textContent !== note) nodes.note.textContent = note;
      if (nodes.submit) nodes.submit.disabled = !(project && service?.submit && input?.ok && !pending && !busy);
      if (nodes.refresh) nodes.refresh.disabled = !(project && service?.refresh && !busy);
      if (nodes.activate) nodes.activate.disabled = !(service?.activate && ready && !active && !busy);
      if (nodes.next) nodes.next.disabled = !(service && active && !busy);
    }

    // The service owns transport and result validation. No task is generated
    // here unless an actual adapter has been supplied by the application.
    async function perform(action) {
      const { project, service, state, input, task, pending, ready, active } = context();
      if (!project || typeof service?.[action] !== "function" || state.busy) return;
      if (action === "submit" && (!input.ok || pending)) return;
      if (action === "activate" && (!ready || active)) return;
      const request = { projectId: project.id, taskId: task?.id, runId: task?.runId,
        inputFingerprint: input.fingerprint, expectedActiveRunId: project.activeRunId };
      state.busy = true;
      state.error = "";
      render();
      try {
        if (action === "submit") {
          const prepared = prepareInput(project);
          if (!prepared.ok) throw new Error(prepared.errors?.[0] || "小时供需尚未准备好。");
          request.supply = { config: prepared.config, source: prepared.dataset.source, hourlyByYear: prepared.dataset.hourlyByYear };
        }
        const response = await service[action](request);
        if (getProject() !== project || getService() !== service) return;
        if (response === null && action === "refresh") {
          state.task = null;
          return;
        }
        const sameTask = !task || action === "submit" || response?.id === task.id;
        const sameRun = action !== "activate" || response?.runId === request.runId;
        const sameInput = !request.inputFingerprint || action === "refresh" || response?.inputFingerprint === request.inputFingerprint;
        if (!sameTask || !sameRun || !sameInput || response?.projectId !== project.id || !response.id
            || !response.inputFingerprint || !Object.hasOwn(BACKEND_STATUS_LABELS, response.status)) {
          throw new Error("后台返回的任务信息与当前请求不一致。");
        }
        state.task = response;
      } catch (error) {
        state.error = error?.message || "后台请求失败，请稍后重试。";
      } finally {
        state.busy = false;
        render();
      }
    }

    for (const action of ["submit", "refresh", "activate"]) {
      nodes[action]?.addEventListener("click", () => { void perform(action); });
    }
    // A draft edit can change which actions are valid before the next app render.
    const supplyRoot = documentRef.querySelector("#supply-demand-root");
    for (const eventName of ["input", "change", "click"]) {
      supplyRoot?.addEventListener(eventName, () => { void Promise.resolve().then(render); });
    }
    return { render };
  }

  return Object.freeze({
    DEFAULT_GATE_MESSAGE,
    applyForecastRunsView,
    bindForecastRunActions,
    buildForecastRunsView,
    createBackendForecastPanel
  });
});
