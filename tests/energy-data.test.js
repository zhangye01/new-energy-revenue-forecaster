"use strict";

const assert = require("node:assert/strict");
const {
  buildEnergyTemplateRows,
  detectEnergyModeByHeader,
  deriveEnergyModeFromInputs,
  ensureProjectEnergyDataDerivedState,
  ensureProjectEnergyDataState,
  getEnergyModeMeta,
  hasEnergyTypicalCurve,
  rebuildProjectEnergyData,
  validateAndBuildEnergyData
} = require("../src/domain/energy-data");

function approx(actual, expected, message, tolerance = 1e-8) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function csvFromRows(rows) {
  return rows.map((row) => row.join(",")).join("\n");
}

const baseProject = {
  startYear: 2026,
  forecastYears: 2,
  capacityMw: 100
};

assert.equal(getEnergyModeMeta("annual_hours").header, "year,annual_hours_h");
assert.equal(detectEnergyModeByHeader(["\uFEFFYEAR", " annual_hours_h "]), "annual_hours");
assert.equal(detectEnergyModeByHeader(["hour_index", "equivalent_hours_h"]), "typical_curve_8760");
assert.equal(detectEnergyModeByHeader(["bad", "header"]), null);

const annualTemplate = buildEnergyTemplateRows(baseProject, "annual_hours");
assert.deepEqual(annualTemplate, [
  ["year", "annual_hours_h"],
  [2026, ""],
  [2027, ""]
]);

const typicalTemplate = buildEnergyTemplateRows(baseProject, "typical_curve_8760");
assert.equal(typicalTemplate.length, 8761);
assert.deepEqual(typicalTemplate[0], ["hour_index", "equivalent_hours_h"]);
assert.deepEqual(typicalTemplate[8760], [8760, ""]);

const hourlyTemplate = buildEnergyTemplateRows({ ...baseProject, forecastYears: 1 }, "hourly_8760");
assert.equal(hourlyTemplate.length, 8761);
assert.deepEqual(hourlyTemplate[1], [2026, 1, ""]);
assert.deepEqual(hourlyTemplate[8760], [2026, 8760, ""]);

const annualParsed = validateAndBuildEnergyData(
  baseProject,
  "year,annual_hours_h\n2026,2400\n2027,2300",
  "annual_hours"
);
assert.equal(annualParsed.ok, true);
assert.equal(annualParsed.mode, "annual_hours");
assert.deepEqual(annualParsed.annualInputByYear, { 2026: 2400, 2027: 2300 });

const duplicateAnnual = validateAndBuildEnergyData(
  baseProject,
  "year,annual_hours_h\n2026,2400\n2026,2300",
  "annual_hours"
);
assert.equal(duplicateAnnual.ok, false);
assert.match(duplicateAnnual.message, /重复/);

const mismatch = validateAndBuildEnergyData(
  baseProject,
  "year,annual_hours_h\n2026,2400",
  "typical_curve_8760"
);
assert.equal(mismatch.ok, false);
assert.match(mismatch.message, /模板不匹配/);

const typicalRows = [["hour_index", "equivalent_hours_h"]];
for (let hour = 1; hour <= 8760; hour += 1) {
  typicalRows.push([hour, hour % 24 === 0 ? 2 : 1]);
}
const typicalParsed = validateAndBuildEnergyData(baseProject, csvFromRows(typicalRows), "typical_curve_8760");
assert.equal(typicalParsed.ok, true);
assert.equal(typicalParsed.mode, "typical_curve_8760");
assert.equal(typicalParsed.typicalCurveProfile.length, 8760);
approx(
  typicalParsed.typicalCurveProfile.reduce((sum, value) => sum + value, 0),
  1,
  "典型年曲线校核后归一化"
);

const hourlyRows = [["year", "hour_index", "equivalent_hours_h"]];
for (let hour = 1; hour <= 8760; hour += 1) {
  hourlyRows.push([2026, hour, 1]);
}
const hourlyParsed = validateAndBuildEnergyData(
  { ...baseProject, forecastYears: 1 },
  csvFromRows(hourlyRows),
  "hourly_8760"
);
assert.equal(hourlyParsed.ok, true);
assert.equal(hourlyParsed.mode, "hourly_8760");
assert.equal(hourlyParsed.completeYears, 1);
assert.deepEqual(hourlyParsed.missingYears, []);
assert.equal(hourlyParsed.annualInputByYear[2026], 8760);
assert.equal(hourlyParsed.annualSummary[2026].energyMwh, 876000);

