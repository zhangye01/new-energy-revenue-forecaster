"use strict";

const assert = require("node:assert/strict");
const { createBackendForecastPanel } = require("../src/ui/forecast-page");

const settle = () => new Promise((resolve) => setImmediate(resolve));

class FakeNode {
  textContent = "";
  disabled = false;
  hidden = false;
  dataset = {};
  handlers = {};

  addEventListener(event, handler) {
    this.handlers[event] = handler;
  }

  click() {
    this.handlers.click?.();
  }
}

function createScheduler() {
  const pending = new Map();
  let nextId = 0;
  return {
    schedule(callback, delay) { pending.set(++nextId, { callback, delay }); return nextId; },
    cancel(id) { pending.delete(id); },
    delays() { return [...pending.values()].map(({ delay }) => delay); },
    run(delay) {
      const entry = [...pending].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `expected scheduled timer at ${delay} ms`);
      pending.delete(entry[0]);
      entry[1].callback();
    }
  };
}

function createHarness() {
  const nodes = Object.fromEntries(["status", "note", "submit", "refresh", "next", "next-note", "activate"]
    .map((key) => [key, new FakeNode()]));
  const documentRef = { querySelector(selector) { return nodes[selector.replace("#backend-forecast-", "")]; } };
  const scheduler = createScheduler();
  const project = Object.freeze({ id: "project-1", activeRunId: "stored-run-1" });
  const config = { schemaVersion: 2 };
  const hourlyByYear = { 2028: [{ interprovincial: -3, provinceLoad: 8, wind: 2, solar: 1, hydro: 1, nonMarket: 1 }] };
  const harness = {
    nodes, scheduler, project, config, hourlyByYear,
    input: { ok: true, fingerprint: "supply-1" },
    service: null, usable: false, active: true, preparationError: "",
    taskView: null, accepted: [], acceptance: null
  };
  harness.panel = createBackendForecastPanel({
    documentRef, getProject: () => harness.project, getService: () => harness.service,
    inspectInput: () => harness.input,
    prepareInput: () => harness.preparationError ? { ok: false, errors: [harness.preparationError] } : {
      ok: true,
      config,
      dataset: { source: { inputFingerprint: harness.input.fingerprint, energyUnit: "MWh" }, hourlyByYear }
    },
    hasUsableRun: () => harness.usable, isActive: () => harness.active,
    acceptTask: (value) => { harness.accepted.push(value); return harness.acceptance?.(value); },
    onTask: (view) => { harness.taskView = view; },
    schedule: scheduler.schedule, cancel: scheduler.cancel
  });
  return harness;
}

function task(status, changes = {}) {
  return { id: "task-1", projectId: "project-1", inputFingerprint: "supply-1", status, ...changes };
}

async function testUnconfiguredAndHistoricalContinuation() {
  const harness = createHarness();
  const { nodes, panel } = harness;
  assert.equal(harness.taskView, null);
  const project = harness.project;
  harness.project = null;
  panel.render();
  assert.equal(nodes.status.textContent, "请选择项目");
  assert.deepEqual(harness.taskView, { project: null, task: null, current: false, serviceReady: false, phase: "no-project", usable: false });

  harness.project = project;
  panel.render();
  assert.equal(nodes.status.textContent, "待提交");
  assert.equal(nodes.submit.disabled, false);
  assert.equal(nodes.refresh.disabled, true);
  assert.equal(nodes.refresh.hidden, true);
  assert.equal(nodes.next.disabled, true);
  assert.equal(nodes.activate.handlers.click, undefined);
  assert.deepEqual(harness.scheduler.delays(), []);
  nodes.submit.click();
  assert.equal(nodes.status.textContent, "暂时无法提交预测");
  assert.equal(nodes.note.textContent, "预测服务暂不可用，请稍后重试。");
  assert.equal(harness.taskView.task, null);
  assert.equal(nodes.submit.disabled, false);

  harness.usable = true;
  panel.render();
  assert.equal(nodes.next.disabled, false);
  assert.equal(nodes["next-note"].textContent, "可使用当前电价继续。");
  assert.deepEqual(harness.taskView, { project, task: null, current: false, serviceReady: false, phase: "unavailable", usable: true });
  harness.usable = false;
  harness.input = { ok: false, errors: ["供需输入待确认。"] };
  panel.render();
  assert.equal(nodes.next.disabled, true);
  assert.equal(nodes.status.textContent, "待生成供需");
  assert.equal(nodes.note.textContent, "供需输入待确认。");
}

