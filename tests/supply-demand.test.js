"use strict";
const assert = require("node:assert/strict");
const domain = require("../src/domain/supply-demand");
const { ELEMENTS, GENERATOR_KEYS, MONTH_DAYS, createConfig, createSeries, createCapacityHours, createCapacityHoursConfig, switchGenerationMode, prepareShareConfig, getCurve, validateShares,
  validateConfig, fingerprint, buildAnnualSummary, buildTypicalSummary, buildDataset, csvRows } = domain;
const clone = (value) => JSON.parse(JSON.stringify(value));
const sum = (values) => values.reduce((total, value) => total + value, 0);
const approx = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const project = { id: "supply-project", province: "jiangsu", startYear: 2028, forecastYears: 3 };
function configured(projectInput = project) {
  const config = createConfig(projectInput);
  for (const { key } of ELEMENTS) {
    const series = config.elements[key];
    series.baseEnergyMwh = 0;
    for (let index = 1; index < projectInput.forecastYears; index += 1) series.growthRatesByYear[projectInput.startYear + index] = 0;
  }
  return config;
}
function shape(series, base, months = MONTH_DAYS, hours = Array(24).fill(1)) {
  series.baseEnergyMwh = base;
  series.monthlyWeights = [...months];
  series.hourlyWeightsByMonth = Object.fromEntries(MONTH_DAYS.map((_, index) => [index + 1, [...hours]]));
  return series;
}
function reject(config, pattern, inputProject = project) {
  const before = JSON.stringify(config);
  const errors = validateConfig(inputProject, config);
  assert.ok(errors.length);
  if (pattern) assert.ok(errors.some((error) => pattern.test(error)), errors.join(";"));
  const data = buildDataset(inputProject, config);
  assert.equal(data.ok, false);
  assert.deepEqual(data.annualRows, []);
  assert.deepEqual(data.hourlyByYear, {});
  assert.equal(JSON.stringify(config), before);
}

assert.equal(ELEMENTS.length, 6);
assert.deepEqual(ELEMENTS.map((element) => element.key), ["load", "tieLine", "wind", "solar", "hydro", "nonMarket"]);
const empty = createConfig(project);
assert.equal(empty.startYear, 2028);
assert.equal(empty.forecastYears, 3);
assert.equal(empty.elements.load.baseEnergyMwh, null);
assert.equal(empty.elements.load.growthRatesByYear[2029], null);
assert.equal(empty.elements.load.growthRatesByYear[2028], undefined);
assert.notEqual(empty.elements.load.hourlyWeightsByMonth[1], empty.elements.load.hourlyWeightsByMonth[2]);
assert.notEqual(empty.elements.tieLine.export, empty.elements.tieLine.import);
reject(empty, /首年电量/);
reject(configured(), /周期/, { ...project, forecastYears: 31 });
reject(configured(), /周期/, { ...project, forecastYears: 1000000 });
reject(configured(), /周期/, { ...project, startYear: 2029 });
reject(configured(), /周期/, { ...project, forecastYears: 2 });
reject(configured(), /周期/, { ...project, startYear: 2028.5 });
assert.deepEqual(createConfig({ ...project, forecastYears: 1000000 }).elements.load.growthRatesByYear, {});
assert.deepEqual(validateConfig({ ...project, forecastYears: 30 }, configured({ ...project, forecastYears: 30 })), []);

const raw = configured();
shape(raw.elements.load, 8760);
raw.elements.load.growthRatesByYear = { 2028: 500, 2029: 10, 2030: -25 };
shape(raw.elements.tieLine, -365);
shape(raw.elements.wind, 17520);
const before = JSON.stringify({ project, raw });
const result = buildDataset(project, raw);
assert.equal(result.ok, true, result.errors.join(";"));
assert.deepEqual(result.annualRows.map((row) => row.load), [8760, 9636, 7227]);
assert.equal(result.typicalRows.length, 3 * 288);
for (const annual of result.annualRows) {
  const hourly = result.hourlyByYear[annual.year];
  assert.equal(hourly.load.length, 8760);
  assert.equal(hourly.tieLine.length, 8760);
  assert.equal(hourly.tieLineExport.length, 8760);
  assert.ok(hourly.tieLine.every((value) => value < 0));
  approx(annual.tieLine, -365);
  approx(annual.tieLineExport, 0);
  approx(annual.tieLineImport, 365);
  approx(sum(hourly.load), annual.load);
  approx(sum(hourly.tieLine), annual.tieLine);
  const typical = result.typicalRows.filter((row) => row.year === annual.year);
  approx(sum(typical.map((row) => row.load * row.representedDays)), annual.load);
  for (const row of typical) {
    assert.equal(row.residualDemand, row.load + row.tieLine - row.wind - row.solar - row.hydro - row.nonMarket);
  }
  assert.ok(hourly.residualDemand.every((value) => value < 0), "negative residual demand is not clamped");
}
approx(result.hourlyByYear[2028].load[0], 1);
assert.equal(result.source.calendar, "fixed_365_days");
assert.equal(result.source.monthDays[1], 28, "2028 follows a model year, not an inferred real leap calendar");
assert.equal(result.source.energyUnit, "MWh");
assert.equal(result.source.averagePowerUnit, "MW");
assert.equal(JSON.stringify({ project, raw }), before, "build and validate do not normalize stored inputs");
assert.deepEqual(buildAnnualSummary(project, raw), { ok: true, errors: [], annualRows: result.annualRows });
assert.equal(JSON.stringify({ project, raw }), before, "annual-only validation does not alter inputs");
assert.equal(buildAnnualSummary(project, empty).ok, false);
assert.deepEqual(buildAnnualSummary(project, empty).annualRows, []);
assert.equal(buildAnnualSummary(project, raw).hourlyByYear, undefined, "annual-only helper must not allocate hourly arrays");

