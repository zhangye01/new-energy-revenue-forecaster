"use strict";

(function (root, factory) {
  const scenarioConfig = typeof module !== "undefined" && module.exports
    ? require("./scenario-config")
    : root.NE_SCENARIO_CONFIG;
  const api = factory(scenarioConfig);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_SCENARIO_MODEL = api;
  if (root.window && root.window !== root) {
    root.window.NE_SCENARIO_MODEL = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (scenarioConfig) {
  if (!scenarioConfig) {
    throw new Error("场景模型模块初始化失败：缺少场景配置模块");
  }

  const SITE_TYPE_SET = new Set(["onshore", "offshore"]);
  const FALLBACK_PROVINCE_DEFAULTS = Object.freeze({
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
    storageOtherRevenuePrice: 3
  });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function finiteOrFallback(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function resolveCurrentYear(options = {}) {
    return Number.isInteger(options.currentYear) ? options.currentYear : new Date().getFullYear();
  }

  function resolveNowIso(options = {}) {
    if (typeof options.nowIso === "function") return options.nowIso();
    if (typeof options.nowIso === "string" && options.nowIso) return options.nowIso;
    return new Date().toISOString();
  }

  function resolveProvinceDefaults(options = {}) {
    return {
      ...FALLBACK_PROVINCE_DEFAULTS,
      ...(isPlainObject(options.provinceDefaults) ? options.provinceDefaults : {})
    };
  }

  function normalizeLtConvergeStep(rawValue, rawYear1, rawTarget, fallback = 2, isFixedStep = false) {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) return fallback;
    if (!isFixedStep && value > 0 && value <= 1) {
      const year1 = Number(rawYear1);
      const target = Number(rawTarget);
      const delta = Number.isFinite(year1) && Number.isFinite(target) ? Math.abs(year1 - target) : 0;
      if (delta > 0) {
        return Number((delta * value).toFixed(4));
      }
    }
    return value;
  }

  function defaultScenarioConfig(project = {}, options = {}) {
    const provinceDefaults = resolveProvinceDefaults(options);
    const currentYear = resolveCurrentYear(options);
    const startYear = Number.isInteger(project?.startYear) && project.startYear >= 2026
      ? project.startYear
      : Math.max(2026, currentYear);
    const forecastYears = Number.isInteger(project?.forecastYears) && project.forecastYears > 0
      ? project.forecastYears
      : 30;
    const siteType = SITE_TYPE_SET.has(project?.siteType) ? project.siteType : "onshore";
    return {
      mechanismEnabled: provinceDefaults.mechanismEnabled,
      mechanismRatio: provinceDefaults.mechanismRatio,
      mechanismPrice: provinceDefaults.mechanismPrice,
      mechanismStartYm: `${startYear}-01`,
      mechanismEndYm: `${Math.min(startYear + 3, startYear + forecastYears - 1)}-12`,
      ltPricingMode: "auto",
      ltManualPricesByYear: {},
      ltYear1Pnl: 8,
      ltTargetPnl: 2,
      ltConvergeSpeedUnit: "fixed_step",
      ltConvergeSpeed: 2,
      envValueMode: "global",
      envManualValuesByYear: {},
      greenCertPrice: provinceDefaults.greenCertPrice,
      greenCertRealizeRatio: 1,
      greenPremiumPrice: provinceDefaults.greenPremiumPrice,
      greenPremiumRealizeRatio: 0,
      carbonEnabled: siteType === "offshore",
      carbonPrice: siteType === "offshore" ? 4 : 0,
      carbonRealizeRatio: 0,
      feeConfigMode: "global",
      feeManualValuesByYear: {},
      marketOpFee: provinceDefaults.marketOpFee,
      gridAssessFee: provinceDefaults.gridAssessFee,
      ancillaryFee: provinceDefaults.ancillaryFee,
      otherFee: provinceDefaults.otherFee,
      otherIncome: 2,
      storageArbitragePrice: project?.hasStorage ? provinceDefaults.storageArbitragePrice : 0,
      storageCapacityCompPrice: project?.hasStorage ? provinceDefaults.storageCapacityCompPrice : 0,
      storageAncillaryRevenuePrice: project?.hasStorage ? provinceDefaults.storageAncillaryRevenuePrice : 0,
      storageOtherRevenuePrice: project?.hasStorage ? provinceDefaults.storageOtherRevenuePrice : 0
    };
  }

  function sanitizeScenario(project = {}, rawScenario, index = 0, options = {}) {
    const scenario = isPlainObject(rawScenario) ? rawScenario : {};
    const baseConfig = defaultScenarioConfig(project, options);
    const srcConfig = isPlainObject(scenario.config) ? scenario.config : {};
    const merged = { ...baseConfig, ...srcConfig };
    const makeId = typeof options.makeId === "function" ? options.makeId : ((prefix) => `${prefix}-${index + 1}`);
    const next = {
      id: typeof scenario.id === "string" && scenario.id ? scenario.id : makeId("scn"),
      name: typeof scenario.name === "string" && scenario.name.trim() ? scenario.name.trim() : `场景${index + 1}`,
      isBaseline: Boolean(scenario.isBaseline),
      locked: Boolean(scenario.locked),
      config: {
        mechanismEnabled: Boolean(merged.mechanismEnabled),
        mechanismRatio: clamp(Number(merged.mechanismRatio) || 0, 0, 1),
        mechanismPrice: finiteOrFallback(merged.mechanismPrice, baseConfig.mechanismPrice),
        mechanismStartYm: typeof merged.mechanismStartYm === "string" && merged.mechanismStartYm ? merged.mechanismStartYm : baseConfig.mechanismStartYm,
        mechanismEndYm: typeof merged.mechanismEndYm === "string" && merged.mechanismEndYm ? merged.mechanismEndYm : baseConfig.mechanismEndYm,
        ltPricingMode: scenarioConfig.getLtPricingMode(merged),
        ltManualPricesByYear: scenarioConfig.sanitizeLtManualPricesByYear(merged.ltManualPricesByYear, project),
        ltYear1Pnl: finiteOrFallback(merged.ltYear1Pnl, baseConfig.ltYear1Pnl),
        ltTargetPnl: finiteOrFallback(merged.ltTargetPnl, baseConfig.ltTargetPnl),
        ltConvergeSpeedUnit: "fixed_step",
        ltConvergeSpeed: normalizeLtConvergeStep(
          merged.ltConvergeSpeed,
          merged.ltYear1Pnl,
          merged.ltTargetPnl,
          baseConfig.ltConvergeSpeed,
          srcConfig.ltConvergeSpeedUnit === "fixed_step"
        ),
        greenCertPrice: finiteOrFallback(merged.greenCertPrice, baseConfig.greenCertPrice),
        greenCertRealizeRatio: Number.isFinite(Number(merged.greenCertRealizeRatio)) ? clamp(Number(merged.greenCertRealizeRatio), 0, 1) : baseConfig.greenCertRealizeRatio,
        greenPremiumPrice: finiteOrFallback(merged.greenPremiumPrice, baseConfig.greenPremiumPrice),
        greenPremiumRealizeRatio: Number.isFinite(Number(merged.greenPremiumRealizeRatio)) ? clamp(Number(merged.greenPremiumRealizeRatio), 0, 1) : baseConfig.greenPremiumRealizeRatio,
        envValueMode: scenarioConfig.getEnvValueMode(merged),
        envManualValuesByYear: scenarioConfig.sanitizeEnvManualValuesByYear(merged.envManualValuesByYear, project),
        carbonEnabled: Boolean(merged.carbonEnabled),
        carbonPrice: finiteOrFallback(merged.carbonPrice, baseConfig.carbonPrice),
        carbonRealizeRatio: Number.isFinite(Number(merged.carbonRealizeRatio)) ? clamp(Number(merged.carbonRealizeRatio), 0, 1) : baseConfig.carbonRealizeRatio,
        feeConfigMode: scenarioConfig.getFeeConfigMode(merged),
        feeManualValuesByYear: scenarioConfig.sanitizeFeeManualValuesByYear(merged.feeManualValuesByYear, project),
        marketOpFee: finiteOrFallback(merged.marketOpFee, baseConfig.marketOpFee),
        gridAssessFee: finiteOrFallback(merged.gridAssessFee, baseConfig.gridAssessFee),
        ancillaryFee: finiteOrFallback(merged.ancillaryFee, baseConfig.ancillaryFee),
        otherFee: finiteOrFallback(merged.otherFee, baseConfig.otherFee),
        otherIncome: finiteOrFallback(merged.otherIncome, baseConfig.otherIncome),
        storageArbitragePrice: finiteOrFallback(merged.storageArbitragePrice, baseConfig.storageArbitragePrice),
        storageCapacityCompPrice: finiteOrFallback(merged.storageCapacityCompPrice, baseConfig.storageCapacityCompPrice),
        storageAncillaryRevenuePrice: finiteOrFallback(merged.storageAncillaryRevenuePrice, baseConfig.storageAncillaryRevenuePrice),
        storageOtherRevenuePrice: finiteOrFallback(merged.storageOtherRevenuePrice, baseConfig.storageOtherRevenuePrice)
      },
      updatedAt: typeof scenario.updatedAt === "string" && scenario.updatedAt ? scenario.updatedAt : resolveNowIso(options)
    };
    if (project.siteType !== "offshore") {
      next.config.carbonEnabled = false;
      next.config.carbonPrice = 0;
      next.config.carbonRealizeRatio = 0;
    }
    if (!project.hasStorage) {
      next.config.storageArbitragePrice = 0;
      next.config.storageCapacityCompPrice = 0;
      next.config.storageAncillaryRevenuePrice = 0;
      next.config.storageOtherRevenuePrice = 0;
    }
    return next;
  }

  return Object.freeze({
    defaultScenarioConfig,
    normalizeLtConvergeStep,
    sanitizeScenario
  });
});
