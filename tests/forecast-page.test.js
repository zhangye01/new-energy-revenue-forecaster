"use strict";

const assert = require("node:assert/strict");
const {
  DEFAULT_GATE_MESSAGE,
  bindForecastRunActions,
  buildForecastRunsView
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
  gateMessage: DEFAULT_GATE_MESSAGE
});

const emptyView = buildForecastRunsView({ project: { priceRuns: [], activationLogs: [] } });
assert.match(emptyView.runBodyHtml, /还没有电价预测版本/);
assert.match(emptyView.activationBodyHtml, /暂无激活日志/);
assert.equal(emptyView.gateMessage, DEFAULT_GATE_MESSAGE);

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

assert.match(view.gateMessage, /软门槛：MAE ≤ 15，RMSE ≤ 20/);
assert.match(view.gateMessage, /最新运行 run-1 状态：可发布/);
assert.match(view.runBodyHtml, /Ensemble/);
assert.match(view.runBodyHtml, /12\.00%/);
assert.match(view.runBodyHtml, /run-1">设为生效/);
assert.match(view.runBodyHtml, /生效中/);
assert.match(view.runBodyHtml, /run-2">强制发布/);
assert.match(view.activationBodyHtml, /2026\/1\/2 11:04:05/);
assert.match(view.activationBodyHtml, /&lt;manual&gt;/);

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

console.log("forecast page tests passed");
