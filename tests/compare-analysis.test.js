"use strict";
const assert = require("node:assert/strict");
const analysis = require("../src/domain/compare-analysis");
const model = require("../src/domain/scenario-model");
const calculator = require("../src/domain/revenue-calculator");
const rough = require("../src/domain/rough-price");
const {
  applyCompareFrameSelection, buildAvailableScenarioResults, buildCompareFrameState, buildCompareRenderState,
  detectTopDriver, getBaselineCompareItem, getFirstAnnualRow, resolveActiveCompareScenarioId,
  resolveSensitivitySelection, resultComponentTotals, sanitizeCompareSensitivitySettings, summarizeScenarioComparison,
  sensitivityAxisLabels
} = analysis;

assert.deepEqual(sanitizeCompareSensitivitySettings({ rangePercent: 99, stepPercent: 0, responseScalePercent: 10, topN: 1, selectedKeys: ["spot", "", null, "fee"] }),
  { rangePercent: 60, stepPercent: 5, responseScalePercent: 100, topN: 3, selectedKeys: ["spot", "fee"] });
assert.deepEqual(sensitivityAxisLabels({ rangePercent: 10, stepPercent: 5 }), ["-10%", "-5%", "0%", "+5%", "+10%"]);
assert.equal(sensitivityAxisLabels({ rangePercent: Infinity, stepPercent: -5 }).length, 121, "非法输入使用安全边界");

const project = { id: "compare-test", name: "对标测试", province: "shandong", assetType: "solar", siteType: "onshore", capacityMw: 100,
  hasStorage: false, startYear: 2026, forecastYears: 2, activeRunId: "run-1", resultsByScenario: {},
  energyData: { hourlyByYear: { 2026: Array(8760).fill(0.2), 2027: Array(8760).fill(0.3) } } };
const base = model.createBaselineScenario(project); base.id = "base";
const up = JSON.parse(JSON.stringify(base)); Object.assign(up, { id: "up", name: "乐观", isBaseline: false }); up.config.otherNetIncome += 1;
const draft = JSON.parse(JSON.stringify(base)); Object.assign(draft, { id: "draft", isBaseline: false });
project.scenarios = [draft, base, up];
const run = { id: "run-1", pricesByYear: { 2026: Array(8760).fill(300), 2027: Array(8760).fill(310) } };
for (const scenario of [base, up]) project.resultsByScenario[scenario.id] = rough.stampBaselineResult(project, scenario, run, calculator.calculateScenarioResult(project, scenario, run));
const original = JSON.stringify(project);
const available = buildAvailableScenarioResults(project);
assert.deepEqual(available.map((item) => item.scenario.id), ["base", "up"]);
const baseline = getBaselineCompareItem(available);
assert.equal(baseline.scenario.id, "base");
assert.equal(getBaselineCompareItem([available[1]]), null, "不能把备选结果冒充基准");
assert.equal(getFirstAnnualRow(baseline).year, 2026);
const summary = summarizeScenarioComparison(available, baseline);
assert.equal(summary.bestScenario.scenario.id, "up");
assert.ok(Math.abs(summary.maxGapWan - 43.8) < 0.000001);
assert.equal(resolveActiveCompareScenarioId(available, baseline, "base"), "base");
assert.equal(resolveActiveCompareScenarioId(available, baseline, "missing"), "up");
assert.equal(detectTopDriver(available[1].result, baseline.result, up.config, base.config), "其他净收入", "负净额减少也应归因到其他净收入");
assert.equal(detectTopDriver(baseline.result, baseline.result, base.config, base.config), "无差异");
assert.equal(detectTopDriver({}, baseline.result), "-");
const otherIncome = JSON.parse(JSON.stringify(baseline.result)); otherIncome.annualRows[1].otherIncome += 100;
assert.equal(detectTopDriver(otherIncome, baseline.result), "费用与其他净收入合计", "缺少准确分项来源时按原金额合计归因");
const totals = resultComponentTotals(baseline.result, base.config);
const baselinePrimaryFees = (base.config.marketOpFee + base.config.gridAssessFee + base.config.ancillaryFee) * baseline.result.totalEnergy;
assert.ok(Math.abs(totals.primaryFees + baselinePrimaryFees) < 1e-6);
assert.equal(totals.otherNetIncome, -baseline.result.totalEnergy);
assert.ok(Math.abs(totals.primaryFees + totals.otherNetIncome - totals.feesAndOtherNetIncome) < 1e-6);