async function testBackendSubmissionAndPolling() {
  const harness = createHarness();
  const { nodes, panel, scheduler, project, config, hourlyByYear } = harness;
  const submitRequests = [];
  const refreshRequests = [];
  const results = Object.freeze([{ model: "LSTM" }, { model: "XGBoost" }, { model: "Ensemble" }]);
  const replies = [task("running"), task("validating"), task("succeeded", { results })];
  harness.service = {
    submit(request) { submitRequests.push(request); return Promise.resolve(task("queued")); },
    refresh(request) { refreshRequests.push(request); return Promise.resolve(replies.shift()); }
  };

  panel.render();
  assert.equal(nodes.status.textContent, "待提交");
  assert.equal(nodes.submit.disabled, false);

  harness.input = { ok: false, errors: ["供需输入待确认。"] };
  panel.render();
  assert.equal(nodes.submit.disabled, true);
  assert.equal(nodes.refresh.disabled, true);
  nodes.submit.click();
  nodes.refresh.click();
  assert.equal(submitRequests.length + refreshRequests.length, 0);

  harness.input = { ok: true, fingerprint: "supply-1" };
  harness.preparationError = "无法生成小时数据";
  panel.render();
  nodes.submit.click();
  assert.equal(nodes.note.textContent, "无法生成小时数据");
  assert.equal(submitRequests.length, 0);
  harness.preparationError = "";

  nodes.submit.click();
  nodes.submit.click();
  assert.equal(nodes.status.textContent, "正在提交预测…");
  assert.equal(nodes.submit.disabled, true);
  assert.equal(nodes.refresh.disabled, true);
  await settle();
  assert.deepEqual(submitRequests, [{
    projectId: project.id, inputFingerprint: "supply-1", expectedActiveRunId: "stored-run-1",
    supply: { config, source: { inputFingerprint: "supply-1", energyUnit: "MWh" }, hourlyByYear }
  }]);
  assert.equal(nodes.status.textContent, "任务已排队");
  assert.equal(nodes.submit.disabled, true);
  assert.equal(nodes.refresh.disabled, false);
  assert.deepEqual(scheduler.delays(), [4000]);
  nodes.submit.click();
  assert.equal(submitRequests.length, 1);

  for (const status of ["后台计算中", "正在校验结果", "结果已返回"]) {
    scheduler.run(4000);
    await settle();
    assert.equal(nodes.status.textContent, status);
  }
  assert.deepEqual(refreshRequests, Array.from({ length: 3 }, () => ({
    projectId: project.id, taskId: "task-1", inputFingerprint: "supply-1", expectedActiveRunId: "stored-run-1"
  })));
  assert.equal(harness.taskView.task.results, results);
  assert.equal(harness.taskView.current, true);
  assert.equal(project.activeRunId, "stored-run-1");
  assert.deepEqual(scheduler.delays(), []);
  assert.equal(nodes.next.disabled, true);
  assert.equal(nodes["next-note"].textContent, "完整电价可用后进入下一步。");
  assert.equal(harness.accepted.length, 1);
  assert.equal(harness.accepted[0].expectedActiveRunId, "stored-run-1");
  harness.usable = true;
  panel.render();
  assert.equal(nodes.next.disabled, false);
  assert.equal(harness.accepted.length, 1);
}

async function testStaleTasksAndRouteChanges() {
  const harness = createHarness();
  const { nodes, panel, scheduler, project } = harness;
  let resolveSubmit;
  const refreshRequests = [];
  let reply;
  harness.service = {
    submit: () => new Promise((resolve) => { resolveSubmit = resolve; }),
    refresh(request) { refreshRequests.push(request); return reply; }
  };

  panel.render();
  nodes.submit.click();
  harness.input = { ok: false, errors: ["供需输入待确认。"] };
  panel.render();
  resolveSubmit(task("queued"));
  await settle();
  assert.equal(harness.taskView.current, false);
  assert.equal(nodes.status.textContent, "待生成供需");
  assert.equal(nodes.note.textContent, "供需输入待确认。");
  assert.deepEqual(scheduler.delays(), []);

  harness.input = { ok: true, fingerprint: "supply-1" };
  panel.render();
  assert.equal(harness.taskView.current, true);
  assert.deepEqual(scheduler.delays(), [4000]);
  panel.dispose();
  assert.deepEqual(scheduler.delays(), []);
  harness.active = false;
  nodes.refresh.click();
  assert.equal(refreshRequests.length, 0);
  harness.active = true;
  panel.render();
  assert.deepEqual(scheduler.delays(), [4000]);

  harness.input = { ok: true, fingerprint: "supply-2" };
  panel.render();
  assert.deepEqual(scheduler.delays(), [0]);
  reply = task("succeeded", { results: ["previous"] });
  nodes.refresh.click();
  await settle();
  assert.deepEqual(refreshRequests[0], {
    projectId: project.id, inputFingerprint: "supply-2", expectedActiveRunId: "stored-run-1"
  });
  assert.match(nodes.note.textContent, /供需版本不一致/);
  assert.equal(harness.taskView.current, false);

  reply = task("running", { projectId: "another-project", inputFingerprint: "supply-2" });
  nodes.refresh.click();
  await settle();
  assert.match(nodes.note.textContent, /当前项目/);
  assert.equal(harness.taskView.current, false);

  reply = task("running", { id: "task-2", inputFingerprint: "supply-2" });
  nodes.refresh.click();
  await settle();
  assert.equal(harness.taskView.current, true);
  reply = task("succeeded", { id: "unexpected-task", inputFingerprint: "supply-2" });
  nodes.refresh.click();
  await settle();
  assert.equal(refreshRequests.at(-1).taskId, "task-2");
  assert.equal(harness.taskView.task.id, "task-2");
  assert.equal(harness.taskView.task.status, "running");
  assert.deepEqual(scheduler.delays(), []);
  assert.match(nodes.note.textContent, /不一致/);

  const project2 = { id: "project-2" };
  harness.project = project2;
  panel.render();
  assert.deepEqual(harness.taskView, { project: project2, task: null, current: false, serviceReady: true, phase: "ready", usable: false });
  harness.project = project;
  panel.render();
  assert.equal(harness.taskView.task.id, "task-2");

  reply = null;
  nodes.refresh.click();
  await settle();
  assert.equal(nodes.status.textContent, "待提交");
  assert.equal(harness.taskView.task, null);
  assert.deepEqual(scheduler.delays(), []);

  nodes.submit.click();
  harness.project = project2;
  panel.render();
  resolveSubmit(task("queued", { id: "task-3", inputFingerprint: "supply-2" }));
  await settle();
  assert.deepEqual(harness.taskView, { project: project2, task: null, current: false, serviceReady: true, phase: "ready", usable: false });
  harness.project = project;
  panel.render();
  assert.equal(harness.taskView.task.id, "task-3");
  assert.deepEqual(scheduler.delays(), [4000]);
  panel.dispose();
}

