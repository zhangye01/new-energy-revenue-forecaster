"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_SCENARIO_CHARTS = api;
  if (root.window && root.window !== root) {
    root.window.NE_SCENARIO_CHARTS = api;
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

  function rounded(value, digits = 4) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Number(numeric.toFixed(digits)) : 0;
  }

  function buildScenarioVisualThemeTokens(theme) {
    if (theme === "dark") {
      return {
        axisText: "#b8cae1",
        axisLine: "#4b617d",
        splitLine: "rgba(118, 145, 176, 0.22)",
        tooltipBg: "rgba(28, 40, 58, 0.96)",
        tooltipBorder: "#4a6180",
        positive: "#6aa8ff",
        positiveSoft: "#8cc5ff",
        negative: "#ef9b63",
        negativeSoft: "#d7b083",
        mechanism: "#4e90ff",
        market: "#6fb18b",
        trade: "#8b8df4",
        env: "#70c690",
        carbon: "#a58cff",
        storage: "#c294ef",
        other: "#6ec9c1"
      };
    }
    if (theme === "eye") {
      return {
        axisText: "#47604e",
        axisLine: "#adc3af",
        splitLine: "rgba(139, 168, 141, 0.24)",
        tooltipBg: "rgba(245, 250, 239, 0.96)",
        tooltipBorder: "#acc4ad",
        positive: "#4a8e74",
        positiveSoft: "#7eb79d",
        negative: "#d58e4d",
        negativeSoft: "#c7b06a",
        mechanism: "#3f7cb0",
        market: "#78a86e",
        trade: "#8174b4",
        env: "#5f9d79",
        carbon: "#9a7fca",
        storage: "#a27ab9",
        other: "#5b988e"
      };
    }
    return {
      axisText: "#5b6f89",
      axisLine: "#bfd0e4",
      splitLine: "rgba(151, 170, 196, 0.24)",
      tooltipBg: "rgba(255, 255, 255, 0.96)",
      tooltipBorder: "#c9d8eb",
      positive: "#56a36f",
      positiveSoft: "#79b592",
      negative: "#e08a4a",
      negativeSoft: "#d9b07a",
      mechanism: "#3d7ce0",
      market: "#79b592",
      trade: "#6f6bd9",
      env: "#56a36f",
      carbon: "#8a69c8",
      storage: "#a36cc1",
      other: "#3fa096"
    };
  }

  function buildScenarioVisualEmptyOption(message, tokens) {
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

  function scenarioVisualYearInterval(rows, targetTicks = 8) {
    return Math.max(0, Math.ceil((rows?.length || 0) / targetTicks) - 1);
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

  function categoryAxis(data, tokens) {
    return {
      type: "category",
      data,
      axisLabel: { color: tokens.axisText },
      axisLine: { lineStyle: { color: tokens.axisLine } },
      axisTick: { show: false }
    };
  }

  function baseParts(rows, tokens) {
    const yearLabels = rows.map((row) => row.yearLabel);
    const yearInterval = scenarioVisualYearInterval(rows);
    const categoryYearAxis = {
      ...categoryAxis(yearLabels, tokens),
      axisLabel: { color: tokens.axisText, interval: yearInterval, hideOverlap: true, fontSize: 11 }
    };
    const tooltipBase = {
      backgroundColor: tokens.tooltipBg,
      borderColor: tokens.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: tokens.axisText }
    };
    const legend = {
      top: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: tokens.axisText, fontWeight: 700 }
    };
    return {
      yearLabels,
      categoryYearAxis,
      tooltipBase,
      legend
    };
  }

  function buildEnergyOption(rows, tokens, parts) {
    if (!rows.some((row) => row.energyMwh > 0)) {
      return buildScenarioVisualEmptyOption("请先完成上网电量配置", tokens);
    }
    const hasActiveMechanismPrice = rows.some((row) => row.mechanismActive);
    const yAxis = [valueAxis("万MWh", tokens)];
    if (hasActiveMechanismPrice) {
      yAxis.push({
        ...valueAxis("元/MWh", tokens),
        position: "right"
      });
    }
    const series = [
      {
        name: "机制电量",
        type: "bar",
        stack: "energy",
        barWidth: 18,
        data: rows.map((row) => rounded(Number(row.mechanismEnergy) / 10000))
      },
      {
        name: "绿证电量",
        type: "bar",
        stack: "energy",
        barWidth: 18,
        data: rows.map((row) => rounded(Number(row.greenCertEnergy) / 10000))
      },
      {
        name: "绿电溢价电量",
        type: "bar",
        stack: "energy",
        barWidth: 18,
        data: rows.map((row) => rounded(Number(row.greenPremiumEnergy) / 10000))
      },
      {
        name: "碳收益电量",
        type: "bar",
        stack: "energy",
        barWidth: 18,
        data: rows.map((row) => rounded(Number(row.carbonEnergy) / 10000))
      },
      {
        name: "未兑现市场化电量",
        type: "bar",
        stack: "energy",
        barWidth: 18,
        data: rows.map((row) => rounded(Number(row.unredeemedMarketEnergy) / 10000))
      }
    ];
    if (hasActiveMechanismPrice) {
      series.push({
        name: "机制电价",
        type: "line",
        yAxisIndex: 1,
        connectNulls: false,
        smooth: false,
        symbolSize: 6,
        lineStyle: { width: 2.5, color: tokens.negative },
        itemStyle: { color: tokens.negative },
        data: rows.map((row) => (row.mechanismActive ? rounded(row.mechanismPrice) : null))
      });
    }
    return {
      animationDuration: 360,
      color: [tokens.mechanism, tokens.env, tokens.positiveSoft, tokens.carbon, tokens.market, tokens.negative],
      grid: { top: 72, right: hasActiveMechanismPrice ? 72 : 28, bottom: 44, left: 58, containLabel: true },
      legend: parts.legend,
      tooltip: {
        ...parts.tooltipBase,
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params];
          const yearText = items[0]?.axisValueLabel || items[0]?.axisValue || "";
          const lines = [`${escapeHtml(String(yearText))}年`];
          const row = rows[Number(items[0]?.dataIndex)] || null;
          if (row) {
            lines.push(`市场化交易电量合计：${asNum(row.marketEnergy, 0)} MWh`);
          }
          items.forEach((item) => {
            if (item.value === null || item.value === undefined || item.value === "-") return;
            const value = Number(item.value);
            if (!Number.isFinite(value)) return;
            let unit = "万MWh";
            let digits = 2;
            if (item.seriesName === "机制电价") {
              unit = "元/MWh";
              digits = 1;
            }
            const displayValue = unit === "万MWh" ? value * 10000 : value;
            const displayUnit = unit === "万MWh" ? "MWh" : unit;
            const displayDigits = unit === "万MWh" ? 0 : digits;
            lines.push(`${item.marker}${escapeHtml(item.seriesName)}：${asNum(displayValue, displayDigits)} ${displayUnit}`);
          });
          return lines.join("<br/>");
        }
      },
      xAxis: parts.categoryYearAxis,
      yAxis,
      series
    };
  }

  function buildUnitOption(rows, tokens, parts) {
    const impactAreaSeries = [
      {
        name: "交易策略",
        data: rows.map((row) => rounded(row.tradeImpact)),
        color: tokens.trade
      },
      {
        name: "环境价值",
        data: rows.map((row) => rounded(row.envImpact)),
        color: tokens.env
      },
      {
        name: "配储收益",
        data: rows.map((row) => rounded(row.storageImpact)),
        color: tokens.storage
      },
      {
        name: "其他收入",
        data: rows.map((row) => rounded(row.otherIncomeImpact)),
        color: tokens.other
      },
      {
        name: "综合费用",
        data: rows.map((row) => rounded(row.feeImpact)),
        color: tokens.negative
      }
    ];
    return {
      animationDuration: 360,
      color: impactAreaSeries.map((item) => item.color).concat(tokens.mechanism),
      grid: { top: 58, right: 28, bottom: 44, left: 56, containLabel: true },
      legend: parts.legend,
      tooltip: {
        ...parts.tooltipBase,
        trigger: "axis",
        valueFormatter: (value) => `${asNum(Number(value || 0), 2)} 元/MWh`
      },
      xAxis: parts.categoryYearAxis,
      yAxis: valueAxis("元/MWh", tokens),
      series: [
        ...impactAreaSeries.map((item) => ({
          name: item.name,
          type: "line",
          stack: "annualImpact",
          smooth: true,
          symbol: "none",
          lineStyle: { width: 1.8, color: item.color },
          itemStyle: { color: item.color },
          areaStyle: { opacity: 0.5, color: item.color },
          data: item.data
        })),
        {
          name: "净影响",
          type: "line",
          smooth: true,
          symbolSize: 5,
          lineStyle: { width: 3, color: tokens.mechanism },
          itemStyle: { color: tokens.mechanism },
          data: rows.map((row) => rounded(row.netImpact))
        }
      ]
    };
  }

  function buildTrendOption(rows, tokens, parts) {
    const trendSeries = [
      {
        name: "交易策略损益",
        data: rows.map((row) => rounded(row.ltPnlPrice)),
        color: tokens.trade
      },
      {
        name: "环境价值度电收益",
        data: rows.map((row) => rounded(row.envUnitValue)),
        color: tokens.env
      },
      {
        name: "综合费用",
        data: rows.map((row) => rounded(row.feeTotal)),
        color: tokens.negative
      },
      {
        name: "配储补充收益",
        data: rows.map((row) => rounded(row.storageSupplementPerMwh)),
        color: tokens.storage
      },
      {
        name: "其他收入",
        data: rows.map((row) => rounded(row.otherIncomeImpact)),
        color: tokens.other
      }
    ];
    return {
      animationDuration: 360,
      grid: { top: 54, right: 28, bottom: 44, left: 56, containLabel: true },
      legend: parts.legend,
      tooltip: {
        ...parts.tooltipBase,
        trigger: "axis",
        valueFormatter: (value) => `${asNum(Number(value || 0), 2)} 元/MWh`
      },
      xAxis: parts.categoryYearAxis,
      yAxis: valueAxis("元/MWh", tokens),
      series: trendSeries.map((item) => ({
        name: item.name,
        type: "line",
        smooth: true,
        symbolSize: 5,
        lineStyle: { width: 2.5, color: item.color },
        itemStyle: { color: item.color },
        data: item.data
      }))
    };
  }

  function buildScenarioVisualOptions(rows, tokens) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const parts = baseParts(safeRows, tokens);
    return {
      energy: buildEnergyOption(safeRows, tokens, parts),
      unit: buildUnitOption(safeRows, tokens, parts),
      trend: buildTrendOption(safeRows, tokens, parts)
    };
  }

  return Object.freeze({
    buildScenarioVisualThemeTokens,
    buildScenarioVisualEmptyOption,
    scenarioVisualYearInterval,
    buildScenarioVisualOptions
  });
});
