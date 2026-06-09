"use strict";

const assert = require("node:assert/strict");
const {
  createEmptyHistorySpotImport,
  createDefaultSpotMarketConfig,
  isHistoryDatasetUsable,
  sanitizeHistorySpotImport,
  sanitizeSpotMarketConfig,
  sanitizePolicyFilters,
  isIsoDateString,
  sanitizeHistoryAnalysis,
  sanitizeBenchmarkMap
} = require("../src/domain/project-settings");

assert.deepEqual(createEmptyHistorySpotImport(), {
  sourceType: "mock",
  importedAt: "",
  sourceName: "",
  dataset: null
});
assert.equal(isHistoryDatasetUsable({ years: [{ year: 2024, values: [] }] }), true);
assert.equal(isHistoryDatasetUsable({ years: [] }), false);
assert.deepEqual(sanitizeHistorySpotImport({
  sourceType: "csv",
  importedAt: "2026-06-09",
  sourceName: "sample.csv",
  dataset: { years: [{ year: 2024, values: [] }] }
}), {
  sourceType: "csv",
  importedAt: "2026-06-09",
  sourceName: "sample.csv",
  dataset: { years: [{ year: 2024, values: [] }] }
});
assert.deepEqual(sanitizeHistorySpotImport({ sourceType: "csv", dataset: { years: [] } }), createEmptyHistorySpotImport());

assert.equal(createDefaultSpotMarketConfig({ id: "run-1" }).linkedRunId, "run-1");
assert.deepEqual(sanitizeSpotMarketConfig({
  energyBasis: "bad",
  priceSourceMode: "active_forecast_run",
  captureMethod: "bad",
  settlementGranularity: "hourly",
  linkedRunId: 123,
  note: "ok",
  savedAt: "time"
}, { id: "run-2" }), {
  energyBasis: "settlement_generation_hourly",
  priceSourceMode: "active_forecast_run",
  captureMethod: "generation_weighted_spot",
  settlementGranularity: "hourly",
  linkedRunId: "run-2",
  note: "ok",
  savedAt: "time"
});

const filterOptions = {
  provinceKeys: ["jiangsu", "shanghai"],
  regionKeys: ["east", "north"]
};
assert.deepEqual(sanitizePolicyFilters({ provinceKey: "jiangsu", regionKey: "north" }, filterOptions), {
  provinceKey: "jiangsu",
  regionKey: "north"
});
assert.deepEqual(sanitizePolicyFilters({ provinceKey: "bad", regionKey: "bad" }, filterOptions), {
  provinceKey: "shanghai",
  regionKey: "east"
});
assert.deepEqual(sanitizePolicyFilters({ provinceKey: "all", regionKey: "all" }, filterOptions), {
  provinceKey: "all",
  regionKey: "all"
});

assert.equal(isIsoDateString("2026-06-09"), true);
assert.equal(isIsoDateString("2026-6-9"), false);
assert.deepEqual(sanitizeHistoryAnalysis({ startDate: "2026-06-09", endDate: "bad" }), {
  startDate: "2026-06-09",
  endDate: ""
});

assert.deepEqual(sanitizeBenchmarkMap({
  level: "province",
  provinceKey: "jiangsu",
  zoom: 9,
  rangeMin: 500,
  rangeMax: 120
}, {
  provinceKeys: ["jiangsu"],
  zoomMin: 0.8,
  zoomMax: 4
}), {
  level: "province",
  provinceKey: "jiangsu",
  zoom: 4,
  rangeMin: 120,
  rangeMax: 500
});
assert.deepEqual(sanitizeBenchmarkMap({
  level: "province",
  provinceKey: "bad"
}, {
  provinceKeys: ["jiangsu"]
}), {
  level: "nation",
  provinceKey: null,
  zoom: null,
  rangeMin: null,
  rangeMax: null
});

console.log("project settings tests passed");
