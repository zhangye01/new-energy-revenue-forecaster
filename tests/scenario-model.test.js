"use strict";

const assert = require("node:assert/strict");
const {
  defaultScenarioConfig,
  normalizeLtConvergeStep,
  sanitizeScenario
} = require("../src/domain/scenario-model");

const provinceDefaults = {
  mechanismEnabled: true,
  mechanismRatio: 0.36,
  mechanismPrice: 365,
  greenCertPrice: 22,
  greenPremiumPrice: 12,
  marketOpFee: 6,
  gridAssessFee: 7,
  ancillaryFee: 14,
  otherFee: 3,
  storageArbitragePrice: 18,
  storageCapacityCompPrice: 7,
  storageAncillaryRevenuePrice: 10,
  storageOtherRevenuePrice: 4
};

const offshoreStorageProject = {
  startYear: 2026,
  forecastYears: 3,
  siteType: "offshore",
  hasStorage: true
};

const defaultConfig = defaultScenarioConfig(offshoreStorageProject, {
  provinceDefaults,
  currentYear: 2026
});
assert.equal(defaultConfig.mechanismStartYm, "2026-01");
assert.equal(defaultConfig.mechanismEndYm, "2028-12");
assert.equal(defaultConfig.carbonEnabled, true);
assert.equal(defaultConfig.storageArbitragePrice, 18);

const fallbackConfig = defaultScenarioConfig({
  startYear: 2024,
  forecastYears: 30,
  siteType: "onshore",
  hasStorage: false
}, {
  provinceDefaults,
  currentYear: 2024
});
assert.equal(fallbackConfig.mechanismStartYm, "2026-01");
assert.equal(fallbackConfig.mechanismEndYm, "2029-12");
assert.equal(fallbackConfig.carbonEnabled, false);
assert.equal(fallbackConfig.storageCapacityCompPrice, 0);

assert.equal(normalizeLtConvergeStep(0.5, 8, 2, 2, false), 3);
assert.equal(normalizeLtConvergeStep(0.5, 8, 2, 2, true), 0.5);
assert.equal(normalizeLtConvergeStep(-1, 8, 2, 2, false), 2);

const sanitized = sanitizeScenario({
  startYear: 2026,
  forecastYears: 3,
  siteType: "onshore",
  hasStorage: false
}, {
  name: "  乐观场景  ",
  isBaseline: true,
  locked: true,
  config: {
    mechanismRatio: 1.2,
    mechanismPrice: "bad",
    ltPricingMode: "manual",
    ltManualPricesByYear: {
      2025: 99,
      2026: 8,
      2027: 6,
      2028: 2
    },
    ltYear1Pnl: 8,
    ltTargetPnl: 2,
    ltConvergeSpeed: 0.5,
    envValueMode: "bad",
    carbonEnabled: true,
    carbonPrice: 4,
    carbonRealizeRatio: 0.8,
    feeConfigMode: "manual",
    feeManualValuesByYear: {
      2026: { marketOpFee: 1 },
      2027: { marketOpFee: -1 },
      2028: { marketOpFee: 2 }
    },
    storageArbitragePrice: 99
  }
}, 1, {
  provinceDefaults,
  currentYear: 2026,
  nowIso: "2026-06-09T00:00:00.000Z",
  makeId: (prefix) => `${prefix}-test`
});

assert.equal(sanitized.id, "scn-test");
assert.equal(sanitized.name, "乐观场景");
assert.equal(sanitized.isBaseline, true);
assert.equal(sanitized.locked, true);
assert.equal(sanitized.updatedAt, "2026-06-09T00:00:00.000Z");
assert.equal(sanitized.config.mechanismRatio, 1);
assert.equal(sanitized.config.mechanismPrice, 365);
assert.equal(sanitized.config.ltPricingMode, "manual");
assert.deepEqual(sanitized.config.ltManualPricesByYear, { 2026: 8, 2027: 6, 2028: 2 });
assert.equal(sanitized.config.ltConvergeSpeed, 3);
assert.equal(sanitized.config.envValueMode, "global");
assert.equal(sanitized.config.carbonEnabled, false);
assert.equal(sanitized.config.carbonPrice, 0);
assert.equal(sanitized.config.feeConfigMode, "manual");
assert.deepEqual(Object.keys(sanitized.config.feeManualValuesByYear), ["2026", "2028"]);
assert.equal(sanitized.config.storageArbitragePrice, 0);

console.log("scenario model tests passed");
