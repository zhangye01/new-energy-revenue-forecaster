"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_SCENARIO_FORM = api;
  if (root.window && root.window !== root) {
    root.window.NE_SCENARIO_FORM = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function getField(querySelector, selector) {
    return typeof querySelector === "function" ? querySelector(selector) : null;
  }

  function setValue(querySelector, selector, value) {
    const field = getField(querySelector, selector);
    if (field) field.value = value;
  }

  function numberValue(querySelector, selector) {
    return Number(getField(querySelector, selector)?.value);
  }

  function selectValue(querySelector, selector) {
    return getField(querySelector, selector)?.value || "";
  }

  function ratioValue(clamp, value) {
    const numeric = Number(value);
    return clamp(Number.isFinite(numeric) ? numeric : 0, 0, 1);
  }

  function loadScenarioToForm(input = {}) {
    const {
      scenario,
      refs = {},
      querySelector,
      asNum = (value, digits = 1) => Number(value || 0).toFixed(digits),
      modes = {}
    } = input;
    if (!scenario?.config) return;
    const config = scenario.config;
    setValue(querySelector, "#scenario-name", scenario.name);
    setValue(querySelector, "#mechanism-enabled", config.mechanismEnabled ? "yes" : "no");
    setValue(querySelector, "#mechanism-ratio", (config.mechanismRatio * 100).toFixed(1));
    setValue(querySelector, "#mechanism-price", config.mechanismPrice);
    setValue(querySelector, "#mechanism-start-ym", config.mechanismStartYm);
    setValue(querySelector, "#mechanism-end-ym", config.mechanismEndYm);
    if (refs.ltPricingMode) refs.ltPricingMode.value = modes.ltPricingMode || "auto";
    setValue(querySelector, "#lt-year1-pnl", config.ltYear1Pnl);
    setValue(querySelector, "#lt-target-pnl", config.ltTargetPnl);
    setValue(querySelector, "#lt-converge-speed", Number.isFinite(Number(config.ltConvergeSpeed)) ? String(Number(config.ltConvergeSpeed)) : "0");
    setValue(querySelector, "#green-cert-price", config.greenCertPrice);
    setValue(querySelector, "#green-cert-realize-ratio", asNum(Number(config.greenCertRealizeRatio || 0) * 100, 1));
    setValue(querySelector, "#green-premium-price", config.greenPremiumPrice);
    setValue(querySelector, "#green-premium-realize-ratio", asNum(Number(config.greenPremiumRealizeRatio || 0) * 100, 1));
    if (refs.envValueMode) refs.envValueMode.value = modes.envValueMode || "global";
    setValue(querySelector, "#carbon-enabled", config.carbonEnabled ? "yes" : "no");
    setValue(querySelector, "#carbon-price", config.carbonPrice);
    setValue(querySelector, "#carbon-realize-ratio", asNum(Number(config.carbonRealizeRatio || 0) * 100, 1));
    setValue(querySelector, "#market-op-fee", config.marketOpFee);
    setValue(querySelector, "#grid-assess-fee", config.gridAssessFee);
    setValue(querySelector, "#ancillary-fee", config.ancillaryFee);
    setValue(querySelector, "#other-fee", config.otherFee);
    setValue(querySelector, "#other-income", config.otherIncome);
    if (refs.feeConfigMode) refs.feeConfigMode.value = modes.feeConfigMode || "global";
    if (refs.storageArbitragePrice) refs.storageArbitragePrice.value = config.storageArbitragePrice || 0;
    if (refs.storageCapacityCompPrice) refs.storageCapacityCompPrice.value = config.storageCapacityCompPrice || 0;
    if (refs.storageAncillaryRevenuePrice) refs.storageAncillaryRevenuePrice.value = config.storageAncillaryRevenuePrice || 0;
    if (refs.storageOtherRevenuePrice) refs.storageOtherRevenuePrice.value = config.storageOtherRevenuePrice || 0;
  }

  function buildScenarioConfigFromForm(input = {}) {
    const {
      project = {},
      refs = {},
      querySelector,
      clamp = (value) => value,
      ltPricingMode = "auto",
      ltManualPricesByYear = {},
      envValueMode = "global",
      envManualValuesByYear = {},
      envAllocationDraft = {},
      feeConfigMode = "global",
      feeManualValuesByYear = {}
    } = input;
    const offshore = project.siteType === "offshore";
    const carbonEnabled = offshore && selectValue(querySelector, "#carbon-enabled") === "yes";
    return {
      mechanismEnabled: selectValue(querySelector, "#mechanism-enabled") === "yes",
      mechanismRatio: clamp(numberValue(querySelector, "#mechanism-ratio") / 100, 0, 1),
      mechanismPrice: numberValue(querySelector, "#mechanism-price"),
      mechanismStartYm: selectValue(querySelector, "#mechanism-start-ym"),
      mechanismEndYm: selectValue(querySelector, "#mechanism-end-ym"),
      ltPricingMode,
      ltManualPricesByYear,
      ltYear1Pnl: numberValue(querySelector, "#lt-year1-pnl"),
      ltTargetPnl: numberValue(querySelector, "#lt-target-pnl"),
      ltConvergeSpeedUnit: "fixed_step",
      ltConvergeSpeed: clamp(numberValue(querySelector, "#lt-converge-speed"), 0, 2000),
      envValueMode,
      envManualValuesByYear,
      greenCertPrice: numberValue(querySelector, "#green-cert-price"),
      greenCertRealizeRatio: ratioValue(clamp, envAllocationDraft.greenCertRatio),
      greenPremiumPrice: numberValue(querySelector, "#green-premium-price"),
      greenPremiumRealizeRatio: ratioValue(clamp, envAllocationDraft.greenPremiumRatio),
      carbonEnabled,
      carbonPrice: offshore ? numberValue(querySelector, "#carbon-price") : 0,
      carbonRealizeRatio: carbonEnabled ? ratioValue(clamp, envAllocationDraft.carbonRatio) : 0,
      feeConfigMode,
      feeManualValuesByYear,
      marketOpFee: numberValue(querySelector, "#market-op-fee"),
      gridAssessFee: numberValue(querySelector, "#grid-assess-fee"),
      ancillaryFee: numberValue(querySelector, "#ancillary-fee"),
      otherFee: numberValue(querySelector, "#other-fee"),
      otherIncome: numberValue(querySelector, "#other-income"),
      storageArbitragePrice: project.hasStorage ? Number(refs.storageArbitragePrice?.value || 0) : 0,
      storageCapacityCompPrice: project.hasStorage ? Number(refs.storageCapacityCompPrice?.value || 0) : 0,
      storageAncillaryRevenuePrice: project.hasStorage ? Number(refs.storageAncillaryRevenuePrice?.value || 0) : 0,
      storageOtherRevenuePrice: project.hasStorage ? Number(refs.storageOtherRevenuePrice?.value || 0) : 0
    };
  }

  return Object.freeze({
    buildScenarioConfigFromForm,
    loadScenarioToForm
  });
});