const invalidTypical = validateAndBuildEnergyData(
  baseProject,
  "hour_index,equivalent_hours_h\n1,0",
  "typical_curve_8760"
);
assert.equal(invalidTypical.ok, false);
assert.match(invalidTypical.message, /缺少第 2 小时/);

const migratedProject = {
  energyMode: "typical_curve_8760",
  energyData: {
    annualSummary: {
      2026: { annualHours: 2400 },
      2027: { annualHours: 2300 }
    }
  }
};
const migratedEnergyData = ensureProjectEnergyDataState(migratedProject);
assert.deepEqual(migratedEnergyData.annualInputByYear, { 2026: 2400, 2027: 2300 });
assert.equal(migratedEnergyData.typicalCurveSource, "typical_curve_8760");
assert.equal(hasEnergyTypicalCurve(migratedProject), false);

assert.equal(
  deriveEnergyModeFromInputs({
    mode: "hourly_8760",
    annualInputByYear: { 2026: 2400 },
    typicalCurveSource: "typical_curve_8760"
  }),
  "typical_curve_8760"
);
assert.equal(
  deriveEnergyModeFromInputs({
    mode: "hourly_8760",
    annualInputByYear: { 2026: 2400 },
    typicalCurveSource: ""
  }),
  "annual_hours"
);

const rebuildWithoutCurve = {
  startYear: 2026,
  forecastYears: 2,
  capacityMw: 100,
  energyMode: "annual_hours",
  energyData: {
    mode: "annual_hours",
    annualInputByYear: { 2026: 2400 }
  }
};
rebuildProjectEnergyData(rebuildWithoutCurve);
assert.equal(rebuildWithoutCurve.energyMode, "annual_hours");
assert.equal(rebuildWithoutCurve.energyData.annualSummary[2026].status, "待典型曲线");
assert.equal(rebuildWithoutCurve.energyData.annualSummary[2027].status, "缺失");
assert.deepEqual(rebuildWithoutCurve.energyData.hourlyByYear, {});

const flatProfile = Array.from({ length: 8760 }, () => 1);
const rebuildWithCurve = {
  startYear: 2026,
  forecastYears: 1,
  capacityMw: 100,
  energyMode: "annual_hours",
  energyData: {
    annualInputByYear: { 2026: 8760 },
    typicalCurveSource: "typical_curve_8760",
    typicalCurveProfile: flatProfile
  }
};
rebuildProjectEnergyData(rebuildWithCurve);
assert.equal(rebuildWithCurve.energyMode, "typical_curve_8760");
assert.equal(rebuildWithCurve.energyData.annualSummary[2026].status, "完整");
assert.equal(rebuildWithCurve.energyData.hourlyByYear[2026].length, 8760);
approx(
  rebuildWithCurve.energyData.hourlyByYear[2026].reduce((sum, value) => sum + value, 0),
  8760,
  "重建后逐小时电量合计守恒",
  1e-6
);

const derivedWithoutCurve = {
  startYear: 2026,
  forecastYears: 1,
  capacityMw: 100,
  energyData: {
    mode: "annual_hours",
    annualInputByYear: { 2026: 2400 },
    annualSummary: {
      2026: { annualHours: 2300, energyMwh: 230000, status: "完整" }
    }
  }
};
ensureProjectEnergyDataDerivedState(derivedWithoutCurve);
assert.equal(derivedWithoutCurve.energyData.annualSummary[2026].status, "待典型曲线");
assert.equal(derivedWithoutCurve.energyData.annualSummary[2026].annualHours, 2400);
assert.deepEqual(derivedWithoutCurve.energyData.hourlyByYear, {});

const derivedWithCurve = {
  startYear: 2026,
  forecastYears: 1,
  capacityMw: 100,
  energyData: {
    mode: "typical_curve_8760",
    annualInputByYear: { 2026: 8760 },
    typicalCurveSource: "typical_curve_8760",
    typicalCurveProfile: flatProfile,
    annualSummary: {
      2026: { annualHours: 8760, energyMwh: 876000, status: "待典型曲线" }
    },
    hourlyByYear: {}
  }
};
ensureProjectEnergyDataDerivedState(derivedWithCurve);
assert.equal(derivedWithCurve.energyData.annualSummary[2026].status, "完整");
assert.equal(derivedWithCurve.energyData.hourlyByYear[2026].length, 8760);

console.log("energy data tests passed");
