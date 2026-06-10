"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_HISTORY_PAGE = api;
  if (root.window && root.window !== root) {
    root.window.NE_HISTORY_PAGE = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function buildHistoryKpis(data = {}) {
    return {
      points: `${Number(data.pointCount || 0).toLocaleString()} 点`,
      avg: `${Number(data.valueAvg || 0).toFixed(1)} 元/MWh`,
      p50: `${Number(data.p50 || 0).toFixed(1)} 元/MWh`,
      p90: `${Number(data.p90 || 0).toFixed(1)} 元/MWh`,
      negative: `${Number(data.negativeRatio || 0).toFixed(2)}%`
    };
  }

  function buildHistoryExportPlan(input = {}) {
    const {
      provinceLabel = "-",
      assetLabel = "-",
      siteLabel = "-",
      yearsRangeText = "",
      exportRows = {},
      sanitizePart = (value) => String(value || "")
    } = input;
    const exportPrefix = [
      sanitizePart(provinceLabel),
      "历史现货",
      sanitizePart(assetLabel),
      sanitizePart(siteLabel),
      sanitizePart(yearsRangeText)
    ].join("-");
    return [
      ["monthTrend", `${exportPrefix}-月度均价趋势对比.csv`, exportRows.monthTrend],
      ["typicalDay", `${exportPrefix}-典型日电价曲线.csv`, exportRows.typicalDay],
      ["distribution", `${exportPrefix}-电价分布直方图.csv`, exportRows.distribution],
      ["heatmap", `${exportPrefix}-分时电价热力图.csv`, exportRows.heatmap],
      ["boxplot", `${exportPrefix}-月度电价箱线图.csv`, exportRows.boxplot]
    ];
  }

  function buildHistoryInsightText(input = {}) {
    const {
      dataset = {},
      provinceLabel = "-",
      assetLabel = "-",
      siteLabel = "-",
      hasStorage = false,
      storagePowerMw = 0,
      storageDurationH = 0,
      yearsRangeText = "",
      peakTime = "--:--",
      maxStdMonthLabel = "",
      maxStd = 0
    } = input;
    const sourceLabel = dataset.sourceType === "database"
      ? `${provinceLabel}${dataset.mock ? "省级现货模拟库" : "省级现货数据库"}`
      : "历史现货数据库";
    const storageLabel = hasStorage
      ? `，已按配储(${storagePowerMw || 0}MW / ${storageDurationH || 0}h)对波动做平滑处理`
      : "";
    return `数据源：${sourceLabel}。当前口径：${assetLabel} / ${siteLabel}${storageLabel}。日期区间：${yearsRangeText}（15分钟颗粒度）。工作日高价时段约在 ${peakTime}，波动最大月份为 ${maxStdMonthLabel}（标准差 ${Number(maxStd || 0).toFixed(1)} 元/MWh）。`;
  }

  function buildHistoryReadyViewModel(input = {}) {
    const {
      historyData = {},
      range = {},
      dataset = {},
      project = {},
      labels = {},
      monthLabels = [],
      quarterLabels = [],
      sanitizePart = (value) => String(value || "")
    } = input;
    const yearsRangeText = `${range.startDate || ""}至${range.endDate || ""}`;
    const typicalWorkday = Array.isArray(historyData.typicalWorkday) ? historyData.typicalWorkday : [];
    const workdayMax = Math.max(...typicalWorkday.filter((value) => Number.isFinite(value)));
    const workdayPeakIndex = typicalWorkday.findIndex((value) => value === workdayMax);
    const peakTime = workdayPeakIndex >= 0 ? quarterLabels[workdayPeakIndex] : "--:--";
    return {
      yearsRangeText,
      exportPlan: buildHistoryExportPlan({
        provinceLabel: labels.provinceLabel,
        assetLabel: labels.assetLabel,
        siteLabel: labels.siteLabel,
        yearsRangeText,
        exportRows: historyData.exportRows,
        sanitizePart
      }),
      kpis: buildHistoryKpis({
        pointCount: Array.isArray(historyData.allValues) ? historyData.allValues.length : 0,
        valueAvg: historyData.valueAvg,
        p50: historyData.p50,
        p90: historyData.p90,
        negativeRatio: historyData.negativeRatio
      }),
      insightText: buildHistoryInsightText({
        dataset,
        provinceLabel: labels.provinceLabel,
        assetLabel: labels.assetLabel,
        siteLabel: labels.siteLabel,
        hasStorage: project.hasStorage,
        storagePowerMw: project.storagePowerMw,
        storageDurationH: project.storageDurationH,
        yearsRangeText,
        peakTime,
        maxStdMonthLabel: monthLabels[historyData.maxStdMonth],
        maxStd: historyData.maxStd
      })
    };
  }

  return Object.freeze({
    buildHistoryExportPlan,
    buildHistoryInsightText,
    buildHistoryKpis,
    buildHistoryReadyViewModel
  });
});