async function testTimeoutAndRetry() {
  const harness = createHarness();
  const { nodes, panel, scheduler } = harness;
  let submitSignal;
  let refreshError = true;
  harness.service = {
    submit: (_request, { signal }) => { submitSignal = signal; return new Promise(() => {}); },
    refresh() {
      if (refreshError) throw new Error("任务状态暂不可用");
      return task("failed", { message: "后台求解失败，可重新提交。" });
    }
  };
  panel.render();
  nodes.submit.click();
  assert.deepEqual(scheduler.delays(), [30000]);
  scheduler.run(30000);
  await settle();
  assert.equal(submitSignal.aborted, true);
  assert.match(nodes.note.textContent, /超时/);
  assert.equal(nodes.refresh.disabled, false);

  nodes.refresh.click();
  await settle();
  assert.equal(nodes.note.textContent, "任务状态暂不可用");
  refreshError = false;
  nodes.refresh.click();
  await settle();
  assert.equal(nodes.status.textContent, "预测失败");
  assert.equal(nodes.note.textContent, "后台求解失败，可重新提交。");
  assert.equal(nodes.submit.disabled, false);
  assert.deepEqual(scheduler.delays(), []);

  harness.input = { ok: true, fingerprint: "supply-2" };
  panel.render();
  assert.equal(nodes.note.textContent, "小时供需已就绪，可提交预测。");
}

async function testRecoverAndAcceptCompletedTask() {
  const harness = createHarness();
  const { nodes, panel, scheduler } = harness;
  const requests = [];
  const completed = task("succeeded", { activeRunId: "released-ensemble", results: [] });
  let response = task("queued");
  harness.service = { refresh(request) { requests.push(request); return response; } };
  harness.acceptance = () => ({ ok: false, errors: ["缺少完整的小时电价。"] });
  panel.render();
  scheduler.run(0);
  assert.equal(nodes.status.textContent, "正在查询任务…");
  assert.equal(nodes.submit.disabled, true);
  await settle();
  assert.equal(requests[0].taskId, undefined);
  assert.equal(nodes.status.textContent, "任务已排队");
  response = completed;
  scheduler.run(4000);
  await settle();
  assert.equal(requests[1].taskId, completed.id);
  assert.equal(nodes.status.textContent, "结果已返回");
  assert.equal(nodes.note.textContent, "缺少完整的小时电价。");
  assert.equal(nodes.next.disabled, true);

  harness.acceptance = () => { harness.usable = true; return { ok: true }; };
  nodes.refresh.click();
  await settle();
  assert.equal(harness.accepted.length, 2);
  assert.equal(nodes.next.disabled, false);
  assert.equal(nodes["next-note"].textContent, "已采用本次预测电价。");
}

async function testCompletedTaskDoesNotApplyToChangedSupply() {
  const harness = createHarness();
  const { nodes, panel, scheduler } = harness;
  let finish;
  harness.service = { submit: () => new Promise((resolve) => { finish = resolve; }), refresh: () => null };
  panel.render();
  nodes.submit.click();
  harness.input = { ok: true, fingerprint: "supply-2" };
  panel.render();
  finish(task("succeeded"));
  await settle();
  assert.equal(harness.accepted.length, 0);
  assert.equal(harness.taskView.task, null);
  assert.equal(nodes.next.disabled, true);
  assert.deepEqual(scheduler.delays(), [0]);
  scheduler.run(0);
  await settle();
  assert.equal(nodes.status.textContent, "待提交");
  assert.equal(harness.accepted.length, 0);
}

(async () => {
  await testUnconfiguredAndHistoricalContinuation();
  await testBackendSubmissionAndPolling();
  await testStaleTasksAndRouteChanges();
  await testTimeoutAndRetry();
  await testRecoverAndAcceptCompletedTask();
  await testCompletedTaskDoesNotApplyToChangedSupply();
  console.log("forecast-page tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
