"use strict";

const assert = require("node:assert/strict");
const rough = require("../src/domain/rough-price");
const { defaultScenarioConfig } = require("../src/domain/scenario-model");
const { calculateScenarioResult } = require("../src/domain/revenue-calculator");

const copy = (value) => JSON.parse(JSON.stringify(value));
const project = {
  id: "fp-project-01", province: "jiangsu", assetType: "wind",
  siteType: "offshore", capacityMw: 100, hasStorage: true,
  storagePowerMw: 20, storageDurationH: 2, startYear: 2026, forecastYears: 1,
  activeRunId: "run-source-v2",
  energyData: {
    annualInputByYear: { 2026: 876 },
    annualSummary: { 2026: { annualHours: 876, energyMwh: 87600 } },
    hourlyByYear: { 2026: Array(8760).fill(0.1) },
    typicalCurveProfile: Array(8760).fill(1),
    typicalCurveSource: "fingerprint-fixture"
  }
};
const vectorScenario = {
  id: "fp-scenario-01",
  config: {
    mechanismReferenceMode: "project_capture", sameTypeSpread: 0,
    ltManualPricesByYear: { 2026: 8 },
    envManualValuesByYear: { 2026: {
      greenCertPrice: 18, greenCertRealizeRatio: 1,
      greenPremiumPrice: 12, greenPremiumRealizeRatio: 0,
      carbonEnabled: false, carbonPrice: 4, carbonRealizeRatio: 0
    } },
    feeManualValuesByYear: { 2026: {
      marketOpFee: 6, gridAssessFee: 8, ancillaryFee: 16,
      otherFee: 3, otherIncome: 2
    } }
  }
};
const vectorBefore = JSON.stringify({ project, vectorScenario });
assert.equal(rough.contextFingerprint(project, vectorScenario), "rough-v1-15f54f7e-7b7bd624-105917",
  "the published legacy vector remains stable even if current hydration changes");
assert.equal(rough.contextFingerprint({ ...project, storagePowerMw: 10 }, vectorScenario), rough.contextFingerprint(project, vectorScenario),
  "the legacy omission is documented, not silently changed");
assert.notEqual(rough.currentContextFingerprint({ ...project, storagePowerMw: 10 }, vectorScenario), rough.currentContextFingerprint(project, vectorScenario));
assert.notEqual(rough.currentContextFingerprint({ ...project, storageDurationH: 4 }, vectorScenario), rough.currentContextFingerprint(project, vectorScenario));
assert.equal(JSON.stringify({ project, vectorScenario }), vectorBefore, "fingerprinting is read only");

const scenario = { id: vectorScenario.id, name: "来源版本验证", config: {
  ...defaultScenarioConfig(project),
  envValueMode: "manual", envManualValuesByYear: copy(vectorScenario.config.envManualValuesByYear)
} };
const draft = { spotNodes: [{ year: 2026, value: 300 }], captureRate: 95, sourceNote: "source version fixture" };
const run = { id: project.activeRunId, pricesByYear: { 2026: Array(8760).fill(310) } };
const output = rough.calculateRough(project, scenario, draft, { id: "source-v2-rough", createdAt: "2026-10-19T00:00:00Z" });
assert.equal(output.ok, true, output.errors.join(";"));
const snapshot = output.snapshot;
const result = rough.stampBaselineResult(project, scenario, run, calculateScenarioResult(project, scenario, run));
assert.equal(snapshot.sourceContext.version, 2);
assert.equal(result.sourceContext.version, 2);
assert.equal(snapshot.sourceContext.fingerprintVersion, "rough-v2");
assert.match(snapshot.contextFingerprint, /^rough-v2-/);
assert.deepEqual(snapshot.sourceContext.storageContext, { hasStorage: true, storagePowerMw: 20, storageDurationH: 2 });
assert.equal(result.sourceContext.contextFingerprint, snapshot.contextFingerprint);
assert.equal(snapshot.config.envManualValuesByYear[2026].carbonPrice, 4);
assert.equal(snapshot.calculationConfig.envManualValuesByYear[2026].carbonPrice, 0);
assert.notEqual(snapshot.config, scenario.config);
assert.notEqual(snapshot.calculationConfig, snapshot.config);
assert.equal(rough.baselineResultState(project, scenario, result).current, true);
assert.equal(rough.compareBaselineResult(project, scenario, snapshot, result).ok, true);
const displayedSource = rough.compareBaselineResult(project, scenario, snapshot, result).source;
displayedSource.storageContext.storagePowerMw = 1;
assert.equal(result.sourceContext.storageContext.storagePowerMw, 20,
  "nested display metadata must not expose a mutable reference to the saved result");

const allBefore = JSON.stringify({ project, scenario, snapshot, result });
for (const changed of [{ storagePowerMw: 10 }, { storageDurationH: 4 }, { storagePowerMw: 0 }, { storageDurationH: null }]) {
  const next = { ...project, ...changed };
  assert.equal(rough.snapshotState(next, scenario, snapshot).comparable, false, JSON.stringify(changed));
  assert.equal(rough.baselineResultState(next, scenario, result).current, false, JSON.stringify(changed));
  assert.equal(rough.compareBaselineResult(next, scenario, snapshot, result).ok, false, JSON.stringify(changed));
}
for (const storagePowerMw of [0, null, undefined, -1, "20", Infinity]) {
  assert.equal(rough.calculateRough({ ...project, storagePowerMw }, scenario, draft).ok, false,
    "an enabled storage project cannot hide invalid dimensions");
}
for (const storageDurationH of [0, null, undefined, -1, "2", Infinity]) {
  assert.equal(rough.calculateRough({ ...project, storageDurationH }, scenario, draft).ok, false);
}
const refinedScenario = { ...scenario, config: { ...scenario.config, otherFee: scenario.config.otherFee + 5 } };
const refinedResult = rough.stampBaselineResult(project, refinedScenario, run, calculateScenarioResult(project, refinedScenario, run));
assert.equal(rough.snapshotState(project, refinedScenario, snapshot).refined, true);
assert.equal(rough.compareBaselineResult(project, refinedScenario, snapshot, refinedResult).ok, true,
  "v2 compares the original snapshot config, not current refined values");
