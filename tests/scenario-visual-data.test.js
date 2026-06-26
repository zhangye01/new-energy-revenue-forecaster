"use strict";

const assert = require("node:assert/strict");
const {
  buildScenarioVisualMessage,
  buildScenarioVisualRows,
  buildScenarioVisualViewModel,
  getScenarioVisualEnergyMwh,
  getScenarioVisualYears
} = require("../src/ui/scenario-visual-data");

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
assert.deepEqual(getScenarioVisualYears({ startYear: 2026, forecastYears: 3 }, clamp), [2026, 2027, 2028]);
assert.deepEqual(getScenarioVisualYears({ startYear: 2026, forecastYears: 99 }, clamp).slice(-1), [2055]);
assert.equal(getScenarioVisualEnergyMwh({ capacityMw: 10 }, 2026, { annualSummary: { 2026: { annualHours: 2000 } } }), 20000);
assert.equal(getScenarioVisualEnergyMwh({ capacityMw: 10 }, 2026, { annualInputByYear: { 2026: 1800 } }), 18000);
assert.equal(getScenarioVisualEnergyMwh({ capacityMw: 10 }, 2026, { hourlyByYear: { 2026: Array.from({ length: 8760 }, () => 1) } }), 87600);

const project = {
  startYear: 2026,
  forecastYears: 2,
  capacityMw: 100,
  hasStorage: true,
  resultsByScenario: {
    s1: {
      annualRows: [
        { year: 2026, energyMwh: 1000, mechanismRatio: 0.36, nonMechanismEnergy: 640 }
      ]
    }
  }
};
const scenario = {
  id: "s1",
  name: "基准场景",
  config: {
    mechanismEnabled: true,
    mechanismRatio: 0.5,
    mechanismPrice: 365,
    mechanismStartYm: "2026-01",
    mechanismEndYm: "2026-12",
    storageArbitragePrice: 18,
    storageCapacityCompPrice: 7,
    storageAncillaryRevenuePrice: 10,
    storageOtherRevenuePrice: 3
  }
};
const rows = buildScenarioVisualRows({
  project,
  scenario,
  energyData: { annualSummary: { 2027: { energyMwh: 2000 } } },
  clamp,
  mechanismActiveMonthsForYear: (year) => (year === 2026 ? 12 : 0),
  tradeStrategyPnlPriceForYear: (_cfg, index) => (index === 1 ? 8 : 2),
  getEnvValueAllocation: () => ({
    totalRatio: 0.75,
    greenCertRatio: 0.4,
    greenPremiumRatio: 0.2,
    carbonRatio: 0.15,
    unitValuePerMarketMwh: 12.8
  }),
  getFeeConfigForYear: () => ({
    marketOpFee: 6,
    gridAssessFee: 7,
    ancillaryFee: 14,
    otherFee: 3,
    otherIncome: 2
  })
});

assert.equal(rows.length, 2);
assert.equal(rows[0].energyMwh, 1000);
assert.equal(rows[0].marketEnergy, 640);
assert.equal(rows[0].mechanismEnergy, 360);
assert.equal(rows[0].greenCertEnergy, 256);
assert.equal(rows[0].unredeemedMarketEnergy, 160);
assert.equal(rows[0].storageSupplementPerMwh, 38);
assert.equal(rows[0].feeTotal, 30);
assert.equal(rows[0].netImpact, 0.64 * 8 + 0.64 * 12.8 + 38 + 2 - 30);
assert.equal(rows[1].energyMwh, 2000);
assert.equal(rows[1].mechanismActive, false);

assert.deepEqual(
  buildScenarioVisualViewModel(),
  { ok: false, message: "请选择项目后查看参数结构。", rows: [] }
);
assert.deepEqual(
  buildScenarioVisualViewModel({ project }),
  { ok: false, message: "请选择方案后查看参数结构。", rows: [] }
);
assert.equal(
  buildScenarioVisualMessage({
    project: { province: "jiangsu", assetType: "wind", siteType: "offshore", hasStorage: true },
    scenario,
    getProvinceName: () => "江苏",
    getAssetTypeLabel: () => "风电",
    getSiteTypeLabel: () => "海上",
    getStorageConfigText: () => "配储"
  }),
  "当前展示：基准场景 | 江苏 / 风电 / 海上 / 配储"
);
const inactiveView = buildScenarioVisualViewModel({
  project,
  scenario,
  includeRows: false,
  getProvinceName: () => "江苏",
  getAssetTypeLabel: () => "风电",
  getSiteTypeLabel: () => "海上",
  getStorageConfigText: () => "配储"
});
assert.equal(inactiveView.ok, true);
assert.equal(inactiveView.rows.length, 0);
assert.equal(inactiveView.message, "当前展示：基准场景 | 江苏 / 风电 / 海上 / 配储");

const activeView = buildScenarioVisualViewModel({
  project,
  scenario,
  includeRows: true,
  energyData: { annualSummary: { 2027: { energyMwh: 2000 } } },
  clamp,
  getProvinceName: () => "江苏",
  getAssetTypeLabel: () => "风电",
  getSiteTypeLabel: () => "海上",
  getStorageConfigText: () => "配储",
  mechanismActiveMonthsForYear: (year) => (year === 2026 ? 12 : 0),
  tradeStrategyPnlPriceForYear: (_cfg, index) => (index === 1 ? 8 : 2),
  getEnvValueAllocation: () => ({
    totalRatio: 0.75,
    greenCertRatio: 0.4,
    greenPremiumRatio: 0.2,
    carbonRatio: 0.15,
    unitValuePerMarketMwh: 12.8
  }),
  getFeeConfigForYear: () => ({
    marketOpFee: 6,
    gridAssessFee: 7,
    ancillaryFee: 14,
    otherFee: 3,
    otherIncome: 2
  })
});
assert.equal(activeView.ok, true);
assert.equal(activeView.rows.length, 2);
assert.equal(activeView.rows[0].marketEnergy, 640);

console.log("scenario visual data tests passed");
