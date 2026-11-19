"use strict";
const assert = require("node:assert/strict");
const sensitivity = require("../src/domain/compare-sensitivity");
const calculator = require("../src/domain/revenue-calculator");
const model = require("../src/domain/scenario-model");
const analysis = require("../src/domain/compare-analysis");
const versions = require("../src/domain/result-versions");

const ratios = [-0.6, -0.2, 0, 0.2, 0.6];
const keys = ["capture_spread", "mechanism_price", "mechanism_ratio", "spot"];
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);

function fixture(hasStorage, negative = false, repeated = false) {
  const project = { id: "sensitivity-audit", province: "shandong", assetType: "wind", siteType: "onshore",
    capacityMw: 100, hasStorage, storagePowerMw: 20, storageDurationH: 2, startYear: 2026, forecastYears: 3,
    energyData: { hourlyByYear: {} } };
  const scenario = model.createBaselineScenario(project);
  Object.assign(scenario.config, { mechanismEnabled: true, mechanismRatio: 0.8, mechanismPrice: 365,
    mechanismStartYm: "2027-04", mechanismEndYm: "2028-10", mechanismReferenceMode: "same_type", sameTypeSpread: 16.25,
    ltPricingMode: "manual", ltManualPricesByYear: { 2026: -7.75, 2027: -10, 2028: 4 },
    envValueMode: "manual", envManualValuesByYear: { 2026: { greenCertPrice: 25, greenPremiumPrice: 13,
      greenCertRealizeRatio: 0.55, greenPremiumRealizeRatio: 0.35 }, 2027: { greenCertPrice: 60, greenCertRealizeRatio: 0.75 } },
    feeConfigMode: "manual", feeManualValuesByYear: { 2026: { marketOpFee: 7, gridAssessFee: 8, ancillaryFee: 18, otherNetIncome: -2.25 } } });
  const run = { id: "sensitivity-run", pricesByYear: {} };
  for (let offset = 0; offset < project.forecastYears; offset++) {
    const profile = repeated && offset === 2 ? 1 : offset;
    project.energyData.hourlyByYear[2026 + offset] = Array.from({ length: 8760 }, (_, index) => (0.04 + (index % 24) / 40) * (profile + 1));
    run.pricesByYear[2026 + offset] = Array.from({ length: 8760 }, (_, index) =>
      (negative ? -500 : 150) + index % 24 * 8 * (profile + 1) + profile * 201);
  }
  project.activeRunId = run.id;
  project.priceRuns = [run];
  return { project, scenario, run, result: calculator.calculateScenarioResult(project, scenario, run) };
}

function oracle({ project, scenario, run }, key, ratio) {
  const scale = 1 + ratio;
  const config = { ...scenario.config };
  if (key === "mechanism_price") config.mechanismPrice *= scale;
  if (key === "mechanism_ratio") config.mechanismRatio = Math.min(1, Math.max(0, config.mechanismRatio * scale));
  const pricesByYear = Object.fromEntries(Object.entries(run.pricesByYear).map(([year, prices]) => {
    const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    return [year, prices.map((price) => key === "spot" ? price * scale : key === "capture_spread" ? mean + (price - mean) * scale : price)];
  }));
  return calculator.calculateScenarioResult(project, { ...scenario, config }, { ...run, pricesByYear }).avgFullRevenuePrice;
}

for (const input of [fixture(false), fixture(true, false, true), fixture(true, true)]) {
  const { project, scenario, result } = input;
  const before = JSON.stringify(input);
  assert.equal(result.annualRows[0].mechanismRatio, 0, "首年尚未执行机制");
  assert.ok(result.annualRows[2].mechanismRatio > 0, "后续年度执行机制");
  const factors = sensitivity.buildFactors(project, input, ratios);
  assert.deepEqual(factors.map(({ key }) => key).sort(), keys);
  assert.equal(sensitivity.baselineValue(input), result.avgFullRevenuePrice);
  assert.notEqual(result.avgFullRevenuePrice, result.annualRows[0].fullRevenuePrice);
  const simpleYearMean = result.annualRows.reduce((total, row) => total + row.fullRevenuePrice, 0) / result.annualRows.length;
  assert.ok(Math.abs(result.avgFullRevenuePrice - simpleYearMean) > 1, "以实际各年电量加权");
  for (const factor of factors) {
    for (const [index, ratio] of ratios.entries()) near(factor.series[index], oracle(input, factor.key, ratio), `${factor.key} at ${ratio}`);
    assert.equal(factor.series[2], result.avgFullRevenuePrice, "0% 使用保存的全周期基准");
  }
  assert.ok(factors.find(({ key }) => key === "mechanism_price").sensitivity > 0, "后续年度机制进入扰动");
  assert.strictEqual(sensitivity.buildFactors(project, input, ratios), factors);
  assert.ok(Object.isFrozen(factors) && Object.isFrozen(factors[0].series), "缓存曲线只读");
  assert.notStrictEqual(sensitivity.buildFactors(project, input, [-0.2, 0, 0.2]), factors, "范围变化返回相应扰动点");
  const badYear = { ...result.annualRows[2], fullRevenue: result.annualRows[2].fullRevenue + 100 };
  const bad = { scenario, result: { ...result, annualRows: [...result.annualRows.slice(0, 2), badYear] } };
  assert.match(sensitivity.availability(project, bad).message, /全周期.*对账未通过/);
  assert.deepEqual(sensitivity.buildFactors(project, bad, ratios), []);
  assert.equal(JSON.stringify(input), before, "敏感性不修改原输入或结果");
}

