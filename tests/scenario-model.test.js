"use strict";

const assert = require("node:assert/strict");
const {
  applyBatchParameter,
  applyProvinceDefaultsToScenario,
  confirmConfig,
  createBaselineScenario,
  defaultScenarioConfig,
  isConfigConfirmed,
  normalizeLtConvergeStep,
  normalizeScenarioMetadata,
  parseBatchValue,
  renameScenario,
  sanitizeScenario
} = require("../src/domain/scenario-model");

const provinceDefaults = {
  mechanismEnabled: true,
  mechanismRatio: 0.36,
  mechanismPrice: 365,
  greenCertPrice: 22,
  greenPremiumPrice: 12,
  marketOpFee: 6,
  gridAssessFee: 7,
  ancillaryFee: 14,
  otherFee: 3,
  storageArbitragePrice: 18,
  storageCapacityCompPrice: 7,
  storageAncillaryRevenuePrice: 10,
  storageOtherRevenuePrice: 4
};

const offshoreStorageProject = {
  startYear: 2026,
  forecastYears: 3,
  siteType: "offshore",
  hasStorage: true
};

const defaultConfig = defaultScenarioConfig(offshoreStorageProject, {
  provinceDefaults,
  currentYear: 2026
});
assert.equal(defaultConfig.mechanismStartYm, "2026-01");
assert.equal(defaultConfig.mechanismEndYm, "2028-12");
assert.equal(defaultConfig.carbonEnabled, true);
assert.equal(defaultConfig.storageArbitragePrice, 18);
assert.equal(defaultConfig.mechanismReferenceMode, "project_capture");
assert.equal(defaultConfig.sameTypeSpread, 0);

const fallbackConfig = defaultScenarioConfig({
  startYear: 2024,
  forecastYears: 30,
  siteType: "onshore",
  hasStorage: false
}, {
  provinceDefaults,
  currentYear: 2024
});
assert.equal(fallbackConfig.mechanismStartYm, "2026-01");
assert.equal(fallbackConfig.mechanismEndYm, "2029-12");
assert.equal(fallbackConfig.carbonEnabled, false);
assert.equal(fallbackConfig.storageCapacityCompPrice, 0);

assert.equal(normalizeLtConvergeStep(0.5, 8, 2, 2, false), 3);
assert.equal(normalizeLtConvergeStep(0.5, 8, 2, 2, true), 0.5);
assert.equal(normalizeLtConvergeStep(-1, 8, 2, 2, false), 2);

const sanitized = sanitizeScenario({
  startYear: 2026,
  forecastYears: 3,
  siteType: "onshore",
  hasStorage: false
}, {
  name: "  乐观场景  ",
  isBaseline: true,
  locked: true,
  config: {
    mechanismRatio: 1.2,
    mechanismPrice: "bad",
    ltPricingMode: "manual",
    ltManualPricesByYear: {
      2025: 99,
      2026: 8,
      2027: 6,
      2028: 2
    },
    ltYear1Pnl: 8,
    ltTargetPnl: 2,
    ltConvergeSpeed: 0.5,
    envValueMode: "bad",
    carbonEnabled: true,
    carbonPrice: 4,
    carbonRealizeRatio: 0.8,
    feeConfigMode: "manual",
    feeManualValuesByYear: {
      2026: { marketOpFee: 1 },
      2027: { marketOpFee: -1 },
      2028: { marketOpFee: 2 }
    },
    storageArbitragePrice: 99
  }
}, 1, {
  provinceDefaults,
  currentYear: 2026,
  nowIso: "2026-06-09T00:00:00.000Z",
  makeId: (prefix) => `${prefix}-test`
});

