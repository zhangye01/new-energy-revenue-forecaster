"use strict";

(function (root, factory) {
  const rules = typeof module !== "undefined" && module.exports
    ? require("./revenue-rules")
    : root.NE_REVENUE_RULES;
  const api = factory(rules);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_REVENUE_CALCULATOR = api;
  if (root.window && root.window !== root) {
    root.window.NE_REVENUE_CALCULATOR = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (rules) {
  if (!rules) {
    throw new Error("收入测算初始化失败：缺少 revenue-rules.js");
  }

  function dayOfYearToMonthDay(dayOfYear) {
    const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let day = dayOfYear;
    let month = 1;
    for (const monthLength of monthLengths) {
      if (day <= monthLength) break;
      day -= monthLength;
      month += 1;
    }
    return { month, day };
  }

  function hourIndexToTimestamp(year, hourIndex) {
    const dayOfYear = Math.floor(hourIndex / 24) + 1;
    const hour = hourIndex % 24;
    const monthDay = dayOfYearToMonthDay(dayOfYear);
    return `${year}-${String(monthDay.month).padStart(2, "0")}-${String(monthDay.day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:00`;
  }

  function defaultGetHourlyEnergyForCalculation(project, year) {
    return project?.energyData?.hourlyByYear?.[year] || [];
  }

  function emptyAnnualRow(year) {
    return {
      year,
      annualHours: 0,
      energyMwh: 0,
      spotAvgPrice: 0,
      capturePrice: 0,
      captureSpread: 0,
      spotRevenue: 0,
      mechanismRatio: 0,
      mechanismRevenue: 0,
      nonMechanismEnergy: 0,
      ltPnlPrice: 0,
      ltPnlRevenue: 0,
      envRevenue: 0,
      storageSupplementRevenue: 0,
      comprehensiveFee: 0,
      otherIncome: 0,
      fullRevenue: 0,
      fullRevenuePrice: 0,
      note: "缺失曲线"
    };
  }

  function calculateScenarioResult(project, scenario, run, options = {}) {
    const getHourlyEnergyForCalculation = typeof options.getHourlyEnergyForCalculation === "function"
      ? options.getHourlyEnergyForCalculation
      : defaultGetHourlyEnergyForCalculation;
    const formatHourTimestamp = typeof options.hourIndexToTimestamp === "function"
      ? options.hourIndexToTimestamp
      : hourIndexToTimestamp;
    const rows = [];
    const startYear = project.startYear;
    const endYear = project.startYear + project.forecastYears - 1;
    const missingYears = [];
    const missingEnergyYears = [];
    const missingPriceYears = [];
    const cfg = scenario.config;
    let hourlyPreview = [];
    let totalEnergy = 0;
    let totalFullRevenue = 0;

    for (let year = startYear; year <= endYear; year += 1) {
      const yearIndex = year - startYear + 1;
      const hourlyHours = getHourlyEnergyForCalculation(project, year, yearIndex);
      const prices = run.pricesByYear[year];
      const energyReady = Array.isArray(hourlyHours) && hourlyHours.length === 8760;
      const priceReady = Array.isArray(prices) && prices.length === 8760;
      if (!energyReady || !priceReady) {
        missingYears.push(year);
        if (!energyReady) missingEnergyYears.push(year);
        if (!priceReady) missingPriceYears.push(year);
        rows.push(emptyAnnualRow(year));
        continue;
      }

      const annualHours = hourlyHours.reduce((sum, value) => sum + value, 0);
      const energyMwh = annualHours * project.capacityMw;
      const spotAvgPrice = prices.reduce((sum, value) => sum + value, 0) / 8760;
      let spotRevenue = 0;
      for (let i = 0; i < 8760; i += 1) {
        const hourlyEnergy = hourlyHours[i] * project.capacityMw;
        spotRevenue += hourlyEnergy * prices[i];
      }
      const capturePrice = energyMwh > 0 ? spotRevenue / energyMwh : 0;
      const captureSpread = capturePrice - spotAvgPrice;

      const months = cfg.mechanismEnabled
        ? rules.mechanismActiveMonthsForYear(year, cfg.mechanismStartYm, cfg.mechanismEndYm)
        : 0;
      const mechanismRatio = cfg.mechanismEnabled ? cfg.mechanismRatio * (months / 12) : 0;
      const mechanismEnergy = energyMwh * mechanismRatio;
      const mechanismRevenue = mechanismEnergy * (cfg.mechanismPrice - capturePrice);
      const nonMechanismEnergy = Math.max(0, energyMwh - mechanismEnergy);

      const ltPnlPrice = rules.tradeStrategyPnlPriceForYear(cfg, yearIndex, year);
      const ltPnlRevenue = nonMechanismEnergy * ltPnlPrice;

      const envAllocation = rules.getEnvValueAllocation(project, cfg, year);
      const greenCertRevenue = nonMechanismEnergy * envAllocation.greenCertRatio * envAllocation.greenCertPrice;
      const greenPremiumRevenue = nonMechanismEnergy * envAllocation.greenPremiumRatio * envAllocation.greenPremiumPrice;
      const carbonRevenue = nonMechanismEnergy * envAllocation.carbonRatio * envAllocation.carbonPrice;
      const envRevenue = greenCertRevenue + greenPremiumRevenue + carbonRevenue;
      const storageSupplementPerMwh = project.hasStorage
        ? Number(cfg.storageArbitragePrice || 0)
          + Number(cfg.storageCapacityCompPrice || 0)
          + Number(cfg.storageAncillaryRevenuePrice || 0)
          + Number(cfg.storageOtherRevenuePrice || 0)
        : 0;
      const storageSupplementRevenue = energyMwh * storageSupplementPerMwh;

      const feeConfig = rules.getFeeConfigForYear(project, cfg, year);
      const comprehensiveFeePerMwh = feeConfig.marketOpFee + feeConfig.gridAssessFee + feeConfig.ancillaryFee + feeConfig.otherFee;
      const comprehensiveFee = energyMwh * comprehensiveFeePerMwh;
      const otherIncome = energyMwh * feeConfig.otherIncome;

      const fullRevenue = spotRevenue + mechanismRevenue + ltPnlRevenue + envRevenue + storageSupplementRevenue - comprehensiveFee + otherIncome;
      const fullRevenuePrice = energyMwh > 0 ? fullRevenue / energyMwh : 0;

      totalEnergy += energyMwh;
      totalFullRevenue += fullRevenue;

      rows.push({
        year,
        annualHours,
        energyMwh,
        spotAvgPrice,
        capturePrice,
        captureSpread,
        spotRevenue,
        mechanismRatio,
        mechanismRevenue,
        nonMechanismEnergy,
        ltPnlPrice,
        ltPnlRevenue,
        envRevenue,
        storageSupplementRevenue,
        comprehensiveFee,
        otherIncome,
        fullRevenue,
        fullRevenuePrice,
        note: ""
      });

      if (year === startYear) {
        const marketTradeRatio = 1 - mechanismRatio;
        const envValuePerMwh = envAllocation.unitValuePerMarketMwh;
        const adjustmentPerMwh =
          mechanismRatio * (cfg.mechanismPrice - capturePrice)
          + (1 - mechanismRatio) * ltPnlPrice
          + marketTradeRatio * envValuePerMwh
          + storageSupplementPerMwh
          - comprehensiveFeePerMwh
          + feeConfig.otherIncome;
        hourlyPreview = [];
        for (let i = 0; i < 8760; i += 1) {
          const hourEnergy = hourlyHours[i] * project.capacityMw;
          const price = prices[i];
          const spot = hourEnergy * price;
          const full = hourEnergy * (price + adjustmentPerMwh);
          hourlyPreview.push({
            time: formatHourTimestamp(year, i),
            equivalentHours: hourlyHours[i],
            energyMwh: hourEnergy,
            spotPrice: price,
            spotRevenue: spot,
            fullRevenue: full
          });
        }
      }
    }

    const first = rows.find((row) => row.energyMwh > 0) || rows[0];
    const split = [
      { label: "现货市场收入", amount: first.spotRevenue, tone: "green" },
      { label: "差价机制结算", amount: first.mechanismRevenue, tone: first.mechanismRevenue >= 0 ? "green" : "red" },
      { label: "交易策略损益", amount: first.ltPnlRevenue, tone: first.ltPnlRevenue >= 0 ? "green" : "red" },
      { label: "环境价值兑现", amount: first.envRevenue, tone: "orange" },
      { label: "配储补充收益", amount: first.storageSupplementRevenue, tone: "green" },
      { label: "综合费用", amount: -first.comprehensiveFee, tone: "red" },
      { label: "其他收入项", amount: first.otherIncome, tone: "green" }
    ];

    return {
      annualRows: rows,
      hourlyPreview,
      firstYearSplit: split,
      totalEnergy,
      totalFullRevenue,
      avgFullRevenuePrice: totalEnergy > 0 ? totalFullRevenue / totalEnergy : 0,
      missingYears,
      missingEnergyYears,
      missingPriceYears
    };
  }

  return Object.freeze({
    calculateScenarioResult,
    hourIndexToTimestamp
  });
});
