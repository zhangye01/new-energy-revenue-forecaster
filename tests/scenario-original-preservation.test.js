"use strict";

const assert = require("node:assert/strict");
const model = require("../src/domain/scenario-model");
const configApi = require("../src/domain/scenario-config");
const form = require("../src/ui/scenario-form");
const rules = require("../src/domain/revenue-rules");
const { applyCreateProjectInput } = require("../src/domain/project-model");
const clone = (value) => JSON.parse(JSON.stringify(value));
const frozenTime = "2026-10-19T00:00:00.000Z";
const project = { id: "preservation-project", startYear: 2026, forecastYears: 2,
  siteType: "offshore", hasStorage: false, statuses: {} };
const envRow = () => ({ greenCertPrice: 20.123456789012345, greenCertRealizeRatio: 0.5,
  greenPremiumPrice: 10, greenPremiumRealizeRatio: 0.25,
  carbonEnabled: false, carbonPrice: 4, carbonRealizeRatio: 0.25 });
const feeRow = () => ({ marketOpFee: 6, gridAssessFee: 7, ancillaryFee: 14, otherFee: 3.125, otherIncome: 2 });
const annualKeys = ["ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"];
const scalarIds = ["scenario-name", "mechanism-enabled", "mechanism-ratio", "mechanism-price", "mechanism-start-ym",
  "mechanism-duration-months", "mechanism-end-ym", "mechanism-reference-mode", "same-type-spread", "lt-pricing-mode", "lt-year1-pnl",
  "lt-target-pnl", "lt-converge-speed", "env-value-mode", "green-cert-price", "green-cert-realize-ratio",
  "green-premium-price", "green-premium-realize-ratio",
  "fee-config-mode", "market-op-fee", "grid-assess-fee", "ancillary-fee", "other-net-income"];
const refIds = { ltPricingMode: "lt-pricing-mode", envValueMode: "env-value-mode", feeConfigMode: "fee-config-mode" };

// This harness mirrors actual DOM lookup: selectors for tables / unknown metadata
// return null, and refs point to the same input objects as querySelector.
function loadForm(targetProject, scenario) {
  const fields = new Map(scalarIds.map((id) => [`#${id}`, { value: "" }]));
  const querySelector = (selector) => fields.get(selector) || null;
  const refs = Object.fromEntries(Object.entries(refIds).map(([key, id]) => [key, querySelector(`#${id}`)]));
  form.loadScenarioToForm({ scenario, project: targetProject, refs, querySelector, modes: {
    ltPricingMode: scenario.config.ltPricingMode, envValueMode: scenario.config.envValueMode,
    feeConfigMode: scenario.config.feeConfigMode
  } });
  const options = { project: targetProject, scenario, refs, querySelector, scenarioConfig: configApi,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    readEnvValueAllocationDraft: () => {
      const greenCertRatio = Number(querySelector("#green-cert-realize-ratio").value) / 100;
      const greenPremiumRatio = Number(querySelector("#green-premium-realize-ratio").value) / 100;
      return { greenCertRatio, greenPremiumRatio, totalRatio: greenCertRatio + greenPremiumRatio };
    }
  };
  return { fields, refs, options, draft: () => form.buildScenarioSaveDraft(options) };
}

function manualScenario(targetProject = project) {
  const scenario = model.createBaselineScenario(targetProject, { nowIso: frozenTime });
  Object.assign(scenario.config, { mechanismEnabled: false, mechanismPrice: 371.1234567890123,
    mechanismRatio: 0.3655123456789, sameTypeSpread: -9.7654321098765,
    storageArbitragePrice: 18.123456789012345, storageCapacityCompPrice: 7,
    storageAncillaryRevenuePrice: 10, storageOtherRevenuePrice: 3,
    ltPricingMode: "manual", ltManualPricesByYear: { 2025: -8.125, 2026: 0, 2027: 6.123456789012345, 2028: 4 },
    envValueMode: "manual", envManualValuesByYear: Object.fromEntries([2025, 2026, 2027, 2028].map((year) => [year, envRow()])),
    feeConfigMode: "manual", feeManualValuesByYear: Object.fromEntries([2025, 2026, 2027, 2028].map((year) => [year, feeRow()])) });
  return scenario;
}

