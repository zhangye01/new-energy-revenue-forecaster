"use strict";
const assert = require("node:assert/strict");
const sensitivity = require("../src/domain/compare-sensitivity");
const calculator = require("../src/domain/revenue-calculator");
const model = require("../src/domain/scenario-model");
const analysis = require("../src/domain/compare-analysis");

function fixture(manual, offshore, negative) {
  const project = { id: "sensitivity-audit", province: "shandong", assetType: "wind", siteType: offshore ? "offshore" : "onshore",
    capacityMw: 100, hasStorage: offshore, storagePowerMw: 20, storageDurationH: 2, startYear: 2026, forecastYears: 1,
    energyData: { hourlyByYear: { 2026: Array.from({ length: 8760 }, (_, index) => 0.1 + (index % 24) / 40) } } };
  const scenario = model.createBaselineScenario(project);
  Object.assign(scenario.config, { mechanismEnabled: true, mechanismRatio: 0.8, mechanismPrice: 365,
    mechanismStartYm: "2026-04", mechanismEndYm: "2026-10", mechanismReferenceMode: "same_type", sameTypeSpread: 16.25,
    ltYear1Pnl: -8.125, greenCertRealizeRatio: 0.55, greenPremiumRealizeRatio: 0.35,
    carbonEnabled: offshore, carbonRealizeRatio: offshore ? 0.1 : 0, carbonPrice: 11.25, otherIncome: -3.125 });
  if (manual) Object.assign(scenario.config, { ltPricingMode: "manual", ltManualPricesByYear: { 2026: -7.75 },
    envValueMode: "manual", envManualValuesByYear: { 2026: { greenCertPrice: 25.125, greenPremiumPrice: 13,
      greenCertRealizeRatio: 0.55, greenPremiumRealizeRatio: 0.35, carbonEnabled: offshore,
      carbonRealizeRatio: offshore ? 0.1 : 0, carbonPrice: 9.75 } }, feeConfigMode: "manual",
    feeManualValuesByYear: { 2026: { marketOpFee: 7, gridAssessFee: 8, ancillaryFee: 18, otherFee: 4.75, otherIncome: -2.25 } } });
  const run = { id: "sensitivity-run", pricesByYear: { 2026: Array.from({ length: 8760 }, (_, index) => (negative ? -500 : 150) + index % 24 * 8) } };
  const result = calculator.calculateScenarioResult(project, scenario, run);
  return { project, scenario, run, result };
}

const ratios = [-0.6, -0.2, 0, 0.2, 0.6];
for (const manual of [false, true]) for (const offshore of [false, true]) for (const negative of [false, true]) {
  const { project, scenario, run, result } = fixture(manual, offshore, negative);
  const original = JSON.stringify({ project, scenario, run, result });
  const first = result.annualRows[0];
  const factors = sensitivity.buildFactors(project, { scenario, result }, ratios);
  assert.ok(factors.length >= 8);
  assert.equal(factors.some((factor) => factor.key === "storage"), offshore, "非配储项目不生成配储响应");
  for (const factor of factors) for (let index = 0; index < ratios.length; index += 1) {
    const ratio = ratios[index];
    const changed = sensitivity.createPerturbation(project, scenario, first, factor.key, ratio);
    const alteredProject = { ...project, energyData: { hourlyByYear: { 2026: project.energyData.hourlyByYear[2026].map((value) => factor.key === "hours" ? value * (1 + ratio) : value) } } };
    const alteredRun = { ...run, pricesByYear: { 2026: run.pricesByYear[2026].map((price) => factor.key === "spot" ? price * (1 + ratio)
      : factor.key === "capture_spread" ? first.spotAvgPrice + (price - first.spotAvgPrice) * (1 + ratio) : price) } };
    const expected = calculator.calculateScenarioResult(alteredProject, { ...scenario, config: changed.config }, alteredRun).annualRows[0].fullRevenue / 10000;
    assert.ok(Math.abs(factor.series[index] - expected) < 0.000001,
      `${manual}/${offshore}/${negative} ${factor.key} ${ratio}: ${factor.series[index]} != ${expected}`);
    if (ratio === 0) assert.equal(factor.series[index], first.fullRevenue / 10000, "零点严格等于原基准，不能重舍入或截零");
  }
  assert.equal(JSON.stringify({ project, scenario, run, result }), original, "敏感性不能修改原输入或保存结果");
  assert.equal(sensitivity.buildFactors(project, { scenario, result }, ratios), factors, "相同输入复用有界缓存");
  assert.ok(Object.isFrozen(factors) && Object.isFrozen(factors[0].series), "缓存结果不允许被界面修改");
  const lowScale = analysis.buildCompareSensitivityFactors(project, { scenario, result }, { rangePercent: 20, stepPercent: 10, responseScalePercent: 25 });
  const highScale = analysis.buildCompareSensitivityFactors(project, { scenario, result }, { rangePercent: 20, stepPercent: 10, responseScalePercent: 200 });
  assert.equal(lowScale, highScale, "历史响应强度不得改变计算结果");
  if (negative) assert.ok(factors.every((factor) => factor.series[2] < 0), "保留负收益零点");
  const badResult = { ...result, annualRows: [{ ...first, fullRevenue: first.fullRevenue + 100 }] };
  assert.deepEqual(sensitivity.buildFactors(project, { scenario, result: badResult }, ratios), [], "无法与保存基准对账时不展示敏感性");
}

