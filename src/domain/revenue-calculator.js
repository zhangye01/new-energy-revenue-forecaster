"use strict";

(function (root, factory) {
  const commonJs = typeof module !== "undefined" && module.exports;
  const api = factory(
    commonJs ? require("./revenue-rules") : root.NE_REVENUE_RULES,
    commonJs ? require("./storage-dispatch") : root.NE_STORAGE_DISPATCH,
    commonJs ? require("./price-forecast") : root.NE_PRICE_FORECAST
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_REVENUE_CALCULATOR = api;
  if (root.window && root.window !== root) {
    root.window.NE_REVENUE_CALCULATOR = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (rules, dispatch, priceForecast) {
  if (!rules || !dispatch || !priceForecast) {
    throw new Error("收入测算初始化失败：缺少收入规则或配储调度模块");
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

  function annualSpotRevenue(prices, hourlyHours, capacityMw) {
    let revenue = 0;
    for (let hour = 0; hour < prices.length; hour += 1) {
      revenue += hourlyHours[hour] * capacityMw * prices[hour];
    }
    return revenue;
  }

  function dispatchAnnualStorage(project, prices, hourlyHours, efficiency, includeHourly = false) {
    return dispatch.calculateHourlyDispatch({
      prices, generationMwh: hourlyHours.map((hours) => hours * project.capacityMw),
      powerMw: project.storagePowerMw, durationH: project.storageDurationH,
      roundTripEfficiency: efficiency, includeHourly
    });
  }

  function calculateStorageSpotPreview(project, scenario, run, options = {}) {
    if (!project?.hasStorage || !priceForecast.validateForecastPriceData(project, run).ok) return null;
    const efficiency = dispatch.resolveStorageEfficiency(project, scenario?.config);
    const equipment = [project.capacityMw, project.storagePowerMw, project.storageDurationH];
    if (!equipment.every((value) => Number.isFinite(value) && value > 0) || !dispatch.isStorageEfficiency(efficiency)) return null;
    const getHours = options.getHourlyEnergyForCalculation ?? defaultGetHourlyEnergyForCalculation;
    const annualRows = [];
    let totalWithoutStorageSpotRevenue = 0;
    let totalIncrementalRevenue = 0;
    try {
      for (let index = 0; index < project.forecastYears; index += 1) {
        const year = project.startYear + index;
        const hours = getHours(project, year, index + 1);
        if (!Array.isArray(hours) || hours.length !== 8760) return null;
        const prices = run.pricesByYear[year];
        const { incrementalRevenue } = dispatchAnnualStorage(project, prices, hours, efficiency);
        const withoutStorageSpotRevenue = annualSpotRevenue(prices, hours, project.capacityMw);
        const withStorageSpotRevenue = withoutStorageSpotRevenue + incrementalRevenue;
        if (!Number.isFinite(withStorageSpotRevenue)) return null;
        annualRows.push({ year, withoutStorageSpotRevenue, withStorageSpotRevenue, incrementalRevenue });
        totalWithoutStorageSpotRevenue += withoutStorageSpotRevenue;
        totalIncrementalRevenue += incrementalRevenue;
      }
    } catch (_) {
      return null;
    }
    const totalWithStorageSpotRevenue = totalWithoutStorageSpotRevenue + totalIncrementalRevenue;
    if (!Number.isFinite(totalWithStorageSpotRevenue)) return null;
    return { annualRows, totalWithoutStorageSpotRevenue, totalWithStorageSpotRevenue, totalIncrementalRevenue, roundTripEfficiency: efficiency };
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
    const priceIntegrity = priceForecast.validateForecastPriceData(project, run);
    if (!priceIntegrity.ok && !priceIntegrity.invalidYears.length) {
      throw new RangeError(priceIntegrity.errors.join("；"));
    }
    const invalidPriceYears = new Set(priceIntegrity.invalidYears);
    const cfg = scenario.config;
    let hourlyPreview = [];
    let totalEnergy = 0;
    let totalFullRevenue = 0;

    for (let year = startYear; year <= endYear; year += 1) {
      const yearIndex = year - startYear + 1;
      const hourlyHours = getHourlyEnergyForCalculation(project, year, yearIndex);
      const prices = run?.pricesByYear?.[year];
      const energyReady = Array.isArray(hourlyHours) && hourlyHours.length === 8760;
      const priceReady = !invalidPriceYears.has(year) && Array.isArray(prices) && prices.length === 8760;
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
      const spotRevenue = annualSpotRevenue(prices, hourlyHours, project.capacityMw);
      const capturePrice = energyMwh > 0 ? spotRevenue / energyMwh : 0;
      const captureSpread = capturePrice - spotAvgPrice;

      const months = cfg.mechanismEnabled
        ? rules.mechanismActiveMonthsForYear(year, cfg.mechanismStartYm, cfg.mechanismEndYm)
        : 0;
      const mechanismRatio = cfg.mechanismEnabled ? cfg.mechanismRatio * (months / 12) : 0;
      const mechanismEnergy = energyMwh * mechanismRatio;
      const mechanismReferencePrice = rules.mechanismReferencePrice(cfg, capturePrice);
      const mechanismRevenue = mechanismEnergy * (cfg.mechanismPrice - mechanismReferencePrice);
      const nonMechanismEnergy = Math.max(0, energyMwh - mechanismEnergy);

      const ltPnlPrice = rules.tradeStrategyPnlPriceForYear(cfg, yearIndex, year);
      const ltPnlRevenue = nonMechanismEnergy * ltPnlPrice;

      const envAllocation = rules.getEnvValueAllocation(project, cfg, year);
      const greenCertRevenue = nonMechanismEnergy * envAllocation.greenCertRatio * envAllocation.greenCertPrice;
      const greenPremiumRevenue = nonMechanismEnergy * envAllocation.greenPremiumRatio * envAllocation.greenPremiumPrice;
      const envRevenue = greenCertRevenue + greenPremiumRevenue;
      const efficiency = dispatch.resolveStorageEfficiency(project, cfg);
      const dispatchResult = project.hasStorage ? dispatchAnnualStorage(project, prices, hourlyHours, efficiency, year === startYear) : null;
      const storageSupplementRevenue = dispatchResult?.incrementalRevenue ?? 0;

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
        ...(dispatchResult ? { storageDispatch: {
          version: dispatch.ALGORITHM_VERSION, revenueMode: dispatch.SPOT_REVENUE_MODE,
          powerMw: project.storagePowerMw, durationH: project.storageDurationH,
          capacityMwh: project.storagePowerMw * project.storageDurationH, roundTripEfficiency: efficiency,
          chargeMwh: dispatchResult.chargeMwh, dischargeMwh: dispatchResult.dischargeMwh,
          chargeOpportunityCost: dispatchResult.chargeOpportunityCost, dischargeRevenue: dispatchResult.dischargeRevenue,
          incrementalRevenue: dispatchResult.incrementalRevenue, independentSupplementRevenue: 0,
          withoutStorageSpotRevenue: spotRevenue, withStorageSpotRevenue: spotRevenue + dispatchResult.incrementalRevenue,
          withoutStorageFullRevenue: fullRevenue - storageSupplementRevenue, withStorageFullRevenue: fullRevenue
        } } : {}),
        note: ""
      });

      if (year === startYear) {
        const marketTradeRatio = 1 - mechanismRatio;
        const envValuePerMwh = envAllocation.unitValuePerMarketMwh;
        const adjustmentPerMwh =
          mechanismRatio * (cfg.mechanismPrice - mechanismReferencePrice)
          + (1 - mechanismRatio) * ltPnlPrice
          + marketTradeRatio * envValuePerMwh
          - comprehensiveFeePerMwh
          + feeConfig.otherIncome;
        hourlyPreview = [];
        for (let i = 0; i < 8760; i += 1) {
          const hourEnergy = hourlyHours[i] * project.capacityMw;
          const price = prices[i];
          const spot = hourEnergy * price;
          const scheduled = dispatchResult?.hourly?.[i];
          const full = hourEnergy * (price + adjustmentPerMwh) + (scheduled?.incrementalRevenue ?? 0);
          hourlyPreview.push({
            time: formatHourTimestamp(year, i),
            equivalentHours: hourlyHours[i],
            energyMwh: hourEnergy,
            spotPrice: price,
            spotRevenue: spot,
            fullRevenue: full,
            ...(scheduled ? { storageDispatch: {
              ...scheduled,
              netExportMwh: hourEnergy - scheduled.chargeMwh + scheduled.dischargeMwh,
              withStorageSpotRevenue: spot + scheduled.incrementalRevenue
            } } : {})
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
      { label: "配储现货增量", amount: first.storageSupplementRevenue, tone: "green" },
      { label: "综合费用", amount: -first.comprehensiveFee, tone: "red" },
      { label: "其他收入项", amount: first.otherIncome, tone: "green" }
    ];

    return {
      environmentValueVersion: rules.ENVIRONMENT_VALUE_VERSION,
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
    calculateStorageSpotPreview,
    hourIndexToTimestamp,
    isStorageEfficiency: dispatch.isStorageEfficiency,
    resolveStorageEfficiency: dispatch.resolveStorageEfficiency,
    STORAGE_SPOT_REVENUE_MODE: dispatch.SPOT_REVENUE_MODE
  });
});
