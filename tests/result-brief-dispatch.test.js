"use strict";

const assert = require("node:assert/strict");
const { buildDispatchExhibits } = require("../src/domain/result-brief-dispatch");
const { hourIndexToTimestamp } = require("../src/domain/revenue-calculator");

const year = 2028;
const firstYear = {
  year, energyMwh: 2000, mechanismRatio: 0.35, mechanismRevenue: -40000, fullRevenue: 670000,
  storageDispatch: {
    withStorageFullRevenue: 670000, withoutStorageFullRevenue: 640000, incrementalRevenue: 22000,
    independentSupplementRevenue: 8000, chargeMwh: 100, dischargeMwh: 88
  }
};
const secondYear = {
  ...firstYear, year: year + 1, mechanismRatio: 0, mechanismRevenue: 0, fullRevenue: 650000,
  storageDispatch: {
    ...firstYear.storageDispatch, withStorageFullRevenue: 650000, withoutStorageFullRevenue: 640000,
    incrementalRevenue: -10000, independentSupplementRevenue: 20000
  }
};
const hourlyPreview = Array.from({ length: 8760 }, (_, index) => ({
  time: hourIndexToTimestamp(year, index), storageDispatch: { chargeMwh: 0, dischargeMwh: 0, incrementalRevenue: 0 }
}));
hourlyPreview[0].storageDispatch = { chargeMwh: 100, dischargeMwh: 0, incrementalRevenue: -12000 };
hourlyPreview[31 * 24].storageDispatch = { chargeMwh: 0, dischargeMwh: 88, incrementalRevenue: 34000 };
const result = { annualRows: [secondYear, firstYear], hourlyPreview };
const original = JSON.stringify(result);

const exhibits = buildDispatchExhibits(result);
assert.deepEqual(exhibits.storageBlocks, [
  { kind: "figure", key: "annual-storage" }, { kind: "table", key: "monthly-storage-detail" }
]);
assert.deepEqual(exhibits.incomeBlocks, [{ kind: "table", key: "mechanism-settlement" }]);
assert.equal(exhibits.figures.length, 1);
const annual = exhibits.figures.find(({ key }) => key === "annual-storage");
assert.deepEqual(annual.labels, [String(year), String(year + 1)]);
assert.deepEqual(annual.series.map(({ values }) => values), [[2.2, -1], [0.8, 2]]);
const detail = exhibits.tables.find(({ key }) => key === "monthly-storage-detail");
assert.equal(detail.rows.length, 13);
assert.deepEqual(detail.rows.slice(0, 2), [["1月", "100.00", "0.00", "-1.20"], ["2月", "0.00", "88.00", "3.40"]]);
assert.deepEqual(detail.rows.at(-1), ["首年合计", "100.00", "88.00", "2.20"]);
assert.deepEqual(exhibits.tables.find(({ key }) => key === "mechanism-settlement").rows, [
  [String(year), "35.00", "700.00", "-4.00"], [String(year + 1), "0.00", "0.00", "0.00"]
]);
const thirdYear = { ...secondYear, year: year + 2 };
const ended = buildDispatchExhibits({ annualRows: [thirdYear, secondYear, firstYear] });
assert.deepEqual(ended.tables[0].rows.map((row) => row[0]), [String(year), String(year + 1)]);
const missingAdjacent = buildDispatchExhibits({ annualRows: [thirdYear, firstYear] });
assert.deepEqual(missingAdjacent.tables[0].rows.map((row) => row[0]), [String(year)]);
assert.equal(JSON.stringify(result), original);

const duplicateHour = hourlyPreview.slice();
duplicateHour[1] = duplicateHour[0];
const inconsistentHours = hourlyPreview.slice();
inconsistentHours[0] = { ...inconsistentHours[0], storageDispatch: { chargeMwh: 100, dischargeMwh: 0, incrementalRevenue: 100 } };
for (const invalid of [undefined, hourlyPreview.slice(0, -1), duplicateHour, inconsistentHours]) {
  const partial = buildDispatchExhibits({ ...result, hourlyPreview: invalid });
  assert.deepEqual(partial.figures.map(({ key }) => key), ["annual-storage"]);
  assert.deepEqual(partial.tables.map(({ key }) => key), ["mechanism-settlement"]);
}

const noStorage = buildDispatchExhibits({ ...result, annualRows: [{ ...firstYear, storageDispatch: undefined }, secondYear] });
assert.equal(noStorage.figures.length, 0);
assert.equal(noStorage.tables.length, 1);

const invalidAnnual = buildDispatchExhibits({ ...result, annualRows: [firstYear, { ...secondYear, fullRevenue: 650001 }] });
assert.equal(invalidAnnual.figures.length, 0);
const noMechanism = buildDispatchExhibits({ annualRows: [secondYear] });
assert.equal(noMechanism.tables.length, 0);
assert.equal(noMechanism.figures.length, 1);

console.log("Result brief dispatch exhibits preserve signed settlements and reconcile hourly storage with the saved annual result.");
