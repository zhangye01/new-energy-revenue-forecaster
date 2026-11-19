"use strict";

const assert = require("node:assert/strict");
const { runAppBootstrapSmoke } = require("../scripts/app-bootstrap-smoke");
const { createBrowserSandbox } = require("../scripts/module-load-smoke");

const YEAR = 2028;
const ACCOUNT = "demo1";
const NOW = "2026-11-19T01:00:00.000Z";
const clone = (value) => JSON.parse(JSON.stringify(value));

function runWithSupplySnapshot(sandbox, project, config, id) {
  const dataset = sandbox.NE_SUPPLY_DEMAND.buildDataset(project, config);
  assert.equal(dataset.ok, true);
  const prices = Array(8760).fill(305.125);
  prices.splice(0, 3, -20.125, 0, 460.125);
  const forecast = sandbox.NE_PRICE_FORECAST;
  return {
    id, createdAt: NOW, algorithmFamily: "ensemble", executionKind: "demo_simulation",
    algorithmVersion: "synthetic-case-test", status: "publishable",
    granularityMinutes: 60, pointsPerYear: 8760, marketPriceBasis: forecast.MARKET_PRICE_BASIS,
    pricesByYear: { [YEAR]: prices },
    supplyDemandInput: forecast.snapshotSupplyDemandInput(project, { config, dataset })
  };
}

function createProject(sandbox) {
  const project = sandbox.sanitizeProject({
    id: "supply-restore-source", name: "供需备份恢复案例", ownerAccount: ACCOUNT,
    workspaceBucket: "history", province: "jiangsu", assetType: "wind", siteType: "offshore",
    capacityMw: 100, hasStorage: true, storagePowerMw: 20, storageDurationH: 2,
    startYear: YEAR, forecastYears: 1, energyMode: "typical_curve_8760",
    energyData: { annualInputByYear: { [YEAR]: 2500 }, typicalCurveSource: "typical_curve_8760",
      typicalCurveProfile: Array(8760).fill(1) },
    scenarios: [], priceRuns: [], resultsByScenario: {}
  }, 0);
  sandbox.NE_ENERGY_DATA.rebuildProjectEnergyData(project);
  const scenario = project.scenarios[0];
  scenario.config.storageRoundTripEfficiency = 0.88;
  sandbox.NE_SCENARIO_MODEL.confirmConfig(scenario, undefined, { project, source: "explicit" });
  assert.equal(sandbox.isScenarioConfigConfirmed(project, scenario), true);
  const rough = sandbox.NE_ROUGH_PRICE.calculateCompactRough(project, scenario, {
    spotNodes: [{ year: YEAR, value: 310.5 }], captureRate: 94,
    settlement: { ltYear1Pnl: -11, ltTargetPnl: -3, ltConvergeSpeed: 4,
      environmentPrice: 18, feesNetPrice: -12.75, storagePrice: 8.5 }
  }, { id: "rough-before-restore", createdAt: NOW });
  assert.equal(rough.ok, true, JSON.stringify(rough.errors));
  project.roughPrice = { draftsByScenario: {}, snapshots: [rough.snapshot] };

  const supply = sandbox.NE_SUPPLY_DEMAND;
  const config = supply.prepareShareConfig(project);
  for (const { key } of supply.ELEMENTS) {
    const series = config.elements[key];
    series.baseEnergyMwh = key === "load" ? 9000.125 : key === "tieLine" ? -300 : 0;
    series.monthlyWeights = Array(12).fill(1 / 12);
    Object.values(series.hourlyWeightsByMonth).forEach((hours) => hours.fill(1 / 24));
  }
  const active = runWithSupplySnapshot(sandbox, project, config, "market-price-before-restore");
  const foreign = runWithSupplySnapshot(sandbox, { ...project, id: "unrelated-source" }, config, "unrelated-price");
  const alternate = clone(active);
  alternate.id = "same-source-other-run";
  alternate.algorithmFamily = "lstm";
  project.supplyDemand = { version: 1, config, generatedAt: NOW, inputFingerprint: active.supplyDemandInput.fingerprint };
  project.priceRuns = [active, alternate, foreign];
  project.activeRunId = active.id;
  return project;
}

