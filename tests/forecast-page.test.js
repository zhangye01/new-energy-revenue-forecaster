"use strict";

const assert = require("node:assert/strict");
const {
  DEFAULT_GATE_MESSAGE,
  applyForecastRunsView,
  bindForecastRunActions,
  buildForecastRunsView,
  createBackendForecastPanel
} = require("../src/ui/forecast-page");

class FakeButton {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.handlers = {};
  }

  addEventListener(name, handler) {
    this.handlers[name] = handler;
  }

  click() {
    this.handlers.click?.();
  }
}

assert.deepEqual(buildForecastRunsView({ project: null }), {
  runBodyHtml: "",
  activationBodyHtml: "",
  gateMessage: "请选择项目",
  gateHelpText: "演示误差指标由模拟模型生成。误差硬门槛 MAPE ≤ 15%，sMAPE ≤ 18%。软门槛 MAE ≤ - 元/MWh，RMSE ≤ - 元/MWh。测算周期内要求价格点完整有效。"
});

const emptyView = buildForecastRunsView({ project: { priceRuns: [], activationLogs: [] } });
assert.match(emptyView.runBodyHtml, /还没有电价预测版本/);
assert.match(emptyView.activationBodyHtml, /暂无激活日志/);
assert.equal(emptyView.gateMessage, DEFAULT_GATE_MESSAGE);
assert.match(emptyView.gateHelpText, /MAPE ≤ 15%，sMAPE ≤ 18%。.*价格点完整有效/);

const view = buildForecastRunsView({
  project: {
    activeRunId: "run-1",
    priceRuns: [
      {
        id: "run-1",
        algorithmLabel: "Ensemble",
        algorithmVersion: "v1",
        featureVersion: "f1",
        granularity: "15min",
        trainStart: "2022",
        trainEnd: "2025",
        mape: 0.12,
        smape: 0.14,
        mae: 8,
        rmse: 12,
        status: "publishable"
      },
      {
        id: "run-2",
        algorithmName: "XGBoost",
        algorithmVersion: "v2",
        featureVersion: "f2",
        trainStart: "2020",
        trainEnd: "2024",
        mape: 0.18,
        smape: 0.2,
        mae: 18,
        rmse: 24,
        status: "draft"
      }
    ],
    activationLogs: [
      {
        changedAt: "2026-01-02T03:04:05Z",
        fromRunId: "run-0",
        toRunId: "run-1",
        reason: "<manual>"
      }
    ]
  },
  qualityGate: { soft: { mae: 15, rmse: 20 } },
  statusLabel: (run) => run.status === "publishable" ? "可发布" : "待放行",
  formatForecastGranularity: (run) => run.granularity || "年度",
  canActivateRun: (run) => run.status === "publishable",
  formatDateTime: () => "2026/1/2 11:04:05"
});

