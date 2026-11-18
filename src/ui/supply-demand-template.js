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
      lastColumn: range.e.c
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
    const parsed = percent && kind === "growth" && typeof value === "number" ? raw * 100
      : percent && kind === "weight" && typeof value === "string" ? raw / 100 : raw;
    if (kind === "month" && (percent || cell?.t === "e" || cell?.t === "d")) return NaN;
    if (kind !== "month" && (!Number.isFinite(parsed) || cell?.t === "e" || cell?.t === "d" || percent && kind === "base")) {
      const expected = { growth: "有效增长率", base: "MWh 数值", weight: "有效权重" };
      throw new Error(`${sheet.location(row, column)} 须填写${expected[kind]}。`);
    }
    return parsed;
  }

  function assertLabel(sheet, row, column, expected) {
    if (sheet.value(row, column) !== expected) throw new Error(`${sheet.location(row, column)} 应为「${expected}」，请使用当前项目模板。`);
  }

  function locateRows(sheet, headerRow, columns, monthRows) {
    columns.forEach((label, index) => assertLabel(sheet, headerRow, index, label));
    const rows = new Map();
    const rowCount = SERIES.length * (monthRows ? MONTHS.length : 1);
    const cellHasValue = (row, column) => sheet.cell(row, column)?.f || (sheet.value(row, column) != null && sheet.value(row, column) !== "");
    for (let row = headerRow; row <= headerRow + rowCount; row += 1) {
      for (let column = columns.length; column <= sheet.lastColumn; column += 1) {
        if (cellHasValue(row, column)) throw new Error(`${sheet.location(row, column)} 超出当前测算周期的模板列，请核对表头。`);
      }
    }
    for (let row = headerRow + 1; row <= headerRow + rowCount; row += 1) {
      const label = sheet.value(row, 0);
      if ((label == null || label === "") && columns.every((_, column) => !cellHasValue(row, column))) continue;
      if (!SERIES.some((series) => series.label === label)) throw new Error(`${sheet.location(row, 0)} 的供需要素无效。`);
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

  async function readFile(project, file, options = {}) {
    const xlsx = options.xlsx || root.XLSX;
    try {
      if (!/\.xlsx$/i.test(String(file?.name || ""))) throw new Error("请导入 Excel 供需模板（.xlsx）。");
      if (file.size > MAX_FILE_BYTES) throw new Error("供需模板请控制在 5 MB 以内。");
      if (!xlsx?.read) throw new Error("Excel 组件未加载，请刷新后重试。");
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("供需模板请控制在 5 MB 以内。");
      const workbook = xlsx.read(bytes, { type: "array", cellNF: true, cellDates: true });
      return parseWorkbook(project, workbook, { ...options, xlsx });
    } catch (error) {
      return { ok: false, config: null, errors: [error?.message || "供需模板读取失败。"] };
    }
  }

  function download(project, config, { xlsx = root.XLSX } = {}) {
    const workbook = buildWorkbook(project, config, { xlsx });
    const years = periodYears(project);
    const filename = `${csvUtils.sanitizeExportFilenamePart(project.name || "项目")}_供需配置模板_${years[0]}-${years.at(-1)}.xlsx`;
    xlsx.writeFile(workbook, filename);
  }

  return Object.freeze({ buildWorkbook, parseWorkbook, readFile, download });
});
