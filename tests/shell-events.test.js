"use strict";

const assert = require("node:assert/strict");
const {
  applyAuthLayout,
  bindNavigationEvents,
  bindShellEvents,
  createAppShellHandlers,
  resolveActivePageRequest
} = require("../src/ui/shell-events");

class FakeTarget {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.handlers = {};
    this.attributes = {};
  }

  addEventListener(name, handler) {
    this.handlers[name] = handler;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
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

const navCalls = [];
const jumpButton = new FakeTarget({ jump: "results-page" });
const disclosure = new FakeTarget();
const navigationDocument = {
  querySelectorAll(selector) {
    if (selector === "[data-jump]") return [jumpButton];
    if (selector === ".result-disclosure") return [disclosure];
    return [];
  }
};
const navigationRefs = {
  navItems: [new FakeTarget({ page: "energy-page" })],
  resultReportTabs: [new FakeTarget({ resultView: "detail" })]
};
bindNavigationEvents({
  refs: navigationRefs,
  documentRef: navigationDocument,
  handlers: {
    setActivePage: (pageId) => navCalls.push(`page:${pageId}`),
    setResultReportView: (view) => navCalls.push(`result:${view}`),
    queueResultChartsResize: () => navCalls.push("resize-result")
  }
});
navigationRefs.navItems[0].dispatch("click");
jumpButton.dispatch("click");
navigationRefs.resultReportTabs[0].dispatch("click");
disclosure.dispatch("toggle");
assert.deepEqual(navCalls, [
  "page:energy-page",
  "page:results-page",
  "result:detail",
  "resize-result"
]);

assert.deepEqual(resolveActivePageRequest({
  pageId: "spot-page",
  aliases: { "spot-page": "scenario-page" },
  requiresLogin: new Set(["scenario-page"]),
  requiresProject: new Set(["scenario-page"]),
  loggedIn: true,
  hasProject: true
}), { pageId: "scenario-page", topMetaMessage: "" });
assert.deepEqual(resolveActivePageRequest({
  pageId: "results-page",
  requiresLogin: ["results-page"],
  requiresProject: ["results-page"],
  loggedIn: false,
  hasProject: true
}), { pageId: "home-page", topMetaMessage: "" });
assert.deepEqual(resolveActivePageRequest({
  pageId: "results-page",
  requiresLogin: new Set(["results-page"]),
  requiresProject: new Set(["results-page"]),
  loggedIn: true,
  hasProject: false,
  projectRequiredMessage: "请选择项目"
}), { pageId: "projects-page", topMetaMessage: "请选择项目" });

const selfGroupedBlock = new FakeTarget({ groupBody: "settings" });
const parentGroupedBlock = new FakeTarget();
parentGroupedBlock.closest = () => ({ dataset: { groupBody: "projects" } });
const freeBlock = new FakeTarget();
const authRefs = {
  authOnlyNavBlocks: [selfGroupedBlock, parentGroupedBlock, freeBlock],
  loginEntryButton: new FakeTarget(),
  accountModule: new FakeTarget(),
  accountTriggerButton: new FakeTarget(),
  accountDropdown: new FakeTarget(),
  accountNameDisplay: { textContent: "" },
  accountAvatar: { textContent: "" }
};
applyAuthLayout({
  refs: authRefs,
  auth: { loggedIn: true, accountName: "张三", account: "demo1" },
  sidebarGroups: { settings: false, projects: true }
});
assert.equal(selfGroupedBlock.hidden, true);
assert.equal(parentGroupedBlock.hidden, false);
assert.equal(freeBlock.hidden, false);
assert.equal(authRefs.loginEntryButton.hidden, true);
assert.equal(authRefs.accountModule.hidden, false);
assert.equal(authRefs.accountTriggerButton.attributes["aria-expanded"], "false");
assert.equal(authRefs.accountDropdown.hidden, true);
assert.equal(authRefs.accountNameDisplay.textContent, "张三");
assert.equal(authRefs.accountAvatar.textContent, "张");

applyAuthLayout({
  refs: authRefs,
  auth: { loggedIn: false, accountName: "张三", account: "demo1" },
  sidebarGroups: { settings: true, projects: true }
});
assert.equal(selfGroupedBlock.hidden, true);
assert.equal(parentGroupedBlock.hidden, true);
assert.equal(freeBlock.hidden, true);
assert.equal(authRefs.loginEntryButton.hidden, false);
assert.equal(authRefs.accountModule.hidden, true);
assert.equal(authRefs.accountNameDisplay.textContent, "-");
assert.equal(authRefs.accountAvatar.textContent, "-");

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
