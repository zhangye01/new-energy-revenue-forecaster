"use strict";

const assert = require("node:assert/strict");
const { buildTurningPoint } = require("../src/domain/result-brief-turning-point");

function annualRow(year, energyMwh, capturePrice, components) {
  const spotRevenue = capturePrice * energyMwh;
  const { mechanismRevenue = 0, mechanismRatio = 0, ltPnlRevenue = 0, envRevenue = 0, storageSupplementRevenue = 0,
    comprehensiveFee = 0, otherIncome = 0 } = components;
  const fullRevenue = spotRevenue + mechanismRevenue + ltPnlRevenue + envRevenue + storageSupplementRevenue - comprehensiveFee + otherIncome;
  return Object.freeze({ year, energyMwh, capturePrice, fullRevenue, fullRevenuePrice: fullRevenue / energyMwh,
    spotRevenue, mechanismRevenue, mechanismRatio, ltPnlRevenue, envRevenue, storageSupplementRevenue, comprehensiveFee, otherIncome });
}

const before = annualRow(2029, 378000, 450.0315657943654, {
  mechanismRevenue: -7262372.7481080815, mechanismRatio: 0.4, ltPnlRevenue: -2041200, envRevenue: 5034960,
  storageSupplementRevenue: 6179772.0312, comprehensiveFee: 22.5 * 378000, otherIncome: -1.5 * 378000
});
const after = annualRow(2030, 372000, 452.3751229922144, {
  ltPnlRevenue: -1488000, envRevenue: 8258400, storageSupplementRevenue: 6091758.483315143,
  comprehensiveFee: 22.5 * 372000, otherIncome: -1.5 * 372000
});

const selected = buildTurningPoint({ change: { before, after } });
assert.match(selected.finding, /2029 至 2030 年，度电净价由 431\.09 升至 462\.95 元\/MWh，增加 31\.86/);
assert.match(selected.intro[0], /结算电量减少 6,000 MWh，年收入仍增加 926\.66 万元/);
assert.match(selected.intro[1], /机制负补差退出贡献 \+19\.21 元\/MWh，环境价值兑现贡献 \+8\.88 元\/MWh/);
assert.deepEqual(selected.table.rows, [
  ["结算电量（MWh）", "378,000", "372,000", "-6,000"],
  ["捕获电价（元/MWh）", "450.03", "452.38", "+2.34"],
  ["度电净价（元/MWh）", "431.09", "462.95", "+31.86"],
  ["全口径收入（万元）", "16,295.11", "17,221.77", "+926.66"]
]);
assert.deepEqual(selected.figure.items.map(({ colorKey, value, role }) => [colorKey, Number(value.toFixed(2)), role]), [
  ["net", 431.09, "start"], ["spot", 2.34, "change"], ["mechanism", 19.21, "change"], ["trade", 1.40, "change"],
  ["env", 8.88, "change"], ["storage", 0.03, "change"], ["net", 462.95, "end"]
]);
const items = selected.figure.items;
assert.ok(Math.abs(items.slice(0, -1).reduce((total, item) => total + item.value, 0) - items.at(-1).value) < 1e-8);

const remainsActive = buildTurningPoint({ change: { before, after: { ...after, mechanismRatio: 0.3 } } });
assert.match(remainsActive.intro[1], /差价机制结算贡献 \+19\.21/);
assert.doesNotMatch(remainsActive.intro[1], /退出/);

const reversed = buildTurningPoint({ change: { before: { ...after, year: 2029 }, after: { ...before, year: 2030 } } });
assert.match(reversed.finding, /462\.95 降至 431\.09/);
assert.match(reversed.intro[1], /差价机制结算贡献 -19\.21/);

const legacy = buildTurningPoint({ change: { before, after: { ...after, spotRevenue: undefined } } });
assert.equal(legacy.figure, null);
assert.equal(legacy.intro.length, 1);
assert.deepEqual(legacy.table.rows, selected.table.rows);
assert.equal(buildTurningPoint({ change: { before, after: { ...before, year: 2030 } } }), null);
assert.equal(buildTurningPoint({ change: { before, after: { ...after, year: 2031 } } }), null);
assert.equal(buildTurningPoint({ change: { before, after: { ...after, energyMwh: 0 } } }), null);
assert.equal(buildTurningPoint(), null);
console.log("result brief turning-point tests passed");
