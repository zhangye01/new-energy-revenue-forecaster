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
  assert.equal(restored.priceRuns.length, 0, "粗算保存不会创建精算预测版本");
  restored.scenarios[0].config.mechanismPrice += 10;
  assert.equal(JSON.stringify(restored.roughPrice.snapshots[0].rows), originalRows, "修改共用参数不能重写历史结果");
  assert.equal(sandbox.NE_ROUGH_PRICE.compareSnapshot(restored, restored.scenarios[0], restored.roughPrice.snapshots[0], null).stale, true);
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
  console.log("rough price integration tests passed");
})().catch((error) => { console.error(error); process.exit(1); });
