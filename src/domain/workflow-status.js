"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_WORKFLOW_STATUS = api;
  if (root.window && root.window !== root) {
    root.window.NE_WORKFLOW_STATUS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const DEFAULT_WORKFLOW_PAGES = Object.freeze([
    "create-page",
    "energy-page",
    "history-page",
    "forecast-page",
    "scenario-page",
    "results-page",
    "compare-page"
  ]);
  const STATUS_SET = new Set(["not_started", "in_progress", "completed", "stale"]);
  const DOWNSTREAM_STALE_CHAIN = Object.freeze({
    "energy-page": Object.freeze(["forecast-page", "scenario-page", "results-page", "compare-page"]),
    "history-page": Object.freeze(["forecast-page", "scenario-page", "results-page", "compare-page"]),
    "forecast-page": Object.freeze(["scenario-page", "results-page", "compare-page"]),
    "scenario-page": Object.freeze(["results-page", "compare-page"])
  });

  function normalizeWorkflowPages(workflowPages) {
    return Array.isArray(workflowPages) && workflowPages.length
      ? workflowPages
      : DEFAULT_WORKFLOW_PAGES;
  }

  function statusMapTemplate(workflowPages) {
    return Object.fromEntries(normalizeWorkflowPages(workflowPages).map((pageId) => [pageId, "not_started"]));
  }

  function sanitizeStatuses(rawStatuses, workflowPages) {
    const statuses = statusMapTemplate(workflowPages);
    if (!rawStatuses || typeof rawStatuses !== "object" || Array.isArray(rawStatuses)) return statuses;
    for (const pageId of normalizeWorkflowPages(workflowPages)) {
      const value = rawStatuses[pageId];
      if (STATUS_SET.has(value)) {
        statuses[pageId] = value;
      }
    }
    return statuses;
  }

  function buildStatusMaps(snapshot = {}, currentStatuses = {}, options = {}) {
    const hasProjectName = Boolean(options.hasProjectName);
    return {
      inProgressMap: {
        "create-page": !snapshot.createCompleted && hasProjectName,
        "energy-page": Boolean(snapshot.createCompleted),
        "history-page": Boolean(snapshot.historyReady),
        "forecast-page": Boolean(snapshot.historyCompleted || snapshot.hasPriceRuns),
        "scenario-page": Boolean(snapshot.forecastCompleted || currentStatuses["scenario-page"] === "in_progress"),
        "results-page": Boolean(snapshot.scenarioCompleted && snapshot.forecastCompleted),
        "compare-page": Boolean(snapshot.resultsCompleted && snapshot.compareReadyCount >= 1)
      },
      completedMap: {
        "create-page": Boolean(snapshot.createCompleted),
        "energy-page": Boolean(snapshot.energyCompleted),
        "history-page": Boolean(snapshot.historyCompleted),
        "forecast-page": Boolean(snapshot.forecastCompleted),
        "scenario-page": Boolean(snapshot.scenarioCompleted),
        "results-page": Boolean(snapshot.resultsCompleted),
        "compare-page": Boolean(snapshot.compareCompleted)
      }
    };
  }

  function reconcileStatuses(rawStatuses, snapshot = {}, options = {}) {
    const workflowPages = normalizeWorkflowPages(options.workflowPages);
    const statuses = sanitizeStatuses(rawStatuses, workflowPages);
    const { inProgressMap, completedMap } = buildStatusMaps(snapshot, statuses, options);
    for (const pageId of workflowPages) {
      const current = statuses[pageId] || "not_started";
      if (completedMap[pageId]) {
        statuses[pageId] = "completed";
        continue;
      }
      if (current === "stale") {
        continue;
      }
      statuses[pageId] = inProgressMap[pageId] ? "in_progress" : "not_started";
    }
    return statuses;
  }

  function markDownstreamStale(rawStatuses, fromPage, options = {}) {
    const statuses = sanitizeStatuses(rawStatuses, options.workflowPages);
    const targets = DOWNSTREAM_STALE_CHAIN[fromPage] || [];
    for (const pageId of targets) {
      if (statuses[pageId] !== "not_started") {
        statuses[pageId] = "stale";
      }
    }
    return statuses;
  }

  function statusText(state) {
    if (state === "completed") return "已完成";
    if (state === "in_progress") return "进行中";
    if (state === "stale") return "需复核";
    return "未开始";
  }

  return Object.freeze({
    DEFAULT_WORKFLOW_PAGES,
    statusMapTemplate,
    sanitizeStatuses,
    reconcileStatuses,
    markDownstreamStale,
    statusText
  });
});