// Independent monthly/typical-day reference: 1200 MWh, 10% January and 90% February;
// hour 0 gets 1/4, hour 12 gets 3/4. All other month/hour input can remain unused.
const monthly = configured({ ...project, forecastYears: 1 });
monthly.elements.load.baseEnergyMwh = 1200;
monthly.elements.load.monthlyWeights = [1, 9, ...Array(10).fill(0)];
monthly.elements.load.hourlyWeightsByMonth = {
  1: Array.from({ length: 24 }, (_, h) => h === 0 ? 1 : h === 12 ? 3 : 0),
  2: Array.from({ length: 24 }, (_, h) => h === 0 ? 1 : h === 12 ? 3 : 0)
};
const monthResult = buildDataset({ ...project, forecastYears: 1 }, monthly);
assert.equal(monthResult.ok, true, monthResult.errors.join(";"));
approx(monthResult.typicalRows.find((row) => row.month === 1 && row.hour === 0).load, 120 / 31 / 4);
approx(monthResult.typicalRows.find((row) => row.month === 2 && row.hour === 12).load, 1080 / 28 * .75);
approx(sum(monthResult.hourlyByYear[2028].load.slice(0, 31 * 24)), 120);
approx(sum(monthResult.hourlyByYear[2028].load.slice(31 * 24, 59 * 24)), 1080);
assert.ok(monthResult.typicalRows.filter((row) => row.month > 2).every((row) => row.load === 0));

// Zero annual net exchange still has genuine hourly export and import.
const bidirectional = configured();
const tie = bidirectional.elements.tieLine;
tie.mode = "bidirectional";
tie.export = shape(createSeries(project), 8760, MONTH_DAYS, Array.from({ length: 24 }, (_, h) => h === 0 ? 1 : 0));
tie.import = shape(createSeries(project), 8760, MONTH_DAYS, Array.from({ length: 24 }, (_, h) => h === 23 ? 1 : 0));
for (const series of [tie.export, tie.import]) series.growthRatesByYear = { 2029: 0, 2030: 0 };
// An inactive net branch can be incomplete without corrupting/confirming it.
tie.baseEnergyMwh = null;
const bidiBefore = JSON.stringify(bidirectional), bidiData = buildDataset(project, bidirectional);
assert.equal(bidiData.ok, true, bidiData.errors.join(";"));
assert.equal(bidiData.annualRows[0].tieLine, 0);
assert.equal(bidiData.annualRows[0].tieLineExport, 8760);
assert.equal(bidiData.annualRows[0].tieLineImport, 8760);
assert.deepEqual(buildAnnualSummary(project, bidirectional).annualRows, bidiData.annualRows);
approx(bidiData.hourlyByYear[2028].tieLine[0], 24);
approx(bidiData.hourlyByYear[2028].tieLine[23], -24);
approx(sum(bidiData.hourlyByYear[2028].tieLine), 0);
assert.equal(JSON.stringify(bidirectional), bidiBefore);
const imbalance = clone(bidirectional); imbalance.elements.tieLine.import.baseEnergyMwh = 4380;
approx(buildDataset(project, imbalance).annualRows[0].tieLine, 4380);
const negativeExport = clone(bidirectional); negativeExport.elements.tieLine.export.baseEnergyMwh = -1;
reject(negativeExport, /送出首年电量/);
// Large gross flows with unlike shapes can have a zero annual net. Floating point
// cancellation must not cause a false validation error or erase their hour data.
const largeExchange = clone(bidirectional);
for (const direction of ["export", "import"]) {
  const outgoing = direction === "export";
  shape(largeExchange.elements.tieLine[direction], 1e12,
    Array.from({ length: 12 }, (_, i) => outgoing ? i + 1 : 12 - i),
    Array.from({ length: 24 }, (_, h) => outgoing ? h + 1 : 24 - h));
}
const largeExchangeData = buildDataset(project, largeExchange);
assert.equal(largeExchangeData.ok, true, largeExchangeData.errors.join(";"));
assert.deepEqual(buildAnnualSummary(project, largeExchange).annualRows, largeExchangeData.annualRows);
assert.equal(largeExchangeData.annualRows[0].tieLine, 0);
assert.ok(largeExchangeData.hourlyByYear[2028].tieLine.some((value) => value > 0));
assert.ok(largeExchangeData.hourlyByYear[2028].tieLine.some((value) => value < 0));
approx(sum(largeExchangeData.hourlyByYear[2028].tieLine), 0, 0.1);

