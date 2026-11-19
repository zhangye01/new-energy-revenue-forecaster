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

  const LEGACY_FEE_VALUE_KEYS = scenarioConfig.LEGACY_FEE_VALUE_KEYS;
  const LEGACY_STORAGE_CONFIG_KEYS = [
    "storageArbitragePrice", "storageCapacityCompPrice", "storageAncillaryRevenuePrice",
    "storageOtherRevenuePrice", "storageRoundTripEfficiency"
  ];
  const LEGACY_CONFIG_KEYS = new Set([...scenarioConfig.LEGACY_ENV_VALUE_KEYS, ...LEGACY_FEE_VALUE_KEYS, ...LEGACY_STORAGE_CONFIG_KEYS]);
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
      feeConfigMode: "global",
      feeManualValuesByYear: {},
      marketOpFee: provinceDefaults.marketOpFee,
      gridAssessFee: provinceDefaults.gridAssessFee,
      ancillaryFee: provinceDefaults.ancillaryFee,
      otherNetIncome: 2 - provinceDefaults.otherFee,
      storageArbitragePrice: project?.hasStorage ? provinceDefaults.storageArbitragePrice : 0,
      storageCapacityCompPrice: project?.hasStorage ? provinceDefaults.storageCapacityCompPrice : 0,
      storageAncillaryRevenuePrice: project?.hasStorage ? provinceDefaults.storageAncillaryRevenuePrice : 0,
      storageOtherRevenuePrice: project?.hasStorage ? provinceDefaults.storageOtherRevenuePrice : 0
    };
  }

  // Historical storage fields stay readable for saved inputs and rough estimates.
  const CONFIG_KEYS = new Set(Object.keys(defaultScenarioConfig()).filter((key) => !LEGACY_STORAGE_CONFIG_KEYS.includes(key)));
  const ANNUAL_CONFIG_KEYS = new Set(["ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"]);
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
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function isOtherNetIncomeConfirmed(scenario, value) {
    const config = scenario?.config || {};
    const confirmed = scenario?.confirmedConfig || {};
    const current = scenarioConfig.getOtherNetIncome(config);
    const displayed = value === undefined ? current : scenarioConfig.getOtherNetIncome({ otherNetIncome: value });
    if (current === null || displayed !== current) return false;
    if (Object.hasOwn(confirmed, "otherNetIncome")) return scenarioConfig.getOtherNetIncome(confirmed) === current;
    const legacy = { otherFee: config.otherFee, otherIncome: config.otherIncome };
    return scenarioConfig.getOtherNetIncome(legacy) === current && LEGACY_FEE_VALUE_KEYS.every((key) => (
      Object.hasOwn(confirmed, key) && sameConfigValue(confirmed[key], config[key])
      && CONFIRMATION_SOURCES.has(scenario?.confirmedConfigSources?.[key])
    ));
  }

  function isConfigConfirmed(scenario, key, value = scenario?.config?.[key]) {
    if (key === "otherNetIncome") return isOtherNetIncomeConfirmed(scenario, value);
    return (CONFIG_KEYS.has(key) || LEGACY_FEE_VALUE_KEYS.includes(key) || LEGACY_STORAGE_CONFIG_KEYS.includes(key))
      // A partly edited historical table does not prove that its remaining years
      // were reviewed. Require explicit table confirmation regardless of old migrations.
      && (!ANNUAL_CONFIG_KEYS.has(key) || scenario?.confirmedConfigSources?.[key] === "explicit")
      && isPlainObject(scenario?.confirmedConfig)
      && Object.prototype.hasOwnProperty.call(scenario.confirmedConfig, key)
      && sameConfigValue(scenario.confirmedConfig[key], value);
  }

  function confirmConfig(scenario, keys, options = {}) {
    if (!scenario || scenario.locked || !isPlainObject(scenario.config)) return false;
    if (!isPlainObject(scenario.confirmedConfig)) scenario.confirmedConfig = {};
    if (!isPlainObject(scenario.confirmedConfigSources)) scenario.confirmedConfigSources = {};
    if (options.project) invalidateInactiveConfirmations(options.project, scenario);
    const source = CONFIRMATION_SOURCES.has(options.source) ? options.source : "explicit";
    const selectedKeys = keys === undefined ? new Set([...Object.keys(scenario.config), "otherNetIncome"])
      : (Array.isArray(keys) ? keys : [keys]);
    const applicable = options.project ? new Set(scenarioConfig.applicableConfigKeys(options.project, scenario.config)) : null;
    selectedKeys.forEach((key) => {
      const value = key === "otherNetIncome" ? scenarioConfig.getOtherNetIncome(scenario.config) : scenario.config[key];
      const available = key === "otherNetIncome" ? value !== null : Object.hasOwn(scenario.config, key) && value !== undefined;
      if ((!applicable || applicable.has(key)) && CONFIG_KEYS.has(key) && available) {
        scenario.confirmedConfig[key] = cloneConfigValue(value);
        scenario.confirmedConfigSources[key] = source;
      }
    });
    return true;
  }

  function retainConfirmationEvidence(scenario) {
    if (scenario.confirmationEvidence || !Object.keys(scenario.confirmedConfig || {}).length) return;
    scenario.confirmationEvidence = {
      confirmedConfig: cloneConfigValue(scenario.confirmedConfig),
      confirmedConfigSources: cloneConfigValue(scenario.confirmedConfigSources || {})
    };
  }

  function invalidateInactiveConfirmations(project, scenario) {
    const applicable = new Set(scenarioConfig.applicableConfigKeys(project, scenario.config));
    Object.keys(scenario.confirmedConfig || {}).forEach((key) => {
      if (applicable.has(key) || LEGACY_CONFIG_KEYS.has(key)) return;
      retainConfirmationEvidence(scenario);
      delete scenario.confirmedConfig[key];
      if (scenario.confirmedConfigSources) delete scenario.confirmedConfigSources[key];
    });
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
        feeConfigMode: scenarioConfig.getFeeConfigMode(merged),
        feeManualValuesByYear: scenarioConfig.sanitizeFeeManualValuesByYear(merged.feeManualValuesByYear, project),
        marketOpFee: finiteOrFallback(merged.marketOpFee, baseConfig.marketOpFee),
        gridAssessFee: finiteOrFallback(merged.gridAssessFee, baseConfig.gridAssessFee),
        ancillaryFee: finiteOrFallback(merged.ancillaryFee, baseConfig.ancillaryFee),
        otherNetIncome: finiteOrFallback(merged.otherNetIncome, baseConfig.otherNetIncome),
        storageArbitragePrice: finiteOrFallback(merged.storageArbitragePrice, baseConfig.storageArbitragePrice),
        storageCapacityCompPrice: finiteOrFallback(merged.storageCapacityCompPrice, baseConfig.storageCapacityCompPrice),
        storageAncillaryRevenuePrice: finiteOrFallback(merged.storageAncillaryRevenuePrice, baseConfig.storageAncillaryRevenuePrice),
        storageOtherRevenuePrice: finiteOrFallback(merged.storageOtherRevenuePrice, baseConfig.storageOtherRevenuePrice)
      },
      updatedAt: typeof scenario.updatedAt === "string" && scenario.updatedAt ? scenario.updatedAt : resolveNowIso(options)
    };
    // Hydration must not repair stored input. Preserve nulls, inactive values,
    // partial/extra-year maps and precision; validate a separate calculation view.
    next.config = { ...next.config, ...cloneConfigValue(srcConfig) };
    if (!Object.hasOwn(srcConfig, "otherNetIncome") && LEGACY_FEE_VALUE_KEYS.some((key) => Object.hasOwn(srcConfig, key))) {
      delete next.config.otherNetIncome;
    }
    if (srcConfig.ltConvergeSpeedUnit !== "fixed_step" && Number(srcConfig.ltConvergeSpeed) > 0
        && Number(srcConfig.ltConvergeSpeed) <= 1 && Number(srcConfig.ltYear1Pnl) !== Number(srcConfig.ltTargetPnl)) {
      next.config.ltConvergeSpeedUnit = "legacy_ratio";
    }
    if (scenario.confirmationEvidence) next.confirmationEvidence = cloneConfigValue(scenario.confirmationEvidence);
    else if (Object.keys(scenario.confirmedConfig || {}).length) {
      next.confirmationEvidence = { confirmedConfig: cloneConfigValue(scenario.confirmedConfig),
        confirmedConfigSources: cloneConfigValue(scenario.confirmedConfigSources || {}) };
    }
    for (const key of LEGACY_CONFIG_KEYS) {
      if (!project.hasStorage && LEGACY_STORAGE_CONFIG_KEYS.includes(key)) continue;
      if (Object.hasOwn(scenario.confirmedConfig || {}, key)) next.confirmedConfig[key] = cloneConfigValue(scenario.confirmedConfig[key]);
      if (Object.hasOwn(scenario.confirmedConfigSources || {}, key)) next.confirmedConfigSources[key] = cloneConfigValue(scenario.confirmedConfigSources[key]);
    }
    const annualCoverage = {
      ltManualPricesByYear: scenarioConfig.getLtManualCompleteness,
      envManualValuesByYear: scenarioConfig.getEnvManualCompleteness,
      feeManualValuesByYear: scenarioConfig.getFeeManualCompleteness
    };
    const roughSnapshots = Array.isArray(options.roughSnapshots) ? options.roughSnapshots : project.roughPrice?.snapshots;
    const reviewLegacyDefaults = !(Number(scenario.confirmationReviewVersion) >= CONFIRMATION_REVIEW_VERSION)
      && Array.isArray(roughSnapshots) && roughSnapshots.some((snapshot) => snapshot?.scenarioId === scenario.id);
    new Set([...Object.keys(next.config), "otherNetIncome"]).forEach((key) => {
      if (LEGACY_CONFIG_KEYS.has(key)) return;
      const value = key === "otherNetIncome" ? scenarioConfig.getOtherNetIncome(next.config) : next.config[key];
      if (key === "otherNetIncome" && !Object.hasOwn(scenario.confirmedConfig || {}, key)) return;
      const getCoverage = annualCoverage[key];
      if (getCoverage) {
        if (!isConfigConfirmed(scenario, key)) return;
        const value = scenario.confirmedConfig[key];
        const coverage = getCoverage(project, { [key]: value });
        if (coverage.complete !== coverage.total || !sameConfigValue(value, next.config[key])) return;
      } else if (!isConfigConfirmed(scenario, key, value)) return;
      const source = scenario.confirmedConfigSources?.[key];
      // Unknown annual confirmations were rejected above. Review ambiguous scalar
      // defaults once, retaining all values and confirmed non-default assumptions.
      if (reviewLegacyDefaults && !CONFIRMATION_SOURCES.has(source)
          && sameConfigValue(value, baseConfig[key])) return;
      next.confirmedConfig[key] = cloneConfigValue(value);
      if (CONFIRMATION_SOURCES.has(source)) next.confirmedConfigSources[key] = source;
    });
    invalidateInactiveConfirmations(project, next);
    return next;
  }

  function createBaselineScenario(project = {}, options = {}) {
    const makeId = typeof options.makeId === "function" ? options.makeId : ((prefix) => `${prefix}-baseline`);
    return {
      id: makeId("scn"),
      name: "基准方案",
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
      return { ok: false, changed: false, tone: "error", message: "当前方案已锁定，不能重命名。" };
    }
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) {
      return { ok: false, changed: false, tone: "error", message: "方案名称不能为空。" };
    }
    if (name === scenario.name) {
      return { ok: true, changed: false, tone: "success", message: "方案名称未变化。" };
    }
    const duplicatedName = (project.scenarios || []).some((item) => (
      item.id !== scenario.id && item.name === name
    ));
    if (duplicatedName) {
      return { ok: false, changed: false, tone: "error", message: "方案名称重复，请换一个名称。" };
    }
    const oldName = scenario.name;
    scenario.name = name;
    scenario.updatedAt = resolveNowIso(input);
    return { ok: true, changed: true, tone: "success", message: `方案“${oldName}”已重命名为“${scenario.name}”。` };
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
      return result.skippedInapplicable ? `没有可更新的方案；${result.skippedInapplicable} 个方案当前不适用，原值保留且未确认。`
        : "没有可更新的方案（可能被锁定或范围过滤）。";
    }
    let message = `批量更新完成：${result.updated} 个方案已更新，跳过基准 ${result.skippedBaseline} 个，跳过锁定 ${result.skippedLocked} 个。`;
    if (result.skippedSpace) {
      message += ` 另有 ${result.skippedSpace} 个方案因环境价值兑现空间超过100%未更新。`;
    }
    if (result.skippedInapplicable) message += ` 另有 ${result.skippedInapplicable} 个方案因当前不适用而保留原值、未确认。`;
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

    const envValueRatioKeys = new Set(["greenCertRealizeRatio", "greenPremiumRealizeRatio"]);
    const result = {
      ok: true,
      updated: 0,
      skippedBaseline: 0,
      skippedLocked: 0,
      skippedSpace: 0,
      skippedInapplicable: 0,
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
      invalidateInactiveConfirmations(project, scenario);
      if (!scenarioConfig.applicableConfigKeys(project, scenario.config).includes(key)) {
        result.skippedInapplicable += 1;
        return;
      }
      if (envValueRatioKeys.has(key)) {
        const nextConfig = { ...scenario.config, [key]: parsed };
        const allocation = getEnvValueAllocation(project, nextConfig);
        if (allocation.totalRatio > 1 + 0.000001) {
          result.skippedSpace += 1;
          return;
        }
      }
      scenario.config[key] = parsed;
      // The batch control is explicitly labelled 元/MWh/年. Applying it is an
      // intentional replacement, unlike opening/reviewing a legacy ratio.
      if (key === "ltConvergeSpeed") scenario.config.ltConvergeSpeedUnit = "fixed_step";
      confirmConfig(scenario, key === "ltConvergeSpeed" ? [key, "ltConvergeSpeedUnit"] : [key], { project });
      scenario.updatedAt = typeof nowIso === "function" ? nowIso() : nowIso;
      result.updated += 1;
    });

    result.message = buildBatchResultMessage(result);
    return result;
  }

  return Object.freeze({
    applyBatchParameter,
    confirmConfig,
    createBaselineScenario,
    defaultScenarioConfig,
    isConfigConfirmed,
    invalidateInactiveConfirmations,
    normalizeLtConvergeStep,
    normalizeScenarioMetadata,
    parseBatchValue,
    renameScenario,
    sanitizeScenario
  });
});
