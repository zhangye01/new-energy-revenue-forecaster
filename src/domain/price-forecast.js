"use strict";

(function (root, factory) {
  const energyProfiles = typeof module !== "undefined" && module.exports
    ? require("./energy-profiles")
    : root.NE_ENERGY_PROFILES;
  const supplyDemand = typeof module !== "undefined" && module.exports
    ? require("./supply-demand")
    : root.NE_SUPPLY_DEMAND;
  const api = factory(energyProfiles, supplyDemand);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_PRICE_FORECAST = api;
  if (root.window && root.window !== root) {
    root.window.NE_PRICE_FORECAST = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (energyProfiles, supplyDemand) {
  if (!energyProfiles) {
    throw new Error("电价预测初始化失败：缺少 energy-profiles.js");
  }

  const MARKET_PRICE_BASIS = "project_storage_independent_v1";
  const FORECAST_MODEL_DEFINITIONS = Object.freeze([
    Object.freeze({
      family: "lstm",
      name: "LSTM",
      label: "LSTM 序列模型",
      versionSuffix: "lstm",
      seedOffset: 101,
      levelBias: 0.99,
      volatility: 0.82,
      peakScale: 0.92,
      spikeScale: 0.7,
      negativeScale: 0.75,
      mapeBase: 0.118,
      smapeBase: 0.138,
      maeBase: 42,
      rmseBase: 66
    }),
    Object.freeze({
      family: "xgboost",
      name: "XGBoost",
      label: "XGBoost 特征树模型",
      versionSuffix: "xgb",
      seedOffset: 211,
      levelBias: 1.015,
      volatility: 1.18,
      peakScale: 1.13,
      spikeScale: 1.28,
      negativeScale: 1.05,
      mapeBase: 0.132,
      smapeBase: 0.151,
      maeBase: 50,
      rmseBase: 76
    }),
    Object.freeze({
      family: "ensemble",
      name: "Ensemble",
      label: "Ensemble 融合模型",
      versionSuffix: "ens",
      seedOffset: 307,
      levelBias: 1.005,
      volatility: 0.95,
      peakScale: 1.02,
      spikeScale: 0.88,
      negativeScale: 0.82,
      mapeBase: 0.104,
      smapeBase: 0.124,
      maeBase: 36,
      rmseBase: 58
    })
  ]);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getPriceBaseForProvince(province, provinceBenchmarks = {}) {
    return provinceBenchmarks[province]?.historyPrice || 360;
  }

  function getHistoryMockShapeFactors(project) {
    const isPhotovoltaic = project.assetType === "photovoltaic";
    const isOffshore = project.siteType === "offshore";
    return {
      baseShift: isPhotovoltaic ? -14 : 10,
      yearVolatility: isPhotovoltaic ? 0.96 : 1.07,
      winterScale: isOffshore ? 1.2 : (isPhotovoltaic ? 0.72 : 1),
      summerScale: isPhotovoltaic ? 1.22 : 0.92,
      morningPeakWeight: isPhotovoltaic ? 0.17 : 0.24,
      eveningPeakWeight: isPhotovoltaic ? 0.37 : 0.42,
      noonValleyWeight: isPhotovoltaic ? 0.21 : 0.13,
      nightValleyWeight: isOffshore ? 0.03 : 0.07,
      weekendLevel: isPhotovoltaic ? 0.94 : 0.91,
      noiseAmplitude: isOffshore ? 0.16 : (isPhotovoltaic ? 0.2 : 0.22),
      spikeThreshold: isPhotovoltaic ? 0.9968 : 0.9962,
      spikeScale: 1,
      negativeThreshold: isPhotovoltaic ? 0.9918 : 0.9946,
      negativeScale: isPhotovoltaic ? 1 : 0.78
    };
  }

  function buildForecastDayMeta(year) {
    return Array.from({ length: 365 }, (_, dayIndex) => {
      const { month, day } = energyProfiles.dayOfYearToMonthDay(dayIndex + 1);
      const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      return {
        month,
        dayOfWeek,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6
      };
    });
  }

  function hourlyPricesFromQuarterPrices(quarterPrices) {
    if (!Array.isArray(quarterPrices) || quarterPrices.length !== 35040) return [];
    const hourly = [];
    for (let hour = 0; hour < 8760; hour += 1) {
      const start = hour * 4;
      hourly.push(Number(((quarterPrices[start] + quarterPrices[start + 1] + quarterPrices[start + 2] + quarterPrices[start + 3]) / 4).toFixed(4)));
    }
    return hourly;
  }

  function forecastQuarterPrice(project, model, context) {
    const {
      year,
      dayIndex,
      quarterOfDay,
      baseLevel,
      dayMeta,
      factors,
      seed
    } = context;
    const hour = quarterOfDay / 4;
    const { month, isWeekend } = dayMeta;
    const winterLoad = 0.18 * Math.cos(((dayIndex - 12) / 365) * 2 * Math.PI) * factors.winterScale;
    const summerLoad = 0.16 * Math.cos(((dayIndex - 196) / 365) * 2 * Math.PI) * factors.summerScale;
    const seasonal = 1 + winterLoad + summerLoad;
    const morningPeak = Math.exp(-Math.pow((hour - 8.5) / 2.2, 2));
    const eveningPeak = 1.22 * Math.exp(-Math.pow((hour - 18.4) / 2.9, 2));
    const noonValley = 0.13 * Math.exp(-Math.pow((hour - 13.2) / 2.4, 2));
    const nightValley = 0.07 * Math.exp(-Math.pow((hour - 3.2) / 2.8, 2));
    const diurnal = 0.9
      + factors.morningPeakWeight * model.peakScale * morningPeak
      + factors.eveningPeakWeight * model.peakScale * eveningPeak
      - factors.noonValleyWeight * noonValley
      - factors.nightValleyWeight * nightValley;
    const weekendFactor = isWeekend ? factors.weekendLevel : 1;
    const quarterIndex = dayIndex * 96 + quarterOfDay;
    const intradayRipple = 1 + 0.012 * model.volatility * Math.sin((quarterOfDay / 96) * 8 * Math.PI + model.seedOffset / 100);
    const randomFactor = 1 + (energyProfiles.pseudoNoise(quarterIndex * 97 + year, seed + model.seedOffset) - 0.5) * factors.noiseAmplitude * model.volatility;
    let price = baseLevel * model.levelBias * seasonal * diurnal * weekendFactor * intradayRipple * randomFactor;

    const spikeThreshold = clamp(factors.spikeThreshold + (1 - model.spikeScale) * 0.0015, 0.99, 0.9998);
    const spikeSeed = energyProfiles.pseudoNoise(quarterIndex * 53 + year, seed + model.seedOffset + 37);
    if (spikeSeed > spikeThreshold) {
      price *= 1.32 + (spikeSeed - spikeThreshold) * 28 * model.spikeScale;
    }

    const negativeThreshold = clamp(factors.negativeThreshold + (1 - model.negativeScale) * 0.002, 0.985, 0.9995);
    const negativeSeed = energyProfiles.pseudoNoise(quarterIndex * 31 + year, seed + model.seedOffset + 73);
    if (
      hour >= 10.5 && hour <= 15.5
      && (month === 4 || month === 5 || month === 10 || (project.assetType === "photovoltaic" && month === 9))
      && negativeSeed > negativeThreshold
    ) {
      price = -5 - 90 * energyProfiles.pseudoNoise(quarterIndex * 43 + year, seed + model.seedOffset + 91) * model.negativeScale;
    }

    return Number(clamp(price, -150, 950).toFixed(2));
  }

  function buildForecastPriceSeries(project, model, seed, growth, options = {}) {
    const factors = getHistoryMockShapeFactors(project);
    const base = getPriceBaseForProvince(project.province, options.provinceBenchmarks || {}) + factors.baseShift;
    const quarterPricesByYear = {};
    const pricesByYear = {};

    for (let i = 0; i < project.forecastYears; i += 1) {
      const year = project.startYear + i;
      const yearEscalator = Math.pow(1 + growth, i);
      const baseLevel = base * yearEscalator;
      const dayMeta = buildForecastDayMeta(year);
      const quarterPrices = [];
      for (let dayIndex = 0; dayIndex < 365; dayIndex += 1) {
        for (let quarterOfDay = 0; quarterOfDay < 96; quarterOfDay += 1) {
          quarterPrices.push(forecastQuarterPrice(project, model, {
            year,
            dayIndex,
            quarterOfDay,
            baseLevel,
            dayMeta: dayMeta[dayIndex],
            factors,
            seed
          }));
        }
      }
      quarterPricesByYear[year] = quarterPrices;
      pricesByYear[year] = hourlyPricesFromQuarterPrices(quarterPrices);
    }

    return { quarterPricesByYear, pricesByYear };
  }

  function countForecastPriceMissing(project, run) {
    let missing = 0;
    const pricesByYear = run?.pricesByYear || {};
    const quarterPricesByYear = run?.quarterPricesByYear || {};
    for (let i = 0; i < project.forecastYears; i += 1) {
      const year = project.startYear + i;
      const price = pricesByYear[year];
      if (!price || price.length !== 8760) {
        missing += 8760;
      }
      if (run?.granularityMinutes === 15) {
        const quarterPrice = quarterPricesByYear[year];
        if (!quarterPrice || quarterPrice.length !== 35040) {
          missing += 35040;
        }
      }
    }
    return missing;
  }

  function evaluateRunQuality(project, run, qualityGate) {
    const gate = qualityGate || {
      hard: { mape: 0.15, smape: 0.18, missingPoints: 0 },
      soft: { mae: 55, rmse: 80 }
    };
    const missingPoints = countForecastPriceMissing(project, run);
    const hardPass = run.mape <= gate.hard.mape
      && run.smape <= gate.hard.smape
      && missingPoints <= gate.hard.missingPoints;
    const softPass = run.mae <= gate.soft.mae
      && run.rmse <= gate.soft.rmse;

    run.qualityGatePassed = hardPass;
    run.softGatePassed = softPass;
    run.missingPoints = missingPoints;
    if (!hardPass) {
      run.status = "validated";
    } else if (softPass) {
      run.status = "publishable";
    } else {
      run.status = "publishable_warn";
    }
    return run;
  }

  function supplyDemandError(message) {
    throw new Error(`供需输入无效：${message}`);
  }

  function sumSupplyValues(values) {
    let total = 0, compensation = 0;
    for (const value of values) {
      const adjusted = value - compensation, next = total + adjusted;
      compensation = (next - total) - adjusted;
      total = next;
    }
    return total;
  }

  function isSupplyObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function hasSupplyRows(rows, count) {
    return Array.isArray(rows) && rows.length === count
      && Array.from(rows, (row, index) => Object.hasOwn(rows, index) && isSupplyObject(row)).every(Boolean);
  }

  function validateSupplyDemandDataset(project, input) {
    if (!supplyDemand) supplyDemandError("缺少供需输入模块。");
    const { config, dataset } = input || {};
    const errors = supplyDemand.validateConfig(project, config);
    if (errors.length) supplyDemandError(errors.join("；"));
    const fingerprint = supplyDemand.fingerprint(project, config);
    const source = dataset?.source;
    if (!dataset?.ok || dataset.fingerprint !== fingerprint || source?.inputFingerprint !== fingerprint) {
      supplyDemandError("小时数据与配置版本不一致，请重新保存并生成供需输入。");
    }
    if (source.version !== 1 || source.projectId !== (project.id ?? null) || source.province !== (project.province ?? null)
        || source.startYear !== project.startYear || source.forecastYears !== project.forecastYears
        || source.calendar !== "fixed_365_days" || source.daysPerYear !== 365 || source.hoursPerYear !== 8760 || source.intervalHours !== 1
        || source.typicalHoursPerYear !== 288 || source.hourOfDayBase !== 0 || source.hourIndexBase !== 1
        || source.typicalDayExpansion !== true || source.tieLinePositiveDirection !== "export" || source.tieLineNegativeDirection !== "import"
        || source.curveReuse !== "same_monthly_and_hourly_weights_across_years"
        || JSON.stringify(source.monthDays) !== JSON.stringify(supplyDemand.MONTH_DAYS)
        || source.energyUnit !== "MWh" || source.averagePowerUnit !== "MW") {
      supplyDemandError("项目、测算周期、模型日历或单位不一致。");
    }
    if (!hasSupplyRows(dataset.annualRows, project.forecastYears)
        || !hasSupplyRows(dataset.typicalRows, project.forecastYears * 288)
        || !isSupplyObject(dataset.hourlyByYear) || Object.keys(dataset.hourlyByYear).length !== project.forecastYears) {
      supplyDemandError("供需时序未覆盖完整测算周期。");
    }
    // A copied fingerprint alone is not evidence that the supplied numbers came
    // from that configuration. Recompute from the authoritative input contract.
    const expected = supplyDemand.buildDataset(project, config);
    if (!expected.ok) supplyDemandError(expected.errors.join("；"));
    const keys = [...supplyDemand.ELEMENTS.map(({ key }) => key), "residualDemand", "tieLineExport", "tieLineImport"];
    dataset.annualRows.forEach((annual, index) => {
      const year = project.startYear + index;
      if (annual.year !== year) supplyDemandError("年度供需顺序与测算周期不一致。");
      const hourly = dataset.hourlyByYear[year];
      const typical = dataset.typicalRows.slice(index * 288, (index + 1) * 288);
      const typicalIndexByHour = [];
      supplyDemand.MONTH_DAYS.forEach((days, monthIndex) => {
        for (let day = 0; day < days; day += 1) {
          for (let hour = 0; hour < 24; hour += 1) typicalIndexByHour.push(monthIndex * 24 + hour);
        }
      });
      typical.forEach((row, position) => {
        const month = Math.floor(position / 24) + 1;
        if (row.year !== year || row.month !== month || row.hour !== position % 24
            || row.representedDays !== supplyDemand.MONTH_DAYS[month - 1]) supplyDemandError("典型日时序或代表天数不一致。");
      });
      keys.forEach((key) => {
        const values = hourly?.[key];
        if (!Number.isFinite(annual[key]) || !Array.isArray(values) || values.length !== 8760
            || Array.from(values).some((value) => !Number.isFinite(value))
            || typical.some((row) => !Number.isFinite(row[key]))) supplyDemandError(`${year}年${key}须有完整有效的8760小时数据。`);
        if (annual[key] !== expected.annualRows[index][key]
            || typical.some((row, position) => row[key] !== expected.typicalRows[index * 288 + position][key])) {
          supplyDemandError(`${year}年${key}数据与原始供需配置不一致。`);
        }
        if (values.some((value, hourIndex) => value !== typical[typicalIndexByHour[hourIndex]][key])) {
          supplyDemandError(`${year}年${key}小时展开与典型日时序不一致。`);
        }
        const total = sumSupplyValues(values);
        const typicalTotal = sumSupplyValues(typical.map((row) => row[key] * row.representedDays));
        const arithmeticScale = key === "residualDemand"
          ? sumSupplyValues(["load", "wind", "solar", "hydro", "nonMarket", "tieLineExport", "tieLineImport"].map((name) => Math.abs(annual[name])))
          : key === "tieLine" ? annual.tieLineExport + annual.tieLineImport : Math.abs(annual[key]);
        const tolerance = Math.max(1e-6, Math.abs(annual[key]) * 1e-9, arithmeticScale * Number.EPSILON * 32);
        if (!Number.isFinite(total) || !Number.isFinite(typicalTotal)
            || Math.abs(total - annual[key]) > tolerance || Math.abs(typicalTotal - annual[key]) > tolerance) {
          supplyDemandError(`${year}年${key}小时数据与年度电量不守恒。`);
        }
      });
    });
    return { config, dataset, fingerprint, source };
  }

  function snapshotSupplyDemandInput(project, input) {
    const { config, dataset, fingerprint, source } = validateSupplyDemandDataset(project, input);
    return {
      version: 1,
      fingerprint,
      projectId: project.id ?? null,
      province: project.province ?? null,
      period: { startYear: project.startYear, forecastYears: project.forecastYears },
      calendar: source.calendar,
      units: { energy: source.energyUnit, averagePower: source.averagePowerUnit, intervalHours: source.intervalHours },
      hoursPerYear: source.hoursPerYear,
      featureConsumption: "not_used_by_demo_model",
      configSnapshot: JSON.parse(JSON.stringify(config)),
      annualSummary: JSON.parse(JSON.stringify(dataset.annualRows))
    };
  }

  function validateSupplyDemandRun(project, run) {
    const config = project?.supplyDemand?.config;
    const saved = run?.supplyDemandInput;
    const hasSource = run != null && Object.hasOwn(run, "supplyDemandInput");
    if (!config && !hasSource) return { ok: true, errors: [], legacy: true };
    if (!config) return { ok: false, errors: ["当前项目缺少供需配置，请先核对并保存。"] };
    if (!supplyDemand) return { ok: false, errors: ["供需输入模块尚未加载。"] };
    const errors = supplyDemand.validateConfig(project, config);
    if (errors.length) return { ok: false, errors };
    if (!hasSource) return { ok: false, errors: ["历史预测未绑定当前供需输入，请重新生成。"] };
    if (!isSupplyObject(saved) || saved.version !== 1 || saved.calendar !== "fixed_365_days"
        || saved.hoursPerYear !== 8760 || !isSupplyObject(saved.units)
        || saved.units.energy !== "MWh" || saved.units.averagePower !== "MW" || saved.units.intervalHours !== 1
        || saved.featureConsumption !== "not_used_by_demo_model") {
      return { ok: false, errors: ["供需来源的版本、日历、单位或模型使用标记无效，请重新生成电价预测。"] };
    }
    const snapshotErrors = supplyDemand.validateConfig(project, saved.configSnapshot);
    if (snapshotErrors.length) return { ok: false, errors: ["供需来源配置快照不完整或无效，请重新生成电价预测。"] };
    const current = supplyDemand.fingerprint(project, config);
    if (saved.fingerprint !== current || saved.projectId !== (project.id ?? null)
        || saved.province !== (project.province ?? null) || saved.period?.startYear !== project.startYear
        || saved.period?.forecastYears !== project.forecastYears
        || supplyDemand.fingerprint(project, saved.configSnapshot) !== saved.fingerprint) {
      return { ok: false, errors: ["供需输入或项目边界已变化，请重新生成电价预测。"] };
    }
    const expected = supplyDemand.buildAnnualSummary(project, saved.configSnapshot);
    const keys = [...supplyDemand.ELEMENTS.map(({ key }) => key), "residualDemand", "tieLineExport", "tieLineImport"];
    if (!expected.ok || !hasSupplyRows(saved.annualSummary, project.forecastYears)
        || saved.annualSummary.some((row, index) => row.year !== expected.annualRows[index].year
          || keys.some((key) => !Number.isFinite(row[key]) || row[key] !== expected.annualRows[index][key]))) {
      return { ok: false, errors: ["供需来源年度摘要与配置快照不一致，请重新生成电价预测。"] };
    }
    return { ok: true, errors: [] };
  }

  function createForecastRunForModel(project, model, options) {
    const {
      algorithmVersion,
      featureVersion,
      dataSnapshotId,
      trainStart,
      trainEnd,
      seed,
      growth,
      id = "",
      createdAt = "",
      qualityGate,
      provinceBenchmarks,
      supplyDemandInput
    } = options;
    // The adapter accepts the actual hourly dataset, but this demonstrator still
    // uses its established deterministic price simulation. Do not imply training.
    const supplySnapshot = supplyDemandInput === undefined ? null : snapshotSupplyDemandInput(project, supplyDemandInput);
    const modelSeed = seed + model.seedOffset;
    const { quarterPricesByYear, pricesByYear } = buildForecastPriceSeries(project, model, modelSeed, growth, { provinceBenchmarks });
    const run = {
      id,
      marketPriceBasis: MARKET_PRICE_BASIS,
      algorithmFamily: model.family,
      algorithmName: model.name,
      algorithmLabel: model.label,
      algorithmVersion: `${algorithmVersion}-${model.versionSuffix}`,
      featureVersion,
      dataSnapshotId,
      trainStart,
      trainEnd,
      seed: modelSeed,
      growth,
      status: "validated",
      createdAt,
      granularityMinutes: 15,
      pointsPerYear: 35040,
      pricesByYear,
      quarterPricesByYear,
      mape: model.mapeBase + energyProfiles.pseudoNoise(modelSeed, trainStart) * 0.01,
      smape: model.smapeBase + energyProfiles.pseudoNoise(modelSeed, trainEnd) * 0.012,
      mae: model.maeBase + energyProfiles.pseudoNoise(modelSeed, 8) * 7,
      rmse: model.rmseBase + energyProfiles.pseudoNoise(modelSeed, 10) * 8
    };
    if (supplySnapshot) run.supplyDemandInput = supplySnapshot;
    return evaluateRunQuality(project, run, qualityGate);
  }

  return Object.freeze({
    MARKET_PRICE_BASIS,
    FORECAST_MODEL_DEFINITIONS,
    getPriceBaseForProvince,
    getHistoryMockShapeFactors,
    buildForecastDayMeta,
    hourlyPricesFromQuarterPrices,
    forecastQuarterPrice,
    buildForecastPriceSeries,
    countForecastPriceMissing,
    evaluateRunQuality,
    snapshotSupplyDemandInput,
    validateSupplyDemandDataset,
    validateSupplyDemandRun,
    createForecastRunForModel
  });
});
