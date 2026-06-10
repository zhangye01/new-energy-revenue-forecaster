"use strict";

const assert = require("node:assert/strict");
const {
  bindShellEvents,
  createAppShellHandlers
} = require("../src/ui/shell-events");

class FakeTarget {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.handlers = {};
  }

  addEventListener(name, handler) {
    this.handlers[name] = handler;
  }

  dispatch(name, event = {}) {
    this.handlers[name]?.({
      target: this,
      stopPropagation: () => {
        event.stopped = true;
      },
      ...event
    });
    return event;
  }
}

const calls = [];
const refs = {
  themeToggleButton: new FakeTarget(),
  benchmarkBackButton: new FakeTarget(),
  overviewDots: [new FakeTarget(), new FakeTarget()],
  groupToggles: [new FakeTarget({ group: "settings" })],
  accountTriggerButton: new FakeTarget(),
  historyDateToggle: new FakeTarget(),
  loginCancelButton: new FakeTarget(),
  loginForm: new FakeTarget(),
  loginModal: new FakeTarget(),
  policyDetailModal: new FakeTarget()
};
const documentRef = new FakeTarget();
const windowRef = new FakeTarget();

bindShellEvents({
  refs,
  documentRef,
  windowRef,
  handlers: {
    toggleTheme: () => calls.push("theme"),
    resetBenchmarkMap: () => calls.push("benchmark-reset"),
    goToOverviewSlide: (index) => calls.push(`slide:${index}`),
    toggleSidebarGroup: (group) => calls.push(`group:${group}`),
    toggleAccountDropdown: () => calls.push("account"),
    toggleHistoryDatePanel: () => calls.push("history-date"),
    closeLoginModal: () => calls.push("close-login"),
    handleLoginSubmit: () => calls.push("login-submit"),
    closeOverviewPolicyDetail: () => calls.push("close-policy"),
    handleDocumentClick: () => calls.push("document"),
    handleBeforeUnload: () => calls.push("beforeunload"),
    handleKeydown: () => calls.push("keydown"),
    handleWindowError: () => calls.push("error"),
    handleUnhandledRejection: () => calls.push("rejection")
  }
});

refs.themeToggleButton.dispatch("click");
refs.benchmarkBackButton.dispatch("click");
refs.overviewDots[1].dispatch("click");
refs.groupToggles[0].dispatch("click");
const accountEvent = refs.accountTriggerButton.dispatch("click");
const historyDateEvent = refs.historyDateToggle.dispatch("click");
refs.loginCancelButton.dispatch("click");
refs.loginForm.dispatch("submit");
refs.loginModal.dispatch("click", { target: refs.loginModal });
refs.policyDetailModal.dispatch("click", { target: refs.policyDetailModal });
documentRef.dispatch("click");
windowRef.dispatch("beforeunload");
windowRef.dispatch("keydown");
windowRef.dispatch("error");
windowRef.dispatch("unhandledrejection");

assert.equal(accountEvent.stopped, true);
assert.equal(historyDateEvent.stopped, true);
assert.deepEqual(calls, [
  "theme",
  "benchmark-reset",
  "slide:1",
  "group:settings",
  "account",
  "history-date",
  "close-login",
  "login-submit",
  "close-login",
  "close-policy",
  "document",
  "beforeunload",
  "keydown",
  "error",
  "rejection"
]);

const hiddenTarget = new FakeTarget();
hiddenTarget.hidden = true;
hiddenTarget.contains = () => false;
const openTarget = new FakeTarget();
openTarget.hidden = false;
openTarget.contains = () => false;
const insideTarget = new FakeTarget();
insideTarget.contains = (target) => target === insideTarget;
function makeChart() {
  return {
    disposed: false,
    isDisposed() {
      return this.disposed;
    },
    dispose() {
      this.disposed = true;
    }
  };
}

let energyAnnualChart = makeChart();
let energyCurveChart = makeChart();
let benchmarkMapChart = makeChart();
const scenarioVisualCharts = {
  a: makeChart(),
  b: makeChart()
};
const shellCalls = [];
const appState = { overviewSlideIndex: 2, benchmarkMap: { level: "province" } };
const appHandlers = createAppShellHandlers({
  refs: {
    accountModule: openTarget,
    pageHelp: openTarget,
    historyDatePanel: openTarget,
    historyDateToggle: insideTarget,
    policyDetailModal: openTarget,
    loginModal: hiddenTarget
  },
  appState,
  benchmarkMapZoomStep: 0.25,
  scenarioVisualCharts,
  chartRefs: {
    energyAnnual: {
      get: () => energyAnnualChart,
      set: (chart) => {
        energyAnnualChart = chart;
      }
    },
    energyCurve: {
      get: () => energyCurveChart,
      set: (chart) => {
        energyCurveChart = chart;
      }
    },
    benchmarkMap: {
      get: () => benchmarkMapChart,
      set: (chart) => {
        benchmarkMapChart = chart;
      }
    }
  },
  actions: {
    renderBenchmarkMap: () => shellCalls.push("render-map"),
    schedulePersistAppData: () => shellCalls.push("persist-later"),
    adjustBenchmarkMapZoom: (step) => shellCalls.push(`zoom:${step}`),
    openOverviewPolicyDetail: (index) => shellCalls.push(`policy:${index}`),
    setHistoryDatePanelOpen: (open) => shellCalls.push(`history-panel:${open}`),
    closeAccountDropdown: () => shellCalls.push("close-account"),
    closePageHelp: () => shellCalls.push("close-help"),
    closeOverviewPolicyDetail: () => shellCalls.push("close-policy"),
    closeLoginModal: () => shellCalls.push("close-login"),
    stopOverviewAutoplay: () => shellCalls.push("stop-overview"),
    disposeHistoryCharts: () => shellCalls.push("dispose-history"),
    disposeCompareCharts: () => shellCalls.push("dispose-compare"),
    disposeResultCharts: () => shellCalls.push("dispose-result"),
    persistAppDataNow: (options) => shellCalls.push(`persist-now:${options.forceLocal}`),
    normalizeUserFacingError: (error) => `normalized:${error.message || error}`,
    setTopMeta: (message, level) => shellCalls.push(`top:${level}:${message}`)
  }
});

appHandlers.resetBenchmarkMap();
assert.deepEqual(appState.benchmarkMap, {
  level: "nation",
  provinceKey: null,
  zoom: null,
  rangeMin: null,
  rangeMax: null
});
appHandlers.zoomBenchmarkIn();
appHandlers.zoomBenchmarkOut();
appHandlers.openOverviewPolicyDetail();
appHandlers.toggleHistoryDatePanel();
appHandlers.handleDocumentClick({ target: new FakeTarget() });
appHandlers.handleKeydown({ key: "Escape" });
appHandlers.handleWindowError({ error: new Error("boom") });
appHandlers.handleUnhandledRejection({ reason: "bad promise" });
appHandlers.handleBeforeUnload();

assert.equal(energyAnnualChart, null);
assert.equal(energyCurveChart, null);
assert.equal(benchmarkMapChart, null);
assert.deepEqual(Object.keys(scenarioVisualCharts), []);
assert.deepEqual(shellCalls, [
  "render-map",
  "persist-later",
  "zoom:0.25",
  "zoom:-0.25",
  "policy:2",
  "history-panel:false",
  "close-account",
  "close-help",
  "history-panel:false",
  "close-policy",
  "top:error:normalized:boom",
  "top:error:normalized:bad promise",
  "stop-overview",
  "dispose-history",
  "dispose-compare",
  "dispose-result",
  "persist-now:true"
]);

console.log("shell events tests passed");
