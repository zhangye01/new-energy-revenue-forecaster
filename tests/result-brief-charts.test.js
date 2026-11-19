"use strict";

const assert = require("node:assert/strict");
const { buildOption, mountCharts, renderImages } = require("../src/ui/result-brief-charts");

const price = {
  key: "price", kind: "trend", years: ["2028", "2029"],
  series: [{ name: "度电净价", values: [431.654, 431.093] }, { name: "捕获电价", values: [447.473, 450.029] },
    { name: "现货均价", values: [439.32, 446.11] }]
};
const income = {
  key: "income", kind: "contribution",
  items: [{ label: "现货市场收入", value: 337104.2454, colorKey: "spot" }, { label: "三项费用", value: -16780.5, colorKey: "fee" }]
};
const bridge = {
  key: "first-price-bridge", kind: "bridge", items: [
    { label: "捕获电价", value: 4, role: "start" }, { label: "交易策略", value: -6, role: "change" },
    { label: "环境价值", value: 3, role: "change" }, { label: "度电净价", value: 1, role: "end" }
  ]
};
const annual = { key: "annual-income", kind: "annual", years: ["2028", "2029"], values: [550, -70] };
const brief = { figures: [price, income, bridge, annual] };
const trend = buildOption(price, 800);
assert.equal(trend.animation, false);
assert.equal(trend.tooltip.show, false);
assert.equal(trend.legend.selectedMode, false);
assert.equal(trend.dataZoom, undefined);
assert.equal(trend.series.every(({ silent }) => silent), true);
assert.deepEqual(trend.series.map(({ data }) => data), price.series.map(({ values }) => values));

const full = buildOption(income, 800);
const narrow = buildOption(income, 360);
assert.ok(narrow.grid.left < full.grid.left);
assert.ok(full.xAxis.min < income.items[1].value && full.xAxis.max > income.items[0].value);
assert.equal(full.series[0].data[1].label.position, "left");
assert.equal(full.series[0].label.formatter({ value: 337104.2454 }), "337,104.25");
assert.deepEqual(full.series[0].data.map(({ value }) => value), income.items.map(({ value }) => value));
assert.equal(buildOption({ ...income, items: [{ label: "现货市场收入", value: 0 }] }, 800).xAxis.max, 1);

const waterfall = buildOption(bridge, 800);
assert.deepEqual(waterfall.series[0].data, [[0, 4, 4, 4], [1, 4, -2, -6], [2, -2, 1, 3], [3, 1, 1, 1]]);
assert.ok(waterfall.xAxis.min < -2 && waterfall.xAxis.max > 4);
const { children } = waterfall.series[0].renderItem({}, {
  value: () => 1, coord: ([value, index]) => [100 + value * 10, index * 40], size: () => [0, 40]
});
const crossingDrop = children.find(({ type }) => type === "rect");
assert.equal(crossingDrop.shape.x, 80);
assert.equal(crossingDrop.shape.width, 60, "从正值跨过零点的扣减需跨越零点绘图");
assert.equal(children.find(({ type }) => type === "line").shape.x1, 80);
assert.match(buildOption(bridge, 340).yAxis.axisLabel.formatter("交易策略", 1), /\n-6\.00$/);
assert.deepEqual(buildOption(annual, 800).series[0].data.map(({ value }) => value), [550, -70]);

const created = [];
const echarts = {
  init(node, theme, settings) {
    const chart = {
      node, theme, settings, options: [], disposed: false, resized: 0,
      setOption(option) { this.options.push(option); },
      resize() { this.resized += 1; },
      dispose() { this.disposed = true; },
      getDataURL(settings) {
        assert.equal(settings.pixelRatio, 2);
        return "data:image/png;base64,AA==";
      }
    };
    created.push(chart);
    return chart;
  }
};
const plottedNode = { clientWidth: 800, clientHeight: 290 };
const live = new Map();
const windowRef = {
  addEventListener(name, listener) { live.set(name, listener); },
  removeEventListener(name, listener) { assert.equal(listener, live.get(name)); live.delete(name); }
};
const cleanup = mountCharts({
  querySelector(selector) { return selector === '[data-brief-chart="income"]' ? plottedNode : null; }
}, brief, { echarts, windowRef });
assert.equal(created.length, 1);
assert.equal(created[0].settings.renderer, "canvas");
assert.ok(created[0].options[0].grid.left === full.grid.left);
plottedNode.clientWidth = 360;
live.get("resize")();
assert.equal(created[0].resized, 1);
assert.equal(created[0].options[1].grid.left, narrow.grid.left);
cleanup();
assert.ok(created[0].disposed);
assert.equal(live.size, 0);

const nodes = new Set();
const documentRef = {
  body: { appendChild(node) { nodes.add(node); } },
  createElement() { return { style: {}, setAttribute() {}, remove() { nodes.delete(this); } }; }
};
const images = renderImages(brief, { echarts, documentRef });
assert.deepEqual(images.map(({ key }) => key), ["price", "income", "first-price-bridge", "annual-income"]);
assert.ok(images.every(({ width, height, dataUrl }) => width === 800 && height >= 200 && dataUrl.startsWith("data:image/png")));
assert.deepEqual(created[1].options[0].series.map(({ data }) => data), trend.series.map(({ data }) => data));
assert.deepEqual(created[2].options[0].series[0].data, full.series[0].data);
assert.deepEqual(created[3].options[0].series[0].data, waterfall.series[0].data);
assert.equal(nodes.size, 0);
assert.ok(created.every(({ disposed }) => disposed), "网页清理与 Word 图表导出均应释放实例");
assert.throws(() => renderImages(brief, { documentRef }), /图表尚未载入/);
console.log("result brief chart tests passed");
