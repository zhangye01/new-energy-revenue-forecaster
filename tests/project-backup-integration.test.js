"use strict";
const assert = require("node:assert/strict");
const backup = require("../src/ui/project-backup");
const { prepareAppBootstrapSandbox, runAppBootstrapSmoke } = require("../scripts/app-bootstrap-smoke");
const { createBrowserSandbox } = require("../scripts/module-load-smoke");
const plain = (value) => JSON.parse(JSON.stringify(value));

(async () => {
  const sandbox = prepareAppBootstrapSandbox(createBrowserSandbox());
  await runAppBootstrapSmoke({ sandbox });
  const draft = sandbox.NE_PROJECT_MODEL.createEmptyWorkspaceProject({ ownerAccount: "demo1",
    createBaselineScenario: (project) => sandbox.NE_SCENARIO_MODEL.createBaselineScenario(project) });
  const exportText = (project) => backup.buildBackup({ payload: { projects: [project] } }, "demo1");
  const restore = (project, existing = [], id = "restored-copy") => sandbox.sanitizeProject(
    backup.prepareRestore(exportText(project), existing, "demo1", () => id).projects[0], 0);
  const restoredDraft = restore(draft);
  for (const key of ["capacityMw", "startYear", "forecastYears"]) assert.equal(restoredDraft[key], null);
  assert.deepEqual(plain(restoredDraft.scenarios[0].config), plain(draft.scenarios[0].config));

  const project = sandbox.sanitizeProject({ id: "restore-source", name: "恢复原项目", ownerAccount: "demo1",
    workspaceBucket: "history", province: "shandong", assetType: "wind", siteType: "onshore", capacityMw: 100,
    hasStorage: false, startYear: 2026, forecastYears: 1, energyMode: "typical_curve_8760",
    energyData: { annualInputByYear: { 2026: 1300 }, typicalCurveSource: "typical_curve_8760", typicalCurveProfile: Array(8760).fill(1) },
    scenarios: [], priceRuns: [], resultsByScenario: {} }, 0);
  sandbox.NE_ENERGY_DATA.rebuildProjectEnergyData(project);
  const scenario = project.scenarios[0];
  const rough = sandbox.NE_ROUGH_PRICE.calculateRough(project, scenario,
    { spotNodes: [{ year: 2026, value: 300 }], captureRate: 95 }, { id: "original-rough" });
  assert.equal(rough.ok, true);
  project.roughPrice = { draftsByScenario: {}, snapshots: [rough.snapshot] };
  const run = { id: "restore-run", status: "publishable", pricesByYear: { 2026: Array(8760).fill(300) } };
  project.priceRuns = [run]; project.activeRunId = run.id;
  const calculate = (p) => sandbox.NE_ROUGH_PRICE.stampBaselineResult(p, p.scenarios[0], p.priceRuns[0],
    sandbox.NE_REVENUE_CALCULATOR.calculateScenarioResult(p, p.scenarios[0], p.priceRuns[0]));
  project.resultsByScenario[scenario.id] = calculate(project);
  const originalBytes = JSON.stringify(project);
  const roughBytes = JSON.stringify(project.roughPrice.snapshots);
  const restored = restore(project, [project]);
  const restoredScenario = restored.scenarios[0];
  const restoredRough = restored.roughPrice.snapshots[0];
  assert.equal(restored.restoredFromProjectId, project.id);
  assert.deepEqual(plain(restoredScenario.config), plain(scenario.config));
  assert.equal(JSON.stringify(restored.roughPrice.snapshots), roughBytes);
  assert.equal(sandbox.NE_ROUGH_PRICE.snapshotState(restored, restoredScenario, restoredRough).comparable, true);
  assert.equal(sandbox.NE_ROUGH_PRICE.baselineResultState(restored, restoredScenario, restored.resultsByScenario[scenario.id]).current, false);
  assert.equal(sandbox.NE_ROUGH_PRICE.compareBaselineResult(restored, restoredScenario, restoredRough, restored.resultsByScenario[scenario.id]).ok, false);
  restored.statuses["rough-page"] = "stale";
  sandbox.reconcileProjectStatuses(restored);
  assert.equal(restored.statuses["rough-page"], "completed", "restored source identities must also be recognized by navigation and project status");
  assert.equal(restored.statuses["validation-page"], "stale", "the restored baseline must still be recalculated");
  const restoredRoughState = sandbox.NE_ROUGH_PRICE.snapshotState(restored, restoredScenario, restoredRough);
  const restoredHtml = sandbox.NE_ROUGH_PRICE_WORKSPACE.roughHtml(restored, restoredScenario, restoredRough.draft,
    restored.roughPrice.snapshots, restoredRough, { config: restoredScenario.config, groupOpen: {}, message: "" },
    restoredRoughState, undefined, sandbox.NE_SCENARIO_MODEL);
  assert.match(restoredHtml, /年度粗算结果/);
  assert.doesNotMatch(restoredHtml, /项目、测算期或电量口径已变化/);
  assert.equal(sandbox.NE_ROUGH_PRICE.compareBaselineResult(restored, restoredScenario, restoredRough, calculate(restored)).ok, true);
  assert.equal(sandbox.NE_ROUGH_PRICE.compareSnapshot(restored, restoredScenario, restoredRough, run).ok, true);

  for (const change of [
    (p) => { delete p.restoredFromProjectId; delete p.restoredFromProjectIds; },
    (p) => { p.restoredFromProjectId = "unrelated-project"; p.restoredFromProjectIds = ["unrelated-project"]; },
    (p) => { p.capacityMw += 1; },
    (p) => { p.province = "jiangsu"; },
    (p) => { p.startYear += 1; },
    (p) => { p.forecastYears += 1; },
    (p) => { p.energyData.annualInputByYear[2026] += 1; },
    (p) => { p.energyData.hourlyByYear[2026][0] += 0.1; },
    (p) => { p.scenarios[0].id = "unrelated-scenario"; }
  ]) {
    const changed = plain(restored); change(changed);
    assert.equal(sandbox.NE_ROUGH_PRICE.snapshotState(changed, changed.scenarios[0], restoredRough).comparable, false);
  }
  const unrelated = { ...restored, id: "unrelated-project" };
  delete unrelated.restoredFromProjectId;
  delete unrelated.restoredFromProjectIds;
  const unrelatedRough = sandbox.NE_ROUGH_PRICE.calculateRough(unrelated, restoredScenario,
    restoredRough.draft, { id: "unrelated-rough" }).snapshot;
  assert.equal(sandbox.NE_ROUGH_PRICE.snapshotState(restored, restoredScenario, unrelatedRough).comparable, false);

  restoredScenario.config.otherFee += 10;
  assert.equal(sandbox.NE_ROUGH_PRICE.snapshotState(restored, restoredScenario, restoredRough).refined, true);
  assert.equal(sandbox.NE_ROUGH_PRICE.compareBaselineResult(restored, restoredScenario, restoredRough, calculate(restored)).ok, true);
  const newRough = sandbox.NE_ROUGH_PRICE.calculateRough(restored, restoredScenario,
    { spotNodes: [{ year: 2026, value: 310 }], captureRate: 94 }, { id: "copy-new-rough" }).snapshot;
  restored.roughPrice.snapshots.push(newRough);
  const bothSnapshotBytes = JSON.stringify(restored.roughPrice.snapshots);
  const secondCopy = restore(restored, [restored], "restored-twice");
  assert.equal(secondCopy.restoredFromProjectId, project.id);
  assert.deepEqual(plain(secondCopy.restoredFromProjectIds).sort(), [project.id, restored.id].sort());
  const secondBaseline = calculate(secondCopy);
  sandbox.reconcileProjectStatuses(secondCopy);
  assert.equal(secondCopy.statuses["rough-page"], "completed");
  for (const snapshot of secondCopy.roughPrice.snapshots) {
    assert.equal(sandbox.NE_ROUGH_PRICE.snapshotState(secondCopy, secondCopy.scenarios[0], snapshot).comparable, true);
    assert.equal(sandbox.NE_ROUGH_PRICE.compareBaselineResult(secondCopy, secondCopy.scenarios[0], snapshot, secondBaseline).ok, true);
  }
  assert.equal(JSON.stringify(secondCopy.roughPrice.snapshots), bothSnapshotBytes);
  assert.equal(JSON.stringify(secondCopy.roughPrice.snapshots[0]), JSON.stringify(project.roughPrice.snapshots[0]));
  const missingIntermediate = plain(secondCopy);
  missingIntermediate.restoredFromProjectIds = [project.id];
  assert.equal(sandbox.NE_ROUGH_PRICE.snapshotState(missingIntermediate, missingIntermediate.scenarios[0], newRough).comparable, false,
    "a snapshot from an unrecorded intermediate copy cannot be accepted");
  assert.equal(sandbox.NE_ROUGH_PRICE.snapshotState(secondCopy, secondCopy.scenarios[0], unrelatedRough).comparable, false);
  assert.equal(JSON.stringify(project), originalBytes, "restoring, recalculating and refining the copy never changes the original project");
  const originalQuery = sandbox.document.querySelector;
  const feeControl = { id: "other-fee", type: "number", value: "14.75" };
  const fakeScenarioForm = { querySelectorAll: () => [feeControl] };
  sandbox.document.querySelector = (selector) => selector === "#scenario-form" ? fakeScenarioForm : originalQuery(selector);
  sandbox.NE_PROJECT_BACKUP.captureFormState(sandbox.document);
  assert.equal(sandbox.hasUnsubmittedInputs(), false);
  const beforeInput = JSON.stringify(sandbox.buildAppDataSnapshot().payload.projects);
  feeControl.value = "88";
  assert.equal(sandbox.hasUnsubmittedInputs(), true, "app-level leave guard includes DOM-only refinement edits");
  assert.equal(JSON.stringify(sandbox.buildAppDataSnapshot().payload.projects), beforeInput,
    "detecting an unsaved form cannot confirm or mutate project parameters");
  feeControl.value = "14.75";
  assert.equal(sandbox.hasUnsubmittedInputs(), false);
  console.log("project backup integration tests passed");
})().catch((error) => { console.error(error); process.exit(1); });
