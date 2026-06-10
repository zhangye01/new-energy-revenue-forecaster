"use strict";

const assert = require("node:assert/strict");
const {
  applyBatchParameter,
  applyProvinceDefaultsToScenario,
  createBaselineScenario,
  defaultScenarioConfig,
  normalizeLtConvergeStep,
  normalizeScenarioMetadata,
  parseBatchValue,
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

const applyTarget = {
  config: {
    carbonEnabled: true,
    carbonPrice: 9,
    storageArbitragePrice: 99
  }
};
applyProvinceDefaultsToScenario(
  { siteType: "offshore", hasStorage: true },
  applyTarget,
  {
    provinceDefaults,
    nowIso: "2026-06-10T08:00:00.000Z"
  }
);
assert.equal(applyTarget.config.mechanismEnabled, provinceDefaults.mechanismEnabled);
assert.equal(applyTarget.config.mechanismRatio, provinceDefaults.mechanismRatio);
assert.equal(applyTarget.config.mechanismPrice, provinceDefaults.mechanismPrice);
assert.equal(applyTarget.config.marketOpFee, provinceDefaults.marketOpFee);
assert.equal(applyTarget.config.greenCertRealizeRatio, 1);
assert.equal(applyTarget.config.greenPremiumRealizeRatio, 0);
assert.equal(applyTarget.config.carbonRealizeRatio, 0);
assert.equal(applyTarget.config.storageArbitragePrice, provinceDefaults.storageArbitragePrice);
assert.equal(applyTarget.updatedAt, "2026-06-10T08:00:00.000Z");

const noStorageOnshoreTarget = { config: { carbonEnabled: true, carbonPrice: 8 } };
applyProvinceDefaultsToScenario(
  { siteType: "onshore", hasStorage: false },
  noStorageOnshoreTarget,
  {
    provinceDefaults,
    nowIso: () => "2026-06-10T09:00:00.000Z"
  }
);
assert.equal(noStorageOnshoreTarget.config.carbonEnabled, false);
assert.equal(noStorageOnshoreTarget.config.carbonPrice, 0);
assert.equal(noStorageOnshoreTarget.config.storageArbitragePrice, 0);
assert.equal(noStorageOnshoreTarget.config.storageCapacityCompPrice, 0);
assert.equal(noStorageOnshoreTarget.updatedAt, "2026-06-10T09:00:00.000Z");

const baselineScenario = createBaselineScenario(offshoreStorageProject, {
  provinceDefaults,
  currentYear: 2026,
  nowIso: "2026-06-10T00:00:00.000Z",
  makeId: (prefix) => `${prefix}-base`
});
assert.equal(baselineScenario.id, "scn-base");
assert.equal(baselineScenario.name, "基准场景");
assert.equal(baselineScenario.isBaseline, true);
assert.equal(baselineScenario.locked, false);
assert.equal(baselineScenario.config.carbonEnabled, true);
assert.equal(baselineScenario.updatedAt, "2026-06-10T00:00:00.000Z");

const metadataProject = {
  activeScenarioId: "missing",
  scenarios: [
    { id: "a", isBaseline: false },
    { id: "b", isBaseline: true },
    { id: "c", isBaseline: true, locked: true }
  ]
};
const metadata = normalizeScenarioMetadata(metadataProject);
assert.equal(metadata.baselineId, "b");
assert.equal(metadata.activeScenarioId, "a");
assert.deepEqual(
  metadataProject.scenarios.map((scenario) => [scenario.id, scenario.isBaseline, scenario.locked]),
  [
    ["a", false, false],
    ["b", true, false],
    ["c", false, true]
  ]
);

assert.equal(parseBatchValue({ type: "percent", min: 0, max: 100 }, "36"), 0.36);
assert.equal(parseBatchValue({ type: "number", min: 0, max: 100 }, "120"), 100);
assert.equal(parseBatchValue({ type: "number", min: 0, max: 100 }, "bad"), null);

const batchProject = {
  siteType: "offshore",
  scenarios: [
    {
      id: "base",
      isBaseline: true,
      locked: false,
      updatedAt: "",
      config: {
        greenCertRealizeRatio: 0.4,
        greenPremiumRealizeRatio: 0.2,
        carbonRealizeRatio: 0.1
      }
    },
    {
      id: "locked",
      isBaseline: false,
      locked: true,
      updatedAt: "",
      config: {
        greenCertRealizeRatio: 0.2,
        greenPremiumRealizeRatio: 0.2,
        carbonRealizeRatio: 0.1
      }
    },
    {
      id: "open",
      isBaseline: false,
      locked: false,
      updatedAt: "",
      config: {
        greenCertRealizeRatio: 0.2,
        greenPremiumRealizeRatio: 0.2,
        carbonRealizeRatio: 0.1
      }
    }
  ]
};
const batchResult = applyBatchParameter(batchProject, {
  key: "greenCertRealizeRatio",
  spec: { type: "percent", min: 0, max: 100 },
  rawValue: "40",
  scope: "non_baseline",
  nowIso: () => "2026-06-10T00:00:00.000Z",
  getEnvValueAllocation: (_project, config) => ({
    totalRatio: config.greenCertRealizeRatio + config.greenPremiumRealizeRatio + config.carbonRealizeRatio
  })
});
assert.equal(batchResult.ok, true);
assert.equal(batchResult.updated, 1);
assert.equal(batchResult.skippedBaseline, 1);
assert.equal(batchResult.skippedLocked, 1);
assert.equal(batchProject.scenarios[0].config.greenCertRealizeRatio, 0.4);
assert.equal(batchProject.scenarios[2].config.greenCertRealizeRatio, 0.4);
assert.equal(batchProject.scenarios[2].updatedAt, "2026-06-10T00:00:00.000Z");
assert.match(batchResult.message, /批量更新完成：1 个场景已更新/);

const skipSpaceResult = applyBatchParameter(batchProject, {
  key: "greenPremiumRealizeRatio",
  spec: { type: "percent", min: 0, max: 100 },
  rawValue: "90",
  scope: "all",
  getEnvValueAllocation: (_project, config) => ({
    totalRatio: config.greenCertRealizeRatio + config.greenPremiumRealizeRatio + config.carbonRealizeRatio
  })
});
assert.equal(skipSpaceResult.updated, 0);
assert.equal(skipSpaceResult.skippedSpace, 2);
assert.match(skipSpaceResult.message, /没有可更新的场景/);

const onshoreProject = {
  siteType: "onshore",
  scenarios: [
    {
      isBaseline: false,
      locked: false,
      updatedAt: "",
      config: {
        carbonPrice: 5,
        carbonEnabled: true,
        carbonRealizeRatio: 0.5
      }
    }
  ]
};
const carbonResult = applyBatchParameter(onshoreProject, {
  key: "carbonPrice",
  spec: { type: "number", min: 0, max: 2000 },
  rawValue: "8",
  nowIso: "fixed-time"
});
assert.equal(carbonResult.updated, 1);
assert.equal(onshoreProject.scenarios[0].config.carbonPrice, 0);
assert.equal(onshoreProject.scenarios[0].config.carbonEnabled, false);
assert.equal(onshoreProject.scenarios[0].config.carbonRealizeRatio, 0);
assert.equal(onshoreProject.scenarios[0].updatedAt, "fixed-time");

const badBatch = applyBatchParameter(batchProject, {
  key: "marketOpFee",
  spec: { type: "number", min: 0, max: 2000 },
  rawValue: "bad"
});
assert.equal(badBatch.ok, false);
assert.equal(badBatch.message, "批量参数值无效，请输入数字。");

console.log("scenario model tests passed");
