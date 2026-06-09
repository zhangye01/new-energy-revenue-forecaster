"use strict";

const assert = require("node:assert/strict");
const {
  FORECAST_MODEL_DEFINITIONS,
  getHistoryMockShapeFactors,
  hourlyPricesFromQuarterPrices,
  buildForecastPriceSeries,
  countForecastPriceMissing,
  createForecastRunForModel
} = require("../src/domain/price-forecast");

function createProject(overrides = {}) {
  return {
    id: "forecast-project",
    province: "jiangsu",
    assetType: "photovoltaic",
    siteType: "onshore",
    hasStorage: true,
    storagePowerMw: 20,
    storageDurationH: 2,
    capacityMw: 100,
    startYear: 2026,
    forecastYears: 2,
    ...overrides
  };
}

const project = createProject();
const ensemble = FORECAST_MODEL_DEFINITIONS.find((model) => model.family === "ensemble");
assert.ok(ensemble, "应存在融合模型定义");

const factors = getHistoryMockShapeFactors(project);
assert.ok(factors.storageScale > 0);
assert.ok(factors.noiseAmplitude > 0);

assert.deepEqual(hourlyPricesFromQuarterPrices([1, 2, 3]), []);
const flatQuarterPrices = Array.from({ length: 35040 }, () => 100);
const hourly = hourlyPricesFromQuarterPrices(flatQuarterPrices);
assert.equal(hourly.length, 8760);
assert.ok(hourly.every((value) => value === 100));

const series = buildForecastPriceSeries(project, ensemble, 2300, 0.01, {
  provinceBenchmarks: { jiangsu: { historyPrice: 365 } }
});
assert.equal(series.quarterPricesByYear[2026].length, 35040);
assert.equal(series.quarterPricesByYear[2027].length, 35040);
assert.equal(series.pricesByYear[2026].length, 8760);
assert.equal(series.pricesByYear[2027].length, 8760);
assert.ok(series.quarterPricesByYear[2026].every((value) => Number.isFinite(value) && value >= -150 && value <= 950));

const run = createForecastRunForModel(project, ensemble, {
  id: "run-test",
  createdAt: "2026-06-09T00:00:00.000Z",
  algorithmVersion: "1.0.0",
  featureVersion: "1.0.0",
  dataSnapshotId: "snapshot-test",
  trainStart: 2018,
  trainEnd: 2025,
  seed: 2027,
  growth: 0.01,
  provinceBenchmarks: { jiangsu: { historyPrice: 365 } },
  qualityGate: {
    hard: { mape: 0.15, smape: 0.18, missingPoints: 0 },
    soft: { mae: 55, rmse: 80 }
  }
});

assert.equal(run.id, "run-test");
assert.equal(run.algorithmFamily, "ensemble");
assert.equal(run.granularityMinutes, 15);
assert.equal(run.pointsPerYear, 35040);
assert.equal(run.missingPoints, 0);
assert.ok(["publishable", "publishable_warn", "validated"].includes(run.status));
assert.equal(countForecastPriceMissing(project, run), 0);

const incompleteRun = {
  pricesByYear: { 2026: Array.from({ length: 8760 }, () => 100) },
  quarterPricesByYear: {},
  granularityMinutes: 15
};
assert.equal(countForecastPriceMissing(project, incompleteRun), 8760 + 35040 + 35040);

console.log("price forecast tests passed");
