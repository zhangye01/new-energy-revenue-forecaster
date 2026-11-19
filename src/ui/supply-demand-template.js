"use strict";

(function (root, factory) {
  const commonJs = typeof module !== "undefined" && module.exports;
  const api = factory(root, commonJs ? require("../domain/supply-demand") : root.NE_SUPPLY_DEMAND,
    commonJs ? require("../domain/csv-utils") : root.NE_CSV_UTILS);
  if (commonJs) module.exports = api;
  root.NE_SUPPLY_DEMAND_TEMPLATE = api;
  if (root.window && root.window !== root) root.window.NE_SUPPLY_DEMAND_TEMPLATE = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (root, domain, csvUtils) {
  const SHEETS = Object.freeze({ annual: "年度电量与增长率", monthly: "分月权重", hourly: "典型日分时" });
  const TEMPLATE_NAME = "供需配置模板";
  const TEMPLATE_VERSION = 1;
  const CURVE_SHEETS = Object.freeze({ notes: "填写说明", monthly: "分月占比", hourly: "典型日分时占比" });
  const CURVE_TEMPLATE_NAME = "供需曲线模板";
  const CURVE_TEMPLATE_VERSION = 1;
  const GROWTH_SHEET = "逐年增长率";
  const GROWTH_TEMPLATE_NAME = "供需增长率模板";
  const GROWTH_TEMPLATE_VERSION = 1;
  const GROWTH_HEADER_ROW = 4;
  const GROWTH_BASIS_LABEL = "增速口径";
  const CAPACITY_GROWTH = "装机容量";
  const ENERGY_GROWTH = "年度电量";
  const DEFAULT_CURVE_LABEL = "默认典型年";
  const ANNUAL_HEADER_ROW = 6;
  const MODE_LABELS = Object.freeze({ net: "净额", bidirectional: "双向" });
  const MONTHS = Object.freeze(domain.MONTH_DAYS.map((_, index) => index + 1));
  const HOURS = Object.freeze(Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, "0")}:00`));
  const SERIES = Object.freeze(domain.ELEMENTS.flatMap(({ key, label }) => key === "tieLine"
    ? [{ key, label, mode: "net" }, { key, label: "联络线送出", mode: "bidirectional", branch: "export" },
      { key, label: "联络线受入", mode: "bidirectional", branch: "import" }]
    : [{ key, label }]));
  const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  const MAX_FILE_BYTES = 5 * 1024 * 1024;

  const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const exportValue = (value) => typeof value === "string" || Number.isFinite(value) ? value : null;

  function periodYears(project) {
    const { startYear, forecastYears } = project || {};
    if (!Number.isInteger(startYear) || startYear < 1 || !Number.isInteger(forecastYears) ||
        forecastYears < 1 || forecastYears > domain.MAX_FORECAST_YEARS || startYear + forecastYears - 1 > 9999) {
      throw new Error("请先设置有效的项目测算周期，再下载或导入供需模板。");
    }
    return Array.from({ length: forecastYears }, (_, index) => startYear + index);
  }

  function headers(years) {
    return {
      annual: ["供需要素", "首年电量（MWh）", ...years.slice(1).map((year) => `${year}年增长率（%）`)],
      monthly: ["供需要素", ...MONTHS.map((month) => `${month}月`)],
      hourly: ["供需要素", "月份", ...HOURS]
    };
  }

  function readSeries(config, descriptor) {
    const element = config?.elements?.[descriptor.key];
    return descriptor.branch ? element?.[descriptor.branch] : element;
  }

  function buildWorkbook(project, config, { xlsx = root.XLSX } = {}) {
    if (!xlsx?.utils) throw new Error("Excel 组件未加载，请刷新后重试。");
    const years = periodYears(project);
    const columns = headers(years);
    const mode = config?.elements?.tieLine?.mode === "bidirectional" ? MODE_LABELS.bidirectional : MODE_LABELS.net;
    const workbook = xlsx.utils.book_new();
    const annual = [
      [TEMPLATE_NAME, TEMPLATE_VERSION],
      ["起始年", years[0], "末年", years.at(-1)],
      ["联络线方式", mode],
      ["填写说明", "保留表头、要素及月份。增长率填百分数值，例如 3 表示增长 3%，不变填 0。"],
      ["联络线口径", "方式填「净额」或「双向」。净额填联络线负荷（正送出、负受入），双向分别填送出和受入的非负量，只需填写所选口径对应的行。"],
      ["曲线说明", "分月及分时填相对权重。首年电量为 0 的要素可留空权重；分月权重为 0 的月份可留空分时。"],
      columns.annual,
      ...SERIES.map((descriptor) => {
        const series = readSeries(config, descriptor);
        return [descriptor.label, config?.startYear === years[0] ? exportValue(series?.baseEnergyMwh) : null,
          ...years.slice(1).map((year) => exportValue(series?.growthRatesByYear?.[year]))];
      })
    ];
    const monthly = [columns.monthly, ...SERIES.map((descriptor) => {
      const values = readSeries(config, descriptor)?.monthlyWeights;
      return [descriptor.label, ...MONTHS.map((_, index) => exportValue(values?.[index]))];
    })];
    const hourly = [columns.hourly, ...SERIES.flatMap((descriptor) => {
      const values = readSeries(config, descriptor)?.hourlyWeightsByMonth;
      return MONTHS.map((month) => [descriptor.label, month, ...HOURS.map((_, hour) => exportValue(values?.[month]?.[hour]))]);
    })];
    for (const [key, rows] of Object.entries({ annual, monthly, hourly })) {
      const sheet = xlsx.utils.aoa_to_sheet(rows);
      const widths = key === "annual" ? [19, 22, ...years.slice(1).map(() => 19)]
        : [19, ...columns[key].slice(1).map((_, index) => key === "hourly" && index === 0 ? 8 : 11)];
      sheet["!cols"] = widths.map((wch) => ({ wch }));
      if (key === "hourly") sheet["!autofilter"] = { ref: sheet["!ref"] };
      xlsx.utils.book_append_sheet(workbook, sheet, SHEETS[key]);
    }
    return workbook;
  }

  function reader(workbook, xlsx, name, rowLimit, columnLimit) {
    const sheet = workbook?.Sheets?.[name];
    if (!sheet || !workbook.SheetNames?.includes(name)) throw new Error(`模板缺少「${name}」工作表。`);
    const range = xlsx.utils.decode_range(sheet["!ref"] || "A1:A1");
    if (range.e.r >= rowLimit || range.e.c >= columnLimit) {
      throw new Error(`「${name}」存在模板范围外的行或列，请按原模板填写。`);
    }
    const address = (row, column) => xlsx.utils.encode_cell({ r: row, c: column });
    const cell = (row, column) => sheet[address(row, column)];
    return {
      cell, value: (row, column) => cell(row, column)?.v, location: (row, column) => `${name}!${address(row, column)}`,
      lastRow: range.e.r, lastColumn: range.e.c
    };
  }

  function numberAt(sheet, row, column, kind, original) {
    const cell = sheet.cell(row, column);
    const value = cell?.v;
    // Older saved inputs can contain text in unused curves. Retain text carried
    // through unchanged, then let the shared validator apply the active rules.
    if (typeof original === "string" && value === original && cell.t === "s" && !cell.f) return original;
    if (!cell?.f && (value == null || cell?.t === "z" || typeof value === "string" && !value.trim())) return null;
    const format = typeof cell?.z === "string" ? cell.z.replace(/"[^"]*"|\\./g, "") : "";
    const text = typeof value === "string" ? value.trim() : "";
    const percent = typeof value === "number" ? format.includes("%") : text.endsWith("%");
    const digits = percent ? text.slice(0, -1).trim() : text;
    const raw = typeof value === "number" ? value : DECIMAL.test(digits) ? Number(digits) : NaN;
    const parsed = percent && kind === "growth" && typeof value === "number" ? percentagePoints(raw)
      : percent && (kind === "weight" || kind === "ratio") && typeof value === "string" ? raw / 100 : raw;
    if (kind === "month" || kind === "year") return percent || cell?.t === "e" || cell?.t === "d" ? NaN : parsed;
    if (!Number.isFinite(parsed) || cell?.t === "e" || cell?.t === "d" || percent && kind === "base") {
      const expected = { growth: "有效增长率", base: "MWh 数值", weight: "有效权重", ratio: "有效占比" };
      throw new Error(`${sheet.location(row, column)} 须填写${expected[kind]}。`);
    }
    return parsed;
  }

  function percentagePoints(ratio) {
    // Shift the decimal so an Excel percentage of 7% matches a saved rate of 7.
    const [digits, exponent = "0"] = String(ratio).split("e");
    return Number(`${digits}e${Number(exponent) + 2}`);
  }

  function assertLabel(sheet, row, column, expected) {
    if (sheet.value(row, column) !== expected) throw new Error(`${sheet.location(row, column)} 应为「${expected}」，请使用当前项目模板。`);
  }

  function locateRows(sheet, headerRow, columns, monthRows, descriptors = SERIES) {
    columns.forEach((label, index) => assertLabel(sheet, headerRow, index, label));
    const rows = new Map();
    const rowCount = descriptors.length * (monthRows ? MONTHS.length : 1);
    const cellHasValue = (row, column) => sheet.cell(row, column)?.f || (sheet.value(row, column) != null && sheet.value(row, column) !== "");
    for (let row = headerRow; row <= headerRow + rowCount; row += 1) {
      for (let column = columns.length; column <= sheet.lastColumn; column += 1) {
        if (cellHasValue(row, column)) throw new Error(`${sheet.location(row, column)} 超出当前测算周期的模板列，请核对表头。`);
      }
    }
    for (let row = headerRow + 1; row <= headerRow + rowCount; row += 1) {
      const label = sheet.value(row, 0);
      if ((label == null || label === "") && columns.every((_, column) => !cellHasValue(row, column))) continue;
      if (!descriptors.some((series) => series.label === label)) throw new Error(`${sheet.location(row, 0)} 的供需要素无效。`);
      const month = monthRows ? numberAt(sheet, row, 1, "month") : 0;
      if (monthRows && !MONTHS.includes(month)) throw new Error(`${sheet.location(row, 1)} 的月份须为 1 至 12 的整数。`);
      const key = monthRows ? `${label}/${month}` : label;
      if (rows.has(key)) throw new Error(`${sheet.location(row, 0)} 的「${label}${monthRows ? `${month}月` : ""}」重复。`);
      rows.set(key, row);
    }
    return rows;
  }

  function rowsForSeries(maps, descriptor, active) {
    const { label } = descriptor;
    const find = (key, suffix = "") => {
      const row = maps[key].get(suffix ? `${label}/${suffix}` : label);
      if (row === undefined && active) throw new Error(`「${SHEETS[key]}」缺少「${label}${suffix ? `${suffix}月` : ""}」的数据行。`);
      return row;
    };
    return {
      annual: find("annual"), monthly: find("monthly"), hourly: MONTHS.map((month) => find("hourly", month))
    };
  }

  function setNumber(target, key, value) {
    if (value !== null || exportValue(target[key]) !== null) target[key] = value;
  }

  function setVector(target, key, values) {
    const current = target[key];
    if (values.every((value, index) => value === exportValue(current?.[index]))) return;
    target[key] = values;
  }

  function mutableSeries(config, descriptor, project) {
    const { key, branch } = descriptor;
    if (!isObject(config.elements[key])) config.elements[key] = domain.createSeries(project);
    const element = config.elements[key];
    if (!branch) return element;
    if (!isObject(element[branch])) element[branch] = domain.createSeries(project);
    return element[branch];
  }

  function updateSeries(project, config, descriptor, sheets, rows, years) {
    const original = readSeries(config, descriptor);
    const growthYears = years.slice(1);
    const annual = rows.annual === undefined ? [] : [numberAt(sheets.annual, rows.annual, 1, "base", original?.baseEnergyMwh),
      ...growthYears.map((year, index) => numberAt(sheets.annual, rows.annual, index + 2, "growth", original?.growthRatesByYear?.[year]))];
    const monthly = rows.monthly === undefined ? [] : MONTHS.map((_, index) =>
      numberAt(sheets.monthly, rows.monthly, index + 1, "weight", original?.monthlyWeights?.[index]));
    const hourly = rows.hourly.map((row, index) => row === undefined ? [] : HOURS.map((_, hour) =>
      numberAt(sheets.hourly, row, hour + 2, "weight", original?.hourlyWeightsByMonth?.[index + 1]?.[hour])));
    if (!isObject(original) && [annual, monthly, ...hourly].every((values) => values.every((value) => value === null))) return;
    const series = mutableSeries(config, descriptor, project);
    if (annual.length) {
      setNumber(series, "baseEnergyMwh", annual[0]);
      if (!isObject(series.growthRatesByYear) && annual.slice(1).some((value) => value !== null)) series.growthRatesByYear = {};
      if (isObject(series.growthRatesByYear)) growthYears.forEach((year, index) => setNumber(series.growthRatesByYear, year, annual[index + 1]));
    }
    if (monthly.length) setVector(series, "monthlyWeights", monthly);
    hourly.forEach((values, index) => {
      if (!values.length) return;
      if (!isObject(series.hourlyWeightsByMonth)) {
        if (values.every((value) => value === null)) return;
        series.hourlyWeightsByMonth = {};
      }
      setVector(series.hourlyWeightsByMonth, index + 1, values);
    });
  }

  function parseWorkbook(project, workbook, { xlsx = root.XLSX, baseConfig } = {}) {
    try {
      if (!xlsx?.utils) throw new Error("Excel 组件未加载，请刷新后重试。");
      const years = periodYears(project);
      const columns = headers(years);
      const sheets = {
        annual: reader(workbook, xlsx, SHEETS.annual, ANNUAL_HEADER_ROW + 1 + SERIES.length, domain.MAX_FORECAST_YEARS + 1),
        monthly: reader(workbook, xlsx, SHEETS.monthly, SERIES.length + 1, columns.monthly.length),
        hourly: reader(workbook, xlsx, SHEETS.hourly, SERIES.length * MONTHS.length + 1, columns.hourly.length)
      };
      assertLabel(sheets.annual, 0, 0, TEMPLATE_NAME);
      assertLabel(sheets.annual, 0, 1, TEMPLATE_VERSION);
      assertLabel(sheets.annual, 1, 0, "起始年");
      assertLabel(sheets.annual, 1, 2, "末年");
      if (sheets.annual.value(1, 1) !== years[0] || sheets.annual.value(1, 3) !== years.at(-1)) {
        throw new Error(`模板测算周期与项目不符，请下载 ${years[0]}—${years.at(-1)} 年模板。`);
      }
      assertLabel(sheets.annual, 2, 0, "联络线方式");
      const mode = Object.keys(MODE_LABELS).find((key) => MODE_LABELS[key] === sheets.annual.value(2, 1));
      if (!mode) throw new Error(`${sheets.annual.location(2, 1)} 的联络线方式须为「净额」或「双向」。`);
      const maps = {
        annual: locateRows(sheets.annual, ANNUAL_HEADER_ROW, columns.annual, false),
        monthly: locateRows(sheets.monthly, 0, columns.monthly, false),
        hourly: locateRows(sheets.hourly, 0, columns.hourly, true)
      };
      const preserve = baseConfig?.version === 1 && baseConfig.startYear === years[0] &&
        baseConfig.forecastYears === years.length && isObject(baseConfig.elements);
      const config = preserve ? clone(baseConfig) : domain.createConfig(project);
      mutableSeries(config, { key: "tieLine" }, project).mode = mode;
      for (const descriptor of SERIES) {
        const active = !descriptor.mode || descriptor.mode === mode;
        updateSeries(project, config, descriptor, sheets, rowsForSeries(maps, descriptor, active), years);
      }
      const errors = domain.validateConfig(project, config);
      return { ok: errors.length === 0, config: errors.length === 0 ? config : null, errors };
    } catch (error) {
      return { ok: false, config: null, errors: [error?.message || "供需模板读取失败。"] };
    }
  }

  function curveScope(years, year) {
    if (year == null) return DEFAULT_CURVE_LABEL;
    if (!years.includes(year)) throw new Error("请选择测算周期内的曲线年份。");
    return year;
  }

  function activeCurves(config) {
    const mode = config?.elements?.tieLine?.mode === "bidirectional" ? "bidirectional" : "net";
    return { mode: MODE_LABELS[mode], series: SERIES.filter((item) => !item.mode || item.mode === mode) };
  }

  function appendCurveSheet(workbook, xlsx, name, rows, startColumn, filter = false) {
    const sheet = xlsx.utils.aoa_to_sheet(rows);
    sheet["!cols"] = rows[0].map((_, column) => ({ wch: column === 0 ? 19 : column < startColumn ? 8 : 12 }));
    for (let row = 1; row < rows.length; row += 1) {
      for (let column = startColumn; column < rows[0].length; column += 1) {
        const cell = sheet[xlsx.utils.encode_cell({ r: row, c: column })];
        if (cell?.t === "n") cell.z = "0.00####%";
      }
    }
    if (filter) sheet["!autofilter"] = { ref: sheet["!ref"] };
    xlsx.utils.book_append_sheet(workbook, sheet, name);
  }

  function buildCurveWorkbook(project, config, { xlsx = root.XLSX, year = null } = {}) {
    if (!xlsx?.utils) throw new Error("Excel 组件未加载，请刷新后重试。");
    const years = periodYears(project);
    const scope = curveScope(years, year);
    const normalized = domain.prepareShareConfig(project, config);
    const { mode, series } = activeCurves(normalized);
    const { monthly, hourly } = headers(years);
    const workbook = xlsx.utils.book_new();
    const notes = xlsx.utils.aoa_to_sheet([
      [CURVE_TEMPLATE_NAME, CURVE_TEMPLATE_VERSION],
      ["起始年", years[0], "末年", years.at(-1)],
      ["曲线范围", scope],
      ["联络线方式", mode],
      ["分月占比", "每个要素的 12 个月占比合计须为 1（100%）。"],
      ["典型日分时占比", "每个要素每月的 24 小时占比合计须为 1（100%）。"],
      ["填写方式", "10% 和 0.1 表示同一个占比。空白保留现有值，填 0 更新为零。"],
      ["生效范围", year === null ? "默认曲线供各年沿用。" : "本文件的修改仅应用于所选年份，其他年份继续使用各自的曲线。"]
    ]);
    notes["!cols"] = [{ wch: 21 }, { wch: 17 }, { wch: 10 }, { wch: 11 }, { wch: 39 }];
    notes["!merges"] = Array.from({ length: 4 }, (_, index) => ({ s: { r: 4 + index, c: 1 }, e: { r: 4 + index, c: 4 } }));
    notes["!ref"] = "A1:E8";
    xlsx.utils.book_append_sheet(workbook, notes, CURVE_SHEETS.notes);
    const curves = series.map((item) => ({ item, curve: domain.getCurve(readSeries(normalized, item), year) }));
    appendCurveSheet(workbook, xlsx, CURVE_SHEETS.monthly, [monthly, ...curves.map(({ item, curve }) =>
      [item.label, ...MONTHS.map((_, index) => exportValue(curve.monthlyWeights?.[index]))])], 1);
    appendCurveSheet(workbook, xlsx, CURVE_SHEETS.hourly, [hourly, ...curves.flatMap(({ item, curve }) => MONTHS.map((month) =>
      [item.label, month, ...HOURS.map((_, hour) => exportValue(curve.hourlyWeightsByMonth?.[month]?.[hour]))]))], 2, true);
    return workbook;
  }

  function validateCurveNotes(workbook, xlsx, years, scope, mode) {
    const notes = reader(workbook, xlsx, CURVE_SHEETS.notes, 8, 5);
    assertLabel(notes, 0, 0, CURVE_TEMPLATE_NAME);
    assertLabel(notes, 0, 1, CURVE_TEMPLATE_VERSION);
    assertLabel(notes, 1, 0, "起始年");
    assertLabel(notes, 1, 2, "末年");
    if (notes.value(1, 1) !== years[0] || notes.value(1, 3) !== years.at(-1)) {
      throw new Error(`模板测算周期与项目不符，请下载 ${years[0]}—${years.at(-1)} 年曲线模板。`);
    }
    assertLabel(notes, 2, 0, "曲线范围");
    if (notes.value(2, 1) !== scope) throw new Error(`模板曲线范围与当前选择不符，请下载「${scope}」曲线模板。`);
    assertLabel(notes, 3, 0, "联络线方式");
    if (notes.value(3, 1) !== mode) throw new Error(`模板联络线方式与当前选择不符，请下载「${mode}」曲线模板。`);
  }

  function curveRows(workbook, xlsx, name, columns, descriptors, hasMonthColumn) {
    const raw = workbook?.Sheets?.[name];
    if (!raw || !Object.keys(raw).some((address) => !address.startsWith("!") &&
        (raw[address]?.f || raw[address]?.v != null && raw[address].v !== ""))) return null;
    const rowCount = descriptors.length * (hasMonthColumn ? MONTHS.length : 1);
    const sheet = reader(workbook, xlsx, name, rowCount + 1, columns.length);
    const rows = locateRows(sheet, 0, columns, hasMonthColumn, descriptors);
    return { sheet, rows };
  }

  function sameCurveVector(values, prior) {
    return Array.isArray(prior) && prior.length === values.length && values.every((value, index) => {
      const before = prior[index] ?? null;
      return value === before || value > 0 && value <= 1 && before > 0 && before <= 1 && Math.abs(value - before) <= 1e-12;
    });
  }

  function applyCurveUpdate(table, rowKey, label, series, month, year) {
    const row = table?.rows.get(rowKey);
    if (row === undefined) return false;
    const { sheet } = table;
    const isMonthly = month == null;
    const [count, startColumn] = isMonthly ? [MONTHS.length, 1] : [HOURS.length, 2];
    const effective = domain.getCurve(series, year);
    const prior = isMonthly ? effective.monthlyWeights : effective.hourlyWeightsByMonth?.[month];
    const updated = Array.from({ length: count }, (_, index) => numberAt(sheet, row, startColumn + index, "ratio"));
    if (updated.every((value) => value === null)) return false;
    const values = updated.map((value, index) => value ?? prior?.[index] ?? null);
    if (sameCurveVector(values, prior)) return false;
    const issue = domain.validateShares(values, count, `${sheet.location(row, startColumn)} ${label}`);
    if (issue) throw new Error(issue);

    if (year == null) {
      if (isMonthly) series.monthlyWeights = values;
      else (series.hourlyWeightsByMonth ||= {})[month] = values;
      return true;
    }

    const overrides = series.curveOverridesByYear ||= {};
    const override = overrides[year] ||= {};
    const fallback = isMonthly ? series.monthlyWeights : series.hourlyWeightsByMonth?.[month];
    const matchesDefault = sameCurveVector(values, fallback);
    if (isMonthly) {
      if (matchesDefault) delete override.monthlyWeights;
      else override.monthlyWeights = values;
    } else if (matchesDefault) {
      if (override.hourlyWeightsByMonth) delete override.hourlyWeightsByMonth[month];
      if (override.hourlyWeightsByMonth && !Object.keys(override.hourlyWeightsByMonth).length) delete override.hourlyWeightsByMonth;
    } else (override.hourlyWeightsByMonth ||= {})[month] = values;
    if (!Object.keys(override).length) delete overrides[year];
    if (!Object.keys(overrides).length) delete series.curveOverridesByYear;
    return true;
  }

  function parseCurveWorkbook(project, workbook, { xlsx = root.XLSX, year = null, baseConfig } = {}) {
    try {
      if (!xlsx?.utils) throw new Error("Excel 组件未加载，请刷新后重试。");
      const years = periodYears(project);
      const scope = curveScope(years, year);
      const config = domain.prepareShareConfig(project, baseConfig);
      const { mode, series } = activeCurves(config);
      validateCurveNotes(workbook, xlsx, years, scope, mode);
      const columns = headers(years);
      const monthly = curveRows(workbook, xlsx, CURVE_SHEETS.monthly, columns.monthly, series, false);
      const hourly = curveRows(workbook, xlsx, CURVE_SHEETS.hourly, columns.hourly, series, true);
      const changes = [];
      for (const descriptor of series) {
        const { label, key, branch } = descriptor;
        const current = mutableSeries(config, descriptor, project);
        if (applyCurveUpdate(monthly, label, `${label}分月占比`, current, null, year)) changes.push({ key, branch, label, month: null, year });
        for (const month of MONTHS) {
          if (applyCurveUpdate(hourly, `${label}/${month}`, `${label}${month}月分时占比`, current, month, year)) {
            changes.push({ key, branch, label, month, year });
          }
        }
      }
      const compatible = baseConfig?.startYear === years[0] && baseConfig?.forecastYears === years.length;
      return { ok: true, config: !changes.length && compatible ? clone(baseConfig) : config, errors: [], changes, changedRows: changes.length };
    } catch (error) {
      return { ok: false, config: null, errors: [error?.message || "供需曲线模板读取失败。"], changes: [], changedRows: 0 };
    }
  }

  function growthDescriptor(config, seriesKey) {
    const descriptor = activeCurves(config).series.find(({ key, branch }) => {
      if (branch === "export") return seriesKey === "tieLineExport";
      if (branch === "import") return seriesKey === "tieLineImport";
      return seriesKey === key;
    });
    if (!descriptor) throw new Error("请选择当前联络线方式下有效的供需要素。");
    return descriptor;
  }

  function growthBasis(series) {
    return Object.hasOwn(series || {}, "capacityHours") ? CAPACITY_GROWTH : ENERGY_GROWTH;
  }

  function workbookGrowthBasis(sheet) {
    const label = sheet.value(2, 2);
    const value = sheet.value(2, 3);
    if ([label, value].some((cell) => cell != null && cell !== "")) {
      assertLabel(sheet, 2, 2, GROWTH_BASIS_LABEL);
      if (![CAPACITY_GROWTH, ENERGY_GROWTH].includes(value)) {
        throw new Error("模板增速口径无效，请重新下载当前要素的增长率模板。");
      }
      return value;
    }
    // The first capacity release recorded its basis in the instructions.
    const instructions = sheet.value(3, 1);
    return typeof instructions === "string" && instructions.startsWith(`用于${CAPACITY_GROWTH}增速。`)
      ? CAPACITY_GROWTH : ENERGY_GROWTH;
  }

  function buildGrowthWorkbook(project, config, { xlsx = root.XLSX, seriesKey } = {}) {
    if (!xlsx?.utils) throw new Error("Excel 组件未加载，请刷新后重试。");
    const years = periodYears(project);
    const editable = domain.prepareShareConfig(project, config);
    const descriptor = growthDescriptor(editable, seriesKey);
    const series = readSeries(editable, descriptor);
    const rates = series?.growthRatesByYear;
    const basis = growthBasis(series);
    const sheet = xlsx.utils.aoa_to_sheet([
      [GROWTH_TEMPLATE_NAME, GROWTH_TEMPLATE_VERSION],
      ["起始年", years[0], "末年", years.at(-1)],
      ["供需要素", descriptor.label, GROWTH_BASIS_LABEL, basis],
      ["填写说明", `用于${basis}增速。5 或 5% 均为增长 5%。空白沿用，填 0 更新为零。`],
      ["年份", "增长率（%）"],
      ...years.slice(1).map((year) => [year, exportValue(rates?.[year])])
    ]);
    sheet["!cols"] = [19, 24, 14, 20].map((wch) => ({ wch }));
    sheet["!merges"] = [{ s: { r: 3, c: 1 }, e: { r: 3, c: 3 } }];
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, GROWTH_SHEET);
    return workbook;
  }

  function validateGrowthHeader(sheet, years, descriptor, basis) {
    ["起始年", "末年"].forEach((label, index) => assertLabel(sheet, 1, index * 2, label));
    if (sheet.value(1, 1) !== years[0] || sheet.value(1, 3) !== years.at(-1)) {
      throw new Error(`模板测算周期与项目不符，请下载 ${years[0]}—${years.at(-1)} 年增长率模板。`);
    }
    assertLabel(sheet, 0, 0, GROWTH_TEMPLATE_NAME);
    assertLabel(sheet, 0, 1, GROWTH_TEMPLATE_VERSION);
    assertLabel(sheet, 2, 0, "供需要素");
    if (sheet.value(2, 1) !== descriptor.label) {
      throw new Error(`模板供需要素与当前选择不符，请下载「${descriptor.label}」的增长率模板。`);
    }
    if (workbookGrowthBasis(sheet) !== basis) {
      throw new Error(`模板增速口径与当前配置不符。当前按${basis}增长，请下载「${descriptor.label}」的当前增速模板。`);
    }
    assertLabel(sheet, GROWTH_HEADER_ROW, 0, "年份");
    assertLabel(sheet, GROWTH_HEADER_ROW, 1, "增长率（%）");
  }

  function parseGrowthWorkbook(project, workbook, { xlsx = root.XLSX, seriesKey, baseConfig } = {}) {
    try {
      if (!xlsx?.utils) throw new Error("Excel 组件未加载，请刷新后重试。");
      const years = periodYears(project);
      const compatible = [1, 2].includes(baseConfig?.version) && baseConfig.startYear === years[0] &&
        baseConfig.forecastYears === years.length && isObject(baseConfig.elements);
      const config = compatible ? clone(baseConfig) : domain.prepareShareConfig(project, baseConfig);
      const descriptor = growthDescriptor(config, seriesKey);
      const selected = readSeries(config, descriptor);
      const rowLimit = GROWTH_HEADER_ROW + years.length;
      const sheet = reader(workbook, xlsx, GROWTH_SHEET, GROWTH_HEADER_ROW + domain.MAX_FORECAST_YEARS, 4);
      if (workbook.SheetNames.length !== 1) throw new Error(`增长率模板仅包含「${GROWTH_SHEET}」工作表。`);
      validateGrowthHeader(sheet, years, descriptor, growthBasis(selected));
      if (sheet.lastRow >= rowLimit) throw new Error("增长率模板存在测算周期外的数据行，请按原模板填写。");
      const rates = selected?.growthRatesByYear;
      const allowedYears = new Set(years.slice(1));
      const readYears = new Set();
      const changes = [];
      for (let row = GROWTH_HEADER_ROW; row < rowLimit; row += 1) {
        for (const column of [2, 3]) {
          const cell = sheet.cell(row, column);
          if (cell?.f || cell?.v != null && cell.v !== "") {
            throw new Error(`${sheet.location(row, column)} 超出增长率模板列，请核对表头。`);
          }
        }
        if (row === GROWTH_HEADER_ROW) continue;
        const year = numberAt(sheet, row, 0, "year");
        const value = numberAt(sheet, row, 1, "growth");
        if (year === null && value === null) continue;
        if (!allowedYears.has(year)) {
          throw new Error(`${sheet.location(row, 0)} 须填写首年之后、测算周期内的年份。`);
        }
        if (readYears.has(year)) throw new Error(`${sheet.location(row, 0)} 的年份 ${year} 重复。`);
        readYears.add(year);
        if (value === null) continue;
        if (value < -100) throw new Error(`${sheet.location(row, 1)} 的增长率不能低于 -100%。`);
        if (value !== rates?.[year]) changes.push({ year, value });
      }
      if (changes.length) {
        const series = mutableSeries(config, descriptor, project);
        if (!isObject(series.growthRatesByYear)) series.growthRatesByYear = {};
        for (const { year, value } of changes) series.growthRatesByYear[year] = value;
      }
      return { ok: true, config, errors: [], changes, changedRows: changes.length };
    } catch (error) {
      return { ok: false, config: null, errors: [error?.message || "供需增长率模板读取失败。"], changes: [], changedRows: 0 };
    }
  }

  async function readTemplateFile(project, file, options, parse) {
    const xlsx = options.xlsx || root.XLSX;
    try {
      if (!/\.xlsx$/i.test(String(file?.name || ""))) throw new Error("请导入 Excel 供需模板（.xlsx）。");
      if (file.size > MAX_FILE_BYTES) throw new Error("供需模板请控制在 5 MB 以内。");
      if (!xlsx?.read) throw new Error("Excel 组件未加载，请刷新后重试。");
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("供需模板请控制在 5 MB 以内。");
      const workbook = xlsx.read(bytes, { type: "array", cellNF: true, cellDates: true });
      return parse(project, workbook, { ...options, xlsx });
    } catch (error) {
      return { ok: false, config: null, errors: [error?.message || "供需模板读取失败。"] };
    }
  }

  function readFile(project, file, options = {}) {
    return readTemplateFile(project, file, options, parseWorkbook);
  }

  function readCurveFile(project, file, options = {}) {
    return readTemplateFile(project, file, options, (input, workbook, settings) => {
      if (!settings.allowLegacy || workbook.SheetNames?.includes(CURVE_SHEETS.notes) || !workbook.SheetNames?.includes(SHEETS.annual)) {
        return parseCurveWorkbook(input, workbook, settings);
      }
      if (settings.year != null) return { ok: false, config: null, errors: ["旧版供需配置模板可导入默认典型年的曲线，请先切换到默认典型年。"] };
      const legacy = parseWorkbook(input, workbook, settings);
      if (!legacy.ok) return legacy;
      const curves = buildCurveWorkbook(input, legacy.config, settings);
      return { ...parseCurveWorkbook(input, curves, settings), legacy: true };
    });
  }

  async function readGrowthFile(project, file, options = {}) {
    const result = await readTemplateFile(project, file, options, parseGrowthWorkbook);
    return { changes: [], changedRows: 0, ...result };
  }

  function download(project, config, { xlsx = root.XLSX } = {}) {
    const workbook = buildWorkbook(project, config, { xlsx });
    const years = periodYears(project);
    const filename = `${csvUtils.sanitizeExportFilenamePart(project.name || "项目")}_供需配置模板_${years[0]}-${years.at(-1)}.xlsx`;
    xlsx.writeFile(workbook, filename);
  }

  function downloadCurves(project, config, { xlsx = root.XLSX, year = null } = {}) {
    const workbook = buildCurveWorkbook(project, config, { xlsx, year });
    const years = periodYears(project);
    const label = year === null ? DEFAULT_CURVE_LABEL : `${year}年`;
    const filename = `${csvUtils.sanitizeExportFilenamePart(project.name || "项目")}_供需曲线模板_${years[0]}-${years.at(-1)}_${label}.xlsx`;
    xlsx.writeFile(workbook, filename);
  }

  function downloadGrowth(project, config, { xlsx = root.XLSX, seriesKey } = {}) {
    const workbook = buildGrowthWorkbook(project, config, { xlsx, seriesKey });
    const { startYear, forecastYears } = project;
    const sheet = workbook.Sheets[GROWTH_SHEET];
    const label = sheet.B3.v;
    const templateLabel = sheet.D3.v === CAPACITY_GROWTH ? "供需装机增长率模板" : "供需增长率模板";
    const filename = `${csvUtils.sanitizeExportFilenamePart(project.name || "项目")}_${templateLabel}_${startYear}-${startYear + forecastYears - 1}_${label}.xlsx`;
    xlsx.writeFile(workbook, filename);
  }

  return Object.freeze({
    buildWorkbook, parseWorkbook, readFile, download, buildCurveWorkbook, parseCurveWorkbook, readCurveFile, downloadCurves,
    buildGrowthWorkbook, parseGrowthWorkbook, readGrowthFile, downloadGrowth
  });
});
