"use strict";

(function (root, factory) {
  const commonJs = typeof module !== "undefined" && module.exports;
  const api = factory(
    commonJs ? require("./revenue-rules") : root.NE_REVENUE_RULES,
    commonJs ? require("./storage-dispatch") : root.NE_STORAGE_DISPATCH
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_COMPARE_SENSITIVITY = api;
  if (root.window && root.window !== root) root.window.NE_COMPARE_SENSITIVITY = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (rules, dispatch) {
  if (!rules || !dispatch) throw new Error("敏感性分析初始化失败：缺少收入规则或配储调度模块");
  const cache = new Map();
  const STORAGE_KEYS = ["storageArbitragePrice", "storageCapacityCompPrice", "storageAncillaryRevenuePrice", "storageOtherRevenuePrice"];
  const DISPATCH_FACTORS = new Set(["spot", "hours", "capture_spread"]);
  const FEE_KEYS = ["marketOpFee", "gridAssessFee", "ancillaryFee", "otherFee"];
  const ENV_PRICE_KEYS = ["greenCertPrice", "greenPremiumPrice", "carbonPrice"];
  const ENV_RATIO_KEYS = ["greenCertRealizeRatio", "greenPremiumRealizeRatio", "carbonRealizeRatio"];
  const FACTORS = [
    ["spot", "现货价格水平", "同比调整首年全部现货小时价格，联动捕获价及机制补差", 0],
    ["hours", "年利用小时 / 上网电量", "保持首年发电形状，同比调整全部小时电量", 1],
    ["capture_spread", "捕获价差", "保持现货均价，按比例调整小时价格相对均价的偏离", 2],
    ["mechanism_price", "机制电价", "调整机制电价，按首年有效机制电量重算", 3],
    ["mechanism_ratio", "机制电量占比", "同比调整机制占比，上限为100%，联动市场化电量", 4],
    ["trade_strategy", "交易策略损益", "同比调整首年策略损益单价，保留正负方向", 0],
    ["env_value", "环境价值单价", "同比调整适用环境价值价格，兑现比例保持不变", 2],
    ["env_ratio", "环境价值兑现比例", "同比调整适用兑现比例，合计达到100%后停止增加", 1],
    ["fee", "综合费用", "同比调整首年四项扣费单价，其他收入保持不变", 3],
    ["storage", "配储补充收益", "同比调整配储各项度电收益，仅适用于配储项目", 4]
  ];

  function scaleFields(source, keys, factor) {
    keys.forEach((key) => { source[key] = (Number(source[key]) || 0) * factor; });
  }

  function yearlySource(config, mode, map, year) {
    return config[mode] === "manual" ? config[map]?.[year] || config : config;
  }

  function createPerturbation(project, scenario, first, key, ratio) {
    const config = JSON.parse(JSON.stringify(scenario.config));
    const row = { ...first };
    const factor = 1 + ratio;
    if (key === "spot") {
      row.spotAvgPrice *= factor;
      row.capturePrice *= factor;
    }
    if (key === "hours") { row.energyMwh *= factor; row.annualHours *= factor; }
    if (key === "capture_spread") row.capturePrice = row.spotAvgPrice + (row.capturePrice - row.spotAvgPrice) * factor;
    if (key === "mechanism_price") config.mechanismPrice *= factor;
    if (key === "mechanism_ratio") config.mechanismRatio = Math.min(1, config.mechanismRatio * factor);
    if (key === "trade_strategy") {
      if (config.ltPricingMode === "manual") {
        const value = rules.tradeStrategyPnlPriceForYear(config, first.year - project.startYear + 1, first.year);
        config.ltManualPricesByYear = { ...config.ltManualPricesByYear, [first.year]: value * factor };
      }
      else config.ltYear1Pnl *= factor;
    }
    if (key === "fee") scaleFields(yearlySource(config, "feeConfigMode", "feeManualValuesByYear", first.year), FEE_KEYS, factor);
    if (key === "storage") scaleFields(config, first.storageDispatch ? STORAGE_KEYS.slice(1) : STORAGE_KEYS, factor);
    if (key === "env_value" || key === "env_ratio") {
      const source = yearlySource(config, "envValueMode", "envManualValuesByYear", first.year);
      const count = project.siteType === "offshore" && source.carbonEnabled ? 3 : 2;
      const prices = ENV_PRICE_KEYS.slice(0, count), ratios = ENV_RATIO_KEYS.slice(0, count);
      const totalRatio = ratios.reduce((sum, name) => sum + (Number(source[name]) || 0), 0);
      scaleFields(source, key === "env_value" ? prices : ratios,
        key === "env_ratio" && totalRatio > 0 ? Math.min(factor, 1 / totalRatio) : factor);
    }
    return { config, row };
  }

  // Settlement terms mirror the annual result. For hourly input changes,
  // buildFactors recalculates dispatch separately against the perturbed series.
  function calculateAnnualRevenue(project, config, row) {
    const energy = row.energyMwh;
    const months = config.mechanismEnabled
      ? rules.mechanismActiveMonthsForYear(row.year, config.mechanismStartYm, config.mechanismEndYm) : 0;
    const mechanismRatio = config.mechanismEnabled ? config.mechanismRatio * months / 12 : 0;
    const marketEnergy = Math.max(0, energy * (1 - mechanismRatio));
    const mechanism = energy * mechanismRatio * (config.mechanismPrice - rules.mechanismReferencePrice(config, row.capturePrice));
    const strategy = rules.tradeStrategyPnlPriceForYear(config, row.year - project.startYear + 1, row.year);
    const environment = rules.getEnvValueAllocation(project, config, row.year).unitValuePerMarketMwh;
    const fees = rules.getFeeConfigForYear(project, config, row.year);
    const storageKeys = row.storageDispatch ? STORAGE_KEYS.slice(1) : STORAGE_KEYS;
    const storage = project.hasStorage ? storageKeys.reduce((sum, key) => sum + (Number(config[key]) || 0), 0) : 0;
    return energy * row.capturePrice + mechanism + marketEnergy * (strategy + environment) + (row.storageDispatch?.incrementalRevenue ?? 0)
      + energy * (storage - FEE_KEYS.reduce((sum, key) => sum + fees[key], 0) + fees.otherIncome);
  }

  function availability(project, baseline) {
    const first = baseline?.result?.annualRows?.[0];
    if (!project || !baseline?.scenario?.config || !first || !(first.energyMwh > 0) || !Number.isFinite(first.fullRevenue)) {
      return { ok: false, message: "首年没有有效上网电量，暂不展示敏感性。" };
    }
    const initial = calculateAnnualRevenue(project, baseline.scenario.config, first);
    if (!Number.isFinite(initial) || Math.abs(initial - first.fullRevenue) > Math.max(0.01, Math.abs(first.fullRevenue) * 1e-9)) {
      return { ok: false, message: "首年基准结果与当前参数不一致，请重新测算后查看敏感性。" };
    }
    return { ok: true, message: "" };
  }

  function perturbDispatch(row, hours, key, ratio) {
    const factor = 1 + ratio;
    const prices = hours.map(({ spotPrice }) => key === "spot" ? spotPrice * factor
      : key === "capture_spread" ? row.spotAvgPrice + (spotPrice - row.spotAvgPrice) * factor : spotPrice);
    const generationMwh = hours.map(({ energyMwh }) => key === "hours" ? energyMwh * factor : energyMwh);
    const { powerMw, durationH, roundTripEfficiency } = row.storageDispatch;
    const value = dispatch.calculateHourlyDispatch({ prices, generationMwh, powerMw, durationH, roundTripEfficiency });
    return { ...row.storageDispatch, incrementalRevenue: value.incrementalRevenue };
  }

  function buildFactors(project, baseline, ratios) {
    const first = baseline?.result?.annualRows?.[0];
    if (!availability(project, baseline).ok) return [];
    const { hourlyPreview, sourceContext } = baseline.result;
    const hoursReady = hourlyPreview?.length === 8760 && hourlyPreview.every((hour) =>
      Number.isFinite(hour?.spotPrice) && Number.isFinite(hour?.energyMwh) && hour.energyMwh >= 0);
    const cacheKey = JSON.stringify([project.id, project.siteType, project.hasStorage, project.startYear,
      baseline.scenario.config, first, sourceContext?.runId, hoursReady, ratios]);
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const base = first.fullRevenue / 10000;
    const factors = FACTORS.filter(([key]) => (key !== "storage" || project.hasStorage)
      && (!first.storageDispatch || !DISPATCH_FACTORS.has(key) || hoursReady)).map(([key, name, note, colorIndex]) => {
      const series = ratios.map((ratio) => {
        if (ratio === 0) return base;
        const changed = createPerturbation(project, baseline.scenario, first, key, ratio);
        if (first.storageDispatch && DISPATCH_FACTORS.has(key)) {
          changed.row.storageDispatch = perturbDispatch(changed.row, hourlyPreview, key, ratio);
        }
        return calculateAnnualRevenue(project, changed.config, changed.row) / 10000;
      });
      const lowDelta = series[0] - base, highDelta = series[series.length - 1] - base;
      const description = first.storageDispatch && key === "storage"
        ? "同比调整容量补偿、辅助服务与其他补充收益，逐时现货套利保持固定" : note;
      return { key, name, note: description, colorIndex, series, lowDelta, highDelta,
        sensitivity: Math.max(...series.map((value) => Math.abs(value - base))) };
    }).filter((factor) => factor.series.every(Number.isFinite) && factor.sensitivity > Math.max(1e-8, Math.abs(base) * 1e-12))
      .sort((a, b) => b.sensitivity - a.sensitivity);
    factors.forEach((factor) => { Object.freeze(factor.series); Object.freeze(factor); });
    Object.freeze(factors);
    if (cache.size >= 20) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, factors);
    return factors;
  }

  return Object.freeze({ buildFactors, createPerturbation, calculateAnnualRevenue, availability });
});
