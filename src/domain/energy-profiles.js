"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_ENERGY_PROFILES = api;
  if (root.window && root.window !== root) {
    root.window.NE_ENERGY_PROFILES = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function dayOfYearToMonthDay(dayOfYear) {
    const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let day = dayOfYear;
    let month = 1;
    for (const monthLength of monthLengths) {
      if (day <= monthLength) break;
      day -= monthLength;
      month += 1;
    }
    return { month, day };
  }

  function normalizeTypicalCurveProfile(values) {
    if (!Array.isArray(values) || values.length !== 8760) return [];
    const parsed = values.map((value) => Number(value));
    const valid = parsed.every((value) => Number.isFinite(value) && value >= 0);
    if (!valid) return [];
    const total = parsed.reduce((sum, value) => sum + value, 0);
    if (!(total > 0)) return [];
    return parsed.map((value) => value / total);
  }

  function pseudoNoise(index, seed) {
    const raw = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
    return raw - Math.floor(raw);
  }

  function generationWeight(assetType, hourIndex, seed) {
    const day = Math.floor(hourIndex / 24);
    const hour = hourIndex % 24;
    if (assetType === "photovoltaic") {
      if (hour < 6 || hour > 18) return 0;
      const daylight = Math.sin(((hour - 6) / 12) * Math.PI);
      const seasonal = 0.82 + 0.22 * Math.sin(((day - 85) / 365) * 2 * Math.PI);
      const weather = 0.8 + 0.28 * pseudoNoise(day, seed + 3);
      return Math.max(0, daylight * seasonal * weather);
    }
    const seasonal = 1 + 0.16 * Math.cos(((day - 30) / 365) * 2 * Math.PI);
    const diurnal = 0.96 + 0.08 * Math.sin(((hour + 5) / 24) * 2 * Math.PI);
    const weather = 0.72 + 0.44 * pseudoNoise(hourIndex, seed + 9);
    return Math.max(0.05, seasonal * diurnal * weather);
  }

  function generateHourlyHoursFromAnnual(annualHours, assetType, seed) {
    const weights = [];
    let total = 0;
    for (let i = 0; i < 8760; i += 1) {
      const w = generationWeight(assetType, i, seed);
      weights.push(w);
      total += w;
    }
    return weights.map((w) => annualHours * w / total);
  }

  return Object.freeze({
    dayOfYearToMonthDay,
    normalizeTypicalCurveProfile,
    pseudoNoise,
    generationWeight,
    generateHourlyHoursFromAnnual
  });
});
