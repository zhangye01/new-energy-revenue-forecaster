"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_COMPARE_CHARTS = api;
  if (root.window && root.window !== root) {
    root.window.NE_COMPARE_CHARTS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function asNum(value, digits = 1) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(digits) : "-";
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function buildCompareThemeTokens(theme) {
    if (theme === "dark") {
      return {
        axisText: "#c0d0e5",
        axisLine: "#4d637f",
        splitLine: "rgba(111, 136, 170, 0.2)",
        legendText: "#c0d0e5",
        tooltipBg: "rgba(24, 36, 52, 0.96)",
        tooltipBorder: "#48617d",
        baseline: "#f29d52",
        primary: "#6ca9ff",
        secondary: "#7fd0c7",
        tertiary: "#95d086",
        negative: "#eb8b6e",
        palette: ["#6ca9ff", "#68c9bc", "#95d086", "#f29d52", "#c995ff"]
      };
    }
    if (theme === "eye") {
      return {
        axisText: "#4a6250",
        axisLine: "#aec1af",
        splitLine: "rgba(140, 166, 141, 0.24)",
        legendText: "#4a6250",
        tooltipBg: "rgba(244, 249, 239, 0.96)",
        tooltipBorder: "#abc0ad",
        baseline: "#cf8f48",
        primary: "#4f88bc",
        secondary: "#5f9d79",
        tertiary: "#7fa15c",
        negative: "#d07f62",
        palette: ["#4f88bc", "#5f9d79", "#7fa15c", "#cf8f48", "#9a7fca"]
      };
    }
    return {
      axisText: "#5b6f89",
      axisLine: "#bfd0e4",
      splitLine: "rgba(151, 170, 196, 0.24)",
      legendText: "#5b6f89",
      tooltipBg: "rgba(255, 255, 255, 0.96)",
      tooltipBorder: "#c9d8eb",
      baseline: "#ea9150",
      primary: "#3f82e6",
      secondary: "#3fa096",
      tertiary: "#76aa57",
      negative: "#d77762",
      palette: ["#3f82e6", "#3fa096", "#76aa57", "#ea9150", "#9b79de"]
    };
  }

  function buildComparePlaceholderOption(message, tokens) {
    return {
      animation: false,
      xAxis: { show: false, type: "value" },
      yAxis: { show: false, type: "value" },
      series: [],
      graphic: [{
        type: "text",
        left: "center",
        top: "middle",
        style: {
          text: message,
          fill: tokens.axisText,
          fontSize: 14,
          fontWeight: 600
        }
      }]
    };
  }

  function valueAxis(name, tokens) {
    return {
      type: "value",
      name,
      nameTextStyle: { color: tokens.axisText, fontWeight: 700 },
      axisLabel: { color: tokens.axisText },
      axisLine: { lineStyle: { color: tokens.axisLine } },
      splitLine: { lineStyle: { color: tokens.splitLine } }
    };
  }

  function categoryAxis(data, tokens, extra = {}) {
    return {
      type: "category",
      data,
      axisLabel: { color: tokens.axisText, ...(extra.axisLabel || {}) },
      axisLine: { lineStyle: { color: tokens.axisLine } },
      axisTick: { show: false },
      ...extra.axis
    };
  }

  function axisTooltip(tokens, extra = {}) {
    return {
      trigger: "axis",
      backgroundColor: tokens.tooltipBg,
      borderColor: tokens.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: tokens.axisText },
      ...extra
    };
  }

  function buildSensitivityTornadoOption(factors, baselineRevenueWan, settings, tokens) {
    const rangeLabel = `${settings.rangePercent}%`;
    const displayCount = settings.topN === "all" ? factors.length : Math.min(Number(settings.topN) || 8, factors.length);
    const topFactors = factors.slice(0, displayCount).reverse();
    return {
      animationDuration: 340,
      grid: { top: 30, left: 132, right: 28, bottom: 34, containLabel: true },
      legend: {
        top: 0,
        textStyle: { color: tokens.legendText, fontWeight: 700 }
      },
      tooltip: axisTooltip(tokens, {
        formatter: (params) => {
          if (!params?.length) return "";
          const lines = [`${escapeHtml(params[0].axisValue)}`];
          params.forEach((item) => {
            const value = Number(item.value || 0);
            lines.push(`${item.marker}${escapeHtml(item.seriesName)}：${value >= 0 ? "+" : ""}${asNum(value, 2)} 万元`);
          });
          lines.push(`基准首年收益：${asNum(baselineRevenueWan, 1)} 万元`);
          return lines.join("<br/>");
        }
      }),
      xAxis: valueAxis("相对基准变化 万元", tokens),
      yAxis: categoryAxis(topFactors.map((factor) => factor.name), tokens),
      series: [
        {
          name: `-${rangeLabel}`,
          type: "bar",
          barWidth: 12,
          itemStyle: { color: tokens.negative },
          data: topFactors.map((factor) => factor.lowDelta)
        },
        {
          name: `+${rangeLabel}`,
          type: "bar",
          barWidth: 12,
          itemStyle: { color: tokens.primary },
          data: topFactors.map((factor) => factor.highDelta)
        }
      ]
    };
  }

  function buildSensitivityResponseOption(selected, baselineRevenueWan, axisLabels, tokens) {
    return {
      animationDuration: 340,
      grid: { top: 36, left: 56, right: 24, bottom: 44, containLabel: true },
      tooltip: axisTooltip(tokens, {
        formatter: (params) => {
          const item = params?.[0];
          if (!item) return "";
          return `${item.axisValue}<br/>首年收益：${asNum(Number(item.value || 0), 1)} 万元<br/>相对基准：${asNum(Number(item.value || 0) - baselineRevenueWan, 1)} 万元`;
        }
      }),
      xAxis: categoryAxis(axisLabels, tokens),
      yAxis: valueAxis("万元", tokens),
      series: [{
        name: selected.name,
        type: "line",
        smooth: true,
        symbolSize: 6,
        lineStyle: { width: 3, color: tokens.primary },
        itemStyle: { color: tokens.primary },
        areaStyle: { color: `${tokens.primary}1f` },
        data: selected.series,
        markLine: {
          symbol: ["none", "none"],
          lineStyle: { type: "dashed", color: tokens.baseline },
          label: { color: tokens.baseline, formatter: `基准 ${asNum(baselineRevenueWan, 1)} 万元` },
          data: [{ yAxis: Number(baselineRevenueWan.toFixed(1)) }]
        }
      }]
    };
  }

  function buildScenarioTrendOption(available, tokens) {
    const years = available[0]?.result?.annualRows?.map((row) => String(row.year)) || [];
    return {
      animationDuration: 340,
      grid: { top: 28, left: 56, right: 28, bottom: 52 },
      tooltip: axisTooltip(tokens, {
        formatter: (params) => {
          if (!params?.length) return "";
          const lines = [`${params[0].axisValue} 年`];
          params.forEach((item) => {
            lines.push(`${item.marker}${escapeHtml(item.seriesName)}：${asNum(Number(item.value || 0), 1)} 万元`);
          });
          return lines.join("<br/>");
        }
      }),
      legend: {
        bottom: 0,
        textStyle: { color: tokens.legendText }
      },
      xAxis: {
        type: "category",
        data: years,
        axisLabel: { color: tokens.axisText },
        axisLine: { lineStyle: { color: tokens.axisLine } }
      },
      yAxis: {
        ...valueAxis("万元", tokens),
        axisLabel: {
          color: tokens.axisText,
          formatter: (value) => `${Number(value).toFixed(0)}`
        }
      },
      series: available.map((item, index) => ({
        name: item.scenario.name,
        type: "line",
        smooth: 0.24,
        symbol: "circle",
        symbolSize: 7,
        data: item.result.annualRows.map((row) => Number((row.fullRevenue / 10000).toFixed(1))),
        lineStyle: {
          width: item.scenario.isBaseline ? 3.5 : 2.5,
          color: tokens.palette[index % tokens.palette.length]
        },
        itemStyle: {
          color: tokens.palette[index % tokens.palette.length]
        }
      }))
    };
  }

  function buildScenarioRankingOption(available, baseline, tokens) {
    const ranked = [...available].sort((a, b) => a.result.totalFullRevenue - b.result.totalFullRevenue);
    const baselineWan = baseline?.result?.totalFullRevenue ? baseline.result.totalFullRevenue / 10000 : 0;
    return {
      animationDuration: 340,
      grid: { top: 24, left: 120, right: 34, bottom: 34, containLabel: true },
      tooltip: axisTooltip(tokens, {
        formatter: (params) => {
          const item = params?.[0];
          if (!item) return "";
          const scenarioName = item.axisValue;
          const current = ranked.find((entry) => entry.scenario.name === scenarioName);
          const deltaWan = current && baseline ? (current.result.totalFullRevenue - baseline.result.totalFullRevenue) / 10000 : 0;
          return `${escapeHtml(scenarioName)}<br/>周期总收益：${asNum(Number(item.value || 0), 1)} 万元<br/>相对基准：${deltaWan >= 0 ? "+" : ""}${asNum(deltaWan, 1)} 万元`;
        }
      }),
      xAxis: valueAxis("万元", tokens),
      yAxis: categoryAxis(ranked.map((item) => item.scenario.name), tokens),
      series: [{
        name: "周期总收益",
        type: "bar",
        barWidth: 16,
        data: ranked.map((item) => ({
          value: Number((item.result.totalFullRevenue / 10000).toFixed(2)),
          itemStyle: {
            color: item.scenario.isBaseline ? tokens.baseline : tokens.primary
          }
        })),
        markLine: baseline
          ? {
              symbol: ["none", "none"],
              lineStyle: { type: "dashed", color: tokens.baseline },
              label: { color: tokens.baseline, formatter: `基准 ${asNum(baselineWan, 1)} 万元` },
              data: [{ xAxis: Number(baselineWan.toFixed(2)) }]
            }
          : undefined
      }]
    };
  }

  function buildScenarioBridgeItems(focusTotals, baseTotals, tokens) {
    return [
      { label: "现货收入", key: "spotRevenue", color: tokens.primary },
      { label: "差价机制", key: "mechanismRevenue", color: tokens.baseline },
      { label: "交易策略", key: "ltPnlRevenue", color: "#7569d8" },
      { label: "环境价值", key: "envRevenue", color: tokens.tertiary },
      { label: "配储补充", key: "storageSupplementRevenue", color: "#a36cc1" },
      { label: "综合费用", key: "comprehensiveFee", color: tokens.negative },
      { label: "其他收入", key: "otherIncome", color: tokens.secondary }
    ].map((item) => ({
      ...item,
      value: Number(((Number(focusTotals[item.key] || 0) - Number(baseTotals[item.key] || 0)) / 10000).toFixed(2))
    }));
  }

  function buildScenarioBridgeOption(focusTotals, baseTotals, tokens) {
    const items = buildScenarioBridgeItems(focusTotals, baseTotals, tokens);
    return {
      animationDuration: 340,
      grid: { top: 28, left: 54, right: 20, bottom: 76, containLabel: true },
      tooltip: axisTooltip(tokens, {
        valueFormatter: (value) => `${Number(value) >= 0 ? "+" : ""}${asNum(Number(value || 0), 2)} 万元`
      }),
      xAxis: categoryAxis(items.map((item) => item.label), tokens, {
        axisLabel: { interval: 0, rotate: 28 }
      }),
      yAxis: valueAxis("相对基准 万元", tokens),
      series: [{
        name: "差异贡献",
        type: "bar",
        barWidth: 18,
        data: items.map((item) => ({
          value: item.value,
          itemStyle: { color: item.value >= 0 ? item.color : tokens.negative }
        }))
      }]
    };
  }

  return Object.freeze({
    buildCompareThemeTokens,
    buildComparePlaceholderOption,
    buildSensitivityTornadoOption,
    buildSensitivityResponseOption,
    buildScenarioTrendOption,
    buildScenarioRankingOption,
    buildScenarioBridgeItems,
    buildScenarioBridgeOption
  });
});