// Hydration and review preserve exact raw values and original confirmation evidence,
// even when historical values are invalid or no longer applicable.
const corruptHistory = manualScenario();
Object.assign(corruptHistory.config, { mechanismPrice: null, mechanismRatio: 1.2, greenCertPrice: "invalid",
  ltManualPricesByYear: { 2025: 11, 2026: null, 2027: "invalid", 2028: -6.25 },
  envManualValuesByYear: { 2025: envRow(), 2026: { ...envRow(), greenCertPrice: null }, 2027: null, 2028: envRow() },
  feeManualValuesByYear: { 2025: feeRow(), 2026: { marketOpFee: -5 }, 2027: null, 2028: feeRow() } });
corruptHistory.confirmedConfig = clone(corruptHistory.config);
corruptHistory.confirmedConfigSources = Object.fromEntries(Object.keys(corruptHistory.config).map((key) => [key, "explicit"]));
const historyProject = { ...clone(project), roughPrice: { snapshots: [{ id: "old-rough", scenarioId: corruptHistory.id,
  config: clone(corruptHistory.config), summary: { weightedPrice: 312.123456789 } }] } };
const originalHistory = JSON.stringify({ project: historyProject, scenario: corruptHistory });
const hydratedHistory = model.sanitizeScenario(historyProject, corruptHistory);
assert.deepEqual(hydratedHistory.config, corruptHistory.config);
assert.deepEqual(hydratedHistory.confirmationEvidence, {
  confirmedConfig: corruptHistory.confirmedConfig, confirmedConfigSources: corruptHistory.confirmedConfigSources
});
for (const key of annualKeys) assert.equal(model.isConfigConfirmed(hydratedHistory, key), false, `${key} is invalid and cannot remain confirmed`);
assert.equal(model.isConfigConfirmed(hydratedHistory, "mechanismPrice"), false);
assert.equal(model.isConfigConfirmed(hydratedHistory, "storageArbitragePrice"), false);
assert.equal(JSON.stringify({ project: historyProject, scenario: corruptHistory }), originalHistory);
const evidenceBefore = JSON.stringify(hydratedHistory.confirmationEvidence);
const twiceHydrated = model.sanitizeScenario(historyProject, hydratedHistory);
assert.equal(JSON.stringify(twiceHydrated.confirmationEvidence), evidenceBefore, "repeated hydration cannot overwrite original evidence");
assert.deepEqual(twiceHydrated.config, corruptHistory.config);

