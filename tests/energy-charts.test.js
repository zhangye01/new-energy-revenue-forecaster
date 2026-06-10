"use strict";

const assert = require("node:assert/strict");
const {
  buildEnergyChartEmptyOption,
  buildAnnualRows,
  hasAnnualValues,
  buildAnnualHoursOption,
  buildTypicalMonthHourlyHours,
  buildTypicalDayCurveOption,
  buildEnergyCurveChartViewModel,
  buildEnergyCurveText
} = require("../src/ui/energy-charts");

const tokens = {
  axisText: "#5b6f89",
  axisLine: "#bfd0e4",
  splitLine: "rgba(151, 170, 196, 0.24)",
  tooltipBg: "rgba(255, 255, 255, 0.96)",
  tooltipBorder: "#c9d8eb"
};

const empty = buildEnergyChartEmptyOption("暂无电量", tokens);
assert.equal(empty.graphic[0].style.text, "暂无电量");
assert.equal(empty.xAxis.show, false);

const annualRows = buildAnnualRows(
  { startYear: 2026, forecastYears: 3 },
  {
    annualSummary: {
      2026: { annualHours: 2300 }
    },
    annualInputByYear: {
      2027: 2400
    }
  }
);
assert.deepEqual(annualRows, [
  { year: 2026, annualHours: 2300 },
  { year: 2027, annualHours: 2400 },
  { year: 2028, annualHours: 0 }
]);
assert.equal(hasAnnualValues(annualRows), true);
assert.equal(hasAnnualValues([{ annualHours: 0 }]), false);

const annualOption = buildAnnualHoursOption(annualRows, tokens);
assert.deepEqual(annualOption.xAxis.data, ["2026", "2027", "2028"]);
assert.deepEqual(annualOption.series[0].data, [2300, 2400, 0]);
assert.equal(annualOption.tooltip.valueFormatter(12.345), "12.35 h");

const profile = Array(8760).fill(1);
const monthHourlyHours = buildTypicalMonthHourlyHours(profile);
assert.equal(monthHourlyHours.length, 12);
assert.equal(monthHourlyHours[0].length, 24);
assert.equal(Number(monthHourlyHours.flat().reduce((sum, value) => sum + value, 0).toFixed(6)), 8760);

const typicalOption = buildTypicalDayCurveOption(profile, tokens);
assert.equal(typicalOption.series.length, 12);
assert.equal(typicalOption.series[0].name, "1月");
assert.equal(typicalOption.xAxis.name, "小时");
assert.equal(typicalOption.tooltip.valueFormatter(8), "8.00 h");
assert.equal(buildTypicalDayCurveOption([1, 2, 3], tokens), null);

assert.deepEqual(buildEnergyCurveText({
  hasAnnualValues: false,
  hasConfiguredTypicalCurve: false,
  sourceLabel: ""
}), {
  subtitle: "横轴为1-24时，纵轴为小时数，图例区分1-12月。",
  note: "请先完成逐年总量模板导入；完成后左图展示年度小时数。"
});

assert.equal(buildEnergyCurveText({
  hasAnnualValues: true,
  hasConfiguredTypicalCurve: true,
  sourceLabel: "江苏典型曲线"
}).note, "左图展示测算周期内逐年总小时数；右图展示江苏典型曲线。");

assert.deepEqual(buildEnergyCurveChartViewModel(), {
  state: "empty",
  noteMessage: "请先进入项目，再查看上网电量图形展示。",
  annualMessage: "请先进入项目，再查看逐年上网电量小时数。",
  typicalMessage: "请先进入项目，再查看典型年日内曲线（月度）。"
});

assert.deepEqual(buildEnergyCurveChartViewModel({
  project: { startYear: 2026, forecastYears: 2 },
  createReady: false
}), {
  state: "empty",
  noteMessage: "请先完成步骤1基础信息保存，再查看上网电量图形展示。",
  annualMessage: "请先完成步骤1基础信息保存，再查看逐年上网电量小时数。",
  typicalMessage: "请先完成步骤1基础信息保存，再查看典型年日内曲线（月度）。"
});

const chartModel = buildEnergyCurveChartViewModel({
  project: { startYear: 2026, forecastYears: 2 },
  createReady: true,
  energyState: {
    hasTypicalCurve: true,
    energyData: {
      annualSummary: { 2026: { annualHours: 2300 } }
    }
  },
  previewMeta: {
    profile,
    sourceLabel: "江苏典型曲线"
  }
});
assert.equal(chartModel.state, "ready");
assert.equal(chartModel.hasAnnualValues, true);
assert.equal(chartModel.typicalProfile, profile);
assert.deepEqual(chartModel.annualRows, [
  { year: 2026, annualHours: 2300 },
  { year: 2027, annualHours: 0 }
]);
assert.equal(chartModel.chartText.subtitle, "当前来源：江苏典型曲线；横轴为1-24时，图例区分1-12月。");
assert.equal(chartModel.annualEmptyMessage, "请先导出逐年总量模板并上传结果。");

console.log("energy charts tests passed");
