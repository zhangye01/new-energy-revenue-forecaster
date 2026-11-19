"use strict";
const assert = require("node:assert/strict");
const sensitivity = require("../src/domain/compare-sensitivity");
const calculator = require("../src/domain/revenue-calculator");
const model = require("../src/domain/scenario-model");
const analysis = require("../src/domain/compare-analysis");
const versions = require("../src/domain/result-versions");

const keys = ["capture_spread", "mechanism_price", "mechanism_ratio", "spot"];
const mechanismRatios = Array.from({ length: 21 }, (_, index) => index * 5);
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

function cycleSpread(result) {
  return result.annualRows.reduce((sum, row) => sum + row.spotRevenue - row.spotAvgPrice * row.energyMwh, 0) / result.totalEnergy;
}

function capturePrices(project, run, result, target) {
  const centeredByYear = {};
  let sumSquares = 0;
  for (const { year } of result.annualRows) {
    const hours = project.energyData.hourlyByYear[year];
    const hourMean = hours.reduce((sum, value) => sum + value, 0) / hours.length;
    const centered = [];
    for (const hour of hours) {
      const delta = (hour - hourMean) * project.capacityMw;
      centered.push(delta);
      sumSquares += delta ** 2;
    }
    centeredByYear[year] = centered;
  }
  const increment = target - cycleSpread(result);
  const perturbed = {};
  for (const [year, prices] of Object.entries(run.pricesByYear)) {
    const changed = new Array(prices.length);
    for (let index = 0; index < prices.length; index += 1) {
      changed[index] = prices[index] + increment * centeredByYear[year][index] / (sumSquares / result.totalEnergy);
    }
    perturbed[year] = changed;
  }
  return perturbed;
}

function oracle({ project, scenario, run, result }, key, offset) {
  const config = { ...scenario.config };
  if (key === "mechanism_price") config.mechanismPrice = Math.max(0, config.mechanismPrice + offset);
  if (key === "mechanism_ratio") config.mechanismRatio = offset / 100;
  let pricesByYear = run.pricesByYear;
  if (key === "spot") pricesByYear = Object.fromEntries(Object.entries(pricesByYear).map(([year, prices]) =>
    [year, prices.map((value) => value + offset)]));
  if (key === "capture_spread") pricesByYear = capturePrices(project, run, result, offset);
  const recalculated = calculator.calculateScenarioResult(project, { ...scenario, config }, { ...run, pricesByYear });
  if (key === "capture_spread") {
    near(cycleSpread(recalculated), offset, "达到全周期捕获价差取点值");
    for (const [index, row] of recalculated.annualRows.entries()) {
      near(row.spotAvgPrice, result.annualRows[index].spotAvgPrice, "保持各年现货时均价");
    }
  }
  return recalculated.avgFullRevenuePrice;
}

