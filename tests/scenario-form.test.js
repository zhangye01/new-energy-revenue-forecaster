"use strict";

const assert = require("node:assert/strict");
const scenarioConfig = require("../src/domain/scenario-config");
const {
  applyScenarioManagerView,
  applyScenarioFieldLocks,
  bindForecastScenarioEvents,
  bindScenarioDerivedFieldEvents,
  buildScenarioManagerView,
  buildScenarioSaveDraft,
  buildScenarioConfigFromForm,
  loadScenarioToForm
} = require("../src/ui/scenario-form");

class FakeTarget {
  constructor(value = "", dataset = {}) {
    this.value = value;
    this.dataset = dataset;
    this.handlers = {};
    this.disabled = false;
    this.hidden = false;
    this.textContent = "";
  }

  addEventListener(name, handler) {
    this.handlers[name] = handler;
  }

  dispatch(name, event = {}) {
    const nextEvent = {
      target: this,
      key: "",
      prevented: false,
      preventDefault() {
        nextEvent.prevented = true;
      },
      ...event
    };
    this.handlers[name]?.(nextEvent);
    return nextEvent;
  }
}

const scenarioEventCalls = [];
const scenarioEventRefs = {
  forecastRunForm: new FakeTarget(),
  scenarioForm: new FakeTarget(),
  scenarioSelector: new FakeTarget("base"),
  scenarioQuickName: new FakeTarget(),
  duplicateScenarioButton: new FakeTarget(),
  renameScenarioButton: new FakeTarget(),
  deleteScenarioButton: new FakeTarget(),
  toggleBaselineLockButton: new FakeTarget(),
  applyBatchButton: new FakeTarget(),
  ltPricingMode: new FakeTarget(),
  envValueMode: new FakeTarget(),
  feeConfigMode: new FakeTarget(),
  exportLtTemplateButton: new FakeTarget(),
  importLtTemplateButton: new FakeTarget(),
  exportEnvTemplateButton: new FakeTarget(),
  importEnvTemplateButton: new FakeTarget(),
  exportFeeTemplateButton: new FakeTarget(),
  importFeeTemplateButton: new FakeTarget(),
  provinceDefaultSelector: new FakeTarget("jiangsu")
};
bindForecastScenarioEvents({
  refs: scenarioEventRefs,
  handlers: {
    generateForecastRun: () => scenarioEventCalls.push("generate"),
    saveScenarioFromForm: () => scenarioEventCalls.push("save"),
    switchActiveScenario: (id) => scenarioEventCalls.push(`switch:${id}`),
    renameActiveScenario: () => scenarioEventCalls.push("rename"),
    duplicateActiveScenario: () => scenarioEventCalls.push("duplicate"),
    deleteActiveScenario: () => scenarioEventCalls.push("delete"),
    toggleBaselineLock: () => scenarioEventCalls.push("lock"),
    applyBatchParameter: () => scenarioEventCalls.push("batch"),
    syncScenarioFieldLocks: () => scenarioEventCalls.push("sync-locks"),
    exportManualScenarioTemplate: (type) => scenarioEventCalls.push(`export:${type}`),
    importManualScenarioTemplate: (type) => scenarioEventCalls.push(`import:${type}`),
    changeProvinceDefault: (key) => scenarioEventCalls.push(`province:${key}`)
  }
});
assert.equal(scenarioEventRefs.forecastRunForm.dispatch("submit").prevented, true);
assert.equal(scenarioEventRefs.scenarioForm.dispatch("submit").prevented, true);
scenarioEventRefs.scenarioSelector.dispatch("change");
assert.equal(scenarioEventRefs.scenarioQuickName.dispatch("keydown", { key: "Escape" }).prevented, false);
assert.equal(scenarioEventRefs.scenarioQuickName.dispatch("keydown", { key: "Enter" }).prevented, true);
scenarioEventRefs.duplicateScenarioButton.dispatch("click");
scenarioEventRefs.renameScenarioButton.dispatch("click");
scenarioEventRefs.deleteScenarioButton.dispatch("click");
scenarioEventRefs.toggleBaselineLockButton.dispatch("click");
scenarioEventRefs.applyBatchButton.dispatch("click");
scenarioEventRefs.ltPricingMode.dispatch("change");
scenarioEventRefs.envValueMode.dispatch("change");
scenarioEventRefs.feeConfigMode.dispatch("change");
scenarioEventRefs.exportLtTemplateButton.dispatch("click");
scenarioEventRefs.importLtTemplateButton.dispatch("click");
scenarioEventRefs.exportEnvTemplateButton.dispatch("click");
scenarioEventRefs.importEnvTemplateButton.dispatch("click");
scenarioEventRefs.exportFeeTemplateButton.dispatch("click");
scenarioEventRefs.importFeeTemplateButton.dispatch("click");
scenarioEventRefs.provinceDefaultSelector.dispatch("change");
assert.deepEqual(scenarioEventCalls, [
  "generate",
  "save",
  "switch:base",
  "rename",
  "duplicate",
  "rename",
  "delete",
  "lock",
  "batch",
  "sync-locks",
  "sync-locks",
  "sync-locks",
  "export:lt",
  "import:lt",
  "export:env",
  "import:env",
  "export:fee",
  "import:fee",
  "province:jiangsu"
]);

