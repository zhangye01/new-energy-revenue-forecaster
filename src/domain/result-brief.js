"use strict";

(function (root, factory) {
  const isCommonJs = typeof module !== "undefined" && module.exports;
  const api = factory(
    isCommonJs ? require("./result-report") : root.NE_RESULT_REPORT,
    isCommonJs ? require("./result-versions") : root.NE_RESULT_VERSIONS,
    isCommonJs ? require("./result-brief-operating") : root.NE_RESULT_BRIEF_OPERATING,
    isCommonJs ? require("./result-brief-dispatch") : root.NE_RESULT_BRIEF_DISPATCH,
    isCommonJs ? require("./result-brief-turning-point") : root.NE_RESULT_BRIEF_TURNING_POINT
  );
  if (isCommonJs) module.exports = api;
  root.NE_RESULT_BRIEF = api;
  if (root.window && root.window !== root) root.window.NE_RESULT_BRIEF = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (report, versions, operatingExhibits, dispatchExhibits, turningPointExhibits) {
  const moneyNumber = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const energyNumber = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  const asMoneyWan = (value) => moneyNumber.format(value / 10000);
  const asPrice = (value) => `${moneyNumber.format(value)} 元/MWh`;
  const asEnergy = (value) => `${energyNumber.format(value)} MWh`;
  const asPercent = (value) => `${moneyNumber.format(Math.abs(value) < 0.00005 ? 0 : value * 100)}%`;
  const field = (label, value) => ({ label, value });
  const figureBlock = (key) => ({ kind: "figure", key });
  const tableBlock = (key) => ({ kind: "table", key });
  const valuesPresent = (row, keys) => row && keys.every((key) => Number.isFinite(row[key]));
  const resultComponentKeys = ["spotRevenue", "mechanismRevenue", "ltPnlRevenue", "envRevenue", "storageSupplementRevenue", "comprehensiveFee", "otherIncome"];
  const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
  const agrees = (left, right) => Math.abs(left - right) <= Math.max(0.00001, Math.abs(right) * 1e-9);

  function asMoney(value) {
    return Math.abs(value) >= 100000000 ? `${moneyNumber.format(value / 100000000)} 亿元` : `${asMoneyWan(value)} 万元`;
  }

  function buildYearTable(rows) {
    return {
      key: "annual",
      title: "年度测算结果",
      headers: ["年份", "结算电量（MWh）", "捕获电价（元/MWh）", "度电净价（元/MWh）", "全口径收入（万元）"],
      rows: rows.map((row) => [
        String(row.year),
        energyNumber.format(row.energyMwh),
        moneyNumber.format(row.capturePrice),
        moneyNumber.format(row.fullRevenuePrice),
        asMoneyWan(row.fullRevenue)
      ])
    };
  }

  function buildStorageOperationsIntro(dispatch) {
    if (!dispatch.every((item) => valuesPresent(item, ["chargeMwh", "dischargeMwh"]))) return [];
    const first = dispatch[0];
    const efficiency = Number.isFinite(first.roundTripEfficiency) ? `往返效率 ${asPercent(first.roundTripEfficiency)}，` : "";
    return [`首年${efficiency}充电 ${asEnergy(first.chargeMwh)}、放电 ${asEnergy(first.dischargeMwh)}。全期累计充电 ${asEnergy(sum(dispatch, "chargeMwh"))}、放电 ${asEnergy(sum(dispatch, "dischargeMwh"))}。`];
  }

  function buildSpotStorageData(dispatch, rows, totalEnergy) {
    const required = ["withoutStorageSpotRevenue", "withStorageSpotRevenue", "incrementalRevenue", "dischargeRevenue", "chargeOpportunityCost"];
    if (!dispatch.every((item, index) => valuesPresent(item, required) &&
      agrees(item.withoutStorageSpotRevenue, rows[index].spotRevenue) &&
      agrees(item.withStorageSpotRevenue - item.withoutStorageSpotRevenue, item.incrementalRevenue) &&
      agrees(item.dischargeRevenue - item.chargeOpportunityCost, item.incrementalRevenue))) return null;

    const increase = sum(dispatch, "incrementalRevenue");
    const unitLift = totalEnergy > 0 ? `，按储前结算电量折合 ${asPrice(increase / totalEnergy)}` : "";
    const table = {
      key: "storage",
      title: "有储与无储现货收益对比",
      headers: ["项目", `首年 ${rows[0].year}（万元）`, "全周期（万元）"],
      rows: [
        ["无储现货收益", "withoutStorageSpotRevenue"],
        ["有储现货收益", "withStorageSpotRevenue"],
        ["配储现货增量", "incrementalRevenue"],
        ["放电收入", "dischargeRevenue"],
        ["充电机会成本", "chargeOpportunityCost"]
      ].map(([label, key]) => [label, asMoneyWan(dispatch[0][key]), asMoneyWan(sum(dispatch, key))]),
      note: "配储现货增量＝放电收入－充电机会成本。"
    };
    return {
      table, spotOnly: true, operationsIntro: buildStorageOperationsIntro(dispatch),
      intro: [`同一条现货价格曲线下，配储全周期现货增量为 ${asMoney(increase)}${unitLift}。`],
      finding: `全周期现货增量 ${asMoney(increase)}${unitLift}。`
    };
  }

  function buildStorageData(rows, totalEnergy) {
    const dispatch = rows.map((row) => row.storageDispatch);
    if (dispatchExhibits.usesSpotStorage(rows)) return buildSpotStorageData(dispatch, rows, totalEnergy);
    const required = ["withStorageFullRevenue", "withoutStorageFullRevenue", "incrementalRevenue", "independentSupplementRevenue"];
    if (!dispatch.every((item, index) => valuesPresent(item, required) &&
        agrees(item.withStorageFullRevenue, rows[index].fullRevenue) &&
        agrees(item.withStorageFullRevenue - item.withoutStorageFullRevenue, item.incrementalRevenue + item.independentSupplementRevenue))) return null;
    const first = dispatch[0];
    const withStorage = sum(dispatch, "withStorageFullRevenue");
    const withoutStorage = sum(dispatch, "withoutStorageFullRevenue");
    const increase = withStorage - withoutStorage;
    const arbitrage = sum(dispatch, "incrementalRevenue");
    const supplements = sum(dispatch, "independentSupplementRevenue");
    const amounts = (label, key) => [label, asMoneyWan(first[key]), asMoneyWan(sum(dispatch, key))];
    const tableRows = [
      amounts("有储全口径收入", "withStorageFullRevenue"),
      amounts("无储全口径收入", "withoutStorageFullRevenue"),
      ["配储全口径增量", asMoneyWan(first.withStorageFullRevenue - first.withoutStorageFullRevenue), asMoneyWan(increase)],
      amounts("其中现货套利增量", "incrementalRevenue")
    ];
    const hasArbitrageBreakdown = dispatch.every((item) => valuesPresent(item, ["dischargeRevenue", "chargeOpportunityCost"]) &&
      agrees(item.dischargeRevenue - item.chargeOpportunityCost, item.incrementalRevenue));
    if (hasArbitrageBreakdown) {
      tableRows.push(amounts("放电收入", "dischargeRevenue"), amounts("充电机会成本", "chargeOpportunityCost"));
    }
    tableRows.push(amounts("其中独立配储收益", "independentSupplementRevenue"));
    const table = {
      key: "storage",
      title: "有储与无储收入对比",
      headers: ["项目", `首年 ${rows[0].year}（万元）`, "全周期（万元）"],
      rows: tableRows,
      note: hasArbitrageBreakdown ? "现货套利增量为放电收入减去充电机会成本。独立配储收益单独计入。" : "独立配储收益与现货套利分别计入。"
    };
    const lift = withoutStorage > 0 ? `，相当于无储收入的 ${asPercent(increase / withoutStorage)}` : "";
    const unitLift = totalEnergy > 0 ? `，按储前结算电量折合 ${asPrice(increase / totalEnergy)}` : "";
    const intro = [`同一条现货价格曲线下，配储全期收入增量为 ${asMoney(increase)}${lift}${unitLift}。其中现货净套利 ${asMoney(arbitrage)}，独立配储收益 ${asMoney(supplements)}。`];
    return { table, intro, operationsIntro: buildStorageOperationsIntro(dispatch), finding: `全期收入增量 ${asMoney(increase)}${lift}。` };
  }

  function priceFigure(rows, { includesSpot, change, detail }) {
    const series = [
      { name: "度电净价", values: rows.map((row) => row.fullRevenuePrice) },
      { name: "捕获电价", values: rows.map((row) => row.capturePrice) }
    ];
    if (includesSpot) series.push({ name: "现货均价", values: rows.map((row) => row.spotAvgPrice) });
    return {
      key: "price", kind: "trend", title: "年度电价对比",
      years: rows.map((row) => String(row.year)), series, caption: detail, focusYear: change ? String(change.after.year) : undefined
    };
  }

  function contributionItems(result, verifiedConfig, storage) {
    if (!result.annualRows.every((row) => valuesPresent(row, resultComponentKeys))) return [];
    const items = report.getResultContributionItems(result, verifiedConfig);
    if (!items.every((item) => Number.isFinite(item.amount)) || !agrees(sum(items, "amount"), result.totalFullRevenue)) return [];
    return items.map((item) => {
      if (storage?.spotOnly && item.colorKey === "spot") return { ...item, label: "无储现货收益" };
      if (storage && !storage.spotOnly && item.colorKey === "storage") return { ...item, label: "配储收益" };
      return item;
    });
  }

  function firstYearBridge(first, items) {
    if (!(first.energyMwh > 0) || !items.length) return null;
    const spot = items.find((item) => item.colorKey === "spot");
    if (!spot || !agrees(spot.amount / first.energyMwh, first.capturePrice) ||
        !agrees(first.fullRevenue / first.energyMwh, first.fullRevenuePrice)) return null;
    return {
      key: "first-price-bridge", kind: "bridge", title: "首年度电净价拆解",
      caption: `${first.year} 年从捕获电价 ${asPrice(first.capturePrice)} 调整至度电净价 ${asPrice(first.fullRevenuePrice)}。`,
      items: [
        { label: "捕获电价", value: first.capturePrice, colorKey: "spot", role: "start" },
        ...items.filter((item) => item.colorKey !== "spot" && item.amount !== 0)
          .map(({ label, colorKey, amount }) => ({ label, value: amount / first.energyMwh, colorKey, role: "change" })),
        { label: "度电净价", value: first.fullRevenuePrice, colorKey: "net", role: "end" }
      ]
    };
  }

  function buildIncomeDetails(result, items, composition, spotOnly) {
    if (!items.length) return null;
    const nonzero = items.filter((item) => item.amount !== 0 || item.colorKey === "spot");
    const adjustments = nonzero.filter((item) => item.colorKey !== "spot");
    const contributionTable = ({ label, amount }) => [label, asMoneyWan(amount),
      result.totalEnergy > 0 ? moneyNumber.format(amount / result.totalEnergy) : "—",
      result.totalFullRevenue > 0 ? moneyNumber.format(amount / result.totalFullRevenue * 100) : "—"];
    return {
      figure: adjustments.length ? {
        key: "income", kind: "contribution", title: spotOnly ? "全周期收入增减（以无储现货收益为起点）" : "全周期现货之外的收入增减",
        caption: composition,
        items: adjustments.map(({ label, amount, colorKey }) => ({ label, value: amount / 10000, colorKey }))
      } : null,
      table: {
        key: "income-details", title: "收入项目及度电贡献",
        headers: ["项目", "金额（万元）", "度电贡献（元/MWh）", "占全口径收入（%）"],
        rows: [...nonzero.map(contributionTable), contributionTable({ label: "全口径收入合计", amount: result.totalFullRevenue })],
        note: "各项独立四舍五入，表中分项相加可能与合计有尾差。"
      }
    };
  }

  function largestPriceChange(rows) {
    let largest = null;
    for (let i = 1; i < rows.length; i += 1) {
      const before = rows[i - 1];
      const after = rows[i];
      if (after.year !== before.year + 1 || before.energyMwh <= 0 || after.energyMwh <= 0) continue;
      const delta = after.fullRevenuePrice - before.fullRevenuePrice;
      if (Math.abs(delta) >= 0.005 && (!largest || Math.abs(delta) > Math.abs(largest.delta))) largest = { before, after, delta };
    }
    return largest;
  }

  function pricingOverview(rows) {
    const first = rows[0];
    const last = rows.at(-1);
    const includesSpot = rows.every((row) => Number.isFinite(row.spotAvgPrice));
    const annualEnergy = sum(rows, "energyMwh");
    const capture = annualEnergy > 0 ? rows.reduce((total, row) => total + row.energyMwh * row.capturePrice, 0) / annualEnergy : null;
    const comparisons = [includesSpot ? `全期现货时均价 ${asPrice(sum(rows, "spotAvgPrice") / rows.length)}` : "",
      capture !== null ? `全期加权捕获电价 ${asPrice(capture)}` : ""].filter(Boolean);
    const detail = comparisons.length ? `${comparisons.join("，")}。` : "";
    const endpoints = rows.length > 1
      ? `首年度电净价 ${asPrice(first.fullRevenuePrice)}，末年 ${asPrice(last.fullRevenuePrice)}。`
      : `首年捕获电价 ${asPrice(first.capturePrice)}，度电净价 ${asPrice(first.fullRevenuePrice)}。`;
    return { includesSpot, change: largestPriceChange(rows), detail, endpoints };
  }

  function buildIncomeOverview(rows, totalRevenue, items) {
    const peak = rows.reduce((best, row) => row.fullRevenue - best.fullRevenue > 0.005 ? row : best);
    const low = rows.reduce((worst, row) => worst.fullRevenue - row.fullRevenue > 0.005 ? row : worst);
    const average = `年均全口径收入 ${asMoney(totalRevenue / rows.length)}。`;
    const repeats = (target) => rows.some((row) => row !== target && Math.abs(row.fullRevenue - target.fullRevenue) < 0.005);
    const range = peak.fullRevenue - low.fullRevenue >= 50
      ? `最高值为 ${asMoney(peak.fullRevenue)}，${repeats(peak) ? "首次出现在" : "出现在"} ${peak.year} 年。最低值为 ${asMoney(low.fullRevenue)}，${repeats(low) ? "首次出现在" : "出现在"} ${low.year} 年。`
      : "";
    const spot = items.find((item) => item.colorKey === "spot");
    const otherNet = spot ? totalRevenue - spot.amount : 0;
    const spotShare = spot ? `${spot.label} ${asMoney(spot.amount)}，其余各项合计 ${asMoney(otherNet)}。` : "";
    const positive = items.filter((item) => item.colorKey !== "spot" && item.amount > 0).sort((a, b) => b.amount - a.amount)[0];
    const negative = items.filter((item) => item.colorKey !== "spot" && item.amount < 0).sort((a, b) => a.amount - b.amount)[0];
    const drivers = [positive ? `${positive.label}是主要增收项，贡献 ${asMoney(positive.amount)}。` : "",
      negative ? `${negative.label}是主要扣减项，减少收入 ${asMoney(Math.abs(negative.amount))}。` : ""].join("");
    return { trend: `${average}${range}`, composition: `${spotShare}${drivers}`, finding: spotShare || `${average}${range}` };
  }

  function buildAnnualIncomeFigure(rows) {
    return { key: "annual-income", kind: "annual", title: "年度全口径收入",
      years: rows.map((row) => String(row.year)), values: rows.map((row) => row.fullRevenue / 10000) };
  }

  function numberItems(items, sections, kind) {
    const byKey = new Map(items.map((item) => [item.key, item]));
    return sections.flatMap(({ blocks }) => blocks.filter((block) => block.kind === kind && byKey.has(block.key)))
      .map(({ key }, index) => ({ ...byKey.get(key), number: index + 1 }));
  }

  function mechanismMovesWithPrice(change) {
    if (!change) return false;
    const { before, after } = change;
    return Math.abs(after.mechanismRevenue / after.energyMwh - before.mechanismRevenue / before.energyMwh) >= 0.005;
  }

  function buildSections({ pricing, bridge, income, incomeDetails, storage, turning, operating, dispatch }) {
    const annualEnergy = operating.sections.find(({ key }) => key === "settlement");
    const spotDetails = operating.sections.find(({ key }) => key === "spot-detail");
    const explainMechanism = Boolean(turning && mechanismMovesWithPrice(pricing.change));
    const sections = [
      { key: "results", title: "年度测算结果", intro: [`${income.trend}${pricing.endpoints}`],
        blocks: [figureBlock("price"), figureBlock("annual-income"), ...(annualEnergy?.blocks || []),
          ...(incomeDetails?.figure ? [figureBlock(incomeDetails.figure.key)] : []),
          ...(incomeDetails ? [tableBlock(incomeDetails.table.key)] : [])] }
    ];
    if (turning) sections.push({ key: "turning-point", title: "关键年份变化", intro: turning.intro,
      blocks: [...(turning.figure ? [figureBlock(turning.figure.key)] : []), tableBlock(turning.table.key),
        ...(explainMechanism ? dispatch.incomeBlocks : [])] });
    if (storage) sections.push({ key: "storage", title: storage.spotOnly ? "配储现货增量" : "配储收入增量", intro: storage.intro, blocks: [tableBlock(storage.table.key)] });
    const priceBlocks = [...(spotDetails?.blocks || []), ...(bridge ? [figureBlock(bridge.key)] : [])];
    if (priceBlocks.length) sections.push({ key: "appendix-price", appendix: true, title: "首年电价与电量明细",
      intro: spotDetails?.intro || [], blocks: priceBlocks });
    if (!explainMechanism && dispatch.incomeBlocks.length) sections.push({ key: "appendix-mechanism", appendix: true,
      title: "机制差价结算明细", intro: [], blocks: dispatch.incomeBlocks });
    if (storage && dispatch.storageBlocks.length) sections.push({ key: "appendix-storage", appendix: true,
      title: "配储运行明细", intro: storage.operationsIntro, blocks: dispatch.storageBlocks });
    sections.push({ key: "annual", appendix: true, title: "逐年测算明细", intro: [], blocks: [tableBlock("annual")] });
    return sections;
  }

  function buildBrief(input = {}) {
    const { project, scenario, result, run, verifiedConfig, labels = {} } = input;
    const archived = versions.getArchivedCalculationContext(result);
    const origin = archived?.project || project;
    const savedRows = result?.annualRows;
    if (!origin || !Array.isArray(savedRows) || !savedRows.length ||
        !savedRows.every((row) => row && Number.isInteger(row.year)
          && [row.energyMwh, row.capturePrice, row.fullRevenuePrice, row.fullRevenue].every(Number.isFinite)) ||
        ![result.totalFullRevenue, result.totalEnergy, result.avgFullRevenuePrice].every(Number.isFinite)) return null;

    const rows = savedRows.slice().sort((a, b) => a.year - b.year);
    const first = rows[0];
    const last = rows.at(-1);
    const period = first.year === last.year ? `${first.year} 年` : `${first.year}–${last.year} 年`;
    const type = [labels.province || origin.province, labels.assetType || origin.assetType, labels.siteType || origin.siteType]
      .filter(Boolean).join(" · ");
    const storageDescription = origin.hasStorage && Number.isFinite(origin.storagePowerMw) && Number.isFinite(origin.storageDurationH)
      ? `${energyNumber.format(origin.storagePowerMw)} MW / ${energyNumber.format(origin.storageDurationH)} h（${asEnergy(origin.storagePowerMw * origin.storageDurationH)}）`
      : origin.hasStorage ? "配建储能，规格待核对" : "未配建储能";
    const context = [
      field("测算方案", archived?.scenario.name || scenario?.name || "当前方案"),
      field("测算周期", period),
      field("项目类型", type),
      field("装机容量", Number.isFinite(origin.capacityMw) ? `${energyNumber.format(origin.capacityMw)} MW` : "未记录"),
      field("配储规格", storageDescription)
    ];
    const storage = buildStorageData(rows, result.totalEnergy);
    const items = contributionItems(result, verifiedConfig, storage);
    const income = buildIncomeOverview(rows, result.totalFullRevenue, items);
    const incomeDetails = buildIncomeDetails(result, items, income.composition, storage?.spotOnly);
    const firstItems = contributionItems({ ...result, annualRows: [first], totalFullRevenue: first.fullRevenue }, verifiedConfig, storage);
    const bridge = firstYearBridge(first, firstItems);
    const pricing = pricingOverview(rows);
    const turning = turningPointExhibits.buildTurningPoint({ change: pricing.change });
    const saved = { ...result, annualRows: rows };
    const operating = operatingExhibits.buildOperatingExhibits(saved);
    const dispatch = dispatchExhibits.buildDispatchExhibits(saved);
    const sections = buildSections({ pricing, bridge, income, incomeDetails, storage, turning, operating, dispatch });
    const figures = [priceFigure(rows, pricing), bridge, buildAnnualIncomeFigure(rows), incomeDetails?.figure, turning?.figure,
      ...operating.figures, ...dispatch.figures].filter(Boolean);
    const tables = [incomeDetails?.table, turning?.table, storage?.table, buildYearTable(rows), ...operating.tables, ...dispatch.tables].filter(Boolean);
    const findings = [field("电价变化", turning?.finding || pricing.endpoints), field("收入表现", income.finding),
      ...(storage ? [field("配储收益", storage.finding)] : [])];

    return {
      title: "基准结果简报",
      projectName: origin.name || project?.name || "新能源项目",
      context,
      metrics: [
        field("周期全口径收入", asMoney(result.totalFullRevenue)),
        field("周期平均度电净价", asPrice(result.avgFullRevenuePrice)),
        field(storage ? "全期储前结算电量" : "全期结算电量", asEnergy(result.totalEnergy)),
        field("首年度电净价", asPrice(first.fullRevenuePrice))
      ],
      findings,
      sections,
      figures: numberItems(figures, sections, "figure"),
      tables: numberItems(tables, sections, "table"),
      versionId: versions.describeResult(result, run).versionId
    };
  }

  return Object.freeze({ buildBrief });
});
