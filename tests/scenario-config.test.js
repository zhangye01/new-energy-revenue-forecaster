"use strict";

const assert = require("node:assert/strict");
const {
  parseBooleanLike,
  getLtPricingMode,
  getEnvValueMode,
  getFeeConfigMode,
  sanitizeLtManualPricesByYear,
  sanitizeEnvManualValuesByYear,
  sanitizeFeeManualValuesByYear,
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
assert.deepEqual(Object.keys(envValues), ["2026"]);
assert.equal(envValues[2026].carbonEnabled, true);
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
assert.equal(onshoreEnv[2026].carbonEnabled, false);
assert.equal(onshoreEnv[2026].carbonPrice, 0);
assert.equal(onshoreEnv[2026].carbonRealizeRatio, 0);

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
assert.deepEqual(Object.keys(feeValues), ["2026", "2028"]);
assert.equal(feeValues[2026].ancillaryFee, 14);
assert.equal(getFeeManualEntryForYear(offshoreProject, { feeConfigMode: "global", feeManualValuesByYear: feeValues }, 2026), null);
assert.equal(getFeeManualEntryForYear(offshoreProject, { feeConfigMode: "manual", feeManualValuesByYear: feeValues }, 2026).otherIncome, 2);
const feeCompleteness = getFeeManualCompleteness(offshoreProject, { feeManualValuesByYear: feeValues });
assert.equal(feeCompleteness.complete, 2);
assert.deepEqual(feeCompleteness.missingYears, [2027]);

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
const parsedEnv = parseEnvManualValuesCsv([
  "year,green_cert_price_yuan_per_mwh,green_cert_realize_ratio_pct,green_premium_price_yuan_per_mwh,green_premium_realize_ratio_pct,carbon_enabled,carbon_price_yuan_per_mwh,carbon_realize_ratio_pct",
  "2026,22,40,12,20,是,4,40",
  "2027,22,30,12,20,否,4,0",
  "2028,22,10,12,10,yes,4,20"
].join("\n"), offshoreProject);
assert.equal(parsedEnv.ok, true);
assert.equal(parsedEnv.values[2026].greenCertRealizeRatio, 0.4);
assert.equal(parsedEnv.values[2026].carbonEnabled, true);
const envOverAllocated = parseEnvManualValuesCsv([
  "year,green_cert_price_yuan_per_mwh,green_cert_realize_ratio_pct,green_premium_price_yuan_per_mwh,green_premium_realize_ratio_pct,carbon_enabled,carbon_price_yuan_per_mwh,carbon_realize_ratio_pct",
  "2026,22,50,12,30,是,4,30",
  "2027,22,30,12,20,否,4,0",
  "2028,22,10,12,10,yes,4,20"
].join("\n"), offshoreProject);
assert.equal(envOverAllocated.ok, false);
assert.match(envOverAllocated.message, /不能超过100.0%/);

assert.equal(buildFeeManualTemplateRows(offshoreProject).length, 4);
const parsedFee = parseFeeManualValuesCsv([
  "year,market_op_fee_yuan_per_mwh,grid_assess_fee_yuan_per_mwh,ancillary_fee_yuan_per_mwh,other_fee_yuan_per_mwh,other_income_yuan_per_mwh",
  "2026,6,7,14,3,2",
  "2027,6,7,14,3,2",
  "2028,6,7,14,3,2"
].join("\n"), offshoreProject);
assert.equal(parsedFee.ok, true);
assert.equal(parsedFee.values[2026].gridAssessFee, 7);
const invalidFee = parseFeeManualValuesCsv([
  "year,market_op_fee_yuan_per_mwh,grid_assess_fee_yuan_per_mwh,ancillary_fee_yuan_per_mwh,other_fee_yuan_per_mwh,other_income_yuan_per_mwh",
  "2026,-1,7,14,3,2",
  "2027,6,7,14,3,2",
  "2028,6,7,14,3,2"
].join("\n"), offshoreProject);
assert.equal(invalidFee.ok, false);
assert.match(invalidFee.message, /market_op_fee_yuan_per_mwh 无效/);

console.log("scenario config tests passed");