for (const input of [fixture(false), fixture(true, false, true), fixture(true, true)]) {
  const { project, scenario, result } = input;
  const before = JSON.stringify(input);
  assert.equal(result.annualRows[0].mechanismRatio, 0, "首年尚未执行机制");
  assert.ok(result.annualRows[2].mechanismRatio > 0, "后续年度执行机制");
  const factors = sensitivity.buildFactors(project, input);
  assert.deepEqual(factors.map(({ key }) => key).sort(), keys);
  assert.equal(sensitivity.baselineValue(input), result.avgFullRevenuePrice);
  assert.notEqual(result.avgFullRevenuePrice, result.annualRows[0].fullRevenuePrice);
  const simpleYearMean = result.annualRows.reduce((total, row) => total + row.fullRevenuePrice, 0) / result.annualRows.length;
  assert.ok(Math.abs(result.avgFullRevenuePrice - simpleYearMean) > 1, "以实际各年电量加权");
  assert.deepEqual(factors.find(({ key }) => key === "spot").axisValues, [-100, -75, -50, -25, 0, 25, 50, 75, 100]);
  const ratio = factors.find(({ key }) => key === "mechanism_ratio");
  assert.deepEqual(ratio.axisValues, mechanismRatios);
  assert.equal(ratio.lowInput, "0%");
  assert.equal(ratio.highInput, "100%");
  assert.equal(ratio.baselineInput, 80);
  const capture = factors.find(({ key }) => key === "capture_spread");
  assert.deepEqual(capture.axisValues, [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50]);
  near(capture.baselineInput, cycleSpread(result), "独立标记基准捕获价差");
  assert.equal(capture.axisUnit, "元/MWh");
  assert.notEqual(capture.series[capture.axisValues.indexOf(0)], result.avgFullRevenuePrice, "捕获价差取零仍需重算");
  for (const factor of factors) {
    for (const [index, offset] of factor.axisValues.entries()) near(factor.series[index], oracle(input, factor.key, offset), `${factor.key} at ${offset}`);
    const baseIndex = factor.axisValues.indexOf(factor.baselineInput ?? 0);
    if (baseIndex >= 0) assert.equal(factor.series[baseIndex], result.avgFullRevenuePrice, "基准值取点使用保存的全周期基准");
    assert.equal(factor.sensitivity, Math.max(Math.abs(factor.lowDelta), Math.abs(factor.highDelta)), "排序按两端最大绝对影响");
    assert.equal(factor.lowInput, factor.axisLabels[0]);
    assert.equal(factor.highInput, factor.axisLabels.at(-1));
  }
  assert.deepEqual(factors.map(({ sensitivity }) => sensitivity), factors.map(({ sensitivity }) => sensitivity).sort((a, b) => b - a));
  assert.ok(factors.find(({ key }) => key === "mechanism_price").sensitivity > 0, "后续年度机制进入扰动");
  assert.strictEqual(sensitivity.buildFactors(project, input), factors);
  assert.ok(Object.isFrozen(factors) && Object.isFrozen(factors[0].series), "缓存曲线只读");
  assert.ok(Object.isFrozen(factors[0].axisValues) && Object.isFrozen(factors[0].axisLabels), "预设点与标签只读");
  const badYear = { ...result.annualRows[2], fullRevenue: result.annualRows[2].fullRevenue + 100 };
  const bad = { scenario, result: { ...result, annualRows: [...result.annualRows.slice(0, 2), badYear] } };
  assert.match(sensitivity.availability(project, bad).message, /全周期.*对账未通过/);
  assert.deepEqual(sensitivity.buildFactors(project, bad), []);
  assert.equal(JSON.stringify(input), before, "敏感性不修改原输入或结果");
}

{
  const input = fixture(true);
  const annualInputByYear = Object.fromEntries(input.result.annualRows.map(({ year, annualHours }) => [year, annualHours]));
  const profile = input.project.energyData.hourlyByYear[2026].map((hours) => hours / annualInputByYear[2026]);
  const energyData = Object.freeze({ mode: "typical_curve_8760", typicalCurveSource: "typical_curve_8760",
    hourlyByYear: Object.freeze({}), annualInputByYear: Object.freeze(annualInputByYear), typicalCurveProfile: Object.freeze(profile) });
  const restoredProject = Object.freeze({ ...input.project, energyData });
  const rebuilt = sensitivity.buildFactors(restoredProject, input);
  assert.equal(rebuilt.length, 4, "可在独立项目外壳中还原备份的逐时电量");
  for (const factor of rebuilt) near(factor.series.at(-1), oracle(input, factor.key, factor.axisValues.at(-1)), factor.key);
  assert.deepEqual(energyData.hourlyByYear, {}, "原备份的逐时缓存不回填");
}

{
  const input = fixture(false);
  for (const year of [2026, 2027, 2028]) input.project.energyData.hourlyByYear[year].fill(0.25);
  input.result = calculator.calculateScenarioResult(input.project, input.scenario, input.run);
  const factors = sensitivity.buildFactors(input.project, input);
  const capture = factors.find(({ key }) => key === "capture_spread");
  assert.equal(factors.length, 4);
  assert.equal(capture.available, false);
  assert.match(capture.unavailableReason, /出力缺少有效变化/);
  assert.ok(capture.series.every((point) => point === null));
  assert.equal(capture.lowDelta, null);
  assert.equal(factors.find(({ key }) => key === "spot").available, true);
}

