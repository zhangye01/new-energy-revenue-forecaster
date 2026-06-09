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
  const HEAT_HOUR_LABELS = historyAnalysis.HISTORY_HEAT_HOUR_LABELS;
  const QUARTER_LABELS = historyAnalysis.HISTORY_QUARTER_LABELS;

  function buildHistoryThemeTokens(theme) {
    if (theme === "dark") {
      return {
        axisText: "#c7d4e6",
        axisLine: "#476081",
        splitLine: "rgba(116, 142, 177, 0.22)",
        legendText: "#c7d4e6",
        tooltipBg: "rgba(19, 31, 46, 0.95)",
        tooltipBorder: "#4e6790"
      };
    }
    if (theme === "eye") {
      return {
        axisText: "#4d6658",
        axisLine: "#a2bb9f",
        splitLine: "rgba(129, 156, 120, 0.22)",
        legendText: "#435d4d",
        tooltipBg: "rgba(243, 249, 237, 0.95)",
        tooltipBorder: "#9db79a"
      };
    }
    return {
      axisText: "#5b6f89",
      axisLine: "#bfd0e4",
      splitLine: "rgba(151, 170, 196, 0.24)",
      legendText: "#5b6f89",
      tooltipBg: "rgba(255, 255, 255, 0.96)",
      tooltipBorder: "#c9d8eb"
    };
  }

  function buildTooltip(tokens, trigger = "axis") {
    return {
      trigger,
      backgroundColor: tokens.tooltipBg,
      borderColor: tokens.tooltipBorder,
      textStyle: { color: tokens.axisText }
    };
  }

  function buildCategoryAxis(data, tokens, extra = {}) {
    return {
      type: "category",
      data,
      axisLabel: { color: tokens.axisText, ...(extra.axisLabel || {}) },
      axisLine: { lineStyle: { color: tokens.axisLine } },
      ...(extra.axisTick ? { axisTick: extra.axisTick } : {})
    };
  }

  function buildValueAxis(tokens, extra = {}) {
    return {
      type: "value",
      axisLabel: { color: tokens.axisText, ...(extra.axisLabel || {}) },
      axisLine: { lineStyle: { color: tokens.axisLine } },
      splitLine: { lineStyle: { color: tokens.splitLine } },
      ...(extra.name ? { name: extra.name } : {}),
      ...(extra.nameGap ? { nameGap: extra.nameGap } : {}),
      ...(extra.nameTextStyle ? { nameTextStyle: extra.nameTextStyle } : {})
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

  function buildMonthTrendOption(data, tokens) {
    return {
      color: data.lineColors,
      tooltip: buildTooltip(tokens),
      legend: {
        bottom: 0,
        textStyle: { color: tokens.legendText }
      },
      grid: { top: 36, left: 48, right: 18, bottom: 54, containLabel: true },
      xAxis: buildCategoryAxis(MONTH_LABELS, tokens),
      yAxis: buildValueAxis(tokens, {
        name: "元/MWh",
        nameGap: 24,
        nameTextStyle: { color: tokens.axisText }
      }),
      series: data.trendSeries
    };
  }

  function buildTypicalDayOption(data, tokens) {
    return {
      tooltip: buildTooltip(tokens),
      legend: {
        bottom: 0,
        textStyle: { color: tokens.legendText }
      },
      grid: { top: 36, left: 50, right: 18, bottom: 54, containLabel: true },
      xAxis: buildCategoryAxis(QUARTER_LABELS, tokens, {
        axisLabel: { interval: 7 }
      }),
      yAxis: buildValueAxis(tokens, {
        name: "元/MWh",
        nameGap: 24,
        nameTextStyle: { color: tokens.axisText }
      }),
      series: [
        {
          name: "工作日",
          type: "line",
          smooth: true,
          symbol: "none",
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.09 },
          data: data.typicalWorkday,
          color: "#2f78e8"
        },
        {
          name: "周末",
          type: "line",
          smooth: true,
          symbol: "none",
          lineStyle: { width: 2, type: "dashed" },
          data: data.typicalWeekend,
          color: "#52a852"
        }
      ]
    };
  }

  function buildDistributionOption(data, tokens) {
    return {
      tooltip: buildTooltip(tokens),
      grid: { top: 30, left: 52, right: 18, bottom: 46, containLabel: true },
      xAxis: buildCategoryAxis(data.histogramLabels, tokens, {
        axisLabel: { interval: 1 }
      }),
      yAxis: buildValueAxis(tokens),
      series: [{
        type: "bar",
        data: data.histogramCounts,
        barMaxWidth: 24,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: (params) => {
            const ratio = params.dataIndex / Math.max(data.histogramBins - 1, 1);
            if (ratio < 0.22) return "#ff8a1f";
            if (ratio < 0.72) return "#2f78e8";
            return "#6c46d1";
          }
        }
      }]
    };
  }

  function buildHeatmapOption(data, tokens) {
    return {
      tooltip: {
        position: "top",
        backgroundColor: tokens.tooltipBg,
        borderColor: tokens.tooltipBorder,
        textStyle: { color: tokens.axisText },
        formatter: (params) => `${MONTH_LABELS[params.value[1]]} ${HEAT_HOUR_LABELS[params.value[0]]}<br>${params.value[2]} 元/MWh`
      },
      grid: { top: 30, left: 48, right: 20, bottom: 52, containLabel: true },
      xAxis: buildCategoryAxis(HEAT_HOUR_LABELS, tokens, {
        axisLabel: { interval: 1 }
      }),
      yAxis: buildCategoryAxis(MONTH_LABELS, tokens),
      visualMap: {
        min: Number.isFinite(data.heatMin) ? Math.floor(data.heatMin) : 0,
        max: Number.isFinite(data.heatMax) ? Math.ceil(data.heatMax) : 500,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        text: ["高", "低"],
        textStyle: { color: tokens.axisText },
        inRange: {
          color: ["#2d60b0", "#7ab5df", "#f0dd9b", "#f39d41", "#df4a49"]
        }
      },
      series: [{
        type: "heatmap",
        data: data.heatData,
        emphasis: { itemStyle: { borderColor: "#ffffff", borderWidth: 1 } }
      }]
    };
  }

  function buildBoxplotOption(data, tokens) {
    return {
      tooltip: buildTooltip(tokens, "item"),
      grid: { top: 30, left: 48, right: 18, bottom: 38, containLabel: true },
      xAxis: buildCategoryAxis(MONTH_LABELS, tokens),
      yAxis: buildValueAxis(tokens),
      series: [{
        type: "boxplot",
        data: data.boxplotData,
        itemStyle: {
          color: "rgba(63, 125, 226, 0.18)",
          borderColor: "#2f78e8"
        }
      }]
    };
  }

  function buildHistoryChartOptions(data, tokens) {
    return {
      monthTrend: buildMonthTrendOption(data, tokens),
      typicalDay: buildTypicalDayOption(data, tokens),
      distribution: buildDistributionOption(data, tokens),
      heatmap: buildHeatmapOption(data, tokens),
      boxplot: buildBoxplotOption(data, tokens)
    };
  }

  return {
    buildHistoryThemeTokens,
    buildHistoryNoDataOption,
    buildMonthTrendOption,
    buildTypicalDayOption,
    buildDistributionOption,
    buildHeatmapOption,
    buildBoxplotOption,
    buildHistoryChartOptions
  };
});