assert.equal(rough.compareBaselineResult({ ...project, activeRunId: "next-run" }, scenario, snapshot, result).ok, true,
  "only the run-change warning exception remains available");

const restored = { ...project, id: "restored-project", restoredFromProjectIds: [project.id] };
assert.equal(rough.snapshotState(restored, scenario, snapshot).comparable, true);
assert.equal(rough.snapshotState({ ...restored, restoredFromProjectIds: [] }, scenario, snapshot).comparable, false);
assert.equal(rough.snapshotState({ ...restored, storagePowerMw: 10 }, scenario, snapshot).comparable, false);
assert.equal(rough.snapshotState(restored, { ...scenario, id: "another-scenario" }, snapshot).comparable, false);
assert.equal(rough.baselineResultState(restored, scenario, result).current, false, "restored results still need recalculation");

// Historical objects deliberately have no new metadata. Reading never backfills it.
const legacySnapshot = copy(snapshot);
delete legacySnapshot.sourceContext;
delete legacySnapshot.calculationConfig;
legacySnapshot.contextFingerprint = rough.contextFingerprint(project, scenario);
const legacyResult = copy(result);
legacyResult.sourceContext = {
  version: 1, projectId: project.id, scenarioId: scenario.id, runId: run.id,
  contextFingerprint: rough.contextFingerprint(project, scenario), generatedAt: result.sourceContext.generatedAt
};
const legacyBefore = JSON.stringify({ legacySnapshot, legacyResult });
assert.equal(rough.snapshotState(project, scenario, legacySnapshot).reason, "legacy_storage_context");
assert.equal(rough.baselineResultState(project, scenario, legacyResult).reason, "legacy_storage_context");
assert.equal(rough.compareBaselineResult(project, scenario, legacySnapshot, result).ok, false);
assert.equal(rough.compareBaselineResult(project, scenario, snapshot, legacyResult).ok, false);
assert.equal(rough.compareSnapshot(project, scenario, legacySnapshot, run).ok, false);
const hydrated = rough.sanitizeWorkspace({ snapshots: [legacySnapshot] }, project).snapshots[0];
assert.deepEqual(hydrated, legacySnapshot, "legacy records remain viewable and byte-equivalent as JSON");
assert.equal(rough.snapshotState(restored, scenario, legacySnapshot).reason, "legacy_storage_context",
  "restoration does not manufacture missing storage evidence");
assert.equal(JSON.stringify({ legacySnapshot, legacyResult }), legacyBefore);

const noStorageProject = { ...project, hasStorage: false, storagePowerMw: null, storageDurationH: 0 };
const noStorageSnapshot = copy(legacySnapshot);
noStorageSnapshot.contextFingerprint = rough.contextFingerprint(noStorageProject, scenario);
const noStorageResult = copy(legacyResult);
noStorageResult.sourceContext.contextFingerprint = rough.contextFingerprint(noStorageProject, scenario);
assert.equal(rough.snapshotState(noStorageProject, scenario, noStorageSnapshot).comparable, true);
assert.equal(rough.baselineResultState(noStorageProject, scenario, noStorageResult).current, true);
assert.equal(rough.compareBaselineResult(noStorageProject, scenario, noStorageSnapshot, noStorageResult).ok, true,
  "legacy non-storage records keep the existing compatibility path");
const newNoStorage = rough.calculateRough(noStorageProject, scenario, draft);
assert.equal(newNoStorage.ok, true);
assert.deepEqual(newNoStorage.snapshot.sourceContext.storageContext,
  { hasStorage: false, storagePowerMw: null, storageDurationH: null });
assert.equal(rough.snapshotState({ ...noStorageProject, storagePowerMw: 0, storageDurationH: undefined }, scenario,
  newNoStorage.snapshot).comparable, true, "inactive dimensions do not become active inputs");

for (const change of [
  { version: 3 }, { fingerprintVersion: "unknown" }, { storageContext: null },
  { storageContext: { hasStorage: true, storagePowerMw: 0, storageDurationH: 2 } },
  { storageContext: { hasStorage: false, storagePowerMw: 20, storageDurationH: 2 } }
]) {
  const malformedSnapshot = { ...snapshot, sourceContext: { ...snapshot.sourceContext, ...change } };
  const malformedResult = { ...result, sourceContext: { ...result.sourceContext, ...change } };
  assert.equal(rough.snapshotState(project, scenario, malformedSnapshot).comparable, false);
  assert.equal(rough.baselineResultState(project, scenario, malformedResult).current, false);
}
assert.equal(JSON.stringify({ project, scenario, snapshot, result }), allBefore,
  "validation, refinement comparisons and restore checks do not rewrite stored inputs or records");
console.log("rough price source version tests passed");
