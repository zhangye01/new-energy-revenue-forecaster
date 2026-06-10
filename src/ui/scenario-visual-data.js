"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_SCENARIO_VISUAL_DATA = api;
  if (root.window && root.window !== root) {
    root.window.NE_SCENARIO_VISUAL_DATA = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function defaultClamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getScenarioVisualYears(project, clamp = defaultClamp) {
    if (!Number.isInteger(project?.startYear) || !Number.isInteger(project?.forecastYears) || project.forecastYears < 1) {
      return [];
    }
    const count = clamp(Number(project.forecastYears), 1, 30);
    return Array.from({ length: count }, (_, index) => project.startYear + index);
  }

  function getScenarioVisualEnergyMwh(project, year, energyData, resultRow = null) {
    const resultEnergy = Number(resultRow?.energyMwh);
    if (Number.isFinite(resultEnergy) && resultEnergy > 0) return resultEnergy;
    const summaryEnergy = Number(energyData?.annualSummary?.[year]?.energyMwh);
    if (Number.isFinite(summaryEnergy) && summaryEnergy > 0) return summaryEnergy;
    const summaryAnnualHours = Number(energyData?.annualSummary?.[year]?.annualHours);
    if (Number.isFinite(summaryAnnualHours) && summaryAnnualHours > 0 && Number.isFinite(project?.capacityMw)) {
      return summaryAnnualHours * project.capacityMw;
    }
    const annualInputHours = Number(energyData?.annualInputByYear?.[year]);
    if (Number.isFinite(annualInputHours) && annualInputHours > 0 && Number.isFinite(project?.capacityMw)) {
      return annualInputHours * project.capacityMw;
    }
    const hourlyHours = energyData?.hourlyByYear?.[year];
    if (!Array.isArray(hourlyHours) || hourlyHours.length !== 8760 || !Number.isFinite(project?.capacityMw)) return 0;
    return hourlyHours.reduce((sum, value) => sum + (Number(value) || 0), 0) * project.capacityMw;
  }

  function buildScenarioVisualRows(input = {}) {
    const {
      project,
      scenario,
      energyData,
      clamp = defaultClamp,
      mechanismActiveMonthsForYear = () => 0,
      tradeStrategyPnlPriceForYear = () => 0,
      getEnvValueAllocation = () => ({ totalRatio: 0, greenCertRatio: 0, greenPremiumRatio: 0, carbonRatio: 0, unitValuePerMarketMwh: 0 }),
      getFeeConfigForYear = () => ({ marketOpFee: 0, gridAssessFee: 0, ancillaryFee: 0, otherFee: 0, otherIncome: 0 })
    } = input;
    const cfg = scenario?.config || {};
    const years = getScenarioVisualYears(project, clamp);
    const resultRowsByYear = new Map(
      (project?.resultsByScenario?.[scenario?.id]?.annualRows || [])
        .map((row) => [Number(row.year), row])
        .filter(([year]) => Number.isInteger(year))
    );
    const storageSupplementPerMwh = project?.hasStorage
      ? Number(cfg.storageArbitragePrice || 0)
        + Number(cfg.storageCapacityCompPrice || 0)
        + Number(cfg.storageAncillaryRevenuePrice || 0)
        + Number(cfg.storageOtherRevenuePrice || 0)
      : 0;

    return years.map((year, index) => {
      const resultRow = resultRowsByYear.get(year) || null;
      const energyMwh = getScenarioVisualEnergyMwh(project, year, energyData, resultRow);
      const activeMonths = cfg.mechanismEnabled
        ? mechanismActiveMonthsForYear(year, cfg.mechanismStartYm, cfg.mechanismEndYm)
        : 0;
      const calculatedMechanismRatio = cfg.mechanismEnabled
        ? clamp(Number(cfg.mechanismRatio || 0), 0, 1) * (activeMonths / 12)
        : 0;
      const resultMechanismRatio = Number(resultRow?.mechanismRatio);
      const mechanismRatio = Number.isFinite(resultMechanismRatio)
        ? clamp(resultMechanismRatio, 0, 1)
        : calculatedMechanismRatio;
      const marketRatio = clamp(1 - mechanismRatio, 0, 1);
      const resultMarketEnergy = Number(resultRow?.nonMechanismEnergy);
      const marketEnergy = Number.isFinite(resultMarketEnergy) && resultMarketEnergy >= 0
        ? resultMarketEnergy
        : Math.max(0, energyMwh * marketRatio);
      const mechanismEnergy = Math.max(0, energyMwh - marketEnergy);
      const ltPnlPrice = tradeStrategyPnlPriceForYear(cfg, index + 1, year);
      const envAllocation = getEnvValueAllocation(project, cfg, year);
      const envTotalRatio = Math.min(1, Math.max(0, envAllocation.totalRatio));
      const greenCertEnergy = marketEnergy * envAllocation.greenCertRatio;
      const greenPremiumEnergy = marketEnergy * envAllocation.greenPremiumRatio;
      const carbonEnergy = marketEnergy * envAllocation.carbonRatio;
      const unredeemedMarketEnergy = Math.max(0, marketEnergy * (1 - envTotalRatio));
      const feeConfig = getFeeConfigForYear(project, cfg, year);
      const feeTotal = feeConfig.marketOpFee + feeConfig.gridAssessFee + feeConfig.ancillaryFee + feeConfig.otherFee;
      const envUnitValue = envAllocation.unitValuePerMarketMwh;
      const tradeImpact = marketRatio * ltPnlPrice;
      const envImpact = marketRatio * envUnitValue;
      const storageImpact = storageSupplementPerMwh;
      const otherIncomeImpact = feeConfig.otherIncome;
      const feeImpact = -feeTotal;

      return {
        year,
        yearLabel: String(year),
        energyMwh,
        activeMonths,
        mechanismActive: cfg.mechanismEnabled && activeMonths > 0,
        mechanismRatio,
        marketRatio,
        mechanismEnergy,
        marketEnergy,
        greenCertEnergy,
        greenPremiumEnergy,
        carbonEnergy,
        unredeemedMarketEnergy,
        mechanismPrice: cfg.mechanismEnabled ? Number(cfg.mechanismPrice || 0) : 0,
        ltPnlPrice,
        envAllocation,
        envUnitValue,
        feeConfig,
        feeTotal,
        storageSupplementPerMwh,
        tradeImpact,
        envImpact,
        storageImpact,
        otherIncomeImpact,
        feeImpact,
        netImpact: tradeImpact + envImpact + storageImpact + otherIncomeImpact + feeImpact
      };
    });
  }

  return Object.freeze({
    buildScenarioVisualRows,
    getScenarioVisualEnergyMwh,
    getScenarioVisualYears
  });
});
