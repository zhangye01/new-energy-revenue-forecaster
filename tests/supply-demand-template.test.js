"use strict";

const assert = require("node:assert/strict");
const xlsx = require("../vendor/xlsx.full.min");
const domain = require("../src/domain/supply-demand");
const template = require("../src/ui/supply-demand-template");

const project = { id: "xlsx-project", name: "测试/供需", province: "jiangsu", startYear: 2027, forecastYears: 3 };
const keys = ["年度电量与增长率", "分月权重", "典型日分时"];
const curveTabs = ["填写说明", "分月占比", "典型日分时占比"];

function configured(input = project) {
  const config = domain.createConfig(input);
  for (const { key } of domain.ELEMENTS) {
    const series = config.elements[key];
    series.baseEnergyMwh = key === "tieLine" ? -500 : key === "nonMarket" ? 0 : 8760;
    for (const year of Object.keys(series.growthRatesByYear)) series.growthRatesByYear[year] = 0;
    if (series.baseEnergyMwh === 0) continue;
    series.monthlyWeights = [...domain.MONTH_DAYS];
    for (const month of Object.keys(series.hourlyWeightsByMonth)) series.hourlyWeightsByMonth[month].fill(1);
  }
  return config;
}

function workbook(config = configured(), input = project) {
  return template.buildWorkbook(input, config, { xlsx });
}

function fileFor(book) {
  const bytes = xlsx.write(book, { type: "array", bookType: "xlsx" });
  return { name: "供需配置模板.xlsx", size: bytes.byteLength, async arrayBuffer() { return bytes; } };
}

function accepted(book, baseConfig, input = project) {
  const result = template.parseWorkbook(input, book, { xlsx, baseConfig });
  assert.equal(result.ok, true, result.errors.join("\n"));
  return result.config;
}

function rejected(book, reason, baseConfig, input = project) {
  const result = template.parseWorkbook(input, book, { xlsx, baseConfig });
  assert.equal(result.ok, false);
  assert.equal(result.config, null);
  assert.match(result.errors.join("\n"), reason);
}

function curveWorkbook(baseConfig, year = null) {
  return template.buildCurveWorkbook(project, baseConfig, { xlsx, year });
}

function parseCurves(book, baseConfig, year = null, input = project) {
  return template.parseCurveWorkbook(input, book, { xlsx, baseConfig, year });
}

function ratioRow(sheet, row, startColumn, values) {
  values.forEach((value, index) => {
    const address = xlsx.utils.encode_cell({ r: row - 1, c: startColumn + index });
    if (value === null) delete sheet[address];
    else sheet[address] = typeof value === "number" ? { t: "n", v: value } : { t: "s", v: value };
  });
}

