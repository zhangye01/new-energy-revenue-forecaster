"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_SUPPLY_DEMAND_CHART = api;
  if (root.window && root.window !== root) root.window.NE_SUPPLY_DEMAND_CHART = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const SUPPLY = [
    ["wind", "风电出力", "#4387c7"],
    ["solar", "光伏出力", "#d7922c"],
    ["hydro", "水电出力", "#28988f"],
    ["nonMarket", "非市场化出力", "#8374be"],
    ["tieLineImport", "联络线受入", "#c87083"]
  ];
  const ROW_KEYS = [...SUPPLY.map(([key]) => key), "load", "tieLineExport", "residualDemand"];
  const DEMAND_LABEL = "总需求";
  const DEFAULT_TOKENS = { ink: "#182b40", muted: "#536477", line: "#e2e8f0", lineStrong: "#aab8ca", panel: "#ffffff" };
  const quantity = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  const compactQuantity = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });

  function chartRows(dataset, year, month, monthly) {
    if (!dataset?.ok || !Array.isArray(dataset.typicalRows) || !Number.isInteger(year)) return null;
    const selected = dataset.typicalRows.filter((row) => row?.year === year && (monthly || row.month === month));
    const count = monthly ? 12 : 24;
    if (selected.length !== (monthly ? count * 24 : count)) return null;
    const points = Array.from({ length: count }, () => Object.fromEntries(ROW_KEYS.map((key) => [key, 0])));
    const seen = new Set();
    for (const row of selected) {
      const { month: rowMonth, hour, representedDays } = row;
      if (!Number.isInteger(rowMonth) || rowMonth < 1 || rowMonth > 12 || !Number.isInteger(hour) || hour < 0 || hour > 23
          || !ROW_KEYS.every((key) => Number.isFinite(row[key])) || (monthly && !(Number.isInteger(representedDays) && representedDays > 0))) return null;
      const hourKey = (rowMonth - 1) * 24 + hour;
      if (seen.has(hourKey)) return null;
      seen.add(hourKey);
      const point = points[monthly ? rowMonth - 1 : hour];
      for (const key of ROW_KEYS) point[key] += row[key] * (monthly ? representedDays : 1);
    }
    for (const point of points) {
      point.demand = point.load + point.tieLineExport;
      point.supply = SUPPLY.reduce((sum, [key]) => sum + point[key], 0);
      if (!Object.values(point).every(Number.isFinite)) return null;
    }
    return points;
  }

  function tooltipFormatter(points, labels, heading) {
    return (params) => {
      const point = points[params?.[0]?.dataIndex];
      if (!point) return "";
      const parts = [
        ["供给合计", point.supply], [DEMAND_LABEL, point.demand], ["剩余需求", point.residualDemand],
        ...SUPPLY.map(([key, label]) => [label, point[key]]),
        ["省内负荷", point.load], ["联络线送出", point.tieLineExport]
      ];
      const header = `${heading}${labels[params[0].dataIndex]}`;
      return `<strong>${header}</strong><br>${parts.map(([label, value]) => {
        const prefix = label === "剩余需求" && value > 0 ? "+" : "";
        return `${label}　${prefix}${quantity.format(value)} MWh`;
      }).join("<br>")}`;
    };
  }

  function buildOption(dataset, { year, month = 1, granularity = "monthly", tokens = {}, width } = {}) {
    if (granularity !== "monthly" && granularity !== "typical") return null;
    const monthly = granularity === "monthly";
    const points = chartRows(dataset, year, month, monthly);
    if (!points) return null;
    const colors = { ...DEFAULT_TOKENS, ...tokens };
    const labels = points.map((_, index) => monthly ? `${index + 1}月` : `${String(index).padStart(2, "0")}:00`);
    const narrow = Number.isFinite(width) && width < 480;
    const interval = monthly ? (narrow ? 2 : 1) : (narrow ? 4 : 3);
    const heading = monthly ? `${year}年` : `${year}年${month}月典型日 `;
    const supplySeries = SUPPLY.map(([key, name, color]) => ({
      id: key, name, type: "line", stack: "supply", showSymbol: false,
      lineStyle: { color, width: 1 }, itemStyle: { color }, areaStyle: { color, opacity: 0.72 },
      data: points.map((point) => point[key])
    }));
    return {
      animation: false,
      aria: { enabled: true, label: { description: `${heading}供需。堆积面积为分项供给，折线为省内负荷与联络线送出合计。` } },
      grid: { top: 55, right: 22, bottom: 13, left: 10, containLabel: true },
      legend: { type: "scroll", left: 10, right: 12, top: 3, selectedMode: false,
        itemWidth: 13, itemHeight: 9, itemGap: 12, textStyle: { color: colors.ink, fontSize: 11 },
        pageTextStyle: { color: colors.muted }, pageIconColor: colors.ink, pageIconInactiveColor: colors.lineStrong },
      tooltip: { trigger: "axis", triggerOn: "mousemove|click", confine: true, borderColor: colors.lineStrong,
        backgroundColor: colors.panel, textStyle: { color: colors.ink, fontSize: 12 },
        axisPointer: { type: "line", lineStyle: { color: colors.lineStrong, type: "dashed" } },
        formatter: tooltipFormatter(points, labels, heading) },
      xAxis: { type: "category", boundaryGap: false, data: labels, axisTick: { show: false },
        axisLine: { lineStyle: { color: colors.lineStrong } }, axisLabel: { color: colors.muted, fontSize: 11,
          interval: (index) => index === labels.length - 1 || (index < labels.length - interval && index % interval === 0),
          hideOverlap: true, showMinLabel: true, showMaxLabel: true } },
      yAxis: { type: "value", min: 0, name: "MWh", nameTextStyle: { color: colors.muted },
        axisLabel: { color: colors.muted, fontSize: 11, formatter: (value) => compactQuantity.format(value) },
        splitLine: { lineStyle: { color: colors.line } } },
      series: [...supplySeries, { id: "demand", name: DEMAND_LABEL, type: "line", z: 10, showSymbol: false,
        lineStyle: { color: colors.ink, width: 2.8 }, itemStyle: { color: colors.ink }, data: points.map((point) => point.demand) }]
    };
  }

  return Object.freeze({ buildOption });
});
