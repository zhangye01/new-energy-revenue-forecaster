"use strict";

const assert = require("node:assert/strict");
const calculator = require("../src/domain/revenue-calculator");
const roughPrice = require("../src/domain/rough-price");
const resultCalculation = require("../src/domain/result-calculation");
const resultVersions = require("../src/domain/result-versions");
const scenarioConfig = require("../src/domain/scenario-config");
const scenarioModel = require("../src/domain/scenario-model");
const { isResultComplete } = require("../src/domain/compare-analysis");
const { runScenarioCalculation } = require("../src/ui/result-runner");

const scenarioYear = 2026;
const run = {
  id: "market-demo", granularityMinutes: 15, pointsPerYear: 35040,
  pricesByYear: { [scenarioYear]: Array(8760).fill(300) },
  quarterPricesByYear: { [scenarioYear]: Array(35040).fill(300) },
  supplyDemandInput: { featureConsumption: "not_used_by_demo_model" }
};
const project = {
  id: "versioned-project", name: "原项目", startYear: scenarioYear, forecastYears: 1, capacityMw: 100,
  province: "jiangsu", assetType: "wind", siteType: "onshore", hasStorage: false,
  energyData: { hourlyByYear: { [scenarioYear]: Array(8760).fill(0.2) } },
  activeRunId: run.id, priceRuns: [run], statuses: {}, resultsByScenario: {},
  roughPrice: { snapshots: [{ id: "rough-original", avg: 377.26579 }] }
};
const scenario = { id: "base", name: "原基准", isBaseline: true, config: scenarioModel.defaultScenarioConfig(project) };
const calculate = (options = {}) => runScenarioCalculation({
  project, scenario, run, scenarioConfirmed: true, scenarioConfig, resultCalculation,
  validateResult: (target, plan, result) => isResultComplete(target, plan, result, { includeHourly: true }),
  calculateScenarioResult: calculator.calculateScenarioResult, stampResult: roughPrice.stampBaselineResult, ...options
});
const roughBefore = JSON.stringify(project.roughPrice);
const legacy = roughPrice.stampBaselineResult(project, scenario, run, calculator.calculateScenarioResult(project, scenario, run));
project.resultsByScenario[scenario.id] = legacy;
assert.equal(roughPrice.baselineResultState(project, scenario, legacy).current, true);
assert.deepEqual(resultVersions.describeResult(legacy, run), {
  versionId: "", generatedAt: legacy.sourceContext.generatedAt, runId: run.id,
  priceSourceType: "demo", priceSourceLabel: "演示现货曲线", priceContentFingerprint: ""
});
assert.equal(resultVersions.describeResult(legacy, { ...run, id: "elsewhere" }).priceSourceType, "unverified");
assert.equal(resultVersions.getArchivedCalculationContext(legacy), null);
assert.deepEqual(resultVersions.listArchivedResults(project, scenario.id), []);

const firstRun = calculate();
assert.equal(firstRun.status, "completed");
const first = firstRun.result;
const firstMetadata = resultVersions.describeResult(first);
assert.match(firstMetadata.versionId, /^result-.+/);
assert.match(firstMetadata.priceContentFingerprint, /^price-v1-[a-f0-9]{16}$/);
assert.equal(firstMetadata.priceSourceType, "demo");
assert.equal(roughPrice.baselineResultState(project, scenario, first).current, true);
const originalArchive = resultVersions.listArchivedResults(project, scenario.id)[0];
assert.equal(originalArchive.key, "archive-1");
assert.deepEqual(originalArchive.result, legacy, "首次换版时保留旧结果原内容");
assert.equal(originalArchive.result.resultVersion, undefined, "不凭空补旧测算版本");
assert.notEqual(originalArchive.result, legacy);
assert.equal(Object.isFrozen(originalArchive.result.hourlyPreview[0]), true);
assert.equal(JSON.stringify(project.roughPrice), roughBefore, "正常重测保留原粗算记录");