async function testCurveTemplates() {
  const empty = curveWorkbook();
  assert.deepEqual(empty.SheetNames, curveTabs);
  assert.equal(empty.Sheets[curveTabs[0]].B3.v, "默认典型年");
  assert.equal(empty.Sheets[curveTabs[1]].M1.v, "12月");
  assert.equal(empty.Sheets[curveTabs[2]].Z1.v, "23:00");
  assert.equal(empty.Sheets[curveTabs[1]].A3.v, "联络线负荷");
  assert.equal(empty.Sheets[curveTabs[1]].A4.v, "风电出力");
  assert.equal(empty.Sheets[curveTabs[1]].B2, undefined);
  const emptyResult = parseCurves(empty);
  assert.equal(emptyResult.ok, true, emptyResult.errors.join("\n"));
  assert.equal(emptyResult.changedRows, 0);
  empty.Sheets[curveTabs[1]] = { "!ref": "A1:A1", A1: { t: "z" } };
  assert.equal(parseCurves(empty).ok, true, "a styling-only curve tab preserves current data");

  const legacy = configured();
  const prefilled = curveWorkbook(legacy);
  assert.equal(prefilled.Sheets[curveTabs[1]].B2.v, 31 / 365);
  assert.match(prefilled.Sheets[curveTabs[1]].B2.z, /%/);
  const original = JSON.stringify(legacy);
  const unchanged = await template.readCurveFile(project, fileFor(prefilled), { xlsx, baseConfig: legacy });
  assert.equal(unchanged.ok, true, unchanged.errors.join("\n"));
  assert.equal(unchanged.changedRows, 0);
  assert.equal(domain.fingerprint(project, unchanged.config), domain.fingerprint(project, legacy));
  assert.equal(JSON.stringify(legacy), original);

  const selected = curveWorkbook(legacy, 2028);
  assert.equal(selected.Sheets[curveTabs[0]].B3.v, 2028);
  delete selected.Sheets[curveTabs[1]];
  selected.SheetNames.splice(1, 1);
  const hourly = selected.Sheets[curveTabs[2]];
  ratioRow(hourly, 2, 2, [0, "8.33333333333333%", ...Array(22).fill(null)]);
  const selectedResult = await template.readCurveFile(project, fileFor(selected), { xlsx, baseConfig: legacy, year: 2028 });
  assert.equal(selectedResult.ok, true, selectedResult.errors.join("\n"));
  assert.deepEqual(selectedResult.changes, [{ key: "load", branch: undefined, label: "省内负荷", month: 1, year: 2028 }]);
  const share = selectedResult.config;
  const expectedHours = [0, 0.0833333333333333, ...Array(22).fill(1 / 24)];
  assert.deepEqual(share.elements.load.curveOverridesByYear[2028], { hourlyWeightsByMonth: { 1: expectedHours } });
  assert.deepEqual(domain.getCurve(share.elements.load, 2027).hourlyWeightsByMonth[1], Array(24).fill(1 / 24));
  assert.deepEqual(domain.getCurve(share.elements.load, 2028).hourlyWeightsByMonth[2], Array(24).fill(1 / 24));
  assert.deepEqual(share.elements.load.growthRatesByYear, legacy.elements.load.growthRatesByYear);
  assert.equal(share.elements.load.baseEnergyMwh, legacy.elements.load.baseEnergyMwh);
  assert.equal(JSON.stringify(legacy), original);

  const restore = curveWorkbook(share, 2028);
  const restoreHours = restore.Sheets[curveTabs[2]];
  ratioRow(restoreHours, 2, 2, Array(24).fill(1 / 24));
  const restored = parseCurves(restore, share, 2028);
  assert.equal(restored.ok, true, restored.errors.join("\n"));
  assert.equal(restored.changedRows, 1);
  assert.equal(restored.config.elements.load.curveOverridesByYear?.[2028], undefined);

  const monthlyOnly = curveWorkbook();
  ratioRow(monthlyOnly.Sheets[curveTabs[1]], 2, 1, [1, ...Array(11).fill(0)]);
  const monthPatch = parseCurves(monthlyOnly);
  assert.equal(monthPatch.ok, true, monthPatch.errors.join("\n"));
  assert.equal(monthPatch.changedRows, 1);
  assert.equal(monthPatch.config.elements.load.baseEnergyMwh, null);
  assert.deepEqual(monthPatch.config.elements.load.monthlyWeights, [1, ...Array(11).fill(0)]);
  ratioRow(monthlyOnly.Sheets[curveTabs[1]], 2, 1, [0.5, ...Array(11).fill(0)]);
  const notOne = parseCurves(monthlyOnly);
  assert.equal(notOne.ok, false);
  assert.match(notOne.errors[0], /分月占比!B2 省内负荷分月占比.+1/);
  ratioRow(monthlyOnly.Sheets[curveTabs[1]], 2, 1, [-0.01, ...Array(11).fill(0)]);
  assert.match(parseCurves(monthlyOnly).errors[0], /分月占比!B2 省内负荷分月占比/);
  ratioRow(monthlyOnly.Sheets[curveTabs[1]], 2, 1, ["无数据", ...Array(11).fill(0)]);
  assert.match(parseCurves(monthlyOnly).errors[0], /分月占比!B2 须填写有效占比/);
  assert.match(parseCurves(selected, legacy, 2029).errors[0], /范围与当前选择不符/);
  assert.match(parseCurves(selected, legacy, 2028, { ...project, forecastYears: 2 }).errors[0], /周期与项目不符/);
  assert.match(parseCurves(selected, legacy, 2030).errors[0], /测算周期内的曲线年份/);

  const dual = domain.prepareShareConfig(project, legacy);
  dual.elements.tieLine.mode = "bidirectional";
  const dualWorkbook = curveWorkbook(dual);
  assert.equal(dualWorkbook.Sheets[curveTabs[0]].B4.v, "双向");
  assert.equal(dualWorkbook.Sheets[curveTabs[1]].A3.v, "联络线送出");
  assert.equal(dualWorkbook.Sheets[curveTabs[1]].A4.v, "联络线受入");
  assert.match(parseCurves(dualWorkbook, legacy).errors[0], /联络线方式与当前选择不符/);
  const dualYear = curveWorkbook(dual, 2029);
  ratioRow(dualYear.Sheets[curveTabs[1]], 3, 1, [1, ...Array(11).fill(0)]);
  const dualPatch = parseCurves(dualYear, dual, 2029);
  assert.equal(dualPatch.ok, true, dualPatch.errors.join("\n"));
  assert.equal(dualPatch.changes[0].branch, "export");
  assert.deepEqual(dualPatch.config.elements.tieLine.export.curveOverridesByYear[2029].monthlyWeights, [1, ...Array(11).fill(0)]);
  assert.deepEqual(dualPatch.config.elements.tieLine.import, dual.elements.tieLine.import);

  const olderSource = configured();
  olderSource.elements.load.baseEnergyMwh = 1;
  olderSource.elements.load.monthlyWeights = [1, ...Array(11).fill(0)];
  const compat = await template.readCurveFile(project, fileFor(workbook(olderSource)), { xlsx, baseConfig: share, allowLegacy: true });
  assert.equal(compat.ok, true, compat.errors.join("\n"));
  assert.equal(compat.legacy, true);
  assert.equal(compat.changedRows, 1);
  assert.equal(compat.config.elements.load.baseEnergyMwh, share.elements.load.baseEnergyMwh);
  assert.deepEqual(compat.config.elements.load.monthlyWeights, [1, ...Array(11).fill(0)]);
  assert.deepEqual(compat.config.elements.load.curveOverridesByYear, share.elements.load.curveOverridesByYear);
  const legacyWrongScope = await template.readCurveFile(project, fileFor(workbook(olderSource)),
    { xlsx, baseConfig: share, allowLegacy: true, year: 2028 });
  assert.match(legacyWrongScope.errors[0], /切换到默认典型年/);

  let filename;
  template.downloadCurves(project, share, { year: 2028, xlsx: { ...xlsx, writeFile(book, name) {
    assert.deepEqual(book.SheetNames, curveTabs);
    filename = name;
  } } });
  assert.equal(filename, "测试-供需_供需曲线模板_2027-2029_2028年.xlsx");
}

