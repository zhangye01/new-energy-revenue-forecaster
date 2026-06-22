"use strict";

const assert = require("node:assert/strict");
const { bindAppEvents, createActionRegistry, createAppActionRegistry } = require("../src/ui/app-event-bindings");

const groupedActions = createActionRegistry({
  shell: {
    open: () => "open"
  },
  history: {
    render: () => "render"
  },
  empty: null
});
assert.equal(groupedActions.open(), "open");
assert.equal(groupedActions.render(), "render");
assert.deepEqual(Object.keys(groupedActions), ["open", "render"]);
assert.throws(() => createActionRegistry({
  first: { save: () => "a" },
  second: { save: () => "b" }
}), /事件动作重复注册：second\.save/);

const appActionCalls = [];
const appActions = createAppActionRegistry({
  toggleTheme: () => appActionCalls.push("theme"),
  handleLoginSubmit: () => appActionCalls.push("login"),
  renderCompare: () => appActionCalls.push("compare"),
  runCalculation: () => appActionCalls.push("run")
});
appActions.toggleTheme();
appActions.handleLoginSubmit();
appActions.renderCompare();
appActions.runCalculation();
assert.deepEqual(appActionCalls, ["theme", "login", "compare", "run"]);
assert.equal(Object.prototype.hasOwnProperty.call(appActions, "setTopMeta"), true);
assert.equal(Object.prototype.hasOwnProperty.call(appActions, "printScenarioReport"), true);

const calls = [];
const refs = {
  provinceApplyMessage: { textContent: "old" }
};
const documentRef = {
  querySelector(selector) {
    calls.push(`query:${selector}`);
    return { selector };
  }
};
const appState = {
  policyFilters: { provinceKey: "jiangsu" },
  historyAnalysis: { startDate: "2026-01-01" },
  compareView: "scenario",
  energyStep2Choice: "typical"
};

let policyHandlers = null;
let compareHandlers = null;
let energyHandlers = null;
let forecastHandlers = null;
let derivedInput = null;
let resultHandlers = null;