// Known legacy annual confirmations become pending, then explicit review persists;
// shortening / extending the horizon never clips stored years or fills missing ones.
const historical = manualScenario();
historical.confirmedConfig = clone(historical.config); // Historic sources are unknown.
const historyOriginal = JSON.stringify(historical);
const pending = model.sanitizeScenario(project, historical);
const configBeforeReview = JSON.stringify(pending.config);
for (const key of annualKeys) assert.equal(model.isConfigConfirmed(pending, key), false);
const reviewProject = { ...clone(project), roughPrice: { snapshots: [{ id: "rough-review", scenarioId: pending.id, config: clone(pending.config) }] } };
const roughBeforeReview = JSON.stringify(reviewProject.roughPrice);
const review = loadForm(reviewProject, pending);
const reviewDraft = review.draft();
assert.equal(reviewDraft.ok, true, reviewDraft.message);
assert.equal(JSON.stringify(reviewDraft.config), configBeforeReview);
assert.equal(form.applyScenarioSaveDraft({ project: reviewProject, scenario: pending, draft: reviewDraft, nowIso: () => frozenTime }).ok, true);
assert.equal(JSON.stringify(pending.config), configBeforeReview);
assert.equal(JSON.stringify(reviewProject.roughPrice), roughBeforeReview);
assert.equal(JSON.stringify(historical), historyOriginal, "review must not rewrite the input backup object");
for (const key of annualKeys) assert.equal(model.isConfigConfirmed(pending, key), true);
for (const key of ["mechanismPrice", "mechanismRatio", "sameTypeSpread", "storageArbitragePrice", "greenCertPrice", "carbonPrice", "otherFee"]) {
  assert.equal(model.isConfigConfirmed(pending, key), false, `${key} was inapplicable during this review`);
}
const horizonProject = { ...reviewProject, scenarios: [pending] };
applyCreateProjectInput(horizonProject, { ...horizonProject, forecastYears: 1 });
const shortened = model.sanitizeScenario(horizonProject, pending);
horizonProject.scenarios = [shortened];
const shortDraft = loadForm(horizonProject, shortened).draft();
assert.equal(shortDraft.ok, true, shortDraft.message);
form.applyScenarioSaveDraft({ project: horizonProject, scenario: shortened, draft: shortDraft, nowIso: () => frozenTime });
applyCreateProjectInput(horizonProject, { ...horizonProject, forecastYears: 3 });
const expanded = model.sanitizeScenario(horizonProject, shortened);
assert.equal(JSON.stringify(expanded.config), configBeforeReview, "2027 and 2028 survive a save with a one-year horizon");
for (const key of annualKeys) {
  assert.equal(model.isConfigConfirmed(expanded, key), false, "newly visible years require review even when stored values exist");
  assert.equal(form.buildRefinementState({ project: horizonProject, scenario: expanded }).fields[key], "pending");
}
const expandedDraft = loadForm(horizonProject, expanded).draft();
assert.equal(expandedDraft.ok, true, expandedDraft.message);
form.applyScenarioSaveDraft({ project: horizonProject, scenario: expanded, draft: expandedDraft, nowIso: () => frozenTime });
horizonProject.scenarios = [expanded];
applyCreateProjectInput(horizonProject, { ...horizonProject, forecastYears: 4 });
const beyondStored = model.sanitizeScenario(horizonProject, expanded);
for (const key of annualKeys) {
  assert.equal(model.isConfigConfirmed(beyondStored, key), false, "the new 2029 year requires input");
  assert.equal(Object.hasOwn(beyondStored.config[key], 2029), false, "missing years must not be fabricated");
}
assert.equal(JSON.stringify(reviewProject.roughPrice), roughBeforeReview);

const datedScenario = model.createBaselineScenario(project, { nowIso: frozenTime });
Object.assign(datedScenario.config, { mechanismEnabled: true, mechanismStartYm: "2026-03", mechanismEndYm: "2027-08" });
model.confirmConfig(datedScenario, ["mechanismStartYm", "mechanismEndYm"], { project });
const datedSource = JSON.stringify(datedScenario.config);
const datedForm = loadForm(reviewProject, datedScenario);
assert.equal(datedForm.fields.get("#mechanism-duration-months").value, 18);
assert.equal(datedForm.draft().config.mechanismEndYm, "2027-08");
datedForm.fields.get("#mechanism-start-ym").value = "2026-10";
const movedTerm = datedForm.draft();
assert.equal(movedTerm.ok, true, movedTerm.message);
assert.equal(movedTerm.config.mechanismEndYm, "2028-03", "changing the start moves the readonly endpoint even when period length is unchanged");
assert.equal(JSON.stringify(datedScenario.config), datedSource, "editing the form cannot rewrite persisted dates before saving");
assert.equal(form.applyScenarioSaveDraft({ project: reviewProject, scenario: datedScenario, draft: movedTerm, nowIso: () => frozenTime }).ok, true);
assert.equal(datedScenario.config.mechanismStartYm, "2026-10");
assert.equal(datedScenario.confirmedConfig.mechanismEndYm, "2028-03");
assert.equal(JSON.stringify(reviewProject.roughPrice), roughBeforeReview, "saving a revised term leaves the historical rough snapshot intact");

// A newly saved confirmation may not yet have passed through hydration. Expanding
// the project must retain that original evidence before making annual inputs pending.
const freshConfirmation = manualScenario();
model.confirmConfig(freshConfirmation, undefined, { project });
assert.equal(freshConfirmation.confirmationEvidence, undefined);
const freshEvidence = { confirmedConfig: clone(freshConfirmation.confirmedConfig),
  confirmedConfigSources: clone(freshConfirmation.confirmedConfigSources) };
