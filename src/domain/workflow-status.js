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
    "rough-page",
    "history-page",
    "forecast-page",
    "scenario-page",
    "results-page",
    "validation-page",
    "compare-page"
  ]);
  const STATUS_SET = new Set(["not_started", "in_progress", "completed", "stale"]);
  const DOWNSTREAM_STALE_CHAIN = Object.freeze({
    "energy-page": Object.freeze(["rough-page", "forecast-page", "scenario-page", "results-page", "validation-page", "compare-page"]),
    "rough-page": Object.freeze(["validation-page"]),
    "history-page": Object.freeze(["forecast-page", "scenario-page", "results-page", "validation-page", "compare-page"]),
    "forecast-page": Object.freeze(["scenario-page", "results-page", "validation-page", "compare-page"]),
    "scenario-page": Object.freeze(["results-page", "validation-page", "compare-page"])
  });

  function buildCompletionSnapshot(input = {}) {
    const { project = {}, scenario = null, energyState = {}, roughPrice = {} } = input;
    const snapshots = (project.roughPrice?.snapshots || []).filter((item) => item.scenarioId === scenario?.id);
    const roughSnapshot = snapshots.find((item) => roughPrice.snapshotState?.(project, scenario, item)?.comparable);
    const result = project.resultsByScenario?.[scenario?.id];
    const baselineState = result && roughPrice.baselineResultState?.(project, scenario, result);
    return {
      ...input,
      resultsCompleted: baselineState ? baselineState.current : input.resultsCompleted,
      resultsStale: Boolean(baselineState && !baselineState.current),
      energyCompleted: Boolean(energyState.ready),
      completeEnergyYears: energyState.completeYears || 0,
      historyReady: Boolean(input.createCompleted && project.province),
      historyCompleted: Boolean(input.createCompleted && project.province && project.statuses?.["history-page"] === "completed"),
      hasPriceRuns: Boolean(project.priceRuns?.length),
      scenarioCompleted: project.statuses?.["scenario-page"] === "completed",
      compareCompleted: input.compareReadyCount >= 2,
      roughStarted: Boolean(snapshots.length || project.roughPrice?.draftsByScenario?.[scenario?.id]?.spotNodes?.some((node) => node.value !== null && node.value !== "" && node.value !== undefined)),
      roughCompleted: Boolean(roughSnapshot),
      validationReady: Boolean(snapshots.length || result),
      validationCompleted: Boolean(roughSnapshot && result && (!baselineState || baselineState.current) && roughPrice.compareBaselineResult?.(project, scenario, roughSnapshot, result)?.ok),
      validationStale: Boolean(result && baselineState && !baselineState.current)
    };
  }

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
        "rough-page": Boolean(snapshot.energyCompleted || snapshot.roughStarted),
        "history-page": Boolean(snapshot.historyReady),
        "forecast-page": Boolean(snapshot.historyCompleted || snapshot.hasPriceRuns),
        "scenario-page": Boolean(snapshot.forecastCompleted || currentStatuses["scenario-page"] === "in_progress"),
        "results-page": Boolean(snapshot.scenarioCompleted && snapshot.forecastCompleted),
        "validation-page": Boolean(snapshot.validationReady),
        "compare-page": Boolean(snapshot.resultsCompleted && snapshot.compareReadyCount >= 1)
      },
      completedMap: {
        "create-page": Boolean(snapshot.createCompleted),
        "energy-page": Boolean(snapshot.energyCompleted),
        "rough-page": Boolean(snapshot.roughCompleted),
        "history-page": Boolean(snapshot.historyCompleted),
        "forecast-page": Boolean(snapshot.forecastCompleted),
        "scenario-page": Boolean(snapshot.scenarioCompleted),
        "results-page": Boolean(snapshot.resultsCompleted),
        "validation-page": Boolean(snapshot.validationCompleted),
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
      if ((pageId === "results-page" && snapshot.resultsStale) || (pageId === "validation-page" && snapshot.validationStale)) {
        statuses[pageId] = "stale";
        continue;
      }
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
    buildCompletionSnapshot,
    DEFAULT_WORKFLOW_PAGES,
    statusMapTemplate,
    sanitizeStatuses,
    reconcileStatuses,
    markDownstreamStale,
    statusText
  });
});