{
  const input = fixture(true);
  const annualInputByYear = Object.fromEntries(input.result.annualRows.map(({ year, annualHours }) => [year, annualHours]));
  const profile = input.project.energyData.hourlyByYear[2026].map((hours) => hours / annualInputByYear[2026]);
  const energyData = Object.freeze({ mode: "typical_curve_8760", typicalCurveSource: "typical_curve_8760",
    hourlyByYear: Object.freeze({}), annualInputByYear: Object.freeze(annualInputByYear), typicalCurveProfile: Object.freeze(profile) });
  const restoredProject = Object.freeze({ ...input.project, energyData });
  const rebuilt = sensitivity.buildFactors(restoredProject, input, ratios);
  assert.equal(rebuilt.length, 4, "可在独立项目外壳中还原备份的逐时电量");
  for (const factor of rebuilt) near(factor.series.at(-1), oracle(input, factor.key, 0.6), factor.key);
  assert.deepEqual(energyData.hourlyByYear, {}, "原备份的逐时缓存不回填");
}

{
  const input = fixture(false);
  input.scenario.config.mechanismEnabled = false;
  input.result = calculator.calculateScenarioResult(input.project, input.scenario, input.run);
  const factors = sensitivity.buildFactors(input.project, input, ratios);
  assert.equal(factors.length, 4);
  for (const factor of factors.filter(({ key }) => key.startsWith("mechanism_"))) {
    assert.equal(factor.applicable, false);
    assert.ok(factor.series.every((value) => value === input.result.avgFullRevenuePrice));
    assert.equal(factor.sensitivity, 0);
  }
  const withoutEnergy = { scenario: input.scenario, result: { ...input.result, totalEnergy: 0 } };
  assert.equal(sensitivity.baselineValue(withoutEnergy), null);
  assert.match(sensitivity.availability(input.project, withoutEnergy).message, /有效结算电量/);
}

{
  const fixtureData = fixture(true);
  const { project, scenario, result, run } = fixtureData;
  const stored = versions.stampComputedResult(project, scenario, run, {
    ...result, sourceContext: { version: 2, projectId: project.id, scenarioId: scenario.id, runId: run.id }
  });
  const storedBaseline = { scenario, result: stored };
  assert.ok(sensitivity.availability(project, storedBaseline).ok);
  const saved = sensitivity.buildFactors(project, storedBaseline, ratios);
  const missingRun = { ...project, priceRuns: [] };
  assert.match(sensitivity.availability(missingRun, storedBaseline).message, /全周期逐时电量或电价缺失/);
  assert.deepEqual(sensitivity.buildFactors(missingRun, storedBaseline, ratios), []);
  assert.deepEqual(sensitivity.buildFactors({ ...project, activeRunId: "another-run" }, storedBaseline, ratios), []);
  const changedRun = { ...run, pricesByYear: { ...run.pricesByYear, 2028: [...run.pricesByYear[2028]] } };
  changedRun.pricesByYear[2028][0] += 1;
  assert.deepEqual(sensitivity.buildFactors({ ...project, priceRuns: [changedRun] }, storedBaseline, ratios), [],
    "后续年份的原始电价变更不可复用");
  const changedEnergy = { ...project, energyData: { ...project.energyData, hourlyByYear: {
    ...project.energyData.hourlyByYear, 2028: project.energyData.hourlyByYear[2028].slice(0, 8759)
  } } };
  assert.deepEqual(sensitivity.buildFactors(changedEnergy, storedBaseline, ratios), []);
  const first = result.hourlyPreview[0];
  const corruptPreview = { scenario, result: { ...stored, hourlyPreview: [{ ...first, spotPrice: -100000 }, ...result.hourlyPreview.slice(1)] } };
  assert.equal(analysis.isResultComplete(project, scenario, corruptPreview.result), true, "仅损坏逐时不影响年度对标");
  assert.deepEqual(sensitivity.buildFactors(project, corruptPreview, ratios), []);
  assert.match(sensitivity.availability(project, corruptPreview).message, /小时明细.*对账未通过/);
  assert.strictEqual(sensitivity.buildFactors(project, storedBaseline, ratios), saved);
}

console.log("compare sensitivity tests passed");