const freshProject = { ...clone(project), scenarios: [freshConfirmation], roughPrice: clone(reviewProject.roughPrice) };
const freshOriginalConfig = clone(freshConfirmation.config);
applyCreateProjectInput(freshProject, { ...freshProject, forecastYears: 3 });
assert.deepEqual(freshConfirmation.config, freshOriginalConfig);
assert.deepEqual(freshConfirmation.confirmationEvidence, freshEvidence);
for (const key of annualKeys) assert.equal(model.isConfigConfirmed(freshConfirmation, key), false);
assert.equal(JSON.stringify(freshProject.roughPrice), roughBeforeReview);

// Partial / null annual entries fail before saving. Explicit zero is valid, and
// inactive carbon values may be null because they have zero effective contribution.
const invalidAnnualCases = [
  ["ltManualPricesByYear", null, null], ["ltManualPricesByYear", null, ""],
  ["ltManualPricesByYear", null, "invalid"], ["envManualValuesByYear", null, null],
  ["feeManualValuesByYear", null, null]
];
for (const field of ["greenCertPrice", "greenCertRealizeRatio", "greenPremiumPrice", "greenPremiumRealizeRatio"]) {
  for (const value of [null, undefined]) invalidAnnualCases.push(["envManualValuesByYear", field, value]);
}
for (const field of ["marketOpFee", "gridAssessFee", "ancillaryFee", "otherFee", "otherIncome"]) {
  for (const value of [null, undefined]) invalidAnnualCases.push(["feeManualValuesByYear", field, value]);
}
invalidAnnualCases.push(["feeManualValuesByYear", "otherFee", -1], ["envManualValuesByYear", "greenCertRealizeRatio", 1.2]);
for (const [key, field, value] of invalidAnnualCases) {
  const scenario = manualScenario();
  if (field === null) scenario.config[key][2026] = value;
  else if (value === undefined) delete scenario.config[key][2026][field];
  else scenario.config[key][2026][field] = value;
  const before = JSON.stringify(scenario);
  const draft = loadForm(project, scenario).draft();
  assert.equal(draft.ok, false, `${key}.${field}=${String(value)} must be rejected`);
  assert.match(draft.message, /不完整/);
  assert.equal(form.applyScenarioSaveDraft({ project, scenario, draft }).ok, false);
  assert.equal(JSON.stringify(scenario), before, "failed validation cannot write defaults or confirmation");
}
const inactiveNull = manualScenario();
inactiveNull.config.envManualValuesByYear[2026].carbonPrice = null;
delete inactiveNull.config.envManualValuesByYear[2026].carbonRealizeRatio;
assert.equal(loadForm(project, inactiveNull).draft().ok, true);
assert.equal(rules.getEnvValueAllocation(project, inactiveNull.config, 2026).carbonPrice, undefined);
assert.equal(inactiveNull.config.envManualValuesByYear[2026].carbonPrice, null);
assert.equal(Object.hasOwn(inactiveNull.config.envManualValuesByYear[2026], "carbonRealizeRatio"), false);

// Switching modes excludes previous inactive confirmations immediately. Returning
// to those modes shows pending original values until a new explicit review.
const modeScenario = manualScenario();
Object.assign(modeScenario.config, { ltPricingMode: "auto", envValueMode: "global", feeConfigMode: "global" });
model.confirmConfig(modeScenario, undefined, { project });
const originalModeConfig = clone(modeScenario.config);
const originalModeEvidence = clone(modeScenario.confirmedConfig);
const switchUi = loadForm(project, modeScenario);
for (const ref of ["ltPricingMode", "envValueMode", "feeConfigMode"]) switchUi.refs[ref].value = "manual";
const manualDraft = switchUi.draft();
assert.equal(manualDraft.ok, true, manualDraft.message);
form.applyScenarioSaveDraft({ project, scenario: modeScenario, draft: manualDraft, nowIso: () => frozenTime });
for (const key of ["ltYear1Pnl", "greenCertPrice", "otherNetIncome"]) {
  assert.equal(modeScenario.config[key], originalModeConfig[key]);
  assert.equal(model.isConfigConfirmed(modeScenario, key), false);
}
assert.deepEqual(modeScenario.confirmationEvidence.confirmedConfig, originalModeEvidence);
const globalAgain = { ...modeScenario.config, ltPricingMode: "auto", envValueMode: "global", feeConfigMode: "global" };
const nextState = form.buildRefinementState({ project, scenario: modeScenario, config: globalAgain });
for (const key of ["ltYear1Pnl", "greenCertPrice", "otherNetIncome"]) assert.equal(nextState.fields[key], "pending");
model.confirmConfig(modeScenario, Object.keys(modeScenario.config), { project });
assert.equal(model.isConfigConfirmed(modeScenario, "otherNetIncome"), false, "direct confirmation also filters current applicability");

