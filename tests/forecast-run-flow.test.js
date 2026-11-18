"use strict";

const assert = require("node:assert/strict");
const {
  canActivateRun,
  forceActivateRun,
  formatForecastGranularity,
  generateForecastRun,
  hasActiveActivatableRun,
  readForecastFormInput,
  setActiveRun,
  statusLabel
} = require("../src/ui/forecast-run-flow");

function createDocument(values = {}) {
  return {
    querySelector(selector) {
      return { value: values[selector] ?? "" };
    }
  };
}

function createActions(calls = [], overrides = {}) {
  let id = 0;
  return {
    makeId: (prefix) => `${prefix}-${++id}`,
    nowIso: () => "2026-06-11T00:00:00.000Z",
    setTopMeta: (message) => calls.push(`top:${message}`),
    renderAll: () => calls.push("render"),
    promptForceReason: () => "人工放行",
    ...overrides
  };
}

function createServices(calls = [], overrides = {}) {
  return {
    createForecastRunForModel(project, model, options) {
      calls.push(`create:${model.family}:${options.algorithmVersion}:${options.trainStart}-${options.trainEnd}:${options.seed}:${options.growth}`);
      return {
        id: `run-${model.family}`,
        algorithmFamily: model.family,
        status: model.status || "publishable",
        pricesByYear: {},
        quarterPricesByYear: {}
      };
    },
    markDownstreamStale: (project, page) => calls.push(`stale:${project.id}:${page}`),
    ...overrides
  };
}

assert.equal(canActivateRun({ status: "publishable" }), true);
assert.equal(canActivateRun({ status: "validated" }), false);
assert.equal(statusLabel({ status: "publishable_warn" }), "可发布(软门槛预警)");
assert.equal(statusLabel({ status: "unknown" }), "unknown");
assert.equal(formatForecastGranularity({ granularityMinutes: 15, pointsPerYear: 35040 }), "15分钟 / 35040点/年");
assert.equal(formatForecastGranularity({ granularityMinutes: 60 }), "小时 / 8760点/年");

assert.deepEqual(readForecastFormInput({
  project: { startYear: 2026 },
  nowIso: "2026-06-11T00:00:00.000Z",
  documentRef: createDocument({
    "#algo-version": "",
    "#feature-version": "feat-2",
    "#data-snapshot-id": "",
    "#train-start": "",
    "#train-end": "",
    "#algo-seed": "",
    "#algo-growth": "1.5"
  })
}), {
  algorithmVersion: "1.0.0",
  featureVersion: "feat-2",
  dataSnapshotId: "snapshot-2026-06-11",
  trainStart: 2018,
  trainEnd: 2025,
  seed: 2027,
  growth: 0.015
});

const invalidCalls = [];
assert.equal(generateForecastRun({
  project: { id: "p0", startYear: 2026, forecastYears: 0 },
  documentRef: createDocument(),
  modelDefinitions: [],
  services: createServices(invalidCalls),
  actions: createActions(invalidCalls)
}), false);
assert.deepEqual(invalidCalls, ["top:请先保存项目测算起始年份和测算周期，再生成电价预测。"]);

const project = {
  id: "p1",
  startYear: 2026,
  forecastYears: 2,
  activeRunId: "",
  priceRuns: [],
  activationLogs: [],
  statuses: { "forecast-page": "not_started", "scenario-page": "not_started" }
};
const generateCalls = [];
assert.equal(generateForecastRun({
  project,
  documentRef: createDocument({
    "#algo-version": "algo",
    "#feature-version": "feat",
    "#data-snapshot-id": "snap",
    "#train-start": "2019",
    "#train-end": "2025",
    "#algo-seed": "100",
    "#algo-growth": "2"
  }),
  modelDefinitions: [
    { family: "lstm" },
    { family: "xgboost", status: "validated" },
    { family: "ensemble" }
  ],
  services: createServices(generateCalls),
  actions: createActions(generateCalls)
}), true);
assert.deepEqual(project.priceRuns.map((run) => run.id), ["run-ensemble", "run-xgboost", "run-lstm"]);
assert.equal(project.activeRunId, "run-ensemble");
assert.equal(project.activationLogs[0].reason, "三模型15分钟模拟完成，融合模型自动生效");
assert.equal(project.statuses["forecast-page"], "completed");
assert.equal(project.statuses["scenario-page"], "in_progress");
assert.ok(generateCalls.includes("stale:p1:forecast-page"));
assert.ok(generateCalls.includes("render"));
assert.ok(generateCalls.some((call) => String(call).includes("已生成 LSTM、XGBoost、Ensemble")));
assert.equal(hasActiveActivatableRun(project), true);

