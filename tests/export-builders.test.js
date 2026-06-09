"use strict";

const assert = require("node:assert/strict");
const {
  buildAnnualResultExportFilename,
  buildHourlyResultExportFilename,
  buildAnnualResultExportRows,
  buildHourlyResultExportRows,
  buildLtManualTemplateFilename,
  buildEnvManualTemplateFilename,
  buildFeeManualTemplateFilename
} = require("../src/domain/export-builders");

const project = { name: "江苏/海上 风电" };
const scenario = { name: "基准:乐观" };

assert.equal(buildLtManualTemplateFilename(project, scenario), "江苏-海上风电-基准-乐观-交易策略逐年损益模板.csv");
assert.equal(buildEnvManualTemplateFilename(project, scenario), "江苏-海上风电-基准-乐观-环境价值逐年兑现模板.csv");
assert.equal(buildFeeManualTemplateFilename(project, scenario), "江苏-海上风电-基准-乐观-逐年扣费收益模板.csv");
assert.equal(buildAnnualResultExportFilename(project, scenario), "江苏-海上风电-基准-乐观-年度收入.csv");
assert.equal(buildHourlyResultExportFilename(project, scenario), "江苏-海上风电-基准-乐观-首年8760小时明细.csv");

const annualRows = buildAnnualResultExportRows({
  annualRows: [{
    year: 2026,
    annualHours: 2000,
    energyMwh: 64000,
    spotAvgPrice: 302.1234567,
    capturePrice: 301.987654,
    spotRevenue: 19327210.9,
    mechanismRevenue: 1200,
    ltPnlRevenue: 800,
    envRevenue: 300,
    storageSupplementRevenue: 400,
    comprehensiveFee: 500,
    otherIncome: 60,
    fullRevenue: 19329470.9,
    fullRevenuePrice: 302.023
  }]
});
assert.equal(annualRows[0][0], "year");
assert.deepEqual(annualRows[1], [
  2026,
  "2000.000000",
  "64000.000000",
  "302.123457",
  "301.987654",
  "19327210.90",
  "1200.00",
  "800.00",
  "300.00",
  "400.00",
  "500.00",
  "60.00",
  "19329470.90",
  "302.023000"
]);

const hourlyRows = buildHourlyResultExportRows({
  hourlyPreview: [{
    time: "2026-01-01 00:00",
    equivalentHours: 0.22831,
    energyMwh: 14.61184,
    spotPrice: 301.23456,
    spotRevenue: 4400.998,
    fullRevenue: 4512.123
  }]
});
assert.equal(hourlyRows[0][0], "time");
assert.deepEqual(hourlyRows[1], [
  "2026-01-01 00:00",
  "0.228310",
  "14.611840",
  "301.234560",
  "4401.00",
  "4512.12"
]);

console.log("export builders tests passed");

