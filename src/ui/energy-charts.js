"use strict";

(function (root, factory) {
  const energyProfiles = typeof module !== "undefined" && module.exports
    ? require("../domain/energy-profiles")
    : root.NE_ENERGY_PROFILES;
  const api = factory(energyProfiles);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_ENERGY_CHARTS = api;
  if (root.window && root.window !== root) {
    root.window.NE_ENERGY_CHARTS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (energyProfiles) {
  if (!energyProfiles) {
    throw new Error("电量图表模块初始化失败：缺少电量曲线模块");
  }

  function buildEnergyChartEmptyOption(message, tokens) {
    return {
      animation: false,
      xAxis: { show: false, type: "category", data: [] },
      yAxis: { show: false, type: "value" },
      series: [],
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

  function setEnergyChartEmpty(chart, message, tokens) {
    if (!chart) return;
    chart.clear?.();
    chart.setOption?.(buildEnergyChartEmptyOption(message, tokens), true);
  }

  function buildAnnualRows(project, energyData) {
    const forecastYears = Number.isInteger(project?.forecastYears) && project.forecastYears > 0
      ? project.forecastYears
      : 0;
    return Array.from({ length: forecastYears }, (_, index) => {
      const year = project.startYear + index;
      const annualHours = Number(
        energyData?.annualSummary?.[year]?.annualHours
        ?? energyData?.annualInputByYear?.[year]
        ?? 0
      );
      return {
        year,
        annualHours: Number.isFinite(annualHours) ? annualHours : 0
      };
    });
  }

  function hasAnnualValues(annualRows) {
    return (annualRows || []).some((item) => Number(item.annualHours) > 0);
  }

  function buildAnnualHoursOption(annualRows, tokens) {
    return {
      animationDuration: 320,
      color: ["#2d7dd2"],
      grid: { left: 72, right: 24, top: 36, bottom: 62, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: tokens.tooltipBg,
        borderColor: tokens.tooltipBorder,
        textStyle: { color: tokens.axisText },
        valueFormatter: (value) => `${Number(value || 0).toFixed(2)} h`
      },
      xAxis: {
        type: "category",
        data: annualRows.map((item) => `${item.year}`),
        axisLabel: { color: tokens.axisText, margin: 12 },
        axisLine: { lineStyle: { color: tokens.axisLine } }
      },
      yAxis: {
        type: "value",
        name: "小时数 h",
        nameLocation: "middle",
        nameGap: 52,
        nameRotate: 90,
        nameTextStyle: {
          color: tokens.axisText,
          fontWeight: 600,
          fontSize: 13,
          padding: [0, 0, 10, 0]
        },
        axisLabel: {
          color: tokens.axisText,
          formatter: (value) => `${Number(value).toFixed(0)}`,
          margin: 12
        },
        splitLine: { lineStyle: { color: tokens.splitLine } }
      },
      series: [{
        type: "bar",
        barMaxWidth: 36,
        itemStyle: { borderRadius: [6, 6, 0, 0] },
        data: annualRows.map((item) => Number(Number(item.annualHours || 0).toFixed(2)))
      }]
    };
  }

  function buildTypicalMonthHourlyHours(typicalProfile) {
    if (!Array.isArray(typicalProfile) || typicalProfile.length !== 8760) return null;
    const totalWeight = typicalProfile.reduce((sum, value) => {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) && numericValue >= 0 ? sum + numericValue : sum;
    }, 0);
    const hoursScale = totalWeight > 0 ? 8760 / totalWeight : 0;
    const monthHourlyHours = Array.from({ length: 12 }, () => Array(24).fill(0));
    typicalProfile.forEach((value, index) => {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue) || numericValue < 0) return;
      const dayOfYear = Math.floor(index / 24) + 1;
      const hourIndex = index % 24;
      const { month } = energyProfiles.dayOfYearToMonthDay(dayOfYear);
      monthHourlyHours[month - 1][hourIndex] += numericValue * hoursScale;
    });
    return monthHourlyHours;
  }

  function buildTypicalDayCurveOption(typicalProfile, tokens) {
    const monthHourlyHours = buildTypicalMonthHourlyHours(typicalProfile);
    if (!monthHourlyHours) return null;
    const monthLabels = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
    const hourLabels = Array.from({ length: 24 }, (_, index) => `${index + 1}`);
    const monthColors = [
      "#4f8ff7",
      "#66b5ff",
      "#44c3b6",
      "#6ed28a",
      "#f2b24f",
      "#f58c4c",
      "#ec6e5b",
      "#d7658d",
      "#9a6af0",
      "#7f8cff",
      "#4ec0f1",
      "#42a86b"
    ];
    return {
      animationDuration: 320,
      color: monthColors,
      legend: {
        type: "plain",
        top: 4,
        left: "center",
        width: "92%",
        itemWidth: 18,
        itemHeight: 10,
        itemGap: 12,
        textStyle: {
          color: tokens.axisText,
          fontSize: 12
        }
      },
      grid: { left: 72, right: 30, top: 76, bottom: 70, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: tokens.tooltipBg,
        borderColor: tokens.tooltipBorder,
        textStyle: { color: tokens.axisText },
        valueFormatter: (value) => `${Number(value || 0).toFixed(2)} h`
      },
      xAxis: {
        type: "category",
        name: "小时",
        nameLocation: "middle",
        nameGap: 38,
        nameTextStyle: {
          color: tokens.axisText,
          fontWeight: 600,
          fontSize: 13
        },
        data: hourLabels,
        axisLabel: { color: tokens.axisText, margin: 12 },
        axisLine: { lineStyle: { color: tokens.axisLine } },
        splitLine: { show: false }
      },
      yAxis: {
        type: "value",
        name: "小时数 h",
        nameLocation: "middle",
        nameGap: 56,
        nameRotate: 90,
        nameTextStyle: {
          color: tokens.axisText,
          fontWeight: 600,
          fontSize: 13,
          padding: [0, 0, 10, 0]
        },
        axisLabel: {
          color: tokens.axisText,
          formatter: (value) => `${Number(value).toFixed(0)}`,
          margin: 12
        },
        splitLine: { lineStyle: { color: tokens.splitLine } }
      },
      series: monthLabels.map((label, monthIndex) => ({
        name: label,
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2 },
        data: monthHourlyHours[monthIndex].map((value) => Number(value.toFixed(2)))
      }))
    };
  }

  function buildEnergyCurveText({ hasAnnualValues: annualReady, hasConfiguredTypicalCurve, sourceLabel } = {}) {
    const distribution = "横轴为 1–24 时。纵轴累加该月各日同一小时档的分布权重，按全年合计 8760 小时换算。";
    const subtitle = sourceLabel ? `${sourceLabel}。${distribution}` : distribution;
    let note = `左图展示测算周期内逐年总小时数。右图展示${sourceLabel || "典型年按月份拆解的 24 小时曲线"}。`;
    if (!annualReady) {
      note = "导入逐年总量模板后，左图展示年度小时数。";
    } else if (!hasConfiguredTypicalCurve) {
      note = "逐年总量已导入。保存典型年曲线后，右图将展示其日内分布。";
    }
    return { subtitle, note };
  }

  function buildEnergyCurveChartViewModel(input = {}) {
    const {
      project = null,
      createReady = false,
      energyState = {},
      previewMeta = null
    } = input;
    if (!project) {
      return {
        state: "empty",
        noteMessage: "请先进入项目，再查看上网电量图形展示。",
        annualMessage: "请先进入项目，再查看逐年上网电量小时数。",
        typicalMessage: "请先进入项目，再查看典型年日内曲线（月度）。"
      };
    }
    if (!createReady) {
      return {
        state: "empty",
        noteMessage: "请先完成步骤1基础信息保存，再查看上网电量图形展示。",
        annualMessage: "请先完成步骤1基础信息保存，再查看逐年上网电量小时数。",
        typicalMessage: "请先完成步骤1基础信息保存，再查看典型年日内曲线（月度）。"
      };
    }
    const energyData = energyState.energyData || {};
    const annualRows = buildAnnualRows(project, energyData);
    const annualValuesReady = hasAnnualValues(annualRows);
    const hasConfiguredTypicalCurve = Boolean(energyState.hasTypicalCurve);
    const typicalProfile = hasConfiguredTypicalCurve ? previewMeta?.profile || null : null;
    const chartText = buildEnergyCurveText({
      hasAnnualValues: annualValuesReady,
      hasConfiguredTypicalCurve,
      sourceLabel: previewMeta?.sourceLabel || ""
    });
    return {
      state: "ready",
      annualRows,
      hasAnnualValues: annualValuesReady,
      typicalProfile,
      chartText,
      annualEmptyMessage: "导入逐年总量后展示年度小时数。",
      typicalEmptyMessage: "导入典型年8760模板或调用省份典型曲线后展示日内分布。"
    };
  }

  function applyEnergyCurveChartRender(input = {}) {
    const {
      refs = {},
      chartModel = {},
      annualChart = null,
      typicalChart = null,
      tokens = {}
    } = input;
    const resizeVisibleCharts = () => {
      [annualChart, typicalChart].forEach((chart) => {
        if (!chart?.resize || chart.isDisposed?.()) return;
        const node = chart.getDom?.();
        if (node && (!node.clientWidth || !node.clientHeight)) return;
        chart.resize();
      });
    };
    // A retained chart may have been resized while its page was hidden.
    resizeVisibleCharts();
    const windowRef = refs.energyAnnualChart?.ownerDocument?.defaultView
      || refs.energyCurveChart?.ownerDocument?.defaultView;
    windowRef?.requestAnimationFrame?.(() => windowRef.requestAnimationFrame(resizeVisibleCharts));
    if (chartModel.state === "empty") {
      if (refs.energyCurveNote) refs.energyCurveNote.textContent = chartModel.noteMessage;
      if (refs.energyCurveSubtitle) {
        refs.energyCurveSubtitle.textContent = "导入典型年模板或调用项目所在省份的典型曲线后，可查看各月日内分布。";
      }
      setEnergyChartEmpty(annualChart, chartModel.annualMessage, tokens);
      setEnergyChartEmpty(typicalChart, chartModel.typicalMessage, tokens);
      return;
    }
    if (chartModel.hasAnnualValues) {
      annualChart?.setOption?.(buildAnnualHoursOption(chartModel.annualRows, tokens), true);
    } else {
      setEnergyChartEmpty(annualChart, chartModel.annualEmptyMessage, tokens);
    }
    const typicalOption = buildTypicalDayCurveOption(chartModel.typicalProfile, tokens);
    if (typicalOption) {
      typicalChart?.setOption?.(typicalOption, true);
    } else {
      setEnergyChartEmpty(typicalChart, chartModel.typicalEmptyMessage, tokens);
    }
    if (refs.energyCurveSubtitle) refs.energyCurveSubtitle.textContent = chartModel.chartText.subtitle;
    if (refs.energyCurveNote) refs.energyCurveNote.textContent = chartModel.chartText.note;
  }

  return Object.freeze({
    buildEnergyChartEmptyOption,
    buildAnnualRows,
    hasAnnualValues,
    buildAnnualHoursOption,
    buildTypicalMonthHourlyHours,
    buildTypicalDayCurveOption,
    buildEnergyCurveText,
    buildEnergyCurveChartViewModel,
    applyEnergyCurveChartRender
  });
});
