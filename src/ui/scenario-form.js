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

  function textValue(querySelector, selector) {
    return String(getField(querySelector, selector)?.value || "").trim();
  }

  function ratioValue(clamp, value) {
    const numeric = Number(value);
    return clamp(Number.isFinite(numeric) ? numeric : 0, 0, 1);
  }

  function asPercent(value) {
    return `${(Number(value) * 100).toFixed(1)}%`;
  }

  function invalid(message) {
    return { ok: false, message };
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

  function buildScenarioSaveDraft(input = {}) {
    const {
      project = {},
      scenario = {},
      refs = {},
      querySelector,
      clamp = (value) => value,
      monthSerial = () => null,
      scenarioConfig = {},
      readEnvValueAllocationDraft = () => ({})
    } = input;
    if (scenario.locked) {
      return invalid("当前场景已锁定，不能保存修改。");
    }

    const scenarioName = textValue(querySelector, "#scenario-name") || "基准场景";
    const duplicatedName = (project.scenarios || []).find((item) => (
      item.id !== scenario.id && item.name === scenarioName
    ));
    if (duplicatedName) {
      return invalid("场景名称重复，请修改后再保存。");
    }

    const mechanismEnabled = selectValue(querySelector, "#mechanism-enabled") === "yes";
    const mechanismStartYm = selectValue(querySelector, "#mechanism-start-ym");
    const mechanismEndYm = selectValue(querySelector, "#mechanism-end-ym");
    if (mechanismEnabled) {
      const startSerial = monthSerial(mechanismStartYm);
      const endSerial = monthSerial(mechanismEndYm);
      if (startSerial === null || endSerial === null || endSerial < startSerial) {
        return invalid("机制执行年月无效，请检查起止区间。");
      }
    }

    const ltPricingMode = scenarioConfig.getLtPricingMode
      ? scenarioConfig.getLtPricingMode({ ltPricingMode: refs.ltPricingMode?.value })
      : "auto";
    const ltManualPricesByYear = scenarioConfig.sanitizeLtManualPricesByYear
      ? scenarioConfig.sanitizeLtManualPricesByYear(scenario.config?.ltManualPricesByYear || {}, project)
      : {};
    if (ltPricingMode === "manual") {
      const completeness = scenarioConfig.getLtManualCompleteness?.(project, { ltManualPricesByYear }) || { complete: 0, total: 0 };
      if (completeness.complete !== completeness.total) {
        return invalid(`逐年损益值不完整，当前 ${completeness.complete}/${completeness.total} 年。请导入完整测算周期后再保存。`);
      }
    }

    const envValueMode = scenarioConfig.getEnvValueMode
      ? scenarioConfig.getEnvValueMode({ envValueMode: refs.envValueMode?.value })
      : "global";
    const envManualValuesByYear = scenarioConfig.sanitizeEnvManualValuesByYear
      ? scenarioConfig.sanitizeEnvManualValuesByYear(scenario.config?.envManualValuesByYear || {}, project)
      : {};
    const envAllocationDraft = readEnvValueAllocationDraft(project);
    if (envValueMode === "manual") {
      const completeness = scenarioConfig.getEnvManualCompleteness?.(project, { envManualValuesByYear }) || { complete: 0, total: 0 };
      if (completeness.complete !== completeness.total) {
        return invalid(`逐年环境价值兑现配置不完整，当前 ${completeness.complete}/${completeness.total} 年。请导入完整测算周期后再保存。`);
      }
    } else if (
      envAllocationDraft.greenCertRatio < 0
      || envAllocationDraft.greenPremiumRatio < 0
      || envAllocationDraft.carbonRatio < 0
      || envAllocationDraft.totalRatio > 1 + 0.000001
    ) {
      return invalid(`环境价值兑现空间分配无效：绿证、绿电溢价、碳收益合计为 ${asPercent(envAllocationDraft.totalRatio)}，不能超过 100.0%。`);
    }

    const feeConfigMode = scenarioConfig.getFeeConfigMode
      ? scenarioConfig.getFeeConfigMode({ feeConfigMode: refs.feeConfigMode?.value })
      : "global";
    const feeManualValuesByYear = scenarioConfig.sanitizeFeeManualValuesByYear
      ? scenarioConfig.sanitizeFeeManualValuesByYear(scenario.config?.feeManualValuesByYear || {}, project)
      : {};
    if (feeConfigMode === "manual") {
      const completeness = scenarioConfig.getFeeManualCompleteness?.(project, { feeManualValuesByYear }) || { complete: 0, total: 0 };
      if (completeness.complete !== completeness.total) {
        return invalid(`逐年扣费收益配置不完整，当前 ${completeness.complete}/${completeness.total} 年。请导入完整测算周期后再保存。`);
      }
    }

    return {
      ok: true,
      scenarioName,
      config: buildScenarioConfigFromForm({
        project,
        refs,
        querySelector,
        clamp,
        ltPricingMode,
        ltManualPricesByYear,
        envValueMode,
        envManualValuesByYear,
        envAllocationDraft,
        feeConfigMode,
        feeManualValuesByYear
      })
    };
  }

  return Object.freeze({
    buildScenarioSaveDraft,
    buildScenarioConfigFromForm,
    loadScenarioToForm
  });
});
