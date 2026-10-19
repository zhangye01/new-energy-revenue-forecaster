"use strict";

const assert = require("node:assert/strict");
const scenarioConfig = require("../src/domain/scenario-config");
const {
  applyEnvValueControlState,
  applyScenarioManagerView,
  applyScenarioFieldLocks,
  applyScenarioSaveDraft,
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
      mechanismReferenceMode: "same_type",
      sameTypeSpread: 5,
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
assert.equal(loadHarness.fields.get("#mechanism-ratio").value, "36");
assert.equal(loadHarness.fields.get("#green-cert-realize-ratio").value, "40");
assert.equal(loadHarness.fields.get("#carbon-realize-ratio").value, "40");
assert.equal(loadRefs.ltPricingMode.value, "manual");
assert.equal(loadRefs.feeConfigMode.value, "manual");
assert.equal(loadRefs.storageArbitragePrice.value, 18);

const lockHarness = makeFields({
  "#mechanism-enabled": "no",
  "#mechanism-ratio": "36",
  "#mechanism-price": "365",
  "#mechanism-reference-mode": "same_type",
  "#same-type-spread": "5",
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
assert.equal(lockRefs.scenarioLockHint.textContent, "当前场景已锁定，请切换场景或解锁。");

const envHarness = makeFields({
  "#green-cert-price": "22",
  "#green-cert-realize-ratio": "40",
  "#green-premium-price": "12",
  "#green-premium-realize-ratio": "20",
  "#carbon-enabled": "yes",
  "#carbon-price": "4",
  "#carbon-realize-ratio": "40"
});
const envRefs = {
  envManualPanel: new FakeTarget(),
  envValueMode: new FakeTarget("global"),
  envValueSpaceRatio: new FakeTarget(),
  envValueUsedRatio: new FakeTarget(),
  exportEnvTemplateButton: new FakeTarget(),
  envManualFileInput: new FakeTarget(),
  importEnvTemplateButton: new FakeTarget()
};
const envState = applyEnvValueControlState({
  refs: envRefs,
  querySelector: envHarness.querySelector,
  project: { siteType: "offshore" },
  scenario: { id: "base" },
  locked: false,
  envValueMode: "global"
});
assert.deepEqual(envState, {
  mode: "global",
  isManual: false,
  canUseCarbon: true,
  carbonEnabled: true,
  hasScenario: true
});
assert.equal(envRefs.envManualPanel.hidden, true);
assert.equal(envHarness.fields.get("#green-cert-price").disabled, false);
assert.equal(envHarness.fields.get("#carbon-price").disabled, false);
assert.equal(envRefs.envValueSpaceRatio.disabled, true);
assert.equal(envRefs.exportEnvTemplateButton.disabled, false);
assert.equal(envRefs.envManualFileInput.disabled, true);
assert.equal(envRefs.importEnvTemplateButton.disabled, true);

envRefs.envValueMode.value = "manual";
const envManualState = applyEnvValueControlState({
  refs: envRefs,
  querySelector: envHarness.querySelector,
  project: { siteType: "offshore" },
  scenario: { id: "base" },
  locked: false,
  envValueMode: "global"
});
assert.equal(envManualState.isManual, true);
assert.equal(envRefs.envManualPanel.hidden, false);
assert.equal(envHarness.fields.get("#green-cert-price").disabled, true);
assert.equal(envHarness.fields.get("#carbon-enabled").disabled, true);
assert.equal(envRefs.envManualFileInput.disabled, false);
assert.equal(envRefs.importEnvTemplateButton.disabled, false);

envRefs.envValueMode.value = "global";
envHarness.fields.get("#carbon-enabled").value = "yes";
const inlandEnvState = applyEnvValueControlState({
  refs: envRefs,
  querySelector: envHarness.querySelector,
  project: { siteType: "onshore" },
  scenario: { id: "base" },
  locked: true,
  envValueMode: "global"
});
assert.equal(inlandEnvState.canUseCarbon, false);
assert.equal(envRefs.envValueMode.disabled, true);
assert.equal(envHarness.fields.get("#carbon-enabled").value, "no");
assert.equal(envHarness.fields.get("#carbon-price").value, "0");
assert.equal(envHarness.fields.get("#carbon-realize-ratio").value, "0");
assert.equal(envRefs.exportEnvTemplateButton.disabled, true);

assert.equal(loadHarness.fields.get("#mechanism-reference-mode").value, "same_type");
assert.equal(Number(loadHarness.fields.get("#same-type-spread").value), 5);

const saveHarness = makeFields({
  "#mechanism-enabled": "yes",
  "#mechanism-ratio": "120",
  "#mechanism-price": "365",
  "#mechanism-reference-mode": "same_type",
  "#same-type-spread": "5",
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

assert.equal(config.mechanismReferenceMode, "same_type");
assert.equal(config.sameTypeSpread, 5);
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
    "#green-cert-realize-ratio": "40",
    "#green-premium-price": "12",
    "#green-premium-realize-ratio": "20",
    "#carbon-enabled": "yes",
    "#carbon-price": "4",
    "#carbon-realize-ratio": "40",
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

const applySaveProject = { statuses: {} };
const applySaveScenario = { id: "s1", name: "旧场景", config: {}, updatedAt: "" };
const applySaveResult = applyScenarioSaveDraft({
  project: applySaveProject,
  scenario: applySaveScenario,
  draft: {
    ok: true,
    scenarioName: "新场景",
    config: { mechanismEnabled: true, mechanismPrice: 365 }
  },
  nowIso: () => "2026-06-30T00:00:00.000Z"
});
assert.deepEqual(applySaveResult, {
  ok: true,
  message: "场景“新场景”已保存。"
});
assert.equal(applySaveScenario.name, "新场景");
assert.deepEqual(applySaveScenario.config, { mechanismEnabled: true, mechanismPrice: 365 });
assert.deepEqual(applySaveScenario.confirmedConfig, { mechanismEnabled: true, mechanismPrice: 365 });
assert.equal(applySaveScenario.updatedAt, "2026-06-30T00:00:00.000Z");
assert.equal(applySaveProject.statuses["scenario-page"], "completed");
assert.deepEqual(applyScenarioSaveDraft({
  project: applySaveProject,
  scenario: applySaveScenario,
  draft: { ok: false, message: "不能保存" }
}), {
  ok: false,
  message: "不能保存"
});
const lockedSaveScenario = { ...applySaveScenario, locked: true };
assert.deepEqual(applyScenarioSaveDraft({
  project: applySaveProject,
  scenario: lockedSaveScenario,
  draft: { ok: true, scenarioName: "不应修改", config: { mechanismPrice: 999 } }
}), { ok: false, message: "当前场景已锁定，不能保存修改。" });
assert.equal(lockedSaveScenario.name, "新场景");
assert.deepEqual(lockedSaveScenario.confirmedConfig, { mechanismEnabled: true, mechanismPrice: 365 });

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

// A blank active field must not silently become a confirmed zero.
const numericHarness = makeFields({
  "#scenario-name": "基准场景", "#mechanism-enabled": "yes", "#mechanism-ratio": "0",
  "#mechanism-price": "0", "#mechanism-start-ym": "2026-01", "#mechanism-end-ym": "2027-12",
  "#mechanism-reference-mode": "same_type", "#same-type-spread": "0",
  "#lt-year1-pnl": "0", "#lt-target-pnl": "0", "#lt-converge-speed": "0",
  "#green-cert-price": "0", "#green-cert-realize-ratio": "0",
  "#green-premium-price": "0", "#green-premium-realize-ratio": "0",
  "#carbon-enabled": "yes", "#carbon-price": "0", "#carbon-realize-ratio": "0",
  "#market-op-fee": "0", "#grid-assess-fee": "0", "#ancillary-fee": "0", "#other-fee": "0", "#other-income": "0"
});
const numericRefs = {
  ltPricingMode: { value: "auto" }, envValueMode: { value: "global" }, feeConfigMode: { value: "global" },
  storageArbitragePrice: { value: "0" }, storageCapacityCompPrice: { value: "0" },
  storageAncillaryRevenuePrice: { value: "0" }, storageOtherRevenuePrice: { value: "0" }
};
const numericOptions = {
  project: saveProject, scenario: saveScenario, refs: numericRefs, querySelector: numericHarness.querySelector,
  scenarioConfig, clamp, monthSerial: (ym) => Number(ym.replace("-", "")),
  readEnvValueAllocationDraft: () => ({ greenCertRatio: 0, greenPremiumRatio: 0, carbonRatio: 0, totalRatio: 0 })
};
assert.equal(buildScenarioSaveDraft(numericOptions).ok, true, "explicit zero remains valid in every active group");
for (const [selector, field] of numericHarness.fields) {
  if (!["#scenario-name", "#mechanism-enabled", "#mechanism-start-ym", "#mechanism-end-ym", "#mechanism-reference-mode", "#carbon-enabled"].includes(selector)) {
    for (const emptyValue of ["", "  "]) {
      field.value = emptyValue;
      const invalidDraft = buildScenarioSaveDraft(numericOptions);
      assert.equal(invalidDraft.ok, false, `${selector} rejects blank input`);
      assert.match(invalidDraft.message, /不能为空/);
      const unchangedScenario = { config: { otherFee: 3 }, confirmedConfig: { otherFee: 3 } };
      assert.equal(applyScenarioSaveDraft({ project: saveProject, scenario: unchangedScenario, draft: invalidDraft }).ok, false);
      assert.deepEqual(unchangedScenario, { config: { otherFee: 3 }, confirmedConfig: { otherFee: 3 } });
    }
    field.value = "0";
  }
}
for (const key of ["storageArbitragePrice", "storageCapacityCompPrice", "storageAncillaryRevenuePrice", "storageOtherRevenuePrice"]) {
  numericRefs[key].value = "";
  assert.equal(buildScenarioSaveDraft(numericOptions).ok, false, `${key} requires an explicit value for storage projects`);
  numericRefs[key].value = "0";
}
numericHarness.fields.get("#mechanism-enabled").value = "no";
numericHarness.fields.get("#mechanism-price").value = "";
numericHarness.fields.get("#mechanism-ratio").value = "";
numericHarness.fields.get("#same-type-spread").value = "";
numericHarness.fields.get("#carbon-price").value = "";
numericHarness.fields.get("#carbon-realize-ratio").value = "";
numericRefs.storageArbitragePrice.value = "";
assert.equal(buildScenarioSaveDraft({ ...numericOptions, project: { ...saveProject, siteType: "onshore", hasStorage: false } }).ok, true,
  "inactive mechanism, onshore carbon, and absent storage fields do not require re-entry");
numericHarness.fields.get("#carbon-enabled").value = "no";
assert.equal(buildScenarioSaveDraft({ ...numericOptions, project: { ...saveProject, hasStorage: false } }).ok, true,
  "offshore carbon values may stay blank when carbon revenue is disabled");

const modelForConfirmation = require("../src/domain/scenario-model");
const inactiveProject = { siteType: "onshore", hasStorage: false, startYear: 2026, forecastYears: 2, statuses: {} };
const inactiveScenario = modelForConfirmation.createBaselineScenario(inactiveProject);
inactiveScenario.config.mechanismEnabled = false;
const inactiveConfig = JSON.parse(JSON.stringify(inactiveScenario.config));
applyScenarioSaveDraft({ project: inactiveProject, scenario: inactiveScenario,
  draft: { ok: true, scenarioName: "陆上无配储", config: inactiveConfig } });
for (const key of ["storageArbitragePrice", "storageCapacityCompPrice", "storageAncillaryRevenuePrice", "storageOtherRevenuePrice",
  "carbonEnabled", "carbonPrice", "carbonRealizeRatio", "mechanismPrice", "mechanismRatio", "sameTypeSpread",
  "ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"]) {
  assert.equal(modelForConfirmation.isConfigConfirmed(inactiveScenario, key), false, `${key} was not filled in the active workflow`);
}
assert.equal(modelForConfirmation.isConfigConfirmed(inactiveScenario, "otherFee"), true);
assert.equal(modelForConfirmation.isConfigConfirmed(inactiveScenario, "mechanismEnabled"), true);
const manualOnlyScenario = modelForConfirmation.createBaselineScenario(inactiveProject);
Object.assign(manualOnlyScenario.config, { ltPricingMode: "manual", ltManualPricesByYear: { 2026: 0, 2027: 1 },
  envValueMode: "manual", envManualValuesByYear: { 2026: {}, 2027: {} },
  feeConfigMode: "manual", feeManualValuesByYear: { 2026: {}, 2027: {} } });
applyScenarioSaveDraft({ project: inactiveProject, scenario: manualOnlyScenario,
  draft: { ok: true, scenarioName: "逐年方案", config: manualOnlyScenario.config } });
for (const key of ["ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"]) {
  assert.equal(modelForConfirmation.isConfigConfirmed(manualOnlyScenario, key), true);
}
for (const key of ["ltYear1Pnl", "ltTargetPnl", "ltConvergeSpeed", "greenCertPrice", "otherFee"]) {
  assert.equal(modelForConfirmation.isConfigConfirmed(manualOnlyScenario, key), false, "inactive global defaults are not newly confirmed");
}

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

// Rough pricing permits decimal ratios; continuing to the full-income page and
// saving unchanged inputs must preserve both their value and rough-result context.
const preciseHarness = makeFields();
const preciseProject = { id: "decimal-flow", province: "jiangsu", siteType: "offshore", assetType: "wind", capacityMw: 100, startYear: 2026, forecastYears: 2, hasStorage: false };
const preciseScenario = require("../src/domain/scenario-model").createBaselineScenario(preciseProject);
Object.assign(preciseScenario.config, {
  mechanismRatio: 0.3655,
  greenCertRealizeRatio: 0.4555,
  greenPremiumRealizeRatio: 0.12345678901234567,
  carbonEnabled: true,
  carbonRealizeRatio: 0.2222222222222222
});
const preciseRefs = { ltPricingMode: { value: "" }, envValueMode: { value: "" }, feeConfigMode: { value: "" } };
loadScenarioToForm({ scenario: preciseScenario, refs: preciseRefs, querySelector: preciseHarness.querySelector });
assert.equal(preciseHarness.fields.get("#mechanism-ratio").value, "36.55");
assert.equal(preciseHarness.fields.get("#green-cert-realize-ratio").value, "45.55");
const readPreciseConfig = () => buildScenarioConfigFromForm({
  project: preciseProject, refs: preciseRefs, querySelector: preciseHarness.querySelector,
  envAllocationDraft: {
    greenCertRatio: Number(preciseHarness.querySelector("#green-cert-realize-ratio").value) / 100,
    greenPremiumRatio: Number(preciseHarness.querySelector("#green-premium-realize-ratio").value) / 100,
    carbonRatio: Number(preciseHarness.querySelector("#carbon-realize-ratio").value) / 100
  }
});
const preciseSaved = readPreciseConfig();
for (const key of ["mechanismRatio", "greenCertRealizeRatio", "greenPremiumRealizeRatio", "carbonRealizeRatio"]) {
  assert.equal(preciseSaved[key], preciseScenario.config[key], `未修改的 ${key} 应保留原始精度`);
}
const { contextFingerprint } = require("../src/domain/rough-price");
assert.equal(contextFingerprint(preciseProject, { ...preciseScenario, config: preciseSaved }), contextFingerprint(preciseProject, preciseScenario), "继续到全口径页保存不应使粗算结果失效");
preciseHarness.querySelector("#mechanism-ratio").value = "37.25";
preciseHarness.querySelector("#green-cert-realize-ratio").value = "44.125";
preciseHarness.querySelector("#green-premium-realize-ratio").value = "13.125";
preciseHarness.querySelector("#carbon-realize-ratio").value = "21.125";
const preciseEdited = readPreciseConfig();
assert.equal(preciseEdited.mechanismRatio, 0.3725);
assert.equal(preciseEdited.greenCertRealizeRatio, 0.44125);
assert.equal(preciseEdited.greenPremiumRealizeRatio, 0.13125);
assert.equal(preciseEdited.carbonRealizeRatio, 0.21125);
Object.assign(preciseScenario.config, {
  greenCertRealizeRatio: 0.8025, greenPremiumRealizeRatio: 0.1975, carbonEnabled: false, carbonRealizeRatio: 0
});
loadScenarioToForm({ scenario: preciseScenario, refs: preciseRefs, querySelector: preciseHarness.querySelector });
assert.equal(preciseHarness.querySelector("#green-cert-realize-ratio").value, "80.25");
assert.equal(preciseHarness.querySelector("#green-premium-realize-ratio").value, "19.75");
assert.equal(Number(preciseHarness.querySelector("#green-cert-realize-ratio").value) + Number(preciseHarness.querySelector("#green-premium-realize-ratio").value), 100, "自动带入不得把100%兑现空间四舍五入成100.1%");
const preciseFullAllocation = readPreciseConfig();
assert.equal(preciseFullAllocation.greenCertRealizeRatio + preciseFullAllocation.greenPremiumRealizeRatio, 1);

console.log("scenario form tests passed");
