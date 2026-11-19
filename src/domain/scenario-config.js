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
  const LEGACY_ENV_VALUE_KEYS = Object.freeze(["carbonEnabled", "carbonPrice", "carbonRealizeRatio"]);
  const LEGACY_FEE_VALUE_KEYS = Object.freeze(["otherFee", "otherIncome"]);
  const ENV_TEMPLATE_COLUMNS = Object.freeze([
    "year", "green_cert_price_yuan_per_mwh", "green_cert_realize_ratio_pct",
    "green_premium_price_yuan_per_mwh", "green_premium_realize_ratio_pct"
  ]);
  const LEGACY_ENV_TEMPLATE_HEADER = [...ENV_TEMPLATE_COLUMNS, "carbon_enabled", "carbon_price_yuan_per_mwh", "carbon_realize_ratio_pct"].join(",");
  const FEE_TEMPLATE_COLUMNS = Object.freeze([
    "year", "market_op_fee_yuan_per_mwh", "grid_assess_fee_yuan_per_mwh",
    "ancillary_fee_yuan_per_mwh", "other_net_income_yuan_per_mwh"
  ]);
  const LEGACY_FEE_TEMPLATE_HEADER = [...FEE_TEMPLATE_COLUMNS.slice(0, -1), "other_fee_yuan_per_mwh", "other_income_yuan_per_mwh"].join(",");
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

  function isBlank(value) {
    return value === null || value === undefined || String(value).trim() === "";
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

  function readSignedNumber(value) {
    if (isBlank(value) || (typeof value !== "number" && typeof value !== "string")) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function getOtherNetIncome(config) {
    if (Object.hasOwn(config || {}, "otherNetIncome")) return readSignedNumber(config.otherNetIncome);
    const fee = readSignedNumber(config?.otherFee);
    const income = readSignedNumber(config?.otherIncome);
    return fee !== null && fee >= 0 && income !== null && income >= 0 ? income - fee : null;
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
      const entry = {
        greenCertPrice: Number(rawValue.greenCertPrice) || 0,
        greenCertRealizeRatio: clamp(Number(rawValue.greenCertRealizeRatio) || 0, 0, 1),
        greenPremiumPrice: Number(rawValue.greenPremiumPrice) || 0,
        greenPremiumRealizeRatio: clamp(Number(rawValue.greenPremiumRealizeRatio) || 0, 0, 1)
      };
      if (entry.greenCertRealizeRatio + entry.greenPremiumRealizeRatio > 1 + 0.000001) return;
      next[year] = entry;
    });
    return next;
  }

  function preserveLegacyColumns(previousRows, nextRows, keys) {
    if (!isPlainObject(nextRows)) return {};
    return Object.fromEntries(Object.entries(nextRows).map(([year, value]) => {
      if (!isPlainObject(value)) return [year, value];
      const row = { ...value };
      const previous = previousRows?.[year];
      for (const key of keys) {
        if (previous && Object.hasOwn(previous, key)) row[key] = previous[key];
        else delete row[key];
      }
      return [year, row];
    }));
  }

  function preserveLegacyEnvFields(previousRows, nextRows) {
    return preserveLegacyColumns(previousRows, nextRows, LEGACY_ENV_VALUE_KEYS);
  }

  function preserveLegacyFeeFields(previousRows, nextRows) {
    return preserveLegacyColumns(previousRows, nextRows, LEGACY_FEE_VALUE_KEYS);
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
        ancillaryFee: Number(rawValue.ancillaryFee) || 0
      };
      if (Object.values(entry).some((value) => value < 0)) return;
      const otherNetIncome = getOtherNetIncome(rawValue);
      if (otherNetIncome !== null) next[year] = { ...entry, otherNetIncome };
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
    const prices = isPlainObject(config?.ltManualPricesByYear) ? config.ltManualPricesByYear : {};
    return {
      prices,
      ...summarizeCompleteness(project, prices, (value) => !isBlank(value) && Number.isFinite(Number(value)))
    };
  }

  function getEnvManualEntryForYear(project, config, year) {
    if (getEnvValueMode(config) !== "manual") return null;
    const values = sanitizeEnvManualValuesByYear(config?.envManualValuesByYear || {}, project);
    const entry = values[year];
    return isPlainObject(entry) ? entry : null;
  }

  function getEnvManualCompleteness(project, config) {
    const values = isPlainObject(config?.envManualValuesByYear) ? config.envManualValuesByYear : {};
    return {
      values,
      ...summarizeCompleteness(project, values, (entry) => validAnnualEntry(entry, project, "environment"))
    };
  }

  function getFeeManualEntryForYear(project, config, year) {
    if (getFeeConfigMode(config) !== "manual") return null;
    const values = sanitizeFeeManualValuesByYear(config?.feeManualValuesByYear || {}, project);
    const entry = values[year];
    return isPlainObject(entry) ? entry : null;
  }

  function getFeeManualCompleteness(project, config) {
    const values = isPlainObject(config?.feeManualValuesByYear) ? config.feeManualValuesByYear : {};
    return {
      values,
      ...summarizeCompleteness(project, values, (entry) => validAnnualEntry(entry, project, "fees"))
    };
  }

  function validAnnualEntry(entry, _project, kind) {
    if (!isPlainObject(entry)) return false;
    const keys = kind === "fees" ? ["marketOpFee", "gridAssessFee", "ancillaryFee"]
      : ["greenCertPrice", "greenCertRealizeRatio", "greenPremiumPrice", "greenPremiumRealizeRatio"];
    if (!keys.every((key) => !isBlank(entry[key]) && Number.isFinite(Number(entry[key])) && Number(entry[key]) >= 0
        && (!key.endsWith("Ratio") || Number(entry[key]) <= 1))) return false;
    if (kind === "fees") return getOtherNetIncome(entry) !== null;
    return kind !== "environment" || keys.filter((key) => key.endsWith("Ratio"))
      .reduce((sum, key) => sum + Number(entry[key]), 0) <= 1 + 0.000001;
  }

  function applicableConfigKeys(_project = {}, config = {}) {
    const keys = ["mechanismEnabled", "ltPricingMode", "envValueMode", "feeConfigMode"];
    if (config.mechanismEnabled) {
      keys.push("mechanismRatio", "mechanismPrice", "mechanismStartYm", "mechanismEndYm", "mechanismReferenceMode");
      if (config.mechanismReferenceMode === "same_type") keys.push("sameTypeSpread");
    }
    keys.push(...(getLtPricingMode(config) === "manual" ? ["ltManualPricesByYear"]
      : ["ltYear1Pnl", "ltTargetPnl", "ltConvergeSpeed", "ltConvergeSpeedUnit"]));
    if (getEnvValueMode(config) === "manual") keys.push("envManualValuesByYear");
    else keys.push("greenCertPrice", "greenCertRealizeRatio", "greenPremiumPrice", "greenPremiumRealizeRatio");
    keys.push(...(getFeeConfigMode(config) === "manual" ? ["feeManualValuesByYear"]
      : ["marketOpFee", "gridAssessFee", "ancillaryFee", "otherNetIncome"]));
    return keys;
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
    const yearRows = new Map();
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const year = Number(row[0]);
      const price = Number(row[1]);
      if (!Number.isInteger(year)) {
        return { ok: false, message: `第 ${i + 1} 行 year 无效：${row[0] || "(空)"}` };
      }
      if (yearRows.has(year)) {
        return { ok: false, message: `第 ${i + 1} 行 year 重复：${year}（已在第 ${yearRows.get(year)} 行填写）。` };
      }
      yearRows.set(year, i + 1);
      if (isBlank(row[1]) || !Number.isFinite(price)) {
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
    const rows = [[...ENV_TEMPLATE_COLUMNS]];
    const { startYear, forecastYears, hasValidRange } = projectYearBounds(project);
    if (!hasValidRange) return rows;
    for (let index = 0; index < forecastYears; index += 1) {
      rows.push([startYear + index, "", "", "", ""]);
    }
    return rows;
  }

  function parseNonNegativeNumber(rawValue, label, rowNumber) {
    const value = Number(rawValue);
    if (isBlank(rawValue) || !Number.isFinite(value) || value < 0) {
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
    const expectedHeader = ENV_TEMPLATE_COLUMNS.join(",");
    if (header !== expectedHeader && header !== LEGACY_ENV_TEMPLATE_HEADER) {
      return {
        ok: false,
        message: `表头不匹配。请使用：${expectedHeader}。`
      };
    }
    const values = {};
    const yearRows = new Map();
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNumber = i + 1;
      const year = Number(row[0]);
      if (!Number.isInteger(year)) {
        return { ok: false, message: `第 ${rowNumber} 行 year 无效：${row[0] || "(空)"}` };
      }
      if (yearRows.has(year)) {
        return { ok: false, message: `第 ${rowNumber} 行 year 重复：${year}（已在第 ${yearRows.get(year)} 行填写）。` };
      }
      yearRows.set(year, rowNumber);
      const greenCertPrice = parseNonNegativeNumber(row[1], "green_cert_price_yuan_per_mwh", rowNumber);
      if (!greenCertPrice.ok) return greenCertPrice;
      const greenCertRatio = parseRatio(row[2], "green_cert_realize_ratio_pct", rowNumber);
      if (!greenCertRatio.ok) return greenCertRatio;
      const greenPremiumPrice = parseNonNegativeNumber(row[3], "green_premium_price_yuan_per_mwh", rowNumber);
      if (!greenPremiumPrice.ok) return greenPremiumPrice;
      const greenPremiumRatio = parseRatio(row[4], "green_premium_realize_ratio_pct", rowNumber);
      if (!greenPremiumRatio.ok) return greenPremiumRatio;
      const totalRatio = greenCertRatio.value + greenPremiumRatio.value;
      if (totalRatio > 1 + 0.000001) {
        return { ok: false, message: `第 ${rowNumber} 行绿证和绿电兑现比例合计为 ${asPercent(totalRatio)}，不能超过100.0%。` };
      }
      values[year] = {
        greenCertPrice: greenCertPrice.value,
        greenCertRealizeRatio: greenCertRatio.value,
        greenPremiumPrice: greenPremiumPrice.value,
        greenPremiumRealizeRatio: greenPremiumRatio.value
      };
    }
    const sanitized = Object.fromEntries(Object.entries(values).filter(([year]) => isYearInProjectRange(Number(year), project)));
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
    const rows = [[...FEE_TEMPLATE_COLUMNS]];
    const { startYear, forecastYears, hasValidRange } = projectYearBounds(project);
    if (!hasValidRange) return rows;
    for (let index = 0; index < forecastYears; index += 1) {
      rows.push([startYear + index, "", "", "", ""]);
    }
    return rows;
  }

  function parseFeeManualValuesCsv(csvText, project) {
    const rows = parseCsvRows(csvText);
    const header = normalizeCsvHeaderRow(rows[0] || []);
    const expectedHeader = FEE_TEMPLATE_COLUMNS.join(",");
    const isLegacyTemplate = header === LEGACY_FEE_TEMPLATE_HEADER;
    if (header !== expectedHeader && !isLegacyTemplate) {
      return {
        ok: false,
        message: `表头不匹配。请使用：${expectedHeader}。`
      };
    }
    const values = {};
    const yearRows = new Map();
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNumber = i + 1;
      const year = Number(row[0]);
      if (!Number.isInteger(year)) {
        return { ok: false, message: `第 ${rowNumber} 行 year 无效：${row[0] || "(空)"}` };
      }
      if (yearRows.has(year)) {
        return { ok: false, message: `第 ${rowNumber} 行 year 重复：${year}（已在第 ${yearRows.get(year)} 行填写）。` };
      }
      yearRows.set(year, rowNumber);
      const marketOpFee = parseNonNegativeNumber(row[1], "market_op_fee_yuan_per_mwh", rowNumber);
      if (!marketOpFee.ok) return marketOpFee;
      const gridAssessFee = parseNonNegativeNumber(row[2], "grid_assess_fee_yuan_per_mwh", rowNumber);
      if (!gridAssessFee.ok) return gridAssessFee;
      const ancillaryFee = parseNonNegativeNumber(row[3], "ancillary_fee_yuan_per_mwh", rowNumber);
      if (!ancillaryFee.ok) return ancillaryFee;
      const otherNetIncome = parseOtherNetIncome(row, rowNumber, isLegacyTemplate);
      if (!otherNetIncome.ok) return otherNetIncome;
      values[year] = {
        marketOpFee: marketOpFee.value,
        gridAssessFee: gridAssessFee.value,
        ancillaryFee: ancillaryFee.value,
        otherNetIncome: otherNetIncome.value
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

  function parseOtherNetIncome(row, rowNumber, isLegacyTemplate) {
    if (!isLegacyTemplate) {
      const value = readSignedNumber(row[4]);
      return value === null ? { ok: false, message: `第 ${rowNumber} 行 other_net_income_yuan_per_mwh 无效：${row[4] || "(空)"}` }
        : { ok: true, value };
    }
    const fee = parseNonNegativeNumber(row[4], "other_fee_yuan_per_mwh", rowNumber);
    if (!fee.ok) return fee;
    const income = parseNonNegativeNumber(row[5], "other_income_yuan_per_mwh", rowNumber);
    return income.ok ? { ok: true, value: income.value - fee.value } : income;
  }

  return Object.freeze({
    LEGACY_ENV_VALUE_KEYS,
    LEGACY_FEE_VALUE_KEYS,
    applicableConfigKeys,
    validAnnualEntry,
    parseBooleanLike,
    getLtPricingMode,
    getEnvValueMode,
    getFeeConfigMode,
    getOtherNetIncome,
    sanitizeLtManualPricesByYear,
    sanitizeEnvManualValuesByYear,
    preserveLegacyEnvFields,
    sanitizeFeeManualValuesByYear,
    preserveLegacyFeeFields,
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
