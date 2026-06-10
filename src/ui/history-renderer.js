"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_HISTORY_RENDERER = api;
  if (root.window && root.window !== root) {
    root.window.NE_HISTORY_RENDERER = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function resetHistoryKpis(refs = {}) {
    if (refs.historyKpiPoints) refs.historyKpiPoints.textContent = "-";
    if (refs.historyKpiAvg) refs.historyKpiAvg.textContent = "-";
    if (refs.historyKpiP50) refs.historyKpiP50.textContent = "-";
    if (refs.historyKpiP90) refs.historyKpiP90.textContent = "-";
    if (refs.historyKpiNegative) refs.historyKpiNegative.textContent = "-";
  }

  function renderHistoryImportState(refs = {}, project, getProvinceName = () => "") {
    const provinceLabel = project?.provinceLabel || getProvinceName(project?.province) || "-";
    if (refs.historySourceProvince) {
      refs.historySourceProvince.textContent = `当前省份：${provinceLabel}`;
    }
  }

  function setHistoryNoData(input = {}) {
    const {
      refs = {},
      message = "",
      resetHistoryExportPayloads = () => {},
      ensureHistoryCharts = () => null,
      historyThemeTokens = () => ({}),
      historyCharts = {},
      queueHistoryChartsResize = () => {}
    } = input;
    resetHistoryExportPayloads();
    const charts = ensureHistoryCharts();
    if (!charts) return;
    const tokens = historyThemeTokens();
    Object.values(charts).forEach((chart) => {
      if (!chart) return;
      chart.clear();
      chart.setOption(historyCharts.buildHistoryNoDataOption(message, tokens), true);
    });
    queueHistoryChartsResize();
  }

  function renderUnavailable(input, message, insightText, project = null) {
    const { refs = {}, getProvinceName } = input;
    renderHistoryImportState(refs, project, getProvinceName);
    setHistoryNoData({ ...input, message });
    resetHistoryKpis(refs);
    if (refs.historyInsightBox) {
      refs.historyInsightBox.textContent = insightText;
    }
  }

  function renderHistoryPrices(input = {}) {
    const {
      refs = {},
      appState = {},
      windowRef = null,
      resolveVisiblePageId = (page) => page,
      sanitizeHistoryAnalysis = (value) => value,
      getActiveProject = () => null,
      isProjectCreateCompleted = () => false,
      buildHistorySpotAnalysisDataset = () => null,
      historyAnalysis,
      historyPage,
      historyCharts,
      ensureHistoryCharts = () => null,
      historyThemeTokens = () => ({}),
      queueHistoryChartsResize = () => {},
      setHistoryExportPayload = () => {},
      syncHistoryExportButtons = () => {},
      getProvinceName = () => "",
      getAssetTypeLabel = () => "",
      getSiteTypeLabel = () => "",
      sanitizeExportFilenamePart = (value) => value,
      renderStatuses = () => {},
      renderProjects = () => {},
      schedulePersistAppData = () => {},
      historyMonthLabels = [],
      historyQuarterLabels = []
    } = input;
    if (!refs.historyMonthTrendChart) return;
    if (resolveVisiblePageId(appState.activePage) !== "history-page") return;

    const controls = sanitizeHistoryAnalysis(appState.historyAnalysis);
    appState.historyAnalysis = controls;
    if (!windowRef?.echarts) {
      renderUnavailable(input, "图表引擎未加载完成，请稍后重试。", "图表引擎未加载完成，请稍后重试。");
      return;
    }

    const project = getActiveProject();
    if (!project) {
      renderUnavailable(
        input,
        "请先在“我的项目”中进入一个项目，再查看当前省份历史现货展示。",
        "进入项目后，系统会自动按当前项目省份展示15分钟历史现货样本。"
      );
      return;
    }
    if (!isProjectCreateCompleted(project)) {
      renderUnavailable(
        input,
        "请先完成项目基础信息保存，系统才会按省份自动展示历史现货样本。",
        "完成项目基础信息保存后，本页会自动切换到对应省份的历史现货展示范围。",
        project
      );
      return;
    }

    const dataset = buildHistorySpotAnalysisDataset(project);
    renderHistoryImportState(refs, project, getProvinceName);
    const range = historyAnalysis.resolveHistoryDateRange(controls, dataset);
    if (controls.startDate !== range.startDate || controls.endDate !== range.endDate) {
      appState.historyAnalysis = {
        startDate: range.startDate,
        endDate: range.endDate
      };
    }
    if (refs.historyStartDate) {
      refs.historyStartDate.min = range.minDate;
      refs.historyStartDate.max = range.maxDate;
      refs.historyStartDate.value = range.startDate;
    }
    if (refs.historyEndDate) {
      refs.historyEndDate.min = range.minDate;
      refs.historyEndDate.max = range.maxDate;
      refs.historyEndDate.value = range.endDate;
    }
    const selectedYears = historyAnalysis.selectHistoryYearsByDateRange(dataset, range);
    if (!selectedYears.length) {
      renderUnavailable(input, "当前项目暂无可分析数据。", "当前项目暂无可分析数据。", project);
      return;
    }

    const charts = ensureHistoryCharts();
    const tokens = historyThemeTokens();
    const lineColors = ["#2f78e8", "#6cb34f", "#ff8a1f", "#8b5cf6", "#0ea5a3"];
    const historyData = historyAnalysis.buildHistorySelectedAnalysis(selectedYears, { lineColors });
    const provinceLabel = project.provinceLabel || getProvinceName(project.province) || "-";
    const assetLabel = getAssetTypeLabel(project.assetType);
    const siteLabel = getSiteTypeLabel(project.siteType);
    const historyView = historyPage.buildHistoryReadyViewModel({
      historyData,
      range,
      dataset,
      project,
      labels: { provinceLabel, assetLabel, siteLabel },
      monthLabels: historyMonthLabels,
      quarterLabels: historyQuarterLabels,
      sanitizePart: sanitizeExportFilenamePart
    });
    historyView.exportPlan.forEach(([key, filename, rows]) => {
      setHistoryExportPayload(key, filename, rows);
    });
    syncHistoryExportButtons();
    const historyChartOptions = historyCharts.buildHistoryChartOptions(historyData, tokens);
    if (charts.monthTrend) charts.monthTrend.setOption(historyChartOptions.monthTrend, true);
    if (charts.typicalDay) charts.typicalDay.setOption(historyChartOptions.typicalDay, true);
    if (charts.distribution) charts.distribution.setOption(historyChartOptions.distribution, true);
    if (charts.heatmap) charts.heatmap.setOption(historyChartOptions.heatmap, true);
    if (charts.boxplot) charts.boxplot.setOption(historyChartOptions.boxplot, true);

    queueHistoryChartsResize();

    const kpis = historyView.kpis;
    if (refs.historyKpiPoints) refs.historyKpiPoints.textContent = kpis.points;
    if (refs.historyKpiAvg) refs.historyKpiAvg.textContent = kpis.avg;
    if (refs.historyKpiP50) refs.historyKpiP50.textContent = kpis.p50;
    if (refs.historyKpiP90) refs.historyKpiP90.textContent = kpis.p90;
    if (refs.historyKpiNegative) refs.historyKpiNegative.textContent = kpis.negative;
    if (refs.historyInsightBox) {
      refs.historyInsightBox.textContent = historyView.insightText;
      refs.historyInsightBox.style.borderColor = "#8fb48d";
      refs.historyInsightBox.style.background = "#f1fbf1";
    }
    if (project.statuses["history-page"] !== "completed") {
      project.statuses["history-page"] = "completed";
      renderStatuses();
      renderProjects();
      schedulePersistAppData();
    }
  }

  return Object.freeze({
    renderHistoryImportState,
    renderHistoryPrices,
    resetHistoryKpis,
    setHistoryNoData
  });
});
