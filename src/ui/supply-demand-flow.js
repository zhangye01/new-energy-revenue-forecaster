"use strict";

(function (root, factory) {
  const api = factory(
    typeof module !== "undefined" && module.exports ? require("../domain/supply-demand") : root.NE_SUPPLY_DEMAND,
    typeof module !== "undefined" && module.exports ? require("../domain/price-forecast") : root.NE_PRICE_FORECAST,
    () => root.NE_SUPPLY_DEMAND_WORKSPACE
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_SUPPLY_DEMAND_FLOW = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (domain, forecast, getWorkspace) {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const object = (value) => value && typeof value === "object" && !Array.isArray(value);

  function create(options) {
    let controller = null;
    let cached = null;
    const message = (text) => options.onMessage?.(text);

    function invalidate(project) {
      if (!project.activeRunId) return false;
      project.activeRunId = null;
      options.onInvalidate?.(project);
      return true;
    }

    function validateSupplyDemandRun(project, run) {
      const errors = domain.savedBoundaryErrors(project);
      if (errors.length) return { ok: false, errors };
      return forecast.validateSupplyDemandRun(project, run);
    }

    function reconcile(project) {
      const run = project?.priceRuns?.find((item) => item.id === project.activeRunId);
      if (run && !validateSupplyDemandRun(project, run).ok) return invalidate(project);
      return false;
    }

    function hydrate(project, rawProject) {
      if (object(rawProject.supplyDemand)) project.supplyDemand = clone(rawProject.supplyDemand);
      reconcile(project);
    }

    function hasPendingDraft(project) {
      const state = project?.supplyDemand;
      return Boolean(state?.draft && (!state.config || domain.fingerprint(project, state.draft) !== domain.fingerprint(project, state.config)));
    }

    function inspectSupplyDemand(project) {
      if (controller?.hasUnsavedChanges?.(project) || hasPendingDraft(project)) {
        return { ok: false, errors: ["供需输入待确认。请先保存并生成小时数据，或放弃草稿。"] };
      }
      const config = project?.supplyDemand?.config;
      const boundaryErrors = domain.savedBoundaryErrors(project);
      if (boundaryErrors.length) return { ok: false, errors: boundaryErrors };
      if (project && config == null) return { ok: false, errors: ["请先填写供需参数并生成数据。"] };
      const errors = domain.validateConfig(project, config);
      if (errors.length) return { ok: false, errors };
      return { ok: true, config, fingerprint: domain.fingerprint(project, config) };
    }

    function prepareSupplyDemand(project) {
      const input = inspectSupplyDemand(project);
      if (!input.ok) return input;
      const { config, fingerprint } = input;
      if (!cached || cached.fingerprint !== fingerprint) cached = domain.buildDataset(project, config);
      return { ok: cached.ok, errors: cached.errors, dataset: cached, config };
    }

    function commit(project, nextState, change = {}) {
      if (!project || project !== options.getProject()) {
        message("项目已切换，未保存供需输入。请在当前项目重新核对。");
        return false;
      }
      if (!object(nextState)) return false;
      const next = clone(nextState);
      if (change.generated) {
        const errors = domain.validateConfig(project, next.config);
        if (errors.length) { message(errors[0]); return false; }
        next.inputFingerprint = domain.fingerprint(project, next.config);
        next.generatedProvince = project.province ?? null;
        delete next.requiresProvinceReview;
      }
      project.supplyDemand = next;
      cached = null;
      reconcile(project);
      options.onPersist?.();
      // The workspace finishes its local save state before the app repaints.
      options.onRender?.();
      return true;
    }

    function render() {
      const root = options.documentRef?.querySelector?.("#supply-demand-root");
      if (!root) return;
      if (!controller) {
        const workspace = options.workspace || getWorkspace();
        controller = workspace.createController({ root, getProject: options.getProject,
          onCommit: commit, downloadCsv: options.downloadCsv, onDraftChange: options.onDraftChange });
      }
      controller.render();
    }

    return { render, disposeChart: () => controller?.disposeChart?.(), hydrate, reconcile, inspectSupplyDemand, prepareSupplyDemand, validateSupplyDemandRun, hasPendingDraft,
      hasUnsavedChanges: () => Boolean(controller?.hasUnsavedChanges?.()) };
  }

  return { create };
});
