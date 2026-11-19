"use strict";

(function (root, factory) {
  const isCommonJs = typeof module !== "undefined" && module.exports;
  const api = factory(
    isCommonJs ? require("./app-utils") : root.NE_APP_UTILS,
    isCommonJs ? require("./price-forecast") : root.NE_PRICE_FORECAST
  );
  if (isCommonJs) module.exports = api;
  root.NE_RESULT_VERSIONS = api;
  if (root.window && root.window !== root) root.window.NE_RESULT_VERSIONS = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (utils, priceForecast) {
  const SCHEMA_VERSION = 1;
  const PRICE_SIGNATURE = /^price-v1-[0-9a-f]{16}$/;
  const PRICE_SOURCE_LABELS = Object.freeze({ demo: "演示现货曲线", backend: "后台现货预测", unverified: "价格来源待核对" });
  let versionSequence = 0;

  function object(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function getPriceSourceLabel(type) {
    return Object.hasOwn(PRICE_SOURCE_LABELS, type) ? PRICE_SOURCE_LABELS[type] : PRICE_SOURCE_LABELS.unverified;
  }

  function priceSourceType(run) {
    if (run?.supplyDemandInput?.featureConsumption === "not_used_by_demo_model" || run?.executionKind === "demo_model") return "demo";
    if (run?.executionKind === "real_model") return "backend";
    return "unverified";
  }

  function priceContentFingerprint(project, run) {
    if (!project || !priceForecast?.validateForecastPriceData(project, run).ok) return "";
    const words = new DataView(new ArrayBuffer(8));
    let first = 2166136261, second = 5381;
    const append = (value) => {
      // Use the stored numeric value and canonicalize -0 like JSON persistence.
      words.setFloat64(0, value === 0 ? 0 : value, true);
      const low = words.getUint32(0, true), high = words.getUint32(4, true);
      first = Math.imul(Math.imul(first ^ low, 16777619) ^ high, 16777619);
      second = Math.imul(Math.imul(second ^ high, 1597334677) ^ low, 1597334677);
    };
    append(run.granularityMinutes ?? 0);
    append(run.pointsPerYear ?? 0);
    for (let offset = 0; offset < project.forecastYears; offset += 1) {
      const year = project.startYear + offset;
      append(year);
      for (const value of run.pricesByYear[year]) append(value);
      const quarters = run.quarterPricesByYear?.[year];
      if (quarters === undefined) { append(0); continue; }
      if (!Array.isArray(quarters) || quarters.length !== 35040) return "";
      append(quarters.length);
      for (const value of quarters) {
        if (!Number.isFinite(value)) return "";
        append(value);
      }
    }
    const hex = (word) => (word >>> 0).toString(16).padStart(8, "0");
    return `price-v1-${hex(first)}${hex(second)}`;
  }

  function freezeDeep(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freezeDeep);
    return Object.freeze(value);
  }

  function makeVersionId() {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `result-${uuid}`;
    versionSequence += 1;
    return `${utils.makeId("result")}-${Date.now().toString(36)}-${versionSequence.toString(36)}`;
  }

  function stampComputedResult(project, scenario, run, result) {
    // Compatibility for callers that supply an unstamped calculation stub.
    if (result?.sourceContext?.version !== 2) return result;
    const fingerprint = priceContentFingerprint(project, run);
    if (!fingerprint || result.sourceContext.runId !== run?.id) throw new Error("电价版本不完整，请核对后重新测算。");
    const {
      id, name, province, assetType, startYear, forecastYears, capacityMw, siteType, hasStorage,
      storagePowerMw, storageDurationH, storageRoundTripEfficiency
    } = project;
    return {
      ...result,
      resultVersion: freezeDeep({
        id: makeVersionId(), schemaVersion: SCHEMA_VERSION, scenarioName: scenario.name || "当前方案", isBaseline: Boolean(scenario.isBaseline),
        project: { id, name, province, assetType, startYear, forecastYears, capacityMw, siteType, hasStorage: Boolean(hasStorage),
          storagePowerMw: storagePowerMw ?? null, storageDurationH: storageDurationH ?? null,
          ...(hasStorage && storageRoundTripEfficiency != null ? { storageRoundTripEfficiency } : {}) },
        scenarioConfig: utils.cloneData(scenario.config || {})
      }),
      priceSource: Object.freeze({ type: priceSourceType(run), runId: run.id, fingerprint })
    };
  }

  function getArchivedCalculationContext(result) {
    const version = result?.resultVersion;
    const project = version?.project;
    const source = result?.sourceContext;
    if (!object(version) || version.schemaVersion !== SCHEMA_VERSION || typeof version.id !== "string" || !version.id ||
        !object(version.scenarioConfig) || !object(project) || !project.id || project.id !== source?.projectId ||
        typeof source?.scenarioId !== "string" || !source.scenarioId || !Number.isInteger(project.startYear) ||
        !Number.isInteger(project.forecastYears) || project.forecastYears < 1 || project.forecastYears > 100 ||
        !Number.isFinite(project.capacityMw) || project.capacityMw <= 0 || typeof project.hasStorage !== "boolean" ||
        (project.hasStorage && ![project.storagePowerMw, project.storageDurationH].every((value) => Number.isFinite(value) && value > 0)) ||
        (project.storageRoundTripEfficiency !== undefined &&
          (!Number.isFinite(project.storageRoundTripEfficiency) || project.storageRoundTripEfficiency <= 0 || project.storageRoundTripEfficiency > 1))) return null;
    return { project, scenario: { id: source.scenarioId, name: version.scenarioName,
      isBaseline: version.isBaseline, config: version.scenarioConfig } };
  }

  function getResultFeeConfig(result, verifiedConfig = null) {
    return getArchivedCalculationContext(result)?.scenario.config || (result?.resultVersion ? null : verifiedConfig);
  }

  function describeResult(result, run = null) {
    const source = result?.sourceContext;
    const runId = typeof source?.runId === "string" ? source.runId : "";
    const priceSource = result?.priceSource;
    const version = result?.resultVersion;
    const stamped = runId && version?.schemaVersion === SCHEMA_VERSION && typeof version.id === "string" && version.id && priceSource?.runId === runId &&
      Object.hasOwn(PRICE_SOURCE_LABELS, priceSource?.type) && typeof priceSource?.fingerprint === "string" && PRICE_SIGNATURE.test(priceSource.fingerprint);
    const type = stamped ? priceSource.type : runId && run?.id === runId ? priceSourceType(run) : "unverified";
    return {
      versionId: stamped ? version.id : "",
      generatedAt: typeof source?.generatedAt === "string" ? source.generatedAt : "",
      runId, priceSourceType: type, priceSourceLabel: getPriceSourceLabel(type),
      priceContentFingerprint: stamped ? priceSource.fingerprint : ""
    };
  }

  function matchesSavedPriceSource(project, result) {
    if (!result?.resultVersion && !result?.priceSource) return true;
    const source = describeResult(result);
    const context = getArchivedCalculationContext(result);
    const run = project?.priceRuns?.find((item) => item?.id === source.runId);
    return Boolean(context && source.versionId && source.priceContentFingerprint && run && source.priceSourceType === priceSourceType(run) &&
      source.priceContentFingerprint === priceContentFingerprint(context.project, run));
  }

  function restoreResultHistory(raw) {
    if (!object(raw)) return undefined;
    return Object.fromEntries(Object.entries(raw).filter(([, entries]) => Array.isArray(entries))
      .map(([scenarioId, entries]) => [scenarioId, freezeDeep(utils.cloneData(entries))]));
  }

  function archivePreviousResult(project, scenarioId, previous) {
    if (!object(previous) || !Array.isArray(previous.annualRows) || !previous.annualRows.length) return;
    const snapshot = freezeDeep(utils.cloneData(previous));
    project.resultHistoryByScenario ||= {};
    const existing = Object.hasOwn(project.resultHistoryByScenario, scenarioId) && project.resultHistoryByScenario[scenarioId];
    Object.defineProperty(project.resultHistoryByScenario, scenarioId, {
      value: Object.freeze([...(Array.isArray(existing) ? existing : []), snapshot]), enumerable: true, configurable: true, writable: true
    });
  }

  function listArchivedResults(project, scenarioId) {
    const archive = project?.resultHistoryByScenario;
    const stored = archive && Object.hasOwn(archive, scenarioId) ? archive[scenarioId] : null;
    if (!Array.isArray(stored)) return [];
    return stored.map((result, index) => ({ key: `archive-${index + 1}`, result }))
      .filter(({ result }) => object(result) && Array.isArray(result.annualRows) && result.annualRows.length).reverse();
  }

  return Object.freeze({ archivePreviousResult, describeResult, getArchivedCalculationContext, getResultFeeConfig, getPriceSourceLabel, listArchivedResults,
    matchesSavedPriceSource, priceContentFingerprint, restoreResultHistory, stampComputedResult });
});
