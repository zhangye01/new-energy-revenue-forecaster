"use strict";

const assert = require("node:assert/strict");
const {
  HISTORY_MARKET_PRICE_BASIS,
  buildHistorySelectedAnalysis,
  buildHistoryYearSlice,
  buildMockHistorySpotAnalysisDataset,
  historyCacheKey,
  percentileSorted,
  resolveHistoryDateRange,
  selectHistoryYearsByDateRange
} = require("../src/domain/history-analysis");

function approx(actual, expected, message, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, received ${actual}`);
}

assert.equal(percentileSorted([], 0.5), null);
assert.equal(percentileSorted([10, 20, 30], 0.5), 20);
assert.equal(percentileSorted([10, 20], 0.5), 15);

const fullYearValues = Array.from({ length: 365 * 96 }, (_, index) => index);
const fullYearData = { year: 2026, values: fullYearValues };
const range = resolveHistoryDateRange({ startDate: "2026-03-01", endDate: "2026-03-01" }, {
  startYear: 2026,
  endYear: 2026
});
assert.deepEqual(range, {
  startDate: "2026-03-01",
  endDate: "2026-03-01",
  minDate: "2026-01-01",
  maxDate: "2026-12-31"
});
const marchFirstSlice = buildHistoryYearSlice(fullYearData, range);
assert.equal(marchFirstSlice.year, 2026);
assert.equal(marchFirstSlice.values.length, 96);
assert.equal(marchFirstSlice.values[0], 59 * 96);
assert.equal(marchFirstSlice.monthValues[2].length, 96);
assert.equal(marchFirstSlice.heat.weekend[2][0].count, 4);
assert.equal(marchFirstSlice.heat.weekday[2][0].count, 0);
const selectedByRange = selectHistoryYearsByDateRange({
  startYear: 2025,
  endYear: 2026,
  years: [{ year: 2025, values: fullYearValues }, fullYearData]
}, range);
assert.deepEqual(selectedByRange.map((item) => item.year), [2026]);

const leapYearData = { year: 2024, values: fullYearValues };
const leapDataset = { startYear: 2024, endYear: 2024, years: [leapYearData] };
const leapOnly = { startDate: "2024-02-29", endDate: "2024-02-29" };
assert.equal(buildHistoryYearSlice(leapYearData, leapOnly).expectedPoints, 0);
assert.deepEqual(selectHistoryYearsByDateRange(leapDataset, leapOnly), []);
const leapToMarch = buildHistoryYearSlice(leapYearData, { startDate: "2024-02-29", endDate: "2024-03-01" });
assert.equal(leapToMarch.values.length, 96);
assert.equal(leapToMarch.values[0], 59 * 96, "Feb 29 does not introduce Feb 28 data");
const februaryEnd = buildHistoryYearSlice(leapYearData, { startDate: "2024-02-28", endDate: "2024-02-29" });
assert.equal(februaryEnd.values.length, 96);
assert.equal(februaryEnd.values[0], 58 * 96);
assert.deepEqual(buildHistorySelectedAnalysis([leapToMarch]).monthly[0], {
  month: "2024-02", avg: null, p10: null, p50: null, p90: null, count: 0
});

const prices = [];
const modelDayPrices = [
  Array.from({ length: 96 }, (_, quarter) => quarter < 48 ? -10 : 10),
  Array(96).fill(0),
  [undefined, ...Array(95).fill(40)]
];
for (const [day, dayValues] of modelDayPrices.entries()) {
  for (const [quarter, price] of dayValues.entries()) prices[(59 + day) * 96 + quarter] = price;
}
const source2025 = { year: 2025, values: prices };
const range2025 = { startDate: "2025-03-01", endDate: "2025-03-03" };
const sliced = selectHistoryYearsByDateRange({ years: [source2025] }, range2025);
const analysis = buildHistorySelectedAnalysis(sliced);
assert.deepEqual(analysis.coverage, { expectedPoints: 288, samplePoints: 287 });
assert.deepEqual(analysis.monthly, [{
  month: "2025-03", avg: 3800 / 287, p10: -10, p50: 0, p90: 40, count: 287
}]);
assert.deepEqual(analysis.intraday, [{
  month: "2025-03", p25: 5, p50: 10, p75: 15, count: 2
}], "daily quantiles use full model days; 95 data points cannot create a daily spread");
assert.equal(analysis.valueAvg, 3800 / 287);
assert.equal(analysis.p50, 0);
assert.equal(analysis.p90, 40);
approx(analysis.negativeRatio, 4800 / 287, "negative ratio excludes zero");
approx(analysis.duration.zeroRatio, 9600 / 287, "zero ratio");
assert.deepEqual(analysis.duration.points[0], [0, 40, 0]);
assert.deepEqual(analysis.duration.points.at(-1), [100, -10, 23900 / 287]);
assert.deepEqual(analysis.exportRows.duration, [
  ["price_yuan_per_mwh", "sample_count", "cumulative_pct", "strictly_above_pct"],
  [40, 95, 9500 / 287, 0],
  [10, 48, 14300 / 287, 9500 / 287],
  [0, 96, 23900 / 287, 14300 / 287],
  [-10, 48, 100, 23900 / 287]
]);
assert.deepEqual(analysis.exportRows.monthTrend[1], ["2025-03", 3800 / 287, -10, 0, 40, 287]);
assert.deepEqual(analysis.exportRows.intradaySpread[1], ["2025-03", 5, 10, 15, 2]);
const marchIndex = 2 * 24;
assert.deepEqual(analysis.heatData[marchIndex], [0, 2, 80 / 11, 400 / 11, 11]);
assert.deepEqual(analysis.heatData[0], [0, 0, null, null, 0]);
assert.deepEqual(analysis.exportRows.heatmap[marchIndex + 1], [3, "00时", "all", 80 / 11, 400 / 11, 11]);

const weekdays = buildHistorySelectedAnalysis(sliced, { heatMode: "weekday" });
const weekends = buildHistorySelectedAnalysis(sliced, { heatMode: "weekend" });
assert.deepEqual(weekdays.heatData[marchIndex], [0, 2, 40, 0, 3]);
assert.deepEqual(weekends.heatData[marchIndex], [0, 2, -5, 50, 8]);
assert.deepEqual(weekdays.exportRows.heatmap[marchIndex + 1], [3, "00时", "weekday", 40, 0, 3]);
assert.deepEqual(weekdays.monthly, weekends.monthly);
assert.deepEqual(weekdays.intraday, weekends.intraday);
assert.deepEqual(weekdays.duration, weekends.duration);
assert.equal(weekdays.heatMin, weekends.heatMin);
assert.equal(weekdays.heatMax, weekends.heatMax);

const gapAnalysis = buildHistorySelectedAnalysis(selectHistoryYearsByDateRange({ years: [source2025] }, {
  startDate: "2025-01-31",
  endDate: "2025-03-01"
}));
assert.deepEqual(gapAnalysis.monthly.map(({ month, count, avg }) => [month, count, avg]), [
  ["2025-01", 0, null],
  ["2025-02", 0, null],
  ["2025-03", 96, 0]
]);
assert.deepEqual(gapAnalysis.coverage, { expectedPoints: 30 * 96, samplePoints: 96 });
assert.deepEqual(gapAnalysis.exportRows.monthTrend[1], ["2025-01", null, null, null, null, 0]);
const multiYear = buildHistorySelectedAnalysis([marchFirstSlice, ...sliced]);
assert.deepEqual(multiYear.monthly.map(({ month }) => month), ["2025-03", "2026-03"]);

const noData = buildHistorySelectedAnalysis(selectHistoryYearsByDateRange({ years: [source2025] }, {
  startDate: "2025-01-31",
  endDate: "2025-01-31"
}));
assert.deepEqual(noData.coverage, { expectedPoints: 96, samplePoints: 0 });
assert.equal(noData.valueAvg, null);
assert.equal(noData.duration.negativeRatio, null);
assert.deepEqual(noData.duration.points, []);
const manyPrices = buildHistorySelectedAnalysis([
  buildHistoryYearSlice(fullYearData, { startDate: "2026-01-01", endDate: "2026-12-31" })
]);
assert.ok(manyPrices.duration.points.length <= 805);
assert.equal(manyPrices.duration.points.at(-1)[0], 100);
assert.equal(manyPrices.exportRows.duration.length, 365 * 96 + 1);
assert.equal(manyPrices.exportRows.duration.slice(1).reduce((sum, row) => sum + row[1], 0), 365 * 96);

const mockProject = {
  id: "proj-a", province: "jiangsu", capacityMw: 64, startYear: 2026,
  assetType: "wind", siteType: "offshore", hasStorage: true, storagePowerMw: 32, storageDurationH: 2
};
const otherProject = {
  id: "proj-b", province: "jiangsu", capacityMw: 450, startYear: 2042,
  assetType: "photovoltaic", siteType: "onshore", hasStorage: false
};
const provinceBenchmarks = { jiangsu: { historyPrice: 365 }, shandong: { historyPrice: 365 } };
const cache = new Map();
const mockOptions = { provinceBenchmarks, cache };
const mockDataset = buildMockHistorySpotAnalysisDataset(mockProject, mockOptions);
assert.equal(mockDataset.sourceType, "mock");
assert.equal(mockDataset.mock, true);
assert.equal(mockDataset.marketPriceBasis, HISTORY_MARKET_PRICE_BASIS);
assert.equal(mockDataset.marketPriceLabel, "省级现货模拟价");
assert.equal(mockDataset.startYear, 2018);
assert.equal(mockDataset.endYear, 2025);
assert.equal(mockDataset.years.length, 8);
assert.equal(mockDataset.years[0].values.length, 365 * 96);
assert.equal(cache.get(historyCacheKey(mockProject, mockOptions)), mockDataset);
assert.equal(historyCacheKey(mockProject, mockOptions), historyCacheKey(otherProject, mockOptions));
assert.equal(buildMockHistorySpotAnalysisDataset(otherProject, mockOptions), mockDataset);
assert.deepEqual(buildMockHistorySpotAnalysisDataset(otherProject, { provinceBenchmarks }), mockDataset,
  "same province and basis replay the same history even without a cache");
assert.notEqual(historyCacheKey({ province: "shandong" }, mockOptions), historyCacheKey(mockProject, mockOptions));
const otherProvince = buildMockHistorySpotAnalysisDataset({ province: "shandong" }, mockOptions);
assert.notDeepEqual(otherProvince.years[0].values.slice(0, 96), mockDataset.years[0].values.slice(0, 96));
assert.deepEqual(resolveHistoryDateRange({}, mockDataset), {
  minDate: "2018-01-01", maxDate: "2025-12-31", startDate: "2024-01-01", endDate: "2025-12-31"
});

console.log("history analysis tests passed");
