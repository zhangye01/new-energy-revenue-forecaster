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
    storagePowerMw: 2,
    storageDurationH: 2,
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
  approx(first.envRevenue, 150000, "首年环境价值收益只计绿证和绿电溢价");
  approx(first.storageSupplementRevenue, 0, "平价下配储现货增量为零，历史手工收益均不参与新结算");
  approx(first.storageDispatch.incrementalRevenue, 0, "平价下逐时套利为零");
  approx(first.comprehensiveFee, 600000, "首年综合费用");
  approx(first.otherIncome, 40000, "首年其他收入");
  approx(first.fullRevenue, 6086000, "首年全口径收入");
  approx(first.fullRevenuePrice, 304.3, "首年度电全口径收入");

  const second = result.annualRows[1];
  approx(second.mechanismRatio, 0, "机制结束后次年机制占比");
  approx(second.mechanismRevenue, 0, "机制结束后次年机制收入");
  approx(second.ltPnlPrice, 5, "次年交易策略固定步长收敛");
  approx(second.fullRevenue, 6289500, "次年全口径收入");
  approx(result.totalEnergy, 41000, "周期总上网电量");
  approx(result.totalFullRevenue, 12375500, "周期全口径总收入");
  approx(result.avgFullRevenuePrice, 301.8414634146341, "周期平均度电收入");
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
  approx(row.envRevenue, 96000, "手工逐年配置仅计绿证和绿电溢价");
  approx(row.comprehensiveFee, 200000, "手工逐年综合费用");
  approx(row.otherIncome, 100000, "手工逐年其他收入");
  approx(row.fullRevenue, 6516000, "手工逐年配置全口径收入");
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

const oneYear = { ...createGoldenProject(), forecastYears: 1, storagePowerMw: 1, storageDurationH: 1 };
oneYear.energyData.hourlyByYear[2026] = flatPrices(0);
oneYear.energyData.hourlyByYear[2026][0] = 0.1;
const priceSeries = flatPrices(100);
priceSeries[1] = 300;
const hourlyRun = { pricesByYear: { 2026: priceSeries } };
const scenario = createGoldenScenario();
Object.assign(scenario.config, { mechanismEnabled: false, storageArbitragePrice: 99, storageRoundTripEfficiency: 0.9 });
const withoutStorage = calculateScenarioResult({ ...oneYear, hasStorage: false }, scenario, hourlyRun);
const withStorage = calculateScenarioResult(oneYear, scenario, hourlyRun);
const storageYear = withStorage.annualRows[0];
approx(storageYear.storageDispatch.chargeOpportunityCost, 100, "充电放弃100元售电收入");
approx(storageYear.storageDispatch.dischargeRevenue, 270, "放电0.9MWh收入270元");
approx(storageYear.storageDispatch.incrementalRevenue, 170, "同一价格曲线的净套利差额");
approx(storageYear.fullRevenue - withoutStorage.annualRows[0].fullRevenue, 170, "全口径收入只加现货增量170元");
approx(withStorage.hourlyPreview.reduce((sum, hour) => sum + hour.fullRevenue, 0), storageYear.fullRevenue, "首年小时收入与年度结果对账");
const reducedEfficiency = calculateScenarioResult(oneYear, {
  ...scenario, config: { ...scenario.config, storageRoundTripEfficiency: 0.8 }
}, hourlyRun);
approx(reducedEfficiency.annualRows[0].storageDispatch.incrementalRevenue, 140, "效率改变实际套利收入");

console.log("scenario golden tests passed");
