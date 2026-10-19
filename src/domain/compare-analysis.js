"use strict";

(function (root, factory) {
  const isCommonJs = typeof module !== "undefined" && module.exports;
  const api = factory(
    isCommonJs ? require("./compare-sensitivity") : root.NE_COMPARE_SENSITIVITY,
    () => isCommonJs ? require("./rough-price") : root.NE_ROUGH_PRICE,
    isCommonJs ? require("./revenue-calculator") : root.NE_REVENUE_CALCULATOR
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_COMPARE_ANALYSIS = api;
  if (root.window && root.window !== root) {
    root.window.NE_COMPARE_ANALYSIS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (sensitivity, getResultValidity, calculator) {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sanitizeCompareSensitivitySettings(settings = {}) {
    const topN = settings.topN === "all" ? "all" : Math.round(Number(settings.topN) || 8);
    return {
      rangePercent: clamp(Math.round(Number(settings.rangePercent) || 20), 5, 60),
      stepPercent: clamp(Math.round(Number(settings.stepPercent) || 5), 1, 20),
      responseScalePercent: 100,
      topN: topN === "all" ? "all" : clamp(topN, 3, 20),
      selectedKeys: Array.isArray(settings.selectedKeys)
        ? settings.selectedKeys.filter(Boolean)
        : []
    };
  }

  function sensitivityAxisLabels(settings = {}) {
    const safe = sanitizeCompareSensitivitySettings(settings);
    const range = safe.rangePercent;
    const step = safe.stepPercent;
    const values = new Set([0, -range, range]);
    for (let value = 0; value <= range; value += step) {
      values.add(value);
      values.add(-value);
    }
    return Array.from(values)
      .sort((a, b) => a - b)
      .map((value) => `${value > 0 ? "+" : ""}${value}%`);
  }

  function buildCompareSensitivityFactors(project, baseline, settings = {}) {
    const ratios = sensitivityAxisLabels(settings).map((label) => Number(label.replace("%", "")) / 100);
    return sensitivity?.buildFactors(project, baseline, ratios) || [];
  }

  function resultComponentTotals(result) {
    const rows = result?.annualRows || [];
    const sum = (key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
    return {
      spotRevenue: sum("spotRevenue"),
      mechanismRevenue: sum("mechanismRevenue"),
      ltPnlRevenue: sum("ltPnlRevenue"),
      envRevenue: sum("envRevenue"),
      storageSupplementRevenue: sum("storageSupplementRevenue"),
      comprehensiveFee: -sum("comprehensiveFee"),
      otherIncome: sum("otherIncome")
    };
  }

  function detectTopDriver(result, baselineResult) {
    if (!result?.annualRows?.length || !baselineResult?.annualRows?.length) return "-";
    const totals = resultComponentTotals(result), baseline = resultComponentTotals(baselineResult);
    const names = { spotRevenue: "现货收入", mechanismRevenue: "差价机制", ltPnlRevenue: "交易策略损益",
      envRevenue: "环境价值", storageSupplementRevenue: "配储补充收益", comprehensiveFee: "综合费用", otherIncome: "其他收入" };
    const ranked = Object.keys(names).map((key) => ({ name: names[key], value: Math.abs(totals[key] - baseline[key]) }))
      .sort((a, b) => b.value - a.value);
    return ranked[0].value > 0.000001 ? ranked[0].name : "无差异";
  }

  function closeAmount(a, b) {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 1e-9);
  }

  function annualRowIsComplete(project, scenario, row, index) {
    const fields = ["annualHours", "energyMwh", "fullRevenue", "fullRevenuePrice", "capturePrice", "spotAvgPrice", "spotRevenue",
      "mechanismRevenue", "ltPnlRevenue", "envRevenue", "storageSupplementRevenue", "comprehensiveFee", "otherIncome"];
    if (!row || row.year !== project.startYear + index || row.energyMwh < 0 || !fields.every((key) => Number.isFinite(row[key]))) return false;
    const revenue = row.spotRevenue + row.mechanismRevenue + row.ltPnlRevenue + row.envRevenue + row.storageSupplementRevenue
      - row.comprehensiveFee + row.otherIncome;
    return closeAmount(row.energyMwh, row.annualHours * project.capacityMw) && closeAmount(row.fullRevenue, revenue) &&
      closeAmount(row.spotRevenue, row.capturePrice * row.energyMwh) &&
      closeAmount(row.fullRevenuePrice, row.energyMwh > 0 ? row.fullRevenue / row.energyMwh : 0) &&
      closeAmount(row.fullRevenue, sensitivity.calculateAnnualRevenue(project, scenario.config, row));
  }

  function hourlyRowsAreComplete(project, result) {
    const rows = result.hourlyPreview, first = result.annualRows[0];
    if (!Array.isArray(rows) || rows.length !== 8760 || !first) return false;
    const adjustment = first.energyMwh > 0 ? (first.fullRevenue - first.spotRevenue) / first.energyMwh : 0;
    const totals = { energyMwh: 0, spotRevenue: 0, fullRevenue: 0, spotPrice: 0 };
    const valid = rows.every((row, index) => {
      if (!row || row.time !== calculator.hourIndexToTimestamp(first.year, index) ||
          ![row.equivalentHours, row.energyMwh, row.spotPrice, row.spotRevenue, row.fullRevenue].every(Number.isFinite) ||
          row.energyMwh < 0 || !closeAmount(row.energyMwh, row.equivalentHours * project.capacityMw) ||
          !closeAmount(row.spotRevenue, row.energyMwh * row.spotPrice) ||
          !closeAmount(row.fullRevenue, row.spotRevenue + row.energyMwh * adjustment)) return false;
      Object.keys(totals).forEach((key) => { totals[key] += row[key]; });
      return true;
    });
    return valid && closeAmount(totals.energyMwh, first.energyMwh) && closeAmount(totals.spotRevenue, first.spotRevenue) &&
      closeAmount(totals.fullRevenue, first.fullRevenue) && closeAmount(totals.spotPrice / 8760, first.spotAvgPrice);
  }

  function isResultComplete(project, scenario, result, options = {}) {
    const rows = result?.annualRows;
    if (!project || !scenario?.config || !Array.isArray(rows) || rows.length !== project.forecastYears || !rows.length || result.missingYears?.length ||
        !rows.every((row, index) => annualRowIsComplete(project, scenario, row, index)) ||
        ![result.totalFullRevenue, result.totalEnergy, result.avgFullRevenuePrice].every(Number.isFinite)) return false;
    const totalEnergy = rows.reduce((sum, row) => sum + row.energyMwh, 0);
    const totalRevenue = rows.reduce((sum, row) => sum + row.fullRevenue, 0);
    return closeAmount(result.totalEnergy, totalEnergy) && closeAmount(result.totalFullRevenue, totalRevenue) &&
      closeAmount(result.avgFullRevenuePrice, totalEnergy > 0 ? totalRevenue / totalEnergy : 0) &&
      (!options.includeHourly || hourlyRowsAreComplete(project, result));
  }

  function buildAvailableScenarioResults(project = {}) {
    const validity = getResultValidity();
    const current = (Array.isArray(project.scenarios) ? project.scenarios : []).map((scenario) => ({ scenario, result: project.resultsByScenario?.[scenario.id] }))
      .filter(({ scenario, result }) => isResultComplete(project, scenario, result) && validity?.baselineResultState(project, scenario, result).current);
    const baseline = current.find((item) => item.scenario.isBaseline);
    if (!baseline) return [];
    return current.filter((item) => item.result.annualRows.every((row, index) => {
      const base = baseline.result.annualRows[index];
      return Math.abs(row.energyMwh - base.energyMwh) <= Math.max(0.000001, Math.abs(base.energyMwh) * 1e-8);
    }));
  }

  function getBaselineCompareItem(available = []) {
    return available.find((item) => item.scenario?.isBaseline) || null;
  }

  function getFirstAnnualRow(item) {
    const rows = item?.result?.annualRows || [];
    return rows[0] || null;
  }

  function resolveSensitivitySelection(allFactors = [], selectedKeys = [], activeFactorKey = "") {
    const allFactorKeys = allFactors.map((factor) => factor.key);
    let nextSelectedKeys = Array.isArray(selectedKeys) && selectedKeys.length
      ? selectedKeys.filter((key) => allFactorKeys.includes(key))
      : allFactorKeys;
    if (!nextSelectedKeys.length) {
      nextSelectedKeys = allFactorKeys;
    }
    const selectedFactorSet = new Set(nextSelectedKeys);
    const factors = allFactors.filter((factor) => selectedFactorSet.has(factor.key));
    const nextActiveFactorKey = activeFactorKey && factors.some((factor) => factor.key === activeFactorKey)
      ? activeFactorKey
      : factors[0]?.key || "";
    return {
      selectedKeys: nextSelectedKeys,
      activeFactorKey: nextActiveFactorKey,
      factors
    };
  }

  function summarizeScenarioComparison(available = [], baseline = null) {
    if (available.length < 2 || !baseline) return { bestScenario: null, maxGapWan: 0 };
    const bestScenario = available.reduce((best, current) => {
      if (!best) return current;
      return current.result.totalFullRevenue > best.result.totalFullRevenue ? current : best;
    }, null);
    const maxGapWan = available.reduce((maxValue, item) => {
      const gap = Math.abs(item.result.totalFullRevenue - baseline.result.totalFullRevenue) / 10000;
      return Math.max(maxValue, gap);
    }, 0);
    return { bestScenario, maxGapWan };
  }

  function resolveActiveCompareScenarioId(available = [], baseline = null, activeScenarioId = "") {
    if (activeScenarioId && available.some((item) => item.scenario.id === activeScenarioId)) {
      return activeScenarioId;
    }
    const bestNonBaseline = available
      .filter((item) => item.scenario.id !== baseline?.scenario?.id)
      .sort((a, b) => b.result.totalFullRevenue - a.result.totalFullRevenue)[0];
    return bestNonBaseline?.scenario?.id || baseline?.scenario?.id || "";
  }

  function buildCompareRenderState(input = {}) {
    const {
      project = null,
      available = [],
      activeCompareScenarioId = "",
      activeSensitivityFactorKey = "",
      sensitivitySettings = {}
    } = input;
    const baseline = getBaselineCompareItem(available);
    const baselineFirst = getFirstAnnualRow(baseline);
    const baselineRevenueWan = baselineFirst ? baselineFirst.fullRevenue / 10000 : 0;
    const allSensitivityFactors = buildCompareSensitivityFactors(
      project,
      baseline,
      sensitivitySettings
    );
    const sensitivitySelection = resolveSensitivitySelection(
      allSensitivityFactors,
      sensitivitySettings.selectedKeys,
      activeSensitivityFactorKey
    );
    const sensitivityFactors = sensitivitySelection.factors;
    const { bestScenario, maxGapWan } = baseline
      ? summarizeScenarioComparison(available, baseline)
      : { bestScenario: null, maxGapWan: 0 };
    const resolvedActiveCompareScenarioId = resolveActiveCompareScenarioId(
      available,
      baseline,
      activeCompareScenarioId
    );
    const focusScenario = available.find((item) => item.scenario.id === resolvedActiveCompareScenarioId) || baseline;
    return {
      baseline,
      baselineFirst,
      baselineRevenueWan,
      allSensitivityFactors,
      sensitivityNotice: sensitivity?.availability(project, baseline).message || (allSensitivityFactors.length ? "" : "首年暂无有响应的适用变量。"),
      sensitivitySelection,
      sensitivityFactors,
      bestScenario,
      maxGapWan,
      activeCompareScenarioId: resolvedActiveCompareScenarioId,
      focusScenario
    };
  }

  function buildCompareFrameState(input = {}) {
    const {
      project = null,
      comparePeriod = "-",
      activeCompareScenarioId = "",
      activeSensitivityFactorKey = "",
      sensitivitySettings = {}
    } = input;
    const available = project ? buildAvailableScenarioResults(project) : [];
    const compareState = available.length
      ? buildCompareRenderState({
        project,
        available,
        activeCompareScenarioId,
        activeSensitivityFactorKey,
        sensitivitySettings
      })
      : {};
    if (project) compareState.excludedCount = Math.max(0,
      (Array.isArray(project.scenarios) ? project.scenarios : []).filter((scenario) => project.resultsByScenario?.[scenario.id]).length - available.length);
    return {
      available,
      comparePeriod: project ? comparePeriod : "-",
      compareState,
      hasResults: available.length > 0,
      activeCompareScenarioId: compareState.activeCompareScenarioId || activeCompareScenarioId,
      sensitivitySelection: compareState.sensitivitySelection || {
        selectedKeys: sensitivitySettings.selectedKeys || [],
        activeFactorKey: activeSensitivityFactorKey,
        factors: []
      }
    };
  }

  function applyCompareFrameSelection(input = {}) {
    const {
      frameState = {},
      sensitivitySettings = {},
      activeCompareScenarioId = "",
      activeSensitivityFactorKey = ""
    } = input;
    if (!frameState.hasResults) {
      return { activeCompareScenarioId, activeSensitivityFactorKey };
    }
    if (Array.isArray(frameState.sensitivitySelection?.selectedKeys)) {
      sensitivitySettings.selectedKeys = frameState.sensitivitySelection.selectedKeys;
    }
    return {
      activeCompareScenarioId: frameState.activeCompareScenarioId || activeCompareScenarioId,
      activeSensitivityFactorKey: frameState.sensitivitySelection?.activeFactorKey || activeSensitivityFactorKey
    };
  }

  return Object.freeze({
    applyCompareFrameSelection,
    sanitizeCompareSensitivitySettings,
    sensitivityAxisLabels,
    buildCompareSensitivityFactors,
    buildCompareFrameState,
    buildCompareRenderState,
    buildAvailableScenarioResults,
    isResultComplete,
    resultComponentTotals,
    detectTopDriver,
    getBaselineCompareItem,
    getFirstAnnualRow,
    resolveActiveCompareScenarioId,
    resolveSensitivitySelection,
    summarizeScenarioComparison
  });
});
