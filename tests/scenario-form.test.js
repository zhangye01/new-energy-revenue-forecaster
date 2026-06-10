"use strict";

const assert = require("node:assert/strict");
const scenarioConfig = require("../src/domain/scenario-config");
const {
  buildScenarioSaveDraft,
  buildScenarioConfigFromForm,
  loadScenarioToForm
} = require("../src/ui/scenario-form");

function makeFields(initial = {}) {
  const fields = new Map();
  Object.entries(initial).forEach(([selector, value]) => {
    fields.set(selector, { value });
  });
  return {
    fields,
    querySelector(selector) {
      if (!fields.has(selector)) fields.set(selector, { value: "" });
      return fields.get(selector);
    }
  };
}

const loadHarness = makeFields();
const loadRefs = {
  ltPricingMode: { value: "" },
  envValueMode: { value: "" },
  feeConfigMode: { value: "" },
  storageArbitragePrice: { value: "" },
  storageCapacityCompPrice: { value: "" },
  storageAncillaryRevenuePrice: { value: "" },
  storageOtherRevenuePrice: { value: "" }
};

loadScenarioToForm({
  refs: loadRefs,
  querySelector: loadHarness.querySelector,
  asNum: (value, digits) => Number(value || 0).toFixed(digits),
  modes: {
    ltPricingMode: "manual",
    envValueMode: "global",
    feeConfigMode: "manual"
  },
  scenario: {
    name: "基准场景",
    config: {
      mechanismEnabled: true,
      mechanismRatio: 0.36,
      mechanismPrice: 365,
      mechanismStartYm: "2026-01",
      mechanismEndYm: "2029-12",
      ltYear1Pnl: 8,
      ltTargetPnl: 2,
      ltConvergeSpeed: 1.2,
      greenCertPrice: 22,
      greenCertRealizeRatio: 0.4,
      greenPremiumPrice: 12,
      greenPremiumRealizeRatio: 0.2,
      carbonEnabled: true,
      carbonPrice: 4,
      carbonRealizeRatio: 0.4,
      marketOpFee: 6,
      gridAssessFee: 7,
      ancillaryFee: 14,
      otherFee: 3,
      otherIncome: 2,
      storageArbitragePrice: 18,
      storageCapacityCompPrice: 7,
      storageAncillaryRevenuePrice: 10,
      storageOtherRevenuePrice: 3
    }
  }
});

assert.equal(loadHarness.fields.get("#scenario-name").value, "基准场景");
assert.equal(loadHarness.fields.get("#mechanism-enabled").value, "yes");
assert.equal(loadHarness.fields.get("#mechanism-ratio").value, "36.0");
assert.equal(loadHarness.fields.get("#green-cert-realize-ratio").value, "40.0");
assert.equal(loadHarness.fields.get("#carbon-realize-ratio").value, "40.0");
assert.equal(loadRefs.ltPricingMode.value, "manual");
assert.equal(loadRefs.feeConfigMode.value, "manual");
assert.equal(loadRefs.storageArbitragePrice.value, 18);

const saveHarness = makeFields({
  "#mechanism-enabled": "yes",
  "#mechanism-ratio": "120",
  "#mechanism-price": "365",
  "#mechanism-start-ym": "2026-01",
  "#mechanism-end-ym": "2029-12",
  "#lt-year1-pnl": "8",
  "#lt-target-pnl": "2",
  "#lt-converge-speed": "1.2",
  "#green-cert-price": "22",
  "#green-premium-price": "12",
  "#carbon-enabled": "yes",
  "#carbon-price": "4",
  "#market-op-fee": "6",
  "#grid-assess-fee": "7",
  "#ancillary-fee": "14",
  "#other-fee": "3",
  "#other-income": "2"
});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const config = buildScenarioConfigFromForm({
  project: { siteType: "offshore", hasStorage: true },
  refs: {
    storageArbitragePrice: { value: "18" },
    storageCapacityCompPrice: { value: "7" },
    storageAncillaryRevenuePrice: { value: "10" },
    storageOtherRevenuePrice: { value: "3" }
  },
  querySelector: saveHarness.querySelector,
  clamp,
  ltPricingMode: "manual",
  ltManualPricesByYear: { 2026: 8 },
  envValueMode: "global",
  envManualValuesByYear: {},
  envAllocationDraft: {
    greenCertRatio: 0.4,
    greenPremiumRatio: 0.2,
    carbonRatio: 0.4
  },
  feeConfigMode: "manual",
  feeManualValuesByYear: { 2026: { marketOpFee: 6 } }
});