// Global disabled / onshore carbon and absent storage retain original hidden
// values through the actual load, lock, save, and hydration pipeline.
for (const siteType of ["onshore", "offshore"]) {
  const hiddenProject = { ...clone(project), siteType };
  const hiddenScenario = model.createBaselineScenario(hiddenProject);
  Object.assign(hiddenScenario.config, { carbonEnabled: false, carbonPrice: 4, carbonRealizeRatio: 0.25,
    greenCertRealizeRatio: 0.5, storageArbitragePrice: 18.123456789012345, mechanismEnabled: false,
    mechanismPrice: null, sameTypeSpread: -2.123456789012345 });
  const before = clone(hiddenScenario.config);
  const hiddenUi = loadForm(hiddenProject, hiddenScenario);
  form.applyScenarioFieldLocks(hiddenUi.options);
  form.applyEnvValueControlState(hiddenUi.options);
  const draft = hiddenUi.draft();
  assert.equal(draft.ok, true, draft.message);
  form.applyScenarioSaveDraft({ project: hiddenProject, scenario: hiddenScenario, draft, nowIso: () => frozenTime });
  assert.deepEqual(hiddenScenario.config, before);
  const restored = model.sanitizeScenario(hiddenProject, hiddenScenario);
  assert.deepEqual(restored.config, before);
  for (const key of ["carbonPrice", "carbonRealizeRatio", "storageArbitragePrice", "mechanismPrice"]) {
    assert.equal(model.isConfigConfirmed(restored, key), false);
  }
  const allocation = rules.getEnvValueAllocation(hiddenProject, restored.config);
  assert.equal(allocation.carbonPrice, undefined);
  assert.equal(allocation.carbonRatio, undefined);
}

for (const field of ["#green-cert-price", "#other-net-income", "#lt-year1-pnl"]) {
  const target = model.createBaselineScenario(project);
  const ui = loadForm(project, target);
  const before = JSON.stringify(target);
  for (const invalid of [null, "", "bad"]) {
    ui.fields.get(field).value = invalid;
    const draft = ui.draft();
    assert.equal(draft.ok, false, `${field} cannot become a confirmed zero`);
    assert.match(draft.message, /有效数字/);
    assert.equal(JSON.stringify(target), before);
  }
}

// A missing choice is not the same as an explicit "no" or default mode. The
// customer must choose it; only that deliberate change may replace the raw value.
for (const [key, selector, explicitChoice, expected] of [
  ["mechanismEnabled", "#mechanism-enabled", "no", false],
  ["ltPricingMode", "#lt-pricing-mode", "auto", "auto"],
  ["envValueMode", "#env-value-mode", "global", "global"],
  ["feeConfigMode", "#fee-config-mode", "global", "global"]
]) {
  for (const invalid of [null, "bad"]) {
    const target = model.createBaselineScenario(project);
    target.config[key] = invalid;
    const original = JSON.stringify(target);
    const ui = loadForm(project, target);
    const draft = ui.draft();
    assert.equal(draft.ok, false, `${key}=${String(invalid)} must not be confirmed as an implied choice`);
    assert.match(draft.message, /选择|无效|不能为空/);
    assert.equal(JSON.stringify(target), original);
    ui.fields.get(selector).value = explicitChoice;
    const fixed = ui.draft();
    assert.equal(fixed.ok, true, fixed.message);
    assert.equal(fixed.config[key], expected, "explicit input replaces only the reviewed invalid choice");
    form.applyScenarioSaveDraft({ project, scenario: target, draft: fixed, nowIso: () => frozenTime });
    assert.equal(model.isConfigConfirmed(target, key), true);
  }
}

