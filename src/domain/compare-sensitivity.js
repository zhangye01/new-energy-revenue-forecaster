"use strict";

(function (root, factory) {
  const commonJs = typeof module !== "undefined" && module.exports;
  const api = factory(
    commonJs ? require("./revenue-rules") : root.NE_REVENUE_RULES,
    commonJs ? require("./storage-dispatch") : root.NE_STORAGE_DISPATCH,
    commonJs ? require("./result-calculation") : root.NE_RESULT_CALCULATION,
    commonJs ? require("./result-versions") : root.NE_RESULT_VERSIONS,
    () => commonJs ? require("./energy-data") : root.NE_ENERGY_DATA
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_COMPARE_SENSITIVITY = api;
  if (root.window && root.window !== root) root.window.NE_COMPARE_SENSITIVITY = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (rules, dispatch, calculation, versions, getEnergyData) {
  if (!rules || !dispatch || !calculation || !versions) throw new Error("敏感性分析初始化失败：缺少收益测算依赖");
  const { annualStorageIsComplete, closeAmount, hourlyRowsAreComplete } = calculation;
  const cache = new Map();
  const STORAGE_KEYS = ["storageArbitragePrice", "storageCapacityCompPrice", "storageAncillaryRevenuePrice", "storageOtherRevenuePrice"];
  const DISPATCH_FACTORS = new Set(["spot", "capture_spread"]);
  const FEE_KEYS = ["marketOpFee", "gridAssessFee", "ancillaryFee", "otherFee"];
  const FACTORS = [
    ["spot", "现货价格水平", "同比调整全周期逐时现货电价，联动捕获价、机制补差及配储套利", 0],
    ["mechanism_price", "机制电价", "同比调整机制电价，按各年实际生效月份和机制电量重算补差", 3],
    ["mechanism_ratio", "机制电量占比", "同比调整机制电量占比（0–100%），联动有效期内机制电量和市场化电量", 4],
    ["capture_spread", "捕获价差", "保持各年现货均价，按比例调整同年小时价格相对均价的偏离", 2]
  ];

  function baselineValue(baseline) {
    const result = baseline?.result;
    return Number.isFinite(result?.totalEnergy) && result.totalEnergy > 0 && Number.isFinite(result.avgFullRevenuePrice)
      ? result.avgFullRevenuePrice : null;
  }

  function createPerturbation(scenario, first, key, ratio) {
    const config = { ...scenario.config };
    const row = { ...first };
    const factor = 1 + ratio;
    if (key === "spot") {
      row.spotAvgPrice *= factor;
      row.capturePrice *= factor;
    }
    if (key === "capture_spread") row.capturePrice = row.spotAvgPrice + (row.capturePrice - row.spotAvgPrice) * factor;
    if (key === "mechanism_price") config.mechanismPrice *= factor;
    if (key === "mechanism_ratio") config.mechanismRatio = Math.max(0, Math.min(1, config.mechanismRatio * factor));
    return { config, row };
  }

  // Settlement terms mirror the annual result. For hourly input changes,
  // buildFactors recalculates dispatch separately against the perturbed series.
  function calculateAnnualRevenue(project, config, row, options = {}) {
    const energy = row.energyMwh;
    const months = config.mechanismEnabled
      ? rules.mechanismActiveMonthsForYear(row.year, config.mechanismStartYm, config.mechanismEndYm) : 0;
    const mechanismRatio = config.mechanismEnabled ? config.mechanismRatio * months / 12 : 0;
    const marketEnergy = Math.max(0, energy * (1 - mechanismRatio));
    const mechanism = energy * mechanismRatio * (config.mechanismPrice - rules.mechanismReferencePrice(config, row.capturePrice));
    const strategy = rules.tradeStrategyPnlPriceForYear(config, row.year - project.startYear + 1, row.year);
    const environment = rules.getEnvValueAllocation(project, config, row.year).unitValuePerMarketMwh +
      (options.legacyEnvironment ? rules.legacyCarbonValuePerMarketMwh(project, config, row.year) : 0);
    const fees = rules.getFeeConfigForYear(project, config, row.year);
    const storageKeys = row.storageDispatch ? STORAGE_KEYS.slice(1) : STORAGE_KEYS;
    const storage = project.hasStorage ? storageKeys.reduce((sum, key) => sum + (Number(config[key]) || 0), 0) : 0;
    return energy * row.capturePrice + mechanism + marketEnergy * (strategy + environment) + (row.storageDispatch?.incrementalRevenue ?? 0)
      + energy * (storage - FEE_KEYS.reduce((sum, key) => sum + fees[key], 0) + fees.otherIncome);
  }

  const HOURS_PER_YEAR = 8760;
  const TIME_SERIES_ERROR = "全周期逐时电量或电价缺失，或与保存的基准结果不一致，请核对后重新测算。";
  const YEARLY_RESULT_ERROR = "全周期基准收入、电量与当前参数对账未通过，请重新测算。";

  function annualResultsAgree(project, scenario, result) {
    if (!Array.isArray(result.annualRows) || result.annualRows.length !== project.forecastYears || result.missingYears?.length) return false;
    let totalEnergy = 0, totalRevenue = 0;
    for (const [offset, row] of result.annualRows.entries()) {
      if (!row || row.year !== project.startYear + offset || row.energyMwh < 0 ||
          ![row.annualHours, row.energyMwh, row.spotAvgPrice, row.capturePrice, row.spotRevenue, row.fullRevenue].every(Number.isFinite) ||
          !closeAmount(row.energyMwh, row.annualHours * project.capacityMw) ||
          !closeAmount(row.fullRevenuePrice, row.energyMwh > 0 ? row.fullRevenue / row.energyMwh : 0) ||
          !closeAmount(row.spotRevenue, row.energyMwh * row.capturePrice) || !annualStorageIsComplete(project, scenario.config, row) ||
          !closeAmount(row.fullRevenue, calculateAnnualRevenue(project, scenario.config, row))) return false;
      totalEnergy += row.energyMwh;
      totalRevenue += row.fullRevenue;
    }
    return closeAmount(totalEnergy, result.totalEnergy) && closeAmount(totalRevenue, result.totalFullRevenue) &&
      closeAmount(result.avgFullRevenuePrice, totalRevenue / totalEnergy);
  }

  function findPriceSource(project, result) {
    const runId = result.sourceContext?.runId || project.activeRunId;
    if (!runId || !Array.isArray(project.priceRuns) || (project.activeRunId && project.activeRunId !== runId)) return null;
    const run = project.priceRuns.find((item) => item?.id === runId);
    if (!run) return null;
    const fingerprint = result.resultVersion || result.priceSource
      ? (versions.matchesSavedPriceSource(project, result) ? result.priceSource.fingerprint : "")
      : versions.priceContentFingerprint(project, run);
    return fingerprint ? { run, fingerprint } : null;
  }

  function hourlyEnergy(project, rows) {
    const saved = project.energyData?.hourlyByYear;
    if (rows.every((row) => Array.isArray(saved?.[row.year]) && saved[row.year].length === HOURS_PER_YEAR)) return saved;
    // Restore from the stored typical curve on a separate project shell. Missing input stays missing.
    return getEnergyData()?.ensureProjectEnergyDataDerivedState({ ...project }).hourlyByYear;
  }

  function prepareCurve(hours, prices, project, row) {
    if (!Array.isArray(hours) || hours.length !== HOURS_PER_YEAR || !Array.isArray(prices) || prices.length !== HOURS_PER_YEAR) return null;
    const generation = new Array(HOURS_PER_YEAR);
    const words = new DataView(new ArrayBuffer(8));
    let hashA = 2166136261, hashB = 5381, totalEnergy = 0, totalPrice = 0, spotRevenue = 0;
    const hash = (value) => {
      words.setFloat64(0, value || 0, true);
      hashA = Math.imul(hashA ^ words.getUint32(0, true), 16777619);
      hashB = Math.imul(hashB ^ words.getUint32(4, true), 1597334677);
    };
    for (let index = 0; index < HOURS_PER_YEAR; index += 1) {
      const equivalentHours = hours[index];
      const price = prices[index];
      if (!Number.isFinite(equivalentHours) || equivalentHours < 0 || !Number.isFinite(price)) return null;
      const energy = equivalentHours * project.capacityMw;
      generation[index] = energy;
      totalEnergy += energy;
      totalPrice += price;
      spotRevenue += energy * price;
      hash(energy);
      hash(price);
    }
    const mean = totalPrice / HOURS_PER_YEAR;
    if (!closeAmount(row.energyMwh, totalEnergy) || !closeAmount(row.spotAvgPrice, mean) || !closeAmount(row.spotRevenue, spotRevenue)) return null;
    return { generation, prices, mean, key: `${hashA >>> 0}:${hashB >>> 0}` };
  }

  function prepareStorage(project, result) {
    const source = findPriceSource(project, result);
    if (!source) return null;
    const hours = hourlyEnergy(project, result.annualRows);
    const groups = new Map();
    const curves = [];
    const curveIndices = [];
    for (const row of result.annualRows) {
      const curve = prepareCurve(hours?.[row.year], source.run.pricesByYear[row.year], project, row);
      if (!curve) return null;
      // Validate equality even when numeric hashes collide before sharing a dispatch.
      const candidates = groups.get(curve.key) || [];
      const duplicate = candidates.find((index) => curves[index].prices.every((price, hour) =>
        price === curve.prices[hour] && curves[index].generation[hour] === curve.generation[hour]));
      if (duplicate !== undefined) curveIndices.push(duplicate);
      else {
        curveIndices.push(curves.length);
        groups.set(curve.key, [...candidates, curves.length]);
        curves.push(curve);
      }
    }
    return { curves, curveIndices, sourceKey: [source.fingerprint, curves.map(({ key }) => key), curveIndices] };
  }

  function reconcileStorage(storage, rows, scheme) {
    try {
      const baselineDispatch = storage.curves.map(({ prices, generation }) => dispatch.calculateHourlyDispatch({ prices, generationMwh: generation, ...scheme }));
      return rows.every((row, i) => Object.entries(baselineDispatch[storage.curveIndices[i]])
        .every(([key, value]) => closeAmount(row.storageDispatch[key], value)));
    } catch (_) {
      return false;
    }
  }

  function prepareCycle(project, baseline) {
    const { result, scenario } = baseline || {};
    const base = baselineValue(baseline);
    if (!project || !scenario?.config || base === null) return { message: "测算周期内没有有效结算电量，暂无法分析。" };
    if (!annualResultsAgree(project, scenario, result)) return { message: YEARLY_RESULT_ERROR };
    let scheme, storage;
    if (project.hasStorage) {
      if (!result.annualRows.every((row) => row.storageDispatch) || !hourlyRowsAreComplete(project, scenario, result)) {
        return { message: "配储基准小时明细缺失或对账未通过，请重新测算后查看敏感性。" };
      }
      storage = prepareStorage(project, result);
      if (!storage) return { message: TIME_SERIES_ERROR };
      scheme = { powerMw: project.storagePowerMw, durationH: project.storageDurationH, roundTripEfficiency: scenario.config.storageRoundTripEfficiency ?? 0.9 };
    }
    const cacheKey = JSON.stringify([project.id, project.province, project.siteType, project.assetType, project.startYear, project.hasStorage,
      scenario.config, base, result.totalEnergy, result.annualRows, scheme, storage?.sourceKey]);
    let entry = cache.get(cacheKey);
    if (!entry) {
      if (storage && !reconcileStorage(storage, result.annualRows, scheme)) return { message: TIME_SERIES_ERROR };
      entry = { points: new Map(), sweeps: new Map() };
      if (cache.size >= 4) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, entry);
    }
    return { result, scenario, scheme, storage, base, entry };
  }

  function availability(project, baseline) {
    const { message = "" } = prepareCycle(project, baseline);
    return { ok: !message, message };
  }

  function perturbedStorageRevenue(curve, key, scale, scheme) {
    const { mean, generation } = curve;
    const prices = new Array(HOURS_PER_YEAR);
    if (key === "spot") {
      for (let hour = 0; hour < prices.length; hour += 1) prices[hour] = curve.prices[hour] * scale;
    } else {
      for (let hour = 0; hour < prices.length; hour += 1) prices[hour] = mean + (curve.prices[hour] - mean) * scale;
    }
    return dispatch.calculateHourlyDispatch({ prices, generationMwh: generation, ...scheme }).incrementalRevenue;
  }

  function calculatePoint(project, cycle, key, ratio) {
    const { result, scenario, scheme, storage, entry, base } = cycle;
    const pointKey = `${key}:${ratio}`;
    if (entry.points.has(pointKey)) return entry.points.get(pointKey);
    let storageRevenue;
    if (storage && DISPATCH_FACTORS.has(key)) {
      storageRevenue = [];
      for (const curve of storage.curves) storageRevenue.push(perturbedStorageRevenue(curve, key, 1 + ratio, scheme));
    }
    let revenue = 0;
    for (const [index, original] of result.annualRows.entries()) {
      const { row, config } = createPerturbation(scenario, original, key, ratio);
      if (storageRevenue) row.storageDispatch = { ...original.storageDispatch, incrementalRevenue: storageRevenue[storage.curveIndices[index]] };
      revenue += calculateAnnualRevenue(project, config, row);
    }
    const price = revenue / result.totalEnergy;
    const value = Math.abs(price - base) < Math.max(1e-8, Math.abs(base) * 1e-12) ? base : price;
    if (entry.points.size >= 600) entry.points.delete(entry.points.keys().next().value);
    entry.points.set(pointKey, value);
    return value;
  }

  function buildFactors(project, baseline, ratios) {
    if (!Array.isArray(ratios) || !ratios.length || !ratios.every((value) => Number.isFinite(value) && value > -1)) return [];
    const cycle = prepareCycle(project, baseline);
    if (cycle.message) return [];
    const { result, scenario, base, entry } = cycle;
    const sweepKey = JSON.stringify(ratios);
    if (entry.sweeps.has(sweepKey)) return entry.sweeps.get(sweepKey);
    const { mechanismEnabled, mechanismRatio, mechanismStartYm, mechanismEndYm } = scenario.config;
    const hasMechanism = mechanismEnabled && mechanismRatio > 0 && result.annualRows.some((row) =>
      row.energyMwh > 0 && rules.mechanismActiveMonthsForYear(row.year, mechanismStartYm, mechanismEndYm) > 0);
    const factors = FACTORS.map(([key, name, note, colorIndex]) => {
      const applicable = !key.startsWith("mechanism_") || Boolean(hasMechanism);
      const series = Object.freeze(ratios.map((ratio) => ratio === 0 || !applicable ? base : calculatePoint(project, cycle, key, ratio)));
      const lowDelta = series[0] - base, highDelta = series.at(-1) - base;
      return Object.freeze({ key, name, note: applicable ? note : `${note}。当前基准周期没有生效的机制电量`, colorIndex, applicable, series,
        lowDelta, highDelta, sensitivity: Math.max(...series.map((value) => Math.abs(value - base))) });
    }).sort((a, b) => b.sensitivity - a.sensitivity);
    if (!factors.every(({ series }) => series.every(Number.isFinite))) return [];
    Object.freeze(factors);
    if (entry.sweeps.size >= 12) entry.sweeps.delete(entry.sweeps.keys().next().value);
    entry.sweeps.set(sweepKey, factors);
    return factors;
  }

  return Object.freeze({ buildFactors, calculateAnnualRevenue, availability, baselineValue });
});
