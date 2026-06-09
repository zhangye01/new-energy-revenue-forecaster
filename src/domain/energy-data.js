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
        if (!Number.isFinite(hours) || hours < 0) {
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
        if (!Number.isFinite(hours) || hours < 0) {
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
    hasStoredEnergyTypicalCurve,
    hasEnergyTypicalCurve,
    deriveEnergyModeFromInputs,
    rebuildProjectEnergyData,
    detectEnergyModeByHeader,
    buildEnergyTemplateRows,
    validateAndBuildEnergyData
  });
});
