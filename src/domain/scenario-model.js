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
      mechanismReferenceMode: "project_capture",
      sameTypeSpread: 0,
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

  const CONFIG_KEYS = new Set(Object.keys(defaultScenarioConfig()));
  const CONFIRMATION_REVIEW_VERSION = 1;
  const CONFIRMATION_SOURCES = new Set(["explicit", "rough_edit"]);

  function sameConfigValue(left, right) {
    if (left === right) return true;
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => (
      Object.prototype.hasOwnProperty.call(right, key) && sameConfigValue(left[key], right[key])
    ));
  }

  function cloneConfigValue(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function matchesLegacyDefault(key, value, defaults, project) {
    if (sameConfigValue(value, defaults[key])) return true;
    const years = Number(project.forecastYears), startYear = Number(project.startYear);
    if (!Number.isInteger(years) || years <= 0 || years > 100 || !Number.isInteger(startYear)) return false;
    const annualFields = {
      envManualValuesByYear: ["greenCertPrice", "greenCertRealizeRatio", "greenPremiumPrice", "greenPremiumRealizeRatio",
        "carbonEnabled", "carbonPrice", "carbonRealizeRatio"],
      feeManualValuesByYear: ["marketOpFee", "gridAssessFee", "ancillaryFee", "otherFee", "otherIncome"]
    };
    if (key !== "ltManualPricesByYear" && !annualFields[key]) return false;
    const expected = Object.fromEntries(Array.from({ length: years }, (_, index) => {
      if (key !== "ltManualPricesByYear") {
        return [startYear + index, Object.fromEntries(annualFields[key].map((field) => [field, defaults[field]]))];
      }
      const distance = defaults.ltTargetPnl - defaults.ltYear1Pnl;
      return [startYear + index, defaults.ltYear1Pnl + Math.sign(distance)
        * Math.min(Math.abs(distance), index * defaults.ltConvergeSpeed)];
    }));
    const normalize = key === "envManualValuesByYear" ? scenarioConfig.sanitizeEnvManualValuesByYear
      : key === "feeManualValuesByYear" ? scenarioConfig.sanitizeFeeManualValuesByYear : scenarioConfig.sanitizeLtManualPricesByYear;
    return sameConfigValue(value, normalize(expected, project));
  }

  function isConfigConfirmed(scenario, key, value = scenario?.config?.[key]) {
    return CONFIG_KEYS.has(key)
      && isPlainObject(scenario?.confirmedConfig)
      && Object.prototype.hasOwnProperty.call(scenario.confirmedConfig, key)
      && sameConfigValue(scenario.confirmedConfig[key], value);
  }

  function confirmConfig(scenario, keys, options = {}) {
    if (!scenario || scenario.locked || !isPlainObject(scenario.config)) return false;
    if (!isPlainObject(scenario.confirmedConfig)) scenario.confirmedConfig = {};
    if (!isPlainObject(scenario.confirmedConfigSources)) scenario.confirmedConfigSources = {};
    const source = CONFIRMATION_SOURCES.has(options.source) ? options.source : "explicit";
    const selectedKeys = keys === undefined ? Object.keys(scenario.config) : (Array.isArray(keys) ? keys : [keys]);
    selectedKeys.forEach((key) => {
      if (CONFIG_KEYS.has(key) && Object.prototype.hasOwnProperty.call(scenario.config, key) && scenario.config[key] !== undefined) {
        scenario.confirmedConfig[key] = cloneConfigValue(scenario.config[key]);
        scenario.confirmedConfigSources[key] = source;
      }
    });
    return true;
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
      confirmedConfig: {},
      confirmedConfigSources: {},
      confirmationReviewVersion: CONFIRMATION_REVIEW_VERSION,
      config: {
        mechanismEnabled: Boolean(merged.mechanismEnabled),
        mechanismRatio: clamp(Number(merged.mechanismRatio) || 0, 0, 1),
        mechanismPrice: finiteOrFallback(merged.mechanismPrice, baseConfig.mechanismPrice),
        mechanismReferenceMode: merged.mechanismReferenceMode === "same_type" ? "same_type" : "project_capture",
        sameTypeSpread: finiteOrFallback(merged.sameTypeSpread, 0),
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
    const annualConfirmations = {
      ltManualPricesByYear: [scenarioConfig.sanitizeLtManualPricesByYear, scenarioConfig.getLtManualCompleteness],
      envManualValuesByYear: [scenarioConfig.sanitizeEnvManualValuesByYear, scenarioConfig.getEnvManualCompleteness],
      feeManualValuesByYear: [scenarioConfig.sanitizeFeeManualValuesByYear, scenarioConfig.getFeeManualCompleteness]
    };
    const roughSnapshots = Array.isArray(options.roughSnapshots) ? options.roughSnapshots : project.roughPrice?.snapshots;
    const reviewLegacyDefaults = !(Number(scenario.confirmationReviewVersion) >= CONFIRMATION_REVIEW_VERSION)
      && Array.isArray(roughSnapshots) && roughSnapshots.some((snapshot) => snapshot?.scenarioId === scenario.id);
    Object.keys(next.config).forEach((key) => {
      const annual = annualConfirmations[key];
      if (annual) {
        // Only normalize a map that still matches what the user confirmed. This
        // preserves disabled carbon fields across reloads without confirming edits.
        if (!isConfigConfirmed(scenario, key)) return;
        const value = annual[0](scenario.confirmedConfig[key], project);
        const coverage = annual[1](project, { [key]: value });
        if (coverage.complete !== coverage.total || !sameConfigValue(value, next.config[key])) return;
      } else if (!isConfigConfirmed(scenario, key, next.config[key])) return;
      const source = scenario.confirmedConfigSources?.[key];
      // Older rough generation confirmed every visible default without recording
      // its origin. Reopen only ambiguous default confirmations, once, while
      // retaining all input values and confirmed non-default assumptions.
      if (reviewLegacyDefaults && !CONFIRMATION_SOURCES.has(source)
          && matchesLegacyDefault(key, next.config[key], baseConfig, project)) return;
      next.confirmedConfig[key] = cloneConfigValue(next.config[key]);
      if (CONFIRMATION_SOURCES.has(source)) next.confirmedConfigSources[key] = source;
    });
    return next;
  }

  function createBaselineScenario(project = {}, options = {}) {
    const makeId = typeof options.makeId === "function" ? options.makeId : ((prefix) => `${prefix}-baseline`);
    return {
      id: makeId("scn"),
      name: "基准场景",
      isBaseline: true,
      locked: false,
      confirmedConfig: {},
      confirmedConfigSources: {},
      confirmationReviewVersion: CONFIRMATION_REVIEW_VERSION,
      config: defaultScenarioConfig(project, options),
      updatedAt: resolveNowIso(options)
    };
  }

  function normalizeScenarioMetadata(project = {}) {
    if (!Array.isArray(project.scenarios) || !project.scenarios.length) {
      return { baselineId: "", activeScenarioId: project.activeScenarioId || null };
    }
    const baselineId = project.scenarios.find((scenario) => scenario.isBaseline)?.id || project.scenarios[0].id;
    project.scenarios.forEach((scenario) => {
      scenario.isBaseline = scenario.id === baselineId;
      if (typeof scenario.locked !== "boolean") {
        scenario.locked = false;
      }
    });
    if (!project.scenarios.some((scenario) => scenario.id === project.activeScenarioId)) {
      project.activeScenarioId = project.scenarios[0].id;
    }
    return { baselineId, activeScenarioId: project.activeScenarioId };
  }

  function renameScenario(project = {}, scenario = {}, input = {}) {
    if (scenario.locked) {
      return { ok: false, changed: false, tone: "error", message: "当前场景已锁定，不能重命名。" };
    }
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) {
      return { ok: false, changed: false, tone: "error", message: "场景名称不能为空。" };
    }
    if (name === scenario.name) {
      return { ok: true, changed: false, tone: "success", message: "场景名称未变化。" };
    }
    const duplicatedName = (project.scenarios || []).some((item) => (
      item.id !== scenario.id && item.name === name
    ));
    if (duplicatedName) {
      return { ok: false, changed: false, tone: "error", message: "场景名称重复，请换一个名称。" };
    }
    const oldName = scenario.name;
    scenario.name = name;
    scenario.updatedAt = resolveNowIso(input);
    return { ok: true, changed: true, tone: "success", message: `场景“${oldName}”已重命名为“${scenario.name}”。` };
  }

  function applyProvinceDefaultsToScenario(project = {}, scenario = {}, input = {}) {
    if (scenario.locked) return scenario;
    const defaults = resolveProvinceDefaults({ provinceDefaults: input.provinceDefaults });
    const nowIso = input.nowIso;
    if (!scenario.config || !isPlainObject(scenario.config)) {
      scenario.config = {};
    }
    scenario.config.mechanismEnabled = defaults.mechanismEnabled;
    scenario.config.mechanismRatio = defaults.mechanismRatio;
    scenario.config.mechanismPrice = defaults.mechanismPrice;
    scenario.config.marketOpFee = defaults.marketOpFee;
    scenario.config.gridAssessFee = defaults.gridAssessFee;
    scenario.config.ancillaryFee = defaults.ancillaryFee;
    scenario.config.otherFee = defaults.otherFee;
    scenario.config.greenCertPrice = defaults.greenCertPrice;
    scenario.config.greenCertRealizeRatio = 1;
    scenario.config.greenPremiumPrice = defaults.greenPremiumPrice;
    scenario.config.greenPremiumRealizeRatio = 0;
    scenario.config.carbonRealizeRatio = 0;
    scenario.config.storageArbitragePrice = project.hasStorage ? defaults.storageArbitragePrice : 0;
    scenario.config.storageCapacityCompPrice = project.hasStorage ? defaults.storageCapacityCompPrice : 0;
    scenario.config.storageAncillaryRevenuePrice = project.hasStorage ? defaults.storageAncillaryRevenuePrice : 0;
    scenario.config.storageOtherRevenuePrice = project.hasStorage ? defaults.storageOtherRevenuePrice : 0;
    if (project.siteType !== "offshore") {
      scenario.config.carbonEnabled = false;
      scenario.config.carbonPrice = 0;
    }
    confirmConfig(scenario, [
      "mechanismEnabled", "mechanismRatio", "mechanismPrice",
      "marketOpFee", "gridAssessFee", "ancillaryFee", "otherFee",
      "greenCertPrice", "greenCertRealizeRatio", "greenPremiumPrice", "greenPremiumRealizeRatio",
      "carbonRealizeRatio", "storageArbitragePrice", "storageCapacityCompPrice",
      "storageAncillaryRevenuePrice", "storageOtherRevenuePrice",
      ...(project.siteType !== "offshore" ? ["carbonEnabled", "carbonPrice"] : [])
    ]);
    scenario.updatedAt = typeof nowIso === "function" ? nowIso() : resolveNowIso({ nowIso });
    return scenario;
  }

  function parseBatchValue(spec, rawText) {
    if (rawText === null || rawText === undefined || String(rawText).trim() === "") return null;
    const num = Number(rawText);
    if (!Number.isFinite(num)) return null;
    if (spec?.type === "percent") {
      return clamp(num / 100, Number(spec.min) / 100, Number(spec.max) / 100);
    }
    return clamp(num, Number(spec?.min), Number(spec?.max));
  }

  function buildBatchResultMessage(result) {
    if (!result.updated) {
      return "没有可更新的场景（可能被锁定或范围过滤）。";
    }
    let message = `批量更新完成：${result.updated} 个场景已更新，跳过基准 ${result.skippedBaseline} 个，跳过锁定 ${result.skippedLocked} 个。`;
    if (result.skippedSpace) {
      message += ` 另有 ${result.skippedSpace} 个场景因环境价值兑现空间超过100%未更新。`;
    }
    return message;
  }

  function applyBatchParameter(project = {}, input = {}) {
    const {
      key = "",
      spec = null,
      rawValue = "",
      scope = "",
      nowIso = () => new Date().toISOString(),
      getEnvValueAllocation = () => ({ totalRatio: 0 })
    } = input;
    if (!spec) return { ok: false, message: "批量参数项无效。" };
    const parsed = parseBatchValue(spec, rawValue);
    if (parsed === null) {
      return { ok: false, message: "批量参数值无效，请输入数字。" };
    }

    const envValueRatioKeys = new Set([
      "greenCertRealizeRatio",
      "greenPremiumRealizeRatio",
      "carbonRealizeRatio"
    ]);
    const result = {
      ok: true,
      updated: 0,
      skippedBaseline: 0,
      skippedLocked: 0,
      skippedSpace: 0,
      message: ""
    };

    (project.scenarios || []).forEach((scenario) => {
      if (scope === "non_baseline" && scenario.isBaseline) {
        result.skippedBaseline += 1;
        return;
      }
      if (scenario.locked) {
        result.skippedLocked += 1;
        return;
      }
      if (key === "carbonPrice" && project.siteType !== "offshore") {
        scenario.config.carbonPrice = 0;
        scenario.config.carbonEnabled = false;
        scenario.config.carbonRealizeRatio = 0;
      } else if (key === "carbonRealizeRatio" && project.siteType !== "offshore") {
        scenario.config.carbonRealizeRatio = 0;
      } else if (envValueRatioKeys.has(key)) {
        const nextConfig = { ...scenario.config, [key]: parsed };
        if (project.siteType !== "offshore") {
          nextConfig.carbonRealizeRatio = 0;
        }
        const allocation = getEnvValueAllocation(project, nextConfig);
        if (allocation.totalRatio > 1 + 0.000001) {
          result.skippedSpace += 1;
          return;
        }
        scenario.config[key] = parsed;
      } else {
        scenario.config[key] = parsed;
      }
      confirmConfig(scenario, key === "carbonPrice" && project.siteType !== "offshore"
        ? ["carbonPrice", "carbonEnabled", "carbonRealizeRatio"] : [key]);
      scenario.updatedAt = typeof nowIso === "function" ? nowIso() : nowIso;
      result.updated += 1;
    });

    result.message = buildBatchResultMessage(result);
    return result;
  }

  return Object.freeze({
    applyBatchParameter,
    applyProvinceDefaultsToScenario,
    confirmConfig,
    createBaselineScenario,
    defaultScenarioConfig,
    isConfigConfirmed,
    normalizeLtConvergeStep,
    normalizeScenarioMetadata,
    parseBatchValue,
    renameScenario,
    sanitizeScenario
  });
});
