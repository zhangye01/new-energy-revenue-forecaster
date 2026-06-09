"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_COMPARE_ANALYSIS = api;
  if (root.window && root.window !== root) {
    root.window.NE_COMPARE_ANALYSIS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sanitizeCompareSensitivitySettings(settings = {}) {
    const topN = settings.topN === "all" ? "all" : Math.round(Number(settings.topN) || 8);
    return {
      rangePercent: clamp(Math.round(Number(settings.rangePercent) || 20), 5, 60),
      stepPercent: clamp(Math.round(Number(settings.stepPercent) || 5), 1, 20),
      responseScalePercent: clamp(Math.round(Number(settings.responseScalePercent) || 100), 25, 200),
      topN: topN === "all" ? "all" : clamp(topN, 3, 20),
      selectedKeys: Array.isArray(settings.selectedKeys)
        ? settings.selectedKeys.filter(Boolean)
        : []
    };
  }

  function sensitivityAxisLabels(settings = {}) {
    const safe = sanitizeCompareSensitivitySettings(settings);
    const range = Math.max(1, Number(settings.rangePercent || safe.rangePercent));
    const step = Math.max(1, Number(settings.stepPercent || safe.stepPercent));
    const values = new Set([0, -range, range]);
    for (let value = 0; value <= range; value += step) {
      values.add(value);
      values.add(-value);
    }
    return Array.from(values)
      .sort((a, b) => a - b)
      .map((value) => `${value > 0 ? "+" : ""}${value}%`);
  }

  function buildSensitivitySeries(baseRevenueWan, impactWan, options = {}, settings = {}) {
    const safe = sanitizeCompareSensitivitySettings(settings);
    const invert = Boolean(options.invert);
    const factor = Number.isFinite(options.factor) ? options.factor : 1;
    const responseScale = (Number(safe.responseScalePercent) || 100) / 100;
    return sensitivityAxisLabels(safe).map((label) => {
      const ratio = Number(label.replace("%", "").replace("+", "")) / 100;
      const signedRatio = invert ? -ratio : ratio;
      const value = Math.max(0, baseRevenueWan + impactWan * factor * responseScale * signedRatio);
      return Number(value.toFixed(1));
    });
  }

  function buildCompareSensitivityFactors(baselineFirst, baselineRevenueWan, settings = {}) {
    if (!baselineFirst) return [];
    const safeSettings = sanitizeCompareSensitivitySettings(settings);
    const safeBase = Math.max(1, Math.abs(baselineRevenueWan));
    const mechanismEnergyRatio = Number(baselineFirst.mechanismRatio || 0);
    const factorDefs = [
      {
        key: "spot",
        name: "现货价格水平",
        note: "影响现货收入和捕获价格",
        impactWan: Math.max(Math.abs(baselineFirst.spotRevenue / 10000) * 0.2, safeBase * 0.16),
        colorIndex: 0
      },
      {
        key: "hours",
        name: "年利用小时 / 上网电量",
        note: "影响所有按电量结算的收入和费用",
        impactWan: Math.max(safeBase * 0.72, Math.abs((baselineFirst.spotRevenue + baselineFirst.envRevenue - baselineFirst.comprehensiveFee) / 10000) * 0.18),
        colorIndex: 1
      },
      {
        key: "capture_spread",
        name: "捕获价差",
        note: "影响捕获电价相对现货均价表现",
        impactWan: Math.max(Math.abs((baselineFirst.captureSpread * baselineFirst.energyMwh) / 10000) * 0.35, safeBase * 0.08),
        colorIndex: 2
      },
      {
        key: "mechanism_price",
        name: "机制电价",
        note: "影响纳入机制电量的差价结算",
        impactWan: Math.max(Math.abs(baselineFirst.mechanismRevenue / 10000) * 0.45, safeBase * mechanismEnergyRatio * 0.08),
        colorIndex: 3
      },
      {
        key: "mechanism_ratio",
        name: "机制电量占比",
        note: "改变机制结算与市场化交易电量空间",
        impactWan: Math.max(Math.abs(baselineFirst.mechanismRevenue / 10000) * 0.55, safeBase * mechanismEnergyRatio * 0.1),
        colorIndex: 4
      },
      {
        key: "trade_strategy",
        name: "交易策略损益",
        note: "作用于市场化交易电量部分",
        impactWan: Math.max(Math.abs(baselineFirst.ltPnlRevenue / 10000) * 0.65, safeBase * 0.05),
        colorIndex: 0
      },
      {
        key: "env_value",
        name: "环境价值单价",
        note: "影响绿证、绿电溢价和碳收益度电收益",
        impactWan: Math.max(Math.abs(baselineFirst.envRevenue / 10000) * 0.8, safeBase * 0.06),
        colorIndex: 2
      },
      {
        key: "env_ratio",
        name: "环境价值兑现比例",
        note: "影响市场化交易电量的兑现空间",
        impactWan: Math.max(Math.abs(baselineFirst.envRevenue / 10000) * 0.55, safeBase * 0.04),
        colorIndex: 1
      },
      {
        key: "fee",
        name: "综合费用",
        note: "费用上升将压低全口径收益",
        impactWan: Math.max(Math.abs(baselineFirst.comprehensiveFee / 10000) * 0.8, safeBase * 0.05),
        invert: true,
        colorIndex: 3
      },
      {
        key: "storage",
        name: "配储补充收益",
        note: "影响含储能项目的补充收益项",
        impactWan: Math.max(Math.abs(baselineFirst.storageSupplementRevenue / 10000) * 0.8, safeBase * 0.03),
        colorIndex: 4
      }
    ];
    return factorDefs
      .map((factor) => {
        const series = buildSensitivitySeries(baselineRevenueWan, factor.impactWan, { invert: factor.invert, factor: 1 }, safeSettings);
        const lowDelta = Number((series[0] - baselineRevenueWan).toFixed(2));
        const highDelta = Number((series[series.length - 1] - baselineRevenueWan).toFixed(2));
        return {
          ...factor,
          series,
          lowDelta,
          highDelta,
          sensitivity: Math.max(Math.abs(lowDelta), Math.abs(highDelta))
        };
      })
      .sort((a, b) => b.sensitivity - a.sensitivity);
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

  function detectTopDriver(result) {
    if (!result?.annualRows?.length) return "-";
    const first = result.annualRows[0];
    const map = [
      { name: "现货收入", value: Math.abs(first.spotRevenue) },
      { name: "差价机制", value: Math.abs(first.mechanismRevenue) },
      { name: "交易策略损益", value: Math.abs(first.ltPnlRevenue) },
      { name: "环境价值", value: Math.abs(first.envRevenue) },
      { name: "配储补充收益", value: Math.abs(first.storageSupplementRevenue) },
      { name: "综合费用", value: Math.abs(first.comprehensiveFee) }
    ];
    map.sort((a, b) => b.value - a.value);
    return map[0].name;
  }

  return Object.freeze({
    sanitizeCompareSensitivitySettings,
    sensitivityAxisLabels,
    buildSensitivitySeries,
    buildCompareSensitivityFactors,
    resultComponentTotals,
    detectTopDriver
  });
});
