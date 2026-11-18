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
  const CHART_EXPORTS = Object.freeze([
    ["monthTrend", "historyExportMonthTrendButton", "月度电价趋势"],
    ["heatmap", "historyExportHeatmapButton", "月份与小时热力图"],
    ["duration", "historyExportDurationButton", "价格持续曲线"],
    ["intradaySpread", "historyExportIntradaySpreadButton", "月度日内价差"]
  ]);

  function buildHistoryKpis(data = {}) {
    return {
      points: `${Number(data.pointCount || 0).toLocaleString()} 点`,
      avg: `${Number(data.valueAvg || 0).toFixed(1)} 元/MWh`,
      p50: `${Number(data.p50 || 0).toFixed(1)} 元/MWh`,
      p90: `${Number(data.p90 || 0).toFixed(1)} 元/MWh`,
      negative: `${Number(data.negativeRatio || 0).toFixed(2)}%`
    };
  }

  function bindPolicyHistoryEvents(input = {}) {
    const {
      refs = {},
      handlers = {}
    } = input;
    if (refs.policyFilterProvince) {
      refs.policyFilterProvince.addEventListener("change", () => {
        handlers.changePolicyProvince?.(refs.policyFilterProvince.value);
      });
    }
    if (refs.policyFilterRegion) {
      refs.policyFilterRegion.addEventListener("change", () => {
        handlers.changePolicyRegion?.(refs.policyFilterRegion.value);
      });
    }
    if (refs.historyStartDate) {
      refs.historyStartDate.addEventListener("change", () => {
        handlers.changeHistoryStartDate?.(refs.historyStartDate.value);
      });
    }
    if (refs.historyEndDate) {
      refs.historyEndDate.addEventListener("change", () => {
        handlers.changeHistoryEndDate?.(refs.historyEndDate.value);
      });
    }
    refs.historyTrendMode?.addEventListener("change", () => handlers.changeHistoryTrendMode?.(refs.historyTrendMode.value));
    CHART_EXPORTS.forEach(([exportType, refKey]) => {
      refs[refKey]?.addEventListener("click", () => {
        handlers.exportHistoryChart?.(exportType);
      });
    });
  }

  function createPolicyHistoryEventHandlers(input = {}) {
    const {
      getPolicyFilters = () => ({}),
      setPolicyFilters = () => {},
      getHistoryAnalysis = () => ({}),
      setHistoryAnalysis = () => {},
      sanitizeHistoryAnalysis = (value) => value,
      renderPolicyPanel = () => {},
      renderHistoryPrices = () => {},
      schedulePersistAppData = () => {},
      exportHistoryChart = () => {}
    } = input;

    const updatePolicyFilters = (patch) => {
      setPolicyFilters({
        ...getPolicyFilters(),
        ...patch
      });
      renderPolicyPanel();
      schedulePersistAppData();
    };

    const updateHistoryAnalysis = (patch) => {
      setHistoryAnalysis(sanitizeHistoryAnalysis({
        ...getHistoryAnalysis(),
        ...patch
      }));
      renderHistoryPrices();
      schedulePersistAppData();
    };

    return {
      changePolicyProvince: (provinceKey) => updatePolicyFilters({ provinceKey }),
      changePolicyRegion: (regionKey) => updatePolicyFilters({ regionKey }),
      changeHistoryStartDate: (startDate) => updateHistoryAnalysis({ startDate }),
      changeHistoryEndDate: (endDate) => updateHistoryAnalysis({ endDate }),
      changeHistoryTrendMode: (trendMode) => updateHistoryAnalysis({ trendMode }),
      exportHistoryChart
    };
  }

  function buildHistoryExportPlan(input = {}) {
    const {
      provinceLabel = "-", sourceKind = "省级模拟样本", basisLabel = "省级现货模拟价",
      yearsRangeText = "", exportRows = {}, sanitizePart = (value) => value
    } = input;
    const exportPrefix = [provinceLabel, sourceKind, yearsRangeText].map(sanitizePart).join("-");
    return CHART_EXPORTS.map(([key, , name]) => {
      const rows = exportRows[key] || [];
      const withSource = rows.map((row, index) => [...row, ...(index === 0
        ? ["sample_source", "price_basis"] : [sourceKind, basisLabel])]);
      return [key, `${exportPrefix}-${name}.csv`, withSource];
    });
  }

  function buildHistoryReadyViewModel(input = {}) {
    const { historyData = {}, range = {}, dataset = {}, provinceLabel = "-",
      sanitizePart = (value) => value } = input;
    const yearsRangeText = `${range.startDate || ""} 至 ${range.endDate || ""}`;
    const sourceKind = dataset.mock ? "省级模拟样本" : "省级历史样本";
    const basisLabel = dataset.marketPriceLabel || "省级现货参考价";
    const { expectedPoints = 0, samplePoints = 0 } = historyData.coverage || {};
    return {
      yearsRangeText,
      sourceKind,
      basisLabel,
      coverage: expectedPoints > 0 ? (samplePoints / expectedPoints * 100).toFixed(1) + "%" : "—",
      exportPlan: buildHistoryExportPlan({
        provinceLabel, sourceKind, basisLabel, yearsRangeText,
        exportRows: historyData.exportRows, sanitizePart
      }),
      kpis: buildHistoryKpis({
        pointCount: samplePoints,
        valueAvg: historyData.valueAvg,
        p50: historyData.p50,
        p90: historyData.p90,
        negativeRatio: historyData.negativeRatio
      })
    };
  }

  return Object.freeze({
    bindPolicyHistoryEvents,
    buildHistoryExportPlan,
    buildHistoryKpis,
    buildHistoryReadyViewModel,
    createPolicyHistoryEventHandlers
  });
});