const selected = resolveSensitivitySelection([{ key: "spot" }, { key: "fee" }], ["missing", "fee"], "missing");
assert.deepEqual(selected.selectedKeys, ["fee"]);
assert.equal(selected.activeFactorKey, "fee");
const input = { project, available, comparePeriod: "2026-2027", activeCompareScenarioId: "missing", activeSensitivityFactorKey: "missing",
  sensitivitySettings: { rangePercent: 20, stepPercent: 10, selectedKeys: ["fee"] } };
const render = buildCompareRenderState(input);
assert.equal(render.baseline.scenario.id, "base");
assert.equal(render.baselineRevenueWan, baseline.result.annualRows[0].fullRevenue / 10000);
assert.equal(render.bestScenario.scenario.id, "up");
assert.equal(render.activeCompareScenarioId, "up");
assert.equal(render.sensitivitySelection.activeFactorKey, "fee");
assert.deepEqual(render.sensitivityFactors.map((factor) => factor.key), ["fee"]);
assert.ok(!render.allSensitivityFactors.some((factor) => factor.key === "storage"));
const frame = buildCompareFrameState(input);
assert.equal(frame.hasResults, true);
assert.equal(frame.available.length, 2);
assert.equal(frame.comparePeriod, "2026-2027");
const settings = { selectedKeys: ["spot"] };
assert.deepEqual(applyCompareFrameSelection({ frameState: frame, sensitivitySettings: settings }), { activeCompareScenarioId: "up", activeSensitivityFactorKey: "fee" });
assert.deepEqual(settings.selectedKeys, ["fee"]);
assert.equal(JSON.stringify(project), original, "分析不写回结果或输入");

// A valid input fingerprint alone cannot prove the stored output is complete.
assert.equal(analysis.isResultComplete(project, base, baseline.result, { includeHourly: true }), true);
const corruptions = [
  ["缺失年度", (copy) => copy.annualRows.pop(), false],
  ["年合计被改", (copy) => { copy.totalFullRevenue += 100; }, false],
  ["分项被改", (copy) => { copy.annualRows[0].otherIncome += 100; }, false],
  ["年值NaN", (copy) => { copy.annualRows[0].fullRevenuePrice = NaN; }, false],
  ["小时缺失", (copy) => copy.hourlyPreview.pop(), true],
  ["小时NaN", (copy) => { copy.hourlyPreview[0].fullRevenue = NaN; }, true],
  ["重复时间", (copy) => { copy.hourlyPreview[1].time = copy.hourlyPreview[0].time; }, true],
  ["小时金额被改", (copy) => { copy.hourlyPreview[0].fullRevenue += 100; }, true]
];
for (const [label, mutate, hourlyOnly] of corruptions) {
  const copy = JSON.parse(JSON.stringify(baseline.result));
  mutate(copy);
  assert.equal(rough.baselineResultState(project, base, copy).current, true, `${label}不会改变输入指纹`);
  assert.equal(analysis.isResultComplete(project, base, copy, { includeHourly: true }), false, `${label}不允许作为完整结果导出`);
  if (hourlyOnly) assert.equal(analysis.isResultComplete(project, base, copy), true, "年表检查与小时明细检查可独立复用");
}

// Storage arbitrage follows its actual charging/discharging hour, including
// discharge after solar generation has stopped; it cannot be spread over generation.
const storageProject = { ...project, id: "storage-export", hasStorage: true, storagePowerMw: 10, storageDurationH: 2,
  energyData: { hourlyByYear: Object.fromEntries([2026, 2027].map((year) => [year,
    Array.from({ length: 8760 }, (_, hour) => hour % 24 >= 8 && hour % 24 < 17 ? 0.2 : 0)])) } };
const storageScenario = model.createBaselineScenario(storageProject);
storageScenario.config.storageRoundTripEfficiency = 0.88;
const storageRun = { id: "storage-run", pricesByYear: Object.fromEntries([2026, 2027].map((year) => [year,
  Array.from({ length: 8760 }, (_, hour) => hour % 24 === 9 ? -20 : hour % 24 === 19 ? 500 : 100)])) };
const storageResult = calculator.calculateScenarioResult(storageProject, storageScenario, storageRun);
const storageOriginal = JSON.stringify(storageResult);
assert.equal(analysis.isResultComplete(storageProject, storageScenario, storageResult), true);
assert.equal(analysis.isResultComplete(storageProject, storageScenario, storageResult, { includeHourly: true }), true,
  "实际逐时配储结果允许导出8760明细");