const full = fixture(true, true, false);
const env = sensitivity.buildFactors(full.project, full, [-0.2, 0, 0.2]).find((factor) => factor.key === "env_ratio");
assert.ok(env.highDelta > 0, "历史碳比例不占用绿证和绿电兑现空间");
full.scenario.config.envManualValuesByYear[2026].greenCertRealizeRatio = 0.65;
full.result = calculator.calculateScenarioResult(full.project, full.scenario, full.run);
const cappedEnv = sensitivity.buildFactors(full.project, full, [-0.2, 0, 0.2]).find((factor) => factor.key === "env_ratio");
assert.ok(Math.abs(cappedEnv.highDelta) < 1e-8, "两类绿色价值兑现比例合计达到100%时不再增加");
const { environmentValueVersion, ...legacyInputs } = full.result;
const [storedYear] = legacyInputs.annualRows;
const removedRevenue = storedYear.nonMechanismEnergy * 0.1 * 9.75;
const fullRevenue = storedYear.fullRevenue + removedRevenue;
const fullRevenuePrice = fullRevenue / storedYear.energyMwh;
const historicalWithCarbon = { ...legacyInputs, totalFullRevenue: fullRevenue, avgFullRevenuePrice: fullRevenuePrice,
  annualRows: [{ ...storedYear, envRevenue: storedYear.envRevenue + removedRevenue, fullRevenue, fullRevenuePrice,
    storageDispatch: { ...storedYear.storageDispatch, withStorageFullRevenue: fullRevenue,
      withoutStorageFullRevenue: storedYear.storageDispatch.withoutStorageFullRevenue + removedRevenue } }],
  hourlyPreview: legacyInputs.hourlyPreview.map((hour) => ({ ...hour,
    fullRevenue: hour.fullRevenue + (removedRevenue / storedYear.energyMwh) * hour.energyMwh })) };
const legacyBefore = JSON.stringify(historicalWithCarbon);
assert.equal(analysis.isResultComplete(full.project, full.scenario, historicalWithCarbon, { includeHourly: true }), true,
  "保存的旧算式仍允许按原参数核验年表与时序结果");
assert.equal(analysis.isResultComplete(full.project, full.scenario, { ...historicalWithCarbon, environmentValueVersion }), false,
  "新版保存的结果只接受新版结算算式");