assert.equal(sanitized.id, "scn-test");
assert.equal(sanitized.name, "乐观场景");
assert.equal(sanitized.isBaseline, true);
assert.equal(sanitized.locked, true);
assert.equal(sanitized.updatedAt, "2026-06-09T00:00:00.000Z");
assert.equal(sanitized.config.mechanismRatio, 1);
assert.equal(sanitized.config.mechanismPrice, 365);
assert.equal(sanitized.config.ltPricingMode, "manual");
assert.deepEqual(sanitized.config.ltManualPricesByYear, { 2026: 8, 2027: 6, 2028: 2 });
assert.equal(sanitized.config.ltConvergeSpeed, 3);
assert.equal(sanitized.config.envValueMode, "global");
assert.equal(sanitized.config.carbonEnabled, false);
assert.equal(sanitized.config.carbonPrice, 0);
assert.equal(sanitized.config.feeConfigMode, "manual");
assert.deepEqual(Object.keys(sanitized.config.feeManualValuesByYear), ["2026", "2028"]);
assert.equal(sanitized.config.storageArbitragePrice, 0);
assert.equal(sanitized.config.mechanismReferenceMode, "project_capture");
assert.equal(sanitized.config.sameTypeSpread, 0);
assert.deepEqual(sanitized.confirmedConfig, {}, "legacy saved values must not be mistaken for explicit confirmation");
const sameTypeScenario = sanitizeScenario(offshoreStorageProject, {
  config: { mechanismReferenceMode: "same_type", sameTypeSpread: -15 }
});
assert.equal(sameTypeScenario.config.mechanismReferenceMode, "same_type");
assert.equal(sameTypeScenario.config.sameTypeSpread, -15);

const applyTarget = {
  config: {
    carbonEnabled: true,
    carbonPrice: 9,
    storageArbitragePrice: 99
  }
};
applyProvinceDefaultsToScenario(
  { siteType: "offshore", hasStorage: true },
  applyTarget,
  {
    provinceDefaults,
    nowIso: "2026-06-10T08:00:00.000Z"
  }
);
assert.equal(applyTarget.config.mechanismEnabled, provinceDefaults.mechanismEnabled);
assert.equal(applyTarget.config.mechanismRatio, provinceDefaults.mechanismRatio);
assert.equal(applyTarget.config.mechanismPrice, provinceDefaults.mechanismPrice);
assert.equal(applyTarget.config.marketOpFee, provinceDefaults.marketOpFee);
assert.equal(applyTarget.config.greenCertRealizeRatio, 1);
assert.equal(applyTarget.config.greenPremiumRealizeRatio, 0);
assert.equal(applyTarget.config.carbonRealizeRatio, 0);
assert.equal(applyTarget.config.storageArbitragePrice, provinceDefaults.storageArbitragePrice);
assert.equal(applyTarget.updatedAt, "2026-06-10T08:00:00.000Z");
assert.equal(isConfigConfirmed(applyTarget, "mechanismPrice"), true);
assert.equal(isConfigConfirmed(applyTarget, "carbonPrice"), false, "applying defaults must not confirm untouched fields");

const noStorageOnshoreTarget = { config: { carbonEnabled: true, carbonPrice: 8 } };
applyProvinceDefaultsToScenario(
  { siteType: "onshore", hasStorage: false },
  noStorageOnshoreTarget,
  {
    provinceDefaults,
    nowIso: () => "2026-06-10T09:00:00.000Z"
  }
);
assert.equal(noStorageOnshoreTarget.config.carbonEnabled, false);
assert.equal(noStorageOnshoreTarget.config.carbonPrice, 0);
assert.equal(noStorageOnshoreTarget.config.storageArbitragePrice, 0);
assert.equal(noStorageOnshoreTarget.config.storageCapacityCompPrice, 0);
assert.equal(noStorageOnshoreTarget.updatedAt, "2026-06-10T09:00:00.000Z");

const baselineScenario = createBaselineScenario(offshoreStorageProject, {
  provinceDefaults,
  currentYear: 2026,
  nowIso: "2026-06-10T00:00:00.000Z",
  makeId: (prefix) => `${prefix}-base`
});
assert.equal(baselineScenario.id, "scn-base");
assert.equal(baselineScenario.name, "基准场景");
assert.equal(baselineScenario.isBaseline, true);
assert.equal(baselineScenario.locked, false);
assert.equal(baselineScenario.config.carbonEnabled, true);
assert.equal(baselineScenario.updatedAt, "2026-06-10T00:00:00.000Z");
assert.deepEqual(baselineScenario.confirmedConfig, {});
assert.deepEqual(baselineScenario.confirmedConfigSources, {});
assert.equal(baselineScenario.confirmationReviewVersion, 1);
assert.equal(isConfigConfirmed(baselineScenario, "mechanismPrice"), false, "a populated system default is still unconfirmed");

