"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_RESULT_CHARTS = api;
  if (root.window && root.window !== root) {
    root.window.NE_RESULT_CHARTS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function asNum(value, digits = 1) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(digits) : "-";
  }

  function buildResultChartTokens(baseTokens = {}) {
    return {
      ...baseTokens,
      spot: baseTokens.primary,
      mechanism: baseTokens.baseline,
      trade: "#7569d8",
      env: baseTokens.tertiary,
      storage: "#a36cc1",
      other: baseTokens.secondary,
      fee: baseTokens.negative,
      net: baseTokens.primary
    };
  }

  function buildResultPlaceholderOption(message, tokens = {}) {
    return {
      animation: false,
      xAxis: { show: false, type: "value" },
      yAxis: { show: false, type: "category", data: [] },
      series: [],
      graphic: [{
        type: "text",
        left: "center",
        top: "middle",
        style: {
          text: message,
          fill: tokens.axisText,
          fontSize: 14,
          fontWeight: 700
        }
      }]
    };
  }

  function baseChartParts(tokens) {
    const axisLabel = { color: tokens.axisText };
    const axisLine = { lineStyle: { color: tokens.axisLine } };
    const splitLine = { lineStyle: { color: tokens.splitLine } };
    const tooltip = {
      trigger: "axis",
      backgroundColor: tokens.tooltipBg,
      borderColor: tokens.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: tokens.axisText }
    };
    const legend = {
      top: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: tokens.legendText, fontWeight: 700 }
    };
    return {
      axisLabel,
      axisLine,
      splitLine,
      tooltip,
      legend
    };
  }

  function buildAnnualStackOption(chartData, tokens, context) {
    const { axisLabel, axisLine, splitLine, tooltip, legend } = baseChartParts(tokens);
    const componentSeries = chartData.annualComponents || [];
    return {
      animationDuration: 360,
      color: componentSeries.map((item) => tokens[item.colorKey] || tokens.primary).concat(tokens.net),
      grid: { top: 64, left: 58, right: 34, bottom: 46, containLabel: true },
      legend,
      tooltip: {
        ...tooltip,
        valueFormatter: (value) => `${asNum(Number(value || 0), 2)} 万元`
      },
      xAxis: {
        type: "category",
        data: chartData.years || [],
        axisLabel: { ...axisLabel, interval: context.yearInterval, hideOverlap: true },
        axisLine,
        axisTick: { show: false }
      },
      yAxis: {
        type: "value",
        name: "万元",
        nameTextStyle: { color: tokens.axisText, fontWeight: 700 },
        axisLabel,
        axisLine,
        splitLine
      },
      series: [
        ...componentSeries.map((item) => ({
          name: item.name,
          type: "bar",
          stack: "revenue",
          barWidth: 18,
          itemStyle: { color: tokens[item.colorKey] || tokens.primary },
          data: item.data
        })),
        {
          name: chartData.annualNet?.name || "全口径收入",
          type: "line",
          smooth: true,
          symbolSize: 6,
          lineStyle: { width: 3, color: tokens.net },
          itemStyle: { color: tokens.net },
          data: chartData.annualNet?.data || []
        }
      ]
    };
  }

  function buildPricePathOption(chartData, tokens, context) {
    const { axisLabel, axisLine, splitLine, tooltip, legend } = baseChartParts(tokens);
    return {
      animationDuration: 360,
      grid: { top: 54, left: 58, right: 28, bottom: 46, containLabel: true },
      legend,
      tooltip: {
        ...tooltip,
        valueFormatter: (value) => `${asNum(Number(value || 0), 2)} 元/MWh`
      },
      xAxis: {
        type: "category",
        data: chartData.years || [],
        axisLabel: { ...axisLabel, interval: context.yearInterval, hideOverlap: true },
        axisLine,
        axisTick: { show: false }
      },
      yAxis: {
        type: "value",
        name: "元/MWh",
        nameTextStyle: { color: tokens.axisText, fontWeight: 700 },
        axisLabel,
        axisLine,
        splitLine
      },
      series: (chartData.priceSeries || []).map((item) => ({
        name: item.name,
        type: "line",
        smooth: true,
        connectNulls: false,
        symbolSize: 5,
        lineStyle: { width: 2.6, color: tokens[item.colorKey] || tokens.primary },
        itemStyle: { color: tokens[item.colorKey] || tokens.primary },
        data: item.data
      }))
    };
  }

  function buildWaterfallOption(chartData, tokens) {
    const { axisLabel, axisLine, splitLine } = baseChartParts(tokens);
    const bridgeItems = chartData.firstYearBridgeItems || [];
    return {
      animationDuration: 360,
      grid: { top: 34, left: 56, right: 22, bottom: 66, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: tokens.tooltipBg,
        borderColor: tokens.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: tokens.axisText },
        valueFormatter: (value) => `${asNum(Number(value || 0), 2)} 元/MWh`
      },
      xAxis: {
        type: "category",
        data: bridgeItems.map((item) => item.label),
        axisLabel: { ...axisLabel, interval: 0, rotate: 28 },
        axisLine,
        axisTick: { show: false }
      },
      yAxis: {
        type: "value",
        name: "元/MWh",
        nameTextStyle: { color: tokens.axisText, fontWeight: 700 },
        axisLabel,
        axisLine,
        splitLine
      },
      series: [{
        name: "度电影响",
        type: "bar",
        barWidth: 20,
        data: bridgeItems.map((item) => ({
          value: item.value,
          itemStyle: { color: tokens[item.colorKey] || tokens.primary }
        }))
      }]
    };
  }

  function buildContributionOption(chartData, tokens) {
    const { axisLabel, axisLine, splitLine } = baseChartParts(tokens);
    const contributionItems = chartData.contributionItems || [];
    return {
      animationDuration: 360,
      grid: { top: 22, left: 112, right: 28, bottom: 34, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: tokens.tooltipBg,
        borderColor: tokens.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: tokens.axisText },
        valueFormatter: (value) => `${asNum(Number(value || 0), 2)} 万元`
      },
      xAxis: {
        type: "value",
        name: "万元",
        nameTextStyle: { color: tokens.axisText, fontWeight: 700 },
        axisLabel,
        axisLine,
        splitLine
      },
      yAxis: {
        type: "category",
        data: contributionItems.map((item) => item.label),
        axisLabel,
        axisLine,
        axisTick: { show: false }
      },
      series: [{
        name: "累计贡献",
        type: "bar",
        barWidth: 16,
        data: contributionItems.map((item) => ({
          value: item.valueWan,
          itemStyle: { color: tokens[item.colorKey] || tokens.primary }
        }))
      }]
    };
  }

  function buildResultChartOptions(chartData, tokens, context = {}) {
    const safeContext = {
      yearInterval: Number.isFinite(Number(context.yearInterval)) ? Number(context.yearInterval) : 0
    };
    return {
      annualStack: buildAnnualStackOption(chartData, tokens, safeContext),
      pricePath: buildPricePathOption(chartData, tokens, safeContext),
      waterfall: buildWaterfallOption(chartData, tokens),
      contribution: buildContributionOption(chartData, tokens)
    };
  }

  return Object.freeze({
    buildResultChartTokens,
    buildResultPlaceholderOption,
    buildResultChartOptions
  });
});

