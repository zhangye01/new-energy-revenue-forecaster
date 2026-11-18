"use strict";
const assert = require("node:assert/strict");
const { ALGORITHM_VERSION, calculateHourlyDispatch } = require("../src/domain/storage-dispatch");
const approx = (actual, expected, message = "") => assert.ok(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), `${message}: ${actual} != ${expected}`);
const day = (value = 0) => Array(24).fill(value);
function dispatch(prices, generationMwh, options = {}) {
  return calculateHourlyDispatch({ prices, generationMwh, powerMw: 1, durationH: 1, roundTripEfficiency: .8, includeHourly: true, ...options });
}
function verify(result, prices, generation, power, duration, efficiency) {
  let charge = 0, discharge = 0, revenue = 0, balance = 0;
  assert.equal(result.hourly.length, prices.length);
  result.hourly.forEach((row, hour) => {
    if (hour % 24 === 0) approx(balance, 0, "daily initial SOC");
    assert.ok(row.chargeMwh >= 0 && row.dischargeMwh >= 0);
    assert.ok(row.chargeMwh <= Math.min(power, generation[hour]) + 1e-8, "charge power and on-site generation");
    assert.ok(row.dischargeMwh <= power + 1e-8, "AC discharge power");
    assert.ok(!(row.chargeMwh > 0 && row.dischargeMwh > 0), "no simultaneous charge/discharge");
    balance += row.chargeMwh - row.dischargeMwh / efficiency;
    approx(row.socMwh, balance, "SOC transition");
    assert.ok(row.socMwh >= -1e-8 && row.socMwh <= power * duration + 1e-8, "energy capacity");
    if (hour % 24 === 23) approx(balance, 0, "daily terminal SOC");
    approx(row.incrementalRevenue, (row.dischargeMwh - row.chargeMwh) * prices[hour], "hourly net value");
    charge += row.chargeMwh; discharge += row.dischargeMwh; revenue += row.incrementalRevenue;
  });
  approx(result.chargeMwh, charge); approx(result.dischargeMwh, discharge);
  approx(discharge, charge * efficiency, "energy conservation with discharge loss");
  approx(result.incrementalRevenue, revenue);
  approx(result.incrementalRevenue, result.dischargeRevenue - result.chargeOpportunityCost);
  assert.ok(result.incrementalRevenue >= -1e-8);
}

assert.equal(ALGORITHM_VERSION, "daily-price-pairing-v1");

// Hand calculation: 1 MWh foregone at 20, 0.8 MWh delivered at 100.
{
  const prices = day(20), generation = day(); prices[1] = 100; generation[0] = 1;
  const before = JSON.stringify({ prices, generation });
  const result = dispatch(prices, generation);
  approx(result.chargeMwh, 1); approx(result.dischargeMwh, .8);
  approx(result.chargeOpportunityCost, 20); approx(result.dischargeRevenue, 80);
  approx(result.incrementalRevenue, 60);
  assert.equal(result.hourly[0].socMwh, 1); assert.equal(result.hourly[1].socMwh, 0);
  assert.equal(JSON.stringify({ prices, generation }), before, "inputs remain unchanged");
  verify(result, prices, generation, 1, 1, .8);
  const compact = dispatch(prices, generation, { includeHourly: false });
  assert.equal(Object.hasOwn(compact, "hourly"), false);
  approx(compact.incrementalRevenue, result.incrementalRevenue);
}

// Flat prices, including negative flat prices, cannot create loss-only trades.
for (const price of [0, 50, -100]) {
  const result = dispatch(day(price), day(2));
  assert.equal(result.chargeMwh, 0); assert.equal(result.dischargeMwh, 0);
  assert.equal(result.incrementalRevenue, 0);
}
{
  const prices = day(-100), generation = day(); prices[1] = -50; generation[0] = 1;
  const result = dispatch(prices, generation);
  approx(result.chargeOpportunityCost, -100); approx(result.dischargeRevenue, -40);
  approx(result.incrementalRevenue, 60);
  verify(result, prices, generation, 1, 1, .8);
}
{
  const prices = day(90), generation = day(); prices[1] = 100; generation[0] = 1;
  assert.equal(dispatch(prices, generation).chargeMwh, 0, "price rise does not cover loss");
  prices[0] = 80;
  assert.equal(dispatch(prices, generation).chargeMwh, 0, "zero net value is skipped");
  prices.fill(-110); prices[0] = -100;
  assert.equal(dispatch(prices, generation).chargeMwh, 0, "declining negative prices cannot reward dissipation");
}