// Explicit zero is legal with no unused curve. It is never inferred from blank.
const zero = configured();
assert.equal(buildDataset(project, zero).ok, true);
assert.equal(fingerprint(project, zero), "supply-v1-a3c3cc19-fab7a09b-13702", "existing v1 energy configs retain their version binding");
assert.equal(fingerprint(project, prepareShareConfig(project, zero)), "supply-v2-1f9e34b9-fce67b1b-13702",
  "existing v2 energy configs retain their version binding");
const decline = configured(); shape(decline.elements.load, 100); decline.elements.load.growthRatesByYear[2029] = -100;
assert.deepEqual(buildDataset(project, decline).annualRows.map((row) => row.load), [100, 0, 0]);
for (const base of [null, "", "0", false, NaN, Infinity, -1]) {
  const invalid = configured(); invalid.elements.load.baseEnergyMwh = base; reject(invalid, /首年电量/);
}
for (const growth of [null, "", "1", true, NaN, Infinity, -100.001]) {
  const invalid = clone(raw); invalid.elements.load.growthRatesByYear[2029] = growth; reject(invalid, /增长率/);
}
for (const curve of [undefined, {}, [], Array(12), Array(12).fill(null), Array(12).fill(0), Array(12).fill(-1), Array(12).fill(Infinity)]) {
  const invalid = clone(raw); invalid.elements.load.monthlyWeights = curve; reject(invalid, /分月权重/);
}
for (const curve of [undefined, {}, [], Array(24), Array(24).fill(null), Array(24).fill(0), Array(24).fill(-1), Array(24).fill(Infinity)]) {
  const invalid = clone(raw); invalid.elements.load.hourlyWeightsByMonth[1] = curve; reject(invalid, /24小时权重/);
}
const overflow = clone(raw); overflow.elements.load.baseEnergyMwh = 1e308; overflow.elements.load.growthRatesByYear[2029] = 10000;
reject(overflow, /超出/);
const aggregateOverflow = clone(raw); shape(aggregateOverflow.elements.load, 1e308); shape(aggregateOverflow.elements.wind, 1e308);
reject(aggregateOverflow, /超出/);
// Safe normalization avoids overflow merely because weights use a large scale.
const largeWeights = clone(raw); largeWeights.elements.load.monthlyWeights = Array(12).fill(1e308);
largeWeights.elements.load.hourlyWeightsByMonth[1] = Array(24).fill(1e308);
assert.equal(buildDataset(project, largeWeights).ok, true);
const invalidMode = configured(); invalidMode.elements.tieLine.mode = "unknown"; reject(invalidMode, /配置方式/);
const invalidVersion = configured(); invalidVersion.version = 3; reject(invalidVersion, /版本/);

// Fingerprints record scope and every raw config field, independent of key order.
assert.equal(result.fingerprint, fingerprint(project, raw));
assert.equal(fingerprint(project, raw), fingerprint({ forecastYears: 3, province: "jiangsu", startYear: 2028, id: "supply-project" }, raw));
const reordered = Object.fromEntries(Object.entries(raw).reverse());
assert.equal(fingerprint(project, raw), fingerprint(project, reordered));
for (const field of ["province", "id", "startYear", "forecastYears"]) {
  const changed = { ...project, [field]: typeof project[field] === "number" ? project[field] + 1 : "changed" };
  assert.notEqual(fingerprint(project, raw), fingerprint(changed, raw));
}
const inputChange = clone(raw); inputChange.elements.wind.hourlyWeightsByMonth[1][3] = 9;
assert.notEqual(fingerprint(project, inputChange), fingerprint(project, raw));

const annualCsv = csvRows(monthResult, "annual");
assert.equal(annualCsv.length, 2); assert.equal(annualCsv[0][0], "year");
assert.ok(annualCsv[0].includes("tie_line_net_mwh"));
const typicalCsv = csvRows(monthResult, "typical");
assert.equal(typicalCsv.length, 289);
assert.deepEqual(typicalCsv[0].slice(0, 4), ["year", "month", "hour", "represented_days"]);
assert.deepEqual(typicalCsv[1].slice(0, 4), [2028, 1, 0, 31]);
assert.deepEqual(typicalCsv.at(-1).slice(0, 4), [2028, 12, 23, 31]);
const hourlyCsv = csvRows(monthResult, "hourly");
assert.equal(hourlyCsv.length, 8761);
assert.deepEqual(hourlyCsv[0].slice(0, 5), ["year", "month", "day", "hour", "hour_index"]);
assert.deepEqual(hourlyCsv[1].slice(0, 5), [2028, 1, 1, 0, 1]);
assert.deepEqual(hourlyCsv[31 * 24 + 1].slice(0, 5), [2028, 2, 1, 0, 745]);
assert.deepEqual(hourlyCsv.at(-1).slice(0, 5), [2028, 12, 31, 23, 8760]);
approx(sum(hourlyCsv.slice(1).map((row) => row[5])), 1200);
assert.deepEqual(csvRows({ ok: false }, "hourly"), []);
assert.throws(() => csvRows(monthResult, "invalid"), /类型/);