const switchProject = {
  id: "p2",
  activeRunId: "old",
  priceRuns: [
    { id: "old", status: "publishable" },
    { id: "next", status: "publishable_warn" },
    { id: "bad", status: "validated" }
  ],
  activationLogs: [],
  statuses: { "forecast-page": "in_progress", "scenario-page": "not_started" }
};
const blockedCalls = [];
assert.equal(setActiveRun({
  project: switchProject,
  runId: "bad",
  services: createServices(blockedCalls),
  actions: createActions(blockedCalls)
}), false);
assert.deepEqual(blockedCalls, ["top:该版本未通过硬门槛，不能直接生效。"]);

const switchCalls = [];
assert.equal(setActiveRun({
  project: switchProject,
  runId: "next",
  services: createServices(switchCalls),
  actions: createActions(switchCalls)
}), true);
assert.equal(switchProject.activeRunId, "next");
assert.equal(switchProject.activationLogs[0].reason, "设置为生效版本");
assert.equal(switchProject.statuses["forecast-page"], "completed");
assert.equal(switchProject.statuses["scenario-page"], "in_progress");
assert.ok(switchCalls.includes("stale:p2:forecast-page"));

const forceProject = {
  id: "p3",
  activeRunId: "old",
  priceRuns: [{ id: "old", status: "publishable" }, { id: "force", status: "validated" }],
  activationLogs: [],
  statuses: { "forecast-page": "in_progress", "scenario-page": "not_started" }
};
const cancelCalls = [];
assert.equal(forceActivateRun({
  project: forceProject,
  runId: "force",
  services: createServices(cancelCalls),
  actions: createActions(cancelCalls, { promptForceReason: () => null })
}), false);
assert.equal(forceProject.activeRunId, "old");

const forceCalls = [];
assert.equal(forceActivateRun({
  project: forceProject,
  runId: "force",
  services: createServices(forceCalls),
  actions: createActions(forceCalls)
}), true);
assert.equal(forceProject.priceRuns[1].status, "publishable_forced");
assert.equal(forceProject.activeRunId, "force");
assert.equal(forceProject.activationLogs[0].reason, "人工放行");
assert.equal(forceProject.statuses["forecast-page"], "completed");
assert.ok(forceCalls.includes("render"));

for (const [invalidValues, message] of [
  [{ "#train-start": "2030", "#train-end": "2025" }, /起始年份不能晚于结束年份/],
  [{ "#train-start": "2020.5" }, /整数年份/],
  [{ "#train-end": "bad" }, /整数年份/],
  [{ "#algo-growth": "-100" }, /大于-100%/],
  [{ "#algo-growth": "-150" }, /大于-100%/],
  [{ "#algo-growth": "Infinity" }, /大于-100%/],
  [{ "#algo-growth": "bad" }, /大于-100%/],
  [{ "#algo-seed": "0" }, /随机种子/],
  [{ "#algo-seed": "1.5" }, /随机种子/]
]) {
  const original = JSON.stringify(project);
  const calls = [];
  assert.equal(generateForecastRun({
    project,
    documentRef: createDocument({ "#train-start": "2018", "#train-end": "2025", ...invalidValues }),
    modelDefinitions: [{ family: "ensemble" }],
    services: createServices(calls),
    actions: createActions(calls)
  }), false);
  assert.equal(JSON.stringify(project), original, "invalid inputs must not change runs, active version, logs or statuses");
  assert.equal(calls.length, 1);
  assert.match(calls[0], message);
}

const validBoundaryCalls = [];
assert.equal(generateForecastRun({
  project: { id: "boundary", startYear: 2026, forecastYears: 1 },
  documentRef: createDocument({ "#train-start": "2025", "#train-end": "2025", "#algo-growth": "-99.9", "#algo-seed": "1" }),
  modelDefinitions: [{ family: "ensemble" }],
  services: createServices(validBoundaryCalls),
  actions: createActions(validBoundaryCalls)
}), true);

for (const badParameters of [{ trainStart: 2030, trainEnd: 2025 }, { growth: -1 }, { growth: -1.5 }]) {
  const badRun = { id: "invalid-parameters", status: "publishable", ...badParameters };
  const p = { activeRunId: "old", priceRuns: [{ id: "old", status: "publishable" }, badRun], activationLogs: [], statuses: {} };
  const original = JSON.stringify(p);
  assert.equal(canActivateRun(badRun), false);
  for (const activate of [setActiveRun, forceActivateRun]) {
    const calls = [];
    assert.equal(activate({ project: p, runId: badRun.id, services: createServices(calls), actions: createActions(calls) }), false);
    assert.equal(JSON.stringify(p), original, "invalid historical parameters must be preserved but cannot become active");
    assert.equal(calls.length, 1);
    assert.match(calls[0], /参数无效/);
  }
}