const confirmationScenario = createBaselineScenario(offshoreStorageProject);
confirmationScenario.config.mechanismEnabled = false;
confirmationScenario.config.mechanismRatio = 0;
confirmationScenario.config.ltManualPricesByYear = { 2026: 0, 2027: 6 };
assert.equal(confirmConfig(confirmationScenario, ["mechanismEnabled", "mechanismRatio", "ltManualPricesByYear", "unknown"]), true);
assert.equal(isConfigConfirmed(confirmationScenario, "mechanismEnabled"), true, "false is a valid confirmed value");
assert.equal(isConfigConfirmed(confirmationScenario, "mechanismRatio"), true, "zero is a valid confirmed value");
assert.equal(isConfigConfirmed(confirmationScenario, "mechanismPrice"), false);
assert.equal(isConfigConfirmed(confirmationScenario, "unknown"), false);
assert.equal(confirmationScenario.confirmedConfigSources.mechanismRatio, "explicit");
assert.equal(isConfigConfirmed(confirmationScenario, "ltManualPricesByYear", { 2027: 6, 2026: 0 }), true);
confirmationScenario.config.ltManualPricesByYear[2027] = 9;
assert.equal(confirmationScenario.confirmedConfig.ltManualPricesByYear[2027], 6, "confirmed values need an independent deep snapshot");
assert.equal(isConfigConfirmed(confirmationScenario, "ltManualPricesByYear"), false);
const reloadedConfirmation = sanitizeScenario(offshoreStorageProject, JSON.parse(JSON.stringify(confirmationScenario)));
assert.equal(isConfigConfirmed(reloadedConfirmation, "mechanismRatio"), true);
assert.equal(reloadedConfirmation.confirmedConfigSources.mechanismRatio, "explicit");
assert.equal(isConfigConfirmed(reloadedConfirmation, "ltManualPricesByYear"), false);
assert.equal(reloadedConfirmation.confirmedConfigSources.ltManualPricesByYear, undefined,
  "a source must not survive an invalidated value confirmation");
assert.equal(confirmConfig(confirmationScenario), true);
assert.equal(isConfigConfirmed(confirmationScenario, "ltManualPricesByYear"), true);
assert.equal(isConfigConfirmed(confirmationScenario, "mechanismPrice"), true);
const changedByNormalization = sanitizeScenario({ ...offshoreStorageProject, hasStorage: false }, confirmationScenario);
assert.equal(isConfigConfirmed(changedByNormalization, "storageArbitragePrice"), false, "normalization must not silently confirm a replacement value");
confirmationScenario.locked = true;
const lockedConfirmationBefore = JSON.stringify(confirmationScenario);
assert.equal(confirmConfig(confirmationScenario), false);
applyProvinceDefaultsToScenario(offshoreStorageProject, confirmationScenario);
assert.equal(JSON.stringify(confirmationScenario), lockedConfirmationBefore, "locked scenario and confirmation records are immutable");

const manualConfirmationProject = { ...offshoreStorageProject, forecastYears: 1 };
const manualConfirmation = createBaselineScenario(manualConfirmationProject);
manualConfirmation.config.envValueMode = "manual";
manualConfirmation.config.envManualValuesByYear = {
  2026: { greenCertPrice: 22, greenCertRealizeRatio: 1, greenPremiumPrice: 12,
    greenPremiumRealizeRatio: 0, carbonEnabled: false, carbonPrice: 4, carbonRealizeRatio: 0 }
};
confirmConfig(manualConfirmation, ["envValueMode", "envManualValuesByYear"]);
const reloadedManual = sanitizeScenario(manualConfirmationProject, JSON.parse(JSON.stringify(manualConfirmation)));
assert.equal(reloadedManual.config.envManualValuesByYear[2026].carbonPrice, 0);
assert.equal(isConfigConfirmed(reloadedManual, "envManualValuesByYear"), true,
  "disabled carbon normalization preserves confirmation after reload");
assert.equal(manualConfirmation.confirmedConfig.envManualValuesByYear[2026].carbonPrice, 4,
  "hydration does not mutate the stored confirmation snapshot");
manualConfirmation.config.envManualValuesByYear[2026].greenCertPrice = 23;
assert.equal(isConfigConfirmed(sanitizeScenario(manualConfirmationProject, manualConfirmation), "envManualValuesByYear"), false,
  "normalizing annual maps must not confirm a genuinely changed input");