// A writable copy uses decimal shares without touching the recorded v1 config.
assert.equal(result.source.curveReuse, "same_monthly_and_hourly_weights_across_years");
const migrated = prepareShareConfig(project, raw);
assert.equal(migrated.version, 2);
assert.equal(migrated.elements.load.growthRatesByYear[2028], undefined);
assert.equal(migrated.elements.load.growthRatesByYear[2029], 10);
assert.equal(migrated.elements.load.growthRatesByYear[2030], -25);
assert.equal(validateShares(getCurve(migrated.elements.load).monthlyWeights, 12, "分月"), "");
assert.equal(validateShares(getCurve(migrated.elements.load).hourlyWeightsByMonth[1], 24, "分时"), "");
assert.match(fingerprint(project, migrated), /^supply-v2-/);
assert.equal(fingerprint(project, raw), result.fingerprint);
assert.equal(JSON.stringify({ project, raw }), before);
const shareBaseline = buildDataset(project, migrated);
assert.equal(shareBaseline.ok, true, shareBaseline.errors.join(";"));
assert.equal(shareBaseline.source.version, 1, "the dataset wire format is unchanged");
assert.equal(shareBaseline.source.curveReuse, "default_with_year_overrides");
assert.deepEqual(shareBaseline.annualRows, result.annualRows);
approx(shareBaseline.hourlyByYear[2028].load[0], result.hourlyByYear[2028].load[0]);

const oneHour = (hour) => Array.from({ length: 24 }, (_, index) => Number(index === hour));
const oneMonth = (month) => Array.from({ length: 12 }, (_, index) => Number(index + 1 === month));
const deadline = clone(migrated);
deadline.elements.load.curveOverridesByYear = { 2029: { hourlyWeightsByMonth: { 7: oneHour(12) } } };
const deadlineBefore = JSON.stringify(deadline);
assert.equal(getCurve(deadline.elements.load, 2029).monthlyWeights, deadline.elements.load.monthlyWeights);
assert.deepEqual(getCurve(deadline.elements.load, 2029).hourlyWeightsByMonth[7], oneHour(12));
assert.equal(getCurve(deadline.elements.load, 2029).hourlyWeightsByMonth[6], deadline.elements.load.hourlyWeightsByMonth[6]);
assert.equal(getCurve(deadline.elements.load, 2030).hourlyWeightsByMonth[7], deadline.elements.load.hourlyWeightsByMonth[7]);
const deadlineData = buildDataset(project, deadline);
assert.equal(deadlineData.ok, true, deadlineData.errors.join(";"));
assert.deepEqual(buildAnnualSummary(project, deadline).annualRows, shareBaseline.annualRows);
assert.deepEqual(deadlineData.hourlyByYear[2028], shareBaseline.hourlyByYear[2028]);
assert.deepEqual(deadlineData.hourlyByYear[2030], shareBaseline.hourlyByYear[2030]);
const julyStart = 181 * 24, julyEnd = 212 * 24;
const deadlineLoad = deadlineData.hourlyByYear[2029].load;
const baselineLoad = shareBaseline.hourlyByYear[2029].load;
assert.deepEqual(deadlineLoad.slice(0, julyStart), baselineLoad.slice(0, julyStart));
assert.deepEqual(deadlineLoad.slice(julyEnd), baselineLoad.slice(julyEnd));
approx(deadlineLoad[julyStart + 12], 9636 / 365);
assert.equal(deadlineLoad[julyStart], 0);
approx(sum(deadlineLoad), 9636);
assert.notEqual(fingerprint(project, deadline), fingerprint(project, migrated));
assert.equal(JSON.stringify(deadline), deadlineBefore);

const annualOverride = clone(deadline);
annualOverride.elements.load.curveOverridesByYear[2029].monthlyWeights = oneMonth(7);
const annualOverrideData = buildDataset(project, annualOverride);
assert.equal(annualOverrideData.ok, true, annualOverrideData.errors.join(";"));
approx(annualOverrideData.hourlyByYear[2029].load[julyStart + 12], 9636 / 31);
approx(sum(annualOverrideData.hourlyByYear[2029].load.slice(julyStart, julyEnd)), 9636);
assert.deepEqual(annualOverrideData.hourlyByYear[2030], shareBaseline.hourlyByYear[2030]);
assert.deepEqual(annualOverrideData.hourlyByYear[2029].tieLine, shareBaseline.hourlyByYear[2029].tieLine);

