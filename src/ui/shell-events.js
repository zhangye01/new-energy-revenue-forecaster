"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_SHELL_EVENTS = api;
  if (root.window && root.window !== root) {
    root.window.NE_SHELL_EVENTS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function on(target, eventName, handler) {
    if (target && typeof target.addEventListener === "function" && typeof handler === "function") {
      target.addEventListener(eventName, handler);
    }
  }

  function bindIndexedClicks(items, handler) {
    (items || []).forEach((item, index) => {
      on(item, "click", () => handler(index));
    });
  }

  function bindShellEvents(input = {}) {
    const {
      refs = {},
      documentRef = null,
      windowRef = null,
      handlers = {}
    } = input;

    on(refs.themeToggleButton, "click", handlers.toggleTheme);
    on(refs.benchmarkBackButton, "click", handlers.resetBenchmarkMap);
    on(refs.benchmarkZoomInButton, "click", handlers.zoomBenchmarkIn);
    on(refs.benchmarkZoomOutButton, "click", handlers.zoomBenchmarkOut);
    on(refs.benchmarkZoomResetButton, "click", handlers.resetBenchmarkZoom);
    if (typeof handlers.bindBenchmarkRangeDrag === "function") handlers.bindBenchmarkRangeDrag();
    on(refs.pageHelpButton, "click", handlers.togglePageHelp);
    bindIndexedClicks(refs.overviewDots, handlers.goToOverviewSlide || (() => {}));
    on(refs.overviewDetailTrigger, "click", handlers.openOverviewPolicyDetail);
    on(refs.loginEntryButton, "click", handlers.openLoginModal);
    (refs.groupToggles || []).forEach((toggle) => {
      on(toggle, "click", () => handlers.toggleSidebarGroup?.(toggle.dataset.group || ""));
    });
    on(refs.accountTriggerButton, "click", (event) => {
      event.stopPropagation();
      handlers.toggleAccountDropdown?.();
    });
    on(refs.historyDateToggle, "click", (event) => {
      event.stopPropagation();
      handlers.toggleHistoryDatePanel?.();
    });
    on(refs.historyDatePanel, "click", (event) => event.stopPropagation());
    on(refs.accountProfileButton, "click", handlers.handleAccountManage);
    on(refs.accountPasswordButton, "click", handlers.handleAccountPassword);
    on(refs.logoutButton, "click", handlers.handleLogout);
    on(refs.settingsLogoutButton, "click", handlers.handleLogout);
    on(refs.changePasswordForm, "submit", handlers.handleChangePassword);
    on(refs.loginCancelButton, "click", handlers.closeLoginModal);
    on(refs.loginForm, "submit", (event) => {
      void handlers.handleLoginSubmit?.(event);
    });
    on(refs.loginModal, "click", (event) => {
      if (event.target === refs.loginModal) handlers.closeLoginModal?.();
    });
    on(refs.policyDetailCloseButton, "click", handlers.closeOverviewPolicyDetail);
    on(refs.policyDetailModal, "click", (event) => {
      if (event.target === refs.policyDetailModal) handlers.closeOverviewPolicyDetail?.();
    });
    on(documentRef, "click", handlers.handleDocumentClick);
    on(windowRef, "beforeunload", handlers.handleBeforeUnload);
    on(windowRef, "keydown", handlers.handleKeydown);
    on(windowRef, "error", handlers.handleWindowError);
    on(windowRef, "unhandledrejection", handlers.handleUnhandledRejection);
  }

  function disposeChartRef(chartRef) {
    if (!chartRef || typeof chartRef.get !== "function") return;
    const chart = chartRef.get();
    if (chart && typeof chart.isDisposed === "function" && !chart.isDisposed()) {
      chart.dispose();
    }
    if (typeof chartRef.set === "function") chartRef.set(null);
  }

  function disposeScenarioVisualCharts(scenarioVisualCharts = {}) {
    Object.keys(scenarioVisualCharts).forEach((key) => {
      const chart = scenarioVisualCharts[key];
      if (chart && typeof chart.isDisposed === "function" && !chart.isDisposed()) {
        chart.dispose();
      }
      delete scenarioVisualCharts[key];
    });
  }

  function createAppShellHandlers(input = {}) {
    const {
      refs = {},
      appState = {},
      benchmarkMapZoomStep = 0,
      chartRefs = {},
      scenarioVisualCharts = {},
      actions = {}
    } = input;

    return {
      toggleTheme: actions.toggleTheme,
      resetBenchmarkMap: () => {
        appState.benchmarkMap = {
          level: "nation",
          provinceKey: null,
          zoom: null,
          rangeMin: null,
          rangeMax: null
        };
        void actions.renderBenchmarkMap?.();
        actions.schedulePersistAppData?.();
      },
      zoomBenchmarkIn: () => actions.adjustBenchmarkMapZoom?.(benchmarkMapZoomStep),
      zoomBenchmarkOut: () => actions.adjustBenchmarkMapZoom?.(-benchmarkMapZoomStep),
      resetBenchmarkZoom: actions.resetBenchmarkMapZoom,
      bindBenchmarkRangeDrag: actions.bindBenchmarkRangeDrag,
      togglePageHelp: actions.togglePageHelp,
      goToOverviewSlide: actions.goToOverviewSlide,
      openOverviewPolicyDetail: () => {
        actions.openOverviewPolicyDetail?.(appState.overviewSlideIndex);
      },
      openLoginModal: actions.openLoginModal,
      toggleSidebarGroup: actions.toggleSidebarGroup,
      toggleAccountDropdown: actions.toggleAccountDropdown,
      toggleHistoryDatePanel: () => {
        const nextOpen = refs.historyDatePanel ? refs.historyDatePanel.hidden : false;
        actions.setHistoryDatePanelOpen?.(nextOpen);
      },
      handleAccountManage: actions.handleAccountManage,
      handleAccountPassword: actions.handleAccountPassword,
      handleLogout: actions.handleLogout,
      handleChangePassword: actions.handleChangePassword,
      closeLoginModal: actions.closeLoginModal,
      handleLoginSubmit: actions.handleLoginSubmit,
      closeOverviewPolicyDetail: actions.closeOverviewPolicyDetail,
      handleDocumentClick: (event) => {
        if (refs.accountModule && !refs.accountModule.hidden && !refs.accountModule.contains(event.target)) {
          actions.closeAccountDropdown?.();
        }
        if (refs.pageHelp && !refs.pageHelp.contains(event.target)) {
          actions.closePageHelp?.();
        }
        if (refs.historyDatePanel && refs.historyDateToggle && !refs.historyDatePanel.hidden && !refs.historyDatePanel.contains(event.target) && !refs.historyDateToggle.contains(event.target)) {
          actions.setHistoryDatePanelOpen?.(false);
        }
      },
      handleBeforeUnload: () => {
        actions.stopOverviewAutoplay?.();
        actions.disposeHistoryCharts?.();
        actions.disposeCompareCharts?.();
        actions.disposeResultCharts?.();
        disposeChartRef(chartRefs.energyAnnual);
        disposeChartRef(chartRefs.energyCurve);
        disposeChartRef(chartRefs.benchmarkMap);
        disposeScenarioVisualCharts(scenarioVisualCharts);
        actions.persistAppDataNow?.({ forceLocal: true });
      },
      handleKeydown: (event) => {
        if (event.key === "Escape" && refs.policyDetailModal && !refs.policyDetailModal.hidden) {
          actions.closeOverviewPolicyDetail?.();
        } else if (event.key === "Escape" && refs.loginModal && !refs.loginModal.hidden) {
          actions.closeLoginModal?.();
        } else if (event.key === "Escape") {
          actions.closeAccountDropdown?.();
          actions.closePageHelp?.();
        }
      },
      handleWindowError: (event) => {
        const fallbackError = event?.error || event?.message || "系统出现异常，请刷新页面后重试。";
        const message = actions.normalizeUserFacingError
          ? actions.normalizeUserFacingError(fallbackError)
          : fallbackError;
        actions.setTopMeta?.(message, "error");
      },
      handleUnhandledRejection: (event) => {
        const reason = event?.reason || "系统出现异常，请刷新页面后重试。";
        const message = actions.normalizeUserFacingError
          ? actions.normalizeUserFacingError(reason)
          : reason;
        actions.setTopMeta?.(message, "error");
      }
    };
  }

  function bindAppShellEvents(input = {}) {
    bindShellEvents({
      refs: input.refs,
      documentRef: input.documentRef,
      windowRef: input.windowRef,
      handlers: createAppShellHandlers(input)
    });
  }

  return Object.freeze({
    bindShellEvents,
    createAppShellHandlers,
    bindAppShellEvents
  });
});
