"use strict";

(function (root, factory) {
  const isCommonJs = typeof module !== "undefined" && module.exports;
  const api = factory(isCommonJs ? require("./revenue-calculator") : root.NE_REVENUE_CALCULATOR);
  if (isCommonJs) module.exports = api;
  root.NE_RESULT_BRIEF_DISPATCH = api;
  if (root.window && root.window !== root) root.window.NE_RESULT_BRIEF_DISPATCH = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (calculator) {
  const hoursInYear = 8760;
  const monthLabels = Array.from({ length: 12 }, (_, month) => `${month + 1}月`);
  const decimals = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatNumber = (value) => decimals.format(Math.abs(value) < 0.005 ? 0 : value);
  const valuesPresent = (row, keys) => row && keys.every((key) => Number.isFinite(row[key]));
  const agrees = (left, right) => Math.abs(left - right) <= Math.max(0.00001, Math.abs(right) * 1e-9);
  const hourlyMetrics = ["chargeMwh", "dischargeMwh", "incrementalRevenue"];

  function monthlyStorageTable(result, firstYear) {
    const hours = result.hourlyPreview;
    if (!Array.isArray(hours) || hours.length !== hoursInYear || !valuesPresent(firstYear.storageDispatch, hourlyMetrics)) return null;

    const accumulate = (target, item) => {
      target.chargeMwh += item.chargeMwh;
      target.dischargeMwh += item.dischargeMwh;
      target.incrementalRevenue += item.incrementalRevenue;
      return target;
    };
    const emptyMonth = () => ({ chargeMwh: 0, dischargeMwh: 0, incrementalRevenue: 0 });
    const months = monthLabels.map(emptyMonth);
    for (let index = 0; index < hoursInYear; index++) {
      const hour = hours[index];
      const item = hour?.storageDispatch;
      if (hour?.time !== calculator.hourIndexToTimestamp(firstYear.year, index)
        || !valuesPresent(item, hourlyMetrics) || item.chargeMwh < 0 || item.dischargeMwh < 0) return null;
      const month = Number(hour.time.slice(5, 7));
      accumulate(months[month - 1], item);
    }

    const total = months.reduce(accumulate, emptyMonth());
    if (!hourlyMetrics.every((key) => agrees(total[key], firstYear.storageDispatch[key]))) return null;

    const formatRow = (label, item) => [
      label, formatNumber(item.chargeMwh), formatNumber(item.dischargeMwh), formatNumber(item.incrementalRevenue / 10000)
    ];
    return {
      key: "monthly-storage-detail", title: "首年月度配储运行", headers: ["月份", "充电量（MWh）", "放电量（MWh）", "现货套利净收益（万元）"],
      rows: [...months.map((item, index) => formatRow(monthLabels[index], item)), formatRow("首年合计", total)]
    };
  }

  function annualStorage(rows) {
    const required = ["withStorageFullRevenue", "withoutStorageFullRevenue", "incrementalRevenue", "independentSupplementRevenue"];
    if (!rows.every((row) => {
      const item = row.storageDispatch;
      return valuesPresent(item, required) && agrees(item.withStorageFullRevenue, row.fullRevenue)
        && agrees(item.withStorageFullRevenue - item.withoutStorageFullRevenue, item.incrementalRevenue + item.independentSupplementRevenue);
    })) return null;

    return {
      key: "annual-storage", kind: "columns", title: "年度配储收益构成", unit: "万元",
      labels: rows.map((row) => String(row.year)),
      series: [
        { name: "现货套利净收益", values: rows.map((row) => row.storageDispatch.incrementalRevenue / 10000) },
        { name: "独立配储收益", values: rows.map((row) => row.storageDispatch.independentSupplementRevenue / 10000) }
      ]
    };
  }

  function mechanismSettlement(rows) {
    if (!rows.every((row) => valuesPresent(row, ["energyMwh", "mechanismRatio", "mechanismRevenue"])
      && row.energyMwh >= 0 && row.mechanismRatio >= 0 && row.mechanismRatio <= 1
      && (row.mechanismRatio > 0 || agrees(row.mechanismRevenue, 0)))) return null;
    const activeRows = rows.filter((row) => row.mechanismRatio > 0);
    if (!activeRows.length) return null;
    const firstInactiveYear = rows.find(({ year }) => year === activeRows.at(-1).year + 1);
    const displayedRows = firstInactiveYear ? [...activeRows, firstInactiveYear] : activeRows;

    return {
      key: "mechanism-settlement", title: "机制电量与差价结算",
      headers: ["年份", "机制电量占比（%）", "机制电量（MWh）", "差价结算（万元）"],
      rows: displayedRows.map((row) => [
        String(row.year), formatNumber(row.mechanismRatio * 100), formatNumber(row.energyMwh * row.mechanismRatio),
        formatNumber(row.mechanismRevenue / 10000)
      ])
    };
  }

  function buildDispatchExhibits(result) {
    const figures = [];
    const tables = [];
    const storageBlocks = [];
    const incomeBlocks = [];
    const exhibits = { figures, tables, storageBlocks, incomeBlocks };
    if (!Array.isArray(result?.annualRows) || !result.annualRows.length) return exhibits;

    const rows = [...result.annualRows].sort((left, right) => left?.year - right?.year);
    if (!rows.every((row, index) => Number.isInteger(row?.year) && (!index || rows[index - 1].year < row.year))) return exhibits;

    const mechanism = mechanismSettlement(rows);
    if (mechanism) {
      tables.push(mechanism);
      incomeBlocks.push({ kind: "table", key: mechanism.key });
    }
    const annual = annualStorage(rows);
    if (annual) {
      figures.push(annual);
      storageBlocks.push({ kind: "figure", key: annual.key });
      const detail = monthlyStorageTable(result, rows[0]);
      if (detail) {
        tables.push(detail);
        storageBlocks.push({ kind: "table", key: detail.key });
      }
    }
    return exhibits;
  }

  return Object.freeze({ buildDispatchExhibits });
});
