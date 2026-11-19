"use strict";

(function (root, factory) {
  const commonJs = typeof module !== "undefined" && module.exports;
  const api = factory(
    commonJs ? require("./revenue-calculator") : root.NE_REVENUE_CALCULATOR,
    commonJs ? require("./result-calculation") : root.NE_RESULT_CALCULATION
  );
  if (commonJs) module.exports = api;
  root.NE_RESULT_BRIEF_OPERATING = api;
  if (root.window && root.window !== root) root.window.NE_RESULT_BRIEF_OPERATING = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function ({ hourIndexToTimestamp }, { closeAmount }) {
  const HOURS_PER_YEAR = 8760;
  const MONTHS = Array.from({ length: 12 }, (_, index) => `${index + 1} 月`);
  const TIME_BLOCKS = ["00–05 时", "06–11 时", "12–17 时", "18–23 时"];
  const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const energy = (value) => decimal.format(value);
  const rate = (value, base) => base > 0 ? decimal.format(value / base * 100) : "—";
  const asPrice = (value) => Number.isFinite(value) ? decimal.format(Math.abs(value) < 0.005 ? 0 : value) : "—";
  const figureBlock = (key) => ({ kind: "figure", key });
  const tableBlock = (key) => ({ kind: "table", key });

  function emptyGroup() {
    return { hours: 0, energyMwh: 0, spotRevenue: 0, priceSum: 0 };
  }

  function addHour(group, row) {
    group.hours += 1;
    group.energyMwh += row.energyMwh;
    group.spotRevenue += row.spotRevenue;
    group.priceSum += row.spotPrice;
  }

  function groupHours(rows, size, groupIndex) {
    const groups = Array.from({ length: size }, emptyGroup);
    rows.forEach((row) => addHour(groups[groupIndex(row)], row));
    return groups;
  }

  function validFirstYearHours(hourly, first) {
    if (!Array.isArray(hourly) || hourly.length !== HOURS_PER_YEAR || !first || !Number.isInteger(first.year)) return null;
    const totals = emptyGroup();
    for (let index = 0; index < hourly.length; index += 1) {
      const row = hourly[index];
      if (row?.time !== hourIndexToTimestamp(first.year, index) || !Number.isFinite(row.energyMwh) || row.energyMwh < 0 ||
          !Number.isFinite(row.spotPrice) || !closeAmount(row.spotRevenue, row.energyMwh * row.spotPrice)) return null;
      addHour(totals, row);
    }
    return closeAmount(totals.energyMwh, first.energyMwh) && closeAmount(totals.spotRevenue, first.spotRevenue) &&
      closeAmount(totals.priceSum / HOURS_PER_YEAR, first.spotAvgPrice) ? { hourly, totals } : null;
  }

  function marketMean(group) {
    return group.hours > 0 ? group.priceSum / group.hours : null;
  }

  function capturePrice(group) {
    return group.energyMwh > 0 ? group.spotRevenue / group.energyMwh : null;
  }

  function captureSpread(group) {
    const captured = capturePrice(group);
    return captured === null || !group.hours ? null : captured - marketMean(group);
  }

  function annualEnergyFigure(annual, totalEnergy) {
    if (annual.length < 2 || !annual.every((row, index) => Number.isInteger(row?.year) && Number.isFinite(row.energyMwh) &&
        row.energyMwh >= 0 && (index === 0 || row.year === annual[index - 1].year + 1)) ||
        !closeAmount(annual.reduce((sum, row) => sum + row.energyMwh, 0), totalEnergy)) return null;
    return { key: "annual-energy", kind: "columns", title: "年度结算电量", labels: annual.map((row) => String(row.year)),
      unit: "万 MWh", series: [{ name: "结算电量", values: annual.map((row) => row.energyMwh / 10000) }] };
  }

  function monthlyCaptureFigure(months) {
    return {
      key: "monthly-capture", title: "首年月度电量与捕获价差", kind: "monthly-capture", labels: MONTHS,
      energyUnit: "万 MWh", spreadUnit: "元/MWh", caption: "捕获价差为各月捕获电价减去同月现货均价。",
      series: [
        { name: "结算电量", values: months.map((month) => month.energyMwh / 10000) },
        { name: "捕获价差", values: months.map(captureSpread) }
      ]
    };
  }

  function monthlyFinding(months, totals, first) {
    if (!(totals.energyMwh > 0) || !closeAmount(capturePrice(totals), first.capturePrice)) return "";
    let distribution = 0;
    let withinMonth = 0;
    for (const month of months) {
      const energyShare = month.energyMwh / totals.energyMwh;
      distribution += (energyShare - month.hours / totals.hours) * marketMean(month);
      withinMonth += energyShare * (captureSpread(month) ?? 0);
    }
    const difference = first.capturePrice - first.spotAvgPrice;
    if (!closeAmount(distribution + withinMonth, difference) ||
        Math.max(Math.abs(distribution), Math.abs(withinMonth)) < 0.005) return "";
    const comparison = Math.abs(difference) < 0.005 ? "与现货时均价基本持平"
      : `较现货时均价${difference > 0 ? "高" : "低"} ${asPrice(Math.abs(difference))} 元/MWh`;
    const signed = (value) => `${value >= 0.005 ? "+" : ""}${asPrice(value)}`;
    return `首年捕获电价${comparison}。电量在各月的分布贡献 ${signed(distribution)} 元/MWh，各月内部的捕获价差贡献 ${signed(withinMonth)} 元/MWh。`;
  }

  function durationFigure(sortedPrices) {
    const percentages = Array.from({ length: 21 }, (_, index) => index * 5);
    return {
      key: "duration-price", title: "首年现货电价持续曲线", kind: "lines", labels: percentages.map((pct) => `${pct}%`), unit: "元/MWh",
      caption: "横轴为按现货电价从高到低排列的累计小时占比。",
      series: [{ name: "现货电价", values: percentages.map((pct) => sortedPrices[Math.round((1 - pct / 100) * (sortedPrices.length - 1))]) }]
    };
  }

  function energyRow(label, group, totalEnergy) {
    return [label, energy(group.energyMwh), rate(group.energyMwh, totalEnergy)];
  }

  function buildMonthlyTable(months) {
    return {
      key: "monthly-price-energy", title: "首年月度电量与电价",
      headers: ["月份", "结算电量（MWh）", "现货均价（元/MWh）", "捕获电价（元/MWh）", "捕获价差（元/MWh）"],
      rows: months.map((month, index) => [MONTHS[index], energy(month.energyMwh), asPrice(marketMean(month)),
        asPrice(capturePrice(month)), asPrice(captureSpread(month))])
    };
  }

  function priceBands(sortedPrices) {
    const firstNonnegative = sortedPrices.findIndex((price) => price >= 0);
    const nonnegative = firstNonnegative === -1 ? [] : sortedPrices.slice(firstNonnegative);
    const cuts = nonnegative.length ? [0.25, 0.75].map((ratio) => Math.round(nonnegative[Math.floor(ratio * (nonnegative.length - 1))])) : [];
    const limits = [...new Set([0, ...cuts.filter((cut) => cut > 0)])];
    return [
      { min: -Infinity, max: 0, label: "低于 0" },
      ...limits.map((min, index) => {
        const next = limits[index + 1];
        return { min, max: next ?? Infinity, label: next === undefined ? `${integer.format(min)} 及以上` : `${integer.format(min)} 至不足 ${integer.format(next)}` };
      })
    ];
  }

  function buildBandsTable(hourly, sortedPrices, totals) {
    const bands = priceBands(sortedPrices);
    const distribution = groupHours(hourly, bands.length,
      ({ spotPrice }) => bands.findIndex(({ min, max }) => spotPrice >= min && spotPrice < max));
    return {
      key: "price-bands", title: "首年现货价格区间分布",
      headers: ["价格区间（元/MWh）", "小时数", "小时占比（%）", "结算电量（MWh）", "电量占比（%）"],
      rows: distribution.map((group, index) => [bands[index].label, integer.format(group.hours), rate(group.hours, totals.hours),
        energy(group.energyMwh), rate(group.energyMwh, totals.energyMwh)])
    };
  }

  function buildTimeTable(timeBlocks, totalEnergy) {
    return {
      key: "time-blocks", title: "首年分时电量与捕获电价",
      headers: ["时段", "结算电量（MWh）", "电量占比（%）", "现货均价（元/MWh）", "捕获电价（元/MWh）"],
      rows: timeBlocks.map((group, index) => [...energyRow(TIME_BLOCKS[index], group, totalEnergy), asPrice(marketMean(group)), asPrice(capturePrice(group))])
    };
  }

  function hourlyExhibits({ hourly, totals }, first) {
    const monthIndex = (row) => Number(row.time.slice(-11, -9)) - 1;
    const months = groupHours(hourly, MONTHS.length, monthIndex);
    const timeBlocks = groupHours(hourly, TIME_BLOCKS.length, (row) => Math.floor(Number(row.time.slice(-5, -3)) / 6));
    const sortedPrices = hourly.map((row) => row.spotPrice).sort((a, b) => a - b);
    const monthly = totals.energyMwh > 0 ? monthlyCaptureFigure(months) : null;
    return {
      figures: [...(monthly ? [monthly] : []), durationFigure(sortedPrices)],
      tables: [buildMonthlyTable(months), buildBandsTable(hourly, sortedPrices, totals), buildTimeTable(timeBlocks, totals.energyMwh)],
      monthly,
      finding: monthlyFinding(months, totals, first)
    };
  }

  function buildOperatingExhibits(result) {
    const annual = Array.isArray(result?.annualRows) ? result.annualRows.slice().sort((a, b) => a?.year - b?.year) : [];
    const annualEnergy = annualEnergyFigure(annual, result?.totalEnergy);
    const saved = validFirstYearHours(result?.hourlyPreview, annual[0]);
    const { figures, tables, monthly, finding } = saved ? hourlyExhibits(saved, annual[0]) : { figures: [], tables: [] };
    if (annualEnergy) figures.unshift(annualEnergy);
    const sections = [];
    if (annualEnergy) sections.push({ key: "settlement", title: "结算电量", intro: [], blocks: [figureBlock(annualEnergy.key)] });
    if (saved) sections.push({ key: "spot-detail", title: "首年现货与电量分布", intro: finding ? [finding] : [], blocks: [
      ...(monthly ? [figureBlock(monthly.key)] : []), tableBlock("monthly-price-energy"),
      figureBlock("duration-price"), tableBlock("price-bands"), tableBlock("time-blocks")
    ] });
    return { figures, tables, sections };
  }

  return Object.freeze({ buildOperatingExhibits });
});
