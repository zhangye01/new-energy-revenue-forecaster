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
  function bindAppEvents(input = {}) {
    const {
      refs = {},
      documentRef = null,
      windowRef = null,
      appState = {},
      modules = {},
      benchmarkMapZoomStep = 0,
      scenarioVisualCharts = {},
      chartRefs = {},
      state = {},
      actions = {}
    } = input;
    const {
      shellEvents,
      historyPage,
      comparePage,
      energyWorkspace,
      scenarioForm,
      resultPage
    } = modules;

    shellEvents.bindAppShellEvents({
      refs,
      documentRef,
      windowRef,
      appState,
      benchmarkMapZoomStep,
      scenarioVisualCharts,
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
      actions: {
        setActivePage: actions.setActivePage,
        setResultReportView: actions.setResultReportView,
        queueResultChartsResize: actions.queueResultChartsResize
      }
    });

    comparePage.bindCompareEvents({
      refs,
      handlers: comparePage.createCompareEventHandlers({
        refs,
        sensitivitySettings: state.compareSensitivitySettings,
        getCompareView: () => appState.compareView,
        setCompareView: (nextView) => {
          appState.compareView = nextView;
        },
        sanitizeCompareView: actions.sanitizeCompareView,
        getActiveSensitivityFactorKey: state.getActiveSensitivityFactorKey,
        setActiveSensitivityFactorKey: state.setActiveSensitivityFactorKey,
        setActiveCompareScenarioId: state.setActiveCompareScenarioId,
        sanitizeCompareSensitivitySettings: actions.sanitizeCompareSensitivitySettings,
        renderCompareWorkspaceState: actions.renderCompareWorkspaceState,
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

    scenarioForm.bindForecastScenarioEvents({
      refs,
      handlers: {
        generateForecastRun: actions.generateForecastRun,
        saveScenarioFromForm: actions.saveScenarioFromForm,
        switchActiveScenario: actions.switchActiveScenario,
        renameActiveScenario: actions.renameActiveScenario,
        duplicateActiveScenario: actions.duplicateActiveScenario,
        deleteActiveScenario: actions.deleteActiveScenario,
        toggleBaselineLock: actions.toggleBaselineLock,
        applyBatchParameter: actions.applyBatchParameter,
        syncScenarioFieldLocks: actions.syncScenarioFieldLocks,
        exportManualScenarioTemplate: actions.exportManualScenarioTemplate,
        importManualScenarioTemplate: actions.importManualScenarioTemplate,
        changeProvinceDefault: (provinceKey) => {
          state.setSelectedProvinceDefaultKey?.(provinceKey);
          if (refs.provinceApplyMessage) {
            refs.provinceApplyMessage.textContent = "";
          }
          actions.renderProvinceLibrary?.();
        }
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

    resultPage.bindResultActionEvents({
      refs,
      handlers: {
        runCalculation: actions.runCalculation,
        exportAnnualCsv: actions.exportAnnualCsv,
        exportHourlyCsv: actions.exportHourlyCsv,
        printScenarioReport: actions.printScenarioReport
      }
    });
  }

  return Object.freeze({
    bindAppEvents
  });
});
