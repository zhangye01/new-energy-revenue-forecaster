"use strict";

const assert = require("node:assert/strict");
const {
  monthSerial,
  mechanismActiveMonthsForYear,
  ltPnlPriceForYear,
  tradeStrategyPnlPriceForYear,
  getEnvValueAllocation,
  getFeeConfigForYear
} = require("../src/domain/revenue-rules");

assert.equal(monthSerial("2026-01"), 2026 * 12);
assert.equal(monthSerial("bad"), null);

assert.equal(mechanismActiveMonthsForYear(2026, "2026-01", "2026-12"), 12);
assert.equal(mechanismActiveMonthsForYear(2026, "2026-07", "2027-06"), 6);
assert.equal(mechanismActiveMonthsForYear(2027, "2026-07", "2027-06"), 6);
assert.equal(mechanismActiveMonthsForYear(2025, "2026-07", "2027-06"), 0);
assert.equal(mechanismActiveMonthsForYear(2026, "2027-01", "2026-01"), 0);

assert.equal(ltPnlPriceForYear({ ltYear1Pnl: 8, ltTargetPnl: 2, ltConvergeSpeed: 3 }, 1), 8);
assert.equal(ltPnlPriceForYear({ ltYear1Pnl: 8, ltTargetPnl: 2, ltConvergeSpeed: 3 }, 2), 5);
assert.equal(ltPnlPriceForYear({ ltYear1Pnl: 8, ltTargetPnl: 2, ltConvergeSpeed: 3 }, 3), 2);
assert.equal(ltPnlPriceForYear({ ltYear1Pnl: -6, ltTargetPnl: 3, ltConvergeSpeed: 4 }, 3), 2);
assert.equal(tradeStrategyPnlPriceForYear({
  ltPricingMode: "manual",
  ltManualPricesByYear: { 2028: 9 },
  ltYear1Pnl: 8,
  ltTargetPnl: 2,
  ltConvergeSpeed: 3
}, 3, 2028), 9);

const offshoreEnv = getEnvValueAllocation({ siteType: "offshore" }, {
  greenCertRealizeRatio: 1.2,
  greenCertPrice: 10,
  greenPremiumRealizeRatio: 0.2,
  greenPremiumPrice: 5,
  carbonEnabled: true,
  carbonRealizeRatio: 0.3,
  carbonPrice: 4
});
assert.equal(offshoreEnv.greenCertRatio, 1);
assert.equal(offshoreEnv.carbonRatio, 0.3);
assert.equal(offshoreEnv.unitValuePerMarketMwh, 12.2);

const onshoreEnv = getEnvValueAllocation({ siteType: "onshore" }, {
  carbonEnabled: true,
  carbonRealizeRatio: 1,
  carbonPrice: 99
});
assert.equal(onshoreEnv.carbonRatio, 0);
assert.equal(onshoreEnv.carbonPrice, 0);

const manualEnv = getEnvValueAllocation({ siteType: "offshore" }, {
  envValueMode: "manual",
  greenCertPrice: 1,
  greenCertRealizeRatio: 1,
  envManualValuesByYear: {
    2026: {
      greenCertPrice: 20,
      greenCertRealizeRatio: 0.5
    }
  }
}, 2026);
assert.equal(manualEnv.unitValuePerMarketMwh, 10);

const fee = getFeeConfigForYear({}, {
  feeConfigMode: "manual",
  marketOpFee: 99,
  feeManualValuesByYear: {
    2026: {
      marketOpFee: 1,
      gridAssessFee: 2,
      ancillaryFee: 3,
      otherFee: 4,
      otherIncome: 5
    }
  }
}, 2026);
assert.deepEqual(fee, {
  marketOpFee: 1,
  gridAssessFee: 2,
  ancillaryFee: 3,
  otherFee: 4,
  otherIncome: 5
});

console.log("revenue rules tests passed");
