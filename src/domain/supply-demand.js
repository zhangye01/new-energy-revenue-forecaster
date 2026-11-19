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
  const GENERATOR_KEYS = Object.freeze(["wind", "solar", "hydro"]);
  const ENERGY_MODE = "energy";
  const CAPACITY_MODE = "capacity_hours";
  const CAPACITY_HOURS_FIELDS = ["baseCapacityMw", "baseUtilizationHours", "utilizationHoursByYear"];
  const ALTERNATE_GENERATION_FIELDS = ["mode", "growthRatesByYear", "capacityHours"];
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

  function blankGrowthRates(project) {
    const growthRatesByYear = {};
    if (validPeriod(project)) {
      for (let index = 1; index < project.forecastYears; index += 1) growthRatesByYear[project.startYear + index] = null;
    }
    return growthRatesByYear;
  }

  function createSeries(project) {
    return {
      baseEnergyMwh: null, growthRatesByYear: blankGrowthRates(project), monthlyWeights: Array(12).fill(null),
      hourlyWeightsByMonth: Object.fromEntries(MONTH_DAYS.map((_, index) => [index + 1, Array(24).fill(null)]))
    };
  }

  function createConfig(project = {}) {
    const elements = Object.fromEntries(ELEMENTS.map(({ key }) => [key, createSeries(project)]));
    elements.tieLine = { ...elements.tieLine, mode: "net", export: createSeries(project), import: createSeries(project) };
    return { version: 1, startYear: project.startYear ?? null, forecastYears: project.forecastYears ?? null, elements };
  }

  function createCapacityHours() {
    return { baseCapacityMw: null, baseUtilizationHours: null, utilizationHoursByYear: {} };
  }

  function createCapacityHoursConfig(project) {
    const config = prepareShareConfig(project);
    for (const key of GENERATOR_KEYS) config.elements[key].capacityHours = createCapacityHours();
    return config;
  }

  function generationMode(series) {
    return Object.hasOwn(series, "capacityHours") ? CAPACITY_MODE : ENERGY_MODE;
  }

  function editableGenerationInputs(project, source, mode) {
    const growthRatesByYear = isObject(source?.growthRatesByYear) ? source.growthRatesByYear : blankGrowthRates(project);
    const inputs = { mode, growthRatesByYear };
    if (mode === CAPACITY_MODE) inputs.capacityHours = completeEditableCapacityHours(source?.capacityHours);
    return inputs;
  }

  function setAlternateGeneration(series, inputs) {
    const hours = inputs?.capacityHours;
    const hasHours = hours && (hours.baseCapacityMw != null || hours.baseUtilizationHours != null ||
      Object.values(hours.utilizationHoursByYear).some((value) => value != null));
    if (inputs && (hasHours || Object.values(inputs.growthRatesByYear).some((value) => value != null))) {
      series.alternateGeneration = inputs;
    } else {
      delete series.alternateGeneration;
    }
  }

  function switchGenerationMode(project, series, mode) {
    if (!isObject(series) || (mode !== ENERGY_MODE && mode !== CAPACITY_MODE)) return false;
    const activeMode = generationMode(series);
    if (activeMode === mode) return false;
    const leaving = editableGenerationInputs(project, series, activeMode);
    const stored = series.alternateGeneration;
    const entering = editableGenerationInputs(project, stored?.mode === mode ? stored : null, mode);
    series.growthRatesByYear = entering.growthRatesByYear;
    if (mode === CAPACITY_MODE) series.capacityHours = entering.capacityHours;
    else delete series.capacityHours;
    setAlternateGeneration(series, leaving);
    return true;
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
    carryGrowthRates(target.growthRatesByYear, source.growthRatesByYear, previous);
    const legacy = previous.version === 1;
    target.monthlyWeights = carryShareVector(source.monthlyWeights, 12, legacy);
    for (const month of Object.keys(target.hourlyWeightsByMonth)) {
      target.hourlyWeightsByMonth[month] = carryShareVector(source.hourlyWeightsByMonth?.[month], 24, legacy);
    }
    if (legacy || !validPeriod(project) || !isObject(source.curveOverridesByYear)) return;
    const overrides = Object.entries(source.curveOverridesByYear).filter(([year]) => inPeriod(project, year));
    if (overrides.length) target.curveOverridesByYear = JSON.parse(JSON.stringify(Object.fromEntries(overrides)));
  }

  function carryGrowthRates(target, source, previous) {
    if (!validPeriod(previous)) return;
    for (const year of Object.keys(target)) {
      const value = source?.[year];
      if (subsequentYear(previous, year) && isNumber(value)) target[year] = value;
    }
  }

  function carryCapacityHours(source, previous, project) {
    const target = createCapacityHours();
    if (previous.startYear === project.startYear) {
      if (isNumber(source.baseCapacityMw)) target.baseCapacityMw = source.baseCapacityMw;
      if (isNumber(source.baseUtilizationHours)) target.baseUtilizationHours = source.baseUtilizationHours;
    }
    if (validPeriod(previous) && validPeriod(project) && isObject(source.utilizationHoursByYear)) {
      const hours = Object.entries(source.utilizationHoursByYear).filter(([year, value]) =>
        subsequentYear(previous, year) && subsequentYear(project, year) && isNumber(value));
      target.utilizationHoursByYear = Object.fromEntries(hours);
    }
    return target;
  }

  function completeEditableSeries(project, series) {
    if (!isObject(series)) return createSeries(project);
    if (!isObject(series.growthRatesByYear)) series.growthRatesByYear = blankGrowthRates(project);
    if (!Array.isArray(series.monthlyWeights)) series.monthlyWeights = Array(12).fill(null);
    if (!isObject(series.hourlyWeightsByMonth)) series.hourlyWeightsByMonth = {};
    return series;
  }

  function completeEditableCapacityHours(config) {
    if (!isObject(config)) return createCapacityHours();
    const { baseCapacityMw = null, baseUtilizationHours = null, utilizationHoursByYear } = config;
    return { baseCapacityMw, baseUtilizationHours,
      utilizationHoursByYear: isObject(utilizationHoursByYear) ? utilizationHoursByYear : {} };
  }

  function editableAlternateGeneration(project, series) {
    const alternate = series.alternateGeneration;
    const mode = generationMode(series) === CAPACITY_MODE ? ENERGY_MODE : CAPACITY_MODE;
    return isObject(alternate) && alternate.mode === mode ? editableGenerationInputs(project, alternate, mode) : null;
  }

  function carryAlternateGeneration(target, source, previous, project) {
    const inputs = editableAlternateGeneration(project, source);
    if (!inputs) return;
    const rates = blankGrowthRates(project);
    carryGrowthRates(rates, inputs.growthRatesByYear, previous);
    inputs.growthRatesByYear = rates;
    if (inputs.capacityHours) inputs.capacityHours = carryCapacityHours(inputs.capacityHours, previous, project);
    setAlternateGeneration(target, inputs);
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
      for (const key of GENERATOR_KEYS) {
        const series = editable.elements[key];
        if (Object.hasOwn(series, "capacityHours")) series.capacityHours = completeEditableCapacityHours(series.capacityHours);
        if (Object.hasOwn(series, "alternateGeneration")) setAlternateGeneration(series, editableAlternateGeneration(project, series));
      }
      const tie = editable.elements.tieLine;
      tie.mode = tie.mode === "bidirectional" ? "bidirectional" : "net";
      for (const direction of ["export", "import"]) tie[direction] = completeEditableSeries(project, tie[direction]);
      return editable;
    }
    for (const { key } of ELEMENTS) {
      const source = config.elements[key];
      const series = target.elements[key];
      carryShareSeries(series, source, config, project);
      if (config.version === 2 && GENERATOR_KEYS.includes(key) && isObject(source)) {
        if (Object.hasOwn(source, "capacityHours")) {
          series.capacityHours = carryCapacityHours(completeEditableCapacityHours(source.capacityHours), config, project);
        }
        carryAlternateGeneration(series, source, config, project);
      }
    }
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
    const { capacityHours } = series;
    const values = [capacityHours ? capacityHours.baseCapacityMw : series.baseEnergyMwh];
    for (let index = 1; index < project.forecastYears; index += 1) {
      const rate = series.growthRatesByYear[project.startYear + index];
      values.push(values[index - 1] * (1 + rate / 100));
    }
    if (!capacityHours) return values;
    const { baseUtilizationHours, utilizationHoursByYear } = capacityHours;
    return values.map((capacity, index) => capacity * (utilizationHoursByYear[project.startYear + index] ?? baseUtilizationHours));
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

  function subsequentYear(project, key) {
    return inPeriod(project, key) && Number(key) > project.startYear;
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

  function isUtilizationHours(value) {
    return isNumber(value) && value >= 0 && value <= 8760;
  }

  function validateCapacityHours(config, label, project, errors) {
    if (!isObject(config)) { errors.push(`${label}须填写装机及利用小时配置。`); return false; }
    const before = errors.length;
    const { baseCapacityMw, baseUtilizationHours, utilizationHoursByYear } = config;
    if (Object.keys(config).some((key) => !CAPACITY_HOURS_FIELDS.includes(key))) {
      errors.push(`${label}装机及利用小时配置包含不支持的字段。`);
    }
    if (!isNumber(baseCapacityMw) || baseCapacityMw < 0) errors.push(`${label}首年装机须填写非负有限数字（MW）。`);
    if (!isUtilizationHours(baseUtilizationHours)) errors.push(`${label}首年利用小时须为0至8760之间的有限数字。`);
    if (!isObject(utilizationHoursByYear)) errors.push(`${label}逐年利用小时须按测算年份配置。`);
    else {
      for (const [year, hours] of Object.entries(utilizationHoursByYear)) {
        if (!subsequentYear(project, year)) errors.push(`${label}${year}年利用小时须对应首年之后、测算周期内的年份。`);
        else if (!isUtilizationHours(hours)) errors.push(`${label}${year}年利用小时须为0至8760之间的有限数字。`);
      }
    }
    return errors.length === before;
  }

  function validAlternateGeneration(series) {
    const { alternateGeneration: alternate } = series;
    const mode = generationMode(series) === CAPACITY_MODE ? ENERGY_MODE : CAPACITY_MODE;
    if (!isObject(alternate) || alternate.mode !== mode || !isObject(alternate.growthRatesByYear) ||
        Object.keys(alternate).some((key) => !ALTERNATE_GENERATION_FIELDS.includes(key))) return false;
    if (!Object.hasOwn(alternate, "capacityHours")) return true;
    const hours = alternate.capacityHours;
    return mode === CAPACITY_MODE && isObject(hours) &&
      Object.keys(hours).every((key) => CAPACITY_HOURS_FIELDS.includes(key)) &&
      (!Object.hasOwn(hours, "utilizationHoursByYear") || isObject(hours.utilizationHoursByYear));
  }

  function validateSeries(project, series, label, signed, errors, strictShares) {
    if (!isObject(series)) { errors.push(`${label}尚未配置。`); return; }
    if (Object.hasOwn(series, "alternateGeneration") && !validAlternateGeneration(series)) {
      errors.push(`${label}备用发电口径的配置结构无效。`);
    }
    const capacityMode = Object.hasOwn(series, "capacityHours");
    const baseValid = capacityMode ? validateCapacityHours(series.capacityHours, label, project, errors)
      : isNumber(series.baseEnergyMwh) && (signed || series.baseEnergyMwh >= 0);
    if (!capacityMode && !baseValid) errors.push(`${label}首年电量须填写${signed ? "可正可负的" : "非负的"}有限数字，无该项请明确填写0。`);
    let growthValid = true;
    for (let index = 1; index < project.forecastYears; index += 1) {
      const year = project.startYear + index, value = series.growthRatesByYear?.[year];
      if (!isObject(series.growthRatesByYear) || !isNumber(value) || value < -100) {
        errors.push(`${label}${year}年${capacityMode ? "装机" : ""}增长率须明确填写有限数字，不能低于-100%。`);
        growthValid = false;
      }
    }
    const annual = baseValid && growthValid ? annualValues(project, series) : [];
    if (annual.some((value) => !Number.isFinite(value))) {
      errors.push(`${label}年度电量计算超出有限数值范围，请核对起点值与增长率。`);
    }
    if (strictShares) {
      const needsCurves = capacityMode ? annual.some((value) => value > 0) : baseValid && series.baseEnergyMwh !== 0;
      validateShareCurves(project, series, label, needsCurves, errors);
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

  function unsupportedGeneratorField(config, field) {
    const hasField = (series) => isObject(series) && Object.hasOwn(series, field);
    return Object.entries(config.elements).some(([key, series]) => hasField(series) && (config.version !== 2 || !GENERATOR_KEYS.includes(key))) ||
      ["export", "import"].some((direction) => hasField(config.elements.tieLine[direction]));
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
    if (unsupportedGeneratorField(config, "capacityHours")) {
      return ["装机及利用小时配置仅支持版本2的风电、光伏和水电。"];
    }
    if (unsupportedGeneratorField(config, "alternateGeneration")) {
      return ["备用发电口径仅支持版本2的风电、光伏和水电。"];
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

  function compileCurve(series, required, year = null) {
    if (!required) return { monthly: Array(12).fill(0), hourly: MONTH_DAYS.map(() => Array(24).fill(0)) };
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

  function buildTemporalData(project, config, expandHours) {
    const errors = validateConfig(project, config);
    if (errors.length) return failed(errors);
    const entries = activeSeries(config).map(({ key, series }) => {
      const annual = annualValues(project, series);
      return { key, series, annual, defaults: compileCurve(series, annual.some((value) => value !== 0)) };
    });
    const bidirectional = config.elements.tieLine.mode === "bidirectional";
    const annualRows = annualRowsForConfig(project, config), typicalRows = [], hourlyByYear = {};
    for (let index = 0; index < project.forecastYears; index += 1) {
      const year = project.startYear + index;
      const annual = annualRows[index];
      const hourly = expandHours ? Object.fromEntries(VALUE_KEYS.map((key) => [key, []])) : null;
      const yearlyTypical = [];
      const curves = entries.map(({ key, series, annual: annualSeries, defaults }) => ({ key, energy: annualSeries[index],
        ...(config.version === 2 && Object.hasOwn(series.curveOverridesByYear || {}, year) ? compileCurve(series, annualSeries[index] !== 0, year) : defaults) }));
      MONTH_DAYS.forEach((days, monthIndex) => {
        const monthRows = Array.from({ length: 24 }, (_, hour) => {
          const values = Object.fromEntries(curves.map((entry) => [entry.key,
            entry.energy * entry.monthly[monthIndex] / days * entry.hourly[monthIndex][hour]]));
          return { year, month: monthIndex + 1, hour, representedDays: days, ...deriveValues(values, bidirectional) };
        });
        yearlyTypical.push(...monthRows);
        if (!hourly) return;
        for (let day = 0; day < days; day += 1) {
          monthRows.forEach((row) => VALUE_KEYS.forEach((key) => hourly[key].push(row[key])));
        }
      });
      const absoluteInputTotal = sum(entries.map((entry) => Math.abs(entry.annual[index])));
      for (const key of VALUE_KEYS) {
        const arithmeticScale = key === "residualDemand" ? absoluteInputTotal
          : key === "tieLine" ? annual.tieLineExport + annual.tieLineImport : Math.abs(annual[key]);
        const hourlyMismatch = hourly && (!hourly[key].every(Number.isFinite) || !conserved(sum(hourly[key]), annual[key], arithmeticScale));
        if (hourlyMismatch || !conserved(sum(yearlyTypical.map((row) => row[key] * row.representedDays)), annual[key], arithmeticScale)) {
          return failed([`${year}年${key}小时数据未通过电量守恒校验，请核对输入数值范围。`]);
        }
      }
      typicalRows.push(...yearlyTypical);
      if (hourly) hourlyByYear[year] = hourly;
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

  function buildDataset(project, config) {
    return buildTemporalData(project, config, true);
  }

  function buildTypicalSummary(project, config) {
    const { ok, errors, fingerprint: inputFingerprint, annualRows, typicalRows } = buildTemporalData(project, config, false);
    return { ok, errors, fingerprint: inputFingerprint, annualRows, typicalRows };
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

  return Object.freeze({ ELEMENTS, GENERATOR_KEYS, MONTH_DAYS, MAX_FORECAST_YEARS, createSeries, createConfig, createCapacityHours, createCapacityHoursConfig, switchGenerationMode, prepareShareConfig, getCurve, validateShares,
    validateConfig, fingerprint, buildAnnualSummary, buildTypicalSummary, buildDataset, csvRows });
});
