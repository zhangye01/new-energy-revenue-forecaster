"use strict";

(function (root, factory) {
  const csvUtils = root.NE_CSV_UTILS || (typeof require !== "undefined" ? require("./csv-utils") : null);
  const energyProfiles = root.NE_ENERGY_PROFILES || (typeof require !== "undefined" ? require("./energy-profiles") : null);
  const projectModel = root.NE_PROJECT_MODEL || (typeof require !== "undefined" ? require("./project-model") : null);
  const api = factory({ csvUtils, energyProfiles, projectModel });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_ENERGY_DATA = api;
  if (root.window && root.window !== root) {
    root.window.NE_ENERGY_DATA = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function ({ csvUtils, energyProfiles, projectModel }) {
  if (!csvUtils || !energyProfiles || !projectModel) {
    throw new Error("缺少电量数据模块依赖");
  }

  const ENERGY_MODE_META = Object.freeze({
    hourly_8760: Object.freeze({
      label: "完整8760小时曲线（旧版）",
      header: "year,hour_index,equivalent_hours_h",
      placeholder: "year,hour_index,equivalent_hours_h"
    }),
    annual_hours: Object.freeze({
      label: "逐年总量模板",
      header: "year,annual_hours_h",
      placeholder: "year,annual_hours_h"
    }),
    typical_curve_8760: Object.freeze({
      label: "典型年8760模板",
      header: "hour_index,equivalent_hours_h",
      placeholder: "hour_index,equivalent_hours_h"
    }),
    province_typical_curve: Object.freeze({
      label: "省份典型曲线",
      header: "",
      placeholder: ""
    })
  });
  const ENERGY_MODE_SET = Object.freeze(Object.keys(ENERGY_MODE_META));
  const COASTAL_PROVINCE_KEYS = Object.freeze(["liaoning", "tianjin", "shanghai", "jiangsu", "zhejiang", "fujian", "shandong", "guangdong", "guangxi", "hainan"]);
  const NORTHERN_PROVINCE_KEYS = Object.freeze(["heilongjiang", "jilin", "liaoning", "inner_mongolia", "gansu", "ningxia", "xinjiang", "qinghai"]);

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function hasNonEmptyObject(value) {
    if (!isPlainObject(value)) return false;
    return Object.keys(value).some((key) => {
      const item = value[key];
      if (item === null || item === undefined) return false;
      if (typeof item === "string") return item.trim() !== "";
      if (typeof item === "number") return Number.isFinite(item);
      if (Array.isArray(item)) return item.length > 0;
      if (isPlainObject(item)) return Object.keys(item).length > 0;
      return Boolean(item);
    });
  }

  function getEnergyModeMeta(mode) {
    const key = projectModel.normalizeEnergyMode(mode);
    return ENERGY_MODE_META[key] || ENERGY_MODE_META.annual_hours;
  }

  function ensureProjectEnergyDataState(project) {
    if (!project || !isPlainObject(project)) return projectModel.createEmptyEnergyDataState();
    const raw = isPlainObject(project.energyData) ? project.energyData : {};
    const normalized = projectModel.createEmptyEnergyDataState(raw.mode || project.energyMode || "annual_hours");
    normalized.mode = projectModel.normalizeEnergyMode(raw.mode || project.energyMode || "annual_hours");
    normalized.hourlyByYear = isPlainObject(raw.hourlyByYear) ? raw.hourlyByYear : {};
    normalized.annualSummary = isPlainObject(raw.annualSummary) ? raw.annualSummary : {};
    normalized.annualInputByYear = isPlainObject(raw.annualInputByYear)
      ? raw.annualInputByYear
      : Object.fromEntries(
        Object.entries(normalized.annualSummary)
          .map(([year, item]) => [year, Number(item?.annualHours)])
          .filter(([, value]) => Number.isFinite(value) && value > 0)
      );
    normalized.typicalCurveSource = ["typical_curve_8760", "province_typical_curve"].includes(raw.typicalCurveSource)
      ? raw.typicalCurveSource
      : (normalized.mode === "typical_curve_8760" || normalized.mode === "province_typical_curve" ? normalized.mode : "");
    normalized.typicalCurveProfile = energyProfiles.normalizeTypicalCurveProfile(raw.typicalCurveProfile);
    project.energyData = normalized;
    project.energyMode = normalized.mode;
    return normalized;
  }

  function hasStoredEnergyTypicalCurve(energyData) {
    return energyProfiles.normalizeTypicalCurveProfile(energyData?.typicalCurveProfile).length === 8760
      && ["typical_curve_8760", "province_typical_curve"].includes(energyData?.typicalCurveSource);
  }

  function hasEnergyTypicalCurve(project) {
    const energyData = ensureProjectEnergyDataState(project);
    return hasStoredEnergyTypicalCurve(energyData);
  }

  function normalizeSiteType(siteType, validSiteTypes) {
    return validSiteTypes?.has?.(siteType) ? siteType : "onshore";
  }

  function getProvinceTypicalCurveRecordKey(project, options = {}) {
    if (!project?.province || !project?.assetType) return "";
    const siteType = normalizeSiteType(project.siteType, options.siteTypeSet);
    return `${project.province}:${project.assetType}:${siteType}`;
  }

  function createProvinceTypicalCurveMockRecord(project, options = {}) {
    const provinceBenchmarks = options.provinceBenchmarks || {};
    const benchmark = provinceBenchmarks?.[project?.province] || {};
    const provinceSeed = Number(benchmark.historyPrice || 360);
    const siteType = normalizeSiteType(project?.siteType, options.siteTypeSet);
    const assetType = project?.assetType;
    const coastalSet = new Set(options.coastalProvinceKeys || COASTAL_PROVINCE_KEYS);
    const northernSet = new Set(options.northernProvinceKeys || NORTHERN_PROVINCE_KEYS);
    const describeProvinceTypicalCurve = options.describeProvinceTypicalCurve || (() => "所选省份");
    const raw = [];

    for (let hourIndex = 0; hourIndex < 8760; hourIndex += 1) {
      const dayOfYear = Math.floor(hourIndex / 24) + 1;
      const hour = hourIndex % 24;
      const { month } = energyProfiles.dayOfYearToMonthDay(dayOfYear);
      let value = energyProfiles.generationWeight(assetType, hourIndex, provinceSeed + 17);

      if (assetType === "wind") {
        const winterBoost = (month === 12 || month <= 2) ? (northernSet.has(project?.province) ? 1.18 : 1.06) : 1;
        const nightBoost = hour <= 6 || hour >= 19 ? (siteType === "offshore" ? 1.14 : 1.08) : 0.97;
        const coastalBoost = siteType === "offshore" || coastalSet.has(project?.province) ? 1.05 : 0.99;
        value *= winterBoost * nightBoost * coastalBoost;
      } else if (assetType === "photovoltaic") {
        const summerBoost = month >= 4 && month <= 9 ? 1.12 : 0.88;
        const noonBoost = hour >= 10 && hour <= 15 ? 1.14 : (hour >= 7 && hour <= 17 ? 0.98 : 1);
        const cloudFactor = coastalSet.has(project?.province) ? 0.97 : 1.02;
        const offshoreBoost = siteType === "offshore" ? 1.03 : 1;
        value *= summerBoost * noonBoost * cloudFactor * offshoreBoost;
      }

      value *= 0.94 + (provinceSeed % 23) / 100;
      raw.push(value);
    }

    return {
      key: getProvinceTypicalCurveRecordKey(project, options),
      profile: energyProfiles.normalizeTypicalCurveProfile(raw),
      sourceLabel: `模拟库：${describeProvinceTypicalCurve(project)} 典型8760曲线`
    };
  }

  function getCompleteEnergyYears(project) {
    if (!project || !Number.isInteger(project.startYear) || !Number.isInteger(project.forecastYears)) return [];
    const energyData = ensureProjectEnergyDataDerivedState(project);
    const years = [];
    for (let i = 0; i < project.forecastYears; i += 1) {
      const year = project.startYear + i;
      if (
        energyData?.annualSummary?.[year]?.status === "完整"
        && Array.isArray(energyData?.hourlyByYear?.[year])
        && energyData.hourlyByYear[year].length === 8760
      ) {
        years.push(year);
      }
    }
    return years;
  }

  function getAnnualInputYearCount(project) {
    const energyData = ensureProjectEnergyDataDerivedState(project);
    const rangeYears = Number.isInteger(project?.forecastYears) && project.forecastYears > 0 ? project.forecastYears : 0;
    if (!rangeYears) return 0;
    let count = 0;
    for (let i = 0; i < project.forecastYears; i += 1) {
      const year = project.startYear + i;
      const annual = Number(energyData.annualInputByYear?.[year]);
      if (Number.isFinite(annual) && annual > 0) count += 1;
    }
    return count;
  }

  function getContiguousAnnualInputPeriod(annualInputByYear) {
    if (!isPlainObject(annualInputByYear)) return null;
    const years = Object.keys(annualInputByYear)
      .map((year) => Number(year))
      .filter((year) => Number.isInteger(year))
      .sort((a, b) => a - b);
    if (!years.length) return null;
    for (let index = 1; index < years.length; index += 1) {
      if (years[index] !== years[index - 1] + 1) return null;
    }
    return {
      startYear: years[0],
      endYear: years[years.length - 1],
      count: years.length
    };
  }

  function parseYearRangeFromLabel(label) {
    const match = String(label || "").match(/(?:^|[^0-9])(\d{4})-(\d{4})(?:[^0-9]|$)/);
    if (!match) return null;
    const startYear = Number(match[1]);
    const endYear = Number(match[2]);
    if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear < startYear) return null;
    return {
      startYear,
      endYear,
      count: endYear - startYear + 1
    };
  }

  function deriveEnergyModeFromInputs(energyData) {
    if (energyData.typicalCurveSource === "province_typical_curve" && hasNonEmptyObject(energyData.annualInputByYear)) {
      return "province_typical_curve";
    }
    if (energyData.typicalCurveSource === "typical_curve_8760" && hasNonEmptyObject(energyData.annualInputByYear)) {
      return "typical_curve_8760";
    }
    if (hasNonEmptyObject(energyData.annualInputByYear)) {
      return "annual_hours";
    }
    return projectModel.normalizeEnergyMode(energyData.mode);
  }

  function rebuildProjectEnergyData(project) {
    const energyData = ensureProjectEnergyDataState(project);
    const hourlyByYear = {};
    const annualSummary = {};
    const forecastYears = Number.isInteger(project?.forecastYears) && project.forecastYears > 0 ? project.forecastYears : 0;
    const typicalCurveReady = hasStoredEnergyTypicalCurve(energyData);

    for (let offset = 0; offset < forecastYears; offset += 1) {
      const year = project.startYear + offset;
      const annualHours = Number(energyData.annualInputByYear?.[year]);
      if (!Number.isFinite(annualHours) || annualHours <= 0) {
        annualSummary[year] = { annualHours: 0, energyMwh: 0, status: "缺失" };
        continue;
      }
      if (!typicalCurveReady) {
        annualSummary[year] = {
          annualHours,
          energyMwh: annualHours * project.capacityMw,
          status: "待典型曲线"
        };
        continue;
      }
      const hourlyValues = energyData.typicalCurveProfile.map((weight) => annualHours * weight);
      hourlyByYear[year] = hourlyValues;
      annualSummary[year] = {
        annualHours,
        energyMwh: annualHours * project.capacityMw,
        status: "完整"
      };
    }

    energyData.hourlyByYear = hourlyByYear;
    energyData.annualSummary = annualSummary;
    energyData.mode = deriveEnergyModeFromInputs(energyData);
    project.energyMode = energyData.mode;
  }

  function getHourlyEnergyForCalculation(project, year, yearIndex, options = {}) {
    const energyData = ensureProjectEnergyDataState(project);
    const existing = energyData.hourlyByYear?.[year];
    if (Array.isArray(existing) && existing.length === 8760) {
      return existing;
    }

    const annualFromInput = Number(energyData.annualInputByYear?.[year]);
    const annualFromSummary = Number(energyData.annualSummary?.[year]?.annualHours);
    const fallbackAnnualHours = typeof options.defaultAnnualEquivalentHours === "function"
      ? options.defaultAnnualEquivalentHours(project, yearIndex - 1)
      : 0;
    const annualHours = Number.isFinite(annualFromInput) && annualFromInput > 0
      ? annualFromInput
      : (Number.isFinite(annualFromSummary) && annualFromSummary > 0
        ? annualFromSummary
        : fallbackAnnualHours);

    const profile = energyProfiles.normalizeTypicalCurveProfile(energyData.typicalCurveProfile);
    const hourlyValues = profile.length === 8760
      ? profile.map((weight) => annualHours * weight)
      : energyProfiles.generateHourlyHoursFromAnnual(annualHours, project.assetType, project.startYear + yearIndex);

    if (hourlyValues.length !== 8760) return [];
    energyData.annualInputByYear[year] = Number(annualHours.toFixed(2));
    energyData.hourlyByYear[year] = hourlyValues;
    energyData.annualSummary[year] = {
      annualHours,
      energyMwh: annualHours * project.capacityMw,
      status: "完整"
    };
    project.energyMode = energyData.mode;
    return hourlyValues;
  }

  function ensureAnnualEnergyInputsForCalculation(project, options = {}) {
    if (!project || !Number.isInteger(project.startYear) || !Number.isInteger(project.forecastYears) || project.forecastYears < 1) {
      return false;
    }
    const energyData = ensureProjectEnergyDataState(project);
    const defaultAnnualEquivalentHours = typeof options.defaultAnnualEquivalentHours === "function"
      ? options.defaultAnnualEquivalentHours
      : () => 0;
    let changed = false;
    for (let offset = 0; offset < project.forecastYears; offset += 1) {
      const year = project.startYear + offset;
      const value = Number(energyData.annualInputByYear?.[year]);
      if (Number.isFinite(value) && value > 0) continue;
      energyData.annualInputByYear[year] = Number(defaultAnnualEquivalentHours(project, offset).toFixed(2));
      changed = true;
    }
    return changed;
  }

  function prepareHourlyEnergyForCalculation(project, options = {}) {
    if (!project || !Number.isInteger(project.startYear) || !Number.isInteger(project.forecastYears) || project.forecastYears < 1) {
      return { changed: false, completed: 0, total: 0, defaultAnnualFilled: false };
    }
    const before = getCompleteEnergyYears(project).length;
    const total = project.forecastYears;
    if (before === total) {
      return { changed: false, completed: before, total, defaultAnnualFilled: false };
    }

    const defaultAnnualFilled = ensureAnnualEnergyInputsForCalculation(project, options);
    const energyData = ensureProjectEnergyDataState(project);
    let nextEnergyStep2Choice = "";
    if (!hasStoredEnergyTypicalCurve(energyData)) {
      const curveRecord = options.getProvinceTypicalCurveRecord?.(project);
      if (!curveRecord?.profile?.length) {
        return { changed: defaultAnnualFilled, completed: before, total, defaultAnnualFilled };
      }
      energyData.typicalCurveProfile = curveRecord.profile;
      energyData.typicalCurveSource = "province_typical_curve";
      nextEnergyStep2Choice = "province";
    }

    rebuildProjectEnergyData(project);
    const completed = getCompleteEnergyYears(project).length;
    if (!isPlainObject(project.statuses)) project.statuses = {};
    project.statuses["energy-page"] = completed === total ? "completed" : "in_progress";
    return {
      changed: completed !== before || defaultAnnualFilled,
      completed,
      total,
      defaultAnnualFilled,
      nextEnergyStep2Choice
    };
  }

  function ensureProjectEnergyDataDerivedState(project) {
    const energyData = ensureProjectEnergyDataState(project);
    if (!project || !Number.isInteger(project.startYear) || !Number.isInteger(project.forecastYears) || project.forecastYears <= 0) {
      return energyData;
    }

    const hasCurve = hasStoredEnergyTypicalCurve(energyData);
    let needsRebuild = false;

    for (let i = 0; i < project.forecastYears; i += 1) {
      const year = project.startYear + i;
      const annualHours = Number(energyData.annualInputByYear?.[year]);
      const summary = energyData.annualSummary?.[year];
      const hourlyValues = energyData.hourlyByYear?.[year];

      if (!Number.isFinite(annualHours) || annualHours <= 0) {
        if (summary?.status && summary.status !== "缺失") {
          needsRebuild = true;
          break;
        }
        continue;
      }

      if (!hasCurve) {
        if (
          summary?.status !== "待典型曲线"
          || !Number.isFinite(Number(summary?.annualHours))
          || Math.abs(Number(summary?.annualHours) - annualHours) > 1e-6
        ) {
          needsRebuild = true;
          break;
        }
        continue;
      }

      if (
        summary?.status !== "完整"
        || !Array.isArray(hourlyValues)
        || hourlyValues.length !== 8760
        || !Number.isFinite(Number(summary?.annualHours))
        || Math.abs(Number(summary?.annualHours) - annualHours) > 1e-6
      ) {
        needsRebuild = true;
        break;
      }
    }

    if (needsRebuild) {
      rebuildProjectEnergyData(project);
      return ensureProjectEnergyDataState(project);
    }
    return energyData;
  }

  function detectEnergyModeByHeader(headerRow) {
    const actualHeader = csvUtils.normalizeCsvHeaderRow(headerRow);
    if (!actualHeader) return null;
    for (const mode of ENERGY_MODE_SET) {
      const expectedHeader = csvUtils.normalizeCsvHeaderRow(getEnergyModeMeta(mode).header.split(","));
      if (actualHeader === expectedHeader) {
        return mode;
      }
    }
    return null;
  }

  function buildEnergyTemplateRows(project, mode = "hourly_8760") {
    const normalizedMode = projectModel.normalizeEnergyMode(mode);
    const startYear = Number(project?.startYear);
    const forecastYears = Number(project?.forecastYears);
    const rows = [];

    if (normalizedMode === "annual_hours") {
      rows.push(["year", "annual_hours_h"]);
      for (let i = 0; i < forecastYears; i += 1) {
        rows.push([startYear + i, ""]);
      }
      return rows;
    }

    if (normalizedMode === "typical_curve_8760") {
      rows.push(["hour_index", "equivalent_hours_h"]);
      for (let hour = 1; hour <= 8760; hour += 1) {
        rows.push([hour, ""]);
      }
      return rows;
    }

    rows.push(["year", "hour_index", "equivalent_hours_h"]);
    for (let i = 0; i < forecastYears; i += 1) {
      const year = startYear + i;
      for (let hour = 1; hour <= 8760; hour += 1) {
        rows.push([year, hour, ""]);
      }
    }
    return rows;
  }

  function validateAndBuildEnergyData(project, csvText, expectedMode = null) {
    const rows = csvUtils.parseCsvRows(csvText);
    const startYear = Number(project?.startYear);
    const forecastYears = Number(project?.forecastYears);
    const capacityMw = Number(project?.capacityMw);
    const endYear = startYear + forecastYears - 1;
    const yearRange = `${startYear}-${endYear}`;

    if (!rows.length) return { ok: false, message: "没有检测到文件内容，请上传模板文件后重试。" };
    if (!Number.isInteger(startYear) || !Number.isInteger(forecastYears) || forecastYears <= 0) {
      return { ok: false, message: "项目测算周期无效，请先完成项目基础信息。" };
    }

    const normalizedMode = detectEnergyModeByHeader(rows[0]);
    if (!normalizedMode) {
      const actualHeader = Array.isArray(rows[0]) ? rows[0].join(",") : "";
      return {
        ok: false,
        message: `表头不匹配。识别到：${actualHeader || "(空)"}；请使用：${getEnergyModeMeta("annual_hours").header} 或 ${getEnergyModeMeta("typical_curve_8760").header}`
      };
    }
    if (expectedMode && normalizedMode !== expectedMode) {
      return {
        ok: false,
        message: `当前上传文件与本行模板不匹配。请上传「${getEnergyModeMeta(expectedMode).label}」对应文件。`
      };
    }

    const rangeYears = new Set(
      Array.from({ length: forecastYears }, (_, idx) => startYear + idx)
    );
    const hourlyByYear = {};
    const annualInputByYear = {};

    if (normalizedMode === "hourly_8760") {
      for (let i = 1; i < rows.length; i += 1) {
        const [yearRaw, hourRaw, hoursRaw] = rows[i];
        const year = Number(yearRaw);
        const hourIndex = Number(hourRaw);
        const hours = Number(hoursRaw);
        if (!Number.isInteger(year) || !rangeYears.has(year)) {
          return { ok: false, message: `第 ${i + 1} 行第1列（year）无效：${yearRaw || "(空)"}。要求范围 ${yearRange}。` };
        }
        if (!Number.isInteger(hourIndex) || hourIndex < 1 || hourIndex > 8760) {
          return { ok: false, message: `第 ${i + 1} 行第2列（hour_index）无效：${hourRaw || "(空)"}。要求 1-8760。` };
        }
        if (hoursRaw === undefined || String(hoursRaw).trim() === "" || !Number.isFinite(hours) || hours < 0) {
          return { ok: false, message: `第 ${i + 1} 行第3列（equivalent_hours_h）无效：${hoursRaw || "(空)"}。要求 >=0 数值。` };
        }
        if (!hourlyByYear[year]) hourlyByYear[year] = Array(8760).fill(null);
        if (hourlyByYear[year][hourIndex - 1] !== null) {
          return { ok: false, message: `第 ${i + 1} 行第2列（hour_index）重复：${hourIndex}。` };
        }
        hourlyByYear[year][hourIndex - 1] = hours;
      }
      for (const [yearText, arr] of Object.entries(hourlyByYear)) {
        const missingIndex = arr.findIndex((value) => value === null);
        if (missingIndex >= 0) {
          return { ok: false, message: `${yearText} 年缺少第 ${missingIndex + 1} 小时数据（需完整8760点）。` };
        }
        annualInputByYear[yearText] = arr.reduce((sum, value) => sum + value, 0);
      }
    } else if (normalizedMode === "annual_hours") {
      const seen = new Set();
      for (let i = 1; i < rows.length; i += 1) {
        const [yearRaw, annualHoursRaw] = rows[i];
        const year = Number(yearRaw);
        const annualHours = Number(annualHoursRaw);
        if (!Number.isInteger(year) || !rangeYears.has(year)) {
          return { ok: false, message: `第 ${i + 1} 行第1列（year）无效：${yearRaw || "(空)"}。要求范围 ${yearRange}。` };
        }
        if (seen.has(year)) {
          return { ok: false, message: `第 ${i + 1} 行第1列（year）重复：${year}。` };
        }
        if (!Number.isFinite(annualHours) || annualHours <= 0) {
          return { ok: false, message: `第 ${i + 1} 行第2列（annual_hours_h）无效：${annualHoursRaw || "(空)"}。要求 >0 数值。` };
        }
        seen.add(year);
        annualInputByYear[year] = annualHours;
      }
      return {
        ok: true,
        mode: normalizedMode,
        annualInputByYear
      };
    } else if (normalizedMode === "typical_curve_8760") {
      const values = Array(8760).fill(null);
      for (let i = 1; i < rows.length; i += 1) {
        const [hourRaw, hoursRaw] = rows[i];
        const hourIndex = Number(hourRaw);
        const hours = Number(hoursRaw);
        if (!Number.isInteger(hourIndex) || hourIndex < 1 || hourIndex > 8760) {
          return { ok: false, message: `第 ${i + 1} 行第1列（hour_index）无效：${hourRaw || "(空)"}。要求 1-8760。` };
        }
        if (hoursRaw === undefined || String(hoursRaw).trim() === "" || !Number.isFinite(hours) || hours < 0) {
          return { ok: false, message: `第 ${i + 1} 行第2列（equivalent_hours_h）无效：${hoursRaw || "(空)"}。要求 >=0 数值。` };
        }
        if (values[hourIndex - 1] !== null) {
          return { ok: false, message: `第 ${i + 1} 行第1列（hour_index）重复：${hourIndex}。` };
        }
        values[hourIndex - 1] = hours;
      }
      const missingIndex = values.findIndex((value) => value === null);
      if (missingIndex >= 0) {
        return { ok: false, message: `典型年8760模板缺少第 ${missingIndex + 1} 小时数据（需完整8760点）。` };
      }
      const typicalCurveProfile = energyProfiles.normalizeTypicalCurveProfile(values);
      if (!typicalCurveProfile.length) {
        return { ok: false, message: "典型年8760模板无有效小时曲线，请检查数据是否均为非负数且总量大于0。" };
      }
      return {
        ok: true,
        mode: normalizedMode,
        typicalCurveProfile
      };
    }

    const annualSummary = {};
    let completeYears = 0;
    const missingYears = [];
    for (let i = 0; i < forecastYears; i += 1) {
      const year = startYear + i;
      const values = hourlyByYear[year];
      if (!values) {
        annualSummary[year] = { annualHours: 0, energyMwh: 0, status: "缺失" };
        missingYears.push(year);
        continue;
      }
      const annualHours = values.reduce((sum, value) => sum + value, 0);
      annualSummary[year] = {
        annualHours,
        energyMwh: annualHours * capacityMw,
        status: "完整"
      };
      completeYears += 1;
    }

    return {
      ok: true,
      mode: normalizedMode,
      hourlyByYear,
      annualSummary,
      annualInputByYear,
      completeYears,
      missingYears
    };
  }

  return Object.freeze({
    ENERGY_MODE_META,
    getEnergyModeMeta,
    ensureProjectEnergyDataState,
    ensureProjectEnergyDataDerivedState,
    createProvinceTypicalCurveMockRecord,
    hasStoredEnergyTypicalCurve,
    hasEnergyTypicalCurve,
    getProvinceTypicalCurveRecordKey,
    getCompleteEnergyYears,
    getAnnualInputYearCount,
    getContiguousAnnualInputPeriod,
    parseYearRangeFromLabel,
    deriveEnergyModeFromInputs,
    rebuildProjectEnergyData,
    getHourlyEnergyForCalculation,
    ensureAnnualEnergyInputsForCalculation,
    prepareHourlyEnergyForCalculation,
    detectEnergyModeByHeader,
    buildEnergyTemplateRows,
    validateAndBuildEnergyData
  });
});