const revisedPeriod = { ...project, startYear: 2027, forecastYears: 3 };
const carried = prepareShareConfig(revisedPeriod, annualOverride);
assert.equal(carried.elements.load.baseEnergyMwh, null, "changing the first year requires a new first-year volume");
assert.deepEqual(carried.elements.load.growthRatesByYear, { 2028: null, 2029: 10 });
assert.deepEqual(carried.elements.load.curveOverridesByYear[2029], annualOverride.elements.load.curveOverridesByYear[2029]);
assert.notEqual(carried.elements.load.curveOverridesByYear[2029], annualOverride.elements.load.curveOverridesByYear[2029]);
const shorter = prepareShareConfig({ ...project, forecastYears: 1 }, annualOverride);
assert.equal(shorter.elements.load.baseEnergyMwh, 8760);
assert.deepEqual(shorter.elements.load.growthRatesByYear, {});
assert.equal(shorter.elements.load.curveOverridesByYear, undefined);
assert.notEqual(prepareShareConfig(project, annualOverride).elements.load, annualOverride.elements.load);
const sparseShares = { version: 2, startYear: project.startYear, forecastYears: project.forecastYears,
  elements: { tieLine: { mode: "net", baseEnergyMwh: -123 } } };
const sparseBefore = JSON.stringify(sparseShares);
const recoveredEditor = prepareShareConfig(project, sparseShares);
assert.equal(JSON.stringify(sparseShares), sparseBefore, "preparing an incomplete restored version must leave the raw record intact");
assert.equal(recoveredEditor.elements.tieLine.baseEnergyMwh, -123);
assert.equal(recoveredEditor.elements.tieLine.import.monthlyWeights.length, 12);
assert.equal(recoveredEditor.elements.nonMarket.baseEnergyMwh, null);

const invalidDefault = clone(migrated);
invalidDefault.elements.load.monthlyWeights.fill(0.1);
reject(invalidDefault, /默认分月占比.*合计须为1/);
const invalidYear = clone(migrated);
invalidYear.elements.load.curveOverridesByYear = { 2031: { monthlyWeights: oneMonth(12) } };
reject(invalidYear, /超出测算周期/);
const invalidHour = clone(deadline);
invalidHour.elements.load.curveOverridesByYear[2029].hourlyWeightsByMonth[7][12] = 0.9;
reject(invalidHour, /2029年7月24小时占比.*合计须为1/);
const requiresInheritedHours = clone(migrated);
requiresInheritedHours.elements.load.monthlyWeights = oneMonth(1);
delete requiresInheritedHours.elements.load.hourlyWeightsByMonth[7];
requiresInheritedHours.elements.load.curveOverridesByYear = { 2029: { monthlyWeights: oneMonth(7) } };
reject(requiresInheritedHours, /2029年7月24小时占比须填写24个/);
requiresInheritedHours.elements.load.curveOverridesByYear[2029].hourlyWeightsByMonth = { 7: oneHour(12) };
assert.equal(buildDataset(project, requiresInheritedHours).ok, true);

const bidiShare = prepareShareConfig(project, bidirectional);
bidiShare.elements.tieLine.import.curveOverridesByYear = { 2029: { hourlyWeightsByMonth: { 1: oneHour(22) } } };
const bidiShareData = buildDataset(project, bidiShare);
assert.equal(bidiShareData.ok, true, bidiShareData.errors.join(";"));
for (const [config, full] of [[raw, result], [bidiShare, bidiShareData]]) {
  const { ok, errors, fingerprint, annualRows, typicalRows } = full;
  assert.deepEqual(buildTypicalSummary(project, config), { ok, errors, fingerprint, annualRows, typicalRows },
    "saved chart preview must match the full dataset without retaining hourly arrays");
}
assert.equal(buildTypicalSummary(project, invalidDefault).ok, false);
approx(bidiShareData.hourlyByYear[2029].tieLine[22], -24);
approx(bidiShareData.hourlyByYear[2029].tieLine[23], 0);
approx(bidiShareData.hourlyByYear[2028].tieLine[23], -24);
approx(sum(bidiShareData.hourlyByYear[2029].tieLine), 0);
assert.equal(validateShares(oneMonth(1), 12, "分月"), "");
assert.match(validateShares(Array(12).fill(0), 12, "分月"), /合计须为1/);
assert.match(validateShares(Array(24).fill(null), 24, "分时"), /24个0至1/);
assert.match(validateShares([1.01, ...Array(11).fill(0)], 12, "分月"), /0至1/);

