"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_APP_EVENT_BINDINGS = api;
  if (root.window && root.window !== root) {
    root.window.NE_APP_EVENT_BINDINGS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const APP_ACTION_GROUPS = Object.freeze({
    shell: [
      "toggleTheme", "renderBenchmarkMap", "schedulePersistAppData",
      "adjustBenchmarkMapZoom", "resetBenchmarkMapZoom", "bindBenchmarkRangeDrag",
      "goToOverviewSlide", "openOverviewPolicyDetail",
      "openLoginModal", "toggleSidebarGroup", "toggleAccountDropdown", "setHistoryDatePanelOpen"
    ],
    account: [
      "handleAccountManage", "handleAccountPassword", "handleLogout", "handleChangePassword",
      "closeLoginModal", "handleLoginSubmit", "closeOverviewPolicyDetail",
      "closeAccountDropdown", "stopOverviewAutoplay"
    ],
    lifecycle: [
      "disposeHistoryCharts", "disposeCompareCharts", "disposeResultCharts",
      "persistAppDataNow", "hasUnpersistedAppData", "normalizeUserFacingError", "setTopMeta"
    ],
    history: ["sanitizeHistoryAnalysis", "renderPolicyPanel", "renderHistoryPrices", "exportHistoryChartData"],
    navigation: ["setActivePage"],
    compare: [
      "sanitizeCompareView",
      "renderCompare", "queueCompareChartsResize"
    ],
    energy: [
      "getActiveProject", "isProjectCreateCompleted", "hasEnergyHistoryEntryReadiness",
      "sanitizeEnergyStep2Choice", "createProjectFromForm", "syncCreateStorageFieldsUi",
      "setCreateSaveMessage", "setEnergyImportMessage", "exportEnergyTemplate",
      "importEnergyFromFile", "applyProvinceTypicalCurve", "renderEnergyStep2ChoiceState"
    ],
    scenario: [
      "saveScenarioFromForm", "switchActiveScenario",
      "renameActiveScenario", "duplicateActiveScenario", "deleteActiveScenario",
      "toggleBaselineLock", "applyBatchParameter", "syncScenarioFieldLocks",
      "exportManualScenarioTemplate", "importManualScenarioTemplate",
      "updateMarketTradeEnergyDisplay", "updateEnvValueSpaceDisplay"
    ],
    result: ["runCalculation", "exportAnnualCsv", "exportHourlyCsv", "exportBriefWord"]
  });

  function createActionRegistry(groups = {}) {
    const registry = {};
    Object.entries(groups).forEach(([groupName, group]) => {
      if (!group || typeof group !== "object") return;
      Object.entries(group).forEach(([name, handler]) => {
        if (Object.prototype.hasOwnProperty.call(registry, name)) {
          throw new Error(`事件动作重复注册：${groupName}.${name}`);
        }
        registry[name] = handler;
      });
    });
    return registry;
  }

  function createGroupedActionMap(source = {}, groups = APP_ACTION_GROUPS) {
    const grouped = {};
    Object.entries(groups).forEach(([groupName, names]) => {
      grouped[groupName] = {};
      names.forEach((name) => {
        grouped[groupName][name] = source[name];
      });
    });
    return grouped;
  }

  function createAppActionRegistry(source = {}) {
    return createActionRegistry(createGroupedActionMap(source));
  }

  function bindAppEvents(input = {}) {
    const {
      refs = {},
      documentRef = null,
      windowRef = null,
      appState = {},
      modules = {},
      benchmarkMapZoomStep = 0,
      chartRefs = {},
      state = {},
      actions = {}
    } = input;
    const {
      shellEvents,
      historyPage,
      comparePage,
      energyWorkspace,
      scenarioForm
    } = modules;

    shellEvents.bindAppShellEvents({
      refs,
      documentRef,
      windowRef,
      appState,
      benchmarkMapZoomStep,
      chartRefs,
      actions
    });

    historyPage.bindPolicyHistoryEvents({
      refs,
      handlers: historyPage.createPolicyHistoryEventHandlers({
        getPolicyFilters: () => appState.policyFilters,
        setPolicyFilters: (policyFilters) => {
          appState.policyFilters = policyFilters;
        },
        getHistoryAnalysis: () => appState.historyAnalysis,
        setHistoryAnalysis: (historyAnalysisState) => {
          appState.historyAnalysis = historyAnalysisState;
        },
        sanitizeHistoryAnalysis: actions.sanitizeHistoryAnalysis,
        renderPolicyPanel: actions.renderPolicyPanel,
        renderHistoryPrices: actions.renderHistoryPrices,
        schedulePersistAppData: actions.schedulePersistAppData,
        exportHistoryChart: actions.exportHistoryChartData
      })
    });

    shellEvents.bindAppNavigationEvents({
      refs,
      documentRef,
      actions: { setActivePage: actions.setActivePage }
    });

    comparePage.bindCompareEvents({
      refs,
      handlers: comparePage.createCompareEventHandlers({
        refs,
        getCompareView: () => appState.compareView,
        setCompareView: (nextView) => {
          appState.compareView = nextView;
        },
        sanitizeCompareView: actions.sanitizeCompareView,
        setActiveSensitivityFactorKey: state.setActiveSensitivityFactorKey,
        setActiveCompareScenarioId: state.setActiveCompareScenarioId,
        renderCompare: actions.renderCompare,
        queueCompareChartsResize: actions.queueCompareChartsResize,
        schedulePersistAppData: actions.schedulePersistAppData
      })
    });

    energyWorkspace.bindCreateEnergyEvents({
      refs,
      handlers: energyWorkspace.createEnergyWorkspaceEventHandlers({
        getActiveProject: actions.getActiveProject,
        isProjectReady: actions.isProjectCreateCompleted,
        hasHistoryReadiness: actions.hasEnergyHistoryEntryReadiness,
        getEnergyStep2Choice: () => appState.energyStep2Choice,
        setEnergyStep2Choice: (nextChoice) => {
          appState.energyStep2Choice = nextChoice;
        },
        sanitizeEnergyStep2Choice: actions.sanitizeEnergyStep2Choice,
        createProjectFromForm: actions.createProjectFromForm,
        syncCreateStorageFields: actions.syncCreateStorageFieldsUi,
        setTopMeta: actions.setTopMeta,
        setCreateSaveMessage: actions.setCreateSaveMessage,
        setEnergyImportMessage: actions.setEnergyImportMessage,
        setActivePage: actions.setActivePage,
        exportEnergyTemplate: actions.exportEnergyTemplate,
        importEnergyFromFile: actions.importEnergyFromFile,
        applyProvinceTypicalCurve: actions.applyProvinceTypicalCurve,
        renderEnergyStep2ChoiceState: actions.renderEnergyStep2ChoiceState,
        schedulePersistAppData: actions.schedulePersistAppData
      })
    });

    scenarioForm.bindScenarioEvents({
      refs,
      handlers: {
        saveScenarioFromForm: actions.saveScenarioFromForm,
        switchActiveScenario: actions.switchActiveScenario,
        renameActiveScenario: actions.renameActiveScenario,
        duplicateActiveScenario: actions.duplicateActiveScenario,
        deleteActiveScenario: actions.deleteActiveScenario,
        toggleBaselineLock: actions.toggleBaselineLock,
        applyBatchParameter: actions.applyBatchParameter,
        syncScenarioFieldLocks: actions.syncScenarioFieldLocks,
        exportManualScenarioTemplate: actions.exportManualScenarioTemplate,
        importManualScenarioTemplate: actions.importManualScenarioTemplate
      }
    });

    scenarioForm.bindScenarioDerivedFieldEvents({
      querySelector: (selector) => documentRef?.querySelector?.(selector),
      handlers: {
        syncScenarioFieldLocks: actions.syncScenarioFieldLocks,
        updateMarketTradeEnergyDisplay: actions.updateMarketTradeEnergyDisplay,
        updateEnvValueSpaceDisplay: actions.updateEnvValueSpaceDisplay
      }
    });

    refs.runCalcButton?.addEventListener("click", actions.runCalculation);
    refs.exportAnnualButton?.addEventListener("click", actions.exportAnnualCsv);
    refs.exportHourlyButton?.addEventListener("click", actions.exportHourlyCsv);
    refs.exportBriefWordButton?.addEventListener("click", actions.exportBriefWord);
  }

  return Object.freeze({
    createAppActionRegistry,
    bindAppEvents,
    createActionRegistry
  });
});
