"use strict";

const assert = require("node:assert/strict");
const { prepareAppBootstrapSandbox, runAppBootstrapSmoke } = require("../scripts/app-bootstrap-smoke");
const { createBrowserSandbox } = require("../scripts/module-load-smoke");

(async () => {
  const sandbox = prepareAppBootstrapSandbox(createBrowserSandbox());
  await runAppBootstrapSmoke({ sandbox });
  const project = {
    id: "rough-round-trip", name: "粗算恢复测试", province: "jiangsu", assetType: "wind",
    siteType: "onshore", capacityMw: 100, hasStorage: false, startYear: 2026,
    forecastYears: 2, energyMode: "hourly_8760", workspaceBucket: "history",
    energyData: { mode: "hourly_8760", hourlyByYear: {}, annualSummary: {}, annualInputByYear: {} },
    priceRuns: [], scenarios: [], statuses: {}, resultsByScenario: {}
  };
  const scenario = sandbox.NE_SCENARIO_MODEL.createBaselineScenario(project);
  scenario.config.mechanismReferenceMode = "same_type";
  scenario.config.sameTypeSpread = 5;
  project.scenarios = [scenario];
  project.activeScenarioId = scenario.id;
  sandbox.NE_SCENARIO_MODEL.confirmConfig(scenario, ["mechanismPrice"]);
  const draft = { spotNodes: [{ year: 2026, value: 300 }], captureRate: 95, sourceNote: "客户独立假设" };
  const result = sandbox.NE_ROUGH_PRICE.calculateRough(project, scenario, draft, { id: "rough-saved" });
  assert.equal(result.ok, true, result.errors.join("；"));
  project.roughPrice = { draftsByScenario: { [scenario.id]: draft }, snapshots: [result.snapshot] };
  const originalRows = JSON.stringify(result.snapshot.rows);
  const restored = sandbox.sanitizeProject(JSON.parse(JSON.stringify(project)), 0);
  assert.equal(restored.roughPrice.snapshots[0].id, "rough-saved");
  assert.equal(JSON.stringify(restored.roughPrice.snapshots[0].rows), originalRows);
  assert.equal(restored.roughPrice.draftsByScenario[scenario.id].spotNodes[0].value, 300);
  assert.equal(restored.scenarios[0].config.mechanismReferenceMode, "same_type");
  assert.equal(restored.scenarios[0].config.sameTypeSpread, 5);
  assert.equal(sandbox.NE_SCENARIO_MODEL.isConfigConfirmed(restored.scenarios[0], "mechanismPrice"), true);
  assert.equal(sandbox.NE_SCENARIO_MODEL.isConfigConfirmed(restored.scenarios[0], "otherFee"), false);
  assert.equal(restored.priceRuns.length, 0, "粗算保存不会创建精算预测版本");
  restored.scenarios[0].config.mechanismPrice += 10;
  assert.equal(JSON.stringify(restored.roughPrice.snapshots[0].rows), originalRows, "修改共用参数不能重写历史结果");
  assert.equal(sandbox.NE_ROUGH_PRICE.snapshotState(restored, restored.scenarios[0], restored.roughPrice.snapshots[0]).comparable, true);
  assert.equal(sandbox.NE_ROUGH_PRICE.snapshotState(restored, restored.scenarios[0], restored.roughPrice.snapshots[0]).refined, true);
  const legacy = sandbox.sanitizeProject({ ...project, roughPrice: undefined }, 1);
  assert.equal(legacy.roughPrice.snapshots.length, 0, "旧项目可无损初始化新工作区");

  const state = sandbox.NE_RUNTIME.appState;
  state.auth = { loggedIn: true, account: "rough-copy-review" };
  project.ownerAccount = state.auth.account;
  state.projects = [project];
  state.activeProjectId = project.id;
  sandbox.duplicateActiveScenario();
  const copiedScenario = project.scenarios.find((item) => item.id === project.activeScenarioId);
  const copiedDraft = project.roughPrice.draftsByScenario[copiedScenario.id];
  assert.equal(copiedScenario.confirmedConfig.mechanismPrice, scenario.config.mechanismPrice);
  assert.notEqual(copiedScenario.confirmedConfig, scenario.confirmedConfig);
  assert.ok(copiedDraft, "复制方案必须自动带入已录入的粗算参数");
  assert.equal(JSON.stringify(copiedDraft), JSON.stringify(draft));
  assert.notEqual(copiedDraft, draft, "副本粗算草稿必须独立存储");
  copiedDraft.spotNodes[0].value = 330;
  copiedDraft.captureRate = 88;
  copiedDraft.sourceNote = "副本情景假设";
  assert.equal(draft.spotNodes[0].value, 300, "修改副本节点不得回写源方案");
  assert.equal(draft.captureRate, 95);
  assert.equal(draft.sourceNote, "客户独立假设");
  assert.equal(project.roughPrice.snapshots.length, 1, "复制方案不应伪造新粗算快照");
  assert.equal(project.roughPrice.snapshots[0].scenarioId, scenario.id, "历史快照保留源方案归属");
  const restoredCopy = sandbox.sanitizeProject(JSON.parse(JSON.stringify(project)), 3);
  assert.equal(restoredCopy.roughPrice.draftsByScenario[copiedScenario.id].spotNodes[0].value, 330,
    "复制方案的粗算草稿在刷新恢复后保留");
  legacy.ownerAccount = state.auth.account;
  state.projects = [legacy];
  state.activeProjectId = legacy.id;
  assert.doesNotThrow(() => sandbox.duplicateActiveScenario(), "尚未录入粗算的旧方案仍可正常复制");

  const curved = sandbox.sanitizeProject({ ...project, roughPrice: undefined, energyMode: "typical_curve_8760", energyData: {
    mode: "typical_curve_8760", annualInputByYear: { 2026: 2500, 2027: 2450 },
    typicalCurveSource: "typical_curve_8760",
    typicalCurveProfile: Array.from({ length: 8760 }, (_, i) => 0.1 + (i % 23) / 13)
  } }, 2);
  sandbox.NE_ENERGY_DATA.ensureProjectEnergyDataDerivedState(curved);
  const curvedResult = sandbox.NE_ROUGH_PRICE.calculateRough(curved, curved.scenarios[0], draft, { id: "curve-saved" });
  assert.equal(curvedResult.ok, true, curvedResult.errors.join("；"));
  curved.roughPrice = { draftsByScenario: {}, snapshots: [curvedResult.snapshot] };
  const curveRestored = sandbox.sanitizeProject(JSON.parse(JSON.stringify(curved)), 2);
  const constantRun = { pricesByYear: { 2026: Array(8760).fill(300), 2027: Array(8760).fill(300) } };
  const curveComparison = sandbox.NE_ROUGH_PRICE.compareSnapshot(curveRestored, curveRestored.scenarios[0],
    curveRestored.roughPrice.snapshots[0], constantRun, sandbox.getHourlyEnergyForCalculation);
  assert.equal(curveComparison.stale, false, "典型曲线重复归一化尾差不得使恢复后的快照失效");
  assert.equal(curveComparison.ok, true, curveComparison.errors.join("；"));
  curveRestored.ownerAccount = state.auth.account;
  curveRestored.activeScenarioId = curveRestored.scenarios[0].id;
  constantRun.id = "saved-baseline-run";
  curveRestored.priceRuns = [constantRun];
  curveRestored.activeRunId = constantRun.id;
  state.projects = [curveRestored];
  state.activeProjectId = curveRestored.id;
  state.activePage = "home-page";
  sandbox.runCalculation();
  const baseline = curveRestored.resultsByScenario[curveRestored.activeScenarioId];
  assert.equal(baseline.sourceContext.runId, constantRun.id, "实际测算入口保存计算来源");
  const savedComparison = sandbox.NE_ROUGH_PRICE.compareBaselineResult(curveRestored, curveRestored.scenarios[0], curveRestored.roughPrice.snapshots[0], baseline);
  assert.equal(savedComparison.ok, true, savedComparison.errors.join("；"));
  assert.equal(savedComparison.summary.weightedFine, baseline.avgFullRevenuePrice, "交叉验证读取基准总览同一保存值");
  const reloaded = sandbox.sanitizeProject(JSON.parse(JSON.stringify(curveRestored)), 4);
  assert.equal(sandbox.NE_ROUGH_PRICE.compareBaselineResult(reloaded, reloaded.scenarios[0], reloaded.roughPrice.snapshots[0], reloaded.resultsByScenario[reloaded.activeScenarioId]).ok, true,
    "刷新后粗算和基准来源记录仍可对照");
  curveRestored.statuses["scenario-page"] = "in_progress";
  curveRestored.resultsByScenario = {};
  assert.equal(sandbox.shouldAutoSyncProvinceDefaults(curveRestored), false, "前面保存的粗算参数不能被创建页默认值覆盖");
  const workflow = sandbox.buildWorkflowCompletionSnapshot(reloaded);
  assert.equal(workflow.roughCompleted, true);
  assert.equal(workflow.validationCompleted, true);

  state.projects = [reloaded]; state.activeProjectId = reloaded.id;
  const activeScenario = reloaded.scenarios.find((item) => item.id === reloaded.activeScenarioId);
  const savedBaseline = reloaded.resultsByScenario[activeScenario.id];
  const initialRough = reloaded.roughPrice.snapshots[0];
  const initialRoughJson = JSON.stringify(initialRough);
  activeScenario.config.otherFee += 1;
  sandbox.markDownstreamStale(reloaded, "scenario-page");
  sandbox.reconcileProjectStatuses(reloaded);
  assert.equal(reloaded.statuses["rough-page"], "completed", "收益细化保留原粗算的完成状态");
  assert.equal(reloaded.statuses["results-page"], "stale", "保存新收入参数后旧结果不能被恢复为已完成");
  assert.equal(sandbox.NE_ROUGH_PRICE.baselineResultState(reloaded, activeScenario, savedBaseline).reason, "stale_context");
  assert.equal(reloaded.resultsByScenario[activeScenario.id], savedBaseline, "复核状态保留原数值");
  sandbox.runCalculation();
  assert.equal(reloaded.statuses["results-page"], "completed", "重新测算后恢复完成");
  assert.equal(reloaded.statuses["validation-page"], "completed", "细化后重算基准即可完成对照，无需重做粗算");
  const refinedComparison = sandbox.NE_ROUGH_PRICE.compareBaselineResult(reloaded, activeScenario, initialRough,
    reloaded.resultsByScenario[activeScenario.id]);
  assert.equal(refinedComparison.ok, true, refinedComparison.errors.join("；"));
  assert.equal(refinedComparison.snapshotState.refined, true);
  assert.equal(refinedComparison.summary.weightedRough, initialRough.summary.weightedPrice);
  assert.equal(JSON.stringify(initialRough), initialRoughJson, "细化和重算不能回写原粗算");
  assert.equal(reloaded.roughPrice.snapshots.length, 1, "细化不能生成替代原判断的新快照");
  const refinedReload = sandbox.sanitizeProject(JSON.parse(JSON.stringify(reloaded)), 5);
  assert.equal(sandbox.NE_ROUGH_PRICE.compareBaselineResult(refinedReload, refinedReload.scenarios[0],
    refinedReload.roughPrice.snapshots[0], refinedReload.resultsByScenario[refinedReload.activeScenarioId]).ok, true,
  "细化后的基准与原粗算刷新恢复后仍可比较");
  const priorRunResult = reloaded.resultsByScenario[activeScenario.id];
  const nextRun = { ...constantRun, id: "new-prediction-run", pricesByYear: { 2026: Array(8760).fill(400), 2027: Array(8760).fill(400) } };
  reloaded.priceRuns.push(nextRun); reloaded.activeRunId = nextRun.id;
  sandbox.markDownstreamStale(reloaded, "forecast-page"); sandbox.reconcileProjectStatuses(reloaded);
  assert.equal(reloaded.statuses["results-page"], "stale", "换生效预测后旧基准需要重算");
  assert.equal(reloaded.statuses["validation-page"], "stale", "旧预测对照应提示需复核");
  const oldRunComparison = sandbox.NE_ROUGH_PRICE.compareBaselineResult(reloaded, activeScenario, initialRough, priorRunResult);
  assert.equal(oldRunComparison.ok, true, "可保留与总览同一份历史结果的对照");
  assert.equal(oldRunComparison.baselineState.reason, "stale_run");
  assert.equal(oldRunComparison.summary.weightedFine, priorRunResult.avgFullRevenuePrice);
  sandbox.runCalculation();
  assert.equal(reloaded.statuses["results-page"], "completed");
  assert.equal(reloaded.statuses["validation-page"], "completed");
  const updatedBaseline = reloaded.resultsByScenario[activeScenario.id];
  assert.equal(updatedBaseline.sourceContext.runId, nextRun.id);
  assert.notEqual(updatedBaseline.avgFullRevenuePrice, priorRunResult.avgFullRevenuePrice);
  assert.equal(sandbox.NE_ROUGH_PRICE.baselineResultState(reloaded, activeScenario, updatedBaseline).current, true);
  const legacyResult = { ...updatedBaseline }; delete legacyResult.sourceContext;
  assert.equal(sandbox.NE_ROUGH_PRICE.baselineResultState(reloaded, activeScenario, legacyResult).reason, "legacy_baseline");
  // Historical partial annual edits need review even after the previous migration,
  // while prices, saved rough snapshots, and baseline comparisons remain identical.
  const annualProject = sandbox.sanitizeProject(JSON.parse(JSON.stringify(reloaded)), 6);
  const annualScenario = annualProject.scenarios[0];
  const annualEnv = { greenCertPrice: 22.125, greenCertRealizeRatio: 0.8, greenPremiumPrice: 12.25,
    greenPremiumRealizeRatio: 0.2, carbonEnabled: false, carbonPrice: 0, carbonRealizeRatio: 0 };
  const annualFees = { marketOpFee: 6.125, gridAssessFee: 7, ancillaryFee: 14, otherFee: 3.25, otherIncome: 2 };
  Object.assign(annualScenario.config, { ltPricingMode: "manual", ltManualPricesByYear: { 2026: 9.125, 2027: 8.25 },
    envValueMode: "manual", envManualValuesByYear: { 2026: { ...annualEnv }, 2027: { ...annualEnv, greenCertPrice: 24.5 } },
    feeConfigMode: "manual", feeManualValuesByYear: { 2026: { ...annualFees }, 2027: { ...annualFees, otherFee: 4.75 } } });
  const annualKeys = ["ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"];
  sandbox.NE_SCENARIO_MODEL.confirmConfig(annualScenario);
  for (const key of annualKeys) delete annualScenario.confirmedConfigSources[key];
  annualScenario.confirmationReviewVersion = 1;
  const annualRough = sandbox.NE_ROUGH_PRICE.calculateRough(annualProject, annualScenario, draft, { id: "historical-annual-rough" });
  assert.equal(annualRough.ok, true, annualRough.errors.join("；"));
  annualProject.roughPrice = { draftsByScenario: {}, snapshots: [annualRough.snapshot] };
  state.projects = [annualProject]; state.activeProjectId = annualProject.id;
  annualProject.activeScenarioId = annualScenario.id;
  sandbox.runCalculation();
  const beforeAnnualReview = JSON.stringify(annualScenario.config);
  const beforeAnnualSnapshot = JSON.stringify(annualProject.roughPrice.snapshots);
  const beforeAnnualBaseline = JSON.stringify(annualProject.resultsByScenario);
  const pendingProject = sandbox.sanitizeProject(JSON.parse(JSON.stringify(annualProject)), 7);
  const pendingScenario = pendingProject.scenarios[0];
  const pendingUi = sandbox.NE_SCENARIO_FORM.buildRefinementState({ project: pendingProject, scenario: pendingScenario });
  for (const key of annualKeys) assert.equal(pendingUi.fields[key], "pending");
  assert.equal(JSON.stringify(pendingScenario.config), beforeAnnualReview);
  assert.equal(JSON.stringify(pendingProject.roughPrice.snapshots), beforeAnnualSnapshot);
  assert.equal(JSON.stringify(pendingProject.resultsByScenario), beforeAnnualBaseline);
  assert.equal(sandbox.NE_ROUGH_PRICE.compareBaselineResult(pendingProject, pendingScenario,
    pendingProject.roughPrice.snapshots[0], pendingProject.resultsByScenario[pendingScenario.id]).ok, true);
  const reviewSave = sandbox.NE_SCENARIO_FORM.applyScenarioSaveDraft({ project: pendingProject, scenario: pendingScenario,
    draft: { ok: true, scenarioName: pendingScenario.name, config: pendingScenario.config },
    nowIso: () => "2026-10-19T08:00:00.000Z" });
  assert.equal(reviewSave.ok, true);
  const confirmedProject = sandbox.sanitizeProject(JSON.parse(JSON.stringify(pendingProject)), 8);
  for (const key of annualKeys) assert.ok(sandbox.NE_SCENARIO_MODEL.isConfigConfirmed(confirmedProject.scenarios[0], key));
  assert.equal(JSON.stringify(confirmedProject.scenarios[0].config), beforeAnnualReview);
  assert.equal(JSON.stringify(confirmedProject.roughPrice.snapshots), beforeAnnualSnapshot);
  assert.equal(JSON.stringify(confirmedProject.resultsByScenario), beforeAnnualBaseline);
  console.log("rough price integration tests passed");
})().catch((error) => { console.error(error); process.exit(1); });
