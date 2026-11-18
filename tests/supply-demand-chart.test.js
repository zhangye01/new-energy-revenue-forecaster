"use strict";

const assert = require("node:assert/strict");
const { buildOption } = require("../src/ui/supply-demand-chart");
const { buildDataset, createConfig, MONTH_DAYS } = require("../src/domain/supply-demand");

const project = { id: "supply-area", province: "jiangsu", startYear: 2028, forecastYears: 2 };
const config = createConfig(project);

function setAnnualRate(series, hourlyMean, activeHour) {
  series.baseEnergyMwh = hourlyMean * 8760;
  series.growthRatesByYear[2029] = 0;
  series.monthlyWeights = [...MONTH_DAYS];
  for (const month of MONTH_DAYS.keys()) {
    series.hourlyWeightsByMonth[month + 1] = Array.from({ length: 24 }, (_, hour) =>
      activeHour === undefined || activeHour === hour ? 1 : 0);
  }
}

for (const [key, hourlyMean] of Object.entries({ load: 4, tieLine: -1, wind: 1.5, solar: 0.5, hydro: 1, nonMarket: 1 })) {
  setAnnualRate(config.elements[key], hourlyMean);
}
config.elements.wind.growthRatesByYear[2029] = 100;

const netDataset = buildDataset(project, config);
assert.equal(netDataset.ok, true, netDataset.errors.join("\n"));
const readingsBefore = JSON.stringify(netDataset.typicalRows);
netDataset.typicalRows.forEach(Object.freeze);
Object.freeze(netDataset.typicalRows);
const monthly = buildOption(netDataset, { year: 2028 });
const typical = buildOption(netDataset, { year: 2028, month: 2, granularity: "typical", width: 350 });
const netExport = structuredClone(config);
netExport.elements.tieLine.baseEnergyMwh = 8760;
const exporter = buildOption(buildDataset(project, netExport), { year: 2028, month: 2, granularity: "typical" });
const data = (option, key) => option.series.find((series) => series.id === key).data;
const close = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-8, `${value} ≠ ${expected}`);

assert.deepEqual(monthly.xAxis.data, Array.from({ length: 12 }, (_, index) => `${index + 1}月`));
assert.equal(typical.xAxis.data.length, 24);
assert.deepEqual([typical.xAxis.data[0], typical.xAxis.data.at(-1)], ["00:00", "23:00"]);
assert.equal(typical.yAxis.name, "MWh");
assert.deepEqual(monthly.series.map(({ id }) => id), ["wind", "solar", "hydro", "nonMarket", "tieLineImport", "demand"]);
assert.ok(monthly.series.slice(0, 5).every(({ stack, areaStyle, type }) => stack === "supply" && areaStyle && type === "line"));
assert.equal(monthly.series[5].areaStyle, undefined);
assert.equal(monthly.series[5].stack, undefined);
assert.equal(typical.xAxis.axisLabel.interval(23), true);
assert.equal(typical.xAxis.axisLabel.interval(22), false);
close(data(typical, "tieLineImport")[0], 1);
close(data(typical, "demand")[0], 4);
close(data(exporter, "tieLineImport")[0], 0);
close(data(exporter, "demand")[0], 5);
close(data(monthly, "wind")[0], 1.5 * 24 * 31);
close(data(monthly, "wind")[1], 1.5 * 24 * 28);
close(data(buildOption(netDataset, { year: 2029 }), "wind")[1], 3 * 24 * 28);
close(data(monthly, "demand").reduce((sum, value) => sum + value, 0), netDataset.annualRows[0].load);
const netHover = typical.tooltip.formatter([{ dataIndex: 0 }]);
assert.match(netHover, /2028年2月典型日 00:00.*供给合计.*5 MWh.*总需求.*4 MWh.*剩余需求.*-1 MWh/);
assert.equal(JSON.stringify(netDataset.typicalRows), readingsBefore, "view and tooltip must not modify the saved result");

const dualConfig = structuredClone(config);
const tie = dualConfig.elements.tieLine;
tie.mode = "bidirectional";
setAnnualRate(tie.export, 2, 0);
setAnnualRate(tie.import, 2, 18);
const dualDataset = buildDataset(project, dualConfig);
assert.equal(dualDataset.ok, true, dualDataset.errors.join("\n"));
assert.equal(dualDataset.annualRows[0].tieLine, 0);
const dual = buildOption(dualDataset, { year: 2028, month: 1, granularity: "typical", tokens: { ink: "#111111" } });
close(data(dual, "tieLineImport")[0], 0);
close(data(dual, "tieLineImport")[18], 48);
close(data(dual, "demand")[0], 52);
close(data(dual, "demand")[18], 4);
assert.equal(dual.series[5].lineStyle.color, "#111111");
assert.match(dual.tooltip.formatter([{ dataIndex: 0 }]), /剩余需求.*\+48 MWh.*联络线送出.*48 MWh/);
assert.equal(buildOption(netDataset, { year: 2027 }), null);
assert.equal(buildOption(netDataset, { year: 2028, month: 13, granularity: "typical" }), null);
assert.equal(buildOption({ ok: false }, { year: 2028 }), null);
const duplicatedRows = { ...netDataset, typicalRows: [netDataset.typicalRows[1], ...netDataset.typicalRows.slice(1)] };
assert.equal(buildOption(duplicatedRows, { year: 2028 }), null, "duplicated hours must not create inflated chart totals");

console.log("supply demand chart tests passed");