const longer = { ...project, forecastYears: 4 };
assert.deepEqual(GENERATOR_KEYS, ["wind", "solar", "hydro"]);
const capacityDraft = createCapacityHoursConfig(longer);
assert.equal(capacityDraft.version, 2);
assert.deepEqual(Object.keys(capacityDraft.elements).filter((key) => Object.hasOwn(capacityDraft.elements[key], "capacityHours")), GENERATOR_KEYS);
assert.deepEqual(capacityDraft.elements.wind.capacityHours, createCapacityHours());
assert.notEqual(capacityDraft.elements.wind.capacityHours.utilizationHoursByYear, capacityDraft.elements.solar.capacityHours.utilizationHoursByYear);
assert.deepEqual(capacityDraft.elements.hydro.growthRatesByYear, { 2029: null, 2030: null, 2031: null });
assert.equal(Object.hasOwn(prepareShareConfig(longer, configured(longer)).elements.wind, "capacityHours"), false);

const power = configured(longer);
shape(power.elements.load, 120000);
shape(power.elements.wind, 0);
shape(power.elements.solar, 0);
const capacity = prepareShareConfig(longer, power);
const { wind, solar, hydro } = capacity.elements;
wind.capacityHours = { baseCapacityMw: 100, baseUtilizationHours: 2000, utilizationHoursByYear: { 2029: 1500, 2031: 0 } };
wind.growthRatesByYear = { 2029: 10, 2030: 25, 2031: -50 };
solar.capacityHours = { baseCapacityMw: 40, baseUtilizationHours: 0, utilizationHoursByYear: { 2030: 500 } };
hydro.capacityHours = { baseCapacityMw: 0, baseUtilizationHours: 8760, utilizationHoursByYear: {} };
const capacityBefore = JSON.stringify(capacity);
const capacityDataset = buildDataset(longer, capacity);
assert.equal(capacityDataset.ok, true, capacityDataset.errors.join(";"));
const windMwh = [200000, 165000, 275000, 0];
const solarMwh = [0, 0, 20000, 0];
for (const [index, annual] of capacityDataset.annualRows.entries()) {
  approx(annual.wind, windMwh[index]);
  assert.equal(annual.solar, solarMwh[index]);
  assert.equal(annual.hydro, 0);
  assert.equal(annual.load, 120000);
  const hourly = capacityDataset.hourlyByYear[annual.year];
  assert.deepEqual(Object.keys(hourly), Object.keys(result.hourlyByYear[2028]), "hourly series contract stays the same");
  approx(sum(hourly.wind), annual.wind);
  approx(sum(hourly.solar), annual.solar);
  const typical = capacityDataset.typicalRows.filter(({ year }) => year === annual.year);
  approx(sum(typical.map((row) => row.wind * row.representedDays)), annual.wind);
  approx(sum(typical.map((row) => row.solar * row.representedDays)), annual.solar);
}
assert.deepEqual(buildAnnualSummary(longer, capacity).annualRows, capacityDataset.annualRows);
assert.equal(buildTypicalSummary(longer, capacity).typicalRows.length, 4 * 288);
assert.equal(capacityDataset.source.version, result.source.version);
assert.deepEqual(csvRows(capacityDataset, "annual")[0], annualCsv[0]);
assert.equal(capacityDataset.fingerprint, fingerprint(longer, capacity));
assert.equal(JSON.stringify(capacity), capacityBefore);
assert.deepEqual(prepareShareConfig(longer, capacity), capacity);
assert.notEqual(prepareShareConfig(longer, capacity).elements.wind.capacityHours, wind.capacityHours);

const missingPositiveCurve = clone(capacity);
missingPositiveCurve.elements.solar.monthlyWeights = Array(12).fill(null);
missingPositiveCurve.elements.solar.hourlyWeightsByMonth = {};
reject(missingPositiveCurve, /光伏出力默认分月占比/, longer);
missingPositiveCurve.elements.solar.capacityHours.utilizationHoursByYear = {};
assert.equal(buildDataset(longer, missingPositiveCurve).ok, true, "a feature with zero annual generation in every year may omit curves");
const zeroInstalled = clone(capacity);
zeroInstalled.elements.wind.growthRatesByYear[2029] = -100;
assert.deepEqual(buildDataset(longer, zeroInstalled).annualRows.map(({ wind }) => wind), [200000, 0, 0, 0]);
const changedHours = clone(capacity);
changedHours.elements.wind.capacityHours.utilizationHoursByYear[2029] = 1600;
assert.notEqual(fingerprint(longer, changedHours), capacityDataset.fingerprint);
approx(buildDataset(longer, changedHours).annualRows[2].wind, 275000);

const truncatedCapacity = prepareShareConfig({ ...longer, forecastYears: 2 }, capacity).elements.wind;
assert.deepEqual(truncatedCapacity.capacityHours, { baseCapacityMw: 100, baseUtilizationHours: 2000, utilizationHoursByYear: { 2029: 1500 } });
const shiftedCapacity = prepareShareConfig({ ...longer, startYear: 2029 }, capacity).elements.wind;
assert.deepEqual(shiftedCapacity.capacityHours, { baseCapacityMw: null, baseUtilizationHours: null, utilizationHoursByYear: { 2031: 0 } });
assert.deepEqual(shiftedCapacity.growthRatesByYear, { 2030: 25, 2031: -50, 2032: null });
assert.equal(JSON.stringify(capacity), capacityBefore);

