"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_RESULT_BRIEF_CHARTS = api;
  if (root.window && root.window !== root) root.window.NE_RESULT_BRIEF_CHARTS = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const PAPER = "#ffffff";
  const INK = "#344256";
  const GRID = "#e3eaf1";
  const PRICE_COLORS = ["#155f94", "#18786b", "#a36c30"];
  const TOTAL_COLOR = "#155f94";
  const INCREASE_COLOR = "#18786b";
  const DECREASE_COLOR = "#a35037";
  const NUMBER_FORMAT = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  const AMOUNT_FORMAT = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const OPTIONS = {
    animation: false,
    backgroundColor: PAPER,
    textStyle: { color: INK, fontFamily: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif' },
    tooltip: { show: false }
  };
  const AXIS_LINE = { lineStyle: { color: "#b9c6d4" } };
  const SPLIT_LINE = { lineStyle: { color: GRID } };
  const AXIS_LABEL = { color: INK, fontSize: 11 };
  const AXIS_NAME = { color: INK, fontSize: 11 };

  function yearAxis(years, width, boundaryGap) {
    const lastYearIndex = years.length - 1;
    const every = Math.max(1, Math.ceil(lastYearIndex / (width < 550 ? 4 : 6)));
    return {
      type: "category", boundaryGap, data: years,
      axisLabel: {
        ...AXIS_LABEL, showMinLabel: true, showMaxLabel: true, hideOverlap: true,
        interval: (index) => index === lastYearIndex || (index % every === 0 && index <= lastYearIndex - every / 2)
      },
      axisLine: AXIS_LINE, axisTick: { show: false }
    };
  }

  function priceOption(figure, width) {
    const compact = width < 550;
    return {
      ...OPTIONS,
      color: PRICE_COLORS,
      grid: { top: 66, bottom: 34, left: 59, right: compact ? 23 : 32 },
      legend: {
        top: 8, right: compact ? 8 : 17, selectedMode: false,
        icon: "roundRect", itemWidth: 14, itemHeight: 4, itemGap: compact ? 8 : 16,
        textStyle: { color: INK, fontSize: compact ? 10 : 12 }
      },
      xAxis: yearAxis(figure.years, width, figure.years.length === 1),
      yAxis: {
        type: "value", scale: true, name: "元/MWh", nameTextStyle: AXIS_NAME,
        axisLabel: { ...AXIS_LABEL, formatter: (value) => NUMBER_FORMAT.format(value) },
        splitLine: SPLIT_LINE
      },
      series: figure.series.map((series, index) => ({
        name: series.name, type: "line", data: series.values, silent: true,
        symbol: ["circle", "emptyCircle", "diamond"][index] || "none", symbolSize: figure.years.length > 20 ? 4 : 6,
        lineStyle: { width: index === 0 ? 3 : 2, type: ["solid", "dashed", "dotted"][index] || "dotted" }
      }))
    };
  }

  function roundedBounds(min, max) {
    const target = (max - min) / 5;
    const scale = 10 ** Math.floor(Math.log10(target));
    const interval = [1, 2, 5, 10].map((multiple) => scale * multiple).find((step) => step >= target);
    return { min: Math.floor(min / interval) * interval, max: Math.ceil(max / interval) * interval, interval };
  }

  function incomeOption(figure, width) {
    const max = Math.max(0, ...figure.items.map((item) => item.value));
    const min = Math.min(0, ...figure.items.map((item) => item.value));
    const span = max - min || 1;
    const targetMin = min < 0 ? min - 0.15 * span : 0;
    const targetMax = max > 0 ? max + 0.17 * span : min < 0 ? 0 : 1;
    const compact = width < 550;
    return {
      ...OPTIONS,
      grid: { top: 18, bottom: 42, left: compact ? 109 : 148, right: compact ? 25 : 90 },
      xAxis: {
        type: "value",
        ...roundedBounds(targetMin, targetMax),
        name: "万元", nameLocation: "middle", nameGap: 23, nameTextStyle: AXIS_NAME,
        axisLabel: { ...AXIS_LABEL, formatter: (value) => NUMBER_FORMAT.format(value), hideOverlap: true },
        axisLine: AXIS_LINE, splitLine: SPLIT_LINE
      },
      yAxis: {
        type: "category", inverse: true, data: figure.items.map((item) => item.label),
        axisLabel: {
          ...AXIS_LABEL, width: compact ? 98 : 140, overflow: "truncate", interval: 0,
          formatter: compact ? (label, index) => `${label}\n${AMOUNT_FORMAT.format(figure.items[index].value)}` : undefined
        },
        axisTick: { show: false }, axisLine: { ...AXIS_LINE, onZero: false }
      },
      series: [{
        type: "bar", silent: true, barMaxWidth: 21,
        label: {
          show: !compact, color: INK, fontSize: 11, distance: 5,
          formatter: ({ value }) => AMOUNT_FORMAT.format(value)
        },
        data: figure.items.map((item) => ({
          value: item.value,
          itemStyle: { color: item.value < 0 ? DECREASE_COLOR : item.colorKey === "spot" ? TOTAL_COLOR : INCREASE_COLOR },
          label: { position: item.value < 0 ? "left" : "right" }
        }))
      }]
    };
  }

  function signedAmount(value) {
    return `${value > 0 ? "+" : ""}${AMOUNT_FORMAT.format(value)}`;
  }

  function bridgeRows(items) {
    let accumulated = 0;
    return items.map(({ value, role, label }) => {
      if (role === "change") {
        const start = accumulated;
        accumulated += value;
        return { start, end: accumulated, value, role, label };
      }
      accumulated = value;
      return { start: value, end: value, value, role, label };
    });
  }

  function bridgeRenderer(rows, bounds, compact) {
    return (params, api) => {
      const index = api.value(0);
      const row = rows[index];
      const carryFrom = row.end < 0 ? Math.min(bounds.max, 0) : Math.max(bounds.min, 0);
      const [startX, y] = api.coord([row.role === "change" ? row.start : carryFrom, index]);
      const [endX] = api.coord([row.end, index]);
      const height = Math.min(18, api.size([0, 1])[1] * 0.5);
      const left = Math.min(startX, endX), right = Math.max(startX, endX);
      const negative = row.value < 0;
      const color = row.role === "change" ? (negative ? DECREASE_COLOR : INCREASE_COLOR) : TOTAL_COLOR;
      const children = [{ type: "rect", shape: { x: left, y: y - height / 2, width: Math.max(1, right - left), height }, style: { fill: color } }];
      if (rows[index + 1] && Math.abs(rows[index + 1].start - row.end) < 0.01) {
        const [, nextY] = api.coord([row.end, index + 1]);
        children.unshift({ type: "line", shape: { x1: endX, x2: endX, y1: y, y2: nextY }, style: { stroke: "#91a4b5", lineDash: [3, 3] } });
      }
      if (!compact) {
        const text = row.role === "change" ? signedAmount(row.value) : AMOUNT_FORMAT.format(row.value);
        children.push({ type: "text", style: { text, x: negative ? left - 7 : right + 7, y, fill: INK, align: negative ? "right" : "left", verticalAlign: "middle", font: "11px Arial, sans-serif" } });
      }
      return { type: "group", children };
    };
  }

  function bridgeOption(figure, width) {
    const rows = bridgeRows(figure.items);
    const endpoints = rows.flatMap(({ start, end }) => [start, end]);
    const min = Math.min(...endpoints), max = Math.max(...endpoints);
    const span = Math.max(max - min, Math.max(Math.abs(min), Math.abs(max)) * 0.02, 1);
    const bounds = roundedBounds(min - 0.25 * span, max + 0.25 * span);
    const compact = width < 550;
    return {
      ...OPTIONS,
      grid: { top: 18, bottom: 48, left: compact ? 106 : 147, right: compact ? 24 : 60 },
      xAxis: {
        type: "value", ...bounds, name: "元/MWh", nameLocation: "middle", nameGap: 26, nameTextStyle: AXIS_NAME,
        axisLabel: { ...AXIS_LABEL, formatter: (value) => NUMBER_FORMAT.format(value), hideOverlap: true },
        splitLine: SPLIT_LINE
      },
      yAxis: {
        type: "category", inverse: true, data: rows.map(({ label }) => label),
        axisLabel: {
          ...AXIS_LABEL, fontSize: compact ? 10 : 11, interval: 0, width: compact ? 95 : 136, overflow: "break", lineHeight: 13,
          formatter: compact ? (label, index) => `${label}\n${rows[index].role === "change" ? signedAmount(rows[index].value) : AMOUNT_FORMAT.format(rows[index].value)}` : undefined
        },
        axisTick: { show: false }, axisLine: { ...AXIS_LINE, onZero: false }
      },
      series: [{
        type: "custom", silent: true, renderItem: bridgeRenderer(rows, bounds, compact),
        dimensions: ["分类", "起点", "终点", "贡献"], encode: { x: [1, 2], y: 0 },
        data: rows.map(({ start, end, value }, index) => [index, start, end, value])
      }]
    };
  }

  function annualOption(figure, width) {
    return {
      ...OPTIONS,
      grid: { top: 54, bottom: 38, left: 69, right: 24 },
      xAxis: yearAxis(figure.years, width, true),
      yAxis: {
        type: "value", name: "万元", nameTextStyle: AXIS_NAME,
        axisLabel: { ...AXIS_LABEL, formatter: (value) => NUMBER_FORMAT.format(value) }, splitLine: SPLIT_LINE
      },
      series: [{
        name: "年度全口径收入", type: "bar", silent: true, barMaxWidth: 24,
        data: figure.values.map((value) => ({ value, itemStyle: { color: value < 0 ? DECREASE_COLOR : TOTAL_COLOR, borderRadius: value < 0 ? [0, 0, 2, 2] : [2, 2, 0, 0] } }))
      }]
    };
  }

  function buildOption(figure, width) {
    if (figure.kind === "trend") return priceOption(figure, width);
    if (figure.kind === "bridge") return bridgeOption(figure, width);
    if (figure.kind === "annual") return annualOption(figure, width);
    return incomeOption(figure, width);
  }

  function mountCharts(root, brief, { echarts, windowRef } = {}) {
    if (!root || !brief?.figures?.length || !echarts?.init) return () => {};
    const plots = [];
    const resize = () => plots.forEach(({ figure, chart, node }) => {
      if (!node.clientWidth) return;
      chart.resize();
      chart.setOption(buildOption(figure, node.clientWidth), { notMerge: true });
    });
    const observer = windowRef?.ResizeObserver ? new windowRef.ResizeObserver(resize) : null;
    for (const figure of brief.figures) {
      const node = root.querySelector(`[data-brief-chart="${figure.key}"]`);
      if (!node || !node.clientWidth || !node.clientHeight) continue;
      const chart = echarts.init(node, undefined, { renderer: "canvas" });
      chart.setOption(buildOption(figure, node.clientWidth));
      plots.push({ figure, chart, node });
      observer?.observe(node);
    }
    if (!observer) windowRef?.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      if (!observer) windowRef?.removeEventListener("resize", resize);
      plots.forEach(({ chart }) => chart.dispose());
    };
  }

  function renderImages(brief, { echarts, documentRef } = {}) {
    if (!echarts?.init || !documentRef?.body) throw new Error("图表尚未载入，请稍后生成 Word。");
    return brief.figures.map((figure) => {
      const width = 800;
      const height = figure.items ? Math.max(200, 60 + 34 * figure.items.length) : 260;
      const node = documentRef.createElement("div");
      Object.assign(node.style, { position: "fixed", left: "-10000px", top: "0", width: `${width}px`, height: `${height}px` });
      node.setAttribute("aria-hidden", "true");
      documentRef.body.appendChild(node);
      let chart;
      try {
        chart = echarts.init(node, undefined, { renderer: "canvas", width, height, devicePixelRatio: 1 });
        chart.setOption(buildOption(figure, width));
        return { key: figure.key, width, height, dataUrl: chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: PAPER }) };
      } finally {
        chart?.dispose();
        node.remove();
      }
    });
  }

  return Object.freeze({ buildOption, mountCharts, renderImages });
});
