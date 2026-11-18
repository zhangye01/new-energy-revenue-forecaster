"use strict";

const assert = require("node:assert/strict");
const xlsx = require("../vendor/xlsx.full.min");
const domain = require("../src/domain/supply-demand");
const template = require("../src/ui/supply-demand-template");

const project = { id: "xlsx-project", name: "测试/供需", province: "jiangsu", startYear: 2027, forecastYears: 3 };
const keys = ["年度电量与增长率", "分月权重", "典型日分时"];

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
  console.log("supply-demand Excel template tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