{
  const input = fixture(false);
  input.scenario.config.mechanismEnabled = false;
  input.result = calculator.calculateScenarioResult(input.project, input.scenario, input.run);
  const factors = sensitivity.buildFactors(input.project, input);
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
  const input = fixture(false);
  Object.assign(input.scenario.config, { mechanismPrice: 63, mechanismRatio: 0.97 });
  input.result = calculator.calculateScenarioResult(input.project, input.scenario, input.run);
  const factors = sensitivity.buildFactors(input.project, input);
  const price = factors.find(({ key }) => key === "mechanism_price");
  assert.deepEqual(price.axisValues, [-63, -50, -25, 0, 25, 50, 75, 100]);
  assert.equal(price.presetLabel, "−63 元/MWh 至 +100 元/MWh · 步长 25 元/MWh");
  near(price.series[0], oracle(input, "mechanism_price", -63), "价格下降到零");
  const ratio = factors.find(({ key }) => key === "mechanism_ratio");
  assert.deepEqual(ratio.axisValues, mechanismRatios);
  assert.equal(ratio.baselineInput, 97);
  assert.ok(!ratio.axisValues.includes(ratio.baselineInput), "97% 的历史基准独立展示，取点仍保持 5 个百分点等距");
  assert.equal(ratio.highInput, "100%");
  near(ratio.series.at(-1), oracle(input, "mechanism_ratio", 100), "机制电量占比从 97% 扰动至 100%");
}

{
  const input = fixture(false);
  input.scenario.config.mechanismRatio = 0;
  input.result = calculator.calculateScenarioResult(input.project, input.scenario, input.run);
  const factors = sensitivity.buildFactors(input.project, input);
  const price = factors.find(({ key }) => key === "mechanism_price");
  assert.equal(price.applicable, false);
  assert.equal(price.sensitivity, 0);
  const ratio = factors.find(({ key }) => key === "mechanism_ratio");
  assert.equal(ratio.applicable, true);
  assert.deepEqual(ratio.axisValues, mechanismRatios);
  assert.equal(ratio.baselineInput, 0);
  near(ratio.series.at(-1), oracle(input, "mechanism_ratio", 100), "基准占比为零时按有效月份新增机制电量");
  assert.ok(ratio.sensitivity > 0);
}

{
  const fixtureData = fixture(true);
  const { project, scenario, result, run } = fixtureData;
  const stored = versions.stampComputedResult(project, scenario, run, {
    ...result, sourceContext: { version: 2, projectId: project.id, scenarioId: scenario.id, runId: run.id }
  });
  const storedBaseline = { scenario, result: stored };
  assert.ok(sensitivity.availability(project, storedBaseline).ok);
  const saved = sensitivity.buildFactors(project, storedBaseline);
  const missingRun = { ...project, priceRuns: [] };
  assert.match(sensitivity.availability(missingRun, storedBaseline).message, /全周期逐时电量或电价缺失/);
  assert.deepEqual(sensitivity.buildFactors(missingRun, storedBaseline), []);
  assert.deepEqual(sensitivity.buildFactors({ ...project, activeRunId: "another-run" }, storedBaseline), []);
  const changedRun = { ...run, pricesByYear: { ...run.pricesByYear, 2028: [...run.pricesByYear[2028]] } };
  changedRun.pricesByYear[2028][0] += 1;
  assert.deepEqual(sensitivity.buildFactors({ ...project, priceRuns: [changedRun] }, storedBaseline), [],
    "后续年份的原始电价变更不可复用");
  const changedEnergy = { ...project, energyData: { ...project.energyData, hourlyByYear: {
    ...project.energyData.hourlyByYear, 2028: project.energyData.hourlyByYear[2028].slice(0, 8759)
  } } };
  assert.deepEqual(sensitivity.buildFactors(changedEnergy, storedBaseline), []);
  const first = result.hourlyPreview[0];
  const corruptPreview = { scenario, result: { ...stored, hourlyPreview: [{ ...first, spotPrice: -100000 }, ...result.hourlyPreview.slice(1)] } };
  assert.equal(analysis.isResultComplete(project, scenario, corruptPreview.result), true, "仅损坏逐时不影响年度对标");
  assert.deepEqual(sensitivity.buildFactors(project, corruptPreview), []);
  assert.match(sensitivity.availability(project, corruptPreview).message, /小时明细.*对账未通过/);
  assert.strictEqual(sensitivity.buildFactors(project, storedBaseline), saved);
}

console.log("compare sensitivity tests passed");
