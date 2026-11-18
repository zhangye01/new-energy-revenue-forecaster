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

  function renderHistoryImportState(refs = {}, project, getProvinceName = () => "", view = {}) {
    const provinceLabel = getProvinceName(project?.province) || project?.provinceLabel || "—";
    if (refs.historySourceProvince) {
      refs.historySourceProvince.textContent = provinceLabel;
    }
    if (refs.historySourceKind) refs.historySourceKind.textContent = view.sourceKind || "省级模拟样本";
    if (refs.historySourceBasis) refs.historySourceBasis.textContent = view.basisLabel || "省级现货模拟价";
    if (refs.historySourceCoverage) refs.historySourceCoverage.textContent = `样本覆盖率 ${view.coverage || "—"}`;
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

  function renderUnavailable(input, message, insightText, project = null, view = {}) {
    const { refs = {}, getProvinceName } = input;
    renderHistoryImportState(refs, project, getProvinceName, view);
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
      sanitizeExportFilenamePart = (value) => value,
      renderStatuses = () => {},
      renderProjects = () => {},
      schedulePersistAppData = () => {}
    } = input;
    if (!refs.historyMonthTrendChart) return;
    if (resolveVisiblePageId(appState.activePage) !== "history-page") return;

    const controls = sanitizeHistoryAnalysis(appState.historyAnalysis);
    appState.historyAnalysis = controls;
    if (refs.historyTrendMode) refs.historyTrendMode.value = controls.trendMode || "chronological";
    if (!windowRef?.echarts) {
      renderUnavailable(input, "图表引擎未加载完成，请稍后重试。", "图表引擎未加载完成，请稍后重试。");
      return;
    }

    const project = getActiveProject();
    if (!project) {
      renderUnavailable(
        input,
        "请先选择项目。",
        "请在“我的项目”中选择项目。"
      );
      return;
    }
    if (!isProjectCreateCompleted(project)) {
      renderUnavailable(
        input,
        "请先保存基础信息。",
        "项目基础信息未保存。",
        project
      );
      return;
    }

    const dataset = buildHistorySpotAnalysisDataset(project);
    if (!dataset?.years?.length) {
      renderUnavailable(input, "暂无省级现货样本。", "当前省份暂无可分析日期。", project);
      return;
    }
    const range = historyAnalysis.resolveHistoryDateRange(controls, dataset);
    if (controls.startDate !== range.startDate || controls.endDate !== range.endDate) {
      appState.historyAnalysis = {
        ...controls,
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
    const historyData = historyAnalysis.buildHistorySelectedAnalysis(selectedYears);
    const provinceLabel = getProvinceName(project.province) || project.provinceLabel || "—";
    const historyView = historyPage.buildHistoryReadyViewModel({
      historyData, range, dataset, provinceLabel,
      sanitizePart: sanitizeExportFilenamePart
    });
    if (!historyData.allValues.length) {
      const message = dataset.modelDays === 365 && range.startDate === range.endDate && range.startDate.endsWith("-02-29")
        ? "模拟样本按 365 天生成，2 月 29 日留空。" : "所选日期范围暂无有效样本。";
      renderUnavailable(input, message, message, project, historyView);
      return;
    }

    renderHistoryImportState(refs, project, getProvinceName, historyView);
    historyView.exportPlan.forEach(([key, filename, rows]) => {
      setHistoryExportPayload(key, filename, rows);
    });
    syncHistoryExportButtons();
    const charts = ensureHistoryCharts();
    const chartOptions = historyCharts.buildHistoryChartOptions(historyData, historyThemeTokens(), { trendMode: controls.trendMode });
    Object.entries(chartOptions).forEach(([key, option]) => charts?.[key]?.setOption(option, true));

    queueHistoryChartsResize();

    const kpis = historyView.kpis;
    if (refs.historyKpiPoints) refs.historyKpiPoints.textContent = kpis.points;
    if (refs.historyKpiAvg) refs.historyKpiAvg.textContent = kpis.avg;
    if (refs.historyKpiP50) refs.historyKpiP50.textContent = kpis.p50;
    if (refs.historyKpiP90) refs.historyKpiP90.textContent = kpis.p90;
    if (refs.historyKpiNegative) refs.historyKpiNegative.textContent = kpis.negative;
    if (refs.historyInsightBox) {
      refs.historyInsightBox.textContent = historyView.yearsRangeText;
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
