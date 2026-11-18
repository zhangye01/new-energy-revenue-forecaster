"use strict";

(function (root, factory) {
  const historyAnalysis = typeof module !== "undefined" && module.exports
    ? require("../domain/history-analysis")
    : root.NE_HISTORY_ANALYSIS;
  const api = factory(historyAnalysis);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_HISTORY_CHARTS = api;
  if (root.window && root.window !== root) {
    root.window.NE_HISTORY_CHARTS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (historyAnalysis) {
  if (!historyAnalysis) {
    throw new Error("历史图表模块初始化失败：缺少历史分析模块");
  }

  const MONTH_LABELS = historyAnalysis.HISTORY_MONTH_LABELS;
  const HOUR_LABELS = Object.freeze(Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`));
  const LINE_COLORS = Object.freeze(["#2f78e8", "#16866d", "#bd7332", "#8655cf", "#bc5182", "#00879d", "#747d38", "#637187"]);
  const priceText = (value) => Number.isFinite(value) ? `${value.toFixed(2)} 元/MWh` : "—";
  const percentText = (value) => Number.isFinite(value) ? `${value.toFixed(value > 0 && value < 0.01 ? 4 : 2)}%` : "—";
  const countText = (value) => Number.isFinite(value) ? value.toLocaleString("zh-CN") : "0";

  function buildHistoryThemeTokens(theme) {
    if (theme === "dark") {
      return {
        axisText: "#c7d4e6",
        axisLine: "#476081",
        splitLine: "rgba(116, 142, 177, 0.22)",
        legendText: "#c7d4e6",
        tooltipBg: "rgba(19, 31, 46, 0.95)",
        tooltipBorder: "#4e6790",
        missing: "#384358",
        heatNeutral: "#b9c5d8"
      };
    }
    if (theme === "eye") {
      return {
        axisText: "#4d6658",
        axisLine: "#a2bb9f",
        splitLine: "rgba(129, 156, 120, 0.22)",
        legendText: "#435d4d",
        tooltipBg: "rgba(243, 249, 237, 0.95)",
        tooltipBorder: "#9db79a",
        missing: "#dce3d6",
        heatNeutral: "#f2f1d9"
      };
    }
    return {
      axisText: "#5b6f89",
      axisLine: "#bfd0e4",
      splitLine: "rgba(151, 170, 196, 0.24)",
      legendText: "#5b6f89",
      tooltipBg: "rgba(255, 255, 255, 0.96)",
      tooltipBorder: "#c9d8eb",
      missing: "#e4e9ef",
      heatNeutral: "#f5f3df"
    };
  }

  function buildTooltip(tokens, trigger = "axis") {
    return {
      trigger,
      confine: true,
      backgroundColor: tokens.tooltipBg,
      borderColor: tokens.tooltipBorder,
      textStyle: { color: tokens.axisText, fontSize: 12 },
      ...(trigger === "axis" ? { axisPointer: { type: "line", lineStyle: { color: tokens.axisLine } } } : {})
    };
  }

  function buildCategoryAxis(data, tokens, extra = {}) {
    return {
      type: "category",
      data,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: tokens.axisLine } },
      ...extra,
      axisLabel: { color: tokens.axisText, hideOverlap: true, ...(extra.axisLabel || {}) }
    };
  }

  function buildValueAxis(tokens, extra = {}) {
    return {
      type: "value",
      axisLine: { lineStyle: { color: tokens.axisLine } },
      splitLine: { lineStyle: { color: tokens.splitLine } },
      nameTextStyle: { color: tokens.axisText },
      ...extra,
      axisLabel: { color: tokens.axisText, hideOverlap: true, ...(extra.axisLabel || {}) }
    };
  }

  function buildHistoryNoDataOption(message, tokens) {
    return {
      animation: false,
      graphic: [{
        type: "text",
        left: "center",
        top: "middle",
        style: {
          text: message,
          fill: tokens.axisText,
          fontWeight: 700,
          fontSize: 14
        }
      }]
    };
  }

  function rangeSeries(rows, lower, upper, { id, name, color, opacity }) {
    const data = [];
    const spans = new Map();
    let span = [];
    rows.forEach((row, index) => {
      const low = row?.[lower];
      const high = row?.[upper];
      if (!Number.isFinite(low) || !Number.isFinite(high)) {
        span = [];
        return;
      }
      const point = [index, low, high];
      if (!span.length) spans.set(index, span);
      span.push(point);
      data.push(point);
    });
    return {
      id,
      name,
      type: "custom",
      coordinateSystem: "cartesian2d",
      data,
      encode: { x: 0, y: [1, 2] },
      silent: true,
      tooltip: { show: false },
      z: 1,
      itemStyle: { color },
      renderItem(_params, api) {
        const run = spans.get(api.value(0));
        if (!run) return;
        if (run.length === 1) {
          const [[index, low, high]] = run;
          const [x1, y1] = api.coord([index, low]);
          const [x2, y2] = api.coord([index, high]);
          return { type: "line", shape: { x1, y1, x2, y2 }, style: { stroke: color, opacity: Math.max(opacity, 0.45), lineWidth: 5 } };
        }
        const points = run.map(([index, low]) => api.coord([index, low]))
          .concat(run.slice().reverse().map(([index, _low, high]) => api.coord([index, high])));
        return { type: "polygon", shape: { points }, style: { fill: color, opacity } };
      }
    };
  }

  function lineSeries(rows, key, id, name, color) {
    return {
      id,
      name,
      type: "line",
      smooth: false,
      connectNulls: false,
      data: rows.map((row) => Number.isFinite(row?.[key]) ? row[key] : null),
      showSymbol: true,
      showAllSymbol: true,
      symbol: "circle",
      symbolSize: rows.length <= 18 ? 5 : 3,
      lineStyle: { width: 2.5, color },
      itemStyle: { color },
      z: 3
    };
  }

  function monthGrid(bottom = 12) {
    return { top: 29, left: 12, right: 17, bottom, containLabel: true };
  }

  function monthlyTooltip(row) {
    if (!row?.count) return "暂无有效样本";
    return `月均价 ${priceText(row.avg)}<br>P10–P90 ${priceText(row.p10)} 至 ${priceText(row.p90)}<br>有效样本 ${countText(row.count)} 段`;
  }

  function buildMonthTrendOption(data, tokens, mode = "chronological") {
    const monthly = data.monthly || [];
    if (!monthly.some((row) => Number.isFinite(row.avg))) return buildHistoryNoDataOption("所选范围暂无电价样本", tokens);
    const yoy = mode === "yoy";
    const byYear = new Map();
    if (yoy) {
      monthly.forEach((row) => {
        const [year, month] = row.month.split("-");
        if (!byYear.has(year)) byYear.set(year, Array(12).fill(null));
        byYear.get(year)[Number(month) - 1] = row;
      });
    }
    const groups = yoy
      ? Array.from(byYear, ([year, rows], index) => ({ id: `year-${year}`, name: `${year}年`, rows, color: LINE_COLORS[index % LINE_COLORS.length] }))
      : [{ id: "monthly", name: "月均价", rows: monthly, color: LINE_COLORS[0] }];
    const series = groups.flatMap(({ id, name, rows, color }) => [
      rangeSeries(rows, "p10", "p90", { id: `${id}-band`, name: yoy ? name : "P10–P90", color, opacity: yoy ? 0.10 : 0.17 }),
      lineSeries(rows, "avg", `${id}-mean`, name, color)
    ]);
    const labels = yoy ? MONTH_LABELS : monthly.map(({ month }) => month);
    return {
      animation: false,
      tooltip: {
        ...buildTooltip(tokens),
        ...(yoy ? { enterable: true, extraCssText: "max-width:calc(100% - 12px);max-height:calc(100% - 12px);white-space:normal;overflow:auto" } : {}),
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params];
          const index = labels.indexOf(items[0]?.axisValue);
          if (index < 0) return "";
          if (!yoy) return `<strong>${labels[index]}</strong><br>${monthlyTooltip(monthly[index])}`;
          const shown = new Set(items.map((item) => item.seriesName));
          const entries = groups.filter((group) => group.rows[index]?.count && shown.has(group.name));
          return `<strong>${labels[index]}</strong>${entries.map(({ name, rows }) => {
            const row = rows[index];
            return `<br><strong>${name}</strong> ${priceText(row.avg)} · ${countText(row.count)} 段<br>P10–P90 ${priceText(row.p10)} 至 ${priceText(row.p90)}`;
          }).join("")}`;
        }
      },
      legend: {
        type: "scroll",
        bottom: 0,
        selectedMode: yoy,
        data: yoy ? groups.map(({ name }) => name) : ["月均价", "P10–P90"],
        textStyle: { color: tokens.legendText }
      },
      grid: monthGrid(39),
      xAxis: buildCategoryAxis(labels, tokens),
      yAxis: buildValueAxis(tokens, { name: "元/MWh", scale: true }),
      series
    };
  }

  function heatScale(data) {
    const min = Number.isFinite(data.heatMin) ? Math.floor(data.heatMin) : 0;
    const max = Number.isFinite(data.heatMax) ? Math.ceil(data.heatMax) : 1;
    const diverging = min < 0 && max > 0;
    const magnitude = Math.max(Math.abs(min), Math.abs(max));
    return {
      min: diverging ? -magnitude : min,
      max: diverging ? magnitude : Math.max(max, min + 1),
      diverging
    };
  }

  function buildHeatmapOption(data, tokens) {
    const cells = data.heatData || [];
    const valid = cells.filter((cell) => Number.isFinite(cell[2]) && cell[4] > 0);
    const missing = cells.filter((cell) => !Number.isFinite(cell[2]) || !cell[4])
      .map(([hour, month]) => [hour, month, 0, null, 0]);
    const { min, max, diverging } = heatScale(data);
    return {
      animation: false,
      tooltip: {
        ...buildTooltip(tokens, "item"),
        formatter: (params) => {
          const [hour, month, avg, negativeRatio, count] = params.value;
          const end = hour === 23 ? "24:00" : HOUR_LABELS[hour + 1];
          const title = `<strong>${MONTH_LABELS[month]} ${HOUR_LABELS[hour]}–${end}</strong>`;
          return count ? `${title}<br>均价 ${priceText(avg)}<br>负价占比 ${percentText(negativeRatio)}<br>有效样本 ${countText(count)} 段`
            : `${title}<br>暂无有效样本`;
        }
      },
      grid: { top: 12, left: 12, right: 18, bottom: 55, containLabel: true },
      xAxis: buildCategoryAxis(HOUR_LABELS, tokens, { axisLabel: { interval: 3 } }),
      yAxis: buildCategoryAxis(MONTH_LABELS, tokens, { inverse: true, axisLabel: { interval: 0 } }),
      visualMap: {
        show: valid.length > 0,
        min,
        max,
        dimension: 2,
        seriesIndex: 0,
        orient: "horizontal",
        left: "center",
        bottom: 2,
        itemWidth: 12,
        itemHeight: 120,
        text: [`${max}`, `${min} 元/MWh`],
        textGap: 6,
        textStyle: { color: tokens.axisText, fontSize: 11 },
        inRange: { color: diverging ? ["#286da9", tokens.heatNeutral, "#c04e28"] : ["#cde6f2", "#5c9fae", "#b6502b"] }
      },
      series: [
        { id: "heatmap-price", name: "分时均价", type: "heatmap", data: valid },
        { id: "heatmap-missing", name: "缺少样本", type: "heatmap", data: missing, itemStyle: { color: tokens.missing } }
      ]
    };
  }

  function buildPriceDurationOption(data, tokens) {
    const { points = [], p10, p50, p90, negativeRatio, sampleCount } = data.duration || {};
    if (!points.length) return buildHistoryNoDataOption("所选范围暂无电价样本", tokens);
    const color = LINE_COLORS[1];
    const tooltip = buildTooltip(tokens);
    return {
      animation: false,
      tooltip: {
        ...tooltip,
        axisPointer: { ...tooltip.axisPointer, snap: true },
        formatter: (params) => {
          const point = (Array.isArray(params) ? params[0] : params)?.value;
          if (!point) return "";
          return `<strong>${priceText(point[1])}</strong><br>高于该价位 ${percentText(point[2])}`
            + `<br>负价占比 ${percentText(negativeRatio)} · ${countText(sampleCount)} 段`
            + `<br>P10 ${priceText(p10)}<br>P50 ${priceText(p50)}<br>P90 ${priceText(p90)}`;
        }
      },
      grid: monthGrid(29),
      xAxis: buildValueAxis(tokens, {
        min: 0,
        max: 100,
        interval: 20,
        name: "累计时段占比",
        nameLocation: "middle",
        nameGap: 25,
        axisLabel: { formatter: (value) => `${value}%` },
        axisLine: { onZero: false, lineStyle: { color: tokens.axisLine } },
        splitLine: { show: false }
      }),
      yAxis: buildValueAxis(tokens, { name: "元/MWh" }),
      series: [{
        id: "price-duration",
        name: "现货电价",
        type: "line",
        data: points,
        encode: { x: 0, y: 1 },
        showSymbol: points.length <= 10,
        symbolSize: 5,
        smooth: false,
        lineStyle: { width: 2.5, color },
        itemStyle: { color },
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { color: tokens.axisText, type: "dashed" },
          data: [{ yAxis: 0 }]
        }
      }]
    };
  }

  function buildIntradaySpreadOption(data, tokens) {
    const rows = data.intraday || [];
    if (!rows.some((row) => row.count > 0)) return buildHistoryNoDataOption("所选范围没有完整的 96 点样本日", tokens);
    const color = "#8655cf";
    const labels = rows.map(({ month }) => month);
    return {
      animation: false,
      tooltip: {
        ...buildTooltip(tokens),
        formatter: (params) => {
          const item = (Array.isArray(params) ? params[0] : params);
          const row = rows[labels.indexOf(item?.axisValue)];
          if (!row) return "";
          const title = `<strong>${row.month}</strong>`;
          return row.count ? `${title}<br>日价差中位数 ${priceText(row.p50)}<br>P25–P75 ${priceText(row.p25)} 至 ${priceText(row.p75)}<br>有效样本 ${countText(row.count)} 天`
            : `${title}<br>没有完整的 96 点样本日`;
        }
      },
      legend: { bottom: 0, selectedMode: false, data: ["日价差中位数", "P25–P75"], textStyle: { color: tokens.legendText } },
      grid: monthGrid(39),
      xAxis: buildCategoryAxis(labels, tokens),
      yAxis: buildValueAxis(tokens, { name: "元/MWh", min: 0 }),
      series: [
        rangeSeries(rows, "p25", "p75", { id: "intraday-band", name: "P25–P75", color, opacity: 0.17 }),
        lineSeries(rows, "p50", "intraday-median", "日价差中位数", color)
      ]
    };
  }

  function buildHistoryChartOptions(data, tokens, { trendMode } = {}) {
    return {
      monthTrend: buildMonthTrendOption(data, tokens, trendMode),
      heatmap: buildHeatmapOption(data, tokens),
      duration: buildPriceDurationOption(data, tokens),
      intradaySpread: buildIntradaySpreadOption(data, tokens)
    };
  }

  return {
    buildHistoryThemeTokens,
    buildHistoryNoDataOption,
    buildMonthTrendOption,
    buildHeatmapOption,
    buildPriceDurationOption,
    buildIntradaySpreadOption,
    buildHistoryChartOptions
  };
});
