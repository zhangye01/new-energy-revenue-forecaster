"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_CHART_LIFECYCLE = api;
  if (root.window && root.window !== root) {
    root.window.NE_CHART_LIFECYCLE = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function isLiveChart(chart) {
    if (!chart || typeof chart.resize !== "function") return false;
    return typeof chart.isDisposed !== "function" || !chart.isDisposed();
  }

  function toChartArray(charts) {
    if (!charts) return [];
    if (Array.isArray(charts)) return charts;
    if (charts instanceof Map) return Array.from(charts.values());
    if (typeof charts === "object" && typeof charts.resize !== "function") return Object.values(charts);
    return [charts];
  }

  function resizeChart(chart) {
    if (!isLiveChart(chart)) return false;
    chart.resize();
    return true;
  }

  function resizeCharts(charts) {
    return toChartArray(charts).reduce((count, chart) => count + (resizeChart(chart) ? 1 : 0), 0);
  }

  function bindWindowResizeOnce(input = {}) {
    const {
      windowRef = null,
      isBound = false,
      resize = () => {}
    } = input;
    if (isBound) return true;
    if (!windowRef || typeof windowRef.addEventListener !== "function") return false;
    windowRef.addEventListener("resize", resize);
    return true;
  }

  function queueDoubleFrame(input = {}) {
    const {
      windowRef = null,
      callback = () => {}
    } = input;
    if (!windowRef || typeof windowRef.requestAnimationFrame !== "function") return false;
    windowRef.requestAnimationFrame(() => {
      windowRef.requestAnimationFrame(callback);
    });
    return true;
  }

  return Object.freeze({
    bindWindowResizeOnce,
    isLiveChart,
    queueDoubleFrame,
    resizeChart,
    resizeCharts,
    toChartArray
  });
});