async function run() {
  const blank = template.buildWorkbook(project, undefined, { xlsx });
  assert.deepEqual(blank.SheetNames, keys);
  assert.equal(blank.Sheets[keys[0]].B2.v, 2027);
  assert.equal(blank.Sheets[keys[0]].D2.v, 2029);
  assert.equal(blank.Sheets[keys[0]].C7.v, "2028年增长率（%）");
  assert.equal(blank.Sheets[keys[0]].B8, undefined);
  assert.equal(blank.Sheets[keys[1]].M1.v, "12月");
  assert.equal(blank.Sheets[keys[2]].Z1.v, "23:00");
  rejected(blank, /省内负荷首年电量/);

  const original = configured();
  original.elements.load.growthRatesByYear[2028] = 1.125;
  original.elements.tieLine.export.baseEnergyMwh = 50;
  original.elements.tieLine.import.baseEnergyMwh = 60;
  original.elements.hydro.monthlyWeights[3] = 0;
  original.elements.hydro.hourlyWeightsByMonth[4] = ["旧草稿"];
  original.elements.nonMarket.monthlyWeights = ["待补充"];
  original.sourceNote = "历史项目";
  const unchanged = JSON.stringify(original);
  const restored = await template.readFile(project, fileFor(workbook(original)), { xlsx, baseConfig: original });
  assert.equal(restored.ok, true, restored.errors.join("\n"));
  assert.deepEqual(restored.config, original);
  assert.equal(domain.fingerprint(project, restored.config), domain.fingerprint(project, original));
  assert.equal(domain.buildAnnualSummary(project, restored.config).annualRows[0].tieLine, -500);
  assert.equal(JSON.stringify(original), unchanged);

  const sparse = configured();
  delete sparse.elements.tieLine.export;
  delete sparse.elements.tieLine.import;
  delete sparse.elements.nonMarket.monthlyWeights;
  delete sparse.elements.nonMarket.hourlyWeightsByMonth;
  assert.deepEqual(accepted(workbook(sparse), sparse), sparse);

  const bidirectional = workbook();
  const bidirectionalAnnual = bidirectional.Sheets[keys[0]];
  bidirectionalAnnual.B3.v = "双向";
  for (const [row, value] of [[10, 1000], [11, 500]]) {
    bidirectionalAnnual[`B${row}`] = { t: "n", v: value };
    bidirectionalAnnual[`C${row}`] = { t: "n", v: 0 };
    bidirectionalAnnual[`D${row}`] = { t: "n", v: 0 };
  }
  const monthly = bidirectional.Sheets[keys[1]];
  for (const row of [4, 5]) {
    for (let col = 1; col <= 12; col += 1) monthly[xlsx.utils.encode_cell({ r: row - 1, c: col })] = { t: "n", v: 1 };
  }
  const hourly = bidirectional.Sheets[keys[2]];
  for (let row = 26; row <= 49; row += 1) {
    for (let col = 2; col <= 25; col += 1) hourly[xlsx.utils.encode_cell({ r: row - 1, c: col })] = { t: "n", v: 1 };
  }
  const dual = accepted(bidirectional);
  const firstDual = domain.buildAnnualSummary(project, dual).annualRows[0];
  assert.equal(firstDual.tieLine, 500);
  assert.equal(firstDual.tieLineExport, 1000);
  assert.equal(firstDual.tieLineImport, 500);
  bidirectionalAnnual.B10.v = -100;
  rejected(bidirectional, /联络线送出首年电量须填写非负/);

  const percentage = workbook();
  percentage.Sheets[keys[0]].C8 = { t: "n", v: 0.025, z: "0.00%" };
  percentage.Sheets[keys[0]].D8 = { t: "s", v: "-10%" };
  percentage.Sheets[keys[1]].B2 = { t: "s", v: "4%" };
  const percentResult = await template.readFile(project, fileFor(percentage), { xlsx });
  assert.equal(percentResult.ok, true, percentResult.errors.join("\n"));
  assert.deepEqual(percentResult.config.elements.load.growthRatesByYear, { 2028: 2.5, 2029: -10 });
  assert.equal(percentResult.config.elements.load.monthlyWeights[0], 0.04);
  percentage.Sheets[keys[0]].C8 = { t: "s", v: "待补充" };
  rejected(percentage, /年度电量与增长率!C8 须填写有效增长率/);

  const duplicate = workbook();
  duplicate.Sheets[keys[1]].A3.v = duplicate.Sheets[keys[1]].A2.v;
  rejected(duplicate, /分月权重!A3.+省内负荷.+重复/);
  const missing = workbook();
  delete missing.Sheets[keys[2]].A97;
  delete missing.Sheets[keys[2]].B97;
  rejected(missing, /典型日分时.+缺少.+非市场化出力12月/);
  const invalidMonth = workbook();
  invalidMonth.Sheets[keys[2]].B2 = { t: "s", v: "1%" };
  rejected(invalidMonth, /典型日分时!B2 的月份须为 1 至 12/);
  const invalidVersion = workbook();
  invalidVersion.Sheets[keys[0]].B1.v = 2;
  rejected(invalidVersion, /年度电量与增长率!B1/);
  const invalidUnit = workbook();
  invalidUnit.Sheets[keys[0]].B7.v = "首年电量（kWh）";
  rejected(invalidUnit, /年度电量与增长率!B7.+MWh/);
  const invalidSheet = workbook();
  delete invalidSheet.Sheets[keys[1]];
  rejected(invalidSheet, /缺少「分月权重」工作表/);

  const changedProject = { ...project, startYear: 2028 };
  const prior = configured();
  prior.elements.load.growthRatesByYear[2029] = 4;
  rejected(workbook(prior), /模板测算周期与项目不符/, prior, changedProject);
  const refreshed = workbook(prior, changedProject);
  assert.equal(refreshed.Sheets[keys[0]].B8, undefined);
  assert.equal(refreshed.Sheets[keys[0]].C8.v, 4);
  assert.equal(refreshed.Sheets[keys[0]].D8, undefined);
  assert.equal(refreshed.Sheets[keys[1]].B2.v, 31);
  assert.equal(refreshed.Sheets[keys[2]].C2.v, 1);
  const oneYear = { ...project, forecastYears: 1 };
  const extraColumn = workbook(configured(oneYear), oneYear);
  extraColumn.Sheets[keys[0]].C8 = { t: "n", v: 10 };
  rejected(extraColumn, /年度电量与增长率!C8 超出当前测算周期/, undefined, oneYear);

  const wrongExtension = await template.readFile(project, { ...fileFor(workbook()), name: "供需.csv" }, { xlsx });
  assert.match(wrongExtension.errors[0], /\.xlsx/);
  const oversized = await template.readFile(project, { name: "供需.xlsx", size: 6 * 1024 * 1024 }, { xlsx });
  assert.match(oversized.errors[0], /5 MB/);
  let savedFilename;
  template.download(project, configured(), { xlsx: { ...xlsx, writeFile(book, filename) {
    assert.deepEqual(book.SheetNames, keys);
    savedFilename = filename;
  } } });
  assert.equal(savedFilename, "测试-供需_供需配置模板_2027-2029.xlsx");
  await testCurveTemplates();
  console.log("supply-demand Excel template tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
