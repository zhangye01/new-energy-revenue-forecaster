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

  return Object.freeze({
    bindShellEvents
  });
});