const derivedEventCalls = [];
const derivedFields = new Map([
  ["#mechanism-enabled", new FakeTarget()],
  ["#mechanism-ratio", new FakeTarget()],
  ["#mechanism-start-ym", new FakeTarget()],
  ["#mechanism-end-ym", new FakeTarget()],
  ["#carbon-enabled", new FakeTarget()],
  ["#green-cert-realize-ratio", new FakeTarget()],
  ["#green-premium-realize-ratio", new FakeTarget()],
  ["#carbon-realize-ratio", new FakeTarget()]
]);
bindScenarioDerivedFieldEvents({
  querySelector: (selector) => derivedFields.get(selector),
  handlers: {
    syncScenarioFieldLocks: () => derivedEventCalls.push("sync-locks"),
    updateMarketTradeEnergyDisplay: () => derivedEventCalls.push("market-trade"),
    updateEnvValueSpaceDisplay: () => derivedEventCalls.push("env-space")
  }
});
derivedFields.get("#mechanism-enabled").dispatch("change");
derivedFields.get("#mechanism-ratio").dispatch("input");
derivedFields.get("#mechanism-start-ym").dispatch("change");
derivedFields.get("#carbon-enabled").dispatch("change");
derivedFields.get("#green-cert-realize-ratio").dispatch("input");
derivedFields.get("#carbon-realize-ratio").dispatch("change");
assert.deepEqual(derivedEventCalls, [
  "sync-locks",
  "market-trade",
  "market-trade",
  "sync-locks",
  "env-space",
  "env-space"
]);

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

