"use strict";

(function (root, factory) {
  const energyProfiles = typeof module !== "undefined" && module.exports
    ? require("./energy-profiles")
    : root.NE_ENERGY_PROFILES;
  const priceForecast = typeof module !== "undefined" && module.exports
    ? require("./price-forecast")
    : root.NE_PRICE_FORECAST;
  const appUtils = typeof module !== "undefined" && module.exports
    ? require("./app-utils")
    : root.NE_APP_UTILS;
  const api = factory(energyProfiles, priceForecast, appUtils);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_HISTORY_ANALYSIS = api;
  if (root.window && root.window !== root) {
    root.window.NE_HISTORY_ANALYSIS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (energyProfiles, priceForecast, appUtils) {
  if (!energyProfiles || !priceForecast || !appUtils) {
    throw new Error("历史电价分析模块初始化失败：缺少电量曲线、电价预测或应用工具模块");
  }

  const HISTORY_MONTH_LABELS = Object.freeze(["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]);
  const HISTORY_HEAT_HOUR_LABELS = Object.freeze(Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}时`));
  const MOCK_START_YEAR = 2018;
  const MOCK_END_YEAR = 2025;
  const HISTORY_MARKET_PRICE_BASIS = "province_spot_mock_v1";
  const MODEL_DAYS = 365;
  const QUARTERS_PER_DAY = 96;
  const { makeIsoDate, compareIsoDate, clampIsoDate } = appUtils;

  function percentileSorted(sortedValues, p) {
    if (!sortedValues.length) return null;
    const rank = (sortedValues.length - 1) * p;
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    if (lower === upper) return sortedValues[lower];
    const weight = rank - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  function provinceKey(project) {
    return String(project?.province || "").trim().toLowerCase();
  }

  function provinceDemoBase(province, options) {
    const price = Number(priceForecast.getPriceBaseForProvince(province, options.provinceBenchmarks || {}));
    return Number.isFinite(price) ? price : 360;
  }

  function historyCacheKey(project, options = {}) {
    const province = provinceKey(project);
    return `${province}|${HISTORY_MARKET_PRICE_BASIS}|${provinceDemoBase(province, options)}`;
  }

  function trimHistoryCache(cache, maxSize = 24) {
    while (cache.size > maxSize && cache.size > 0) {
      cache.delete(cache.keys().next().value);
    }
  }

  function buildMockHistorySpotAnalysisDataset(project, options = {}) {
    const province = provinceKey(project);
    const cache = options.cache;
    const cacheKey = historyCacheKey(project, options);
    if (cache?.has(cacheKey)) return cache.get(cacheKey);

    // Reuse the base simulated curve shape with a fixed input. Only the province
    // changes its level and time series seed. Project attributes never enter this source.
    const factors = priceForecast.getHistoryMockShapeFactors({});
    const base = provinceDemoBase(province, options) + factors.baseShift;
    const seedBase = Array.from(province).reduce((seed, letter) => (seed * 31 + letter.codePointAt(0)) % 65521, 17);
    const diurnal = Array.from({ length: QUARTERS_PER_DAY }, (_, quarter) => {
      const hour = quarter / 4;
      return 0.9
        + factors.morningPeakWeight * Math.exp(-Math.pow((hour - 8.5) / 2.2, 2))
        + factors.eveningPeakWeight * 1.22 * Math.exp(-Math.pow((hour - 18.4) / 2.9, 2))
        - factors.noonValleyWeight * 0.13 * Math.exp(-Math.pow((hour - 13.2) / 2.4, 2))
        - factors.nightValleyWeight * 0.07 * Math.exp(-Math.pow((hour - 3.2) / 2.8, 2));
    });
    const years = [];

    for (let year = MOCK_START_YEAR; year <= MOCK_END_YEAR; year += 1) {
      const values = [];
      const yearFactor = 0.92 + ((year - MOCK_START_YEAR) / (MOCK_END_YEAR - MOCK_START_YEAR)) * 0.16 * factors.yearVolatility;
      for (let dayIndex = 0; dayIndex < MODEL_DAYS; dayIndex += 1) {
        const { month, day } = energyProfiles.dayOfYearToMonthDay(dayIndex + 1);
        const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
        const weekendFactor = dayOfWeek === 0 || dayOfWeek === 6 ? factors.weekendLevel : 1;
        const winterLoad = 0.18 * Math.cos(((dayIndex - 12) / MODEL_DAYS) * 2 * Math.PI) * factors.winterScale;
        const summerLoad = 0.16 * Math.cos(((dayIndex - 196) / MODEL_DAYS) * 2 * Math.PI) * factors.summerScale;
        const dayLevel = base * yearFactor * (1 + winterLoad + summerLoad) * weekendFactor;
        for (let quarter = 0; quarter < QUARTERS_PER_DAY; quarter += 1) {
          const noise = energyProfiles.pseudoNoise(dayIndex * 97 + quarter, seedBase + year);
          let price = dayLevel * diurnal[quarter] * (1 + (noise - 0.5) * factors.noiseAmplitude);
          const spike = energyProfiles.pseudoNoise(dayIndex * 53 + quarter, seedBase + year + 37);
          if (spike > factors.spikeThreshold) price *= 1.38 + (spike - factors.spikeThreshold) * 26 * factors.spikeScale;
          const negative = energyProfiles.pseudoNoise(dayIndex * 31 + quarter, seedBase + year + 73);
          if (quarter >= 42 && quarter <= 62 && (month === 4 || month === 5 || month === 10) && negative > factors.negativeThreshold) {
            price = -5 - 85 * energyProfiles.pseudoNoise(dayIndex * 43 + quarter, seedBase + year + 91) * factors.negativeScale;
          }
          values.push(Math.round(Math.max(-120, Math.min(880, price)) * 100) / 100);
        }
      }
      years.push({ year, values });
    }

    const payload = {
      sourceType: "mock",
      mock: true,
      marketPriceBasis: HISTORY_MARKET_PRICE_BASIS,
      marketPriceLabel: "省级现货模拟价",
      intervalMinutes: 15,
      modelDays: MODEL_DAYS,
      startYear: MOCK_START_YEAR,
      endYear: MOCK_END_YEAR,
      years
    };
    if (cache) {
      cache.set(cacheKey, payload);
      trimHistoryCache(cache, options.maxCacheSize || 24);
    }
    return payload;
  }

  function resolveHistoryDateRange(controls, dataset) {
    const minDate = makeIsoDate(dataset.startYear, 1, 1);
    const maxDate = makeIsoDate(dataset.endYear, 12, 31);
    const defaultStartYear = Math.max(dataset.startYear, dataset.endYear - 1);
    const defaultStartDate = makeIsoDate(defaultStartYear, 1, 1);
    let startDate = clampIsoDate(controls.startDate || defaultStartDate, minDate, maxDate) || defaultStartDate;
    let endDate = clampIsoDate(controls.endDate || maxDate, minDate, maxDate) || maxDate;
    if (compareIsoDate(startDate, endDate) > 0) [startDate, endDate] = [endDate, startDate];
    return { startDate, endDate, minDate, maxDate };
  }

  function createHourBuckets() {
    return Array.from({ length: 12 }, () => Array.from({ length: 24 }, () => ({
      sum: 0, count: 0, negative: 0
    })));
  }

  function buildHistoryYearSlice(yearData, range) {
    const { year } = yearData;
    const yearStart = makeIsoDate(year, 1, 1);
    const yearEnd = makeIsoDate(year, 12, 31);
    if (yearEnd < range.startDate || yearStart > range.endDate) return null;
    const start = range.startDate > yearStart ? range.startDate : yearStart;
    const end = range.endDate < yearEnd ? range.endDate : yearEnd;
    const firstMonth = Number(start.slice(5, 7)) - 1;
    const lastMonth = Number(end.slice(5, 7)) - 1;
    const monthValues = Array.from({ length: 12 }, () => []);
    const monthSpreads = Array.from({ length: 12 }, () => []);
    const heat = createHourBuckets();
    const values = [];
    let expectedPoints = 0;

    for (let dayIndex = 0; dayIndex < MODEL_DAYS; dayIndex += 1) {
      const { month, day } = energyProfiles.dayOfYearToMonthDay(dayIndex + 1);
      const date = makeIsoDate(year, month, day);
      if (date < start || date > end) continue;
      const monthIndex = month - 1;
      const hours = heat[monthIndex];
      const dayValues = [];
      expectedPoints += QUARTERS_PER_DAY;
      for (let quarter = 0; quarter < QUARTERS_PER_DAY; quarter += 1) {
        const value = yearData.values?.[dayIndex * QUARTERS_PER_DAY + quarter];
        if (!Number.isFinite(value)) continue;
        values.push(value);
        monthValues[monthIndex].push(value);
        dayValues.push(value);
        const hour = hours[Math.floor(quarter / 4)];
        hour.sum += value;
        hour.count += 1;
        if (value < 0) hour.negative += 1;
      }
      if (dayValues.length === QUARTERS_PER_DAY) {
        dayValues.sort((a, b) => a - b);
        monthSpreads[monthIndex].push(percentileSorted(dayValues, 0.9) - percentileSorted(dayValues, 0.1));
      }
    }
    return { year, firstMonth, lastMonth, values, monthValues, monthSpreads, heat, expectedPoints };
  }

  function selectHistoryYearsByDateRange(dataset, range) {
    return dataset.years
      .map((yearData) => buildHistoryYearSlice(yearData, range))
      .filter((yearData) => yearData && yearData.expectedPoints > 0);
  }

  function buildPriceDuration(sortedValues) {
    const sampleCount = sortedValues.length;
    const rows = [];
    let above = 0;
    let negativeCount = 0;
    let zeroCount = 0;
    for (let current = sampleCount - 1; current >= 0;) {
      const price = sortedValues[current];
      let start = current;
      while (start > 0 && sortedValues[start - 1] === price) start -= 1;
      const count = current - start + 1;
      rows.push([price, count, 100 * (above + count) / sampleCount, 100 * above / sampleCount]);
      above += count;
      if (price < 0) negativeCount += count;
      if (price === 0) zeroCount += count;
      current = start - 1;
    }

    // Keep the first and last values and both sides of zero or a sign change.
    // The CSV retains all observed prices and exact tied-sample counts.
    const points = rows.length ? [[0, rows[0][0], 0]] : [];
    let previousBucket = -1;
    rows.forEach(([price, , cumulative, abovePct], index) => {
      const bucket = Math.floor(cumulative * 8);
      const hasSignBoundary = Math.sign(price) !== Math.sign(rows[index - 1]?.[0] ?? price)
        || Math.sign(price) !== Math.sign(rows[index + 1]?.[0] ?? price);
      if (index === rows.length - 1 || bucket !== previousBucket || hasSignBoundary) points.push([cumulative, price, abovePct]);
      previousBucket = bucket;
    });

    return {
      duration: {
        points,
        p10: percentileSorted(sortedValues, 0.1),
        p50: percentileSorted(sortedValues, 0.5),
        p90: percentileSorted(sortedValues, 0.9),
        negativeRatio: sampleCount ? negativeCount * 100 / sampleCount : null,
        zeroRatio: sampleCount ? zeroCount * 100 / sampleCount : null,
        sampleCount
      },
      durationRows: rows
    };
  }

  function mergeHeatBuckets(heat, source) {
    source.forEach((month, monthIndex) => month.forEach((hour, hourIndex) => {
      const cell = heat[monthIndex][hourIndex];
      cell.sum += hour.sum;
      cell.count += hour.count;
      cell.negative += hour.negative;
    }));
  }

  function buildHeatAnalysis(heat) {
    const heatData = [];
    const heatReference = [];
    heat.forEach((month, monthIndex) => month.forEach(({ sum, count, negative }, hour) => {
      const average = count ? sum / count : null;
      heatData.push([hour, monthIndex, average, count ? negative * 100 / count : null, count]);
      if (average !== null) heatReference.push(average);
    }));
    return {
      heatData,
      heatMin: heatReference.length ? Math.min(...heatReference) : null,
      heatMax: heatReference.length ? Math.max(...heatReference) : null
    };
  }

  function buildHistorySelectedAnalysis(selectedYears) {
    const heat = createHourBuckets();
    const allValues = [];
    const monthly = [];
    const intraday = [];
    let expectedPoints = 0;
    const chronological = [...selectedYears].sort((first, second) => first.year - second.year);
    chronological.forEach((year) => {
      allValues.push(...year.values);
      expectedPoints += year.expectedPoints;
      mergeHeatBuckets(heat, year.heat);
      for (let month = year.firstMonth; month <= year.lastMonth; month += 1) {
        const label = `${year.year}-${String(month + 1).padStart(2, "0")}`;
        const sorted = [...year.monthValues[month]].sort((a, b) => a - b);
        const spreads = [...year.monthSpreads[month]].sort((a, b) => a - b);
        monthly.push({ month: label, avg: sorted.length ? sorted.reduce((sum, price) => sum + price, 0) / sorted.length : null,
          p10: percentileSorted(sorted, 0.1), p50: percentileSorted(sorted, 0.5), p90: percentileSorted(sorted, 0.9), count: sorted.length });
        intraday.push({ month: label, p25: percentileSorted(spreads, 0.25), p50: percentileSorted(spreads, 0.5),
          p75: percentileSorted(spreads, 0.75), count: spreads.length });
      }
    });

    const { duration, durationRows } = buildPriceDuration([...allValues].sort((a, b) => a - b));
    const { heatData, heatMin, heatMax } = buildHeatAnalysis(heat);
    const valueAvg = allValues.length ? allValues.reduce((sum, price) => sum + price, 0) / allValues.length : null;
    return {
      allValues,
      valueAvg,
      p50: duration.p50,
      p90: duration.p90,
      negativeRatio: duration.negativeRatio,
      coverage: { expectedPoints, samplePoints: allValues.length },
      monthly,
      heatData,
      heatMin,
      heatMax,
      duration,
      intraday,
      exportRows: {
        monthTrend: [
          ["month", "avg_price_yuan_per_mwh", "p10_price_yuan_per_mwh", "p50_price_yuan_per_mwh", "p90_price_yuan_per_mwh", "sample_count"],
          ...monthly.map(({ month, avg, p10, p50, p90, count }) => [month, avg, p10, p50, p90, count])
        ],
        heatmap: [
          ["month", "hour_label", "avg_price_yuan_per_mwh", "negative_ratio_pct", "sample_count"],
          ...heatData.map(([hour, month, avg, negativeRatio, count]) => [month + 1, HISTORY_HEAT_HOUR_LABELS[hour], avg, negativeRatio, count])
        ],
        duration: [
          ["price_yuan_per_mwh", "sample_count", "cumulative_pct", "strictly_above_pct"],
          ...durationRows
        ],
        intradaySpread: [
          ["month", "p25_spread_yuan_per_mwh", "p50_spread_yuan_per_mwh", "p75_spread_yuan_per_mwh", "complete_day_count"],
          ...intraday.map(({ month, p25, p50, p75, count }) => [month, p25, p50, p75, count])
        ]
      }
    };
  }

  return Object.freeze({
    HISTORY_MONTH_LABELS,
    HISTORY_MARKET_PRICE_BASIS,
    percentileSorted,
    historyCacheKey,
    buildMockHistorySpotAnalysisDataset,
    resolveHistoryDateRange,
    buildHistoryYearSlice,
    selectHistoryYearsByDateRange,
    buildHistorySelectedAnalysis
  });
});