manualConfirmation.config.envManualValuesByYear[2026].greenCertPrice = 22;
assert.equal(isConfigConfirmed(sanitizeScenario({ ...manualConfirmationProject, forecastYears: 2 }, manualConfirmation), "envManualValuesByYear"), false,
  "a newly added project year remains unconfirmed and visible for completion");

const legacyDefaultScenario = createBaselineScenario(offshoreStorageProject, { provinceDefaults });
legacyDefaultScenario.config.mechanismPrice = 381.25;
legacyDefaultScenario.config.ltPricingMode = "manual";
legacyDefaultScenario.config.ltManualPricesByYear = { 2026: 11, 2027: 8, 2028: 5 };
confirmConfig(legacyDefaultScenario);
delete legacyDefaultScenario.confirmationReviewVersion;
delete legacyDefaultScenario.confirmedConfigSources;
const legacySnapshot = { id: "rough-old", scenarioId: legacyDefaultScenario.id,
  config: JSON.parse(JSON.stringify(legacyDefaultScenario.config)), summary: { weightedPrice: 376.5 } };
const legacyProject = { ...offshoreStorageProject, roughPrice: { snapshots: [legacySnapshot] },
  resultsByScenario: { [legacyDefaultScenario.id]: { avgFullRevenuePrice: 392.5 } } };
const originalLegacyData = JSON.stringify({ project: legacyProject, scenario: legacyDefaultScenario });
const reviewedLegacy = sanitizeScenario(legacyProject, legacyDefaultScenario, 0, { provinceDefaults });
assert.equal(isConfigConfirmed(reviewedLegacy, "mechanismRatio"), false,
  "an old rough-generated default without confirmation origin must return to pending");
assert.equal(isConfigConfirmed(reviewedLegacy, "storageOtherRevenuePrice"), false,
  "legacy review uses the project's province defaults");
assert.equal(isConfigConfirmed(reviewedLegacy, "mechanismPrice"), true,
  "legacy non-default assumptions retain their confirmation");
assert.equal(isConfigConfirmed(reviewedLegacy, "ltManualPricesByYear"), false,
  "legacy annual assumptions without explicit origin require review even when non-default");
assert.deepEqual(reviewedLegacy.config, legacyDefaultScenario.config);
assert.equal(reviewedLegacy.confirmationReviewVersion, 1);
assert.equal(JSON.stringify({ project: legacyProject, scenario: legacyDefaultScenario }), originalLegacyData,
  "legacy confirmation review cannot change stored input, rough snapshots, or baseline results");
confirmConfig(reviewedLegacy, ["mechanismRatio"], { source: "explicit" });
const reviewedAgain = sanitizeScenario(legacyProject, JSON.parse(JSON.stringify(reviewedLegacy)), 0, { provinceDefaults });
assert.equal(isConfigConfirmed(reviewedAgain, "mechanismRatio"), true,
  "explicitly accepting a default persists after the one-time legacy review");
assert.equal(reviewedAgain.confirmedConfigSources.mechanismRatio, "explicit");

const sourcedLegacy = JSON.parse(JSON.stringify(legacyDefaultScenario));
confirmConfig(sourcedLegacy, ["mechanismRatio"], { source: "rough_edit" });
confirmConfig(sourcedLegacy, ["greenCertPrice"]);
const sourcedReload = sanitizeScenario(offshoreStorageProject, sourcedLegacy, 0, {
  provinceDefaults, roughSnapshots: [legacySnapshot]
});
assert.equal(isConfigConfirmed(sourcedReload, "mechanismRatio"), true);
assert.equal(sourcedReload.confirmedConfigSources.mechanismRatio, "rough_edit");
assert.equal(isConfigConfirmed(sourcedReload, "greenCertPrice"), true,
  "new explicit origins survive legacy review even when their values equal defaults");
assert.equal(isConfigConfirmed(sourcedReload, "otherFee"), false,
  "a new source on one field must not authenticate unrelated old confirmations");
const noRoughLegacy = sanitizeScenario(offshoreStorageProject, legacyDefaultScenario, 0, { provinceDefaults });
assert.equal(isConfigConfirmed(noRoughLegacy, "mechanismRatio"), true,
  "legacy projects without rough snapshots are outside this targeted repair");
