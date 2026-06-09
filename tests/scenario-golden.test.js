"use strict";

const assert = require("node:assert/strict");
const { calculateScenarioResult } = require("../src/domain/revenue-calculator");

function flatHours(annualHours) {
  return Array.from({ length: 8760 }, () => annualHours / 8760);
}

function flatPrices(price) {
  return Array.from({ length: 8760 }, () => price);
}

function approx(actual, expected, message, tolerance = 1e-4) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createGoldenProject() {
  return {
    id: "golden-project",
    name: "黄金样例项目",
    province: "jiangsu",
    assetType: "wind",
    siteType: "offshore",
    hasStorage: true,
    capacityMw: 10,
    startYear: 2026,
    forecastYears: 2,
    energyMode: "hourly_8760",
    energyData: {
      mode: "hourly_8760",
      annualInputByYear: {
        2026: 2000,
        2027: 2100
      },
      typicalCurveSource: "",
      typicalCurveProfile: [],
      hourlyByYear: {
        2026: flatHours(2000),
        2027: flatHours(2100)
      },
      annualSummary: {}
    }
  };
}

function createGoldenScenario() {
  return {
    id: "baseline",
    name: "基准场景",
    config: {
      mechanismEnabled: true,
      mechanismRatio: 0.4,
      mechanismPrice: 350,
      mechanismStartYm: "2026-01",
      mechanismEndYm: "2026-12",
      ltPricingMode: "auto",
      ltManualPricesByYear: {},
      ltYear1Pnl: 8,
      ltTargetPnl: 2,
      ltConvergeSpeed: 3,
      envValueMode: "global",
      envManualValuesByYear: {},
      greenCertPrice: 20,
      greenCertRealizeRatio: 0.5,
      greenPremiumPrice: 10,
      greenPremiumRealizeRatio: 0.25,
      carbonEnabled: true,
      carbonPrice: 4,
      carbonRealizeRatio: 0.25,
      feeConfigMode: "global",
      feeManualValuesByYear: {},
      marketOpFee: 6,
      gridAssessFee: 7,
      ancillaryFee: 14,
      otherFee: 3,
      otherIncome: 2,
      storageArbitragePrice: 18,
      storageCapacityCompPrice: 7,
      storageAncillaryRevenuePrice: 10,
      storageOtherRevenuePrice: 3
    }
  };
}

function createGoldenRun() {
  return {
    id: "run-golden",
    pricesByYear: {
      2026: flatPrices(300),
      2027: flatPrices(310)
    }
  };
}

function testScenarioGoldenCalculation() {
  const result = calculateScenarioResult(
    createGoldenProject(),
    createGoldenScenario(),
    createGoldenRun()
  );

  assert.deepEqual(plain(result.missingYears), []);
  assert.equal(result.annualRows.length, 2);
  assert.equal(result.hourlyPreview.length, 8760);

  const first = result.annualRows[0];
  approx(first.energyMwh, 20000, "首年上网电量");
  approx(first.spotRevenue, 6000000, "首年现货收入");
  approx(first.mechanismRatio, 0.4, "首年机制占比");
  approx(first.mechanismRevenue, 400000, "首年机制收入");
  approx(first.nonMechanismEnergy, 12000, "首年市场化交易电量");
  approx(first.ltPnlPrice, 8, "首年交易策略损益度电值");
  approx(first.ltPnlRevenue, 96000, "首年交易策略损益");
  approx(first.envRevenue, 162000, "首年环境价值收益");
  approx(first.storageSupplementRevenue, 760000, "首年配储补充收益");
  approx(first.comprehensiveFee, 600000, "首年综合费用");
  approx(first.otherIncome, 40000, "首年其他收入");
  approx(first.fullRevenue, 6858000, "首年全口径收入");
  approx(first.fullRevenuePrice, 342.9, "首年度电全口径收入");

  const second = result.annualRows[1];
  approx(second.mechanismRatio, 0, "机制结束后次年机制占比");
  approx(second.mechanismRevenue, 0, "机制结束后次年机制收入");
  approx(second.ltPnlPrice, 5, "次年交易策略固定步长收敛");
  approx(second.fullRevenue, 7108500, "次年全口径收入");
  approx(result.totalEnergy, 41000, "周期总上网电量");
  approx(result.totalFullRevenue, 13966500, "周期全口径总收入");
  approx(result.avgFullRevenuePrice, 340.6463414634146, "周期平均度电收入");
}

function testManualYearOverrides() {
  const project = createGoldenProject();
  project.forecastYears = 1;
  delete project.energyData.hourlyByYear[2027];
  const scenario = createGoldenScenario();
  scenario.config.ltPricingMode = "manual";
  scenario.config.ltManualPricesByYear = { 2026: 10 };
  scenario.config.envValueMode = "manual";
  scenario.config.envManualValuesByYear = {
    2026: {
      greenCertPrice: 30,
      greenCertRealizeRatio: 0.2,
      greenPremiumPrice: 5,
      greenPremiumRealizeRatio: 0.4,
      carbonEnabled: true,
      carbonPrice: 6,
      carbonRealizeRatio: 0.1
    }
  };
  scenario.config.feeConfigMode = "manual";
  scenario.config.feeManualValuesByYear = {
    2026: {
      marketOpFee: 1,
      gridAssessFee: 2,
      ancillaryFee: 3,
      otherFee: 4,
      otherIncome: 5
    }
  };

  const result = calculateScenarioResult(project, scenario, createGoldenRun());
  const row = result.annualRows[0];
  approx(row.ltPnlPrice, 10, "手工逐年交易策略损益覆盖自动收敛");
  approx(row.ltPnlRevenue, 120000, "手工逐年交易策略损益收入");
  approx(row.envRevenue, 103200, "手工逐年环境价值收入");
  approx(row.comprehensiveFee, 200000, "手工逐年综合费用");
  approx(row.otherIncome, 100000, "手工逐年其他收入");
  approx(row.fullRevenue, 7283200, "手工逐年配置全口径收入");
}

function testMissingCurveReporting() {
  const result = calculateScenarioResult(
    createGoldenProject(),
    createGoldenScenario(),
    { id: "run-incomplete", pricesByYear: { 2026: flatPrices(300) } }
  );
  assert.deepEqual(plain(result.missingYears), [2027]);
  assert.deepEqual(plain(result.missingPriceYears), [2027]);
  assert.deepEqual(plain(result.missingEnergyYears), []);
  assert.equal(result.annualRows[1].note, "缺失曲线");
}

testScenarioGoldenCalculation();
testManualYearOverrides();
testMissingCurveReporting();

console.log("scenario golden tests passed");
