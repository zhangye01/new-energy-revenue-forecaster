"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_APP_UTILS = api;
  if (root.window && root.window !== root) {
    root.window.NE_APP_UTILS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const NO_LEAP_MONTH_LENGTHS = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

  function makeId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function cloneData(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function asMoney(value) {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      maximumFractionDigits: 0
    }).format(value);
  }

  function asCompactMoney(value) {
    const abs = Math.abs(value);
    if (abs >= 100000000) return `${(value / 100000000).toFixed(2)} 亿元`;
    if (abs >= 10000) return `${(value / 10000).toFixed(1)} 万元`;
    return asMoney(value);
  }

  function asNum(value, digits = 1) {
    return Number(value).toFixed(digits);
  }

  function asPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
  }

  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function hasNonEmptyObject(value) {
    if (!isPlainObject(value)) return false;
    return Object.keys(value).some((key) => {
      const item = value[key];
      if (item === null || item === undefined) return false;
      if (typeof item === "string") return item.trim() !== "";
      if (typeof item === "number") return Number.isFinite(item);
      if (Array.isArray(item)) return item.length > 0;
      if (isPlainObject(item)) return Object.keys(item).length > 0;
      return Boolean(item);
    });
  }

  function isIsoDateString(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function makeIsoDate(year, month = 1, day = 1) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function compareIsoDate(a, b) {
    return String(a || "").localeCompare(String(b || ""));
  }

  function clampIsoDate(value, minDate, maxDate) {
    if (!isIsoDateString(value)) return "";
    if (compareIsoDate(value, minDate) < 0) return minDate;
    if (compareIsoDate(value, maxDate) > 0) return maxDate;
    return value;
  }

  function noLeapDayOfYear(isoDate) {
    if (!isIsoDateString(isoDate)) return 1;
    const month = clamp(Number(isoDate.slice(5, 7)), 1, 12);
    const rawDay = Number(isoDate.slice(8, 10));
    const day = clamp(rawDay, 1, NO_LEAP_MONTH_LENGTHS[month - 1]);
    return NO_LEAP_MONTH_LENGTHS.slice(0, month - 1).reduce((sum, length) => sum + length, 0) + day;
  }

  return Object.freeze({
    makeId,
    cloneData,
    clamp,
    asMoney,
    asCompactMoney,
    asNum,
    asPercent,
    escapeHtml,
    isPlainObject,
    hasNonEmptyObject,
    isIsoDateString,
    makeIsoDate,
    compareIsoDate,
    clampIsoDate,
    noLeapDayOfYear
  });
});