// Legacy ratio interpretation is calculation-only; values and units survive a
// reload/save. Independent expected sequence: |8 - 2| × 0.5 = 3 per year.
const legacy = model.createBaselineScenario(project);
delete legacy.config.ltConvergeSpeedUnit;
legacy.config.ltConvergeSpeed = 0.5;
const legacyLoaded = model.sanitizeScenario(project, legacy);
assert.equal(legacyLoaded.config.ltConvergeSpeed, 0.5);
assert.equal(legacyLoaded.config.ltConvergeSpeedUnit, "legacy_ratio");
assert.deepEqual([1, 2, 3].map((index) => rules.ltPnlPriceForYear(legacyLoaded.config, index)), [8, 5, 2]);
const legacyDraft = loadForm(project, legacyLoaded).draft();
assert.equal(legacyDraft.ok, true, legacyDraft.message);
form.applyScenarioSaveDraft({ project, scenario: legacyLoaded, draft: legacyDraft, nowIso: () => frozenTime });
assert.equal(legacyLoaded.config.ltConvergeSpeed, 0.5);
assert.equal(legacyLoaded.config.ltConvergeSpeedUnit, "legacy_ratio");
assert.deepEqual([1, 2, 3].map((index) => rules.ltPnlPriceForYear(legacyLoaded.config, index)), [8, 5, 2]);

// Synthetic G01/G03 constants, independent of handoff assets: review then a
// one-year fee edit affects only 2027 baseline income and its comparison.
const roughApi = require("../src/domain/rough-price");
const calculator = require("../src/domain/revenue-calculator");
const { validateCalculationReadiness } = require("../src/domain/result-calculation");
const readinessProject = { ...project, energyData: {
  hourlyByYear: { 2026: Array(8760).fill(0.25), 2027: Array(8760).fill(0.25) }
} };
const readinessFor = (scenario) => validateCalculationReadiness({ project: readinessProject, scenario, run: { id: "ready-run" },
  scenarioConfirmed: true, scenarioConfig: configApi, validateConfig: roughApi.validateConfig });

// Manual strategies do not consume the old auto convergence ratio. Preserving an
// invalid inactive value must not block a complete current annual table.
const inactiveLegacyRatio = manualScenario();
inactiveLegacyRatio.config.ltConvergeSpeedUnit = "legacy_ratio";
inactiveLegacyRatio.config.ltConvergeSpeed = 2;
const inactiveLegacyBefore = JSON.stringify(inactiveLegacyRatio.config);
assert.deepEqual(roughApi.validateConfig(project, inactiveLegacyRatio.config), []);
assert.equal(readinessFor(inactiveLegacyRatio).ok, true);
assert.equal(loadForm(project, inactiveLegacyRatio).draft().ok, true);
assert.equal(JSON.stringify(inactiveLegacyRatio.config), inactiveLegacyBefore);
const activeLegacyRatio = clone(inactiveLegacyRatio);
activeLegacyRatio.config.ltPricingMode = "auto";
assert.equal(readinessFor(activeLegacyRatio).ok, false);
assert.ok(roughApi.validateConfig(project, activeLegacyRatio.config).some((message) => /历史收敛比例/.test(message)));
assert.equal(activeLegacyRatio.config.ltConvergeSpeed, 2);

// An explicitly empty active reference choice is incomplete, while a genuinely
// absent legacy field retains the documented compatibility default.
for (const blank of [null, "", " "]) {
  const nullReference = model.createBaselineScenario(project);
  nullReference.config.mechanismReferenceMode = blank;
  const original = JSON.stringify(nullReference.config);
  const errors = roughApi.validateConfig(project, nullReference.config);
  assert.ok(errors.some((message) => /机制补差参照口径/.test(message)));
  assert.equal(readinessFor(nullReference).ok, false);
  assert.equal(loadForm(project, nullReference).draft().ok, false);
  assert.equal(JSON.stringify(nullReference.config), original);
  nullReference.config.mechanismEnabled = false;
  assert.equal(readinessFor(nullReference).ok, true, "disabled mechanism does not require the reference choice");
  assert.equal(nullReference.config.mechanismReferenceMode, blank);
}
const absentLegacyReference = model.createBaselineScenario(project);
delete absentLegacyReference.config.mechanismReferenceMode;
assert.equal(readinessFor(absentLegacyReference).ok, true);
assert.equal(Object.hasOwn(absentLegacyReference.config, "mechanismReferenceMode"), false);

