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

  function getLtPricingMode(config) {
    return config?.ltPricingMode === "manual" ? "manual" : "auto";
  }

  function ltPnlPriceForYear(config, yearIndex) {
    const year1 = Number(config?.ltYear1Pnl) || 0;
    const target = Number(config?.ltTargetPnl) || 0;
    const step = Math.max(0, Number(config?.ltConvergeSpeed) || 0);
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

  function getEnvValueAllocation(project, config, year = null) {
    const manualEntry = Number.isInteger(year) ? getEnvManualEntryForYear(config, year) : null;
    const source = manualEntry || config || {};
    const canUseCarbon = project?.siteType === "offshore" && Boolean(source?.carbonEnabled);
    const greenCertRatio = clamp(Number(source?.greenCertRealizeRatio) || 0, 0, 1);
    const greenPremiumRatio = clamp(Number(source?.greenPremiumRealizeRatio) || 0, 0, 1);
    const carbonRatio = canUseCarbon ? clamp(Number(source?.carbonRealizeRatio) || 0, 0, 1) : 0;
    const greenCertPrice = Number(source?.greenCertPrice) || 0;
    const greenPremiumPrice = Number(source?.greenPremiumPrice) || 0;
    const carbonPrice = canUseCarbon ? Number(source?.carbonPrice) || 0 : 0;
    const totalRatio = greenCertRatio + greenPremiumRatio + carbonRatio;
    const unitValuePerMarketMwh =
      greenCertRatio * greenCertPrice
      + greenPremiumRatio * greenPremiumPrice
      + carbonRatio * carbonPrice;
    return {
      greenCertRatio,
      greenPremiumRatio,
      carbonRatio,
      greenCertPrice,
      greenPremiumPrice,
      carbonPrice,
      totalRatio,
      unitValuePerMarketMwh
    };
  }

  function getFeeConfigMode(config) {
    return config?.feeConfigMode === "manual" ? "manual" : "global";
  }

  function getFeeManualEntryForYear(config, year) {
    if (getFeeConfigMode(config) !== "manual") return null;
    const entry = config?.feeManualValuesByYear?.[year];
    return isPlainObject(entry) ? entry : null;
  }

  function getFeeConfigForYear(project, config, year = null) {
    const manualEntry = Number.isInteger(year) ? getFeeManualEntryForYear(config, year) : null;
    const source = manualEntry || config || {};
    return {
      marketOpFee: Number(source.marketOpFee) || 0,
      gridAssessFee: Number(source.gridAssessFee) || 0,
      ancillaryFee: Number(source.ancillaryFee) || 0,
      otherFee: Number(source.otherFee) || 0,
      otherIncome: Number(source.otherIncome) || 0
    };
  }

  return Object.freeze({
    monthSerial,
    mechanismActiveMonthsForYear,
    ltPnlPriceForYear,
    tradeStrategyPnlPriceForYear,
    getEnvValueAllocation,
    getFeeConfigForYear
  });
});
