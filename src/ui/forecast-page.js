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
    succeeded: "后台计算完成",
    failed: "后台预测失败"
  };
  const PENDING_STATUSES = new Set(["queued", "running", "validating"]);
  const POLL_INTERVAL_MS = 4000;
  const REQUEST_TIMEOUT_MS = 30000;

  function createBackendForecastPanel({ documentRef, getProject, getService, inspectInput, prepareInput,
    hasUsableRun = () => false, onTask = () => {}, isActive = () => true,
    schedule = setTimeout, cancel = clearTimeout }) {
    const nodes = Object.fromEntries(["status", "note", "submit", "refresh", "next"]
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
        state = { service, task: null, busy: "", error: null };
        states.set(project, state);
      }
      const input = inspectInput(project);
      const task = state.task;
      const current = Boolean(input?.ok && task && task.inputFingerprint === input.fingerprint);
      const pending = current && PENDING_STATUSES.has(task.status);
      const error = input?.ok && state.error?.fingerprint === input.fingerprint ? state.error.message : "";
      return { project, service, serviceReady, state, input, task, current, pending, error };
    }

    function stopPolling() {
      if (polling) cancel(polling.handle);
      polling = null;
    }

    function syncPolling({ project, service, state, task, pending, error }) {
      if (!pending || typeof service?.refresh !== "function" || state.busy || error) {
        stopPolling();
        return;
      }
      if (polling?.project === project && polling.task === task && polling.service === service) return;
      stopPolling();
      const poll = { project, task, service, handle: null };
      polling = poll;
      poll.handle = schedule(() => {
        if (polling !== poll) return;
        polling = null;
        if (!mounted || !isActive()) return;
        const latest = context();
        if (latest.project === project && latest.service === service && latest.task === task && latest.pending) {
          void perform("refresh");
        }
      }, POLL_INTERVAL_MS);
    }

    function update() {
      if (!mounted || !isActive()) { stopPolling(); return; }
      const view = context();
      const { project, service, serviceReady, state, input, task, current, pending, error } = view;
      const busy = state?.busy;
      let label = "请选择项目";
      let note = "";
      if (project) {
        label = serviceReady ? "等待提交预测" : "算法待联调";
        note = input?.ok ? "小时供需已就绪。" : (input?.errors?.[0] || "请先生成并保存小时供需。");
        if (task && serviceReady) {
          label = current ? BACKEND_STATUS_LABELS[task.status] : "任务对应其他供需版本";
          if (current && task.message) note = task.message;
        }
        if (busy === "submit") label = "正在提交预测…";
        if (busy === "refresh" && !current) label = "正在查询任务…";
        if (error) note = error;
      }
      if (nodes.status && nodes.status.textContent !== label) nodes.status.textContent = label;
      if (nodes.note && nodes.note.textContent !== note) nodes.note.textContent = note;
      if (nodes.submit) nodes.submit.disabled = !(input?.ok && typeof service?.submit === "function" && !pending && !busy);
      if (nodes.refresh) nodes.refresh.disabled = !(input?.ok && typeof service?.refresh === "function" && !busy);
      if (nodes.next) nodes.next.disabled = !(project && !busy && hasUsableRun(project));
      onTask({ project, task: task || null, current: Boolean(current), serviceReady });
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

    async function perform(action) {
      if (!mounted || !isActive()) return;
      const { project, service, state, input, task, current, pending } = context();
      if (!input?.ok || typeof service?.[action] !== "function" || state.busy || (action === "submit" && pending)) return;
      const request = { projectId: project.id, inputFingerprint: input.fingerprint, expectedActiveRunId: project.activeRunId };
      if (action === "refresh" && current) request.taskId = task.id;
      state.busy = action;
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
          return;
        }
        if (!response || response.projectId !== project.id || typeof response.id !== "string" || !response.id.trim()
            || response.inputFingerprint !== request.inputFingerprint || (request.taskId && response.id !== request.taskId)
            || !Object.hasOwn(BACKEND_STATUS_LABELS, response.status)) {
          throw new Error("后台返回的任务与当前项目或供需版本不一致。");
        }
        state.task = response;
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
