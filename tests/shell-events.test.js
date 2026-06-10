"use strict";

const assert = require("node:assert/strict");
const { bindShellEvents } = require("../src/ui/shell-events");

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

console.log("shell events tests passed");
