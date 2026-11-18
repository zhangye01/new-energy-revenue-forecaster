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
  const SHARE_TOLERANCE = 1e-6;
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

  function carryShareVector(values, count, legacy) {
    if (!Array.isArray(values) || values.length !== count) return Array(count).fill(null);
    const copy = Array.from(values);
    if (!legacy || !copy.every((value) => isNumber(value) && value >= 0)) return copy;
    return copy.some((value) => value > 0) ? normalizedWeights(copy) : Array(count).fill(null);
  }

  function carryShareSeries(target, source, previous, project) {
    if (!isObject(source)) return;
    if (previous.startYear === project.startYear && isNumber(source.baseEnergyMwh)) target.baseEnergyMwh = source.baseEnergyMwh;
    if (validPeriod(previous)) {
      const firstYear = previous.startYear;
      const lastYear = firstYear + previous.forecastYears - 1;
      for (const year of Object.keys(target.growthRatesByYear)) {
        const value = source.growthRatesByYear?.[year];
        if (Number(year) > firstYear && Number(year) <= lastYear && isNumber(value)) target.growthRatesByYear[year] = value;
      }
    }
    const legacy = previous.version === 1;
    target.monthlyWeights = carryShareVector(source.monthlyWeights, 12, legacy);
    for (const month of Object.keys(target.hourlyWeightsByMonth)) {
      target.hourlyWeightsByMonth[month] = carryShareVector(source.hourlyWeightsByMonth?.[month], 24, legacy);
    }
    if (legacy || !validPeriod(project) || !isObject(source.curveOverridesByYear)) return;
    const overrides = Object.entries(source.curveOverridesByYear).filter(([year]) => inPeriod(project, year));
    if (overrides.length) target.curveOverridesByYear = JSON.parse(JSON.stringify(Object.fromEntries(overrides)));
  }

  function completeEditableSeries(project, series) {
    if (!isObject(series)) return createSeries(project);
    if (!isObject(series.growthRatesByYear)) series.growthRatesByYear = createSeries(project).growthRatesByYear;
    if (!Array.isArray(series.monthlyWeights)) series.monthlyWeights = Array(12).fill(null);
    if (!isObject(series.hourlyWeightsByMonth)) series.hourlyWeightsByMonth = {};
    return series;
  }

  // Keep saved v1 results and fingerprints as recorded. Convert weights into
  // shares only when a caller opens an editable copy under the new contract.
  function prepareShareConfig(project, config) {
    const target = createConfig(project);
    target.version = 2;
    if (!isObject(config?.elements) || ![1, 2].includes(config.version)) return target;
    if (config.version === 2 && config.startYear === target.startYear && config.forecastYears === target.forecastYears) {
      const editable = JSON.parse(JSON.stringify(config));
      for (const { key } of ELEMENTS) editable.elements[key] = completeEditableSeries(project, editable.elements[key]);
      const tie = editable.elements.tieLine;
      tie.mode = tie.mode === "bidirectional" ? "bidirectional" : "net";
      for (const direction of ["export", "import"]) tie[direction] = completeEditableSeries(project, tie[direction]);
      return editable;
    }
    for (const { key } of ELEMENTS) carryShareSeries(target.elements[key], config.elements[key], config, project);
    const tie = config.elements.tieLine;
    if (tie?.mode === "bidirectional") target.elements.tieLine.mode = tie.mode;
    for (const direction of ["export", "import"]) carryShareSeries(target.elements.tieLine[direction], tie?.[direction], config, project);
    return target;
  }

  function getCurve(series, year = null) {
    const selected = year === null ? null : series?.curveOverridesByYear?.[year];
    const monthlyWeights = selected?.monthlyWeights ?? series?.monthlyWeights ?? [];
    const defaults = series?.hourlyWeightsByMonth ?? {};
    const hourlyWeightsByMonth = selected?.hourlyWeightsByMonth ? { ...defaults, ...selected.hourlyWeightsByMonth } : defaults;
    return { monthlyWeights, hourlyWeightsByMonth };
  }

  function validateShares(values, count, label) {
    if (!Array.isArray(values) || values.length !== count || Array.from(values).some((value) => !isNumber(value) || value < 0 || value > 1)) {
      return `${label}须填写${count}个0至1之间的占比。`;
    }
    return Math.abs(sum(values) - 1) > SHARE_TOLERANCE ? `${label}的占比合计须为1（100%）。` : "";
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

  function inPeriod(project, key) {
    const year = Number(key);
    return String(year) === key && Number.isInteger(year) && year >= project.startYear && year < project.startYear + project.forecastYears;
  }

  function validMonth(key) {
    const month = Number(key);
    return String(month) === key && Number.isInteger(month) && month >= 1 && month <= 12;
  }

  function hasShareValues(values, count) {
    return values !== undefined && (!Array.isArray(values) || values.length !== count || values.some((value) => value != null));
  }

  function validateShareCurves(project, series, label, required, errors) {
    const { monthlyWeights, hourlyWeightsByMonth, curveOverridesByYear } = series;
    const add = (message) => { if (message) errors.push(message); };
    const verifyHours = (rows, heading, sparse = false) => {
      if (rows === undefined) return;
      if (!isObject(rows)) { add(`${heading}分时占比须按月份配置。`); return; }
      for (const [month, values] of Object.entries(rows)) {
        if (!validMonth(month)) add(`${heading}分时占比月份须为1至12。`);
        else if (sparse || hasShareValues(values, 24)) add(validateShares(values, 24, `${heading}${month}月24小时占比`));
      }
    };
    // Check each stored vector once. Reusing the default over many years does
    // not expand the curves when only annual rows are needed for forecast status.
    const defaultError = required || hasShareValues(monthlyWeights, 12) ? validateShares(monthlyWeights, 12, `${label}默认分月占比`) : "";
    add(defaultError);
    verifyHours(hourlyWeightsByMonth, `${label}默认`);
    const requireHours = (monthly, hourly, heading) => {
      if (!required || !Array.isArray(monthly)) return;
      monthly.forEach((value, index) => {
        if (value > 0 && !hasShareValues(hourly?.[index + 1], 24)) {
          add(`${heading}${index + 1}月24小时占比须填写24个0至1之间的占比。`);
        }
      });
    };
    if (!defaultError) requireHours(monthlyWeights, hourlyWeightsByMonth, `${label}默认`);
    if (curveOverridesByYear === undefined) return;
    if (!isObject(curveOverridesByYear)) { add(`${label}年度曲线须按测算年份配置。`); return; }
    for (const [year, override] of Object.entries(curveOverridesByYear)) {
      if (!inPeriod(project, year) || !isObject(override)) { add(`${label}${year}年度曲线无效或超出测算周期。`); continue; }
      const heading = `${label}${year}年`;
      verifyHours(override.hourlyWeightsByMonth, heading, true);
      if (!Object.hasOwn(override, "monthlyWeights")) continue;
      const message = validateShares(override.monthlyWeights, 12, `${heading}分月占比`);
      add(message);
      if (!message) {
        const { hourlyWeightsByMonth: effectiveHours } = getCurve(series, year);
        requireHours(override.monthlyWeights, effectiveHours, heading);
      }
    }
  }

  function validateSeries(project, series, label, signed, errors, strictShares) {
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
    if (strictShares) {
      validateShareCurves(project, series, label, baseValid && series.baseEnergyMwh !== 0, errors);
      return;
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
    if (!isObject(config) || ![1, 2].includes(config.version) || !isObject(config.elements)) return ["供需配置缺失或版本不支持，请先填写供需输入。"];
    if (config.startYear !== project.startYear || config.forecastYears !== project.forecastYears) {
      return ["项目测算周期已变化，请重新核对首年电量、逐年增长率及曲线后保存供需配置。"];
    }
    if (!isObject(config.elements.tieLine) || !["net", "bidirectional"].includes(config.elements.tieLine.mode)) {
      return ["请选择有效的联络线配置方式（净额或双向送受）。"];
    }
    const entries = activeSeries(config);
    entries.forEach(({ series, label, signed }) => validateSeries(project, series, label, signed, errors, config.version === 2));
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
    const version = config?.version === 2 ? 2 : 1;
    const value = stableStringify({ version, projectId: project?.id ?? null, province: project?.province ?? null,
      startYear: project?.startYear ?? null, forecastYears: project?.forecastYears ?? null, config });
    let first = 2166136261, second = 5381;
    for (let index = 0; index < value.length; index += 1) {
      first = Math.imul(first ^ value.charCodeAt(index), 16777619);
      second = Math.imul(second, 33) ^ value.charCodeAt(index);
    }
    return `supply-v${version}-${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}-${value.length}`;
  }

  function compileCurve(series, year = null) {
    if (series.baseEnergyMwh === 0) return { monthly: Array(12).fill(0), hourly: MONTH_DAYS.map(() => Array(24).fill(0)) };
    const { monthlyWeights, hourlyWeightsByMonth } = getCurve(series, year);
    // Strict v2 vectors may differ from 1 by tiny roundoff. Normalizing that
    // roundoff preserves conservation without changing the stored assumptions.
    const monthly = normalizedWeights(monthlyWeights);
    return { monthly, hourly: monthly.map((weight, index) => weight > 0
      ? normalizedWeights(hourlyWeightsByMonth[index + 1]) : Array(24).fill(0)) };
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
    const entries = activeSeries(config).map(({ key, series }) => ({ key, series, annual: annualValues(project, series), defaults: compileCurve(series) }));
    const bidirectional = config.elements.tieLine.mode === "bidirectional";
    const annualRows = annualRowsForConfig(project, config), typicalRows = [], hourlyByYear = {};
    for (let index = 0; index < project.forecastYears; index += 1) {
      const year = project.startYear + index;
      const annual = annualRows[index];
      const hourly = Object.fromEntries(VALUE_KEYS.map((key) => [key, []]));
      const yearlyTypical = [];
      const curves = entries.map(({ key, series, annual: annualSeries, defaults }) => ({ key, energy: annualSeries[index],
        ...(config.version === 2 && Object.hasOwn(series.curveOverridesByYear || {}, year) ? compileCurve(series, year) : defaults) }));
      MONTH_DAYS.forEach((days, monthIndex) => {
        const monthRows = Array.from({ length: 24 }, (_, hour) => {
          const values = Object.fromEntries(curves.map((entry) => [entry.key,
            entry.energy * entry.monthly[monthIndex] / days * entry.hourly[monthIndex][hour]]));
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
        curveReuse: config.version === 2 ? "default_with_year_overrides" : "same_monthly_and_hourly_weights_across_years" } };
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

  return Object.freeze({ ELEMENTS, MONTH_DAYS, MAX_FORECAST_YEARS, createSeries, createConfig, prepareShareConfig, getCurve, validateShares,
    validateConfig, fingerprint, buildAnnualSummary, buildDataset, csvRows });
});
