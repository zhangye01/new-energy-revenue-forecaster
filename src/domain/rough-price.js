"use strict";

(function (root, factory) {
  const isCommonJs = typeof module !== "undefined" && module.exports;
  const api = factory(
    isCommonJs ? require("./revenue-rules") : root.NE_REVENUE_RULES,
    isCommonJs ? require("./scenario-config") : root.NE_SCENARIO_CONFIG,
    isCommonJs ? require("./revenue-calculator") : root.NE_REVENUE_CALCULATOR
  );
  if (isCommonJs) module.exports = api;
  root.NE_ROUGH_PRICE = api;
  if (root.window && root.window !== root) root.window.NE_ROUGH_PRICE = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (rules, scenarioConfig, calculator) {
  if (!rules || !scenarioConfig || !calculator) {
    throw new Error("关键参数粗算初始化失败：缺少收入规则、场景配置或收入测算模块");
  }

  const ROW_PRICE_KEYS = Object.freeze([
    "spotAvgPrice", "capturePrice", "mechanismRatio", "mechanismAdjustment",
    "ltPnlPrice", "envValue", "fee", "otherIncome", "storageSupplement", "fullRevenuePrice"
  ]);

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isNumber(value) {
    return value !== null && value !== undefined && value !== "" &&
      !(typeof value === "string" && !value.trim()) &&
      (typeof value === "number" || typeof value === "string") && Number.isFinite(Number(value));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function freezeDeep(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freezeDeep);
      Object.freeze(value);
    }
    return value;
  }

  function yearsForProject(project) {
    if (!Number.isInteger(project?.startYear) || !Number.isInteger(project?.forecastYears) ||
        project.forecastYears < 1 || project.forecastYears > 100) return [];
    return Array.from({ length: project.forecastYears }, (_, index) => project.startYear + index);
  }

  function defaultDraft(project) {
    return { spotNodes: [{ year: project?.startYear ?? null, value: null }], captureRate: 95, sourceNote: "" };
  }

  function sanitizeDraft(raw, project) {
    if (!isObject(raw)) return defaultDraft(project);
    const defaults = defaultDraft(project);
    return {
      spotNodes: Array.isArray(raw.spotNodes) ? raw.spotNodes.filter(isObject).map((node) => ({
        year: isNumber(node.year) ? Number(node.year) : null,
        value: isNumber(node.value) ? Number(node.value) : null
      })) : defaults.spotNodes,
      captureRate: isNumber(raw.captureRate) ? Number(raw.captureRate) : null,
      sourceNote: typeof raw.sourceNote === "string" ? raw.sourceNote : ""
    };
  }

  function validSnapshot(snapshot) {
    if (!isObject(snapshot) || !snapshot.id || typeof snapshot.id !== "string" ||
        typeof snapshot.scenarioId !== "string" || !snapshot.scenarioId ||
        typeof snapshot.createdAt !== "string" || !snapshot.createdAt ||
        typeof snapshot.contextFingerprint !== "string" || !snapshot.contextFingerprint ||
        !isObject(snapshot.config) || !isObject(snapshot.draft) || !isObject(snapshot.summary) ||
        !Array.isArray(snapshot.rows) || !snapshot.rows.length) return false;
    if (!["simpleAverage", "firstPrice", "lastPrice"].every((key) =>
      typeof snapshot.summary[key] === "number" && Number.isFinite(snapshot.summary[key])) ||
        !(snapshot.summary.weightedPrice === null ||
          (typeof snapshot.summary.weightedPrice === "number" && Number.isFinite(snapshot.summary.weightedPrice)))) return false;
    const years = new Set();
    return snapshot.rows.every((row) => {
      if (!isObject(row) || !Number.isInteger(row.year) || years.has(row.year) ||
          !ROW_PRICE_KEYS.every((key) => typeof row[key] === "number" && Number.isFinite(row[key])) ||
          !(row.energyMwh === null || (typeof row.energyMwh === "number" && Number.isFinite(row.energyMwh) && row.energyMwh >= 0))) return false;
      years.add(row.year);
      return true;
    });
  }

  function sanitizeWorkspace(raw, project) {
    const source = isObject(raw) ? raw : {};
    const draftsByScenario = {};
    if (isObject(source.draftsByScenario)) {
      Object.entries(source.draftsByScenario).forEach(([id, draft]) => {
        if (["__proto__", "constructor", "prototype"].includes(id)) return;
        draftsByScenario[id] = sanitizeDraft(draft, project);
      });
    }
    const seen = new Set();
    const snapshots = (Array.isArray(source.snapshots) ? source.snapshots : [])
      .filter((snapshot) => {
        if (!validSnapshot(snapshot) || seen.has(snapshot.id)) return false;
        seen.add(snapshot.id);
        return true;
      }).map((snapshot) => freezeDeep(clone(snapshot)));
    return { draftsByScenario, snapshots };
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (isObject(value)) {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  // Frozen rough-v1 normalization is read-only compatibility code. Do not replace it
  // with current input hydration or write its outputs back into historical projects.
  const legacyScenarioConfig = (() => {
    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function isPlainObject(value) {
      return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    }

    function projectYearBounds(project) {
      const startYear = Number.isInteger(project?.startYear) ? project.startYear : null;
      const forecastYears = Number.isInteger(project?.forecastYears) ? project.forecastYears : null;
      const hasValidRange = startYear !== null && forecastYears !== null && forecastYears > 0;
      return {
        startYear,
        forecastYears,
        minYear: hasValidRange ? startYear : null,
        maxYear: hasValidRange ? startYear + forecastYears - 1 : null,
        hasValidRange
      };
    }

    function isYearInProjectRange(year, project) {
      const { minYear, maxYear, hasValidRange } = projectYearBounds(project);
      return !hasValidRange || (year >= minYear && year <= maxYear);
    }

    function parseBooleanLike(value, fallback = false) {
      if (typeof value === "boolean") return value;
      const normalized = String(value ?? "").trim().toLowerCase();
      if (["yes", "y", "true", "1", "是", "启用"].includes(normalized)) return true;
      if (["no", "n", "false", "0", "否", "不启用"].includes(normalized)) return false;
      return fallback;
    }

    function sanitizeLtManualPricesByYear(rawPrices, project) {
      const next = {};
      if (!isPlainObject(rawPrices)) return next;
      Object.entries(rawPrices).forEach(([yearKey, rawValue]) => {
        const year = Number(yearKey);
        const value = Number(rawValue);
        if (!Number.isInteger(year) || !Number.isFinite(value)) return;
        if (!isYearInProjectRange(year, project)) return;
        next[year] = value;
      });
      return next;
    }

    function sanitizeEnvManualValuesByYear(rawValues, project) {
      const next = {};
      if (!isPlainObject(rawValues)) return next;
      Object.entries(rawValues).forEach(([yearKey, rawValue]) => {
        const year = Number(yearKey);
        if (!Number.isInteger(year) || !isPlainObject(rawValue)) return;
        if (!isYearInProjectRange(year, project)) return;
        const carbonEnabled = project?.siteType === "offshore" && parseBooleanLike(rawValue.carbonEnabled, Boolean(rawValue.carbonEnabled));
        const entry = {
          greenCertPrice: Number(rawValue.greenCertPrice) || 0,
          greenCertRealizeRatio: clamp(Number(rawValue.greenCertRealizeRatio) || 0, 0, 1),
          greenPremiumPrice: Number(rawValue.greenPremiumPrice) || 0,
          greenPremiumRealizeRatio: clamp(Number(rawValue.greenPremiumRealizeRatio) || 0, 0, 1),
          carbonEnabled,
          carbonPrice: carbonEnabled ? Number(rawValue.carbonPrice) || 0 : 0,
          carbonRealizeRatio: carbonEnabled ? clamp(Number(rawValue.carbonRealizeRatio) || 0, 0, 1) : 0
        };
        if (entry.greenCertRealizeRatio + entry.greenPremiumRealizeRatio + entry.carbonRealizeRatio > 1 + 0.000001) return;
        next[year] = entry;
      });
      return next;
    }

    function sanitizeFeeManualValuesByYear(rawValues, project) {
      const next = {};
      if (!isPlainObject(rawValues)) return next;
      Object.entries(rawValues).forEach(([yearKey, rawValue]) => {
        const year = Number(yearKey);
        if (!Number.isInteger(year) || !isPlainObject(rawValue)) return;
        if (!isYearInProjectRange(year, project)) return;
        const entry = {
          marketOpFee: Number(rawValue.marketOpFee) || 0,
          gridAssessFee: Number(rawValue.gridAssessFee) || 0,
          ancillaryFee: Number(rawValue.ancillaryFee) || 0,
          otherFee: Number(rawValue.otherFee) || 0,
          otherIncome: Number(rawValue.otherIncome) || 0
        };
        if (Object.values(entry).some((value) => value < 0)) return;
        next[year] = entry;
      });
      return next;
    }
    return { sanitizeLtManualPricesByYear, sanitizeEnvManualValuesByYear, sanitizeFeeManualValuesByYear };
  })();

  function normalizedConfig(project, config, normalizers = scenarioConfig) {
    return {
      ...(config || {}),
      mechanismReferenceMode: config?.mechanismReferenceMode === "same_type" ? "same_type" : "project_capture",
      sameTypeSpread: Number(config?.sameTypeSpread) || 0,
      // Build a temporary calculation/compatibility view. Never hydrate raw input
      // with it; calculation validates required fields before any normalization.
      ltManualPricesByYear: normalizers.sanitizeLtManualPricesByYear(config?.ltManualPricesByYear, project),
      envManualValuesByYear: normalizers.sanitizeEnvManualValuesByYear(config?.envManualValuesByYear, project),
      feeManualValuesByYear: normalizers.sanitizeFeeManualValuesByYear(config?.feeManualValuesByYear, project)
    };
  }

  function curveShapeForFingerprint(values) {
    if (!Array.isArray(values) || values.length !== 8760) return values || [];
    const parsed = values.map(Number);
    if (!parsed.every((value) => Number.isFinite(value) && value >= 0)) return values;
    const total = parsed.reduce((sum, value) => sum + value, 0);
    if (!(total > 0) || !Number.isFinite(total)) return values;
    // Repeated state normalization introduces floating point tails. Quantize only the signature,
    // to 1e-10 of annual energy per hour; never round the actual profile used by the calculator.
    return parsed.map((value) => Math.round(value / total * 1e10));
  }

  function contextFingerprint(project, scenario) {
    // Include electricity shape and its stored inputs, because they determine capture prices and weights.
    const energyData = project?.energyData || {};
    const text = stableStringify({
      projectId: project?.id || null,
      province: project?.province || null,
      assetType: project?.assetType || null,
      siteType: project?.siteType || null,
      capacityMw: project?.capacityMw ?? null,
      hasStorage: Boolean(project?.hasStorage),
      startYear: project?.startYear,
      forecastYears: project?.forecastYears,
      hourlyByYear: energyData.hourlyByYear || {},
      annualSummary: energyData.annualSummary || {},
      annualInputByYear: energyData.annualInputByYear || {},
      typicalCurveProfile: curveShapeForFingerprint(energyData.typicalCurveProfile),
      typicalCurveSource: energyData.typicalCurveSource || "",
      scenarioId: scenario?.id || null,
      config: normalizedConfig(project, scenario?.config, legacyScenarioConfig)
    });
    let hash = 2166136261;
    let second = 5381;
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
      second = Math.imul(second, 33) ^ text.charCodeAt(index);
    }
    return `rough-v1-${(hash >>> 0).toString(16)}-${(second >>> 0).toString(16)}-${text.length}`;
  }

  function storageContext(project) {
    const hasStorage = Boolean(project?.hasStorage);
    return {
      hasStorage,
      storagePowerMw: hasStorage ? project?.storagePowerMw ?? null : null,
      storageDurationH: hasStorage ? project?.storageDurationH ?? null : null
    };
  }

  function validStorageContext(context) {
    if (!isObject(context) || typeof context.hasStorage !== "boolean") return false;
    if (!context.hasStorage) return context.storagePowerMw === null && context.storageDurationH === null;
    return [context.storagePowerMw, context.storageDurationH].every((value) =>
      typeof value === "number" && Number.isFinite(value) && value > 0);
  }

  function currentContextFingerprint(project, scenario) {
    const text = stableStringify({
      legacyContextFingerprint: contextFingerprint(project, scenario),
      config: scenario?.config || {},
      storageContext: storageContext(project)
    });
    let hash = 2166136261, second = 5381;
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
      second = Math.imul(second, 33) ^ text.charCodeAt(index);
    }
    return `rough-v2-${(hash >>> 0).toString(16)}-${(second >>> 0).toString(16)}-${text.length}`;
  }

  function inputSourceContext(project, scenario) {
    return {
      version: 2, fingerprintVersion: "rough-v2",
      projectId: project?.id, scenarioId: scenario?.id,
      contextFingerprint: currentContextFingerprint(project, scenario),
      storageContext: storageContext(project)
    };
  }

  function validCurrentSource(source) {
    return isObject(source) && source.version === 2 && source.fingerprintVersion === "rough-v2"
      && typeof source.contextFingerprint === "string" && source.contextFingerprint.startsWith("rough-v2-")
      && validStorageContext(source.storageContext);
  }

  function snapshotContextMatches(project, scenario, snapshot, config) {
    if (snapshot.scenarioId !== scenario?.id) return false;
    const source = snapshot.sourceContext;
    const fingerprint = source ? currentContextFingerprint : contextFingerprint;
    if (source && (!validCurrentSource(source) || source.scenarioId !== snapshot.scenarioId ||
      source.contextFingerprint !== snapshot.contextFingerprint ||
      stableStringify(source.storageContext) !== stableStringify(storageContext(project)))) return false;
    if (!source && !snapshot.contextFingerprint.startsWith("rough-v1-")) return false;
    const originalScenario = { ...scenario, config };
    const matches = (candidate) => (!source || source.projectId === candidate.id)
      && snapshot.contextFingerprint === fingerprint(candidate, originalScenario);
    if (matches(project)) return true;
    const sourceIds = Array.from(new Set([project?.restoredFromProjectId,
      ...(Array.isArray(project?.restoredFromProjectIds) ? project.restoredFromProjectIds : [])]));
    // Restore changes only the candidate identity; never backfill metadata or rewrite snapshots.
    return sourceIds.some((sourceId) => typeof sourceId === "string" && Boolean(sourceId.trim()) && sourceId !== project.id
      && matches({ ...project, id: sourceId }));
  }

  function snapshotState(project, scenario, snapshot) {
    if (!validSnapshot(snapshot)) {
      return { comparable: false, refined: false, reason: "missing_snapshot", message: "请先保存项目电价粗算，再进行交叉验证。" };
    }
    // Keep the original config in the signature so existing snapshots remain usable after
    // revenue assumptions are refined, without changing their immutable prices or inputs.
    if (!snapshotContextMatches(project, scenario, snapshot, snapshot.config)) {
      return { comparable: false, refined: false, reason: "stale_snapshot", message: "项目、测算期或电量口径已变化，请更新项目电价粗算后再对照。" };
    }
    if (!snapshot.sourceContext && project?.hasStorage) {
      return { comparable: false, refined: false, reason: "legacy_storage_context",
        message: "历史配储边界待核对：原粗算未记录配储功率和时长，保留原快照，暂不能交叉验证。" };
    }
    const refined = snapshot.sourceContext
      ? stableStringify(snapshot.config) !== stableStringify(scenario?.config)
      : stableStringify(normalizedConfig(project, snapshot.config, legacyScenarioConfig)) !==
        stableStringify(normalizedConfig(project, scenario?.config, legacyScenarioConfig));
    return { comparable: true, refined, reason: "", message: refined ? "收益参数已细化，保留原粗算与基准结果对照。" : "" };
  }

  function validateConfig(project, config, years = yearsForProject(project), forBaseline = false) {
    const errors = [];
    if (!isObject(config)) return ["当前方案缺少共用结算参数。"];
    if (!years.length) errors.push("项目测算起始年份或年限无效，请先核对项目基础信息。");
    const modes = [["ltPricingMode", ["auto", "manual"], "交易策略配置方式"],
      ["envValueMode", ["global", "manual"], "环境价值配置方式"],
      ["feeConfigMode", ["global", "manual"], "费用配置方式"]];
    modes.forEach(([key, allowed, label]) => {
      if (Object.hasOwn(config, key) && !allowed.includes(config[key])) errors.push(`${label}无效，请明确选择。`);
    });
    if (Object.hasOwn(config, "mechanismEnabled") && typeof config.mechanismEnabled !== "boolean") errors.push("是否启用机制电价需要明确选择。");
    if (config.mechanismEnabled && Object.hasOwn(config, "mechanismReferenceMode")
        && !["project_capture", "same_type"].includes(config.mechanismReferenceMode)) errors.push("机制补差参照口径无效，请明确选择。");
    if (project.siteType === "offshore" && scenarioConfig.getEnvValueMode(config) !== "manual"
        && Object.hasOwn(config, "carbonEnabled") && typeof config.carbonEnabled !== "boolean") errors.push("是否启用碳收益需要明确选择。");
    if (scenarioConfig.getLtPricingMode(config) === "auto" && config.ltConvergeSpeedUnit === "legacy_ratio"
        && Number(config.ltConvergeSpeed) > 1) errors.push("历史收敛比例应在0至1之间。");
    if (project?.hasStorage && !validStorageContext(storageContext(project))) {
      errors.push("配储功率和时长须为大于0的有效数字，请先核对项目基础信息。");
    }
    const validateNumber = (source, key, label, min = -Infinity, max = Infinity) => {
      if (!isNumber(source?.[key])) {
        errors.push(`${label}不能为空且应为有效数字。`);
      } else if (Number(source[key]) < min || Number(source[key]) > max) {
        errors.push(max === 1 ? `${label}应在0%至100%之间。` : `${label}不能为负数。`);
      }
    };
    if (config.mechanismEnabled) {
      validateNumber(config, "mechanismPrice", "机制电价", 0);
      if (!isNumber(config.mechanismRatio) || Number(config.mechanismRatio) < 0 || Number(config.mechanismRatio) > 1) {
        errors.push("机制占比应在0%至100%之间。");
      }
      const ymValid = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value));
      if (!ymValid(config.mechanismStartYm) || !ymValid(config.mechanismEndYm) ||
          rules.monthSerial(config.mechanismStartYm) > rules.monthSerial(config.mechanismEndYm)) {
        errors.push("请先检查机制执行起止年月。");
      }
    }
    if (config.mechanismEnabled && config.mechanismReferenceMode === "same_type" && !isNumber(config.sameTypeSpread)) {
      errors.push("同类型机组价差不能为空且应为有效数字。");
    }
    if (scenarioConfig.getLtPricingMode(config) === "auto") {
      validateNumber(config, "ltYear1Pnl", "首年交易策略损益");
      validateNumber(config, "ltTargetPnl", "目标交易策略损益");
      validateNumber(config, "ltConvergeSpeed", "交易策略损益收敛步长", 0);
    }
    if (project.hasStorage) {
      [
        ...(!forBaseline ? [["storageArbitragePrice", "配储套利收益"]] : []),
        ["storageCapacityCompPrice", "配储容量补偿"],
        ["storageAncillaryRevenuePrice", "配储辅助服务收益"],
        ["storageOtherRevenuePrice", "配储其他收益"]
      ].forEach(([key, label]) => validateNumber(config, key, label, 0));
      const efficiency = config.storageRoundTripEfficiency;
      if (forBaseline && efficiency != null &&
          (!Number.isFinite(efficiency) || efficiency <= 0 || efficiency > 1)) {
        errors.push("配储往返效率应大于0%且不超过100%。");
      }
    }
    const completeness = [
      [scenarioConfig.getLtPricingMode(config), scenarioConfig.getLtManualCompleteness(project, config), "交易策略损益"],
      [scenarioConfig.getEnvValueMode(config), scenarioConfig.getEnvManualCompleteness(project, config), "环境价值"],
      [scenarioConfig.getFeeConfigMode(config), scenarioConfig.getFeeManualCompleteness(project, config), "综合费用及其他收入"]
    ];
    completeness.forEach(([mode, item, label]) => {
      if (mode === "manual" && item.complete !== item.total) {
        errors.push(`逐年${label}配置不完整，缺少：${item.missingYears.join("、")}。`);
      }
    });
    if (scenarioConfig.getLtPricingMode(config) === "manual") {
      const missing = years.filter((year) => !isNumber(config.ltManualPricesByYear?.[year]));
      if (missing.length && !errors.some((error) => error.includes("逐年交易策略"))) {
        errors.push(`逐年交易策略损益配置不完整，缺少：${missing.join("、")}。`);
      }
    }
    years.forEach((year) => {
      const env = scenarioConfig.getEnvValueMode(config) === "manual"
        ? config.envManualValuesByYear?.[year] : config;
      if (isObject(env)) {
        const paths = [
          ["greenCertPrice", "greenCertRealizeRatio", "绿证"],
          ["greenPremiumPrice", "greenPremiumRealizeRatio", "绿电溢价"]
        ];
        if (project.siteType === "offshore" && env.carbonEnabled) paths.push(["carbonPrice", "carbonRealizeRatio", "碳收益"]);
        paths.forEach(([priceKey, ratioKey, label]) => {
          validateNumber(env, priceKey, `${year}年${label}价格`, 0);
          validateNumber(env, ratioKey, `${year}年${label}兑现比例`, 0, 1);
        });
        const ratioSum = paths.reduce((sum, [, ratioKey]) => sum + Number(env[ratioKey]), 0);
        if (Number.isFinite(ratioSum) && ratioSum > 1 + 0.000001) {
          errors.push(`${year}年环境价值兑现比例合计不能超过100%。`);
        }
      }
      const fees = scenarioConfig.getFeeConfigMode(config) === "manual"
        ? config.feeManualValuesByYear?.[year] : config;
      if (isObject(fees)) {
        [
          ["marketOpFee", "市场运营费"], ["gridAssessFee", "电网考核费"],
          ["ancillaryFee", "辅助服务费"], ["otherFee", "其他费用"], ["otherIncome", "其他收入"]
        ].forEach(([key, label]) => validateNumber(fees, key, `${year}年${label}`, 0));
      }
    });
    return [...new Set(errors)];
  }

  function validateBaselineConfig(project, config) {
    return validateConfig(project, config, yearsForProject(project), true);
  }

  function storedEnergyMwh(project, year) {
    const hours = project?.energyData?.hourlyByYear?.[year];
    const capacity = Number(project?.capacityMw);
    if (Array.isArray(hours) && hours.length === 8760 && Number.isFinite(capacity) && capacity > 0 &&
        hours.every((value) => isNumber(value) && Number(value) >= 0)) {
      return hours.reduce((sum, value) => sum + Number(value), 0) * capacity;
    }
    const summary = project?.energyData?.annualSummary?.[year];
    if (summary?.status !== "缺失" && isNumber(summary?.energyMwh) && Number(summary.energyMwh) >= 0) {
      return Number(summary.energyMwh);
    }
    return null;
  }

  function weightedPrice(rows, priceKey) {
    if (!rows.length || rows.some((row) => !Number.isFinite(row.energyMwh) || row.energyMwh < 0)) return null;
    const energy = rows.reduce((sum, row) => sum + row.energyMwh, 0);
    return energy > 0 ? rows.reduce((sum, row) => sum + row[priceKey] * row.energyMwh, 0) / energy : null;
  }

  function calculateRough(project, scenario, draft, options = {}) {
    const years = yearsForProject(project);
    const errors = years.length ? validateConfig(project, scenario?.config, years) : ["项目测算起始年份或年限无效。"];
    if (!scenario?.id) errors.push("请先选择测算方案。");
    const input = sanitizeDraft(draft, project);
    if (!isNumber(input.captureRate) || input.captureRate < 0 || input.captureRate > 150) {
      errors.push("预期捕获率应在0%至150%之间。");
    }
    const nodes = input.spotNodes.slice().sort((left, right) => left.year - right.year);
    const seen = new Set();
    nodes.forEach((node) => {
      if (!Number.isInteger(node.year) || !years.includes(node.year)) errors.push("现货价格节点年份应位于项目测算周期内。");
      if (seen.has(node.year)) errors.push(`${node.year}年现货价格节点重复，请保留一项。`);
      seen.add(node.year);
      if (!isNumber(node.value)) errors.push(`${node.year ?? "待填年份"}年现货均价不能为空且应为有效数字。`);
    });
    if (!nodes.length || nodes[0].year !== years[0]) errors.push("请填写测算起始年份的现货均价，以覆盖全部测算年份。");
    if (errors.length) return { ok: false, errors: [...new Set(errors)], snapshot: null };
    const config = normalizedConfig(project, scenario?.config);
    input.spotNodes = nodes;
    const rows = years.map((year, index) => {
      const node = nodes.filter((item) => item.year <= year).slice(-1)[0];
      const spotAvgPrice = node.value;
      const capturePrice = spotAvgPrice * input.captureRate / 100;
      const months = config.mechanismEnabled
        ? rules.mechanismActiveMonthsForYear(year, config.mechanismStartYm, config.mechanismEndYm) : 0;
      const mechanismRatio = config.mechanismEnabled ? Number(config.mechanismRatio) * months / 12 : 0;
      const mechanismAdjustment = mechanismRatio * ((Number(config.mechanismPrice) || 0) - rules.mechanismReferencePrice(config, capturePrice));
      const ltPnlPrice = rules.tradeStrategyPnlPriceForYear(config, index + 1, year);
      const envValue = (1 - mechanismRatio) * rules.getEnvValueAllocation(project, config, year).unitValuePerMarketMwh;
      const fees = rules.getFeeConfigForYear(project, config, year);
      const fee = fees.marketOpFee + fees.gridAssessFee + fees.ancillaryFee + fees.otherFee;
      const storageSupplement = project.hasStorage ? [
        config.storageArbitragePrice, config.storageCapacityCompPrice,
        config.storageAncillaryRevenuePrice, config.storageOtherRevenuePrice
      ].reduce((sum, value) => sum + (Number(value) || 0), 0) : 0;
      return {
        year, spotAvgPrice, capturePrice, mechanismRatio, mechanismAdjustment, ltPnlPrice,
        envValue, fee, otherIncome: fees.otherIncome, storageSupplement,
        fullRevenuePrice: capturePrice + mechanismAdjustment + (1 - mechanismRatio) * ltPnlPrice +
          envValue + storageSupplement - fee + fees.otherIncome,
        energyMwh: storedEnergyMwh(project, year)
      };
    });
    if (rows.some((row) => !ROW_PRICE_KEYS.every((key) => Number.isFinite(row[key])))) {
      return { ok: false, errors: ["价格或共用参数超出有效数字范围，请检查输入。"], snapshot: null };
    }
    const snapshot = freezeDeep({
      id: options.id || `rough-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      scenarioId: scenario.id,
      scenarioName: scenario.name || "当前方案",
      createdAt: options.createdAt || new Date().toISOString(),
      draft: clone(input),
      config: clone(scenario.config),
      calculationConfig: clone(config),
      sourceContext: inputSourceContext(project, scenario),
      contextFingerprint: currentContextFingerprint(project, scenario),
      rows,
      summary: {
        weightedPrice: weightedPrice(rows, "fullRevenuePrice"),
        simpleAverage: rows.reduce((sum, row) => sum + row.fullRevenuePrice, 0) / rows.length,
        firstPrice: rows[0].fullRevenuePrice,
        lastPrice: rows[rows.length - 1].fullRevenuePrice
      }
    });
    return { ok: true, errors: [], snapshot };
  }

  function failedComparison(errors, stale = false) {
    return { ok: false, errors, rows: [], summary: {}, stale };
  }

  function stampBaselineResult(project, scenario, run, result) {
    if (!isObject(result) || !project?.id || !scenario?.id || !run?.id) return result;
    return {
      ...result,
      sourceContext: {
        ...inputSourceContext(project, scenario),
        runId: run.id,
        generatedAt: new Date().toISOString()
      }
    };
  }

  function baselineResultState(project, scenario, result) {
    const state = (current, reason, message) => ({ current, reason, message });
    if (!isObject(result)) return state(false, "missing_baseline", "请先发起基准测算。");
    const source = result.sourceContext;
    if (!isObject(source) || ![1, 2].includes(source.version) || !source.projectId || !source.scenarioId ||
        !source.runId || typeof source.contextFingerprint !== "string" || !source.contextFingerprint ||
        typeof source.generatedAt !== "string" || !Number.isFinite(Date.parse(source.generatedAt)) ||
        (source.version === 2 && !validCurrentSource(source)) ||
        (source.version === 1 && !source.contextFingerprint.startsWith("rough-v1-"))) {
      return state(false, "legacy_baseline", "当前展示历史结果，缺少计算口径记录，请重新发起基准测算。");
    }
    const fingerprint = source.version === 2 ? currentContextFingerprint : contextFingerprint;
    if (source.projectId !== project?.id || source.scenarioId !== scenario?.id ||
        source.contextFingerprint !== fingerprint(project, scenario) ||
        (source.version === 2 && stableStringify(source.storageContext) !== stableStringify(storageContext(project)))) {
      return state(false, "stale_context", "项目、电量或收入配置已变化，当前展示历史结果，请重新发起基准测算。");
    }
    if (source.version === 1 && project?.hasStorage) {
      return state(false, "legacy_storage_context", "历史配储边界待核对：原结果未记录配储功率和时长，请核对后重新测算。");
    }
    if (source.runId !== project?.activeRunId) {
      return state(false, "stale_run", "生效现货预测已变化，当前展示旧预测版本的结果，请重新发起基准测算。");
    }
    return state(true, "", "");
  }

  function comparisonRows(snapshot, fine) {
    return snapshot.rows.map((rough) => {
      const fineRow = fine.annualRows.find((item) => item.year === rough.year);
      const perMwh = (amount) => Number.isFinite(amount) ? amount / fineRow.energyMwh : null;
      const delta = fineRow.fullRevenuePrice - rough.fullRevenuePrice;
      return {
        year: rough.year,
        roughSpot: rough.spotAvgPrice,
        fineSpot: fineRow.spotAvgPrice,
        roughCapture: rough.capturePrice,
        fineCapture: fineRow.capturePrice,
        roughSettlement: rough.fullRevenuePrice,
        fineSettlement: fineRow.fullRevenuePrice,
        delta,
        relativeDelta: Math.abs(rough.fullRevenuePrice) < 0.000001 ? null : delta / Math.abs(rough.fullRevenuePrice),
        fineCaptureRate: Math.abs(fineRow.spotAvgPrice) < 0.000001 ? null : fineRow.capturePrice / fineRow.spotAvgPrice * 100,
        roughBreakdown: clone(rough),
        fineBreakdown: {
          year: rough.year,
          spotAvgPrice: fineRow.spotAvgPrice,
          capturePrice: fineRow.capturePrice,
          mechanismRatio: Number.isFinite(fineRow.mechanismRatio) ? fineRow.mechanismRatio : null,
          mechanismAdjustment: perMwh(fineRow.mechanismRevenue),
          ltPnlPrice: Number.isFinite(fineRow.ltPnlPrice) ? fineRow.ltPnlPrice : null,
          envValue: perMwh(fineRow.envRevenue),
          fee: perMwh(fineRow.comprehensiveFee),
          otherIncome: perMwh(fineRow.otherIncome),
          storageSupplement: perMwh(fineRow.storageSupplementRevenue),
          fullRevenuePrice: fineRow.fullRevenuePrice,
          energyMwh: fineRow.energyMwh
        }
      };
    });
  }

  function compareBaselineResult(project, scenario, snapshot, result) {
    const roughState = snapshotState(project, scenario, snapshot);
    const unavailable = (reason, message, stale = false) => ({
      ...failedComparison([message], stale), reason, snapshotState: roughState
    });
    if (!roughState.comparable) {
      return unavailable(roughState.reason, roughState.message, roughState.reason === "stale_snapshot");
    }
    if (!isObject(result)) {
      return unavailable("missing_baseline", "请先完成基准测算，再与项目电价粗算对照。");
    }
    const source = result.sourceContext;
    const baselineState = baselineResultState(project, scenario, result);
    if (!baselineState.current && baselineState.reason !== "stale_run") {
      return unavailable(baselineState.reason === "stale_context" ? "stale_baseline" : baselineState.reason,
        baselineState.message, baselineState.reason === "stale_context");
    }
    const years = yearsForProject(project);
    const rows = result.annualRows;
    if (!years.length || !Array.isArray(rows) || rows.length !== years.length ||
        snapshot.rows.length !== years.length || !years.every((year) => snapshot.rows.some((row) => row.year === year)) ||
        new Set(rows.map((row) => row?.year)).size !== years.length ||
        !years.every((year) => rows.some((row) => row?.year === year)) ||
        result.missingYears?.length || !Number.isFinite(result.avgFullRevenuePrice) ||
        !rows.every((row) => [row.spotAvgPrice, row.capturePrice, row.fullRevenuePrice].every(Number.isFinite))) {
      return unavailable("invalid_baseline", "基准结果年度价格不完整或无效，请重新发起基准测算后再对照。");
    }
    const energyMismatch = snapshot.rows.filter((rough) => {
      const fineRow = rows.find((row) => row.year === rough.year);
      return !(Number.isFinite(rough.energyMwh) && rough.energyMwh > 0) ||
        !(Number.isFinite(fineRow.energyMwh) && fineRow.energyMwh > 0) ||
        Math.abs(fineRow.energyMwh - rough.energyMwh) > Math.max(0.000001, Math.abs(rough.energyMwh) * 0.00000001);
    });
    if (energyMismatch.length || !Number.isFinite(snapshot.summary.weightedPrice)) {
      return unavailable("energy_mismatch", `粗算与基准结果年度电量不完整或不一致，请核对电量并更新两侧结果：${energyMismatch.map((row) => row.year).join("、")}。`);
    }
    const comparedRows = comparisonRows(snapshot, result);
    const delta = result.avgFullRevenuePrice - snapshot.summary.weightedPrice;
    const relativeDelta = Math.abs(snapshot.summary.weightedPrice) < 0.000001
      ? null : delta / Math.abs(snapshot.summary.weightedPrice);
    return {
      ok: true, errors: [], stale: false, reason: "",
      source: clone(source),
      snapshotState: roughState,
      baselineState,
      rows: comparedRows,
      summary: {
        weightedRough: snapshot.summary.weightedPrice,
        // The overview's saved value is authoritative; never rerun or reconstruct it here.
        weightedFine: result.avgFullRevenuePrice,
        maxAbsDelta: Math.max(...comparedRows.map((row) => Math.abs(row.delta))),
        delta, relativeDelta, weightedDelta: delta, weightedRelativeDelta: relativeDelta
      }
    };
  }

  function calculationProjectCopy(project) {
    const excluded = new Set([
      "priceRuns", "quarterPrices", "pricesByYear", "results", "resultsByScenario", "roughPrice", "energyData"
    ]);
    const copy = {};
    Object.keys(project).forEach((key) => {
      if (excluded.has(key)) return;
      const value = project[key];
      if (value === null || ["string", "number", "boolean"].includes(typeof value)) copy[key] = value;
    });
    copy.energyData = clone(project.energyData || {});
    return copy;
  }

  function compareSnapshot(project, scenario, snapshot, run, getHourlyEnergyForCalculation) {
    if (!validSnapshot(snapshot)) return failedComparison(["请选择有效的粗算版本。"]);
    const roughState = snapshotState(project, scenario, snapshot);
    if (!roughState.comparable) return failedComparison([roughState.message], roughState.reason === "stale_snapshot");
    if (!snapshotContextMatches(project, scenario, snapshot, scenario?.config)) {
      return failedComparison(["共用参数、项目或电量已变化，请生成新版粗算后再交叉验证。"], true);
    }
    const years = yearsForProject(project);
    const configErrors = validateConfig(project, scenario.config, years);
    if (configErrors.length) return failedComparison(configErrors);
    if (!run || !isObject(run.pricesByYear)) return failedComparison(["请选择已有的精算预测版本。"]);
    const priceMissing = years.filter((year) => !Array.isArray(run.pricesByYear[year]) ||
      run.pricesByYear[year].length !== 8760 || !run.pricesByYear[year].every(isNumber));
    if (priceMissing.length) return failedComparison([`精算价格曲线不完整，缺少或无效：${priceMissing.join("、")}。`]);
    const storedEnergyMissing = years.filter((year) => !(storedEnergyMwh(project, year) > 0));
    if (storedEnergyMissing.length) {
      return failedComparison([`请先补齐已有年度电量再交叉验证：${storedEnergyMissing.join("、")}。`]);
    }
    // The existing energy helper may populate derived curves. Work on a private copy so validation never edits the project.
    const calculationProject = calculationProjectCopy(project);
    const resolvedHours = {};
    years.forEach((year, index) => {
      const values = typeof getHourlyEnergyForCalculation === "function"
        ? getHourlyEnergyForCalculation(calculationProject, year, index + 1)
        : calculationProject.energyData?.hourlyByYear?.[year];
      resolvedHours[year] = values;
    });
    const energyMissing = years.filter((year) => !Array.isArray(resolvedHours[year]) ||
      resolvedHours[year].length !== 8760 || !resolvedHours[year].every((value) => isNumber(value) && Number(value) >= 0) ||
      resolvedHours[year].reduce((sum, value) => sum + Number(value), 0) <= 0);
    if (energyMissing.length) return failedComparison([`精算电量曲线不完整或电量为零：${energyMissing.join("、")}。`]);
    if (!isNumber(project.capacityMw) || Number(project.capacityMw) <= 0) return failedComparison(["项目装机容量无效。"]);
    const calculationRun = { pricesByYear: Object.fromEntries(years.map((year) => [year, run.pricesByYear[year].map(Number)])) };
    const fine = calculator.calculateScenarioResult(calculationProject, { ...scenario, config: clone(snapshot.config) }, calculationRun, {
      getHourlyEnergyForCalculation: (_project, year) => resolvedHours[year].map(Number)
    });
    if (fine.missingYears.length) return failedComparison([`精算数据不完整：${fine.missingYears.join("、")}。`]);
    if (!Number.isFinite(fine.avgFullRevenuePrice) || fine.annualRows.some((row) =>
      ![row.spotAvgPrice, row.capturePrice, row.fullRevenuePrice].every(Number.isFinite))) {
      return failedComparison(["精算价格或金额超出有效数字范围，请检查输入。"]);
    }
    const energyMismatch = snapshot.rows.filter((rough) => {
      const fineRow = fine.annualRows.find((item) => item.year === rough.year);
      return !fineRow || !Number.isFinite(fineRow.energyMwh) || !Number.isFinite(rough.energyMwh) ||
        Math.abs(fineRow.energyMwh - rough.energyMwh) > Math.max(0.000001, Math.abs(rough.energyMwh) * 0.00000001);
    });
    if (energyMismatch.length) {
      return failedComparison([`粗算与精算存在电量口径差异，请核对年度电量及曲线后重新生成粗算：${energyMismatch.map((row) => row.year).join("、")}。`]);
    }
    const rows = comparisonRows(snapshot, fine);
    return {
      ok: true,
      errors: [],
      stale: false,
      rows,
      summary: {
        maxAbsDelta: Math.max(...rows.map((row) => Math.abs(row.delta))),
        weightedRough: snapshot.summary.weightedPrice,
        weightedFine: fine.avgFullRevenuePrice
      }
    };
  }

  return Object.freeze({ defaultDraft, sanitizeWorkspace, calculateRough, compareSnapshot, compareBaselineResult, stampBaselineResult, baselineResultState, snapshotState, contextFingerprint, currentContextFingerprint, validateConfig, validateBaselineConfig });
});
