"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_PROJECT_SETTINGS = api;
  if (root.window && root.window !== root) {
    root.window.NE_PROJECT_SETTINGS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const MAP_LEVEL_SET = new Set(["nation", "province"]);
  const BENCHMARK_MAP_ZOOM_MIN = 0.8;
  const BENCHMARK_MAP_ZOOM_MAX = 4;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function createEmptyHistorySpotImport() {
    return {
      sourceType: "mock",
      importedAt: "",
      sourceName: "",
      dataset: null
    };
  }

  function createDefaultSpotMarketConfig(activeRun = null) {
    return {
      energyBasis: "settlement_generation_hourly",
      priceSourceMode: "active_forecast_run",
      captureMethod: "generation_weighted_spot",
      settlementGranularity: "hourly",
      linkedRunId: activeRun?.id || "",
      note: "",
      savedAt: ""
    };
  }

  function isHistoryDatasetUsable(dataset) {
    return Boolean(
      isPlainObject(dataset)
      && Array.isArray(dataset.years)
      && dataset.years.length
    );
  }

  function sanitizeHistorySpotImport(rawImport) {
    const normalized = createEmptyHistorySpotImport();
    if (!isPlainObject(rawImport)) return normalized;
    if (rawImport.sourceType === "csv" && isHistoryDatasetUsable(rawImport.dataset)) {
      normalized.sourceType = "csv";
      normalized.dataset = rawImport.dataset;
      normalized.importedAt = typeof rawImport.importedAt === "string" ? rawImport.importedAt : "";
      normalized.sourceName = typeof rawImport.sourceName === "string" ? rawImport.sourceName : "";
    }
    return normalized;
  }

  function sanitizeSpotMarketConfig(rawConfig, activeRun = null) {
    const defaults = createDefaultSpotMarketConfig(activeRun);
    const config = isPlainObject(rawConfig) ? rawConfig : {};
    return {
      energyBasis: config.energyBasis === "settlement_generation_hourly" ? config.energyBasis : defaults.energyBasis,
      priceSourceMode: config.priceSourceMode === "active_forecast_run" ? config.priceSourceMode : defaults.priceSourceMode,
      captureMethod: config.captureMethod === "generation_weighted_spot" ? config.captureMethod : defaults.captureMethod,
      settlementGranularity: config.settlementGranularity === "hourly" ? config.settlementGranularity : defaults.settlementGranularity,
      linkedRunId: typeof config.linkedRunId === "string" ? config.linkedRunId : defaults.linkedRunId,
      note: typeof config.note === "string" ? config.note : "",
      savedAt: typeof config.savedAt === "string" ? config.savedAt : ""
    };
  }

  function sanitizePolicyFilters(raw, options = {}) {
    const provinceKeys = new Set(Array.isArray(options.provinceKeys) ? options.provinceKeys : []);
    const regionKeys = new Set(Array.isArray(options.regionKeys) ? options.regionKeys : []);
    const defaults = {
      provinceKey: "shanghai",
      regionKey: "east"
    };
    if (!isPlainObject(raw)) return defaults;
    const next = { ...defaults };
    const provinceKey = String(raw.provinceKey || "all");
    if (provinceKey === "all" || provinceKeys.has(provinceKey)) {
      next.provinceKey = provinceKey;
    }
    const regionKey = String(raw.regionKey || "all");
    if (regionKey === "all" || regionKeys.has(regionKey)) {
      next.regionKey = regionKey;
    }
    return next;
  }

  function isIsoDateString(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function sanitizeHistoryAnalysis(raw) {
    const defaults = {
      startDate: "",
      endDate: ""
    };
    if (!isPlainObject(raw)) return defaults;
    return {
      startDate: isIsoDateString(raw.startDate) ? raw.startDate : "",
      endDate: isIsoDateString(raw.endDate) ? raw.endDate : ""
    };
  }

  function sanitizeBenchmarkMap(raw, options = {}) {
    const provinceKeys = new Set(Array.isArray(options.provinceKeys) ? options.provinceKeys : []);
    const zoomMin = Number.isFinite(Number(options.zoomMin)) ? Number(options.zoomMin) : BENCHMARK_MAP_ZOOM_MIN;
    const zoomMax = Number.isFinite(Number(options.zoomMax)) ? Number(options.zoomMax) : BENCHMARK_MAP_ZOOM_MAX;
    const defaults = {
      level: "nation",
      provinceKey: null,
      zoom: null,
      rangeMin: null,
      rangeMax: null
    };
    if (!isPlainObject(raw)) return defaults;
    const next = { ...defaults };
    if (MAP_LEVEL_SET.has(raw.level)) {
      next.level = raw.level;
    }
    if (typeof raw.provinceKey === "string" && provinceKeys.has(raw.provinceKey)) {
      next.provinceKey = raw.provinceKey;
    }
    if (next.level === "nation") {
      next.provinceKey = null;
    }
    if (next.level === "province" && !next.provinceKey) {
      next.level = "nation";
    }
    const zoom = Number(raw.zoom);
    if (Number.isFinite(zoom)) {
      next.zoom = clamp(zoom, zoomMin, zoomMax);
    }
    const rangeMin = Number(raw.rangeMin);
    const rangeMax = Number(raw.rangeMax);
    if (Number.isFinite(rangeMin)) {
      next.rangeMin = rangeMin;
    }
    if (Number.isFinite(rangeMax)) {
      next.rangeMax = rangeMax;
    }
    if (Number.isFinite(next.rangeMin) && Number.isFinite(next.rangeMax) && next.rangeMin > next.rangeMax) {
      const swap = next.rangeMin;
      next.rangeMin = next.rangeMax;
      next.rangeMax = swap;
    }
    return next;
  }

  return Object.freeze({
    createEmptyHistorySpotImport,
    createDefaultSpotMarketConfig,
    isHistoryDatasetUsable,
    sanitizeHistorySpotImport,
    sanitizeSpotMarketConfig,
    sanitizePolicyFilters,
    isIsoDateString,
    sanitizeHistoryAnalysis,
    sanitizeBenchmarkMap
  });
});
