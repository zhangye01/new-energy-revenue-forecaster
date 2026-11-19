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
    { key: "spot", name: "现货价格水平", axisTitle: "现货价格变化（元/MWh）", axisUnit: "元/MWh", range: 100, step: 25, colorIndex: 0,
      note: "给全周期逐时现货电价加上同一个金额，联动捕获价、机制补差及配储套利" },
    { key: "mechanism_price", name: "机制电价", axisTitle: "机制电价变化（元/MWh）", axisUnit: "元/MWh", range: 100, step: 25, colorIndex: 3,
      note: "按金额调整机制电价，最低为 0，按各年实际生效月份和机制电量重算补差" },
    { key: "mechanism_ratio", name: "机制电量占比", axisTitle: "机制电量占比（%）", axisUnit: "%", range: 100, step: 5, colorIndex: 4,
      note: "直接取 0% 至 100% 的机制电量占比，联动有效期内机制电量和市场化电量" },
    { key: "capture_spread", name: "捕获价差", axisTitle: "全周期捕获价差（元/MWh）", axisUnit: "元/MWh", range: 50, step: 10, colorIndex: 2,
      note: "保持各年现货时均价，按小时出力调整现货价格，使电量加权的全周期捕获价差达到取点值，并重新测算配储套利" }
  ];
  const inputNumber = new Intl.NumberFormat("zh-CN", { maximumSignificantDigits: 10 });

  function formatInput(value, unit, signed = true) {
    const sign = signed && value !== 0 ? (value < 0 ? "−" : "+") : "";
    return `${sign}${inputNumber.format(Math.abs(value))}${unit === "%" ? "" : " "}${unit}`;
  }

  function snapBoundary(value, step) {
    const closestPoint = Math.round(value / step) * step;
    return Math.abs(value - closestPoint) <= 1e-10 ? closestPoint || 0 : value;
  }

  function factorAxis({ key, range, step, axisUnit }, config, captureBaseline) {
    if (key === "mechanism_ratio") {
      const axisValues = Array.from({ length: range / step + 1 }, (_, index) => index * step);
      const axisLabels = axisValues.map((value) => formatInput(value, axisUnit, false));
      const lowInput = axisLabels[0], highInput = axisLabels.at(-1);
      const baselineInput = Number.isFinite(config.mechanismRatio) && config.mechanismRatio >= 0 && config.mechanismRatio <= 1
        ? snapBoundary(config.mechanismRatio * 100, step) : undefined;
      return {
        axisValues: Object.freeze(axisValues), axisLabels: Object.freeze(axisLabels), lowInput, highInput,
        baselineInput, presetLabel: `${lowInput} 至 ${highInput} · 步长 ${step} 个百分点`
      };
    }
    let low = -range;
    let high = range;
    const { mechanismPrice } = config;
    if (key === "mechanism_price" && Number.isFinite(mechanismPrice) && mechanismPrice >= 0) {
      low = Math.max(low, -mechanismPrice);
    }
    low = snapBoundary(low, step);
    high = snapBoundary(high, step);
    const values = [low];
    for (let point = -range + step; point < range; point += step) {
      if (point > low && point < high) values.push(point);
    }
    if (high > low) values.push(high);
    const labels = values.map((value) => formatInput(value, axisUnit));
    const lowInput = labels[0], highInput = labels.at(-1);
    const isCapture = key === "capture_spread";
    const rangeLabel = low === -high && !isCapture ? `±${formatInput(high, axisUnit, false)}` : `${lowInput} 至 ${highInput}`;
    return {
      axisValues: Object.freeze(values), axisLabels: Object.freeze(labels), lowInput, highInput,
      ...(isCapture ? { baselineInput: snapBoundary(captureBaseline, step) } : {}),
      presetLabel: `${rangeLabel} · 步长 ${formatInput(step, axisUnit, false)}`
    };
  }

  function baselineValue(baseline) {
    const result = baseline?.result;
    return Number.isFinite(result?.totalEnergy) && result.totalEnergy > 0 && Number.isFinite(result.avgFullRevenuePrice)
      ? result.avgFullRevenuePrice : null;
  }

  function createPerturbation(scenario, annualBase, key, offset) {
    const config = { ...scenario.config };
    const row = { ...annualBase };
    if (key === "spot") {
      row.spotAvgPrice += offset;
      row.capturePrice += offset;
    }
    if (key === "mechanism_price") config.mechanismPrice = Math.max(0, config.mechanismPrice + offset);
    if (key === "mechanism_ratio") config.mechanismRatio = offset / 100;
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
    const generationMean = totalEnergy / HOURS_PER_YEAR;
    const variance = generation.reduce((sum, energy) => sum + (energy - generationMean) ** 2, 0);
    return { generation, prices, generationMean, variance, key: `${hashA >>> 0}:${hashB >>> 0}` };
  }

  function prepareHourlyCurves(project, result) {
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

  function prepareCapture(result, hourly) {
    const { annualRows, totalEnergy } = result;
    const baseline = annualRows.reduce((sum, row) => sum + (row.capturePrice - row.spotAvgPrice) * row.energyMwh, 0) / totalEnergy;
    if (!hourly) return { baseline, variation: 0, reason: "全周期逐时电量或电价缺失，暂无法测算捕获价差" };
    const variation = hourly.curveIndices.reduce((sum, index) => sum + hourly.curves[index].variance, 0);
    const tolerance = Number.EPSILON * totalEnergy ** 2 / (HOURS_PER_YEAR * annualRows.length);
    const reason = variation > tolerance ? "" : "全周期小时出力缺少有效变化，无法在保持各年现货均价时改变捕获价差";
    return { baseline, variation, reason };
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
    let scheme;
    if (project.hasStorage) {
      if (!result.annualRows.every((row) => row.storageDispatch) || !hourlyRowsAreComplete(project, scenario, result)) {
        return { message: "配储基准小时明细缺失或对账未通过，请重新测算后查看敏感性。" };
      }
      scheme = { powerMw: project.storagePowerMw, durationH: project.storageDurationH, roundTripEfficiency: scenario.config.storageRoundTripEfficiency ?? 0.9 };
    }
    const hourly = prepareHourlyCurves(project, result);
    if (scheme && !hourly) return { message: TIME_SERIES_ERROR };
    const cacheKey = JSON.stringify([project.id, project.province, project.siteType, project.assetType, project.startYear, project.hasStorage,
      scenario.config, base, result.totalEnergy, result.annualRows, scheme, hourly?.sourceKey]);
    let entry = cache.get(cacheKey);
    if (!entry) {
      if (scheme && !reconcileStorage(hourly, result.annualRows, scheme)) return { message: TIME_SERIES_ERROR };
      entry = { factors: null };
      if (cache.size >= 4) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, entry);
    }
    return { result, scenario, scheme, hourly, base, entry };
  }

  function availability(project, baseline) {
    const { message = "" } = prepareCycle(project, baseline);
    return { ok: !message, message };
  }

  function perturbedStorageRevenue(curve, key, offset, captureScale, scheme) {
    const { generationMean, generation } = curve;
    const prices = new Array(HOURS_PER_YEAR);
    if (key === "spot") {
      for (let hour = 0; hour < prices.length; hour += 1) prices[hour] = curve.prices[hour] + offset;
    } else {
      for (let hour = 0; hour < prices.length; hour += 1) {
        prices[hour] = curve.prices[hour] + captureScale * (generation[hour] - generationMean);
      }
    }
    return dispatch.calculateHourlyDispatch({ prices, generationMwh: generation, ...scheme }).incrementalRevenue;
  }

  function calculatePoint(project, cycle, key, offset, capture) {
    const { result, scenario, scheme, hourly, base } = cycle;
    // Centering generation preserves each year's spot mean. The cycle-wide
    // scale gives the requested change in energy-weighted capture spread.
    const captureScale = key === "capture_spread" ? (offset - capture.baseline) * result.totalEnergy / capture.variation : 0;
    let storageRevenue;
    if (scheme && DISPATCH_FACTORS.has(key)) {
      storageRevenue = [];
      for (const curve of hourly.curves) storageRevenue.push(perturbedStorageRevenue(curve, key, offset, captureScale, scheme));
    }
    let revenue = 0;
    for (const [index, original] of result.annualRows.entries()) {
      const { row, config } = createPerturbation(scenario, original, key, offset);
      if (captureScale && row.energyMwh > 0) row.capturePrice += captureScale * hourly.curves[hourly.curveIndices[index]].variance / row.energyMwh;
      if (storageRevenue) row.storageDispatch = { ...original.storageDispatch, incrementalRevenue: storageRevenue[hourly.curveIndices[index]] };
      revenue += calculateAnnualRevenue(project, config, row);
    }
    const price = revenue / result.totalEnergy;
    return Math.abs(price - base) < Math.max(1e-8, Math.abs(base) * 1e-12) ? base : price;
  }

  function buildFactors(project, baseline) {
    const cycle = prepareCycle(project, baseline);
    if (cycle.message) return [];
    const { result, scenario, base, entry } = cycle;
    if (entry.factors) return entry.factors;
    const capture = prepareCapture(result, cycle.hourly);
    const { mechanismEnabled, mechanismRatio, mechanismStartYm, mechanismEndYm } = scenario.config;
    const hasActiveMonths = mechanismEnabled && result.annualRows.some((row) =>
      row.energyMwh > 0 && rules.mechanismActiveMonthsForYear(row.year, mechanismStartYm, mechanismEndYm) > 0);
    const factors = FACTORS.map((factor) => {
      const { key, name, note, colorIndex, axisTitle, axisUnit } = factor;
      const applicable = !key.startsWith("mechanism_") || Boolean(hasActiveMonths && (key === "mechanism_ratio" || mechanismRatio > 0));
      const axis = factorAxis(factor, scenario.config, capture.baseline);
      const available = key !== "capture_spread" || !capture.reason;
      const pointAt = (value) => !applicable || value === (axis.baselineInput ?? 0) ? base : calculatePoint(project, cycle, key, value, capture);
      const series = Object.freeze(axis.axisValues.map((value) => available ? pointAt(value) : null));
      const unavailableReason = available ? "" : capture.reason;
      const lowDelta = available ? series[0] - base : null;
      const highDelta = available ? series.at(-1) - base : null;
      const sensitivity = available ? Math.max(Math.abs(lowDelta), Math.abs(highDelta)) : null;
      return Object.freeze({ key, name, note: unavailableReason ? `${note}。${unavailableReason}` : applicable ? note : `${note}。当前基准周期没有生效的机制电量`,
        colorIndex, applicable, available, unavailableReason, series, axisTitle, axisUnit, ...axis, lowDelta, highDelta, sensitivity });
    }).sort((a, b) => (b.sensitivity ?? -1) - (a.sensitivity ?? -1));
    if (!factors.every(({ available, series }) => !available || series.every(Number.isFinite))) return [];
    entry.factors = Object.freeze(factors);
    return entry.factors;
  }

  return Object.freeze({ buildFactors, calculateAnnualRevenue, availability, baselineValue });
});
