"use strict";

(function (root, factory) {
  const energyProfiles = typeof module !== "undefined" && module.exports
    ? require("./energy-profiles")
    : root.NE_ENERGY_PROFILES;
  const api = factory(energyProfiles);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_PRICE_FORECAST = api;
  if (root.window && root.window !== root) {
    root.window.NE_PRICE_FORECAST = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (energyProfiles) {
  if (!energyProfiles) {
    throw new Error("电价预测初始化失败：缺少 energy-profiles.js");
  }

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
    const hasStorage = Boolean(project.hasStorage);
    const storageScale = hasStorage
      ? clamp(((project.storagePowerMw || 0) * (project.storageDurationH || 0)) / Math.max(project.capacityMw || 1, 1), 0.05, 0.3)
      : 0;

    return {
      baseShift: isPhotovoltaic ? -14 : 10,
      yearVolatility: isPhotovoltaic ? 0.96 : 1.07,
      winterScale: isOffshore ? 1.2 : (isPhotovoltaic ? 0.72 : 1),
      summerScale: isPhotovoltaic ? 1.22 : 0.92,
      morningPeakWeight: isPhotovoltaic ? 0.17 : 0.24,
      eveningPeakWeight: hasStorage ? 0.26 : (isPhotovoltaic ? 0.37 : 0.42),
      noonValleyWeight: hasStorage ? (isPhotovoltaic ? 0.11 : 0.08) : (isPhotovoltaic ? 0.21 : 0.13),
      nightValleyWeight: isOffshore ? 0.03 : 0.07,
      weekendLevel: isPhotovoltaic ? 0.94 : 0.91,
      noiseAmplitude: isOffshore ? 0.16 : (isPhotovoltaic ? 0.2 : 0.22),
      spikeThreshold: hasStorage ? 0.9978 : (isPhotovoltaic ? 0.9968 : 0.9962),
      spikeScale: hasStorage ? 0.78 : 1,
      negativeThreshold: hasStorage ? 0.9968 : (isPhotovoltaic ? 0.9918 : 0.9946),
      negativeScale: hasStorage ? 0.55 : (isPhotovoltaic ? 1 : 0.78),
      storageScale
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
    const storageShift = factors.storageScale;
    const diurnal = 0.9
      + factors.morningPeakWeight * model.peakScale * morningPeak
      + factors.eveningPeakWeight * model.peakScale * eveningPeak
      - (factors.noonValleyWeight - storageShift * 0.05) * noonValley
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
      provinceBenchmarks
    } = options;
    const modelSeed = seed + model.seedOffset;
    const { quarterPricesByYear, pricesByYear } = buildForecastPriceSeries(project, model, modelSeed, growth, { provinceBenchmarks });
    const run = {
      id,
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
    return evaluateRunQuality(project, run, qualityGate);
  }

  return Object.freeze({
    FORECAST_MODEL_DEFINITIONS,
    getPriceBaseForProvince,
    getHistoryMockShapeFactors,
    buildForecastDayMeta,
    hourlyPricesFromQuarterPrices,
    forecastQuarterPrice,
    buildForecastPriceSeries,
    countForecastPriceMissing,
    evaluateRunQuality,
    createForecastRunForModel
  });
});
