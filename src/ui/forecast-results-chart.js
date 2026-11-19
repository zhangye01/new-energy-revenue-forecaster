"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_FORECAST_RESULTS_CHART = api;
  if (root.window && root.window !== root) root.window.NE_FORECAST_RESULTS_CHART = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const STYLES = [
    { code: "lstm", label: "LSTM", color: "blue", stroke: "solid", symbol: "circle" },
    { code: "xgboost", label: "XGBoost", color: "orange", stroke: "dashed", symbol: "diamond" },
    { code: "ensemble", label: "Ensemble", color: "green", stroke: "solid", symbol: "rect" }
  ];
  const COLORS = { blue: "#1f5ea8", orange: "#b26e12", green: "#16895c", ink: "#182b40", muted: "#536477",
    line: "#e2e8f0", lineStrong: "#aab8ca", panel: "#ffffff" };
  const axisNumber = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  const priceNumber = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const scientificPrice = new Intl.NumberFormat("zh-CN", { notation: "scientific", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function priceAxis(values) {
    const lowest = Math.min(...values), highest = Math.max(...values);
    // Scale the plotted numbers before measuring their span so both extreme
    // positive and negative backend values fit ECharts' finite linear scale.
    const magnitude = Math.max(Math.abs(lowest), Math.abs(highest));
    const exponent = magnitude > 1e9 ? Math.floor(Math.log10(magnitude)) : 0;
    const scale = 10 ** exponent;
    const bottom = lowest / scale, top = highest / scale, span = top - bottom;
    const margin = Math.max(exponent ? 0.02 : 1, span * 0.07, span === 0 ? Math.abs(top) * 0.02 : 0);
    const target = (span + 2 * margin) / 5;
    const base = 10 ** Math.floor(Math.log10(target));
    const step = [1, 2, 2.5, 5, 10].map((factor) => base * factor).find((value) => value >= target);
    const interval = Math.max(exponent ? 0.01 : 1, step ?? base * 10);
    return { scale, interval,
      min: Math.floor((bottom - margin) / interval) * interval,
      max: Math.ceil((top + margin) / interval) * interval,
      formatter: (value) => exponent && value !== 0 ? `${axisNumber.format(value)}e+${exponent}` : axisNumber.format(value)
    };
  }

  function yearInterval(length, width) {
    const last = length - 1;
    const usable = Math.max(1, (Number.isFinite(width) && width > 0 ? width : 760) - 82);
    const capacity = Math.max(2, Math.min(9, Math.floor(usable / 68) + 1));
    const interval = Math.max(1, Math.ceil(last / (capacity - 1)));
    const edgeGap = last * 36 / usable;
    return (index) => index === 0 || index === last || (index % interval === 0 && last - index >= edgeGap);
  }

  function tooltipFormatter(years, models, visibleByCode) {
    const byYear = new Map(years.map((year, index) => [String(year), index]));
    return (params) => {
      const hovered = Array.isArray(params) ? params[0] : params;
      const index = byYear.get(String(hovered?.axisValue)) ?? hovered?.dataIndex;
      if (!Number.isInteger(index) || years[index] === undefined) return "";
      const values = models.filter(({ code }) => visibleByCode?.[code] !== false).map(({ label, prices }) => {
        const price = prices[index];
        const text = !Number.isFinite(price) ? "—" : (Math.abs(price) >= 1e12 ? scientificPrice : priceNumber).format(price);
        return `${escapeHtml(label)}　${text}`;
      });
      return values.length ? `<strong>${years[index]} 年</strong>　元/MWh<br>${values.join("<br>")}` : "";
    };
  }

  function modelSeries(input, years) {
    return STYLES.flatMap((style) => {
      const raw = input.find((series) => series?.code === style.code);
      if (!raw) return [];
      const label = typeof raw.label === "string" && raw.label.trim() ? raw.label : style.label;
      const prices = years.map((_, index) => Number.isFinite(raw.prices?.[index]) ? raw.prices[index] : null);
      return prices.some(Number.isFinite) ? [{ ...style, label, prices }] : [];
    });
  }

  function buildOption(data, visibleByCode = {}, tokens = {}, width) {
    const { years, series } = data ?? {};
    if (!Array.isArray(years) || !years.length || !Array.from(years).every(Number.isInteger) || !Array.isArray(series)) return null;
    const models = modelSeries(series, years);
    const values = models.flatMap(({ prices }) => prices).filter(Number.isFinite);
    if (!values.length) return null;
    const colors = { ...COLORS, ...tokens };
    const axis = priceAxis(values);
    const labels = years.map(String);
    const axisLabel = { color: colors.muted, fontSize: 11 };
    const symbolSize = years.length === 1 ? 8 : Number.isFinite(width) && width > 0 && width < 480 ? 4 : 6;
    return {
      animation: false,
      aria: { enabled: true, label: { description: "各模型的年度现货均价趋势，单位元/MWh。" } },
      grid: { left: 12, right: 19, top: 20, bottom: 12, containLabel: true },
      legend: { show: false, selectedMode: "multiple", data: models.map(({ label }) => label),
        selected: Object.fromEntries(models.map(({ code, label }) => [label, visibleByCode?.[code] !== false])) },
      tooltip: { trigger: "axis", triggerOn: "mousemove|click", confine: true, transitionDuration: 0,
        className: "forecast-result-chart-tooltip",
        backgroundColor: colors.panel, borderColor: colors.lineStrong, borderWidth: 1,
        textStyle: { color: colors.ink, fontSize: 12 }, padding: [8, 11],
        axisPointer: { axis: "x", type: "line", snap: true, lineStyle: { color: colors.lineStrong, type: "dashed" } },
        formatter: tooltipFormatter(years, models, visibleByCode) },
      xAxis: { type: "category", boundaryGap: labels.length === 1, data: labels,
        axisTick: { show: false }, axisLine: { onZero: false, lineStyle: { color: colors.lineStrong } },
        axisLabel: { ...axisLabel, interval: yearInterval(labels.length, width), showMinLabel: true, showMaxLabel: true } },
      yAxis: { type: "value", min: axis.min, max: axis.max, interval: axis.interval,
        axisLine: { show: true, lineStyle: { color: colors.lineStrong } }, axisTick: { show: false },
        axisLabel: { ...axisLabel, formatter: axis.formatter }, splitLine: { show: true, lineStyle: { color: colors.line } } },
      series: models.map(({ code, label, color, stroke, symbol, prices }, index) => ({
        id: code, name: label, type: "line", smooth: false, connectNulls: false, z: index + 2,
        showSymbol: true, showAllSymbol: true, symbol, symbolSize,
        itemStyle: { color: colors[color] }, lineStyle: { color: colors[color], type: stroke, width: code === "ensemble" ? 2.9 : 2.2 },
        data: prices.map((price) => price === null ? null : price / axis.scale)
      }))
    };
  }

  return Object.freeze({ buildOption });
});