assert.ok(storageResult.hourlyPreview.some((row) => row.energyMwh === 0 && row.fullRevenue > 0), "覆盖无发电时的储能放电收益");
const firstDispatchHour = storageResult.hourlyPreview.findIndex((row) => row.storageDispatch.chargeMwh > 0);
const storageCorruptions = [
  ["旧摊平公式", (copy) => {
    const first = copy.annualRows[0], flat = (first.fullRevenue - first.spotRevenue) / first.energyMwh;
    copy.hourlyPreview.forEach((row) => { row.fullRevenue = row.spotRevenue + row.energyMwh * flat; });
  }, true],
  ["小时充电", (copy) => { copy.hourlyPreview[firstDispatchHour].storageDispatch.chargeMwh += 1; }, true],
  ["小时放电", (copy) => { copy.hourlyPreview[firstDispatchHour].storageDispatch.dischargeMwh += 1; }, true],
  ["小时SOC", (copy) => { copy.hourlyPreview[firstDispatchHour].storageDispatch.socMwh += 1; }, true],
  ["小时净上网量", (copy) => { copy.hourlyPreview[firstDispatchHour].storageDispatch.netExportMwh += 1; }, true],
  ["配储后现货收入", (copy) => { copy.hourlyPreview[firstDispatchHour].storageDispatch.withStorageSpotRevenue += 100; }, true],
  ["小时储能增量", (copy) => { copy.hourlyPreview[firstDispatchHour].storageDispatch.incrementalRevenue += 100; }, true],
  ["小时总收入", (copy) => { copy.hourlyPreview[firstDispatchHour].fullRevenue += 100; }, true],
  ["小时调度缺失", (copy) => { delete copy.hourlyPreview[firstDispatchHour].storageDispatch; }, true],
  ["损坏小时行", (copy) => { copy.hourlyPreview[firstDispatchHour] = null; }, true],
  ["年度充电量", (copy) => { copy.annualRows[0].storageDispatch.chargeMwh += 1; }, false],
  ["年度放电量", (copy) => { copy.annualRows[0].storageDispatch.dischargeMwh += 1; }, false],
  ["年度机会成本", (copy) => { copy.annualRows[0].storageDispatch.chargeOpportunityCost += 100; }, false],
  ["年度独立收益", (copy) => { copy.annualRows[0].storageDispatch.independentSupplementRevenue += 100; }, false],
  ["第二年总额", (copy) => { copy.annualRows[1].storageDispatch.withStorageFullRevenue += 100; }, false],
  ["调度版本", (copy) => { copy.annualRows[0].storageDispatch.version = "changed"; }, false],
  ...["powerMw", "durationH", "capacityMwh", "roundTripEfficiency"].map((key) =>
    [`方案${key}`, (copy) => { copy.annualRows[0].storageDispatch[key] += 0.1; }, false])
];
for (const [label, mutate, hourlyOnly] of storageCorruptions) {
  const copy = JSON.parse(storageOriginal); mutate(copy);
  assert.equal(analysis.isResultComplete(storageProject, storageScenario, copy, { includeHourly: true }), false, `${label}篡改不得通过明细验证`);
  if (hourlyOnly) assert.equal(analysis.isResultComplete(storageProject, storageScenario, copy), true, "小时验证不会改变年度导出边界");
}
// Updating saved summaries consistently must not bypass independent dispatch reconstruction.
const coherentStorageEdit = JSON.parse(storageOriginal);
const editedAnnual = coherentStorageEdit.annualRows[0], editedDispatch = editedAnnual.storageDispatch;
editedDispatch.incrementalRevenue += 100; editedDispatch.dischargeRevenue += 100;
editedDispatch.withStorageSpotRevenue += 100; editedDispatch.withStorageFullRevenue += 100;
editedAnnual.storageSupplementRevenue += 100; editedAnnual.fullRevenue += 100;
editedAnnual.fullRevenuePrice = editedAnnual.fullRevenue / editedAnnual.energyMwh;
coherentStorageEdit.totalFullRevenue += 100;
coherentStorageEdit.avgFullRevenuePrice = coherentStorageEdit.totalFullRevenue / coherentStorageEdit.totalEnergy;
assert.equal(analysis.isResultComplete(storageProject, storageScenario, coherentStorageEdit), true, "年度恒等式一致不等于调度真实一致");
assert.equal(analysis.isResultComplete(storageProject, storageScenario, coherentStorageEdit, { includeHourly: true }), false,
  "调度重建独立拒绝协调修改过的年度套利总额");
const swappedHours = JSON.parse(storageOriginal);
swappedHours.hourlyPreview[0].fullRevenue += 100; swappedHours.hourlyPreview[1].fullRevenue -= 100;
swappedHours.hourlyPreview[0].storageDispatch.incrementalRevenue += 100;
swappedHours.hourlyPreview[1].storageDispatch.incrementalRevenue -= 100;
assert.equal(analysis.isResultComplete(storageProject, storageScenario, swappedHours, { includeHourly: true }), false,
  "保持全年合计的小时金额串位也必须拒绝");
