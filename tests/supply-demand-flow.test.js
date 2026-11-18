"use strict";
const assert = require("node:assert/strict");
const domain = require("../src/domain/supply-demand");
const forecast = require("../src/domain/price-forecast");
const flow = require("../src/ui/supply-demand-flow");
const copy = (value) => JSON.parse(JSON.stringify(value));
let project = { id: "p", province: "hebei", startYear: 2026, forecastYears: 2,
  activeRunId: "legacy", priceRuns: [{ id: "legacy", status: "publishable" }],
  roughPrice: { snapshots: [{ id: "rough", price: 314 }] },
  scenarios: [{ config: { fee: 14.75 } }], resultsByScenario: { s: { amount: 12345 } } };
const protectedValues = JSON.stringify([project.roughPrice, project.scenarios, project.resultsByScenario]);
let commit, dirty = false, invalidated = 0, persisted = 0;
const instance = flow.create({ documentRef: { querySelector: () => ({}) }, getProject: () => project,
  onInvalidate: () => { invalidated += 1; }, onPersist: () => { persisted += 1; },
  workspace: { createController: (input) => { commit = input.onCommit; return { render() {}, hasUnsavedChanges: () => dirty }; } } });
instance.render();
assert.equal(instance.reconcile(project), false, "legacy project stays usable before configuring supply");
assert.equal(instance.prepareSupplyDemand(project).ok, false);
const config = domain.createConfig(project);
for (const element of domain.ELEMENTS) {
  const series = config.elements[element.key];
  series.baseEnergyMwh = 0;
  series.growthRatesByYear[2027] = 0;
}
config.elements.load.baseEnergyMwh = 8760;
config.elements.load.monthlyWeights = [...domain.MONTH_DAYS];
Object.values(config.elements.load.hourlyWeightsByMonth).forEach((weights) => weights.fill(1));
assert.equal(commit(project, { version: 1, draft: config }, { generated: false }), true);
assert.equal(project.activeRunId, "legacy", "draft does not invalidate legacy run");
assert.equal(instance.hasPendingDraft(project), true);
assert.equal(instance.prepareSupplyDemand(project).ok, false);
assert.equal(commit(project, { version: 1, config }, { generated: true }), true);
assert.equal(project.activeRunId, null);
assert.equal(invalidated, 1);
assert.equal(project.priceRuns.length, 1);
assert.equal(JSON.stringify([project.roughPrice, project.scenarios, project.resultsByScenario]), protectedValues);
const prepared = instance.prepareSupplyDemand(project);
assert.equal(prepared.ok, true);
assert.equal(instance.prepareSupplyDemand(project).dataset, prepared.dataset, "cache avoids redundant hourly expansion");
const run = { id: "new", supplyDemandInput: forecast.snapshotSupplyDemandInput(project, { config, dataset: prepared.dataset }) };
project.priceRuns.unshift(run); project.activeRunId = run.id;
assert.equal(commit(project, copy(project.supplyDemand), { generated: true }), true);
assert.equal(project.activeRunId, run.id, "identical config save keeps active run");
dirty = true;
assert.equal(instance.hasUnsavedChanges(), true);
assert.equal(instance.prepareSupplyDemand(project).ok, false);
dirty = false;
const changed = copy(project.supplyDemand);
changed.draft = copy(changed.config); changed.draft.elements.load.baseEnergyMwh = 9000;
commit(project, changed, {});
assert.equal(project.activeRunId, run.id, "pending draft preserves current committed run");
assert.equal(instance.prepareSupplyDemand(project).ok, false);
delete changed.draft; commit(project, changed, {});
assert.equal(instance.prepareSupplyDemand(project).ok, true, "discard draft restores prediction availability");
const historicalRun = JSON.stringify(run);
changed.config.elements.load.baseEnergyMwh = 9000;
commit(project, changed, { generated: true });
assert.equal(project.activeRunId, null);
assert.equal(instance.validateSupplyDemandRun(project, run).ok, false);
assert.equal(JSON.stringify(run), historicalRun, "saved run snapshot must remain immutable");
const raw = copy(project), hydrated = { ...project, activeRunId: run.id };
instance.hydrate(hydrated, raw);
assert.equal(hydrated.activeRunId, null, "reload must not reactivate stale source");
assert.notEqual(hydrated.supplyDemand, raw.supplyDemand);
assert.deepEqual(hydrated.supplyDemand, raw.supplyDemand);
const current = project;
project = { ...project, id: "other" };
assert.equal(commit(current, changed, {}), false, "cross-project callback cannot write");
assert.ok(persisted > 0);
assert.equal(JSON.stringify([current.roughPrice, current.scenarios, current.resultsByScenario]), protectedValues);