const otherScenarioOnly = sanitizeScenario(offshoreStorageProject, legacyDefaultScenario, 0, {
  provinceDefaults, roughSnapshots: [{ ...legacySnapshot, scenarioId: "another-scenario" }]
});
assert.equal(isConfigConfirmed(otherScenarioOnly, "mechanismRatio"), true,
  "another scenario's rough snapshot cannot invalidate this scenario's confirmations");
const staleSource = JSON.parse(JSON.stringify(sourcedLegacy));
staleSource.config.mechanismRatio = 0.28;
const staleSourceReload = sanitizeScenario(offshoreStorageProject, staleSource, 0, { provinceDefaults });
assert.equal(isConfigConfirmed(staleSourceReload, "mechanismRatio"), false);
assert.equal(staleSourceReload.confirmedConfigSources.mechanismRatio, undefined,
  "confirmation origins stay paired with their exact confirmed values");

const legacyAnnualDefaults = JSON.parse(JSON.stringify(legacyDefaultScenario));
legacyAnnualDefaults.config.ltManualPricesByYear = { 2026: 8, 2027: 6, 2028: 4 };
legacyAnnualDefaults.config.envValueMode = "manual";
legacyAnnualDefaults.config.feeConfigMode = "manual";
legacyAnnualDefaults.config.envManualValuesByYear = Object.fromEntries([2026, 2027, 2028].map((year) => [year, {
  greenCertPrice: 22, greenCertRealizeRatio: 1, greenPremiumPrice: 12, greenPremiumRealizeRatio: 0,
  carbonEnabled: true, carbonPrice: 4, carbonRealizeRatio: 0
}]));
legacyAnnualDefaults.config.feeManualValuesByYear = Object.fromEntries([2026, 2027, 2028].map((year) => [year, {
  marketOpFee: 6, gridAssessFee: 7, ancillaryFee: 14, otherFee: 3, otherIncome: 2
}]));
legacyAnnualDefaults.confirmedConfig = JSON.parse(JSON.stringify(legacyAnnualDefaults.config));
const annualReviewOptions = { provinceDefaults, roughSnapshots: [legacySnapshot] };
const reviewedAnnualDefaults = sanitizeScenario(offshoreStorageProject, legacyAnnualDefaults, 0, annualReviewOptions);
for (const key of ["ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"]) {
  assert.equal(isConfigConfirmed(reviewedAnnualDefaults, key), false,
    `a source-unknown ${key} equal to the automatically generated default table needs review`);
  assert.deepEqual(reviewedAnnualDefaults.config[key], legacyAnnualDefaults.config[key]);
}
for (const key of ["ltPricingMode", "envValueMode", "feeConfigMode"]) {
  assert.equal(isConfigConfirmed(reviewedAnnualDefaults, key), true,
    "selecting annual mode remains confirmed independently of the auto-filled values");
}
const sourcedAnnualDefaults = JSON.parse(JSON.stringify(legacyAnnualDefaults));
confirmConfig(sourcedAnnualDefaults, ["ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"]);
const sourcedAnnualReload = sanitizeScenario(offshoreStorageProject, sourcedAnnualDefaults, 0, annualReviewOptions);
for (const key of ["ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"]) {
  assert.equal(isConfigConfirmed(sourcedAnnualReload, key), true,
    "explicit confirmation of a default annual table must be retained");
}
const modifiedAnnualDefaults = JSON.parse(JSON.stringify(legacyAnnualDefaults));
modifiedAnnualDefaults.config.ltManualPricesByYear[2027] = 9;
modifiedAnnualDefaults.config.envManualValuesByYear[2027].greenCertPrice = 25;
modifiedAnnualDefaults.config.feeManualValuesByYear[2027].otherFee = 4;
modifiedAnnualDefaults.confirmedConfig = JSON.parse(JSON.stringify(modifiedAnnualDefaults.config));
const modifiedAnnualReload = sanitizeScenario(offshoreStorageProject, modifiedAnnualDefaults, 0, annualReviewOptions);
for (const key of ["ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"]) {
  assert.equal(isConfigConfirmed(modifiedAnnualReload, key), false,
    "partly modified legacy annual tables require review when row-level origins are unavailable");
  assert.deepEqual(modifiedAnnualReload.config[key], modifiedAnnualDefaults.config[key]);
}

