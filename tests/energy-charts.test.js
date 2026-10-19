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
  buildEnergyCurveText,
  applyEnergyCurveChartRender
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

function makeChart() {
  return {
    cleared: 0,
    options: [],
    clear() {
      this.cleared += 1;
    },
    setOption(option, replace) {
      this.options.push({ option, replace });
    }
  };
}

const emptyAnnualChart = makeChart();
const emptyTypicalChart = makeChart();
const emptyRefs = {
  energyCurveNote: { textContent: "" },
  energyCurveSubtitle: { textContent: "" }
};
applyEnergyCurveChartRender({
  refs: emptyRefs,
  chartModel: buildEnergyCurveChartViewModel(),
  annualChart: emptyAnnualChart,
  typicalChart: emptyTypicalChart,
  tokens
});
assert.match(emptyRefs.energyCurveNote.textContent, /请先进入项目/);
assert.match(emptyRefs.energyCurveSubtitle.textContent, /按月份拆解典型年24小时曲线/);
assert.equal(emptyAnnualChart.cleared, 1);
assert.equal(emptyAnnualChart.options[0].option.graphic[0].style.text, "请先进入项目，再查看逐年上网电量小时数。");
assert.equal(emptyTypicalChart.options[0].replace, true);

const readyAnnualChart = makeChart();
const readyTypicalChart = makeChart();
const readyRefs = {
  energyCurveNote: { textContent: "" },
  energyCurveSubtitle: { textContent: "" }
};
applyEnergyCurveChartRender({
  refs: readyRefs,
  chartModel,
  annualChart: readyAnnualChart,
  typicalChart: readyTypicalChart,
  tokens
});
assert.equal(readyAnnualChart.cleared, 0);
assert.deepEqual(readyAnnualChart.options[0].option.xAxis.data, ["2026", "2027"]);
assert.equal(readyTypicalChart.options[0].option.series.length, 12);
assert.match(readyRefs.energyCurveNote.textContent, /江苏典型曲线/);
assert.match(readyRefs.energyCurveSubtitle.textContent, /当前来源：江苏典型曲线/);

// Returning to the energy page must restore a canvas resized while hidden.
const frames = [];
const windowRef = { requestAnimationFrame(callback) { frames.push(callback); } };
const chartNode = { clientWidth: 850, clientHeight: 320, ownerDocument: { defaultView: windowRef } };
function makeSizedChart() {
  return {
    ...makeChart(), width: 0, disposed: false, resizeCount: 0,
    getDom() { return chartNode; },
    isDisposed() { return this.disposed; },
    resize() { this.width = chartNode.clientWidth; this.resizeCount += 1; }
  };
}
const sizedAnnual = makeSizedChart();
const sizedTypical = makeSizedChart();
const sizedInput = {
  refs: { energyAnnualChart: chartNode, energyCurveChart: chartNode },
  chartModel, annualChart: sizedAnnual, typicalChart: sizedTypical, tokens
};
applyEnergyCurveChartRender(sizedInput);
assert.equal(sizedAnnual.width, 850);
assert.equal(sizedTypical.width, 850);
chartNode.clientWidth = 900;
frames.shift()();
frames.shift()();
assert.equal(sizedAnnual.width, 900, "layout changes settle before the final size check");
assert.equal(sizedTypical.width, 900);
applyEnergyCurveChartRender(sizedInput);
chartNode.clientWidth = 0;
frames.shift()();
frames.shift()();
assert.equal(sizedAnnual.width, 900, "leaving the page before the queued resize preserves the last visible size");
chartNode.clientWidth = 850;
applyEnergyCurveChartRender(sizedInput);
const resizeCount = sizedAnnual.resizeCount;
sizedAnnual.disposed = true;
frames.shift()();
frames.shift()();
assert.equal(sizedAnnual.resizeCount, resizeCount, "queued work ignores charts disposed before the frame runs");
assert.equal(sizedTypical.width, 850);

console.log("energy charts tests passed");
