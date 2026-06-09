"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_HISTORY_ANALYSIS = api;
  if (root.window && root.window !== root) {
    root.window.NE_HISTORY_ANALYSIS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const HISTORY_MONTH_LABELS = Object.freeze(["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]);
  const HISTORY_HEAT_HOUR_LABELS = Object.freeze(Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}时`));
  const HISTORY_QUARTER_LABELS = Object.freeze(Array.from({ length: 96 }, (_, index) => {
    const hour = Math.floor(index / 4);
    const minute = (index % 4) * 15;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }));

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
    buildHistorySelectedAnalysis
  });
});
