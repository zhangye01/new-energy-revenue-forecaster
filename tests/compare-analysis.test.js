"use strict";

const assert = require("node:assert/strict");
const {
  buildCompareSensitivityFactors,
  buildSensitivitySeries,
  detectTopDriver,
  resultComponentTotals,
  sanitizeCompareSensitivitySettings,
  sensitivityAxisLabels
} = require("../src/domain/compare-analysis");

const dirtySettings = sanitizeCompareSensitivitySettings({
  rangePercent: 99,
  stepPercent: 0,
  responseScalePercent: 10,
  topN: 1,
  selectedKeys: ["spot", "", null, "fee"]
});
assert.deepEqual(dirtySettings, {
  rangePercent: 60,
  stepPercent: 5,
  responseScalePercent: 25,
  topN: 3,
  selectedKeys: ["spot", "fee"]
});

assert.deepEqual(
  sensitivityAxisLabels({ rangePercent: 10, stepPercent: 5 }),
  ["-10%", "-5%", "0%", "+5%", "+10%"]
);

assert.deepEqual(
  buildSensitivitySeries(100, 50, {}, { rangePercent: 10, stepPercent: 10, responseScalePercent: 100 }),
  [95, 100, 105]
);
assert.deepEqual(
  buildSensitivitySeries(100, 50, { invert: true }, { rangePercent: 10, stepPercent: 10, responseScalePercent: 100 }),
  [105, 100, 95]
);

const baselineFirst = {
  energyMwh: 20000,
  mechanismRatio: 0.4,
  spotRevenue: 6200000,
  mechanismRevenue: 400000,
  ltPnlRevenue: 96000,
  envRevenue: 162000,
  comprehensiveFee: 600000,
  storageSupplementRevenue: 760000,
  captureSpread: 10
};
const factors = buildCompareSensitivityFactors(
  baselineFirst,
  705.8,
  { rangePercent: 20, stepPercent: 10, responseScalePercent: 100 }
);
assert.equal(factors.length, 10);
assert.equal(factors[0].key, "hours");
assert.ok(factors.every((factor) => Array.isArray(factor.series) && factor.series.length === 5));
assert.ok(factors.every((factor, index, list) => index === 0 || list[index - 1].sensitivity >= factor.sensitivity));
const feeFactor = factors.find((factor) => factor.key === "fee");
assert.ok(feeFactor);
assert.ok(feeFactor.lowDelta > feeFactor.highDelta, "费用为反向变量");

const totals = resultComponentTotals({
  annualRows: [
    {
      spotRevenue: 100,
      mechanismRevenue: 20,
      ltPnlRevenue: -5,
      envRevenue: 6,
      storageSupplementRevenue: 7,
      comprehensiveFee: 8,
      otherIncome: 9
    },
    {
      spotRevenue: 200,
      mechanismRevenue: 10,
      ltPnlRevenue: 5,
      envRevenue: 4,
      storageSupplementRevenue: 3,
      comprehensiveFee: 2,
      otherIncome: 1
    }
  ]
});
assert.deepEqual(totals, {
  spotRevenue: 300,
  mechanismRevenue: 30,
  ltPnlRevenue: 0,
  envRevenue: 10,
  storageSupplementRevenue: 10,
  comprehensiveFee: -10,
  otherIncome: 10
});

assert.equal(
  detectTopDriver({ annualRows: [{ spotRevenue: 10, mechanismRevenue: 20, ltPnlRevenue: 5, envRevenue: 2, storageSupplementRevenue: 1, comprehensiveFee: 15 }] }),
  "差价机制"
);
assert.equal(detectTopDriver({ annualRows: [] }), "-");

console.log("compare analysis tests passed");
