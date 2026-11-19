"use strict";

(function (root, factory) {
  const isCommonJs = typeof module !== "undefined" && module.exports;
  const api = factory(
    isCommonJs ? require("./compare-sensitivity") : root.NE_COMPARE_SENSITIVITY,
    () => isCommonJs ? require("./rough-price") : root.NE_ROUGH_PRICE,
    isCommonJs ? require("./result-calculation") : root.NE_RESULT_CALCULATION,
    isCommonJs ? require("./revenue-rules") : root.NE_REVENUE_RULES,
    isCommonJs ? require("./result-versions") : root.NE_RESULT_VERSIONS
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_COMPARE_ANALYSIS = api;
  if (root.window && root.window !== root) {
    root.window.NE_COMPARE_ANALYSIS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (sensitivity, getResultValidity, calculation, rules, versions) {
  const { annualStorageIsComplete, closeAmount, hourlyRowsAreComplete } = calculation;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sanitizeCompareSensitivitySettings(settings = {}) {
    return {
      rangePercent: clamp(Math.round(Number(settings.rangePercent) || 20), 5, 60),
      stepPercent: clamp(Math.round(Number(settings.stepPercent) || 5), 1, 20)
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
    return sensitivity.buildFactors(project, baseline, ratios);
  }

  function resultComponentTotals(result, verifiedConfig) {
    const rows = result?.annualRows || [];
    const config = versions.getResultFeeConfig(result, verifiedConfig);
    const sum = (key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
    const feeRows = rows.map((row) => rules.getOtherNetBreakdown(config, row.year, row.comprehensiveFee, row.otherIncome, row.energyMwh));
    const hasFeeBreakdown = feeRows.every((row) => row.primaryFees !== null && row.otherNetIncome !== null);
    return {
      spotRevenue: sum("spotRevenue"),
      mechanismRevenue: sum("mechanismRevenue"),
      ltPnlRevenue: sum("ltPnlRevenue"),
      envRevenue: sum("envRevenue"),
      storageSupplementRevenue: sum("storageSupplementRevenue"),
      primaryFees: hasFeeBreakdown ? -feeRows.reduce((total, row) => total + row.primaryFees, 0) : null,
      otherNetIncome: hasFeeBreakdown ? feeRows.reduce((total, row) => total + row.otherNetIncome, 0) : null,
      feesAndOtherNetIncome: sum("otherIncome") - sum("comprehensiveFee")
    };
  }

  function detectTopDriver(result, baselineResult, config, baselineConfig) {
    if (!result?.annualRows?.length || !baselineResult?.annualRows?.length) return "-";
    const totals = resultComponentTotals(result, config), baseline = resultComponentTotals(baselineResult, baselineConfig);
    const feeNames = totals.primaryFees !== null && baseline.primaryFees !== null
      ? { primaryFees: "三项费用", otherNetIncome: "其他净收入" }
      : { feesAndOtherNetIncome: "费用与其他净收入合计" };
    const names = { spotRevenue: "现货收入", mechanismRevenue: "差价机制", ltPnlRevenue: "交易策略损益",
      envRevenue: "环境价值", storageSupplementRevenue: "配储补充收益", ...feeNames };
    const ranked = Object.keys(names).map((key) => ({ name: names[key], value: Math.abs(totals[key] - baseline[key]) }))
      .sort((a, b) => b.value - a.value);
    return ranked[0].value > 0.000001 ? ranked[0].name : "无差异";
  }

  function annualRowIsComplete(project, scenario, row, index, options) {
    const fields = ["annualHours", "energyMwh", "fullRevenue", "fullRevenuePrice", "capturePrice", "spotAvgPrice", "spotRevenue",
      "mechanismRevenue", "ltPnlRevenue", "envRevenue", "storageSupplementRevenue", "comprehensiveFee", "otherIncome"];
    if (!row || row.year !== project.startYear + index || row.energyMwh < 0 || !fields.every((key) => Number.isFinite(row[key]))) return false;
    const revenue = row.spotRevenue + row.mechanismRevenue + row.ltPnlRevenue + row.envRevenue + row.storageSupplementRevenue
      - row.comprehensiveFee + row.otherIncome;
    return annualStorageIsComplete(project, scenario.config, row) &&
      closeAmount(row.energyMwh, row.annualHours * project.capacityMw) && closeAmount(row.fullRevenue, revenue) &&
      closeAmount(row.spotRevenue, row.capturePrice * row.energyMwh) &&
      closeAmount(row.fullRevenuePrice, row.energyMwh > 0 ? row.fullRevenue / row.energyMwh : 0) &&
      closeAmount(row.fullRevenue, sensitivity.calculateAnnualRevenue(project, scenario.config, row, options));
  }

  function isResultComplete(project, scenario, result, options = {}) {
    const rows = result?.annualRows;
    const accounting = { legacyEnvironment: result?.environmentValueVersion === undefined };
    if (!project || !scenario?.config || !Array.isArray(rows) || rows.length !== project.forecastYears || !rows.length || result.missingYears?.length ||
        !rows.every((row, index) => annualRowIsComplete(project, scenario, row, index, accounting)) ||
        ![result.totalFullRevenue, result.totalEnergy, result.avgFullRevenuePrice].every(Number.isFinite)) return false;
    const totalEnergy = rows.reduce((sum, row) => sum + row.energyMwh, 0);
    const totalRevenue = rows.reduce((sum, row) => sum + row.fullRevenue, 0);
    return closeAmount(result.totalEnergy, totalEnergy) && closeAmount(result.totalFullRevenue, totalRevenue) &&
      closeAmount(result.avgFullRevenuePrice, totalEnergy > 0 ? totalRevenue / totalEnergy : 0) &&
      (!options.includeHourly || hourlyRowsAreComplete(project, scenario, result));
  }

  function buildAvailableScenarioResults(project = {}, getBaselineResultState) {
    const stateFor = getBaselineResultState || ((project, scenario, result) => {
      const state = getResultValidity()?.baselineResultState(project, scenario, result);
      return state?.current && isResultComplete(project, scenario, result) ? state : null;
    });
    const current = (Array.isArray(project.scenarios) ? project.scenarios : []).map((scenario) => ({ scenario, result: project.resultsByScenario?.[scenario.id] }))
      .filter(({ scenario, result }) => stateFor(project, scenario, result)?.current);
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
      sensitivitySettings = {},
      includeSensitivity = true
    } = input;
    const baseline = getBaselineCompareItem(available);
    const sensitivityBaseline = sensitivity.baselineValue(baseline);
    const sensitivityFactors = includeSensitivity ? buildCompareSensitivityFactors(project, baseline, sensitivitySettings) : [];
    const resolvedFactorKey = !includeSensitivity || sensitivityFactors.some(({ key }) => key === activeSensitivityFactorKey)
      ? activeSensitivityFactorKey : sensitivityFactors[0]?.key || "";
    const { bestScenario, maxGapWan } = baseline
      ? summarizeScenarioComparison(available, baseline)
      : { bestScenario: null, maxGapWan: 0 };
    const resolvedActiveCompareScenarioId = resolveActiveCompareScenarioId(
      available,
      baseline,
      activeCompareScenarioId
    );
    const focusScenario = available.find((item) => item.scenario.id === resolvedActiveCompareScenarioId) || baseline;
    const sensitivityNotice = !includeSensitivity || sensitivityFactors.length ? ""
      : sensitivity.availability(project, baseline).message || "暂时无法重算全周期综合度电均价。";
    return {
      baseline,
      sensitivityBaseline,
      sensitivityNotice,
      sensitivityDeferred: !includeSensitivity,
      activeSensitivityFactorKey: resolvedFactorKey,
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
      sensitivitySettings = {},
      includeSensitivity = true,
      getBaselineResultState
    } = input;
    const available = project ? buildAvailableScenarioResults(project, getBaselineResultState) : [];
    const compareState = available.length
      ? buildCompareRenderState({
        project,
        available,
        activeCompareScenarioId,
        activeSensitivityFactorKey,
        sensitivitySettings,
        includeSensitivity
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
      activeSensitivityFactorKey: compareState.activeSensitivityFactorKey ?? activeSensitivityFactorKey
    };
  }

  function applyCompareFrameSelection(input = {}) {
    const {
      frameState = {},
      activeCompareScenarioId = "",
      activeSensitivityFactorKey = ""
    } = input;
    if (!frameState.hasResults) {
      return { activeCompareScenarioId, activeSensitivityFactorKey };
    }
    return {
      activeCompareScenarioId: frameState.activeCompareScenarioId || activeCompareScenarioId,
      activeSensitivityFactorKey: frameState.activeSensitivityFactorKey ?? activeSensitivityFactorKey
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
    resolveActiveCompareScenarioId,
    summarizeScenarioComparison
  });
});
