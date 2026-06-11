"use strict";

const assert = require("node:assert/strict");
const {
  bindWindowResizeOnce,
  isLiveChart,
  queueDoubleFrame,
  resizeChart,
  resizeCharts,
  toChartArray
} = require("../src/ui/chart-lifecycle");

function makeChart(disposed = false) {
  return {
    count: 0,
    isDisposed: () => disposed,
    resize() {
      this.count += 1;
    }
  };
}

const liveChart = makeChart(false);
const disposedChart = makeChart(true);
assert.equal(isLiveChart(liveChart), true);
assert.equal(isLiveChart(disposedChart), false);
assert.equal(isLiveChart({}), false);
assert.equal(resizeChart(liveChart), true);
assert.equal(resizeChart(disposedChart), false);
assert.equal(liveChart.count, 1);
assert.equal(disposedChart.count, 0);

const chartA = makeChart(false);
const chartB = makeChart(false);
const chartC = makeChart(true);
assert.deepEqual(toChartArray(null), []);
assert.deepEqual(toChartArray([chartA]), [chartA]);
assert.deepEqual(toChartArray(new Map([["a", chartA]])), [chartA]);
assert.deepEqual(toChartArray({ chartA, chartB }), [chartA, chartB]);
assert.deepEqual(toChartArray(chartA), [chartA]);
assert.equal(resizeCharts([chartA, chartB, chartC]), 2);
assert.equal(chartA.count, 1);
assert.equal(chartB.count, 1);
assert.equal(chartC.count, 0);

const resizeCalls = [];
const resizeWindow = {
  addEventListener(name, handler) {
    resizeCalls.push(name);
    this.handler = handler;
  }
};
assert.equal(bindWindowResizeOnce({ windowRef: resizeWindow, resize: () => resizeCalls.push("resize") }), true);
assert.deepEqual(resizeCalls, ["resize"]);
resizeWindow.handler();
assert.deepEqual(resizeCalls, ["resize", "resize"]);
assert.equal(bindWindowResizeOnce({ windowRef: resizeWindow, isBound: true, resize: () => resizeCalls.push("again") }), true);
assert.deepEqual(resizeCalls, ["resize", "resize"]);
assert.equal(bindWindowResizeOnce(), false);

const frameCalls = [];
const frameWindow = {
  requestAnimationFrame(callback) {
    frameCalls.push("frame");
    callback();
  }
};
assert.equal(queueDoubleFrame({ windowRef: frameWindow, callback: () => frameCalls.push("callback") }), true);
assert.deepEqual(frameCalls, ["frame", "frame", "callback"]);
assert.equal(queueDoubleFrame(), false);

console.log("chart lifecycle tests passed");