// Hydration must demote a saved run whose compact provenance was damaged even
// when its raw-config fingerprint remains valid. Keep all historical evidence.
const roughPrice = require("../src/domain/rough-price");
const scenarioModel = require("../src/domain/scenario-model");
const sourceProject = { id: "source-review", province: "hebei", startYear: 2026, forecastYears: 2,
  capacityMw: 100, assetType: "wind", siteType: "onshore", hasStorage: false,
  energyData: { hourlyByYear: {}, annualSummary: {} }, supplyDemand: { version: 1, config: copy(config) },
  roughPrice: { snapshots: [{ id: "original-rough", price: 314.123456789 }] } };
const sourceScenario = { id: "baseline", config: { ...scenarioModel.defaultScenarioConfig(sourceProject), otherFee: 14.75 } };
sourceScenario.confirmedConfig = copy(sourceScenario.config);
sourceProject.scenarios = [sourceScenario];
sourceProject.activeScenarioId = sourceScenario.id;
const sourceRun = { id: "saved-source", status: "publishable", pricesByYear: { 2026: [0, -5.25, 300] },
  supplyDemandInput: forecast.snapshotSupplyDemandInput(sourceProject, {
    config: sourceProject.supplyDemand.config, dataset: domain.buildDataset(sourceProject, sourceProject.supplyDemand.config)
  }) };
sourceProject.priceRuns = [sourceRun]; sourceProject.activeRunId = sourceRun.id;
sourceProject.resultsByScenario = { baseline: roughPrice.stampBaselineResult(sourceProject, sourceScenario, sourceRun,
  { avgFullRevenuePrice: 400, annualRows: [{ year: 2026, energyMwh: 100, fullRevenuePrice: 400 }] }) };
assert.equal(roughPrice.baselineResultState(sourceProject, sourceScenario, sourceProject.resultsByScenario.baseline).current, true);
const sourceChanges = [
  ["unsupported version", (source) => { source.version = 2; }],
  ["wrong calendar", (source) => { source.calendar = "actual_366_days"; }],
  ["wrong hour count", (source) => { source.hoursPerYear = 8784; }],
  ["wrong energy unit", (source) => { source.units.energy = "kWh"; }],
  ["wrong model claim", (source) => { source.featureConsumption = "used_by_model"; }],
  ["altered annual total", (source) => { source.annualSummary[0].load += 1; }],
  ["missing summary year", (source) => { source.annualSummary.pop(); }]
];
for (const [label, mutate] of sourceChanges) {
  const damaged = copy(sourceProject);
  mutate(damaged.priceRuns[0].supplyDemandInput);
  const historicalBytes = JSON.stringify([damaged.roughPrice, damaged.scenarios, damaged.resultsByScenario, damaged.priceRuns, damaged.supplyDemand]);
  let invalidations = 0;
  const recovered = copy(damaged);
  const recoveryFlow = flow.create({ onInvalidate: () => { invalidations += 1; } });
  recoveryFlow.hydrate(recovered, damaged);
  assert.equal(recovered.activeRunId, null, `${label}: damaged source cannot remain active after reload`);
  assert.equal(invalidations, 1, `${label}: downstream state is invalidated once`);
  assert.equal(roughPrice.baselineResultState(recovered, recovered.scenarios[0], recovered.resultsByScenario.baseline).reason,
    "stale_run", `${label}: old saved baseline is no longer a current result`);
  assert.equal(JSON.stringify([recovered.roughPrice, recovered.scenarios, recovered.resultsByScenario, recovered.priceRuns, recovered.supplyDemand]),
    historicalBytes, `${label}: hydration must not repair or overwrite historical evidence`);
  recoveryFlow.reconcile(recovered);
  assert.equal(invalidations, 1, `${label}: repeated render does not repeatedly invalidate`);
}
const validReload = copy(sourceProject);
flow.create({}).hydrate(validReload, sourceProject);
assert.equal(validReload.activeRunId, sourceRun.id, "intact provenance remains active on reload");
assert.equal(roughPrice.baselineResultState(validReload, validReload.scenarios[0], validReload.resultsByScenario.baseline).current, true);
console.log("supply-demand-flow tests passed");
