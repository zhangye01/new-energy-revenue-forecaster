"use strict";

const assert = require("node:assert/strict");
const projectDisplay = require("../src/domain/project-display");

const provinces = [
  { key: "jiangsu", name: "江苏" },
  { key: "shandong", name: "山东" }
];

assert.equal(projectDisplay.getProvinceName(provinces, "jiangsu"), "江苏");
assert.equal(projectDisplay.getProvinceName(provinces, "unknown"), "unknown");
assert.equal(projectDisplay.getAssetTypeLabel("wind"), "风电");
assert.equal(projectDisplay.getAssetTypeLabel("photovoltaic"), "光伏");
assert.equal(projectDisplay.getAssetTypeLabel(""), "待选");
assert.equal(projectDisplay.getSiteTypeLabel("offshore"), "海上");
assert.equal(projectDisplay.getSiteTypeLabel("onshore"), "陆上");
assert.equal(projectDisplay.getSiteTypeLabel(""), "待选");
assert.equal(projectDisplay.describeProvinceTypicalCurve({
  province: "jiangsu",
  assetType: "wind",
  siteType: "offshore"
}, provinces), "江苏 / 风电 / 海上");
assert.equal(projectDisplay.getForecastPeriodDisplayRange({ startYear: 2026, forecastYears: 3 }), "2026-2028");
assert.equal(projectDisplay.getForecastPeriodDisplayRange({ startYear: 2026, forecastYears: 0 }), "-");
assert.equal(projectDisplay.formatExportStatusTime(""), "");
assert.equal(projectDisplay.formatExportStatusTime("not-a-date"), "");
const localExportTime = new Date(2026, 4, 15, 10, 19, 57).toISOString();
assert.match(projectDisplay.formatExportStatusTime(localExportTime), /^05-15 10:19$/);

const helpers = projectDisplay.createProjectDisplayHelpers({ provinces });
assert.equal(helpers.getProvinceName("shandong"), "山东");
assert.equal(helpers.describeProvinceTypicalCurve({
  province: "shandong",
  assetType: "photovoltaic",
  siteType: "onshore"
}), "山东 / 光伏 / 陆上");

console.log("project display tests passed");