async function run() {
  const sandbox = createBrowserSandbox();
  await runAppBootstrapSmoke({ sandbox });
  const state = sandbox.NE_RUNTIME.appState;
  Object.assign(state.auth, { loggedIn: true, account: ACCOUNT, accountName: "测试" });
  const backup = sandbox.NE_PROJECT_BACKUP;
  const rough = sandbox.NE_ROUGH_PRICE;
  const forecast = sandbox.NE_PRICE_FORECAST;
  const displayedCaseIds = (project) => Array.from(sandbox.NE_FORECAST_RUN_FLOW.getArchivedCaseRuns(project), ({ id }) => id);

  function activate(project) {
    if (!state.projects.some((item) => item.id === project.id)) state.projects.push(project);
    state.activeProjectId = project.id;
    assert.equal(sandbox.getActiveProject(), project);
  }

  function restore(project, existing, id) {
    const text = backup.buildBackup({ payload: { projects: [project] } }, ACCOUNT, NOW);
    const prepared = backup.prepareRestore(text, existing, ACCOUNT, () => id);
    return sandbox.sanitizeProject(prepared.projects[0], 0);
  }

  function duplicate(source, id) {
    const copyState = { auth: { account: ACCOUNT }, projects: [source] };
    sandbox.NE_PROJECT_LIST_VIEW.createProjectListActionHandlers({
      appState: copyState, cloneData: clone, makeId: () => id
    }).duplicateProject(source.id);
    assert.equal(copyState.projects.length, 2);
    const duplicate = sandbox.sanitizeProject(copyState.projects[0], 0);
    assert.equal(duplicate.id, id);
    return duplicate;
  }

  const original = createProject(sandbox);
  assert.equal(sandbox.hasActiveActivatableRun(original), true);
  activate(original);
  sandbox.runCalculation();
  const originalScenario = original.scenarios[0];
  const initialResult = original.resultsByScenario[originalScenario.id];
  const originalBytes = JSON.stringify(original);
  const initialRough = original.roughPrice.snapshots[0];
  assert.equal(rough.baselineResultState(original, originalScenario, initialResult).current, true);

  const first = restore(original, [], "unused");
  assert.equal(first.id, original.id, "first restore keeps the source project identity");
  assert.equal(sandbox.hasActiveActivatableRun(first), true);
  assert.deepEqual(displayedCaseIds(first), ["market-price-before-restore", "same-source-other-run"]);
  assert.equal(rough.baselineResultState(first, first.scenarios[0], first.resultsByScenario[originalScenario.id]).current, true);

  const recovered = restore(original, [first], "native-restore-copy");
  assert.equal(recovered.id, "native-restore-copy");
  assert.equal(recovered.activeRunId, original.activeRunId, "repeat restore keeps the validated case price active");
  assert.equal(sandbox.hasActiveActivatableRun(recovered), true);
  assert.equal(JSON.stringify(recovered.priceRuns), JSON.stringify(original.priceRuns), "price arrays and run-source snapshots remain intact");
  assert.equal(JSON.stringify(recovered.supplyDemand), JSON.stringify(original.supplyDemand), "saved supply and original fingerprint remain intact");
  assert.equal(JSON.stringify(recovered.roughPrice.snapshots), JSON.stringify(original.roughPrice.snapshots));
  assert.equal(JSON.stringify(recovered.resultsByScenario), JSON.stringify(original.resultsByScenario));
  assert.equal(forecast.validateSupplyDemandRun(recovered, recovered.priceRuns.find((run) => run.id === "same-source-other-run")).ok,
    false, "a restore binding applies to the validated active run only");
  assert.equal(forecast.validateSupplyDemandRun(recovered, recovered.priceRuns.find((run) => run.id === "unrelated-price")).ok, false);
  assert.deepEqual(displayedCaseIds(recovered), displayedCaseIds(first), "the companion case curve is viewable without granting activation");
  const damagedCompanion = clone(recovered);
  damagedCompanion.priceRuns[1].supplyDemandInput.annualSummary[0].load += 1;
  assert.deepEqual(displayedCaseIds(damagedCompanion), ["market-price-before-restore"]);
  const ordinarySimulation = clone(first);
  ordinarySimulation.priceRuns[0].algorithmVersion = "1.0.0";
  assert.deepEqual(displayedCaseIds(ordinarySimulation), []);

  const recoveredScenario = recovered.scenarios[0];
  const recoveredRough = recovered.roughPrice.snapshots[0];
  assert.equal(rough.snapshotState(recovered, recoveredScenario, recoveredRough).comparable, true);
  assert.equal(rough.baselineResultState(recovered, recoveredScenario, recovered.resultsByScenario[recoveredScenario.id]).current, false,
    "rebinding the price alone must leave the old baseline stale");
  assert.equal(rough.compareBaselineResult(recovered, recoveredScenario, recoveredRough,
    recovered.resultsByScenario[recoveredScenario.id]).ok, false);
  activate(recovered);
  sandbox.runCalculation();
  const recalculated = recovered.resultsByScenario[recoveredScenario.id];
  assert.equal(recalculated.sourceContext.projectId, recovered.id);
  assert.equal(recalculated.sourceContext.runId, original.activeRunId);
  assert.equal(recalculated.priceSource.fingerprint, initialResult.priceSource.fingerprint);
  assert.equal(rough.baselineResultState(recovered, recoveredScenario, recalculated).current, true);
  assert.equal(rough.compareBaselineResult(recovered, recoveredScenario, recoveredRough, recalculated).ok, true);
  assert.equal(JSON.stringify(recoveredRough), JSON.stringify(initialRough));
  assert.equal(JSON.stringify(original), originalBytes, "restore and recalculation cannot mutate the source project");

  const nativeCopy = duplicate(original, "native-project-copy");
  assert.equal(sandbox.hasActiveActivatableRun(nativeCopy), true);
  assert.equal(rough.baselineResultState(nativeCopy, nativeCopy.scenarios[0], nativeCopy.resultsByScenario[originalScenario.id]).current, true,
    "ordinary project duplication retains its existing baseline behavior");

  const persistedRecovery = sandbox.sanitizeProject(clone(recovered), 0);
  assert.equal(sandbox.hasActiveActivatableRun(persistedRecovery), true, "reload restores only the validated active price");
  const recoveredCopy = duplicate(persistedRecovery, "copy-of-restored-project");
  assert.equal(sandbox.hasActiveActivatableRun(recoveredCopy), true, "native project copy of a valid recovery keeps the same price");
  assert.equal(forecast.validateSupplyDemandRun(recoveredCopy, recoveredCopy.priceRuns.find((run) => run.id === "same-source-other-run")).ok, false);
  const recoveredAgain = restore(persistedRecovery, [persistedRecovery], "second-restore-copy");
  assert.equal(sandbox.hasActiveActivatableRun(recoveredAgain), true, "a valid recovered backup can be re-exported and restored again");
  assert.equal(rough.baselineResultState(recoveredAgain, recoveredAgain.scenarios[0], recoveredAgain.resultsByScenario[recoveredScenario.id]).current, false);

  const changedIdentity = clone(persistedRecovery);
  changedIdentity.id = "unrecorded-recovery-project";
  assert.equal(sandbox.sanitizeProject(changedIdentity, 0).activeRunId, null, "a saved binding cannot transfer to an arbitrary project");
  const changedInput = clone(persistedRecovery);
  changedInput.supplyDemand.config.elements.load.baseEnergyMwh += 1;
  assert.deepEqual(displayedCaseIds(changedInput), []);
  assert.equal(sandbox.sanitizeProject(changedInput, 0).activeRunId, null, "the recovered price still requires its exact supply input");

  for (const [label, mutate] of [
    ["unrelated project", (project) => {
      project.activeRunId = "unrelated-price";
      project.restoredFromProjectId = "unrelated-source";
      project.restoredFromProjectIds = ["unrelated-source"];
      project.duplicationTargetProjectId = "not-the-incoming-project";
      project.duplicatedFromProjectIds = ["unrelated-source"];
    }],
    ["damaged supply snapshot", (project) => { project.priceRuns[0].supplyDemandInput.annualSummary[0].load += 1; }],
    ["incomplete prices", (project) => { project.priceRuns[0].pricesByYear[YEAR].pop(); }],
    ["nonpublishable price", (project) => { project.priceRuns[0].status = "validated"; }],
    ["invalid run parameters", (project) => {
      project.priceRuns[0].trainStart = 2020;
      project.priceRuns[0].trainEnd = 2019;
    }],
    ["missing active price", (project) => { project.activeRunId = "missing-price"; }]
  ]) {
    const damaged = clone(original);
    mutate(damaged);
    const rawPriceRuns = JSON.stringify(damaged.priceRuns);
    const rejected = restore(damaged, [first], "bad-restore-copy");
    assert.equal(rejected.activeRunId, null, `${label}: repeat restore must not activate an invalid or unrelated run`);
    assert.equal(sandbox.hasActiveActivatableRun(rejected), false);
    assert.equal(JSON.stringify(rejected.priceRuns), rawPriceRuns, `${label}: preserve the quarantined historical record`);
  }
  console.log("project backup active supply restore tests passed");
}

run().catch((error) => { console.error(error); process.exit(1); });
