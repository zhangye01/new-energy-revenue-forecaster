"use strict";

const assert = require("node:assert/strict");
const { defaultDraft, sanitizeWorkspace, calculateRough, compareSnapshot, compareBaselineResult, stampBaselineResult, contextFingerprint } = require("../src/domain/rough-price");
const { calculateScenarioResult } = require("../src/domain/revenue-calculator");
const { defaultScenarioConfig, sanitizeScenario } = require("../src/domain/scenario-model");
const { normalizeTypicalCurveProfile } = require("../src/domain/energy-profiles");

function approx(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${message}: ${actual} versus ${expected}`);
}

function hours(value) {
  return Array(8760).fill(value);
}

function project(years = 2) {
  return {
    id: "project-rough", name: "粗算项目", capacityMw: 1, siteType: "offshore", hasStorage: false,
    startYear: 2026, forecastYears: years,
    energyData: { hourlyByYear: {}, annualSummary: {} },
    results: { previous: { totalEnergy: 99 } }
  };
}

function scenario(p, config = {}) {
  return {
    id: "scenario-a", name: "基准方案",
    config: {
      ...defaultScenarioConfig(p),
      mechanismEnabled: true, mechanismRatio: 0.5, mechanismPrice: 120,
      mechanismStartYm: "2026-01", mechanismEndYm: "2027-12",
      ltYear1Pnl: 10, ltTargetPnl: 10,
      greenCertPrice: 5, greenCertRealizeRatio: 0.2,
      greenPremiumPrice: 4, greenPremiumRealizeRatio: 0.3,
      carbonEnabled: true, carbonPrice: 3, carbonRealizeRatio: 0.1,
      marketOpFee: 1, gridAssessFee: 2, ancillaryFee: 3, otherFee: 4, otherIncome: 2,
      ...config
    }
  };
}

function draft(p, price = 100, captureRate = 100) {
  return { spotNodes: [{ year: p.startYear, value: price }], captureRate, sourceNote: "独立价格判断" };
}

function calculate(p, s, input = draft(p)) {
  const outcome = calculateRough(p, s, input, { id: "rough-1", createdAt: "2026-10-19T01:00:00Z" });
  assert.equal(outcome.ok, true, outcome.errors.join("\n"));
  return outcome.snapshot;
}

const p = project();
const s = scenario(p);
assert.deepEqual(defaultDraft(p), { spotNodes: [{ year: 2026, value: null }], captureRate: 95, sourceNote: "" });
const snapshot = calculate(p, s);
approx(snapshot.rows[0].capturePrice, 100, "粗算捕获价");
approx(snapshot.rows[0].mechanismAdjustment, 10, "默认项目捕获价机制补差");
approx(snapshot.rows[0].envValue, 1.25, "环境价值按市场化电量兑现");
approx(snapshot.rows[0].fullRevenuePrice, 108.25, "兼容精算原有口径");
assert.equal(snapshot.rows[0].energyMwh, null);
assert.equal(snapshot.summary.weightedPrice, null, "缺电量时不能制造加权均价");
assert.equal(snapshot.config.mechanismReferenceMode, "project_capture");
assert.equal(snapshot.scenarioName, "基准方案");
assert.equal(snapshot.id, "rough-1");

const sameType = scenario(p, { mechanismReferenceMode: "same_type", sameTypeSpread: 20 });
const sameSnapshot = calculate(p, sameType, draft(p, 100, 95));
approx(sameSnapshot.rows[0].capturePrice, 95, "捕获率按百分数计算");
approx(sameSnapshot.rows[0].mechanismAdjustment, 2.5, "九步同类型机组补差");
approx(sameSnapshot.rows[0].fullRevenuePrice, 95.75, "九步全口径公式及已有其他收入");

const monthly = calculate(p, scenario(p, { mechanismStartYm: "2026-07", mechanismEndYm: "2027-06" }));
assert.deepEqual(monthly.rows.map((row) => row.mechanismRatio), [0.25, 0.25]);
const negative = calculate(p, sameType, draft(p, -100, 95));
approx(negative.rows[0].capturePrice, -95, "负现货价保留符号");
approx(negative.rows[0].mechanismAdjustment, 97.5, "负价机制补差");

const fourYears = project(4);
const stepped = calculate(fourYears, scenario(fourYears), {
  spotNodes: [{ year: 2029, value: 400 }, { year: 2026, value: 100 }, { year: 2028, value: 300 }],
  captureRate: 100
});
assert.deepEqual(stepped.rows.map((row) => row.spotAvgPrice), [100, 100, 300, 400], "排序后阶梯覆盖年度");
assert.deepEqual(stepped.draft.spotNodes.map((node) => node.year), [2026, 2028, 2029]);

const invalidDrafts = [
  { spotNodes: [] },
  { spotNodes: [{ year: 2027, value: 100 }] },
  { spotNodes: [{ year: 2026, value: 100 }, { year: 2026, value: 120 }] },
  { spotNodes: [{ year: 2026, value: 100 }, { year: 2028, value: 120 }] },
  ...[null, "", " ", "abc", Infinity, true].map((value) => ({ spotNodes: [{ year: 2026, value }] })),
  ...[null, "", -1, 151].map((captureRate) => ({ captureRate }))
];
invalidDrafts.forEach((change) => {
  const result = calculateRough(p, s, { ...draft(p), ...change });
  assert.equal(result.ok, false, JSON.stringify(change));
  assert.equal(result.snapshot, null);
  assert.ok(result.errors.length);
});
assert.equal(calculateRough({}, s, draft(p)).ok, false);
assert.equal(calculateRough(p, { ...s, config: null }, draft(p)).ok, false);
assert.equal(calculateRough(p, scenario(p, { mechanismStartYm: "2026-13" }), draft(p)).ok, false);
const negativeMechanism = calculateRough(p, scenario(p, { mechanismPrice: -100 }), draft(p));
assert.equal(negativeMechanism.ok, false, "机制电价不得绕过已有非负约束");
assert.match(negativeMechanism.errors.join(""), /机制电价不能为负数/);
assert.equal(calculateRough(p, scenario(p, { mechanismPrice: 0 }), draft(p)).ok, true,
  "零机制电价仍为有效输入，负现货和负策略规则不受影响");

const manualConfig = {
  ltPricingMode: "manual", ltManualPricesByYear: { 2026: -10, 2027: 20 },
  envValueMode: "manual", envManualValuesByYear: {
    2026: { greenCertPrice: 30, greenCertRealizeRatio: 0.5, greenPremiumPrice: 0, greenPremiumRealizeRatio: 0 },
    2027: { greenCertPrice: 50, greenCertRealizeRatio: 1, greenPremiumPrice: 0, greenPremiumRealizeRatio: 0 }
  },
  feeConfigMode: "manual", feeManualValuesByYear: {
    2026: { marketOpFee: 3, gridAssessFee: 4, ancillaryFee: 5, otherFee: 6, otherIncome: 7 },
    2027: { marketOpFee: 1, gridAssessFee: 0, ancillaryFee: 0, otherFee: 0, otherIncome: 9 }
  }
};
const manual = calculate(p, scenario(p, manualConfig));
approx(manual.rows[0].ltPnlPrice, -10, "保留逐年策略负损益");
approx(manual.rows[1].ltPnlPrice, 20, "保留逐年策略差异");
approx(manual.rows[0].envValue, 7.5, "逐年环境价值");
approx(manual.rows[1].envValue, 25, "第二年环境价值");
approx(manual.rows[0].fee, 18, "逐年综合扣费");
approx(manual.rows[1].otherIncome, 9, "逐年其他收入");
for (const [key, badValue] of [
  ["ltManualPricesByYear", { 2026: 1 }],
  ["ltManualPricesByYear", { 2026: null, 2027: 0 }],
  ["envManualValuesByYear", { 2026: {} }],
  ["feeManualValuesByYear", { 2026: {} }]
]) {
  const invalid = calculateRough(p, scenario(p, { ...manualConfig, [key]: badValue }), draft(p));
  assert.equal(invalid.ok, false, `不完整的 ${key} 应拒绝`);
}
assert.equal(calculateRough(p, scenario(p, { greenCertRealizeRatio: 1, greenPremiumRealizeRatio: 1 }), draft(p)).ok, false);
for (const key of [
  "greenCertPrice", "greenPremiumPrice", "carbonPrice", "marketOpFee", "gridAssessFee", "ancillaryFee", "otherFee", "otherIncome"
]) {
  for (const value of [undefined, null, "", "bad", Infinity, NaN, -1]) {
    const invalid = calculateRough(p, scenario(p, { [key]: value }), draft(p));
    assert.equal(invalid.ok, false, `${key}=${value} 不得静默改为0或负费用`);
  }
}
for (const key of ["greenCertRealizeRatio", "greenPremiumRealizeRatio", "carbonRealizeRatio"]) {
  for (const value of [-0.1, 1.1, "", undefined, NaN, Infinity]) {
    assert.equal(calculateRough(p, scenario(p, { [key]: value }), draft(p)).ok, false, `${key} 在clamp前验证`);
  }
}
for (const key of ["ltYear1Pnl", "ltTargetPnl", "ltConvergeSpeed"]) {
  for (const value of [undefined, null, "", "bad", Infinity]) {
    assert.equal(calculateRough(p, scenario(p, { [key]: value }), draft(p)).ok, false, `${key} 数字不可缺省为0`);
  }
}
assert.equal(calculateRough(p, scenario(p, { ltConvergeSpeed: -1 }), draft(p)).ok, false);
assert.equal(calculateRough(p, scenario(p, { ltYear1Pnl: -10, ltTargetPnl: -2 }), draft(p)).ok, true, "策略允许负数");
assert.equal(calculateRough(p, scenario(p, { mechanismReferenceMode: "same_type", sameTypeSpread: -20 }), draft(p)).ok, true, "同类型价差允许负数");
for (const [mapKey, field, value] of [
  ["envManualValuesByYear", "greenCertRealizeRatio", -0.1],
  ["envManualValuesByYear", "greenPremiumRealizeRatio", 1.1],
  ["envManualValuesByYear", "greenCertPrice", "bad"],
  ["envManualValuesByYear", "greenPremiumPrice", -1],
  ["feeManualValuesByYear", "marketOpFee", NaN],
  ["feeManualValuesByYear", "otherIncome", ""]
]) {
  const changedMap = {
    ...manualConfig[mapKey],
    2026: { ...manualConfig[mapKey][2026], [field]: value }
  };
  assert.equal(calculateRough(p, scenario(p, { ...manualConfig, [mapKey]: changedMap }), draft(p)).ok, false, `逐年${field}校验`);
}

const storageProject = project();
storageProject.hasStorage = true;
const storage = calculate(storageProject, scenario(storageProject, {
  storageArbitragePrice: 1, storageCapacityCompPrice: 2, storageAncillaryRevenuePrice: 3, storageOtherRevenuePrice: 4
}));
approx(storage.rows[0].storageSupplement, 10, "配储补充收益");
approx(storage.rows[0].fullRevenuePrice, 118.25, "配储和其他收入均保留");

const weightedProject = project();
weightedProject.energyData.annualSummary = {
  2026: { energyMwh: 100, status: "完整" }, 2027: { energyMwh: 300, status: "待典型曲线" }
};
const weighted = calculate(weightedProject, scenario(weightedProject, { mechanismEnabled: false }), {
  ...draft(weightedProject), spotNodes: [{ year: 2026, value: 100 }, { year: 2027, value: 200 }]
});
approx(weighted.summary.weightedPrice, 179.5, "跨年度采用电量加权");
approx(weighted.summary.simpleAverage, 154.5, "明确保留年度算术平均");
weightedProject.energyData.annualSummary[2027].status = "缺失";
assert.equal(calculate(weightedProject, scenario(weightedProject)).summary.weightedPrice, null);
weightedProject.energyData.hourlyByYear[2026] = hours(1);
assert.equal(calculate(weightedProject, scenario(weightedProject)).rows[0].energyMwh, 8760, "优先小时电量");

// Versions are independent of live drafts, scenario config and subsequent workspace hydration.
const mutableDraft = draft(p);
const mutableScenario = scenario(p);
const historical = calculate(p, mutableScenario, mutableDraft);
mutableDraft.spotNodes[0].value = 999;
mutableScenario.config.mechanismPrice = 999;
assert.equal(historical.draft.spotNodes[0].value, 100);
assert.equal(historical.config.mechanismPrice, 120);
assert.ok(Object.isFrozen(historical.rows[0]));
const reloaded = sanitizeWorkspace({ draftsByScenario: { "scenario-a": mutableDraft }, snapshots: [JSON.parse(JSON.stringify(historical)), {}, historical] }, fourYears);
assert.equal(reloaded.snapshots.length, 1);
assert.deepEqual(reloaded.snapshots[0].rows, historical.rows, "历史快照不按新项目周期重算");
assert.equal(reloaded.snapshots[0].config.mechanismPrice, 120);
assert.equal(reloaded.draftsByScenario["scenario-a"].spotNodes[0].value, 999);
assert.deepEqual(sanitizeWorkspace(null, p), { draftsByScenario: {}, snapshots: [] });
assert.equal(sanitizeWorkspace({ snapshots: [{ ...historical, summary: {} }] }, p).snapshots.length, 0);
assert.equal(contextFingerprint(p, s), contextFingerprint({ ...p, name: "更名", results: {} }, { ...s, name: "新方案名" }), "显示元数据不改变计算上下文");

const comparisonProject = project();
comparisonProject.energyData.hourlyByYear = { 2026: hours(1), 2027: hours(2) };
const comparisonScenario = scenario(comparisonProject, { mechanismReferenceMode: "same_type", sameTypeSpread: 20 });
const rough = calculate(comparisonProject, comparisonScenario);
const run = { id: "run-a", pricesByYear: { 2026: hours(100), 2027: hours(120) } };
const before = JSON.stringify(comparisonProject);
const comparison = compareSnapshot(comparisonProject, comparisonScenario, rough, run);
assert.equal(comparison.ok, true, comparison.errors.join("\n"));
assert.equal(comparison.stale, false);
approx(comparison.rows[0].delta, 0, "相同输入精粗一致");
approx(comparison.rows[1].delta, 10, "精算减粗算");
approx(comparison.rows[1].fineCaptureRate, 100, "精算捕获率为百分数");
approx(comparison.rows[1].relativeDelta, 10 / 98.25, "差异率");
approx(comparison.summary.maxAbsDelta, 10, "最大年度差额");
approx(comparison.summary.weightedRough, 98.25, "粗算电量加权");
approx(comparison.summary.weightedFine, 98.25 + 20 / 3, "精算电量加权");
assert.equal(JSON.stringify(comparisonProject), before, "交叉验证不改项目和现有精算结果");

const manualReloadScenario = scenario(comparisonProject, {
  ...manualConfig,
  envManualValuesByYear: {
    2026: { ...manualConfig.envManualValuesByYear[2026], carbonEnabled: false, carbonPrice: 4, carbonRealizeRatio: 0.25 },
    2027: { ...manualConfig.envManualValuesByYear[2027], carbonEnabled: true, carbonPrice: 8, carbonRealizeRatio: 0.25,
      greenCertRealizeRatio: 0.5 }
  }
});
const rawManualBefore = JSON.stringify(manualReloadScenario.config);
const manualReloadSnapshot = calculate(comparisonProject, manualReloadScenario);
assert.equal(JSON.stringify(manualReloadScenario.config), rawManualBefore, "规范化快照不能改写方案原始逐年配置");
assert.equal(manualReloadSnapshot.config.envManualValuesByYear[2026].carbonPrice, 0,
  "快照中的停用碳收益字段与场景恢复规则一致");
assert.equal(manualReloadSnapshot.config.envManualValuesByYear[2026].carbonRealizeRatio, 0);
assert.equal(manualReloadSnapshot.config.envManualValuesByYear[2027].carbonPrice, 8, "启用碳收益的有效价格完整保留");
approx(manualReloadSnapshot.rows[1].envValue, 13.5, "有效逐年绿证和碳收益仍按原比例计入");
assert.deepEqual(manualReloadSnapshot.config.ltManualPricesByYear, manualReloadScenario.config.ltManualPricesByYear);
assert.deepEqual(manualReloadSnapshot.config.feeManualValuesByYear, manualReloadScenario.config.feeManualValuesByYear);
const hydratedManualScenario = sanitizeScenario(comparisonProject, JSON.parse(JSON.stringify(manualReloadScenario)), 0);
assert.equal(contextFingerprint(comparisonProject, hydratedManualScenario), manualReloadSnapshot.contextFingerprint,
  "真实场景恢复归零停用字段后，粗算指纹不应误过期");
const manualReloadComparison = compareSnapshot(comparisonProject, hydratedManualScenario, manualReloadSnapshot, run);
assert.equal(manualReloadComparison.stale, false);
assert.equal(manualReloadComparison.ok, true, manualReloadComparison.errors.join("；"));
const missingManualValue = {
  ...manualReloadScenario,
  config: { ...manualReloadScenario.config, envManualValuesByYear: {
    ...manualReloadScenario.config.envManualValuesByYear,
    2026: { ...manualReloadScenario.config.envManualValuesByYear[2026], greenCertPrice: null }
  } }
};
assert.equal(calculateRough(comparisonProject, missingManualValue, draft(comparisonProject)).ok, false,
  "必须先验证原始逐年配置，不能用规范化填零掩盖缺值");
const fine = calculateScenarioResult(comparisonProject, comparisonScenario, run);
approx(comparison.rows[1].fineSettlement, fine.annualRows[1].fullRevenuePrice, "直接复用真实精算公式");
approx(comparison.rows[1].fineBreakdown.mechanismAdjustment, -10, "精算补差按同类型均价");
approx(comparison.rows[1].fineBreakdown.envValue, 1.25, "精算环境分项转为元/MWh");
approx(fine.hourlyPreview[0].fullRevenue, fine.annualRows[0].fullRevenuePrice, "小时展开同样使用新机制参照");

const changed = JSON.parse(JSON.stringify(comparisonScenario));
changed.config.marketOpFee = 2;
const stale = compareSnapshot(comparisonProject, changed, rough, run);
assert.equal(stale.ok, false);
assert.equal(stale.stale, true);
assert.deepEqual(stale.rows, []);
const changedEnergy = JSON.parse(JSON.stringify(comparisonProject));
changedEnergy.energyData.hourlyByYear[2026][0] = 2;
assert.equal(compareSnapshot(changedEnergy, comparisonScenario, rough, run).stale, true);
const typicalProject = JSON.parse(JSON.stringify(comparisonProject));
typicalProject.energyData.typicalCurveSource = "province_typical_curve";
typicalProject.energyData.typicalCurveProfile = normalizeTypicalCurveProfile(
  Array.from({ length: 8760 }, (_, index) => (index % 53 + 1) * (1 + 0.4 * Math.sin(index / 24)))
);
const typicalSnapshot = calculate(typicalProject, comparisonScenario);
const normalizedAgain = JSON.parse(JSON.stringify(typicalProject));
for (let index = 0; index < 50; index += 1) {
  normalizedAgain.energyData.typicalCurveProfile = normalizeTypicalCurveProfile(normalizedAgain.energyData.typicalCurveProfile);
}
assert.ok(normalizedAgain.energyData.typicalCurveProfile.some((value, index) =>
  value !== typicalProject.energyData.typicalCurveProfile[index]), "测试确实引入了重复归一化的浮点尾差");
assert.equal(contextFingerprint(normalizedAgain, comparisonScenario), typicalSnapshot.contextFingerprint,
  "归一化的微小数值尾差不改变计算上下文签名");
const normalizedComparison = compareSnapshot(normalizedAgain, comparisonScenario, typicalSnapshot, run);
assert.equal(normalizedComparison.ok, true, normalizedComparison.errors.join("\n"));
assert.equal(normalizedComparison.stale, false, "仅刷新归一化不误判粗算过期");
normalizedAgain.energyData.typicalCurveProfile[0] += 0.00001;
normalizedAgain.energyData.typicalCurveProfile = normalizeTypicalCurveProfile(normalizedAgain.energyData.typicalCurveProfile);
assert.notEqual(contextFingerprint(normalizedAgain, comparisonScenario), typicalSnapshot.contextFingerprint,
  "实质曲线形状变化必须改变签名");
assert.equal(compareSnapshot(normalizedAgain, comparisonScenario, typicalSnapshot, run).stale, true);
assert.equal(compareSnapshot(comparisonProject, comparisonScenario, rough, { pricesByYear: {} }).ok, false);
assert.equal(compareSnapshot(comparisonProject, comparisonScenario, rough, null).ok, false);
assert.equal(compareSnapshot(comparisonProject, comparisonScenario, null, run).ok, false);
const noEnergyComparison = compareSnapshot(p, s, snapshot, run, () => {
  throw new Error("缺少已录入电量时不得生成默认曲线");
});
assert.equal(noEnergyComparison.ok, false);
const badRun = { pricesByYear: { ...run.pricesByYear, 2027: hours(NaN) } };
assert.equal(compareSnapshot(comparisonProject, comparisonScenario, rough, badRun).ok, false);

const zeroProject = project(1);
zeroProject.energyData.hourlyByYear[2026] = hours(1);
const zeroScenario = scenario(zeroProject, {
  mechanismEnabled: false, ltYear1Pnl: 0, ltTargetPnl: 0, greenCertPrice: 0,
  greenPremiumPrice: 0, carbonPrice: 0, marketOpFee: 0, gridAssessFee: 0,
  ancillaryFee: 0, otherFee: 0, otherIncome: 0
});
const zero = calculate(zeroProject, zeroScenario, draft(zeroProject, 0));
const zeroComparison = compareSnapshot(zeroProject, zeroScenario, zero, { pricesByYear: { 2026: hours(0) } });
assert.equal(zeroComparison.rows[0].relativeDelta, null);
assert.equal(zeroComparison.rows[0].fineCaptureRate, null);

let helperCalled = 0;
const helperComparison = compareSnapshot(comparisonProject, comparisonScenario, rough, run, (copy, year) => {
  helperCalled += 1;
  copy.results = { overwritten: true };
  return copy.energyData.hourlyByYear[year];
});
assert.equal(helperCalled, 2);
assert.equal(helperComparison.ok, true);
assert.equal(JSON.stringify(comparisonProject), before, "副本隔离带写入的已有电量helper");

const heavyProject = { ...comparisonProject };
for (const key of ["priceRuns", "quarterPrices", "pricesByYear", "results", "resultsByScenario", "roughPrice"]) {
  Object.defineProperty(heavyProject, key, {
    enumerable: true,
    get() { throw new Error(`交叉验证不应读取或复制大体积 ${key}`); }
  });
}
heavyProject.storageDurationH = 4;
heavyProject.energyMode = "hourly_8760";
const lightweight = compareSnapshot(heavyProject, comparisonScenario, rough, run, (copy, year) => {
  assert.equal(copy.storageDurationH, 4, "保留项目基础标量");
  assert.equal(copy.energyMode, "hourly_8760");
  assert.equal(Object.hasOwn(copy, "priceRuns"), false);
  assert.equal(Object.hasOwn(copy, "roughPrice"), false);
  copy.energyData.hourlyByYear[year] = copy.energyData.hourlyByYear[year].slice();
  return copy.energyData.hourlyByYear[year];
});
assert.equal(lightweight.ok, true, lightweight.errors.join("\n"));
assert.equal(JSON.stringify(comparisonProject), before, "电量数据仍为隔离深拷贝");

const summaryProject = project();
summaryProject.energyData.annualSummary = {
  2026: { energyMwh: 8760, annualHours: 8760, status: "待典型曲线" },
  2027: { energyMwh: 17520, annualHours: 17520, status: "待典型曲线" }
};
const summaryScenario = scenario(summaryProject);
const summaryRough = calculate(summaryProject, summaryScenario);
const sameWeights = compareSnapshot(summaryProject, summaryScenario, summaryRough, run, (_copy, year) => hours(year === 2026 ? 1 : 2));
assert.equal(sameWeights.ok, true, "已录年度量重建为同总量曲线可正常对比");
const differentWeights = compareSnapshot(summaryProject, summaryScenario, summaryRough, run, (_copy, year) => hours(year === 2026 ? 1.25 : 2));
assert.equal(differentWeights.ok, false, "精粗年度电量不同不能给出双权重结论");
assert.match(differentWeights.errors.join(""), /电量口径差异.*2026/);
assert.deepEqual(differentWeights.rows, []);
const roundedWeights = compareSnapshot(summaryProject, summaryScenario, summaryRough, run, (_copy, year) => hours((year === 2026 ? 1 : 2) + 1e-12));
assert.equal(roundedWeights.ok, true, "容许小时求和浮点误差");

// Comparison reads the exact stored overview result, including its saved aggregate.
const unstampedBaseline = calculateScenarioResult(comparisonProject, comparisonScenario, run);
const originalBaseline = JSON.stringify(unstampedBaseline);
const savedBaseline = stampBaselineResult(comparisonProject, comparisonScenario, run, unstampedBaseline);
assert.notEqual(savedBaseline, unstampedBaseline, "来源记录不改写原计算对象");
assert.equal(JSON.stringify(unstampedBaseline), originalBaseline);
assert.equal(savedBaseline.sourceContext.projectId, comparisonProject.id);
assert.equal(savedBaseline.sourceContext.scenarioId, comparisonScenario.id);
assert.equal(savedBaseline.sourceContext.runId, "run-a");
assert.equal(savedBaseline.sourceContext.contextFingerprint, rough.contextFingerprint);
assert.ok(Number.isFinite(Date.parse(savedBaseline.sourceContext.generatedAt)));
const storedProject = { ...comparisonProject, resultsByScenario: { [comparisonScenario.id]: savedBaseline } };
// Deliberately distinct values prove the comparison never chooses/recalculates a price run,
// nor substitutes its own weighted average for the overview's already saved aggregate.
savedBaseline.annualRows[0].spotAvgPrice = 123;
savedBaseline.annualRows[0].capturePrice = 98;
savedBaseline.annualRows[0].fullRevenuePrice = 101;
savedBaseline.avgFullRevenuePrice = 104.123456789;
Object.defineProperty(storedProject, "priceRuns", { get() { throw new Error("不得读取预测版本重算"); } });
storedProject.activePriceRunId = "a-different-current-run";
const baselineBefore = JSON.stringify(savedBaseline);
const baselineComparison = compareBaselineResult(storedProject, comparisonScenario, rough, storedProject.resultsByScenario[comparisonScenario.id]);
assert.equal(baselineComparison.ok, true, baselineComparison.errors.join("；"));
assert.equal(baselineComparison.rows[0].fineSpot, 123);
assert.equal(baselineComparison.rows[0].fineCapture, 98);
assert.equal(baselineComparison.rows[0].fineSettlement, 101);
assert.equal(baselineComparison.summary.weightedFine, 104.123456789, "必须与基准结果总览使用同一保存值");
approx(baselineComparison.summary.delta, 104.123456789 - rough.summary.weightedPrice, "全周期差额");
approx(baselineComparison.summary.relativeDelta, baselineComparison.summary.delta / Math.abs(rough.summary.weightedPrice), "全周期偏差率");
assert.equal(baselineComparison.summary.weightedDelta, baselineComparison.summary.delta);
assert.equal(baselineComparison.source.runId, "run-a", "来源是生成基准结果时的版本，不随当前生效版本改变");
assert.equal(JSON.stringify(savedBaseline), baselineBefore, "对照不改写已保存结果");
baselineComparison.source.runId = "changed";
assert.equal(savedBaseline.sourceContext.runId, "run-a", "展示来源与保存对象隔离");
assert.equal(compareBaselineResult(storedProject, comparisonScenario, null, savedBaseline).reason, "missing_snapshot");
assert.equal(compareBaselineResult(storedProject, comparisonScenario, rough, null).reason, "missing_baseline");
assert.equal(compareBaselineResult(storedProject, comparisonScenario, rough, unstampedBaseline).reason, "legacy_baseline");
assert.equal(compareBaselineResult(storedProject, comparisonScenario, rough, {
  ...savedBaseline, sourceContext: { ...savedBaseline.sourceContext, generatedAt: "invalid-date" }
}).reason, "legacy_baseline");
const newScenario = { ...comparisonScenario, config: { ...comparisonScenario.config, otherFee: 8 } };
assert.equal(compareBaselineResult(storedProject, newScenario, rough, savedBaseline).reason, "stale_snapshot");
const refreshedRough = calculate(storedProject, newScenario);
assert.equal(compareBaselineResult(storedProject, newScenario, refreshedRough, savedBaseline).reason, "stale_baseline",
  "更新粗算不能把旧收入结果冒充成新口径");
const changedBaselineEnergy = JSON.parse(JSON.stringify(comparisonProject));
changedBaselineEnergy.energyData.hourlyByYear[2026][0] += 1;
const energyRefreshedRough = calculate(changedBaselineEnergy, comparisonScenario);
assert.equal(compareBaselineResult(changedBaselineEnergy, comparisonScenario, energyRefreshedRough, savedBaseline).reason, "stale_baseline");
for (const badResult of [
  { ...savedBaseline, annualRows: savedBaseline.annualRows.slice(0, 1) },
  { ...savedBaseline, annualRows: [savedBaseline.annualRows[0], savedBaseline.annualRows[0]] },
  { ...savedBaseline, missingYears: [2027] },
  { ...savedBaseline, avgFullRevenuePrice: NaN },
  { ...savedBaseline, avgFullRevenuePrice: null },
  { ...savedBaseline, annualRows: savedBaseline.annualRows.map((row) => ({ ...row, fullRevenuePrice: Infinity })) }
]) {
  assert.equal(compareBaselineResult(storedProject, comparisonScenario, rough, badResult).reason, "invalid_baseline");
}
for (const energyMwh of [0, null, -1, 8761]) {
  const badEnergy = { ...savedBaseline, annualRows: savedBaseline.annualRows.map((row, index) => index ? row : { ...row, energyMwh }) };
  assert.equal(compareBaselineResult(storedProject, comparisonScenario, rough, badEnergy).reason, "energy_mismatch");
}
const zeroBaseline = stampBaselineResult(zeroProject, zeroScenario, { id: "zero-run" },
  calculateScenarioResult(zeroProject, zeroScenario, { pricesByYear: { 2026: hours(0) } }));
const storedZero = compareBaselineResult(zeroProject, zeroScenario, zero, zeroBaseline);
assert.equal(storedZero.ok, true);
assert.equal(storedZero.summary.weightedFine, 0);
assert.equal(storedZero.summary.relativeDelta, null, "零粗算不产生无穷大偏差率");
assert.equal(storedZero.rows[0].relativeDelta, null);
assert.equal(storedZero.rows[0].fineCaptureRate, null);
const negativeRough = calculate(zeroProject, zeroScenario, draft(zeroProject, -100));
const negativeBaseline = stampBaselineResult(zeroProject, zeroScenario, { id: "negative-run" },
  calculateScenarioResult(zeroProject, zeroScenario, { pricesByYear: { 2026: hours(-80) } }));
const storedNegative = compareBaselineResult(zeroProject, zeroScenario, negativeRough, negativeBaseline);
assert.equal(storedNegative.ok, true);
assert.equal(storedNegative.summary.weightedFine, -80);
assert.equal(storedNegative.summary.delta, 20);
assert.equal(storedNegative.summary.relativeDelta, 0.2, "负价偏差率以粗算绝对值为分母，保留高低方向");
assert.equal(storedNegative.rows[0].relativeDelta, 0.2);

console.log("rough price tests passed");