const targetProject = { id: "year-isolation", name: "Synthetic project", province: "jiangsu", assetType: "wind",
  capacityMw: 10, siteType: "offshore", startYear: 2026, forecastYears: 2, hasStorage: true,
  storagePowerMw: 2, storageDurationH: 2, energyData: { mode: "hourly_8760",
    hourlyByYear: { 2026: Array(8760).fill(2000 / 8760), 2027: Array(8760).fill(2100 / 8760) } } };
const target = model.createBaselineScenario(targetProject);
Object.assign(target.config, { mechanismRatio: 0.4, mechanismPrice: 350, mechanismStartYm: "2026-01", mechanismEndYm: "2026-12",
  ltYear1Pnl: 8, ltTargetPnl: 2, ltConvergeSpeed: 3, greenCertPrice: 20, greenCertRealizeRatio: 0.5,
  greenPremiumPrice: 10, greenPremiumRealizeRatio: 0.25, carbonEnabled: true, carbonPrice: 4, carbonRealizeRatio: 0.25,
  marketOpFee: 6, gridAssessFee: 7, ancillaryFee: 14, otherFee: 3, otherIncome: 2,
  storageArbitragePrice: 18, storageCapacityCompPrice: 7, storageAncillaryRevenuePrice: 10, storageOtherRevenuePrice: 3 });
const run = { id: "synthetic-flat", status: "publishable", pricesByYear: { 2026: Array(8760).fill(300), 2027: Array(8760).fill(310) } };
const roughOutput = roughApi.calculateRough(targetProject, target, {
  spotNodes: [{ year: 2026, value: 300 }, { year: 2027, value: 310 }], captureRate: 95
}, { id: "rough-before-refinement", createdAt: frozenTime });
assert.equal(roughOutput.ok, true, roughOutput.errors?.join("; "));
const resultFor = () => roughApi.stampBaselineResult(targetProject, target, run,
  calculator.calculateScenarioResult(targetProject, target, run));
target.config.feeConfigMode = "manual";
target.config.feeManualValuesByYear = Object.fromEntries([2026, 2027].map((year) => [year,
  { marketOpFee: 6, gridAssessFee: 7, ancillaryFee: 14, otherFee: 3, otherIncome: 2 }]));
targetProject.roughPrice = { snapshots: [clone(roughOutput.snapshot)] };
const snapshotBefore = JSON.stringify(targetProject.roughPrice);
const originalValues = JSON.stringify(target.config);
const initialDraft = loadForm(targetProject, target).draft();
assert.equal(initialDraft.ok, true, initialDraft.message);
form.applyScenarioSaveDraft({ project: targetProject, scenario: target, draft: initialDraft, nowIso: () => frozenTime });
assert.deepEqual(target.config, JSON.parse(originalValues), "refinement confirmation leaves every previously stored value intact");
assert.equal(JSON.stringify(targetProject.roughPrice), snapshotBefore);
const beforeResult = resultFor();
target.config.feeManualValuesByYear[2027].otherFee = 13;
assert.equal(model.isConfigConfirmed(target, "feeManualValuesByYear"), false);
const editedDraft = loadForm(targetProject, target).draft();
assert.equal(editedDraft.ok, true, editedDraft.message);
form.applyScenarioSaveDraft({ project: targetProject, scenario: target, draft: editedDraft, nowIso: () => frozenTime });
const afterResult = resultFor();
assert.deepEqual(afterResult.annualRows[0], beforeResult.annualRows[0]);
assert.ok(Math.abs(afterResult.annualRows[1].fullRevenue - beforeResult.annualRows[1].fullRevenue + 210000) < 0.0001);
assert.ok(Math.abs(afterResult.annualRows[1].fullRevenuePrice - 289.5) < 0.0001,
  "flat positive prices produce no dispatch arbitrage or manually entered storage revenue");
const comparison = roughApi.compareBaselineResult(targetProject, target, targetProject.roughPrice.snapshots[0], afterResult);
assert.ok(Math.abs(comparison.summary.delta - (-30.79268292683)) < 0.0001);
assert.equal(JSON.stringify(targetProject.roughPrice), snapshotBefore);

console.log("scenario original-value preservation tests passed");