const damaged = clone(capacity);
damaged.elements.wind.capacityHours = { baseCapacityMw: 100, baseUtilizationHours: 2000, utilizationHoursByYear: null };
damaged.elements.hydro.capacityHours = [];
const damagedBefore = JSON.stringify(damaged);
const repairable = prepareShareConfig(longer, damaged);
assert.deepEqual(repairable.elements.wind.capacityHours, { baseCapacityMw: 100, baseUtilizationHours: 2000, utilizationHoursByYear: {} });
assert.deepEqual(repairable.elements.hydro.capacityHours, createCapacityHours());
assert.equal(JSON.stringify(damaged), damagedBefore);

for (const [field, value, pattern] of [
  ["baseCapacityMw", -1, /首年装机/],
  ["baseCapacityMw", "100", /首年装机/],
  ["baseUtilizationHours", null, /首年利用小时/],
  ["baseUtilizationHours", 8761, /首年利用小时/],
  ["utilizationHoursByYear", [], /逐年利用小时须按测算年份/],
  ["utilizationHoursByYear", { 2028: 1000 }, /首年之后/],
  ["utilizationHoursByYear", { 2032: 1000 }, /测算周期内/],
  ["utilizationHoursByYear", { 2029: -1 }, /2029年利用小时须为0至8760/],
  ["utilizationHoursByYear", { 2029: null }, /2029年利用小时须为0至8760/],
  ["inferredCapacity", 10, /不支持的字段/]
]) {
  const invalid = clone(capacity);
  invalid.elements.wind.capacityHours[field] = value;
  reject(invalid, pattern, longer);
}
const capacityOverflow = clone(capacity);
capacityOverflow.elements.wind.capacityHours.baseCapacityMw = 1e308;
reject(capacityOverflow, /年度电量计算超出/, longer);
const invalidCapacityGrowth = clone(capacity);
invalidCapacityGrowth.elements.wind.growthRatesByYear[2029] = -101;
reject(invalidCapacityGrowth, /装机增长率/, longer);
const unsupportedV1 = clone(power);
unsupportedV1.elements.wind.capacityHours = createCapacityHours();
reject(unsupportedV1, /仅支持版本2/, longer);
const unsupportedLoad = clone(capacity);
unsupportedLoad.elements.load.capacityHours = createCapacityHours();
reject(unsupportedLoad, /仅支持版本2.*风电、光伏和水电/, longer);
const unsupportedTieDirection = clone(capacity);
unsupportedTieDirection.elements.tieLine.import.capacityHours = createCapacityHours();
reject(unsupportedTieDirection, /仅支持版本2.*风电、光伏和水电/, longer);

const energyBasis = prepareShareConfig(longer, power);
const energyWind = energyBasis.elements.wind;
energyWind.baseEnergyMwh = 8760;
energyWind.growthRatesByYear = { 2029: 10, 2030: 0, 2031: -20 };
const energyBasisOriginal = clone(energyBasis);
assert.equal(switchGenerationMode(longer, energyWind, "energy"), false);
assert.equal(switchGenerationMode(longer, energyWind, "other"), false);
assert.equal(switchGenerationMode(longer, energyWind, "capacity_hours"), true);
assert.equal(energyWind.baseEnergyMwh, 8760);
assert.deepEqual(energyWind.capacityHours, createCapacityHours());
assert.deepEqual(energyWind.growthRatesByYear, { 2029: null, 2030: null, 2031: null });
assert.deepEqual(energyWind.alternateGeneration, { mode: "energy", growthRatesByYear: { 2029: 10, 2030: 0, 2031: -20 } });
assert.equal(switchGenerationMode(longer, energyWind, "energy"), true);
assert.deepEqual(energyBasis, energyBasisOriginal, "untouched alternate basis is pruned on a round trip from legacy energy");
assert.equal(fingerprint(longer, energyBasis), fingerprint(longer, energyBasisOriginal));

const fromCapacity = clone(capacity);
const capacityWind = fromCapacity.elements.wind;
assert.equal(switchGenerationMode(longer, capacityWind, "energy"), true);
assert.equal(Object.hasOwn(capacityWind, "capacityHours"), false);
assert.deepEqual(capacityWind.alternateGeneration, { mode: "capacity_hours", growthRatesByYear: wind.growthRatesByYear, capacityHours: wind.capacityHours });
assert.equal(switchGenerationMode(longer, capacityWind, "capacity_hours"), true);
assert.deepEqual(fromCapacity, capacity, "untouched alternate basis is pruned on a round trip from capacity");
assert.equal(fingerprint(longer, fromCapacity), capacityDataset.fingerprint);

