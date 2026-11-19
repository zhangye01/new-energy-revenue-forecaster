"use strict";

const assert = require("node:assert/strict");
const { buildOperatingExhibits } = require("../src/domain/result-brief-operating");
const { hourIndexToTimestamp } = require("../src/domain/revenue-calculator");

const hourlyPreview = Array.from({ length: 8760 }, (_, index) => {
  const block = Math.floor(index % 24 / 6);
  const energyMwh = block + 1;
  const spotPrice = [-20, 300, 450, 650][block];
  return { time: hourIndexToTimestamp(2028, index), energyMwh, spotPrice, spotRevenue: energyMwh * spotPrice };
});
const first = { year: 2028, energyMwh: 21900, spotAvgPrice: 345, spotRevenue: 9920700 };
const result = { annualRows: [{ year: 2029, energyMwh: 20000 }, first], hourlyPreview, totalEnergy: 41900 };
const original = JSON.stringify(result);
const report = buildOperatingExhibits(result);
const figure = (key) => report.figures.find((item) => item.key === key);
const table = (key) => report.tables.find((item) => item.key === key);

assert.deepEqual(report.sections.map((section) => section.key), ["settlement", "spot-detail"]);
assert.equal(report.figures.length, 4);
assert.equal(report.tables.length, 4);
assert.ok(report.tables.every(({ headers }) => headers.length <= 5));
assert.deepEqual(figure("annual-energy").series[0].values, [2.19, 2]);
assert.equal(figure("monthly-energy").series[0].values[1], 0.168, "闰年仍使用不含闰日的 8760 模型年");
assert.equal(figure("monthly-energy").series[0].values.reduce((sum, value) => sum + value, 0).toFixed(2), "2.19");
assert.deepEqual(figure("monthly-price").series.map(({ values }) => values[0]), [345, 453]);
assert.equal(figure("duration-price").series[0].values[0], 650);
assert.equal(figure("duration-price").series[0].values.at(-1), -20);
assert.ok(figure("duration-price").series[0].values.every((value, index, all) => index === 0 || value <= all[index - 1]));
assert.deepEqual(table("quarterly-energy").rows[0], ["一季度", "5,400.00", "24.66", "60.00"]);
assert.deepEqual(table("monthly-price-energy").rows[0], ["1 月", "1,860.00", "345.00", "453.00", "108.00"]);
assert.deepEqual(table("price-bands").rows[0], ["低于 0", "2,190", "25.00", "2,190.00", "10.00"]);
assert.equal(table("price-bands").rows.reduce((sum, row) => sum + Number(row[1].replaceAll(",", "")), 0), 8760);
assert.deepEqual(table("time-blocks").rows.at(-1), ["18–23 时", "8,760.00", "40.00", "650.00", "650.00"]);
assert.equal(JSON.stringify(result), original, "只读使用保存的年度和小时数据");

for (const invalid of [
  { ...result, hourlyPreview: hourlyPreview.slice(0, -1) },
  { ...result, hourlyPreview: [{ ...hourlyPreview[0], time: hourlyPreview[1].time }, ...hourlyPreview.slice(1)] },
  { ...result, hourlyPreview: [{ ...hourlyPreview[0], spotRevenue: 100 }, ...hourlyPreview.slice(1)] },
  { ...result, annualRows: [result.annualRows[0], { ...first, spotAvgPrice: 344 }] }
]) {
  const limited = buildOperatingExhibits(invalid);
  assert.deepEqual(limited.figures.map(({ key }) => key), ["annual-energy"]);
  assert.deepEqual(limited.tables, []);
  assert.deepEqual(limited.sections.map(({ key }) => key), ["settlement"]);
}

const noEnergy = buildOperatingExhibits({ annualRows: [{ year: 2028, energyMwh: 0, spotAvgPrice: 345, spotRevenue: 0 }],
  totalEnergy: 0, hourlyPreview: hourlyPreview.map((row) => ({ ...row, energyMwh: 0, spotRevenue: 0 })) });
assert.equal(noEnergy.figures.find(({ key }) => key === "monthly-price").series[1].values[0], null);
assert.equal(noEnergy.tables.find(({ key }) => key === "monthly-price-energy").rows[0][3], "—");
assert.deepEqual(buildOperatingExhibits(null), { figures: [], tables: [], sections: [] });

console.log("result brief operating exhibit tests passed");
