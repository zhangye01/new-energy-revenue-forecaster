"use strict";

(function (root, factory) {
  const rules = root.NE_REVENUE_RULES || (typeof require !== "undefined" ? require("./revenue-rules") : null);
  const api = factory(rules);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_RESULT_REPORT = api;
  if (root.window && root.window !== root) {
    root.window.NE_RESULT_REPORT = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (rules) {
  if (!rules) {
    throw new Error("结果简报初始化失败：缺少 revenue-rules.js");
  }

  const ANNUAL_COMPONENTS = Object.freeze([
    Object.freeze({ name: "现货收入", key: "spotRevenue", colorKey: "spot" }),
    Object.freeze({ name: "差价机制", key: "mechanismRevenue", colorKey: "mechanism" }),
    Object.freeze({ name: "交易策略", key: "ltPnlRevenue", colorKey: "trade" }),
    Object.freeze({ name: "环境价值", key: "envRevenue", colorKey: "env" }),
    Object.freeze({ name: "配储补充", key: "storageSupplementRevenue", colorKey: "storage" }),
    Object.freeze({ name: "其他收入", key: "otherIncome", colorKey: "other" }),
    Object.freeze({ name: "综合费用", key: "comprehensiveFee", colorKey: "fee", negative: true })
  ]);

  const CONTRIBUTION_COMPONENTS = Object.freeze([
    Object.freeze({ label: "现货市场收入", key: "spotRevenue", colorKey: "spot" }),
    Object.freeze({ label: "差价机制结算", key: "mechanismRevenue", colorKey: "mechanism" }),
    Object.freeze({ label: "交易策略损益", key: "ltPnlRevenue", colorKey: "trade" }),
    Object.freeze({ label: "环境价值兑现", key: "envRevenue", colorKey: "env" }),
    Object.freeze({ label: "配储补充收益", key: "storageSupplementRevenue", colorKey: "storage" }),
    Object.freeze({ label: "综合费用", key: "comprehensiveFee", colorKey: "fee", negative: true }),
    Object.freeze({ label: "其他收入", key: "otherIncome", colorKey: "other" })
  ]);

  function resultMoneyWan(value) {
    return Number(((Number(value) || 0) / 10000).toFixed(2));
  }

  function resultSeriesValue(value) {
    return Number((Number(value || 0)).toFixed(4));
  }

  function getResultContributionItems(result) {
    const rows = result?.annualRows || [];
    const sum = (key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
    return CONTRIBUTION_COMPONENTS.map((item) => ({
      label: item.label,
      amount: item.negative ? -sum(item.key) : sum(item.key),
      colorKey: item.colorKey
    }));
  }

  function hasMechanismLine(rows, cfg) {
    return rows.some((row) => (
      cfg?.mechanismEnabled
      && rules.mechanismActiveMonthsForYear(row.year, cfg.mechanismStartYm, cfg.mechanismEndYm) > 0
    ));
  }

  function buildPriceSeries(rows, cfg = {}) {
    const series = [
      { name: "现货均价", colorKey: "other", data: rows.map((row) => resultSeriesValue(row.spotAvgPrice)) },
      { name: "捕获电价", colorKey: "spot", data: rows.map((row) => resultSeriesValue(row.capturePrice)) },
      { name: "全口径度电净价", colorKey: "net", data: rows.map((row) => resultSeriesValue(row.fullRevenuePrice)) }
    ];
    if (hasMechanismLine(rows, cfg)) {
      series.push({
        name: "机制电价",
        colorKey: "mechanism",
        data: rows.map((row) => (
          rules.mechanismActiveMonthsForYear(row.year, cfg.mechanismStartYm, cfg.mechanismEndYm) > 0
            ? resultSeriesValue(cfg.mechanismPrice)
            : null
        ))
      });
    }
    return series;
  }

  function buildFirstYearBridgeItems(rows) {
    const first = rows[0] || null;
    if (!first) return [];
    const energyMwh = Math.max(1, Number(first.energyMwh || 0));
    return [
      { label: "捕获电价", value: first.capturePrice, colorKey: "spot" },
      { label: "差价机制", value: first.mechanismRevenue / energyMwh, colorKey: "mechanism" },
      { label: "交易策略", value: first.ltPnlRevenue / energyMwh, colorKey: "trade" },
      { label: "环境价值", value: first.envRevenue / energyMwh, colorKey: "env" },
      { label: "配储补充", value: first.storageSupplementRevenue / energyMwh, colorKey: "storage" },
      { label: "综合费用", value: -first.comprehensiveFee / energyMwh, colorKey: "fee" },
      { label: "其他收入", value: first.otherIncome / energyMwh, colorKey: "other" },
      { label: "度电净价", value: first.fullRevenuePrice, colorKey: "net" }
    ].map((item) => ({
      ...item,
      value: resultSeriesValue(item.value)
    }));
  }

  function buildResultChartData(result, cfg = {}) {
    const rows = Array.isArray(result?.annualRows) ? result.annualRows : [];
    return {
      rows,
      years: rows.map((row) => String(row.year)),
      annualComponents: ANNUAL_COMPONENTS.map((item) => ({
        ...item,
        data: rows.map((row) => resultMoneyWan(item.negative ? -row[item.key] : row[item.key]))
      })),
      annualNet: {
        name: "全口径收入",
        colorKey: "net",
        data: rows.map((row) => resultMoneyWan(row.fullRevenue))
      },
      priceSeries: buildPriceSeries(rows, cfg),
      firstYearBridgeItems: buildFirstYearBridgeItems(rows),
      contributionItems: getResultContributionItems(result).map((item) => ({
        ...item,
        valueWan: resultMoneyWan(item.amount)
      }))
    };
  }

  function buildResultSummaryData(result) {
    const rows = Array.isArray(result?.annualRows) ? result.annualRows : [];
    const first = rows.find((row) => Number(row.energyMwh) > 0) || rows[0] || null;
    if (!first) {
      return {
        rows,
        first: null,
        maxRevenueRow: null,
        minRevenueRow: null,
        unitLift: 0,
        liftText: "增加",
        contributionItems: [],
        leadingPositive: null,
        leadingNegative: null,
        firstMarketRatio: 0
      };
    }
    const maxRevenueRow = rows.reduce((best, row) => (Number(row.fullRevenue) > Number(best.fullRevenue) ? row : best), first);
    const minRevenueRow = rows.reduce((worst, row) => (Number(row.fullRevenue) < Number(worst.fullRevenue) ? row : worst), first);
    const unitLift = Number(first.fullRevenuePrice || 0) - Number(first.capturePrice || 0);
    const contributionItems = getResultContributionItems(result);
    const leadingPositive = contributionItems
      .filter((item) => item.amount > 0 && item.label !== "现货市场收入")
      .sort((a, b) => b.amount - a.amount)[0] || null;
    const leadingNegative = contributionItems
      .filter((item) => item.amount < 0)
      .sort((a, b) => a.amount - b.amount)[0] || null;
    const energyMwh = Number(first.energyMwh || 0);
    const nonMechanismEnergy = Number(first.nonMechanismEnergy || 0);

    return {
      rows,
      first,
      maxRevenueRow,
      minRevenueRow,
      unitLift,
      liftText: unitLift >= 0 ? "增加" : "减少",
      contributionItems,
      leadingPositive,
      leadingNegative,
      firstMarketRatio: energyMwh > 0 ? nonMechanismEnergy / energyMwh : 0
    };
  }

  return Object.freeze({
    resultMoneyWan,
    resultSeriesValue,
    getResultContributionItems,
    buildResultChartData,
    buildResultSummaryData
  });
});
