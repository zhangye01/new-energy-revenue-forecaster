"use strict";
const assert = require("node:assert/strict");
const sensitivity = require("../src/domain/compare-sensitivity");
const calculator = require("../src/domain/revenue-calculator");
const model = require("../src/domain/scenario-model");
const analysis = require("../src/domain/compare-analysis");

function fixture(manual, offshore, negative) {
  const project = { id: "sensitivity-audit", province: "shandong", assetType: "wind", siteType: offshore ? "offshore" : "onshore",
    capacityMw: 100, hasStorage: offshore, startYear: 2026, forecastYears: 1,
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
assert.ok(Math.abs(env.highDelta) < 1e-8, "兑现比例合计已经100%时不能继续增加");
const current = sensitivity.buildFactors(full.project, full, [-0.2, 0, 0.2]);
full.scenario.config.feeManualValuesByYear[2026].otherFee += 1;
const result = calculator.calculateScenarioResult(full.project, full.scenario, full.run);
assert.notEqual(sensitivity.buildFactors(full.project, { scenario: full.scenario, result }, [-0.2, 0, 0.2]), current, "参数变更重新计算，不复用旧缓存");
console.log("compare sensitivity tests passed");
