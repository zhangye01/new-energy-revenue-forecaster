"use strict";

(function (root, factory) {
  const csvUtils = typeof module !== "undefined" && module.exports
    ? require("./csv-utils")
    : root.NE_CSV_UTILS;
  const api = factory(csvUtils);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_SCENARIO_CONFIG = api;
  if (root.window && root.window !== root) {
    root.window.NE_SCENARIO_CONFIG = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (csvUtils) {
  if (!csvUtils) {
    throw new Error("场景配置模块初始化失败：缺少 CSV 工具模块");
  }

  const LT_PRICING_MODE_SET = new Set(["auto", "manual"]);
  const ENV_VALUE_MODE_SET = new Set(["global", "manual"]);
  const FEE_CONFIG_MODE_SET = new Set(["global", "manual"]);
  const {
    normalizeCsvHeaderRow,
    parseCsvRows
  } = csvUtils;

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

  function asPercent(value) {
    return `${(Number(value) * 100).toFixed(1)}%`;
  }

  function getLtPricingMode(config) {
    return LT_PRICING_MODE_SET.has(config?.ltPricingMode) ? config.ltPricingMode : "auto";
  }

  function getEnvValueMode(config) {
    return ENV_VALUE_MODE_SET.has(config?.envValueMode) ? config.envValueMode : "global";
  }

  function getFeeConfigMode(config) {
    return FEE_CONFIG_MODE_SET.has(config?.feeConfigMode) ? config.feeConfigMode : "global";
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

  function summarizeCompleteness(project, values, isComplete) {
    const { startYear, forecastYears, hasValidRange } = projectYearBounds(project);
    if (!hasValidRange) {
      return { complete: 0, total: 0, missingYears: [] };
    }
    const missingYears = [];
    let complete = 0;
    for (let year = startYear; year < startYear + forecastYears; year += 1) {
      if (isComplete(values[year])) {
        complete += 1;
      } else {
        missingYears.push(year);
      }
    }
    return { complete, total: forecastYears, missingYears };
  }

  function getLtManualCompleteness(project, config) {
    const prices = sanitizeLtManualPricesByYear(config?.ltManualPricesByYear || {}, project);
    return {
      prices,
      ...summarizeCompleteness(project, prices, (value) => Number.isFinite(Number(value)))
    };
  }

  function getEnvManualEntryForYear(project, config, year) {
    if (getEnvValueMode(config) !== "manual") return null;
    const values = sanitizeEnvManualValuesByYear(config?.envManualValuesByYear || {}, project);
    const entry = values[year];
    return isPlainObject(entry) ? entry : null;
  }

  function getEnvManualCompleteness(project, config) {
    const values = sanitizeEnvManualValuesByYear(config?.envManualValuesByYear || {}, project);
    return {
      values,
      ...summarizeCompleteness(project, values, isPlainObject)
    };
  }

  function getFeeManualEntryForYear(project, config, year) {
    if (getFeeConfigMode(config) !== "manual") return null;
    const values = sanitizeFeeManualValuesByYear(config?.feeManualValuesByYear || {}, project);
    const entry = values[year];
    return isPlainObject(entry) ? entry : null;
  }

  function getFeeManualCompleteness(project, config) {
    const values = sanitizeFeeManualValuesByYear(config?.feeManualValuesByYear || {}, project);
    return {
      values,
      ...summarizeCompleteness(project, values, isPlainObject)
    };
  }

  function buildLtManualTemplateRows(project) {
    const rows = [["year", "trade_strategy_pnl_yuan_per_mwh"]];
    const { startYear, forecastYears, hasValidRange } = projectYearBounds(project);
    if (!hasValidRange) return rows;
    for (let index = 0; index < forecastYears; index += 1) {
      rows.push([startYear + index, ""]);
    }
    return rows;
  }

  function parseLtManualPricesCsv(csvText, project) {
    const rows = parseCsvRows(csvText);
    const header = normalizeCsvHeaderRow(rows[0] || []);
    const acceptedHeaders = new Set([
      "year,trade_strategy_pnl_yuan_per_mwh",
      "year,lt_pnl_yuan_per_mwh",
      "year,price"
    ]);
    if (!acceptedHeaders.has(header)) {
      return {
        ok: false,
        message: "表头不匹配。请使用：year,trade_strategy_pnl_yuan_per_mwh。"
      };
    }
    const prices = {};
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const year = Number(row[0]);
      const price = Number(row[1]);
      if (!Number.isInteger(year)) {
        return { ok: false, message: `第 ${i + 1} 行 year 无效：${row[0] || "(空)"}` };
      }
      if (!Number.isFinite(price)) {
        return { ok: false, message: `第 ${i + 1} 行 trade_strategy_pnl_yuan_per_mwh 无效：${row[1] || "(空)"}` };
      }
      prices[year] = price;
    }
    const sanitized = sanitizeLtManualPricesByYear(prices, project);
    const completeness = getLtManualCompleteness(project, { ltManualPricesByYear: sanitized });
    if (completeness.complete !== completeness.total) {
      return {
        ok: false,
        message: `逐年损益值不完整，当前 ${completeness.complete}/${completeness.total} 年。`
      };
    }
    return { ok: true, prices: sanitized };
  }

  function buildEnvManualTemplateRows(project) {
    const rows = [[
      "year",
      "green_cert_price_yuan_per_mwh",
      "green_cert_realize_ratio_pct",
      "green_premium_price_yuan_per_mwh",
      "green_premium_realize_ratio_pct",
      "carbon_enabled",
      "carbon_price_yuan_per_mwh",
      "carbon_realize_ratio_pct"
    ]];
    const { startYear, forecastYears, hasValidRange } = projectYearBounds(project);
    if (!hasValidRange) return rows;
    for (let index = 0; index < forecastYears; index += 1) {
      rows.push([startYear + index, "", "", "", "", "", "", ""]);
    }
    return rows;
  }

  function parseNonNegativeNumber(rawValue, label, rowNumber) {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, message: `第 ${rowNumber} 行 ${label} 无效：${rawValue || "(空)"}` };
    }
    return { ok: true, value };
  }

  function parseRatio(rawValue, label, rowNumber) {
    const parsed = parseNonNegativeNumber(rawValue, label, rowNumber);
    if (!parsed.ok) return parsed;
    if (parsed.value > 100) {
      return { ok: false, message: `第 ${rowNumber} 行 ${label} 不能超过100：${rawValue}` };
    }
    return { ok: true, value: parsed.value / 100 };
  }

  function parseEnvManualValuesCsv(csvText, project) {
    const rows = parseCsvRows(csvText);
    const header = normalizeCsvHeaderRow(rows[0] || []);
    const expectedHeader = [
      "year",
      "green_cert_price_yuan_per_mwh",
      "green_cert_realize_ratio_pct",
      "green_premium_price_yuan_per_mwh",
      "green_premium_realize_ratio_pct",
      "carbon_enabled",
      "carbon_price_yuan_per_mwh",
      "carbon_realize_ratio_pct"
    ].join(",");
    if (header !== expectedHeader) {
      return {
        ok: false,
        message: `表头不匹配。请使用：${expectedHeader}。`
      };
    }
    const values = {};
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNumber = i + 1;
      const year = Number(row[0]);
      if (!Number.isInteger(year)) {
        return { ok: false, message: `第 ${rowNumber} 行 year 无效：${row[0] || "(空)"}` };
      }
      const greenCertPrice = parseNonNegativeNumber(row[1], "green_cert_price_yuan_per_mwh", rowNumber);
      if (!greenCertPrice.ok) return greenCertPrice;
      const greenCertRatio = parseRatio(row[2], "green_cert_realize_ratio_pct", rowNumber);
      if (!greenCertRatio.ok) return greenCertRatio;
      const greenPremiumPrice = parseNonNegativeNumber(row[3], "green_premium_price_yuan_per_mwh", rowNumber);
      if (!greenPremiumPrice.ok) return greenPremiumPrice;
      const greenPremiumRatio = parseRatio(row[4], "green_premium_realize_ratio_pct", rowNumber);
      if (!greenPremiumRatio.ok) return greenPremiumRatio;
      const carbonEnabled = project?.siteType === "offshore" ? parseBooleanLike(row[5], false) : false;
      const carbonPrice = carbonEnabled
        ? parseNonNegativeNumber(row[6], "carbon_price_yuan_per_mwh", rowNumber)
        : { ok: true, value: Number(row[6]) || 0 };
      if (!carbonPrice.ok) return carbonPrice;
      const carbonRatio = carbonEnabled
        ? parseRatio(row[7], "carbon_realize_ratio_pct", rowNumber)
        : { ok: true, value: 0 };
      if (!carbonRatio.ok) return carbonRatio;
      const totalRatio = greenCertRatio.value + greenPremiumRatio.value + carbonRatio.value;
      if (totalRatio > 1 + 0.000001) {
        return { ok: false, message: `第 ${rowNumber} 行三条路径兑现空间合计为 ${asPercent(totalRatio)}，不能超过100.0%。` };
      }
      values[year] = {
        greenCertPrice: greenCertPrice.value,
        greenCertRealizeRatio: greenCertRatio.value,
        greenPremiumPrice: greenPremiumPrice.value,
        greenPremiumRealizeRatio: greenPremiumRatio.value,
        carbonEnabled,
        carbonPrice: carbonEnabled ? carbonPrice.value : 0,
        carbonRealizeRatio: carbonEnabled ? carbonRatio.value : 0
      };
    }
    const sanitized = sanitizeEnvManualValuesByYear(values, project);
    const completeness = getEnvManualCompleteness(project, { envManualValuesByYear: sanitized });
    if (completeness.complete !== completeness.total) {
      return {
        ok: false,
        message: `逐年环境价值兑现配置不完整，当前 ${completeness.complete}/${completeness.total} 年。`
      };
    }
    return { ok: true, values: sanitized };
  }

  function buildFeeManualTemplateRows(project) {
    const rows = [[
      "year",
      "market_op_fee_yuan_per_mwh",
      "grid_assess_fee_yuan_per_mwh",
      "ancillary_fee_yuan_per_mwh",
      "other_fee_yuan_per_mwh",
      "other_income_yuan_per_mwh"
    ]];
    const { startYear, forecastYears, hasValidRange } = projectYearBounds(project);
    if (!hasValidRange) return rows;
    for (let index = 0; index < forecastYears; index += 1) {
      rows.push([startYear + index, "", "", "", "", ""]);
    }
    return rows;
  }

  function parseFeeManualValuesCsv(csvText, project) {
    const rows = parseCsvRows(csvText);
    const header = normalizeCsvHeaderRow(rows[0] || []);
    const expectedHeader = [
      "year",
      "market_op_fee_yuan_per_mwh",
      "grid_assess_fee_yuan_per_mwh",
      "ancillary_fee_yuan_per_mwh",
      "other_fee_yuan_per_mwh",
      "other_income_yuan_per_mwh"
    ].join(",");
    if (header !== expectedHeader) {
      return {
        ok: false,
        message: `表头不匹配。请使用：${expectedHeader}。`
      };
    }
    const values = {};
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNumber = i + 1;
      const year = Number(row[0]);
      if (!Number.isInteger(year)) {
        return { ok: false, message: `第 ${rowNumber} 行 year 无效：${row[0] || "(空)"}` };
      }
      const marketOpFee = parseNonNegativeNumber(row[1], "market_op_fee_yuan_per_mwh", rowNumber);
      if (!marketOpFee.ok) return marketOpFee;
      const gridAssessFee = parseNonNegativeNumber(row[2], "grid_assess_fee_yuan_per_mwh", rowNumber);
      if (!gridAssessFee.ok) return gridAssessFee;
      const ancillaryFee = parseNonNegativeNumber(row[3], "ancillary_fee_yuan_per_mwh", rowNumber);
      if (!ancillaryFee.ok) return ancillaryFee;
      const otherFee = parseNonNegativeNumber(row[4], "other_fee_yuan_per_mwh", rowNumber);
      if (!otherFee.ok) return otherFee;
      const otherIncome = parseNonNegativeNumber(row[5], "other_income_yuan_per_mwh", rowNumber);
      if (!otherIncome.ok) return otherIncome;
      values[year] = {
        marketOpFee: marketOpFee.value,
        gridAssessFee: gridAssessFee.value,
        ancillaryFee: ancillaryFee.value,
        otherFee: otherFee.value,
        otherIncome: otherIncome.value
      };
    }
    const sanitized = sanitizeFeeManualValuesByYear(values, project);
    const completeness = getFeeManualCompleteness(project, { feeManualValuesByYear: sanitized });
    if (completeness.complete !== completeness.total) {
      return {
        ok: false,
        message: `逐年扣费收益配置不完整，当前 ${completeness.complete}/${completeness.total} 年。`
      };
    }
    return { ok: true, values: sanitized };
  }

  return Object.freeze({
    parseBooleanLike,
    getLtPricingMode,
    getEnvValueMode,
    getFeeConfigMode,
    sanitizeLtManualPricesByYear,
    sanitizeEnvManualValuesByYear,
    sanitizeFeeManualValuesByYear,
    getLtManualCompleteness,
    getEnvManualEntryForYear,
    getEnvManualCompleteness,
    getFeeManualEntryForYear,
    getFeeManualCompleteness,
    buildLtManualTemplateRows,
    parseLtManualPricesCsv,
    buildEnvManualTemplateRows,
    parseEnvManualValuesCsv,
    buildFeeManualTemplateRows,
    parseFeeManualValuesCsv
  });
});