// Previous version 1 repair and absence of a rough snapshot must not authenticate
// source-unknown tables. Reconfirmation changes only confirmation metadata.
for (const locked of [false, true]) {
  const migratedBefore = JSON.parse(JSON.stringify(modifiedAnnualDefaults));
  migratedBefore.confirmationReviewVersion = 1;
  migratedBefore.locked = locked;
  migratedBefore.confirmedConfigSources = { ltManualPricesByYear: "rough_edit", envManualValuesByYear: "unknown" };
  const original = JSON.stringify(migratedBefore);
  const pendingAnnual = sanitizeScenario(offshoreStorageProject, migratedBefore, 0, { provinceDefaults });
  for (const key of ["ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"]) {
    assert.equal(isConfigConfirmed(migratedBefore, key), false, "UI checks reject ambiguous old annual confirmation before hydration");
    assert.equal(isConfigConfirmed(pendingAnnual, key), false);
    assert.deepEqual(pendingAnnual.config[key], migratedBefore.config[key], "migration preserves exact annual values");
    assert.equal(pendingAnnual.confirmedConfigSources[key], undefined);
  }
  assert.equal(JSON.stringify(migratedBefore), original, "the original persisted record is not mutated");
  assert.equal(pendingAnnual.locked, locked);
  if (!locked) {
    const originalConfig = JSON.stringify(pendingAnnual.config);
    confirmConfig(pendingAnnual, ["ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"]);
    const confirmedAgain = sanitizeScenario(offshoreStorageProject, JSON.parse(JSON.stringify(pendingAnnual)), 0, { provinceDefaults });
    for (const key of ["ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"]) {
      assert.ok(isConfigConfirmed(confirmedAgain, key), "explicit customer review persists across reloads");
    }
    assert.equal(JSON.stringify(pendingAnnual.config), originalConfig, "explicit review does not overwrite values");
  }
}

const metadataProject = {
  activeScenarioId: "missing",
  scenarios: [
    { id: "a", isBaseline: false },
    { id: "b", isBaseline: true },
    { id: "c", isBaseline: true, locked: true }
  ]
};
const metadata = normalizeScenarioMetadata(metadataProject);
assert.equal(metadata.baselineId, "b");
assert.equal(metadata.activeScenarioId, "a");
assert.deepEqual(
  metadataProject.scenarios.map((scenario) => [scenario.id, scenario.isBaseline, scenario.locked]),
  [
    ["a", false, false],
    ["b", true, false],
    ["c", false, true]
  ]
);

assert.equal(parseBatchValue({ type: "percent", min: 0, max: 100 }, "36"), 0.36);
assert.equal(parseBatchValue({ type: "number", min: 0, max: 100 }, "120"), 100);
assert.equal(parseBatchValue({ type: "number", min: 0, max: 100 }, "bad"), null);
for (const blank of ["", "  ", null, undefined]) {
  assert.equal(parseBatchValue({ type: "number", min: 0, max: 100 }, blank), null, "blank batch values are not zero");
}
assert.equal(parseBatchValue({ type: "number", min: 0, max: 100 }, "0"), 0);

const renameProject = {
  scenarios: [
    { id: "base", name: "基准场景", locked: false, updatedAt: "" },
    { id: "target", name: "原方案", locked: false, updatedAt: "" },
    { id: "locked", name: "锁定方案", locked: true, updatedAt: "" }
  ]
};
assert.equal(
  renameScenario(renameProject, renameProject.scenarios[2], { name: "新名称" }).message,
  "当前场景已锁定，不能重命名。"
);
assert.equal(
  renameScenario(renameProject, renameProject.scenarios[1], { name: " " }).message,
  "场景名称不能为空。"
);
assert.equal(
  renameScenario(renameProject, renameProject.scenarios[1], { name: "基准场景" }).message,
  "场景名称重复，请换一个名称。"
);
const unchangedRename = renameScenario(renameProject, renameProject.scenarios[1], { name: "原方案" });
assert.equal(unchangedRename.ok, true);
assert.equal(unchangedRename.changed, false);
const changedRename = renameScenario(renameProject, renameProject.scenarios[1], {
  name: " 新方案 ",
  nowIso: "2026-06-11T00:00:00.000Z"
});
assert.equal(changedRename.ok, true);
assert.equal(changedRename.changed, true);
assert.equal(renameProject.scenarios[1].name, "新方案");
assert.equal(renameProject.scenarios[1].updatedAt, "2026-06-11T00:00:00.000Z");
assert.equal(changedRename.message, "场景“原方案”已重命名为“新方案”。");