function makeNode() {
  return {
    disabled: false,
    innerHTML: "old",
    textContent: "old",
    value: "old"
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

const lockHarness = makeFields({
  "#mechanism-enabled": "no",
  "#mechanism-ratio": "36",
  "#mechanism-price": "365",
  "#mechanism-start-ym": "2026-01",
  "#mechanism-end-ym": "2029-12"
});
const lockRefs = {
  scenarioStorageRevenueSection: new FakeTarget(),
  storageArbitragePrice: new FakeTarget("18"),
  storageCapacityCompPrice: new FakeTarget("7"),
  storageAncillaryRevenuePrice: new FakeTarget("10"),
  storageOtherRevenuePrice: new FakeTarget("3"),
  scenarioLockHint: new FakeTarget()
};
applyScenarioFieldLocks({
  refs: lockRefs,
  querySelector: lockHarness.querySelector,
  locked: false,
  canUseStorageRevenue: false
});
assert.equal(lockHarness.fields.get("#mechanism-ratio").disabled, true);
assert.equal(lockRefs.scenarioStorageRevenueSection.hidden, true);
assert.equal(lockRefs.storageArbitragePrice.disabled, true);
assert.equal(lockRefs.storageArbitragePrice.value, "0");
assert.equal(lockRefs.scenarioLockHint.textContent, "当前场景可编辑。");

lockHarness.fields.get("#mechanism-enabled").value = "yes";
applyScenarioFieldLocks({
  refs: lockRefs,
  querySelector: lockHarness.querySelector,
  locked: true,
  canUseStorageRevenue: true
});
assert.equal(lockHarness.fields.get("#mechanism-price").disabled, true);
assert.equal(lockRefs.scenarioStorageRevenueSection.hidden, false);
assert.equal(lockRefs.storageCapacityCompPrice.disabled, true);
assert.equal(lockRefs.scenarioLockHint.textContent, "当前为锁定场景，已禁止编辑。可切换场景或解锁基准场景。");

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

const emptyManagerView = buildScenarioManagerView();
assert.equal(emptyManagerView.lockHint, "请先创建项目。");
assert.equal(emptyManagerView.quickNameDisabled, true);
assert.equal(emptyManagerView.applyBatchDisabled, true);

const managerProject = {
  hasStorage: true,
  startYear: 2026,
  activeScenarioId: "base",
  scenarios: [
    {
      id: "base",
      name: "基准<场景>",
      isBaseline: true,
      locked: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
      config: {
        mechanismRatio: 0.36,
        mechanismPrice: 365,
        ltYear1Pnl: 8,
        storageArbitragePrice: 1,
        storageCapacityCompPrice: 2,
        storageAncillaryRevenuePrice: 3,
        storageOtherRevenuePrice: 4
      }
    },
    {
      id: "up",
      name: "乐观场景",
      isBaseline: false,
      locked: false,
      updatedAt: "2026-01-02T00:00:00.000Z",
      config: {
        mechanismRatio: 0.4,
        mechanismPrice: 370,
        ltYear1Pnl: 9,
        storageArbitragePrice: 0,
        storageCapacityCompPrice: 0,
        storageAncillaryRevenuePrice: 0,
        storageOtherRevenuePrice: 0
      }
    }
  ]
};
const managerView = buildScenarioManagerView({
  project: managerProject,
  activeScenario: managerProject.scenarios[0],
  baselineScenario: managerProject.scenarios[0],
  getEnvValueAllocation: () => ({ unitValuePerMarketMwh: 12.8 }),
  getFeeConfigForYear: () => ({ marketOpFee: 6, gridAssessFee: 7, ancillaryFee: 14, otherFee: 3 }),
  asPercent: (value) => `${(value * 100).toFixed(1)}%`,
  asNum: (value, digits) => Number(value).toFixed(digits),
  formatDate: (value) => `date:${value}`
});
assert.match(managerView.selectorHtml, /基准&lt;场景&gt;（基准） \[已锁定\]/);
assert.match(managerView.listHtml, /基准&lt;场景&gt;/);
assert.match(managerView.listHtml, /当前 \/ 基准 \/ 已锁定/);
assert.match(managerView.listHtml, /10.0/);
assert.equal(managerView.deleteDisabled, true);
assert.equal(managerView.renameDisabled, true);
assert.equal(managerView.toggleBaselineText, "解锁基准场景");
assert.match(managerView.lockHint, /基准场景已锁定/);

const managerRefs = {
  scenarioSelector: makeNode(),
  scenarioQuickName: makeNode(),
  scenarioListBody: makeNode(),
  scenarioLockHint: makeNode(),
  duplicateScenarioButton: makeNode(),
  renameScenarioButton: makeNode(),
  deleteScenarioButton: makeNode(),
  toggleBaselineLockButton: makeNode(),
  applyBatchButton: makeNode()
};
applyScenarioManagerView(managerRefs, managerView);
assert.equal(managerRefs.scenarioSelector.value, "base");
assert.equal(managerRefs.scenarioQuickName.value, "基准<场景>");
assert.equal(managerRefs.scenarioQuickName.disabled, true);
assert.equal(managerRefs.toggleBaselineLockButton.textContent, "解锁基准场景");
assert.equal(managerRefs.applyBatchButton.disabled, false);

console.log("scenario form tests passed");
