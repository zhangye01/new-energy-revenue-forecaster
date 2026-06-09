"use strict";

const assert = require("node:assert/strict");
const {
  buildHistorySelectedAnalysis,
  createHistoryTypicalAccumulator,
  percentileSorted,
  pushHistoryTypical,
  stddev
} = require("../src/domain/history-analysis");

function approx(actual, expected, message, tolerance = 1e-8) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function createYearData(year, values, monthlyValuesByIndex, typicalEntries = []) {
  const monthValues = Array.from({ length: 12 }, (_, monthIndex) => monthlyValuesByIndex[monthIndex] || []);
  const hourlySumsByMonth = Array.from({ length: 12 }, () => Array(24).fill(0));
  const hourlyCountsByMonth = Array.from({ length: 12 }, () => Array(24).fill(0));
  monthValues.forEach((monthValuesList, monthIndex) => {
    monthValuesList.forEach((value, index) => {
      const hour = index % 24;
      hourlySumsByMonth[monthIndex][hour] += value;
      hourlyCountsByMonth[monthIndex][hour] += 1;
    });
  });
  const typical = createHistoryTypicalAccumulator();
  typicalEntries.forEach((entry) => {
    pushHistoryTypical(typical, entry.isWeekend, entry.quarterIndex, entry.price);
  });
  return {
    year,
    values,
    monthValues,
    monthlyAvg: monthValues.map((items) => (
      items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : null
    )),
    hourlySumsByMonth,
    hourlyCountsByMonth,
    typical
  };
}

assert.equal(percentileSorted([], 0.5), null);
assert.equal(percentileSorted([10, 20, 30], 0.5), 20);
assert.equal(percentileSorted([10, 20], 0.5), 15);
approx(stddev([10, 20, 30]), 8.16496580927726, "标准差计算");

const selectedYears = [
  createYearData(
    2024,
    [100, 200, -50, 400],
    {
      0: [100, 200],
      1: [-50, 400]
    },
    [
      { isWeekend: false, quarterIndex: 32, price: 200 },
      { isWeekend: true, quarterIndex: 40, price: 100 }
    ]
  ),
  createYearData(
    2025,
    [300],
    {
      0: [300]
    },
    [
      { isWeekend: false, quarterIndex: 32, price: 260 }
    ]
  )
];

const analysis = buildHistorySelectedAnalysis(selectedYears, {
  lineColors: ["#111111", "#222222"]
});

assert.equal(analysis.allValues.length, 5);
assert.equal(analysis.valueAvg, 190);
assert.equal(analysis.p50, 200);
assert.equal(analysis.p90, 360);
assert.equal(analysis.negativeRatio, 20);
assert.deepEqual(analysis.trendSeries.map((series) => series.name), ["2024年", "2025年"]);
assert.equal(analysis.trendSeries[0].color, "#111111");
assert.deepEqual(analysis.trendSeries[0].data.slice(0, 3), [150, 175, null]);
assert.equal(analysis.histogramCounts.reduce((sum, value) => sum + value, 0), 5);
assert.equal(analysis.typicalWorkday[32], 230);
assert.equal(analysis.typicalWeekend[40], 100);
assert.deepEqual(analysis.heatData[0], [0, 0, 200]);
assert.deepEqual(analysis.boxplotData[0], [100, 150, 200, 250, 300]);
assert.equal(analysis.maxStdMonth, 1);
assert.equal(analysis.exportRows.monthTrend[0][1], "2024年均价_元每MWh");
assert.equal(analysis.exportRows.typicalDay[33][1], "230.0");
assert.deepEqual(analysis.exportRows.distribution[0], ["price_bin_yuan_per_mwh", "sample_count"]);
assert.deepEqual(analysis.exportRows.boxplot[1].slice(0, 6), ["1月", "100.0", "150.0", "200.0", "250.0", "300.0"]);

console.log("history analysis tests passed");