const protectedProject = {
  id: "protected", startYear: 2026, forecastYears: 1, activeRunId: "historical",
  priceRuns: [{ id: "historical", status: "publishable", pricesByYear: { 2026: [10, 20] } }],
  roughSnapshot: { annualRows: [{ year: 2026, price: 300 }] }, activationLogs: [], statuses: {}
};
for (const preparation of [
  () => ({ ok: false, errors: ["供需配置尚未保存。"] }),
  () => ({ ok: false, errors: ["存在未保存的供需编辑，请先保存。"] }),
  () => { throw new Error("供需时序不完整。"); }
]) {
  const original = JSON.stringify(protectedProject), calls = [];
  assert.equal(generateForecastRun({ project: protectedProject, documentRef: createDocument(), modelDefinitions: [{ family: "ensemble" }],
    services: createServices(calls, { prepareSupplyDemand: preparation }), actions: createActions(calls) }), false);
  assert.equal(JSON.stringify(protectedProject), original, "无效供需不能修改历史数值、粗算快照、状态或日志");
  assert.equal(calls.length, 1);
  assert.doesNotMatch(calls[0], /^create:/);
}

const supplied = { config: { version: 1 }, dataset: { ok: true, hourlyByYear: { 2026: { load: [1] } } } };
const boundProject = JSON.parse(JSON.stringify(protectedProject));
const originalOldRun = JSON.stringify(boundProject.priceRuns[0]);
const originalRough = JSON.stringify(boundProject.roughSnapshot);
const boundCalls = [];
assert.equal(generateForecastRun({ project: boundProject, documentRef: createDocument(), modelDefinitions: [{ family: "ensemble" }],
  services: createServices(boundCalls, {
    prepareSupplyDemand: (received) => { assert.equal(received, boundProject); return { ok: true, ...supplied }; },
    createForecastRunForModel(received, model, options) {
      assert.equal(received, boundProject);
      assert.equal(options.supplyDemandInput.config, supplied.config);
      assert.equal(options.supplyDemandInput.dataset, supplied.dataset, "模型适配器应收到完整小时输入接口");
      return { id: "bound", status: "publishable", algorithmFamily: model.family, supplyDemandInput: { fingerprint: "fingerprint" } };
    },
    validateSupplyDemandRun: (_, run) => ({ ok: run.supplyDemandInput?.fingerprint === "fingerprint", errors: ["供需已过期。"] })
  }), actions: createActions(boundCalls) }), true);
assert.equal(boundProject.activeRunId, "bound");
assert.equal(JSON.stringify(boundProject.priceRuns.find((run) => run.id === "historical")), originalOldRun);
assert.equal(JSON.stringify(boundProject.roughSnapshot), originalRough);

for (const activate of [setActiveRun, forceActivateRun]) {
  const original = JSON.stringify(boundProject), calls = [];
  assert.equal(activate({ project: boundProject, runId: "historical",
    services: createServices(calls, { validateSupplyDemandRun: () => ({ ok: false, errors: ["该版本未绑定当前供需。"] }) }),
    actions: createActions(calls, { promptForceReason: () => { throw new Error("过期版本不应进入人工放行提示"); } }) }), false);
  assert.equal(JSON.stringify(boundProject), original, "过期版本不能通过普通或强制激活绕过供需校验");
  assert.deepEqual(calls, ["top:该版本未绑定当前供需。"]);
}
const failCalls = [], beforeFailure = JSON.stringify(boundProject);
assert.equal(generateForecastRun({ project: boundProject, documentRef: createDocument(), modelDefinitions: [{ family: "lstm" }, { family: "ensemble" }],
  services: createServices(failCalls, { prepareSupplyDemand: () => ({ ok: true, ...supplied }),
    createForecastRunForModel: (_, model) => { if (model.family === "ensemble") throw new Error("小时数据无效"); return { id: "partial" }; } }),
  actions: createActions(failCalls) }), false);
assert.equal(JSON.stringify(boundProject), beforeFailure, "批量生成任一模型失败不得保存部分版本");
assert.deepEqual(failCalls, ["top:小时数据无效"]);
assert.equal(hasActiveActivatableRun(boundProject, { validateSupplyDemandRun: () => ({ ok: false, errors: [] }) }), false);

console.log("forecast run flow tests passed");