assert.deepEqual(sensitivity.buildFactors(full.project, { scenario: full.scenario, result: historicalWithCarbon }, ratios), []);
assert.match(sensitivity.availability(full.project, { scenario: full.scenario, result: historicalWithCarbon }).message, /重新测算/);
assert.equal(JSON.stringify(historicalWithCarbon), legacyBefore, "旧结果无需被修改或静默按新口径重算");
const current = sensitivity.buildFactors(full.project, full, [-0.2, 0, 0.2]);
full.scenario.config.feeManualValuesByYear[2026].otherFee += 1;
const result = calculator.calculateScenarioResult(full.project, full.scenario, full.run);
assert.notEqual(sensitivity.buildFactors(full.project, { scenario: full.scenario, result }, [-0.2, 0, 0.2]), current, "参数变更重新计算，不复用旧缓存");

for (const [net, expenses] of [[-5, 15], [0, 10], [5, 10]]) {
  const { project, scenario, run } = fixture(false, false, false);
  Object.assign(scenario.config, { marketOpFee: 2, gridAssessFee: 3, ancillaryFee: 5, otherNetIncome: net,
    otherFee: 100, otherIncome: 200 });
  const settled = calculator.calculateScenarioResult(project, scenario, run);
  const fee = sensitivity.buildFactors(project, { scenario, result: settled }, [-0.2, 0, 0.2]).find((factor) => factor.key === "fee");
  const expected = 0.2 * expenses * settled.totalEnergy / 10000;
  assert.ok(Math.abs(fee.highDelta + expected) < 1e-7, "费用变动只影响三个扣费科目及负净额");
}

const { project: storageProject, scenario: storageScenario, run: storageRun } = fixture(true, true, false);
storageScenario.config.storageRoundTripEfficiency = 1;
storageProject.energyData.hourlyByYear[2026].fill(0.25);
const prices = storageRun.pricesByYear[2026];
prices.fill(150, 0, 24);
const originalResult = calculator.calculateScenarioResult(storageProject, storageScenario, storageRun);
const originalBaseline = { scenario: storageScenario, result: originalResult };
const originalFactors = sensitivity.buildFactors(storageProject, originalBaseline, ratios);
assert.ok(originalFactors.length);
const originalHour = originalResult.hourlyPreview[0];
const damagedBaseline = { scenario: storageScenario, result: {
  ...originalResult,
  hourlyPreview: [{ ...originalHour, spotPrice: -100000 }, ...originalResult.hourlyPreview.slice(1)]
} };
assert.equal(analysis.isResultComplete(storageProject, storageScenario, damagedBaseline.result), true, "有限价格损坏只影响小时明细");
assert.equal(analysis.isResultComplete(storageProject, storageScenario, damagedBaseline.result, { includeHourly: true }), false);
assert.deepEqual(sensitivity.buildFactors(storageProject, damagedBaseline, ratios), [], "检测到损坏须清除结果，即使同基准已有缓存");
assert.match(sensitivity.availability(storageProject, damagedBaseline).message, /小时明细.*对账未通过/);
const damagedView = analysis.buildCompareRenderState({ project: storageProject, available: [damagedBaseline] });
assert.match(damagedView.sensitivityNotice, /小时明细.*对账未通过/);
assert.deepEqual(damagedView.sensitivityFactors, []);
assert.equal(damagedView.baseline, damagedBaseline, "小时明细问题只阻止敏感性结果，年度对标仍可查看");
assert.strictEqual(sensitivity.buildFactors(storageProject, originalBaseline, ratios), originalFactors);

const swappedRun = { ...storageRun, pricesByYear: { 2026: [...prices.slice(24, 48), ...prices.slice(0, 24), ...prices.slice(48)] } };
const swappedResult = calculator.calculateScenarioResult(storageProject, storageScenario, swappedRun);
assert.deepEqual(swappedResult.annualRows, originalResult.annualRows, "交换两个完整日仅改变小时顺序，不改变年度恒等式");
assert.equal(analysis.isResultComplete(storageProject, storageScenario, swappedResult, { includeHourly: true }), true);
const swappedFactors = sensitivity.buildFactors(storageProject, { scenario: storageScenario, result: swappedResult }, ratios);
assert.ok(swappedFactors.length);
assert.notStrictEqual(swappedFactors, originalFactors, "即使版本号与全年结果相同，小时序列变化也须重算");
console.log("compare sensitivity tests passed");
