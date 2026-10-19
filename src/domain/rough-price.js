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

  function normalizedConfig(project, config) {
    return {
      ...(config || {}),
      mechanismReferenceMode: config?.mechanismReferenceMode === "same_type" ? "same_type" : "project_capture",
      sameTypeSpread: Number(config?.sameTypeSpread) || 0,
      // Match scenario hydration for yearly maps, including inactive carbon fields.
      // Calculation validates the raw config before these normalizers can fill defaults.
      ltManualPricesByYear: scenarioConfig.sanitizeLtManualPricesByYear(config?.ltManualPricesByYear, project),
      envManualValuesByYear: scenarioConfig.sanitizeEnvManualValuesByYear(config?.envManualValuesByYear, project),
      feeManualValuesByYear: scenarioConfig.sanitizeFeeManualValuesByYear(config?.feeManualValuesByYear, project)
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
      config: normalizedConfig(project, scenario?.config)
    });
    let hash = 2166136261;
    let second = 5381;
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
      second = Math.imul(second, 33) ^ text.charCodeAt(index);
    }
    return `rough-v1-${(hash >>> 0).toString(16)}-${(second >>> 0).toString(16)}-${text.length}`;
  }

  function validateConfig(project, config, years) {
    const errors = [];
    if (!isObject(config)) return ["当前方案缺少共用结算参数。"];
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
    if (config.mechanismReferenceMode === "same_type" && !isNumber(config.sameTypeSpread)) {
      errors.push("同类型机组价差不能为空且应为有效数字。");
    }
    if (scenarioConfig.getLtPricingMode(config) === "auto") {
      validateNumber(config, "ltYear1Pnl", "首年交易策略损益");
      validateNumber(config, "ltTargetPnl", "目标交易策略损益");
      validateNumber(config, "ltConvergeSpeed", "交易策略损益收敛步长", 0);
    }
    if (project.hasStorage) {
      [
        ["storageArbitragePrice", "配储套利收益"],
        ["storageCapacityCompPrice", "配储容量补偿"],
        ["storageAncillaryRevenuePrice", "配储辅助服务收益"],
        ["storageOtherRevenuePrice", "配储其他收益"]
      ].forEach(([key, label]) => validateNumber(config, key, label, 0));
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
      config: clone(config),
      contextFingerprint: contextFingerprint(project, scenario),
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
        version: 1,
        projectId: project.id,
        scenarioId: scenario.id,
        runId: run.id,
        contextFingerprint: contextFingerprint(project, scenario),
        generatedAt: new Date().toISOString()
      }
    };
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
    const unavailable = (reason, message, stale = false) => ({
      ...failedComparison([message], stale), reason
    });
    if (!validSnapshot(snapshot)) {
      return unavailable("missing_snapshot", "请先保存项目电价粗算，再进行交叉验证。");
    }
    const currentContext = contextFingerprint(project, scenario);
    if (snapshot.scenarioId !== scenario?.id || snapshot.contextFingerprint !== currentContext) {
      return unavailable("stale_snapshot", "共用参数、项目或电量已变化，请更新项目电价粗算后再对照。", true);
    }
    if (!isObject(result)) {
      return unavailable("missing_baseline", "请先完成基准测算，再与项目电价粗算对照。");
    }
    const source = result.sourceContext;
    if (!isObject(source) || source.version !== 1 || !source.projectId || !source.scenarioId ||
        !source.runId || typeof source.contextFingerprint !== "string" || !source.contextFingerprint ||
        typeof source.generatedAt !== "string" || !Number.isFinite(Date.parse(source.generatedAt))) {
      return unavailable("legacy_baseline", "该基准结果缺少计算口径记录，请重新发起基准测算后再对照。");
    }
    if (source.projectId !== project?.id || source.scenarioId !== scenario?.id ||
        source.contextFingerprint !== currentContext) {
      return unavailable("stale_baseline", "基准结果使用的共用参数、项目或电量已变化，请重新发起基准测算后再对照。", true);
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
      source: { ...source },
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
    if (snapshot.scenarioId !== scenario?.id || snapshot.contextFingerprint !== contextFingerprint(project, scenario)) {
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

  return Object.freeze({ defaultDraft, sanitizeWorkspace, calculateRough, compareSnapshot, compareBaselineResult, stampBaselineResult, contextFingerprint });
});
