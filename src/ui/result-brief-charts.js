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
  const PRICE_COLORS = ["#155f94", "#18786b"];
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

  function priceOption(figure) {
    const lastYearIndex = figure.years.length - 1;
    const every = Math.max(1, Math.ceil(lastYearIndex / 6));
    return {
      ...OPTIONS,
      color: PRICE_COLORS,
      grid: { top: 65, bottom: 34, left: 59, right: 27 },
      legend: {
        top: 8, right: 17, selectedMode: false,
        icon: "roundRect", itemWidth: 15, itemHeight: 4, itemGap: 16,
        textStyle: { color: INK, fontSize: 12 }
      },
      xAxis: {
        type: "category", boundaryGap: figure.years.length === 1, data: figure.years,
        axisLabel: {
          ...AXIS_LABEL, showMinLabel: true, showMaxLabel: true, hideOverlap: true,
          interval: (index) => index === lastYearIndex || (index % every === 0 && index <= lastYearIndex - every / 2)
        },
        axisLine: AXIS_LINE, axisTick: { show: false }
      },
      yAxis: {
        type: "value", scale: true, name: "元/MWh", nameTextStyle: AXIS_NAME,
        axisLabel: { ...AXIS_LABEL, formatter: (value) => NUMBER_FORMAT.format(value) },
        splitLine: SPLIT_LINE
      },
      series: figure.series.map((series, index) => ({
        name: series.name, type: "line", data: series.values, silent: true,
        symbol: index === 0 ? "circle" : "emptyCircle", symbolSize: figure.years.length > 20 ? 4 : 6,
        lineStyle: { width: index === 0 ? 3 : 2, type: index === 0 ? "solid" : "dashed" }
      }))
    };
  }

  function incomeOption(figure, width) {
    const max = Math.max(0, ...figure.items.map((item) => item.value));
    const min = Math.min(0, ...figure.items.map((item) => item.value));
    const span = max - min || 1;
    const targetMin = min < 0 ? min - 0.15 * span : 0;
    const targetMax = max > 0 ? max + 0.17 * span : min < 0 ? 0 : 1;
    const scale = 10 ** Math.floor(Math.log10((targetMax - targetMin) / 5));
    const interval = [1, 2, 5, 10].map((multiple) => scale * multiple)
      .find((step) => step >= (targetMax - targetMin) / 5);
    const compact = width < 550;
    return {
      ...OPTIONS,
      grid: { top: 18, bottom: 42, left: compact ? 109 : 148, right: compact ? 25 : 90 },
      xAxis: {
        type: "value",
        min: Math.floor(targetMin / interval) * interval,
        max: Math.ceil(targetMax / interval) * interval,
        interval,
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
          itemStyle: { color: item.value < 0 ? "#a35037" : item.colorKey === "spot" ? "#155f94" : "#18786b" },
          label: { position: item.value < 0 ? "left" : "right" }
        }))
      }]
    };
  }

  function buildOption(figure, width) {
    return figure.kind === "trend" ? priceOption(figure) : incomeOption(figure, width);
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
      const height = figure.kind === "trend" ? 260 : Math.max(200, 60 + 34 * figure.items.length);
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