const roundedStorage = JSON.parse(storageOriginal);
roundedStorage.annualRows[0].storageDispatch.chargeMwh += 1e-9;
roundedStorage.hourlyPreview[firstDispatchHour].storageDispatch.socMwh += 1e-10;
assert.equal(analysis.isResultComplete(storageProject, storageScenario, roundedStorage, { includeHourly: true }), true,
  "调度数量允许浮点累计尾差");
assert.equal(JSON.stringify(storageResult), storageOriginal, "验证不改写历史结果");

// Preserve old, uniformly allocated storage results that predate dispatch metadata.
const legacyStorageRun = { id: "legacy-storage", pricesByYear: { 2026: Array(8760).fill(300), 2027: Array(8760).fill(300) } };
const legacyStorage = calculator.calculateScenarioResult(storageProject, storageScenario, legacyStorageRun);
for (const row of legacyStorage.annualRows) {
  const supplement = row.energyMwh * storageScenario.config.storageArbitragePrice;
  row.storageDispatch = null; row.storageSupplementRevenue += supplement; row.fullRevenue += supplement;
  row.fullRevenuePrice = row.fullRevenue / row.energyMwh;
}
legacyStorage.totalFullRevenue = legacyStorage.annualRows.reduce((sum, row) => sum + row.fullRevenue, 0);
legacyStorage.avgFullRevenuePrice = legacyStorage.totalFullRevenue / legacyStorage.totalEnergy;
legacyStorage.hourlyPreview.forEach((row) => {
  delete row.storageDispatch;
  row.fullRevenue += row.energyMwh * storageScenario.config.storageArbitragePrice;
});
assert.equal(analysis.isResultComplete(storageProject, storageScenario, legacyStorage, { includeHourly: true }), true,
  "历史无调度记录的固定度电配储结果保留原校验方式");
const unexpectedStorage = JSON.parse(JSON.stringify(baseline.result));
unexpectedStorage.annualRows[0].storageDispatch = storageResult.annualRows[0].storageDispatch;
assert.equal(analysis.isResultComplete(project, base, unexpectedStorage), false, "无配储项目不能混入储能调度结果");

// The existing freshness gate must protect every ranking / comparison entry.
up.config.otherFee += 100;
assert.equal(rough.baselineResultState(project, up, project.resultsByScenario.up).current, false);
assert.deepEqual(buildAvailableScenarioResults(project).map((item) => item.scenario.id), ["base"]);
assert.equal(buildCompareFrameState({ project }).compareState.bestScenario, null, "仅剩一个有效基准时没有最优方案");
assert.equal(buildCompareFrameState({ project }).compareState.excludedCount, 1);
up.config.otherFee -= 100;
const source = project.resultsByScenario.up.sourceContext;
delete project.resultsByScenario.up.sourceContext;
assert.equal(buildAvailableScenarioResults(project).length, 1, "旧结果缺少指纹不能参与比较");
project.resultsByScenario.up.sourceContext = { ...source, runId: "old-run" };
assert.equal(buildAvailableScenarioResults(project).length, 1, "不同生效预测版本不能参与比较");
project.resultsByScenario.up.sourceContext = source;
project.resultsByScenario.up.annualRows[1].energyMwh += 10;
assert.equal(buildAvailableScenarioResults(project).length, 1, "年度电量口径不一致不能比较");
project.resultsByScenario.up.annualRows[1].energyMwh -= 10;
project.resultsByScenario.up.annualRows.pop();
assert.equal(buildAvailableScenarioResults(project).length, 1, "缺少年份不能比较");
project.resultsByScenario.up.annualRows = [null, null];
assert.doesNotThrow(() => buildAvailableScenarioResults(project), "损坏年表安全排除而不打断页面");
assert.equal(buildAvailableScenarioResults(project).length, 1);
project.resultsByScenario.base.sourceContext.runId = "old-run";
assert.deepEqual(buildAvailableScenarioResults(project), [], "基准失效后不能以备选冒充基准");
const empty = buildCompareFrameState({ project });
assert.equal(empty.hasResults, false);
assert.deepEqual(empty.compareState, { excludedCount: 2 });
assert.deepEqual(buildAvailableScenarioResults({}), []);
assert.equal(buildCompareFrameState({}).comparePeriod, "-");
assert.deepEqual(buildCompareRenderState({ available: [] }).sensitivityFactors, []);
assert.deepEqual(applyCompareFrameSelection({ frameState: empty, activeCompareScenarioId: "base", activeSensitivityFactorKey: "spot" }),
  { activeCompareScenarioId: "base", activeSensitivityFactorKey: "spot" });
console.log("compare analysis tests passed");
