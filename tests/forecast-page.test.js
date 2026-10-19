"use strict";

const assert = require("node:assert/strict");
const {
  DEFAULT_GATE_MESSAGE,
  applyForecastRunsView,
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
  gateMessage: "请选择项目",
  gateHelpText: "硬门槛：MAPE ≤ 15%，sMAPE ≤ 18%，缺失点 ≤ 0；按完整测算周期检查价格曲线。软门槛：MAE ≤ -，RMSE ≤ -。"
});

const emptyView = buildForecastRunsView({ project: { priceRuns: [], activationLogs: [] } });
assert.match(emptyView.runBodyHtml, /还没有电价预测版本/);
assert.match(emptyView.activationBodyHtml, /暂无激活日志/);
assert.equal(emptyView.gateMessage, DEFAULT_GATE_MESSAGE);
assert.match(emptyView.gateHelpText, /MAPE ≤ 15%，sMAPE ≤ 18%，缺失点 ≤ 0/);

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

assert.match(view.gateHelpText, /软门槛：MAE ≤ 15，RMSE ≤ 20/);
assert.equal(view.gateMessage, "最新运行 run-1 · 可发布");
assert.doesNotMatch(view.gateMessage, /门槛|MAPE|MAE/);
assert.match(view.runBodyHtml, /Ensemble/);
assert.match(view.runBodyHtml, /12\.00%/);
assert.match(view.runBodyHtml, /run-1">设为生效/);
assert.match(view.runBodyHtml, /生效中/);
assert.match(view.runBodyHtml, /run-2">强制发布/);
assert.match(view.activationBodyHtml, /2026\/1\/2 11:04:05/);
assert.match(view.activationBodyHtml, /&lt;manual&gt;/);

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
assert.match(gateHelp.textContent, /MAPE ≤ 10%，sMAPE ≤ 12%，缺失点 ≤ 2/);
assert.match(gateHelp.textContent, /MAE ≤ 25，RMSE ≤ 35/);
assert.doesNotMatch(gateHelp.textContent, /run-3|待复核/);
const noRunsWithThresholds = buildForecastRunsView({
  project: { priceRuns: [] }, qualityGate: { soft: { mae: 7, rmse: 9 } }
});
applyForecastRunsView({ refs, view: noRunsWithThresholds });
assert.equal(gateStatus.textContent, DEFAULT_GATE_MESSAGE);
assert.match(gateHelp.textContent, /MAE ≤ 7，RMSE ≤ 9/);
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

console.log("forecast page tests passed");
