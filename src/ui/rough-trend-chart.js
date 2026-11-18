"use strict";

(function (root, factory) {
  const commonJs = typeof module !== "undefined" && module.exports;
  const api = factory(commonJs ? require("../domain/revenue-rules") : root.NE_REVENUE_RULES);
  if (commonJs) module.exports = api;
  root.NE_ROUGH_TREND_CHART = api;
  if (root.window && root.window !== root) root.window.NE_ROUGH_TREND_CHART = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (revenueRules) {
  const SERIES = Object.freeze([
    Object.freeze({ key: "spotAvgPrice", label: "现货均价", stroke: "solid", colorKey: "spot" }),
    Object.freeze({ key: "capturePrice", label: "捕获电价", stroke: "dashed", colorKey: "capture" }),
    Object.freeze({ key: "fullRevenuePrice", label: "综合结算价", stroke: "solid", colorKey: "settlement" })
  ]);
  const DEFAULT_COLORS = Object.freeze({ spot: "#1e5fa9", capture: "#a96007", settlement: "#16895c",
    ink: "#182b40", muted: "#536477", line: "#e2e8f0", lineStrong: "#aab8ca", panel: "#ffffff" });
  const axisNumber = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  const priceNumber = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function priceAxis(rows) {
    const values = rows.flatMap((row) => SERIES.map(({ key }) => row[key])).filter(Number.isFinite);
    const low = values.length ? Math.min(...values) : 0;
    const high = values.length ? Math.max(...values) : 0;
    // Keep ECharts' internal linear scale finite even for extreme saved prices.
    const magnitude = Math.max(Math.abs(low), Math.abs(high));
    const exponent = magnitude > 1e9 ? Math.floor(Math.log10(magnitude)) : 0;
    const scale = 10 ** exponent;
    const bottom = low / scale;
    const top = high / scale;
    const span = top - bottom;
    const margin = Math.max(scale === 1 ? 1 : 0.02, span * 0.07, span === 0 ? Math.abs(top) * 0.02 : 0);
    const target = (span + 2 * margin) / 5;
    const base = 10 ** Math.floor(Math.log10(target));
    const step = [1, 2, 2.5, 5, 10].map((factor) => base * factor).find((value) => value >= target) ?? base * 10;
    const interval = Math.max(scale === 1 ? 1 : 0.01, step);
    const formatter = (value) => exponent ? `${axisNumber.format(value)}e+${exponent}` : axisNumber.format(value);
    return { scale, interval, formatter,
      min: Math.floor((bottom - margin) / interval) * interval,
      max: Math.ceil((top + margin) / interval) * interval };
  }

  function yearTicks(rows, width) {
    if (!rows.length) return new Set();
    const first = rows[0].year;
    const last = rows.at(-1).year;
    const available = Number.isFinite(width) && width > 0 ? width : 760;
    const plotWidth = Math.max(1, available - 80);
    const count = Math.max(2, Math.min(9, Math.floor(plotWidth / 70) + 1));
    const target = (last - first) / (count - 1);
    const interval = [1, 2, 5, 10, 15, 20, 25, 50, 100].find((step) => step >= target) ?? 100;
    const edgeGap = (last - first) * 34 / plotWidth;
    const ticks = new Set([first, last]);
    for (const { year } of rows) {
      if (year % interval === 0 && year - first >= edgeGap && last - year >= edgeGap) ticks.add(year);
    }
    return ticks;
  }

  function spotNodes(snapshot, rows, scale, colors) {
    const saved = Array.isArray(snapshot?.draft?.spotNodes) ? snapshot.draft.spotNodes : [];
    const years = new Set(saved.map((node) => Number(node?.year)));
    const end = rows.at(-1)?.year;
    return rows.filter((row) => years.has(row.year) || row.year === end).map((row) => {
      const final = row.year === end;
      return { name: final ? "测算末年" : "价格节点", coord: [String(row.year), row.spotAvgPrice / scale],
        symbol: final ? "diamond" : "circle", symbolSize: final ? 12 : 8,
        itemStyle: { color: final ? colors.spot : colors.panel, borderColor: final ? colors.panel : colors.spot, borderWidth: 2 } };
    });
  }

  function feeItems(config, row) {
    const fees = revenueRules.getOtherNetBreakdown(config, row.year, row.fee, row.otherIncome);
    return fees.primaryFees === null
      ? { "费用及其他净收入合计": row.otherIncome - row.fee }
      : { "三项费用": -fees.primaryFees, "其他净收入": fees.otherNetIncome };
  }

  function settlementParts(config, row) {
    return { "机制补差": row.mechanismAdjustment, "交易策略": (1 - row.mechanismRatio) * row.ltPnlPrice,
      "环境价值": row.envValue, "配储补充": row.storageSupplement, ...feeItems(config, row) };
  }

  function mechanismEnds(config, previous, current) {
    const end = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(config?.mechanismEndYm);
    if (config?.mechanismEnabled !== true || !end || !(previous.mechanismRatio > current.mechanismRatio)) return false;
    const year = Number(end[1]);
    return (current.year === year && Number(end[2]) < 12) ||
      (previous.year === year && current.year === year + 1 && current.mechanismRatio === 0);
  }

  function settlementDriver(snapshot, previous, current) {
    if (!previous || previous.year + 1 !== current.year) return null;
    const change = current.fullRevenuePrice - previous.fullRevenuePrice;
    const residual = change - (current.capturePrice - previous.capturePrice);
    const direction = Math.sign(change);
    if (Math.abs(change) < Math.max(10, Math.abs(previous.fullRevenuePrice) * 0.05) || residual * direction < 10) return null;
    const config = snapshot.calculationConfig || snapshot.config;
    const before = settlementParts(config, previous);
    const after = settlementParts(config, current);
    const driver = Object.entries(after).map(([label, value]) => ({ label, delta: value - before[label] }))
      .filter(({ delta }) => Number.isFinite(delta) && delta * direction > 0)
      .sort((first, second) => (second.delta - first.delta) * direction)[0];
    if (driver?.label === "机制补差" && mechanismEnds(config, previous, current)) driver.label = "机制补差（机制到期）";
    return driver;
  }

  function priceText(value, signed = false) {
    if (!Number.isFinite(value)) return "—";
    const formatted = Math.abs(value) >= 1e12 ? value.toExponential(2) : priceNumber.format(value);
    return signed && value > 0 ? `+${formatted}` : formatted;
  }

  function tooltipFormatter(snapshot, rows, nodes, visible, colors) {
    const byYear = new Map(rows.map((row, index) => [String(row.year), index]));
    const nodeLabels = new Map(nodes.map((node) => [node.coord[0], node.name]));
    return (params) => {
      const hovered = Array.isArray(params) ? params[0] : params;
      const index = byYear.get(String(hovered?.axisValue)) ?? hovered?.dataIndex;
      const row = rows[index];
      if (!row) return "";
      const node = visible.spotAvgPrice !== false ? nodeLabels.get(String(row.year)) : null;
      const items = SERIES.filter(({ key }) => visible[key] !== false).map(({ key, label, colorKey }) =>
        `<div class="rough-tooltip-row"><span><i aria-hidden="true" style="background:${colors[colorKey]}"></i>${label}</span><span class="rough-tooltip-value">${priceText(row[key])}</span></div>`);
      if (visible.fullRevenuePrice !== false && visible.capturePrice !== false) {
        items.push(`<div class="rough-tooltip-row rough-tooltip-note"><span>结算价较捕获价</span><span class="rough-tooltip-value">${priceText(row.fullRevenuePrice - row.capturePrice, true)}</span></div>`);
      }
      const driver = visible.fullRevenuePrice !== false ? settlementDriver(snapshot, rows[index - 1], row) : null;
      if (driver) items.push(`<div class="rough-tooltip-driver">较上年主要变动 ${driver.label} ${priceText(driver.delta, true)}</div>`);
      return `<div class="rough-tooltip-year"><strong>${row.year} 年${node ? ` · ${node}` : ""}</strong><span>元/MWh</span></div>${items.join("")}`;
    };
  }

  function buildOption(snapshot, visible = {}, tokens = {}, width) {
    const rows = Array.isArray(snapshot?.rows) ? snapshot.rows.slice().sort((a, b) => a.year - b.year) : [];
    const colors = { ...DEFAULT_COLORS, ...tokens };
    const axis = priceAxis(rows);
    const years = rows.map((row) => String(row.year));
    const ticks = yearTicks(rows, width);
    const nodes = spotNodes(snapshot, rows, axis.scale, colors);
    const axisLabel = { color: colors.muted, fontSize: 11 };
    return {
      animation: false,
      grid: { left: 12, right: 22, top: 19, bottom: 12, containLabel: true },
      legend: { show: false, data: SERIES.map(({ label }) => ({ name: label })),
        selected: Object.fromEntries(SERIES.map(({ key, label }) => [label, visible[key] !== false])) },
      tooltip: { trigger: "axis", triggerOn: "mousemove|click", confine: true, hideDelay: 0, transitionDuration: 0,
        className: "rough-year-tooltip", backgroundColor: colors.panel, borderColor: colors.lineStrong, borderWidth: 1,
        padding: [9, 12], textStyle: { color: colors.ink, fontSize: 12 },
        axisPointer: { axis: "x", type: "line", snap: true, lineStyle: { color: colors.lineStrong, type: "dashed" } },
        formatter: tooltipFormatter(snapshot, rows, nodes, visible, colors) },
      xAxis: { type: "category", data: years, boundaryGap: years.length === 1,
        axisTick: { show: false }, axisLine: { onZero: false, lineStyle: { color: colors.lineStrong } },
        axisLabel: { ...axisLabel, interval: (_, year) => ticks.has(Number(year)), showMinLabel: true, showMaxLabel: true } },
      yAxis: { type: "value", min: axis.min, max: axis.max, interval: axis.interval,
        axisLine: { show: true, lineStyle: { color: colors.lineStrong } }, axisTick: { show: false },
        axisLabel: { ...axisLabel, formatter: axis.formatter }, splitLine: { show: true, lineStyle: { color: colors.line } } },
      series: SERIES.map(({ key, label, stroke, colorKey }, index) => ({
        id: key, name: label, type: "line", smooth: false, connectNulls: false, z: index + 2,
        showSymbol: rows.length === 1 && index > 0, symbol: "circle", symbolSize: 7,
        itemStyle: { color: colors[colorKey] }, lineStyle: { color: colors[colorKey], type: stroke, width: index === 2 ? 3 : 2 },
        data: rows.map((row) => Number.isFinite(row[key]) ? row[key] / axis.scale : null),
        ...(index === 0 ? { markPoint: { silent: true, label: { show: false }, data: nodes } } : {})
      }))
    };
  }

  return Object.freeze({ SERIES, buildOption });
});