const batchProject = {
  siteType: "offshore",
  scenarios: [
    {
      id: "base",
      isBaseline: true,
      locked: false,
      updatedAt: "",
      config: {
        greenCertRealizeRatio: 0.4,
        greenPremiumRealizeRatio: 0.2,
        carbonRealizeRatio: 0.1
      }
    },
    {
      id: "locked",
      isBaseline: false,
      locked: true,
      updatedAt: "",
      config: {
        greenCertRealizeRatio: 0.2,
        greenPremiumRealizeRatio: 0.2,
        carbonRealizeRatio: 0.1
      }
    },
    {
      id: "open",
      isBaseline: false,
      locked: false,
      updatedAt: "",
      config: {
        greenCertRealizeRatio: 0.2,
        greenPremiumRealizeRatio: 0.2,
        carbonRealizeRatio: 0.1
      }
    }
  ]
};
const batchResult = applyBatchParameter(batchProject, {
  key: "greenCertRealizeRatio",
  spec: { type: "percent", min: 0, max: 100 },
  rawValue: "40",
  scope: "non_baseline",
  nowIso: () => "2026-06-10T00:00:00.000Z",
  getEnvValueAllocation: (_project, config) => ({
    totalRatio: config.greenCertRealizeRatio + config.greenPremiumRealizeRatio + config.carbonRealizeRatio
  })
});
assert.equal(batchResult.ok, true);
assert.equal(batchResult.updated, 1);
assert.equal(batchResult.skippedBaseline, 1);
assert.equal(batchResult.skippedLocked, 1);
assert.equal(batchProject.scenarios[0].config.greenCertRealizeRatio, 0.4);
assert.equal(batchProject.scenarios[2].config.greenCertRealizeRatio, 0.4);
assert.equal(batchProject.scenarios[2].updatedAt, "2026-06-10T00:00:00.000Z");
assert.deepEqual(batchProject.scenarios[2].confirmedConfig, { greenCertRealizeRatio: 0.4 });
assert.equal(batchProject.scenarios[0].confirmedConfig, undefined);
assert.equal(batchProject.scenarios[1].confirmedConfig, undefined);
assert.match(batchResult.message, /批量更新完成：1 个场景已更新/);

const skipSpaceResult = applyBatchParameter(batchProject, {
  key: "greenPremiumRealizeRatio",
  spec: { type: "percent", min: 0, max: 100 },
  rawValue: "90",
  scope: "all",
  getEnvValueAllocation: (_project, config) => ({
    totalRatio: config.greenCertRealizeRatio + config.greenPremiumRealizeRatio + config.carbonRealizeRatio
  })
});
assert.equal(skipSpaceResult.updated, 0);
assert.equal(skipSpaceResult.skippedSpace, 2);
assert.match(skipSpaceResult.message, /没有可更新的场景/);

const onshoreProject = {
  siteType: "onshore",
  scenarios: [
    {
      isBaseline: false,
      locked: false,
      updatedAt: "",
      config: {
        carbonPrice: 5,
        carbonEnabled: true,
        carbonRealizeRatio: 0.5
      }
    }
  ]
};
const carbonResult = applyBatchParameter(onshoreProject, {
  key: "carbonPrice",
  spec: { type: "number", min: 0, max: 2000 },
  rawValue: "8",
  nowIso: "fixed-time"
});
assert.equal(carbonResult.updated, 1);
assert.equal(onshoreProject.scenarios[0].config.carbonPrice, 0);
assert.equal(onshoreProject.scenarios[0].config.carbonEnabled, false);
assert.equal(onshoreProject.scenarios[0].config.carbonRealizeRatio, 0);
assert.equal(onshoreProject.scenarios[0].updatedAt, "fixed-time");

const badBatch = applyBatchParameter(batchProject, {
  key: "marketOpFee",
  spec: { type: "number", min: 0, max: 2000 },
  rawValue: "bad"
});
assert.equal(badBatch.ok, false);
assert.equal(badBatch.message, "批量参数值无效，请输入数字。");

console.log("scenario model tests passed");
