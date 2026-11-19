"use strict";

(function (root, factory) {
  const isCommonJs = typeof module !== "undefined" && module.exports;
  const api = factory(isCommonJs ? require("./result-calculation") : root.NE_RESULT_CALCULATION);
  if (isCommonJs) module.exports = api;
  root.NE_RESULT_BRIEF_TURNING_POINT = api;
  if (root.window && root.window !== root) root.window.NE_RESULT_BRIEF_TURNING_POINT = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function ({ closeAmount }) {
  const decimal = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const priceFormat = new Intl.NumberFormat("zh-CN", decimal);
  const energyFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  const metrics = [
    { label: "结算电量（MWh）", key: "energyMwh", scale: 1, format: energyFormat },
    { label: "捕获电价（元/MWh）", key: "capturePrice", scale: 1, format: priceFormat },
    { label: "度电净价（元/MWh）", key: "fullRevenuePrice", scale: 1, format: priceFormat },
    { label: "全口径收入（万元）", key: "fullRevenue", scale: 10000, format: priceFormat }
  ];

  function signed(value, format) {
    return `${value >= 0.005 ? "+" : ""}${format.format(Math.abs(value) < 0.005 ? 0 : value)}`;
  }

  function deltaText(value, format, unit) {
    if (Math.abs(value) < 0.005) return "持平";
    return `${value > 0 ? "增加" : "减少"} ${format.format(Math.abs(value))} ${unit}`;
  }

  function netPriceParts(row) {
    const { energyMwh, capturePrice, fullRevenue, fullRevenuePrice, spotRevenue, mechanismRevenue,
      ltPnlRevenue, envRevenue, storageSupplementRevenue, comprehensiveFee, otherIncome } = row;
    const amounts = [spotRevenue, mechanismRevenue, ltPnlRevenue, envRevenue, storageSupplementRevenue, otherIncome - comprehensiveFee];
    if (![comprehensiveFee, otherIncome, ...amounts].every(Number.isFinite) ||
        !closeAmount(spotRevenue, capturePrice * energyMwh) || !closeAmount(fullRevenue, fullRevenuePrice * energyMwh) ||
        !closeAmount(amounts.reduce((total, amount) => total + amount, 0), fullRevenue)) return null;

    return [
      { label: "捕获电价", colorKey: "spot", value: capturePrice },
      { label: "差价机制结算", colorKey: "mechanism", value: mechanismRevenue / energyMwh },
      { label: "交易策略损益", colorKey: "trade", value: ltPnlRevenue / energyMwh },
      { label: "环境价值兑现", colorKey: "env", value: envRevenue / energyMwh },
      { label: "配储收益", colorKey: "storage", value: storageSupplementRevenue / energyMwh },
      { label: "费用及其他净收入", colorKey: "fee", value: (otherIncome - comprehensiveFee) / energyMwh }
    ];
  }

  function mechanismExit(before, after) {
    return before.mechanismRatio > 0 && before.mechanismRevenue < 0 &&
      after.mechanismRatio === 0 && after.mechanismRevenue === 0;
  }

  function impactFigure(before, after) {
    const base = netPriceParts(before);
    const next = netPriceParts(after);
    if (!base || !next) return null;
    const changes = next.map(({ label, colorKey, value }, index) => ({
      label: colorKey === "mechanism" && mechanismExit(before, after) ? "机制负补差退出" : label,
      colorKey, value: value - base[index].value, role: "change"
    })).filter(({ value }) => Math.abs(value) > 1e-7);
    const calculatedEnd = changes.reduce((total, item) => total + item.value, before.fullRevenuePrice);
    if (Math.abs(calculatedEnd - after.fullRevenuePrice) >= 0.005) return null;
    return {
      key: "turning-point-bridge", kind: "bridge", title: `${before.year} 至 ${after.year} 年度电净价变动拆解`,
      items: [
        { label: `${before.year} 年度电净价`, colorKey: "net", value: before.fullRevenuePrice, role: "start" },
        ...changes,
        { label: `${after.year} 年度电净价`, colorKey: "net", value: after.fullRevenuePrice, role: "end" }
      ]
    };
  }

  function driverSummary(figure, delta) {
    if (!figure) return "";
    const main = figure.items.filter(({ role, value }) => role === "change" && delta * value > 0 && Math.abs(value) >= 0.005)
      .sort((left, right) => Math.abs(right.value) - Math.abs(left.value)).slice(0, 2);
    if (!main.length) return "";
    const details = main.map(({ label, value }) => `${label}贡献 ${signed(value, priceFormat)} 元/MWh`);
    return `${details.join("，")}。`;
  }

  function comparisonTable(before, after) {
    return {
      key: "turning-point", title: "关键年份变动对照",
      headers: ["指标", `${before.year} 年`, `${after.year} 年`, "变化量"],
      rows: metrics.map(({ label, key, scale, format }) => [label, format.format(before[key] / scale),
        format.format(after[key] / scale), signed((after[key] - before[key]) / scale, format)]),
      note: "变化量按舍入前的数值计算。"
    };
  }

  function buildTurningPoint({ change } = {}) {
    const { before, after } = change || {};
    if (!before || !after || !Number.isInteger(before.year) || after.year !== before.year + 1 ||
        ![before, after].every((row) => row.energyMwh > 0 && metrics.every(({ key }) => Number.isFinite(row[key])))) return null;

    const priceDelta = after.fullRevenuePrice - before.fullRevenuePrice;
    if (Math.abs(priceDelta) < 0.005) return null;
    const energyDelta = after.energyMwh - before.energyMwh;
    const incomeDelta = (after.fullRevenue - before.fullRevenue) / 10000;
    const move = priceDelta > 0 ? "升至" : "降至";
    const finding = `${before.year} 至 ${after.year} 年，度电净价由 ${priceFormat.format(before.fullRevenuePrice)} ${move} ${priceFormat.format(after.fullRevenuePrice)} 元/MWh，${deltaText(priceDelta, priceFormat, "元/MWh")}。`;
    const results = `结算电量${deltaText(energyDelta, energyFormat, "MWh")}，年收入${energyDelta * incomeDelta < 0 ? "仍" : ""}${deltaText(incomeDelta, priceFormat, "万元")}。`;
    const figure = impactFigure(before, after);
    return { finding, intro: [`${finding}${results}`, driverSummary(figure, priceDelta)].filter(Boolean), table: comparisonTable(before, after), figure };
  }

  return Object.freeze({ buildTurningPoint });
});
