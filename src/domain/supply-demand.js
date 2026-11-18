"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_SUPPLY_DEMAND = api;
  if (root.window && root.window !== root) root.window.NE_SUPPLY_DEMAND = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const MONTH_DAYS = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  const ELEMENTS = Object.freeze([
    { key: "load", label: "省内负荷" }, { key: "tieLine", label: "联络线负荷" },
    { key: "wind", label: "风电出力" }, { key: "solar", label: "光伏出力" },
    { key: "hydro", label: "水电出力" }, { key: "nonMarket", label: "非市场化出力" }
  ].map(Object.freeze));
  const VALUE_KEYS = Object.freeze([...ELEMENTS.map((item) => item.key), "residualDemand", "tieLineExport", "tieLineImport"]);
  const MAX_FORECAST_YEARS = 30;
  const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

  function validPeriod(project) {
    return Number.isInteger(project?.startYear) && project.startYear >= 1 && project.startYear <= 9999
      && Number.isInteger(project?.forecastYears) && project.forecastYears >= 1 && project.forecastYears <= MAX_FORECAST_YEARS
      && project.startYear + project.forecastYears - 1 <= 9999;
  }

  function createSeries(project) {
    const growthRatesByYear = {};
    if (validPeriod(project)) {
      for (let index = 1; index < project.forecastYears; index += 1) growthRatesByYear[project.startYear + index] = null;
    }
    return {
      baseEnergyMwh: null, growthRatesByYear, monthlyWeights: Array(12).fill(null),
      hourlyWeightsByMonth: Object.fromEntries(MONTH_DAYS.map((_, index) => [index + 1, Array(24).fill(null)]))
    };
  }

  function createConfig(project = {}) {
    const elements = Object.fromEntries(ELEMENTS.map(({ key }) => [key, createSeries(project)]));
    elements.tieLine = { ...elements.tieLine, mode: "net", export: createSeries(project), import: createSeries(project) };
    return { version: 1, startYear: project.startYear ?? null, forecastYears: project.forecastYears ?? null, elements };
  }

  function sum(values) {
    let total = 0, compensation = 0;
    for (const value of values) {
      const adjusted = value - compensation, next = total + adjusted;
      compensation = (next - total) - adjusted;
      total = next;
    }
    return total;
  }

  function normalizedWeights(values) {
    const maximum = Math.max(...values);
    if (!(maximum > 0)) return values.map(() => 0);
    const scaled = values.map((value) => value / maximum), total = sum(scaled);
    return scaled.map((value) => value / total);
  }

  function annualValues(project, series) {
    const values = [series.baseEnergyMwh];
    for (let index = 1; index < project.forecastYears; index += 1) {
      const rate = series.growthRatesByYear[project.startYear + index];
      values.push(values[index - 1] * (1 + rate / 100));
    }
    return values;
  }

  function validateWeights(values, count, label, errors) {
    if (!Array.isArray(values) || values.length !== count || Array.from(values).some((value) => !isNumber(value) || value < 0)) {
      errors.push(`${label}须填写${count}个非负有限数字；缺项不能自动补0。`);
      return false;
    }
    if (!values.some((value) => value > 0)) {
      errors.push(`${label}合计必须大于0。`);
      return false;
    }
    return true;
  }

  function validateSeries(project, series, label, signed, errors) {
    if (!isObject(series)) { errors.push(`${label}尚未配置。`); return; }
    const baseValid = isNumber(series.baseEnergyMwh) && (signed || series.baseEnergyMwh >= 0);
    if (!baseValid) errors.push(`${label}首年电量须填写${signed ? "可正可负的" : "非负的"}有限数字，无该项请明确填写0。`);
    let growthValid = true;
    for (let index = 1; index < project.forecastYears; index += 1) {
      const year = project.startYear + index, value = series.growthRatesByYear?.[year];
      if (!isObject(series.growthRatesByYear) || !isNumber(value) || value < -100) {
        errors.push(`${label}${year}年增长率须明确填写有限数字，不能低于-100%。`);
        growthValid = false;
      }
    }
    if (baseValid && growthValid && annualValues(project, series).some((value) => !Number.isFinite(value))) {
      errors.push(`${label}年度电量计算超出有限数值范围，请核对起点值与增长率。`);
    }
    // Zero remains zero under the specified multiplicative growth model. Its unused
    // curves may stay blank and are never normalized back into the stored input.
    if (!baseValid || series.baseEnergyMwh === 0) return;
    if (!validateWeights(series.monthlyWeights, 12, `${label}分月权重`, errors)) return;
    series.monthlyWeights.forEach((weight, index) => {
      if (weight > 0) validateWeights(series.hourlyWeightsByMonth?.[index + 1], 24, `${label}${index + 1}月24小时权重`, errors);
    });
  }

  function activeSeries(config) {
    const entries = ELEMENTS.filter(({ key }) => key !== "tieLine")
      .map(({ key, label }) => ({ key, label, series: config.elements[key], signed: false }));
    const tie = config.elements.tieLine;
    if (tie.mode === "bidirectional") {
      entries.push({ key: "tieLineExport", label: "联络线送出", series: tie.export, signed: false });
      entries.push({ key: "tieLineImport", label: "联络线受入", series: tie.import, signed: false });
    } else entries.push({ key: "tieLine", label: "联络线负荷", series: tie, signed: true });
    return entries;
  }

  function validateConfig(project, config) {
    const errors = [];
    if (!validPeriod(project)) return ["请先设置有效的项目测算周期（1至30年、有效起始年份）。"];
    if (!isObject(config) || config.version !== 1 || !isObject(config.elements)) return ["供需配置缺失或版本不支持，请先填写供需输入。"];
    if (config.startYear !== project.startYear || config.forecastYears !== project.forecastYears) {
      return ["项目测算周期已变化，请重新核对首年电量、逐年增长率及曲线后保存供需配置。"];
    }
    if (!isObject(config.elements.tieLine) || !["net", "bidirectional"].includes(config.elements.tieLine.mode)) {
      return ["请选择有效的联络线配置方式（净额或双向送受）。"];
    }
    const entries = activeSeries(config);
    entries.forEach(({ series, label, signed }) => validateSeries(project, series, label, signed, errors));
    if (!errors.length) {
      const totals = entries.map(({ series }) => annualValues(project, series));
      for (let index = 0; index < project.forecastYears; index += 1) {
        if (!Number.isFinite(sum(totals.map((values) => Math.abs(values[index]))))) {
          errors.push(`${project.startYear + index}年供需合计超出有限数值范围，请检查年度电量。`);
        }
      }
    }
    return errors;
  }

  function stableStringify(value, ancestors = new Set()) {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value !== "object") return JSON.stringify(value);
    if (ancestors.has(value)) throw new Error("供需配置不能包含循环引用。");
    ancestors.add(value);
    const result = Array.isArray(value)
      ? `[${Array.from(value, (item) => stableStringify(item, ancestors)).join(",")}]`
      : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key], ancestors)}`).join(",")}}`;
    ancestors.delete(value);
    return result;
  }

  function fingerprint(project, config) {
    const value = stableStringify({ version: 1, projectId: project?.id ?? null, province: project?.province ?? null,
      startYear: project?.startYear ?? null, forecastYears: project?.forecastYears ?? null, config });
    let first = 2166136261, second = 5381;
    for (let index = 0; index < value.length; index += 1) {
      first = Math.imul(first ^ value.charCodeAt(index), 16777619);
      second = Math.imul(second, 33) ^ value.charCodeAt(index);
    }
    return `supply-v1-${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}-${value.length}`;
  }

  function compileSeries(project, series) {
    const annual = annualValues(project, series);
    if (series.baseEnergyMwh === 0) return { annual, monthly: Array(12).fill(0), hourly: MONTH_DAYS.map(() => Array(24).fill(0)) };
    const monthly = normalizedWeights(series.monthlyWeights);
    return { annual, monthly, hourly: monthly.map((weight, index) => weight > 0
      ? normalizedWeights(series.hourlyWeightsByMonth[index + 1]) : Array(24).fill(0)) };
  }

  function deriveValues(values, bidirectional) {
    if (bidirectional) values.tieLine = values.tieLineExport - values.tieLineImport;
    else { values.tieLineExport = Math.max(0, values.tieLine); values.tieLineImport = Math.max(0, -values.tieLine); }
    values.residualDemand = values.load + values.tieLine - values.wind - values.solar - values.hydro - values.nonMarket;
    return values;
  }

  function annualRowsForConfig(project, config) {
    const entries = activeSeries(config).map(({ key, series }) => ({ key, annual: annualValues(project, series) }));
    const bidirectional = config.elements.tieLine.mode === "bidirectional";
    return Array.from({ length: project.forecastYears }, (_, index) => ({
      year: project.startYear + index,
      ...deriveValues(Object.fromEntries(entries.map(({ key, annual }) => [key, annual[index]])), bidirectional)
    }));
  }

  // Used when checking many saved runs during rendering. It never allocates
  // typical-day or 8760-hour arrays, and shares the dataset's annual calculation.
  function buildAnnualSummary(project, config) {
    const errors = validateConfig(project, config);
    return { ok: errors.length === 0, errors, annualRows: errors.length ? [] : annualRowsForConfig(project, config) };
  }

  function conserved(actual, expected, arithmeticScale) {
    // Net exchange and residual demand may cancel large independent flows. Their
    // roundoff bound must use those operands, even when the expected net is zero.
    return Number.isFinite(actual) && Math.abs(actual - expected)
      <= Math.max(1e-6, Math.abs(expected) * 1e-9, arithmeticScale * Number.EPSILON * 32);
  }

  function failed(errors) {
    return { ok: false, errors, fingerprint: "", annualRows: [], typicalRows: [], hourlyByYear: {}, source: null };
  }

  function buildDataset(project, config) {
    const errors = validateConfig(project, config);
    if (errors.length) return failed(errors);
    const entries = activeSeries(config).map((entry) => ({ key: entry.key, ...compileSeries(project, entry.series) }));
    const bidirectional = config.elements.tieLine.mode === "bidirectional";
    const annualRows = annualRowsForConfig(project, config), typicalRows = [], hourlyByYear = {};
    for (let index = 0; index < project.forecastYears; index += 1) {
      const year = project.startYear + index;
      const annual = annualRows[index];
      const hourly = Object.fromEntries(VALUE_KEYS.map((key) => [key, []]));
      const yearlyTypical = [];
      MONTH_DAYS.forEach((days, monthIndex) => {
        const monthRows = Array.from({ length: 24 }, (_, hour) => {
          const values = Object.fromEntries(entries.map((entry) => [entry.key,
            entry.annual[index] * entry.monthly[monthIndex] / days * entry.hourly[monthIndex][hour]]));
          return { year, month: monthIndex + 1, hour, representedDays: days, ...deriveValues(values, bidirectional) };
        });
        yearlyTypical.push(...monthRows);
        for (let day = 0; day < days; day += 1) {
          monthRows.forEach((row) => VALUE_KEYS.forEach((key) => hourly[key].push(row[key])));
        }
      });
      const absoluteInputTotal = sum(entries.map((entry) => Math.abs(entry.annual[index])));
      for (const key of VALUE_KEYS) {
        const arithmeticScale = key === "residualDemand" ? absoluteInputTotal
          : key === "tieLine" ? annual.tieLineExport + annual.tieLineImport : Math.abs(annual[key]);
        if (!hourly[key].every(Number.isFinite) || !conserved(sum(hourly[key]), annual[key], arithmeticScale)
            || !conserved(sum(yearlyTypical.map((row) => row[key] * row.representedDays)), annual[key], arithmeticScale)) {
          return failed([`${year}年${key}小时数据未通过电量守恒校验，请核对输入数值范围。`]);
        }
      }
      typicalRows.push(...yearlyTypical);
      hourlyByYear[year] = hourly;
    }
    const inputFingerprint = fingerprint(project, config);
    return { ok: true, errors: [], fingerprint: inputFingerprint, annualRows, typicalRows, hourlyByYear,
      source: { version: 1, inputFingerprint, projectId: project.id ?? null, province: project.province ?? null,
        startYear: project.startYear, forecastYears: project.forecastYears, calendar: "fixed_365_days", daysPerYear: 365,
        hoursPerYear: 8760, monthDays: [...MONTH_DAYS], typicalHoursPerYear: 288, hourIndexBase: 1, hourOfDayBase: 0,
        intervalHours: 1, energyUnit: "MWh", averagePowerUnit: "MW", typicalDayExpansion: true,
        tieLinePositiveDirection: "export", tieLineNegativeDirection: "import",
        curveReuse: "same_monthly_and_hourly_weights_across_years" } };
  }

  function csvRows(dataset, kind) {
    if (!dataset?.ok) return [];
    const headers = ["load_mwh", "tie_line_net_mwh", "wind_mwh", "solar_mwh", "hydro_mwh", "non_market_mwh", "residual_demand_mwh", "tie_line_export_mwh", "tie_line_import_mwh"];
    if (kind === "annual") return [["year", ...headers], ...dataset.annualRows.map((row) => [row.year, ...VALUE_KEYS.map((key) => row[key])])];
    if (kind === "typical") return [["year", "month", "hour", "represented_days", ...headers],
      ...dataset.typicalRows.map((row) => [row.year, row.month, row.hour, row.representedDays, ...VALUE_KEYS.map((key) => row[key])])];
    if (kind !== "hourly") throw new Error("供需导出类型无效。");
    const rows = [["year", "month", "day", "hour", "hour_index", ...headers]];
    dataset.annualRows.forEach(({ year }) => {
      const hourly = dataset.hourlyByYear[year];
      let index = 0;
      MONTH_DAYS.forEach((days, monthIndex) => {
        for (let day = 1; day <= days; day += 1) {
          for (let hour = 0; hour < 24; hour += 1) {
            rows.push([year, monthIndex + 1, day, hour, index + 1, ...VALUE_KEYS.map((key) => hourly[key][index])]);
            index += 1;
          }
        }
      });
    });
    return rows;
  }

  return Object.freeze({ ELEMENTS, MONTH_DAYS, MAX_FORECAST_YEARS, createSeries, createConfig, validateConfig, fingerprint, buildAnnualSummary, buildDataset, csvRows });
});
