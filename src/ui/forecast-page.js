"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_FORECAST_PAGE = api;
  if (root.window && root.window !== root) root.window.NE_FORECAST_PAGE = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const BACKEND_STATUS_LABELS = {
    queued: "任务已排队",
    running: "后台计算中",
    validating: "正在校验结果",
    succeeded: "结果已返回",
    failed: "预测失败"
  };
  const PENDING_STATUSES = new Set(["queued", "running", "validating"]);
  const POLL_INTERVAL_MS = 4000;
  const REQUEST_TIMEOUT_MS = 30000;

  function createBackendForecastPanel({ documentRef, getProject, getService, inspectInput, prepareInput,
    hasUsableRun = () => false, acceptTask = () => null, onTask = () => {}, isActive = () => true,
    schedule = setTimeout, cancel = clearTimeout }) {
    const nodes = Object.fromEntries(["status", "note", "submit", "refresh", "next", "next-note"]
      .map((key) => [key, documentRef?.querySelector?.(`#backend-forecast-${key}`)]));
    const states = new WeakMap();
    let polling = null;
    let mounted = false;

    function context() {
      const project = getProject();
      const service = getService();
      const serviceReady = typeof service?.submit === "function" || typeof service?.refresh === "function";
      if (!project) return { project, service, serviceReady };
      let state = states.get(project);
      if (!state || state.service !== service) {
        state = { service, task: null, busy: "", error: null, lookupFingerprint: null, acceptance: null, expectedActiveRunId: null };
        states.set(project, state);
      }
      const input = inspectInput(project);
      const task = state.task;
      const current = Boolean(input?.ok && task && task.inputFingerprint === input.fingerprint);
      const pending = current && PENDING_STATUSES.has(task.status);
      const error = input?.ok && state.error?.fingerprint === input.fingerprint ? state.error : null;
      return { project, service, serviceReady, state, input, task, current, pending, error };
    }

    function stopPolling() {
      if (polling) cancel(polling.handle);
      polling = null;
    }

    function syncPolling({ project, service, state, input, task, pending, error }) {
      const lookup = Boolean(input?.ok && state.lookupFingerprint !== input.fingerprint);
      if ((!pending && !lookup) || typeof service?.refresh !== "function" || state.busy || error) {
        stopPolling();
        return;
      }
      if (polling?.project === project && polling.task === task && polling.service === service && polling.fingerprint === input.fingerprint) return;
      stopPolling();
      const poll = { project, task, service, fingerprint: input.fingerprint, handle: null };
      polling = poll;
      poll.handle = schedule(() => {
        if (polling !== poll) return;
        polling = null;
        if (!mounted || !isActive()) return;
        const latest = context();
        if (latest.project === project && latest.service === service && latest.task === task && latest.input?.fingerprint === poll.fingerprint) {
          void perform(lookup ? "lookup" : "refresh");
        }
      }, lookup ? 0 : POLL_INTERVAL_MS);
    }

    function resolveTask({ project, task, current, state }) {
      if (!current || task.status !== "succeeded" || state.acceptance) return;
      const expectedActiveRunId = state.expectedActiveRunId;
      state.acceptance = {};
      try {
        state.acceptance = acceptTask({ project, task, expectedActiveRunId }) || {};
      } catch {
        state.acceptance = { ok: false, errors: ["本次结果暂无法用于收益测算，请刷新后重试。"] };
      }
    }

    function display({ project, service, state, input, task, current, pending, error }, usable) {
      if (!project) return { phase: "no-project", label: "请选择项目", note: "", next: "" };
      if (!input?.ok) return { phase: "input-required", label: "待生成供需",
        note: input?.errors?.[0] || "请先生成并保存小时供需。", next: usable ? "可使用当前电价继续。" : "电价可用后进入下一步。" };
      if (state.busy === "submit") return { phase: "submitting", label: "正在提交预测…", note: "正在提交本次小时供需。", next: "" };
      if (state.busy && !current) return { phase: "looking-up", label: "正在查询任务…", note: "正在查询当前供需的预测任务。", next: "" };
      if (current && pending) return { phase: "pending", label: BACKEND_STATUS_LABELS[task.status],
        note: error?.message || (typeof service?.refresh === "function" ? "任务状态会自动更新，也可手动刷新。" : "任务正在处理。"),
        next: usable ? "可沿用已生效电价，或等待本次预测。" : "本次电价可用后进入下一步。" };
      if (current && task.status === "failed") return { phase: "failed", label: BACKEND_STATUS_LABELS.failed,
        note: error?.message || (typeof task.message === "string" && task.message.trim()) || "请重新提交预测。",
        next: usable ? "可使用当前电价继续。" : "电价可用后进入下一步。" };
      if (current && task.status === "succeeded") return { phase: "completed", label: BACKEND_STATUS_LABELS.succeeded,
        note: error?.message || state.acceptance?.errors?.[0] || "可查看下方各模型的年度均价。",
        next: state.acceptance?.ok && usable ? "已采用本次预测电价。" : usable ? "可沿用已生效电价进入下一步。" : "完整电价可用后进入下一步。" };
      return { phase: error?.unavailable ? "unavailable" : "ready", label: error?.unavailable ? "暂时无法提交预测" : "待提交",
        note: error?.message || (usable ? "已有可用电价。" : "小时供需已就绪，可提交预测。"),
        next: usable ? "可使用当前电价继续。" : "电价可用后进入下一步。" };
    }

    function update() {
      if (!mounted || !isActive()) { stopPolling(); return; }
      const view = context();
      const { project, service, serviceReady, state, input, task, current, pending } = view;
      resolveTask(view);
      const usable = Boolean(project && hasUsableRun(project));
      const busy = state?.busy;
      const { phase, label, note, next } = display(view, usable);
      if (nodes.status && nodes.status.textContent !== label) nodes.status.textContent = label;
      if (nodes.status?.dataset) nodes.status.dataset.phase = phase;
      if (nodes.note && nodes.note.textContent !== note) nodes.note.textContent = note;
      if (nodes["next-note"] && nodes["next-note"].textContent !== next) nodes["next-note"].textContent = next;
      if (nodes.submit) {
        nodes.submit.disabled = !(input?.ok && !pending && !busy);
        nodes.submit.textContent = current && !pending ? "重新提交预测" : "提交预测";
      }
      if (nodes.refresh) {
        nodes.refresh.hidden = typeof service?.refresh !== "function" || !input?.ok;
        nodes.refresh.disabled = nodes.refresh.hidden || Boolean(busy);
      }
      if (nodes.next) nodes.next.disabled = !usable || busy === "submit";
      onTask({ project, task: current ? task : null, current: Boolean(current), serviceReady, phase });
      syncPolling(view);
    }

    async function requestTask(service, action, request) {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      let timer;
      try {
        return await Promise.race([
          service[action](request, controller ? { signal: controller.signal } : undefined),
          new Promise((_, reject) => {
            timer = schedule(() => {
              reject(new Error("后台请求超时，请刷新任务状态后重试。"));
              controller?.abort();
            }, REQUEST_TIMEOUT_MS);
          })
        ]);
      } finally {
        if (timer !== undefined) cancel(timer);
      }
    }

    async function perform(intent) {
      if (!mounted || !isActive()) return;
      const action = intent === "lookup" ? "refresh" : intent;
      const { project, service, state, input, task, current, pending } = context();
      if (!input?.ok || state.busy || (action === "submit" && pending)) return;
      const request = { projectId: project.id, inputFingerprint: input.fingerprint, expectedActiveRunId: project.activeRunId };
      if (typeof service?.[action] !== "function") {
        if (action === "submit") {
          state.error = { fingerprint: request.inputFingerprint, unavailable: true, message: "预测服务暂不可用，请稍后重试。" };
          update();
        }
        return;
      }
      if (action === "refresh" && current) request.taskId = task.id;
      state.busy = intent;
      state.lookupFingerprint = request.inputFingerprint;
      state.error = null;
      update();
      try {
        if (action === "submit") {
          const prepared = prepareInput(project);
          if (!prepared?.ok) throw new Error(prepared?.errors?.[0] || "小时供需尚未就绪。");
          const { source, hourlyByYear } = prepared.dataset || {};
          if (source?.inputFingerprint !== input.fingerprint || !hourlyByYear) {
            throw new Error("生成的小时供需与当前版本不一致，请重新生成。");
          }
          request.supply = { config: prepared.config, source, hourlyByYear };
        }
        const response = await requestTask(service, action, request);
        if (states.get(project) !== state || getService() !== service) return;
        if (response === null && action === "refresh") {
          state.task = null;
          state.acceptance = null;
          if (intent !== "lookup") state.error = { fingerprint: request.inputFingerprint, message: "当前供需暂无预测任务，可提交预测。" };
          return;
        }
        if (!response || response.projectId !== project.id || typeof response.id !== "string" || !response.id.trim()
            || response.inputFingerprint !== request.inputFingerprint || (request.taskId && response.id !== request.taskId)
            || !Object.hasOwn(BACKEND_STATUS_LABELS, response.status)) {
          throw new Error("后台返回的任务与当前项目或供需版本不一致。");
        }
        state.task = response;
        state.acceptance = null;
        state.expectedActiveRunId = request.expectedActiveRunId;
      } catch (error) {
        state.error = { fingerprint: request.inputFingerprint, message: error?.message || "后台请求失败，请稍后重试。" };
      } finally {
        state.busy = "";
        if (getProject() === project) update();
      }
    }

    for (const action of ["submit", "refresh"]) {
      nodes[action]?.addEventListener("click", () => { void perform(action); });
    }
    return {
      render() { mounted = true; update(); },
      dispose() { mounted = false; stopPolling(); }
    };
  }

  return Object.freeze({ createBackendForecastPanel });
});