const originalMonthly = energyWind.monthlyWeights;
const originalHourly = energyWind.hourlyWeightsByMonth;
const expectedLegacyAnnual = buildAnnualSummary(longer, energyBasis).annualRows;
assert.equal(switchGenerationMode(longer, energyWind, "capacity_hours"), true);
energyWind.capacityHours.baseCapacityMw = 20;
energyWind.capacityHours.baseUtilizationHours = 100;
energyWind.capacityHours.utilizationHoursByYear = { 2029: 1000, 2030: 2000, 2031: 0 };
energyWind.growthRatesByYear = { 2029: 0, 2030: 100, 2031: -50 };
assert.deepEqual(buildAnnualSummary(longer, energyBasis).annualRows.map(({ wind }) => wind), [2000, 20000, 80000, 0]);
assert.equal(switchGenerationMode(longer, energyWind, "energy"), true);
assert.deepEqual(buildAnnualSummary(longer, energyBasis).annualRows, expectedLegacyAnnual, "archiving capacity inputs does not affect active energy");
assert.equal(energyWind.monthlyWeights, originalMonthly);
assert.equal(energyWind.hourlyWeightsByMonth, originalHourly);
assert.equal(energyWind.alternateGeneration.capacityHours.utilizationHoursByYear[2031], 0);
assert.deepEqual(prepareShareConfig(longer, energyBasis), energyBasis);

const savedWithAlternate = JSON.stringify(energyBasis);
const shorterEnergyWind = prepareShareConfig({ ...longer, forecastYears: 2 }, energyBasis).elements.wind;
assert.deepEqual(shorterEnergyWind.alternateGeneration, {
  mode: "capacity_hours", growthRatesByYear: { 2029: 0 },
  capacityHours: { baseCapacityMw: 20, baseUtilizationHours: 100, utilizationHoursByYear: { 2029: 1000 } }
});
const shiftedEnergyWind = prepareShareConfig({ ...longer, startYear: 2029 }, energyBasis).elements.wind;
assert.equal(shiftedEnergyWind.baseEnergyMwh, null);
assert.deepEqual(shiftedEnergyWind.alternateGeneration, {
  mode: "capacity_hours", growthRatesByYear: { 2030: 100, 2031: -50, 2032: null },
  capacityHours: { baseCapacityMw: null, baseUtilizationHours: null, utilizationHoursByYear: { 2030: 2000, 2031: 0 } }
});
assert.equal(JSON.stringify(energyBasis), savedWithAlternate);

const invalidInactive = clone(energyBasis);
const alternate = invalidInactive.elements.wind.alternateGeneration;
alternate.growthRatesByYear = { 2030: null, 2031: -120 };
alternate.capacityHours = { baseCapacityMw: null, baseUtilizationHours: -10, utilizationHoursByYear: { 2039: 8900 } };
assert.deepEqual(validateConfig(longer, invalidInactive), [], "only the active basis has its values checked");
assert.deepEqual(buildAnnualSummary(longer, invalidInactive).annualRows, expectedLegacyAnnual);
assert.equal(switchGenerationMode(longer, invalidInactive.elements.wind, "capacity_hours"), true);
reject(invalidInactive, /首年装机|装机增长率/, longer);

const badArchiveShapes = [
  { mode: "energy", growthRatesByYear: {} },
  { mode: "capacity_hours", growthRatesByYear: [] },
  { mode: "capacity_hours", growthRatesByYear: {}, baseEnergyMwh: 42 },
  { mode: "capacity_hours", growthRatesByYear: {}, capacityHours: [] }
];
for (const bad of badArchiveShapes) {
  const invalid = clone(energyBasis);
  invalid.elements.wind.alternateGeneration = bad;
  reject(invalid, /备用发电口径的配置结构无效/, longer);
}
const backupArchive = clone(energyBasis);
backupArchive.elements.wind.alternateGeneration = { mode: "capacity_hours", growthRatesByYear: null,
  capacityHours: { baseCapacityMw: 0, utilizationHoursByYear: null } };
const archiveBefore = JSON.stringify(backupArchive);
assert.deepEqual(prepareShareConfig(longer, backupArchive).elements.wind.alternateGeneration, {
  mode: "capacity_hours", growthRatesByYear: { 2029: null, 2030: null, 2031: null },
  capacityHours: { baseCapacityMw: 0, baseUtilizationHours: null, utilizationHoursByYear: {} }
});
assert.equal(JSON.stringify(backupArchive), archiveBefore);

const unsupportedArchive = clone(capacity);
unsupportedArchive.elements.tieLine.export.alternateGeneration = { mode: "capacity_hours", growthRatesByYear: {} };
reject(unsupportedArchive, /备用发电口径仅支持版本2的风电、光伏和水电/, longer);
const unsupportedV1Archive = clone(power);
unsupportedV1Archive.elements.wind.alternateGeneration = { mode: "capacity_hours", growthRatesByYear: {} };
reject(unsupportedV1Archive, /备用发电口径仅支持版本2/, longer);

console.log("supply demand tests passed");
