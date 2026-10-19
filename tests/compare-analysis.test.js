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
const up = JSON.parse(JSON.stringify(base)); Object.assign(up, { id: "up", name: "乐观", isBaseline: false }); up.config.otherFee -= 1;
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
assert.equal(detectTopDriver(available[1].result, baseline.result), "综合费用", "仅调整费用时，主要差异不是现货收入");
assert.equal(detectTopDriver(baseline.result, baseline.result), "无差异");
assert.equal(detectTopDriver({}, baseline.result), "-");
const otherIncome = JSON.parse(JSON.stringify(baseline.result)); otherIncome.annualRows[1].otherIncome += 100;
assert.equal(detectTopDriver(otherIncome, baseline.result), "其他收入", "归因涵盖全周期和其他收入");
const totals = resultComponentTotals(baseline.result);
assert.equal(totals.comprehensiveFee, -baseline.result.annualRows.reduce((sum, row) => sum + row.comprehensiveFee, 0));

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
