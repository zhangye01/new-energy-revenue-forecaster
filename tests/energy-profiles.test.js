"use strict";

const assert = require("node:assert/strict");
const {
  dayOfYearToMonthDay,
  normalizeTypicalCurveProfile,
  pseudoNoise,
  generationWeight,
  generateHourlyHoursFromAnnual
} = require("../src/domain/energy-profiles");

function approx(actual, expected, message, tolerance = 1e-8) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

assert.deepEqual(dayOfYearToMonthDay(1), { month: 1, day: 1 });
assert.deepEqual(dayOfYearToMonthDay(60), { month: 3, day: 1 });
assert.deepEqual(dayOfYearToMonthDay(365), { month: 12, day: 31 });

assert.deepEqual(normalizeTypicalCurveProfile([1, 2, 3]), []);
assert.deepEqual(normalizeTypicalCurveProfile(Array.from({ length: 8760 }, () => -1)), []);
assert.deepEqual(normalizeTypicalCurveProfile(Array.from({ length: 8760 }, () => 0)), []);

const profile = normalizeTypicalCurveProfile(Array.from({ length: 8760 }, (_, index) => index + 1));
assert.equal(profile.length, 8760);
approx(sum(profile), 1, "典型曲线归一化后合计为 1");

const windHours = generateHourlyHoursFromAnnual(2400, "wind", 2026);
assert.equal(windHours.length, 8760);
approx(sum(windHours), 2400, "风电年度小时数拆分守恒", 1e-6);
assert.ok(windHours.every((value) => Number.isFinite(value) && value >= 0));

const pvHours = generateHourlyHoursFromAnnual(1300, "photovoltaic", 2026);
assert.equal(pvHours.length, 8760);
approx(sum(pvHours), 1300, "光伏年度小时数拆分守恒", 1e-6);
assert.equal(generationWeight("photovoltaic", 1, 2026), 0);
assert.ok(generationWeight("photovoltaic", 12, 2026) > 0);

const firstNoise = pseudoNoise(123, 456);
const secondNoise = pseudoNoise(123, 456);
approx(firstNoise, secondNoise, "伪随机噪声稳定");
assert.ok(firstNoise >= 0 && firstNoise < 1);

console.log("energy profile tests passed");
