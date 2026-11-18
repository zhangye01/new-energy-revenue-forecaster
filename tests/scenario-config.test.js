"use strict";

const assert = require("node:assert/strict");
const {
  parseBooleanLike,
  getLtPricingMode,
  getEnvValueMode,
  getFeeConfigMode,
  getOtherNetIncome,
  sanitizeLtManualPricesByYear,
  sanitizeEnvManualValuesByYear,
  sanitizeFeeManualValuesByYear,
  preserveLegacyEnvFields,
  preserveLegacyFeeFields,
  getLtManualCompleteness,
  getEnvManualEntryForYear,
  getEnvManualCompleteness,
  getFeeManualEntryForYear,
  getFeeManualCompleteness,
  buildLtManualTemplateRows,
  parseLtManualPricesCsv,
  buildEnvManualTemplateRows,
  parseEnvManualValuesCsv,
  buildFeeManualTemplateRows,
  parseFeeManualValuesCsv
} = require("../src/domain/scenario-config");

const offshoreProject = {
  startYear: 2026,
  forecastYears: 3,
  siteType: "offshore"
};

assert.equal(parseBooleanLike("是"), true);
assert.equal(parseBooleanLike("no", true), false);
assert.equal(parseBooleanLike("未知", true), true);

assert.equal(getLtPricingMode({ ltPricingMode: "manual" }), "manual");
assert.equal(getLtPricingMode({ ltPricingMode: "other" }), "auto");
assert.equal(getEnvValueMode({ envValueMode: "manual" }), "manual");
assert.equal(getEnvValueMode({ envValueMode: "other" }), "global");
assert.equal(getFeeConfigMode({ feeConfigMode: "manual" }), "manual");
assert.equal(getFeeConfigMode({ feeConfigMode: "other" }), "global");

const ltPrices = sanitizeLtManualPricesByYear({
  2025: 99,
  2026: "8",
  2027: "bad",
  2028: 2,
  2029: 1
}, offshoreProject);
assert.deepEqual(ltPrices, { 2026: 8, 2028: 2 });

const ltCompleteness = getLtManualCompleteness(offshoreProject, { ltManualPricesByYear: ltPrices });
assert.equal(ltCompleteness.complete, 2);
assert.equal(ltCompleteness.total, 3);
assert.deepEqual(ltCompleteness.missingYears, [2027]);

const envValues = sanitizeEnvManualValuesByYear({
  2026: {
    greenCertPrice: "22",
    greenCertRealizeRatio: "0.2",
    greenPremiumPrice: "12",
    greenPremiumRealizeRatio: "0.3",
    carbonEnabled: "是",
    carbonPrice: "4",
    carbonRealizeRatio: "0.4"
  },
  2027: {
    greenCertRealizeRatio: "0.6",
    greenPremiumRealizeRatio: "0.3",
    carbonEnabled: true,
    carbonRealizeRatio: "0.2"
  },
  2028: {
    greenCertRealizeRatio: "0.5",
    greenPremiumRealizeRatio: "0.6",
    carbonEnabled: false
  }
}, offshoreProject);
assert.deepEqual(Object.keys(envValues), ["2026", "2027"]);
assert.equal(Object.hasOwn(envValues[2026], "carbonEnabled"), false);
assert.equal(envValues[2026].greenCertPrice, 22);

const onshoreEnv = sanitizeEnvManualValuesByYear({
  2026: {
    greenCertRealizeRatio: "0.4",
    greenPremiumRealizeRatio: "0.2",
    carbonEnabled: "是",
    carbonPrice: "4",
    carbonRealizeRatio: "0.4"
  }
}, { ...offshoreProject, siteType: "onshore" });
assert.deepEqual(onshoreEnv[2026], {
  greenCertPrice: 0, greenCertRealizeRatio: 0.4, greenPremiumPrice: 0, greenPremiumRealizeRatio: 0.2
});
assert.deepEqual(preserveLegacyEnvFields({ 2026: { carbonEnabled: true, carbonPrice: null, carbonRealizeRatio: "0.36001" } }, {
  2026: { greenCertPrice: 24, carbonPrice: 90 }, 2027: { greenCertPrice: 25, carbonEnabled: true }
}), {
  2026: { greenCertPrice: 24, carbonEnabled: true, carbonPrice: null, carbonRealizeRatio: "0.36001" },
  2027: { greenCertPrice: 25 }
});