bindAppEvents({
  refs,
  documentRef,
  windowRef: {},
  appState,
  benchmarkMapZoomStep: 0.1,
  scenarioVisualCharts: {},
  chartRefs: {},
  modules: {
    shellEvents: {
      bindAppShellEvents(input) {
        calls.push(`shell:${input.benchmarkMapZoomStep}`);
      },
      bindAppNavigationEvents(input) {
        calls.push(`navigation:${Boolean(input.actions.setActivePage)}`);
      }
    },
    historyPage: {
      createPolicyHistoryEventHandlers(handlers) {
        calls.push("history-handlers");
        policyHandlers = handlers;
        return handlers;
      },
      bindPolicyHistoryEvents(input) {
        calls.push(`history-bind:${input.handlers === policyHandlers}`);
      }
    },
    comparePage: {
      createCompareEventHandlers(handlers) {
        calls.push("compare-handlers");
        compareHandlers = handlers;
        return handlers;
      },
      bindCompareEvents(input) {
        calls.push(`compare-bind:${input.handlers === compareHandlers}`);
      }
    },
    energyWorkspace: {
      createEnergyWorkspaceEventHandlers(handlers) {
        calls.push("energy-handlers");
        energyHandlers = handlers;
        return handlers;
      },
      bindCreateEnergyEvents(input) {
        calls.push(`energy-bind:${input.handlers === energyHandlers}`);
      }
    },
    scenarioForm: {
      bindForecastScenarioEvents(input) {
        calls.push("forecast-bind");
        forecastHandlers = input.handlers;
      },
      bindScenarioDerivedFieldEvents(input) {
        calls.push("derived-bind");
        derivedInput = input;
      }
    },
    resultPage: {
      bindResultActionEvents(input) {
        calls.push("result-bind");
        resultHandlers = input.handlers;
      }
    }
  },
  state: {
    compareSensitivitySettings: { range: 10 },
    getActiveSensitivityFactorKey: () => "factor-a",
    setActiveSensitivityFactorKey: (key) => calls.push(`set-factor:${key}`),
    setActiveCompareScenarioId: (scenarioId) => calls.push(`set-scenario:${scenarioId}`),
    setSelectedProvinceDefaultKey: (provinceKey) => calls.push(`province:${provinceKey}`)
  },
  actions: {
    setActivePage: () => calls.push("set-page"),
    setResultReportView: () => calls.push("set-result-view"),
    queueResultChartsResize: () => calls.push("resize-result"),
    schedulePersistAppData: () => calls.push("persist"),
    sanitizeHistoryAnalysis: () => ({}),
    renderPolicyPanel: () => calls.push("render-policy"),
    renderHistoryPrices: () => calls.push("render-history"),
    exportHistoryChartData: () => calls.push("export-history"),
    sanitizeCompareView: (view) => view,
    sanitizeCompareSensitivitySettings: () => ({}),
    renderCompareWorkspaceState: () => calls.push("render-compare-state"),
    renderCompare: () => calls.push("render-compare"),
    queueCompareChartsResize: () => calls.push("resize-compare"),
    getActiveProject: () => ({ id: "p1" }),
    isProjectCreateCompleted: () => true,
    hasEnergyHistoryEntryReadiness: () => true,
    sanitizeEnergyStep2Choice: (choice) => choice,
    createProjectFromForm: () => calls.push("create-project"),
    syncCreateStorageFieldsUi: () => calls.push("sync-storage"),
    setTopMeta: () => calls.push("top-meta"),
    setCreateSaveMessage: () => calls.push("create-message"),
    setEnergyImportMessage: () => calls.push("energy-message"),
    exportEnergyTemplate: () => calls.push("export-energy"),
    importEnergyFromFile: () => calls.push("import-energy"),
    applyProvinceTypicalCurve: () => calls.push("province-curve"),
    renderEnergyStep2ChoiceState: () => calls.push("render-energy-choice"),
    generateForecastRun: () => calls.push("forecast"),
    saveScenarioFromForm: () => calls.push("save-scenario"),
    switchActiveScenario: () => calls.push("switch-scenario"),
    renameActiveScenario: () => calls.push("rename-scenario"),
    duplicateActiveScenario: () => calls.push("duplicate-scenario"),
    deleteActiveScenario: () => calls.push("delete-scenario"),
    toggleBaselineLock: () => calls.push("baseline-lock"),
    applyBatchParameter: () => calls.push("batch"),
    syncScenarioFieldLocks: () => calls.push("sync-locks"),
    exportManualScenarioTemplate: () => calls.push("export-manual"),
    importManualScenarioTemplate: () => calls.push("import-manual"),
    renderProvinceLibrary: () => calls.push("render-province"),
    updateMarketTradeEnergyDisplay: () => calls.push("market-ratio"),
    updateEnvValueSpaceDisplay: () => calls.push("env-ratio"),
    runCalculation: () => calls.push("run-calc"),
    exportAnnualCsv: () => calls.push("annual-csv"),
    exportHourlyCsv: () => calls.push("hourly-csv"),
    printScenarioReport: () => calls.push("print-report")
  }
});

assert.deepEqual(calls.slice(0, 10), [
  "shell:0.1",
  "history-handlers",
  "history-bind:true",
  "navigation:true",
  "compare-handlers",
  "compare-bind:true",
  "energy-handlers",
  "energy-bind:true",
  "forecast-bind",
  "derived-bind"
]);
assert.equal(calls[10], "result-bind");

policyHandlers.setPolicyFilters({ provinceKey: "shanghai" });
assert.deepEqual(appState.policyFilters, { provinceKey: "shanghai" });
policyHandlers.setHistoryAnalysis({ startDate: "2027-01-01" });
assert.deepEqual(appState.historyAnalysis, { startDate: "2027-01-01" });

compareHandlers.setCompareView("sensitivity");
assert.equal(appState.compareView, "sensitivity");
compareHandlers.setActiveSensitivityFactorKey("factor-b");
compareHandlers.setActiveCompareScenarioId("s2");

energyHandlers.setEnergyStep2Choice("province");
assert.equal(appState.energyStep2Choice, "province");

forecastHandlers.changeProvinceDefault("zhejiang");
assert.equal(refs.provinceApplyMessage.textContent, "");

assert.deepEqual(derivedInput.querySelector("#mechanism-ratio"), { selector: "#mechanism-ratio" });
derivedInput.handlers.updateEnvValueSpaceDisplay();
resultHandlers.printScenarioReport();

assert.ok(calls.includes("set-factor:factor-b"));
assert.ok(calls.includes("set-scenario:s2"));
assert.ok(calls.includes("province:zhejiang"));
assert.ok(calls.includes("render-province"));
assert.ok(calls.includes("env-ratio"));
assert.ok(calls.includes("print-report"));

console.log("app event bindings tests passed");
