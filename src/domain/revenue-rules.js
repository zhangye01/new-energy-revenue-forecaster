"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_REVENUE_RULES = api;
  if (root.window && root.window !== root) {
    root.window.NE_REVENUE_RULES = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const ENVIRONMENT_VALUE_VERSION = 2;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function monthSerial(ym) {
    const [year, month] = String(ym).split("-").map((item) => Number(item));
    if (!year || !month) return null;
    return year * 12 + (month - 1);
  }

  function executionMonthSerial(ym) {
    return typeof ym === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(ym) ? monthSerial(ym) : null;
  }

  function mechanismDurationMonths(startYm, endYm) {
    const start = executionMonthSerial(startYm);
    const end = executionMonthSerial(endYm);
    return start === null || end === null || end < start ? null : end - start + 1;
  }

  function mechanismEndMonth(startYm, months) {
    const start = executionMonthSerial(startYm);
    if (start === null || !Number.isSafeInteger(months) || months < 1) return "";
    const end = start + months - 1;
    if (end > 9999 * 12 + 11) return "";
    const year = String(Math.floor(end / 12)).padStart(4, "0");
    const month = String(end % 12 + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function mechanismActiveMonthsForYear(year, startYm, endYm) {
    const start = monthSerial(startYm);
    const end = monthSerial(endYm);
    if (start === null || end === null || end < start) return 0;
    const yearStart = year * 12;
    const yearEnd = year * 12 + 11;
    const overlapStart = Math.max(start, yearStart);
    const overlapEnd = Math.min(end, yearEnd);
    return Math.max(0, overlapEnd - overlapStart + 1);
  }

  function mechanismReferencePrice(config, capturePrice) {
    const spread = config?.mechanismReferenceMode === "same_type"
      ? Number(config.sameTypeSpread) || 0
      : 0;
    return capturePrice + spread;
  }

  function getLtPricingMode(config) {
    return config?.ltPricingMode === "manual" ? "manual" : "auto";
  }

  function ltPnlPriceForYear(config, yearIndex) {
    const year1 = Number(config?.ltYear1Pnl) || 0;
    const target = Number(config?.ltTargetPnl) || 0;
    const storedStep = Math.max(0, Number(config?.ltConvergeSpeed) || 0);
    const step = config?.ltConvergeSpeedUnit === "legacy_ratio"
      ? Number((Math.abs(target - year1) * storedStep).toFixed(4)) : storedStep;
    if (yearIndex <= 1 || step <= 0) return year1;
    const delta = target - year1;
    const distance = Math.abs(delta);
    const moved = step * (yearIndex - 1);
    if (moved >= distance) return target;
    return year1 + Math.sign(delta) * moved;
  }

  function tradeStrategyPnlPriceForYear(config, yearIndex, year) {
    if (getLtPricingMode(config) === "manual") {
      const value = Number(config?.ltManualPricesByYear?.[year]);
      if (Number.isFinite(value)) return value;
    }
    return ltPnlPriceForYear(config, yearIndex);
  }

  function getEnvValueMode(config) {
    return config?.envValueMode === "manual" ? "manual" : "global";
  }

  function getEnvManualEntryForYear(config, year) {
    if (getEnvValueMode(config) !== "manual") return null;
    const entry = config?.envManualValuesByYear?.[year];
    return isPlainObject(entry) ? entry : null;
  }

  function getEnvValueAllocation(_project, config, year = null) {
    const manualEntry = Number.isInteger(year) ? getEnvManualEntryForYear(config, year) : null;
    const source = manualEntry || config || {};
    const greenCertRatio = clamp(Number(source?.greenCertRealizeRatio) || 0, 0, 1);
    const greenPremiumRatio = clamp(Number(source?.greenPremiumRealizeRatio) || 0, 0, 1);
    const greenCertPrice = Number(source?.greenCertPrice) || 0;
    const greenPremiumPrice = Number(source?.greenPremiumPrice) || 0;
    return {
      greenCertRatio,
      greenPremiumRatio,
      greenCertPrice,
      greenPremiumPrice,
      totalRatio: greenCertRatio + greenPremiumRatio,
      unitValuePerMarketMwh: greenCertRatio * greenCertPrice + greenPremiumRatio * greenPremiumPrice
    };
  }

  // Only the reconciliation of stored results uses this retired term.
  function legacyCarbonValuePerMarketMwh(project, config, year) {
    const source = getEnvManualEntryForYear(config, year) || config;
    if (project?.siteType !== "offshore" || !source?.carbonEnabled) return 0;
    const ratio = clamp(Number(source.carbonRealizeRatio) || 0, 0, 1);
    return ratio * (Number(source.carbonPrice) || 0);
  }

  function getFeeConfigMode(config) {
    return config?.feeConfigMode === "manual" ? "manual" : "global";
  }

  function getFeeManualEntryForYear(config, year) {
    if (getFeeConfigMode(config) !== "manual") return null;
    const entry = config?.feeManualValuesByYear?.[year];
    return isPlainObject(entry) ? entry : null;
  }

  function getFeeConfigForYear(_project, config, year = null) {
    const manualEntry = Number.isInteger(year) ? getFeeManualEntryForYear(config, year) : null;
    const source = manualEntry || config || {};
    const useNet = Object.hasOwn(source, "otherNetIncome");
    const net = Number(source.otherNetIncome) || 0;
    return {
      marketOpFee: Number(source.marketOpFee) || 0,
      gridAssessFee: Number(source.gridAssessFee) || 0,
      ancillaryFee: Number(source.ancillaryFee) || 0,
      otherFee: useNet ? Math.max(0, -net) : Number(source.otherFee) || 0,
      otherIncome: useNet ? Math.max(0, net) : Number(source.otherIncome) || 0
    };
  }

  function getOtherNetBreakdown(config, year, totalFee, otherIncome, energyMwh = 1) {
    const unknown = { primaryFees: null, otherNetIncome: null };
    if (![totalFee, otherIncome, energyMwh].every(Number.isFinite) || energyMwh < 0) return unknown;
    if (energyMwh === 0) return totalFee === 0 && otherIncome === 0 ? { primaryFees: 0, otherNetIncome: 0 } : unknown;
    const source = getFeeConfigMode(config) === "manual" ? getFeeManualEntryForYear(config, year) : config;
    if (!isPlainObject(source)) return unknown;
    const otherKeys = Object.hasOwn(source, "otherNetIncome") ? ["otherNetIncome"] : ["otherFee", "otherIncome"];
    const required = ["marketOpFee", "gridAssessFee", "ancillaryFee", ...otherKeys];
    if (!required.every((key) => {
      const value = source[key];
      return (typeof value === "number" || (typeof value === "string" && value.trim())) && Number.isFinite(Number(value));
    })) return unknown;
    const fees = getFeeConfigForYear(null, config, year);
    const primaryRate = fees.marketOpFee + fees.gridAssessFee + fees.ancillaryFee;
    const close = (actual, expected) => Number.isFinite(expected) && Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(actual), Math.abs(expected));
    if (!close(totalFee, energyMwh * (primaryRate + fees.otherFee)) || !close(otherIncome, energyMwh * fees.otherIncome)) return unknown;
    return { primaryFees: energyMwh * primaryRate, otherNetIncome: energyMwh * (fees.otherIncome - fees.otherFee) };
  }

  return Object.freeze({
    ENVIRONMENT_VALUE_VERSION,
    monthSerial,
    mechanismDurationMonths,
    mechanismEndMonth,
    mechanismActiveMonthsForYear,
    mechanismReferencePrice,
    ltPnlPriceForYear,
    tradeStrategyPnlPriceForYear,
    getEnvValueAllocation,
    legacyCarbonValuePerMarketMwh,
    getFeeConfigForYear,
    getOtherNetBreakdown
  });
});