const firstSource = resultVersions.getArchivedCalculationContext(first);
assert.equal(isResultComplete(firstSource.project, firstSource.scenario, first, { includeHourly: true }), true);
scenario.name = "重命名后方案";
scenario.config.otherFee += 7;
const archivedSource = resultVersions.getArchivedCalculationContext(first);
assert.equal(archivedSource.scenario.name, "原基准");
assert.notEqual(archivedSource.scenario.config.otherFee, scenario.config.otherFee);
const empty = calculate({ calculateScenarioResult: () => null });
assert.equal(empty.status, "invalid_result");
const unreconciled = calculate({ calculateScenarioResult: () => ({ annualRows: [{ year: scenarioYear, fullRevenue: 100 }] }) });
assert.equal(unreconciled.status, "invalid_result");
assert.equal(project.resultsByScenario[scenario.id], first);
assert.equal(resultVersions.listArchivedResults(project, scenario.id).length, 1, "失败重测不产生版本历史");

const second = calculate().result;
assert.notEqual(second.resultVersion.id, first.resultVersion.id);
assert.equal(second.resultVersion.scenarioName, "重命名后方案");
assert.equal(roughPrice.baselineResultState(project, scenario, second).current, true);
const restored = JSON.parse(JSON.stringify(project));
assert.equal(resultVersions.restoreResultHistory(undefined), undefined, "旧项目保持原有结构");
const restoredArchive = resultVersions.restoreResultHistory(restored.resultHistoryByScenario);
assert.equal(JSON.stringify(restoredArchive), JSON.stringify(project.resultHistoryByScenario), "恢复不更改档案字段或原始数值");
assert.equal(Object.isFrozen(restoredArchive[scenario.id][0].annualRows[0]), true);
restored.resultHistoryByScenario = restoredArchive;
assert.deepEqual(resultVersions.listArchivedResults(restored, scenario.id).map(({ key, result }) => [key, result.resultVersion?.id || ""]),
  [["archive-2", first.resultVersion.id], ["archive-1", ""]]);
assert.equal(JSON.stringify(restored.roughPrice), roughBefore);
const recovered = resultVersions.listArchivedResults(restored, scenario.id)[0].result;
const recoveredSource = resultVersions.getArchivedCalculationContext(recovered);
assert.equal(isResultComplete(recoveredSource.project, recoveredSource.scenario, recovered, { includeHourly: true }), true,
  "旧版本可按保留的计算上下文对账，无须套当前收益参数");

const copy = { ...restored, id: "copy-id", duplicationTargetProjectId: "copy-id", duplicatedFromProjectIds: [project.id] };
assert.equal(roughPrice.baselineResultState(copy, scenario, copy.resultsByScenario[scenario.id]).current, true);
assert.equal(resultVersions.listArchivedResults(copy, scenario.id)[0].result.resultVersion.id, first.resultVersion.id);
assert.equal(resultVersions.getArchivedCalculationContext({ ...second, resultVersion: { ...second.resultVersion, project: [] } }), null);
assert.equal(resultVersions.matchesSavedPriceSource(project, { ...second, priceSource: { ...second.priceSource, fingerprint: {} } }), false);

const baselineState = () => roughPrice.baselineResultState(project, scenario, second);
project.activeRunId = "different-valid-run";
assert.equal(baselineState().reason, "stale_run", "单纯改启用版本保留原历史对照资格");
run.quarterPricesByYear[scenarioYear][25] = 310;
assert.equal(baselineState().reason, "invalid_source_prices", "历史对照也拒绝同 ID 的 15 分钟价格改写");
run.quarterPricesByYear[scenarioYear][25] = 300;
project.activeRunId = run.id;
run.pricesByYear[scenarioYear][5] = 370;
assert.equal(baselineState().reason, "invalid_source_prices", "同 ID 的小时价格改写使结果失效");
run.pricesByYear[scenarioYear][5] = 300;
assert.equal(baselineState().current, true);

run.pricesByYear[scenarioYear][0] = -0;
assert.equal(resultVersions.priceContentFingerprint(project, run),
  resultVersions.priceContentFingerprint(project, JSON.parse(JSON.stringify(run))), "合法零价经过 JSON 后仍有相同签名");
run.pricesByYear[scenarioYear][0] = null;
assert.equal(calculate({ validateResult: null, calculateScenarioResult: () => ({ annualRows: [{ year: scenarioYear }] }) }).status, "invalid_input");
assert.equal(project.resultsByScenario[scenario.id], second, "异常结果不能覆盖正常结果");
assert.equal(resultVersions.listArchivedResults(project, scenario.id).length, 2);

console.log("result versions tests passed");
