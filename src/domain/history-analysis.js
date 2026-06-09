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
  const HISTORY_QUARTER_LABELS = Object.freeze(Array.from({ length: 96 }, (_, index) => {
    const hour = Math.floor(index / 4);
    const minute = (index % 4) * 15;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }));
  const {
    makeIsoDate,
    compareIsoDate,
    clampIsoDate,
    noLeapDayOfYear
  } = appUtils;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createHistoryTypicalAccumulator() {
    return {
      workdaySum: Array(96).fill(0),
      workdayCount: Array(96).fill(0),
      weekendSum: Array(96).fill(0),
      weekendCount: Array(96).fill(0)
    };
  }

  function pushHistoryTypical(acc, isWeekend, quarterIndex, price) {
    if (isWeekend) {
      acc.weekendSum[quarterIndex] += price;
      acc.weekendCount[quarterIndex] += 1;
    } else {
      acc.workdaySum[quarterIndex] += price;
      acc.workdayCount[quarterIndex] += 1;
    }
  }

  function mergeHistoryTypical(target, source) {
    for (let i = 0; i < 96; i += 1) {
      target.workdaySum[i] += source.workdaySum[i];
      target.workdayCount[i] += source.workdayCount[i];
      target.weekendSum[i] += source.weekendSum[i];
      target.weekendCount[i] += source.weekendCount[i];
    }
  }

  function percentileSorted(sortedValues, p) {
    if (!sortedValues.length) return null;
    const rank = (sortedValues.length - 1) * p;
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    if (lower === upper) return sortedValues[lower];
    const weight = rank - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  function stddev(values) {
    if (!values.length) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return Math.sqrt(Math.max(variance, 0));
  }

  function dayModeMatchesMonth(mode, month) {
    if (mode === "summer") return month >= 6 && month <= 8;
    if (mode === "winter") return month === 12 || month <= 2;
    return true;
  }

  function historyCacheKey(project) {
    return [
      project.id,
      project.province,
      project.capacityMw,
      project.startYear,
      project.assetType,
      project.siteType,
      project.hasStorage ? "storage" : "plain",
      project.storagePowerMw || 0,
      project.storageDurationH || 0
    ].join("|");
  }

  function trimHistoryCache(cache, maxSize = 24) {
    if (!cache || typeof cache.size !== "number" || cache.size <= maxSize) return;
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }

  function buildMockHistorySpotAnalysisDataset(project, options = {}) {
    const cache = options.cache;
    const cacheKey = historyCacheKey(project);
    if (cache?.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    const factors = priceForecast.getHistoryMockShapeFactors(project);
    const base = priceForecast.getPriceBaseForProvince(project.province, options.provinceBenchmarks || {}) + factors.baseShift;
    const endYear = project.startYear - 1;
    const startYear = endYear - 7;
    const seedBase = Math.round((project.capacityMw || 0) * 10)
      + project.startYear * 7
      + (project.siteType === "offshore" ? 211 : 109)
      + (project.assetType === "photovoltaic" ? 307 : 173)
      + (project.hasStorage ? 419 : 0);
    const years = [];

    for (let year = startYear; year <= endYear; year += 1) {
      const monthlySums = Array(12).fill(0);
      const monthlyCounts = Array(12).fill(0);
      const monthValues = Array.from({ length: 12 }, () => []);
      const hourlySumsByMonth = Array.from({ length: 12 }, () => Array(24).fill(0));
      const hourlyCountsByMonth = Array.from({ length: 12 }, () => Array(24).fill(0));
      const typical = {
        annual: createHistoryTypicalAccumulator(),
        summer: createHistoryTypicalAccumulator(),
        winter: createHistoryTypicalAccumulator()
      };
      const values = [];

      for (let day = 1; day <= 365; day += 1) {
        const { month, day: dayOfMonth } = energyProfiles.dayOfYearToMonthDay(day);
        const monthIndex = month - 1;
        const dayIndex = day - 1;
        const dayOfWeek = new Date(Date.UTC(year, monthIndex, dayOfMonth)).getUTCDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const winterLoad = 0.18 * Math.cos(((dayIndex - 12) / 365) * 2 * Math.PI) * factors.winterScale;
        const summerLoad = 0.16 * Math.cos(((dayIndex - 196) / 365) * 2 * Math.PI) * factors.summerScale;
        const seasonal = 1 + winterLoad + summerLoad;
        const yearFactor = 0.92 + ((year - startYear) / 7) * (0.16 * factors.yearVolatility);

        for (let quarter = 0; quarter < 96; quarter += 1) {
          const hour = quarter / 4;
          const morningPeak = Math.exp(-Math.pow((hour - 8.5) / 2.2, 2));
          const eveningPeak = 1.22 * Math.exp(-Math.pow((hour - 18.4) / 2.9, 2));
          const noonValley = 0.13 * Math.exp(-Math.pow((hour - 13.2) / 2.4, 2));
          const nightValley = 0.07 * Math.exp(-Math.pow((hour - 3.2) / 2.8, 2));
          const storageShift = factors.storageScale;
          const diurnal = 0.9
            + factors.morningPeakWeight * morningPeak
            + factors.eveningPeakWeight * eveningPeak
            - (factors.noonValleyWeight - storageShift * 0.05) * noonValley
            - factors.nightValleyWeight * nightValley;
          const weekendFactor = isWeekend ? factors.weekendLevel : 1;
          const randomFactor = 1 + (energyProfiles.pseudoNoise(dayIndex * 97 + quarter, seedBase + year) - 0.5) * factors.noiseAmplitude;
          let price = base * yearFactor * seasonal * diurnal * weekendFactor * randomFactor;

          const spikeSeed = energyProfiles.pseudoNoise(dayIndex * 53 + quarter, seedBase + year + 37);
          if (spikeSeed > factors.spikeThreshold) {
            price *= 1.38 + (spikeSeed - factors.spikeThreshold) * 26 * factors.spikeScale;
          }
          const negativeSeed = energyProfiles.pseudoNoise(dayIndex * 31 + quarter, seedBase + year + 73);
          if (
            hour >= 10.5 && hour <= 15.5
            && (month === 4 || month === 5 || month === 10 || (project.assetType === "photovoltaic" && month === 9))
            && negativeSeed > factors.negativeThreshold
          ) {
            price = -5 - 85 * energyProfiles.pseudoNoise(dayIndex * 43 + quarter, seedBase + year + 91) * factors.negativeScale;
          }
          price = clamp(price, -120, 880);

          const hourSlot = Math.floor(quarter / 4);
          values.push(price);
          monthlySums[monthIndex] += price;
          monthlyCounts[monthIndex] += 1;
          monthValues[monthIndex].push(price);
          hourlySumsByMonth[monthIndex][hourSlot] += price;
          hourlyCountsByMonth[monthIndex][hourSlot] += 1;

          pushHistoryTypical(typical.annual, isWeekend, quarter, price);
          if (dayModeMatchesMonth("summer", month)) {
            pushHistoryTypical(typical.summer, isWeekend, quarter, price);
          }
          if (dayModeMatchesMonth("winter", month)) {
            pushHistoryTypical(typical.winter, isWeekend, quarter, price);
          }
        }
      }

      years.push({
        year,
        values,
        monthValues,
        monthlyAvg: monthlySums.map((sum, idx) => (monthlyCounts[idx] ? sum / monthlyCounts[idx] : null)),
        hourlySumsByMonth,
        hourlyCountsByMonth,
        typical
      });
    }

    const payload = {
      sourceType: "database",
      mock: true,
      startYear,
      endYear,
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
    if (compareIsoDate(startDate, endDate) > 0) {
      [startDate, endDate] = [endDate, startDate];
    }
    return {
      startDate,
      endDate,
      minDate,
      maxDate
    };
  }

  function buildHistoryYearSlice(yearData, range) {
    const yearStartDate = makeIsoDate(yearData.year, 1, 1);
    const yearEndDate = makeIsoDate(yearData.year, 12, 31);
    if (compareIsoDate(yearEndDate, range.startDate) < 0 || compareIsoDate(yearStartDate, range.endDate) > 0) {
      return null;
    }
    const startDay = yearData.year === Number(range.startDate.slice(0, 4)) ? noLeapDayOfYear(range.startDate) : 1;
    const endDay = yearData.year === Number(range.endDate.slice(0, 4)) ? noLeapDayOfYear(range.endDate) : 365;
    const monthValues = Array.from({ length: 12 }, () => []);
    const hourlySumsByMonth = Array.from({ length: 12 }, () => Array(24).fill(0));
    const hourlyCountsByMonth = Array.from({ length: 12 }, () => Array(24).fill(0));
    const monthlySums = Array(12).fill(0);
    const monthlyCounts = Array(12).fill(0);
    const typical = createHistoryTypicalAccumulator();
    const values = [];

    for (let day = startDay; day <= endDay; day += 1) {
      const { month, day: dayOfMonth } = energyProfiles.dayOfYearToMonthDay(day);
      const monthIndex = month - 1;
      const dayOfWeek = new Date(Date.UTC(yearData.year, monthIndex, dayOfMonth)).getUTCDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      for (let quarter = 0; quarter < 96; quarter += 1) {
        const value = yearData.values[(day - 1) * 96 + quarter];
        if (!Number.isFinite(value)) continue;
        const hourSlot = Math.floor(quarter / 4);
        values.push(value);
        monthlySums[monthIndex] += value;
        monthlyCounts[monthIndex] += 1;
        monthValues[monthIndex].push(value);
        hourlySumsByMonth[monthIndex][hourSlot] += value;
        hourlyCountsByMonth[monthIndex][hourSlot] += 1;
        pushHistoryTypical(typical, isWeekend, quarter, value);
      }
    }

    return {
      year: yearData.year,
      values,
      monthValues,
      monthlyAvg: monthlySums.map((sum, idx) => (monthlyCounts[idx] ? sum / monthlyCounts[idx] : null)),
      hourlySumsByMonth,
      hourlyCountsByMonth,
      typical
    };
  }

  function selectHistoryYearsByDateRange(dataset, range) {
    return dataset.years
      .map((yearData) => buildHistoryYearSlice(yearData, range))
      .filter((yearData) => yearData && yearData.values.length);
  }

  function buildHistorySelectedAnalysis(selectedYears, options = {}) {
    const lineColors = Array.isArray(options.lineColors) && options.lineColors.length
      ? options.lineColors
      : ["#2f78e8", "#6cb34f", "#ff8a1f", "#8b5cf6", "#0ea5a3"];
    const allValues = [];
    const monthMerged = Array.from({ length: 12 }, () => []);
    const monthlyStd = [];
    const heatSums = Array.from({ length: 12 }, () => Array(24).fill(0));
    const heatCounts = Array.from({ length: 12 }, () => Array(24).fill(0));
    const typicalMerged = createHistoryTypicalAccumulator();
    const trendSeries = selectedYears.map((yearData, idx) => {
      allValues.push(...yearData.values);
      for (let m = 0; m < 12; m += 1) {
        monthMerged[m].push(...yearData.monthValues[m]);
        for (let h = 0; h < 24; h += 1) {
          heatSums[m][h] += yearData.hourlySumsByMonth[m][h];
          heatCounts[m][h] += yearData.hourlyCountsByMonth[m][h];
        }
      }
      mergeHistoryTypical(typicalMerged, yearData.typical);
      return {
        name: `${yearData.year}年`,
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2 },
        data: yearData.monthlyAvg.map((value) => (Number.isFinite(value) ? Number(value.toFixed(1)) : null)),
        color: lineColors[idx % lineColors.length]
      };
    });

    const sortedValues = [...allValues].sort((a, b) => a - b);
    let valueMin = Number.POSITIVE_INFINITY;
    let valueMax = Number.NEGATIVE_INFINITY;
    let valueSum = 0;
    let negativeCount = 0;
    allValues.forEach((value) => {
      valueMin = Math.min(valueMin, value);
      valueMax = Math.max(valueMax, value);
      valueSum += value;
      if (value < 0) negativeCount += 1;
    });
    const valueAvg = allValues.length ? valueSum / allValues.length : 0;
    const p50 = percentileSorted(sortedValues, 0.5) ?? 0;
    const p90 = percentileSorted(sortedValues, 0.9) ?? 0;
    const negativeRatio = allValues.length ? (negativeCount / allValues.length) * 100 : 0;

    const histogramBins = 12;
    const histMin = Math.floor(valueMin / 20) * 20;
    const histMax = Math.ceil(valueMax / 20) * 20;
    const histStep = Math.max(10, (histMax - histMin) / histogramBins);
    const histogramCounts = Array(histogramBins).fill(0);
    allValues.forEach((value) => {
      const idx = clamp(Math.floor((value - histMin) / histStep), 0, histogramBins - 1);
      histogramCounts[idx] += 1;
    });
    const histogramLabels = Array.from({ length: histogramBins }, (_, idx) => {
      const start = Math.round(histMin + idx * histStep);
      const end = Math.round(histMin + (idx + 1) * histStep);
      return `${start}-${end}`;
    });

    const typicalWorkday = [];
    const typicalWeekend = [];
    for (let i = 0; i < 96; i += 1) {
      const workValue = typicalMerged.workdayCount[i]
        ? typicalMerged.workdaySum[i] / typicalMerged.workdayCount[i]
        : null;
      const weekendValue = typicalMerged.weekendCount[i]
        ? typicalMerged.weekendSum[i] / typicalMerged.weekendCount[i]
        : null;
      typicalWorkday.push(workValue ? Number(workValue.toFixed(1)) : null);
      typicalWeekend.push(weekendValue ? Number(weekendValue.toFixed(1)) : null);
    }

    const heatData = [];
    let heatMin = Number.POSITIVE_INFINITY;
    let heatMax = Number.NEGATIVE_INFINITY;
    for (let month = 0; month < 12; month += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const count = heatCounts[month][hour];
        const avg = count ? heatSums[month][hour] / count : null;
        const value = Number.isFinite(avg) ? Number(avg.toFixed(1)) : null;
        if (Number.isFinite(value)) {
          heatMin = Math.min(heatMin, value);
          heatMax = Math.max(heatMax, value);
        }
        heatData.push([hour, month, value]);
      }
    }

    const boxplotData = monthMerged.map((values) => {
      if (!values.length) return [0, 0, 0, 0, 0];
      const sorted = [...values].sort((a, b) => a - b);
      return [
        Number(sorted[0].toFixed(1)),
        Number((percentileSorted(sorted, 0.25) ?? 0).toFixed(1)),
        Number((percentileSorted(sorted, 0.5) ?? 0).toFixed(1)),
        Number((percentileSorted(sorted, 0.75) ?? 0).toFixed(1)),
        Number(sorted[sorted.length - 1].toFixed(1))
      ];
    });
    for (let i = 0; i < 12; i += 1) {
      monthlyStd.push(stddev(monthMerged[i]));
    }
    let maxStdMonth = 0;
    let maxStd = monthlyStd[0] || 0;
    for (let i = 1; i < 12; i += 1) {
      if ((monthlyStd[i] || 0) > maxStd) {
        maxStd = monthlyStd[i];
        maxStdMonth = i;
      }
    }

    return {
      lineColors,
      allValues,
      trendSeries,
      valueAvg,
      p50,
      p90,
      negativeRatio,
      histogramBins,
      histogramLabels,
      histogramCounts,
      typicalWorkday,
      typicalWeekend,
      heatData,
      heatMin,
      heatMax,
      boxplotData,
      monthlyStd,
      maxStdMonth,
      maxStd,
      exportRows: {
        monthTrend: [
          ["month", ...selectedYears.map((yearData) => `${yearData.year}年均价_元每MWh`)],
          ...HISTORY_MONTH_LABELS.map((monthLabel, monthIndex) => [
            monthLabel,
            ...trendSeries.map((series) => {
              const value = series.data?.[monthIndex];
              return Number.isFinite(value) ? value.toFixed(1) : "";
            })
          ])
        ],
        typicalDay: [
          ["time_label", "workday_price_yuan_per_mwh", "weekend_price_yuan_per_mwh"],
          ...HISTORY_QUARTER_LABELS.map((label, index) => [
            label,
            Number.isFinite(typicalWorkday[index]) ? typicalWorkday[index].toFixed(1) : "",
            Number.isFinite(typicalWeekend[index]) ? typicalWeekend[index].toFixed(1) : ""
          ])
        ],
        distribution: [
          ["price_bin_yuan_per_mwh", "sample_count"],
          ...histogramLabels.map((label, index) => [label, histogramCounts[index]])
        ],
        heatmap: [
          ["month", "hour_index_1_24", "hour_label", "avg_price_yuan_per_mwh"],
          ...heatData
            .filter((item) => Number.isFinite(item[2]))
            .map(([hourIndex, monthIndex, value]) => [
              HISTORY_MONTH_LABELS[monthIndex],
              hourIndex + 1,
              HISTORY_HEAT_HOUR_LABELS[hourIndex],
              Number(value).toFixed(1)
            ])
        ],
        boxplot: [
          ["month", "min", "p25", "p50", "p75", "max", "stddev"],
          ...HISTORY_MONTH_LABELS.map((monthLabel, monthIndex) => [
            monthLabel,
            Number.isFinite(boxplotData[monthIndex]?.[0]) ? boxplotData[monthIndex][0].toFixed(1) : "",
            Number.isFinite(boxplotData[monthIndex]?.[1]) ? boxplotData[monthIndex][1].toFixed(1) : "",
            Number.isFinite(boxplotData[monthIndex]?.[2]) ? boxplotData[monthIndex][2].toFixed(1) : "",
            Number.isFinite(boxplotData[monthIndex]?.[3]) ? boxplotData[monthIndex][3].toFixed(1) : "",
            Number.isFinite(boxplotData[monthIndex]?.[4]) ? boxplotData[monthIndex][4].toFixed(1) : "",
            Number.isFinite(monthlyStd[monthIndex]) ? monthlyStd[monthIndex].toFixed(1) : ""
          ])
        ]
      }
    };
  }

  return Object.freeze({
    HISTORY_MONTH_LABELS,
    HISTORY_HEAT_HOUR_LABELS,
    HISTORY_QUARTER_LABELS,
    createHistoryTypicalAccumulator,
    pushHistoryTypical,
    mergeHistoryTypical,
    percentileSorted,
    stddev,
    dayModeMatchesMonth,
    historyCacheKey,
    buildMockHistorySpotAnalysisDataset,
    resolveHistoryDateRange,
    buildHistoryYearSlice,
    selectHistoryYearsByDateRange,
    buildHistorySelectedAnalysis
  });
});