assert.equal(config.mechanismEnabled, true);
assert.equal(config.mechanismRatio, 1);
assert.equal(config.ltConvergeSpeedUnit, "fixed_step");
assert.equal(config.greenCertRealizeRatio, 0.4);
assert.equal(config.greenPremiumRealizeRatio, 0.2);
assert.equal(config.carbonEnabled, true);
assert.equal(config.carbonRealizeRatio, 0.4);
assert.equal(config.storageArbitragePrice, 18);
assert.deepEqual(config.ltManualPricesByYear, { 2026: 8 });
assert.deepEqual(config.feeManualValuesByYear, { 2026: { marketOpFee: 6 } });

const inlandConfig = buildScenarioConfigFromForm({
  project: { siteType: "onshore", hasStorage: false },
  querySelector: saveHarness.querySelector,
  clamp,
  envAllocationDraft: {},
  refs: {}
});
assert.equal(inlandConfig.carbonEnabled, false);
assert.equal(inlandConfig.carbonPrice, 0);
assert.equal(inlandConfig.carbonRealizeRatio, 0);
assert.equal(inlandConfig.storageArbitragePrice, 0);
assert.equal(inlandConfig.greenCertRealizeRatio, 0);

const saveProject = {
  siteType: "offshore",
  hasStorage: true,
  startYear: 2026,
  forecastYears: 2,
  scenarios: [
    { id: "base", name: "基准场景" },
    { id: "other", name: "乐观场景" }
  ]
};
const saveScenario = {
  id: "base",
  name: "基准场景",
  locked: false,
  config: {
    ltManualPricesByYear: { 2026: 8, 2027: 6 },
    envManualValuesByYear: {},
    feeManualValuesByYear: { 2026: { marketOpFee: 1 }, 2027: { marketOpFee: 1 } }
  }
};
const saveDraft = buildScenarioSaveDraft({
  project: saveProject,
  scenario: saveScenario,
  refs: {
    ltPricingMode: { value: "manual" },
    envValueMode: { value: "global" },
    feeConfigMode: { value: "manual" },
    storageArbitragePrice: { value: "18" },
    storageCapacityCompPrice: { value: "7" },
    storageAncillaryRevenuePrice: { value: "10" },
    storageOtherRevenuePrice: { value: "3" }
  },
  querySelector: makeFields({
    "#scenario-name": "基准场景",
    "#mechanism-enabled": "yes",
    "#mechanism-ratio": "36",
    "#mechanism-price": "365",
    "#mechanism-start-ym": "2026-01",
    "#mechanism-end-ym": "2027-12",
    "#lt-year1-pnl": "8",
    "#lt-target-pnl": "2",
    "#lt-converge-speed": "1.2",
    "#green-cert-price": "22",
    "#green-premium-price": "12",
    "#carbon-enabled": "yes",
    "#carbon-price": "4",
    "#market-op-fee": "6",
    "#grid-assess-fee": "7",
    "#ancillary-fee": "14",
    "#other-fee": "3",
    "#other-income": "2"
  }).querySelector,
  clamp,
  monthSerial: (ym) => {
    const match = String(ym).match(/^(\d{4})-(\d{2})$/);
    return match ? Number(match[1]) * 12 + Number(match[2]) : null;
  },
  scenarioConfig,
  readEnvValueAllocationDraft: () => ({
    greenCertRatio: 0.4,
    greenPremiumRatio: 0.2,
    carbonRatio: 0.4,
    totalRatio: 1
  })
});
assert.equal(saveDraft.ok, true);
assert.equal(saveDraft.scenarioName, "基准场景");
assert.equal(saveDraft.config.ltPricingMode, "manual");
assert.deepEqual(saveDraft.config.ltManualPricesByYear, { 2026: 8, 2027: 6 });
assert.equal(saveDraft.config.feeConfigMode, "manual");

const duplicateDraft = buildScenarioSaveDraft({
  project: saveProject,
  scenario: saveScenario,
  querySelector: makeFields({ "#scenario-name": "乐观场景" }).querySelector
});
assert.equal(duplicateDraft.ok, false);
assert.equal(duplicateDraft.message, "场景名称重复，请修改后再保存。");

const invalidEnvDraft = buildScenarioSaveDraft({
  project: saveProject,
  scenario: saveScenario,
  refs: {
    ltPricingMode: { value: "auto" },
    envValueMode: { value: "global" },
    feeConfigMode: { value: "global" }
  },
  querySelector: makeFields({
    "#scenario-name": "基准场景",
    "#mechanism-enabled": "no"
  }).querySelector,
  scenarioConfig,
  readEnvValueAllocationDraft: () => ({
    greenCertRatio: 0.7,
    greenPremiumRatio: 0.3,
    carbonRatio: 0.1,
    totalRatio: 1.1
  })
});
assert.equal(invalidEnvDraft.ok, false);
assert.match(invalidEnvDraft.message, /不能超过 100.0%/);

console.log("scenario form tests passed");