const manualEnvConfig = {
  envValueMode: "manual",
  envManualValuesByYear: {
    ...envValues,
    2027: onshoreEnv[2026]
  }
};
assert.equal(getEnvManualEntryForYear(offshoreProject, manualEnvConfig, 2026).greenPremiumPrice, 12);
assert.equal(getEnvManualEntryForYear(offshoreProject, { ...manualEnvConfig, envValueMode: "global" }, 2026), null);
const envCompleteness = getEnvManualCompleteness(offshoreProject, manualEnvConfig);
assert.equal(envCompleteness.complete, 2);
assert.deepEqual(envCompleteness.missingYears, [2028]);

const feeValues = sanitizeFeeManualValuesByYear({
  2026: {
    marketOpFee: "6",
    gridAssessFee: "7",
    ancillaryFee: "14",
    otherFee: "3",
    otherIncome: "2"
  },
  2027: {
    marketOpFee: "-1"
  },
  2028: {
    marketOpFee: "1",
    otherIncome: "0"
  }
}, offshoreProject);
assert.deepEqual(Object.keys(feeValues), ["2026"]);
assert.equal(feeValues[2026].ancillaryFee, 14);
assert.equal(getFeeManualEntryForYear(offshoreProject, { feeConfigMode: "global", feeManualValuesByYear: feeValues }, 2026), null);
assert.equal(getFeeManualEntryForYear(offshoreProject, { feeConfigMode: "manual", feeManualValuesByYear: feeValues }, 2026).otherNetIncome, -1);
const feeCompleteness = getFeeManualCompleteness(offshoreProject, { feeManualValuesByYear: feeValues });
assert.equal(feeCompleteness.complete, 1);
assert.deepEqual(feeCompleteness.missingYears, [2027, 2028]);
assert.equal(getOtherNetIncome({ otherFee: 3, otherIncome: 2 }), -1);
assert.equal(getOtherNetIncome({ otherNetIncome: 0, otherFee: 3, otherIncome: 2 }), 0);
assert.equal(getOtherNetIncome({ otherNetIncome: 5, otherFee: 3, otherIncome: 2 }), 5);
for (const invalid of [null, "", "   ", false, Infinity, []]) {
  assert.equal(getOtherNetIncome({ otherNetIncome: invalid, otherFee: 3, otherIncome: 2 }), null);
  assert.equal(getOtherNetIncome({ otherFee: invalid, otherIncome: 2 }), null);
}
assert.equal(getOtherNetIncome({ otherFee: 3 }), null);
assert.deepEqual(preserveLegacyFeeFields({ 2026: { otherFee: 3, otherIncome: 2 } }, {
  2026: { otherNetIncome: -4, otherFee: 999 }, 2027: { otherNetIncome: 4, otherIncome: 999 }
}), { 2026: { otherNetIncome: -4, otherFee: 3, otherIncome: 2 }, 2027: { otherNetIncome: 4 } });

assert.deepEqual(buildLtManualTemplateRows(offshoreProject), [
  ["year", "trade_strategy_pnl_yuan_per_mwh"],
  [2026, ""],
  [2027, ""],
  [2028, ""]
]);

const parsedLt = parseLtManualPricesCsv([
  "year,trade_strategy_pnl_yuan_per_mwh",
  "2026,8",
  "2027,6",
  "2028,2"
].join("\n"), offshoreProject);
assert.equal(parsedLt.ok, true);
assert.deepEqual(parsedLt.prices, { 2026: 8, 2027: 6, 2028: 2 });
assert.match(parseLtManualPricesCsv("year,price\n2026,8", offshoreProject).message, /不完整/);

assert.equal(buildEnvManualTemplateRows(offshoreProject).length, 4);
assert.equal(buildEnvManualTemplateRows(offshoreProject)[0].length, 5);
const parsedEnv = parseEnvManualValuesCsv([
  "year,green_cert_price_yuan_per_mwh,green_cert_realize_ratio_pct,green_premium_price_yuan_per_mwh,green_premium_realize_ratio_pct,carbon_enabled,carbon_price_yuan_per_mwh,carbon_realize_ratio_pct",
  "2026,22,40,12,20,已删除的旧字段,不是价格,200",
  "2027,22,30,12,20,否,4,0",
  "2028,22,10,12,10,yes,4,20"
].join("\n"), offshoreProject);
assert.equal(parsedEnv.ok, true);
assert.equal(parsedEnv.values[2026].greenCertRealizeRatio, 0.4);
assert.equal(Object.hasOwn(parsedEnv.values[2026], "carbonEnabled"), false);
const envOverAllocated = parseEnvManualValuesCsv([
  "year,green_cert_price_yuan_per_mwh,green_cert_realize_ratio_pct,green_premium_price_yuan_per_mwh,green_premium_realize_ratio_pct,carbon_enabled,carbon_price_yuan_per_mwh,carbon_realize_ratio_pct",
  "2026,22,50,12,60,是,4,30",
  "2027,22,30,12,20,否,4,0",
  "2028,22,10,12,10,yes,4,20"
].join("\n"), offshoreProject);
assert.equal(envOverAllocated.ok, false);
assert.match(envOverAllocated.message, /不能超过100.0%/);