// Charging is bounded by the actual on-site energy; no grid purchase is added.
{
  const prices = day(20), generation = day(); prices[1] = 100; generation[0] = .25;
  const result = dispatch(prices, generation);
  approx(result.chargeMwh, .25); approx(result.dischargeMwh, .2); approx(result.incrementalRevenue, 15);
  verify(result, prices, generation, 1, 1, .8);
  assert.equal(dispatch(prices, day()).chargeMwh, 0);
  assert.equal(dispatch(prices, generation, { powerMw: 0 }).chargeMwh, 0);
}

// Capacity can bind before power; discharge power is measured on the AC side.
{
  const prices = day(10), generation = day(); prices[3] = 100; generation[0] = 10; generation[1] = 10;
  const small = dispatch(prices, generation, { powerMw: 2, durationH: .25 });
  approx(small.chargeMwh, .5); approx(small.dischargeMwh, .4);
  verify(small, prices, generation, 2, .25, .8);
  const large = dispatch(prices, generation, { powerMw: 2, durationH: 2 });
  approx(large.chargeMwh, 2.5); approx(large.dischargeMwh, 2);
  verify(large, prices, generation, 2, 2, .8);
}

// Occupied capacity is checked across overlapping pairs, not just endpoints.
{
  const prices = day(30), generation = day();
  prices[0] = 0; prices[1] = 1; prices[2] = 90; prices[3] = 100;
  generation[0] = 1; generation[1] = 1;
  const result = dispatch(prices, generation, { roundTripEfficiency: 1 });
  approx(result.chargeMwh, 1); approx(result.incrementalRevenue, 100);
  verify(result, prices, generation, 1, 1, 1);
}

// Capacity becomes available again after an earlier intra-day discharge.
{
  const prices = day(), generation = day(); prices[1] = 100; prices[3] = 100;
  generation[0] = 1; generation[2] = 1;
  const result = dispatch(prices, generation, { roundTripEfficiency: 1 });
  approx(result.chargeMwh, 2); approx(result.dischargeMwh, 2); approx(result.incrementalRevenue, 200);
  verify(result, prices, generation, 1, 1, 1);
}

// Fixed model days reset SOC; 23:00 cannot charge for the following day's 00:00.
{
  const prices = Array(48).fill(50), generation = Array(48).fill(0);
  prices[23] = 0; prices[24] = 200; generation[23] = 1;
  const result = dispatch(prices, generation);
  assert.equal(result.chargeMwh, 0); verify(result, prices, generation, 1, 1, .8);
  prices[0] = 0; prices[1] = 100; generation[0] = 1;
  prices[25] = 0; prices[26] = 100; generation[25] = 1;
  const independent = dispatch(prices, generation);
  approx(independent.chargeMwh, 2); approx(independent.dischargeMwh, 1.6);
  approx(independent.incrementalRevenue, 160);
  verify(independent, prices, generation, 1, 1, .8);
}

// A deterministic varied-price fixture checks every physical constraint.
{
  const prices = Array.from({ length: 24 * 7 }, (_, i) => Math.sin(i * 1.7) * 150 + (i % 24) * 3);
  const generation = prices.map((_, i) => Math.max(0, Math.sin((i % 24 - 6) / 12 * Math.PI)) * 4);
  const result = dispatch(prices, generation, { powerMw: 2, durationH: 3, roundTripEfficiency: .9 });
  verify(result, prices, generation, 2, 3, .9);
  assert.deepEqual(result, dispatch(prices, generation, { powerMw: 2, durationH: 3, roundTripEfficiency: .9 }));
}

for (const invalid of [
  { prices: [] }, { prices: day().slice(1) }, { generationMwh: day().slice(1) },
  { prices: Array(24) }, { generationMwh: Array(24) },
  { prices: day(NaN) }, { prices: day(Infinity) }, { generationMwh: day(-1) },
  { generationMwh: day(null) }, { powerMw: -1 }, { powerMw: Infinity },
  { durationH: 0 }, { roundTripEfficiency: 0 }, { roundTripEfficiency: 1.01 },
  { powerMw: Number.MAX_VALUE, durationH: 2 }
]) assert.throws(() => dispatch(day(10), day(1), invalid), RangeError);

console.log("storage dispatch tests passed");