assert.match(view.gateHelpText, /软门槛 MAE ≤ 15 元\/MWh，RMSE ≤ 20 元\/MWh/);
assert.equal(view.gateMessage, "最新运行 run-1 · 可发布");
assert.doesNotMatch(view.gateMessage, /门槛|MAPE|MAE/);
assert.match(view.runBodyHtml, /Ensemble/);
assert.match(view.runBodyHtml, /12\.00%/);
assert.doesNotMatch(view.runBodyHtml, /data-active-run="run-1"/);
assert.equal((view.runBodyHtml.match(/生效中/g) || []).length, 1, "当前生效状态不重复成为操作按钮");
assert.match(view.runBodyHtml, /生效中/);
assert.match(view.runBodyHtml, /run-2">强制发布/);
assert.match(view.activationBodyHtml, /2026\/1\/2 11:04:05/);
assert.match(view.activationBodyHtml, /&lt;manual&gt;/);
const otherRunView = buildForecastRunsView({ project: { activeRunId: "elsewhere", priceRuns: [{ id: "available", status: "publishable" }] },
  canActivateRun: () => true });
assert.match(otherRunView.runBodyHtml, /data-active-run="available">设为生效/, "其他可用版本仍保留切换入口");
const damagedRunView = buildForecastRunsView({
  project: { activeRunId: "damaged", priceRuns: [{ id: "damaged", status: "publishable" }] },
  canActivateRun: () => true,
  validatePriceData: () => ({ ok: false, errors: ["含无效电价"] })
});
assert.match(damagedRunView.runBodyHtml, /需重新生成.*含无效电价/);
assert.doesNotMatch(damagedRunView.runBodyHtml, /data-active-run|data-force-run|生效中/);

const gateHelp = { textContent: "" };
const gateStatus = {
  textContent: "",
  parentElement: {
    querySelector(selector) {
      assert.equal(selector, "[data-forecast-gate-help]");
      return gateHelp;
    }
  }
};
const refs = { forecastGateMessage: gateStatus, forecastRunBody: {}, forecastActivationBody: {} };
applyForecastRunsView({ refs, view });
assert.equal(gateStatus.textContent, "最新运行 run-1 · 可发布");
assert.equal(gateHelp.textContent, view.gateHelpText);
assert.equal(refs.forecastRunBody.innerHTML, view.runBodyHtml);
const changedThresholdsView = buildForecastRunsView({
  project: { priceRuns: [{ id: "<run-3>", status: "validated" }] },
  qualityGate: { hard: { mape: 0.1, smape: 0.12, missingPoints: 2 }, soft: { mae: 25, rmse: 35 } },
  statusLabel: () => "待复核"
});
applyForecastRunsView({ refs, view: changedThresholdsView });
assert.equal(gateStatus.textContent, "最新运行 <run-3> · 待复核");
assert.match(gateHelp.textContent, /MAPE ≤ 10%，sMAPE ≤ 12%。.*价格点完整有效/);
assert.match(gateHelp.textContent, /MAE ≤ 25 元\/MWh，RMSE ≤ 35 元\/MWh/);
assert.doesNotMatch(gateHelp.textContent, /run-3|待复核/);
const noRunsWithThresholds = buildForecastRunsView({
  project: { priceRuns: [] }, qualityGate: { soft: { mae: 7, rmse: 9 } }
});
applyForecastRunsView({ refs, view: noRunsWithThresholds });
assert.equal(gateStatus.textContent, DEFAULT_GATE_MESSAGE);
assert.match(gateHelp.textContent, /MAE ≤ 7 元\/MWh，RMSE ≤ 9 元\/MWh/);
assert.doesNotThrow(() => applyForecastRunsView({ refs: { forecastGateMessage: {} }, view }));

const activeButton = new FakeButton({ activeRun: "run-1" });
const forceButton = new FakeButton({ forceRun: "run-2" });
const calls = [];
bindForecastRunActions({
  documentRef: {
    querySelectorAll: (selector) => {
      if (selector === "[data-active-run]") return [activeButton];
      if (selector === "[data-force-run]") return [forceButton];
      return [];
    }
  },
  handlers: {
    setActiveRun: (id) => calls.push(`active:${id}`),
    forceActivateRun: (id) => calls.push(`force:${id}`)
  }
});
activeButton.click();
forceButton.click();
assert.deepEqual(calls, ["active:run-1", "force:run-2"]);

const supplyRuns = {
  activeRunId: "stale",
  priceRuns: [{ id: "stale", status: "publishable", featureVersion: "f1", supplyDemandInput: {
    fingerprint: '<supply-"v1">', period: { startYear: 2026, forecastYears: 2 }, featureConsumption: "not_used_by_demo_model"
  } }]
};
const sourceView = buildForecastRunsView({ project: supplyRuns, statusLabel: () => "可发布", canActivateRun: () => true,
  validateSupplyDemandRun: () => ({ ok: true, errors: [] }) });
assert.match(sourceView.runBodyHtml, /供需已绑定/);
assert.match(sourceView.runBodyHtml, /模拟 · 未使用供需/);
assert.match(sourceView.runBodyHtml, /&lt;supply-&quot;v1&quot;&gt;/);
assert.match(sourceView.runBodyHtml, /2026-2027/);
assert.match(sourceView.runBodyHtml, /data-help="供需输入来源"/);
const oldState = JSON.stringify(supplyRuns);
const staleView = buildForecastRunsView({ project: supplyRuns, statusLabel: () => "可发布", canActivateRun: () => true,
  validateSupplyDemandRun: () => ({ ok: false, errors: ["输入已变化，请<重新生成>。"] }) });
assert.match(staleView.gateMessage, /供需输入待更新/);
assert.match(staleView.runBodyHtml, /供需已过期/);
assert.match(staleView.runBodyHtml, /需重新生成/);
assert.match(staleView.runBodyHtml, /请&lt;重新生成&gt;/);
assert.doesNotMatch(staleView.runBodyHtml, /data-active-run|data-force-run|生效中/);
assert.equal(JSON.stringify(supplyRuns), oldState, "查看过期提示不得改写历史版本");
const unboundView = buildForecastRunsView({ project: { priceRuns: [{ id: "legacy" }] },
  validateSupplyDemandRun: () => ({ ok: false, errors: ["未绑定"] }) });
assert.match(unboundView.runBodyHtml, /未绑定供需/);
assert.doesNotThrow(() => buildForecastRunsView({ project: supplyRuns, validateSupplyDemandRun: () => { throw new Error("载入失败"); } }));

async function testBackendForecastPanel() {
  const nodes = Object.fromEntries(["status", "note", "submit", "refresh", "activate", "next"]
    .map((key) => [`#backend-forecast-${key}`, new FakeButton()]));
  const el = (key) => nodes[`#backend-forecast-${key}`];
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  let project = { id: "project-1", activeRunId: null };
  let input = { ok: false, errors: ["请先保存供需"] };
  let service;
  let activeId;
  let requests = 0;
  let response = { id: "task-1", projectId: project.id, inputFingerprint: "supply-1", status: "running" };
  const panel = createBackendForecastPanel({
    documentRef: { querySelector: (selector) => nodes[selector] },
    getProject: () => project,
    getService: () => service,
    inspectInput: () => input,
    prepareInput: () => ({ ok: true, config: {}, dataset: { source: { energyUnit: "MWh" },
      hourlyByYear: { 2028: { load: [100], tieLine: [-10], wind: [8], solar: [6], hydro: [2], nonMarket: [3] } } } }),
    isRunActive: (selectedProject, runId) => selectedProject.id === "project-1" && activeId === runId
  });
  panel.render();
  assert.equal(el("status").textContent, "后台算法待接入");
  assert.equal(el("submit").disabled, true);
  el("submit").click();
  assert.equal(requests, 0);

  service = {
    async submit(request) {
      requests += 1;
      assert.equal(request.projectId, project.id);
      assert.equal(request.inputFingerprint, "supply-1");
      assert.deepEqual(request.supply.hourlyByYear[2028].tieLine, [-10]);
      return response;
    },
    async refresh() { return response; },
    async activate(request) { assert.equal(request.runId, "run-1"); return response; }
  };
  panel.render();
  assert.equal(el("submit").disabled, true);
  input = { ok: true, fingerprint: "supply-1" };
  panel.render();
  el("submit").click();
  el("submit").click();
  await settle();
  assert.equal(requests, 1, "排队处理时重复提交不得调用后台");
  assert.equal(el("status").textContent, "后台计算中");
  assert.equal(el("next").disabled, true);

  response = { ...response, status: "succeeded", runId: "run-1", canActivate: false };
  el("refresh").click();
  await settle();
  assert.equal(el("activate").disabled, true, "成功回传但尚未准入的结果不得采用");
  response = { ...response, canActivate: true };
  el("refresh").click();
  await settle();
  assert.equal(el("activate").disabled, false);
  el("activate").click();
  await settle();
  assert.equal(el("next").disabled, true, "被收益端识别为生效版本之前，前台不可继续");
  activeId = "run-1";
  panel.render();
  assert.equal(el("status").textContent, "后台电价已生效");
  assert.equal(el("next").disabled, false);

  input = { ok: true, fingerprint: "supply-2" };
  panel.render();
  assert.equal(el("next").disabled, true, "改供需后不能继续使用旧任务");
  assert.equal(el("activate").disabled, true);
  el("refresh").click();
  project = { id: "project-2", activeRunId: null };
  await settle();
  assert.equal(el("status").textContent, "等待提交预测", "晚到响应不能串到另一项目");
}

async function testDemoContinuation() {
  const nodes = Object.fromEntries(["status", "note", "submit", "refresh", "activate", "next"]
    .map((key) => [`#backend-forecast-${key}`, new FakeButton()]));
  const el = (key) => nodes[`#backend-forecast-${key}`];
  let project = { id: "demo-project" }, usable = false, service, finish;
  const panel = createBackendForecastPanel({
    documentRef: { querySelector: (selector) => nodes[selector] }, getProject: () => project,
    getService: () => service, inspectInput: () => ({ ok: true, fingerprint: "saved-supply" }),
    prepareInput: () => ({ ok: true, config: {}, dataset: { source: {}, hourlyByYear: {} } }),
    isRunActive: () => false, hasUsableDemoRun: (candidate) => usable && candidate.id === "demo-project"
  });
  panel.render();
  assert.equal(el("next").disabled, true);
  usable = true; panel.render();
  assert.equal(el("next").disabled, false, "未接后台时，已通过应用验证的演示版本也可继续");
  for (const action of ["submit", "refresh", "activate"]) assert.equal(el(action).disabled, true,
    "演示版本不能绕过后台动作门禁");
  usable = false; panel.render();
  assert.equal(el("next").disabled, true, "演示版本过期或不可用时继续按钮重新禁用");
  usable = true;
  service = { submit: () => new Promise((resolve) => { finish = resolve; }) };
  panel.render(); el("submit").click();
  assert.equal(el("next").disabled, true, "请求处理中不允许继续，即使已有演示版本");
  finish({ id: "task-demo", projectId: project.id, inputFingerprint: "saved-supply", status: "running" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(el("next").disabled, false);
  project = { id: "another-project" }; panel.render();
  assert.equal(el("next").disabled, true, "不能沿用其他项目的演示版本可用状态");
}

testBackendForecastPanel().then(testDemoContinuation).then(() => console.log("forecast page tests passed")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