assert.equal(buildFeeManualTemplateRows(offshoreProject).length, 4);
assert.equal(buildFeeManualTemplateRows(offshoreProject)[0].at(-1), "other_net_income_yuan_per_mwh");
const parsedFee = parseFeeManualValuesCsv([
  "year,market_op_fee_yuan_per_mwh,grid_assess_fee_yuan_per_mwh,ancillary_fee_yuan_per_mwh,other_fee_yuan_per_mwh,other_income_yuan_per_mwh",
  "2026,6,7,14,3,2",
  "2027,6,7,14,3,2",
  "2028,6,7,14,3,2"
].join("\n"), offshoreProject);
assert.equal(parsedFee.ok, true);
assert.equal(parsedFee.values[2026].gridAssessFee, 7);
assert.equal(parsedFee.values[2026].otherNetIncome, -1);
assert.equal(Object.hasOwn(parsedFee.values[2026], "otherFee"), false);
const currentFee = parseFeeManualValuesCsv([
  buildFeeManualTemplateRows(offshoreProject)[0].join(","),
  "2026,6,7,14,-3.25",
  "2027,6,7,14,0",
  "2028,6,7,14,2.5"
].join("\n"), offshoreProject);
assert.equal(currentFee.ok, true);
assert.deepEqual(Object.values(currentFee.values).map((row) => row.otherNetIncome), [-3.25, 0, 2.5]);
const invalidFee = parseFeeManualValuesCsv([
  "year,market_op_fee_yuan_per_mwh,grid_assess_fee_yuan_per_mwh,ancillary_fee_yuan_per_mwh,other_fee_yuan_per_mwh,other_income_yuan_per_mwh",
  "2026,-1,7,14,3,2",
  "2027,6,7,14,3,2",
  "2028,6,7,14,3,2"
].join("\n"), offshoreProject);
assert.equal(invalidFee.ok, false);
assert.match(invalidFee.message, /market_op_fee_yuan_per_mwh 无效/);

const singleYearProject = { ...offshoreProject, forecastYears: 1 };
for (const [build, parse] of [
  [buildLtManualTemplateRows, parseLtManualPricesCsv],
  [buildEnvManualTemplateRows, parseEnvManualValuesCsv],
  [buildFeeManualTemplateRows, parseFeeManualValuesCsv]
]) {
  const rows = build(singleYearProject);
  assert.equal(parse(rows.map((row) => row.join(",")).join("\n"), singleYearProject).ok, false,
    "an unfilled exported annual template must not import as confirmed zero values");
  rows[1] = rows[1].map((value, index) => index ? "0" : value);
  assert.equal(parse(rows.map((row) => row.join(",")).join("\n"), singleYearProject).ok, true,
    "explicit zero values remain valid");
  for (let column = 1; column < rows[1].length; column += 1) {
    for (const blank of ["", "   "]) {
      const incomplete = rows.map((row) => row.slice());
      incomplete[1][column] = blank;
      assert.equal(parse(incomplete.map((row) => row.join(",")).join("\n"), singleYearProject).ok, false,
        `missing column ${column} cannot silently become zero`);
    }
  }
}
const oneYearProject = { ...offshoreProject, forecastYears: 1 };
for (const [name, template, parse, first, repeated] of [
  ["strategy", buildLtManualTemplateRows, parseLtManualPricesCsv, "2026,8", "2026,50"],
  ["environment", buildEnvManualTemplateRows, parseEnvManualValuesCsv, "2026,20,100,0,0", "2026,99,100,0,0"],
  ["fee", buildFeeManualTemplateRows, parseFeeManualValuesCsv, "2026,7,8,18,-2.75", "2026,7,8,18,-12.75"]
]) {
  const header = template(oneYearProject)[0].join(",");
  for (const duplicate of [repeated, first]) {
    const result = parse([header, first, duplicate].join("\n"), oneYearProject);
    assert.equal(result.ok, false, `${name} must reject duplicate years, even if values match`);
    assert.match(result.message, /第 3 行 year 重复：2026.*第 2 行/);
  }
  assert.equal(parse([header, first].join("\n"), oneYearProject).ok, true);
}

console.log("scenario config tests passed");
