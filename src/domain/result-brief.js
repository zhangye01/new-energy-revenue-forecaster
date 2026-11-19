"use strict";

(function (root, factory) {
  const isCommonJs = typeof module !== "undefined" && module.exports;
  const api = factory(
    isCommonJs ? require("./result-report") : root.NE_RESULT_REPORT,
    isCommonJs ? require("./result-versions") : root.NE_RESULT_VERSIONS
  );
  if (isCommonJs) module.exports = api;
  root.NE_RESULT_BRIEF = api;
  if (root.window && root.window !== root) root.window.NE_RESULT_BRIEF = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (report, versions) {
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

  function directionText(value) {
    return value < 0 ? "下降" : "上升";
  }

  function asMoney(value) {
    return Math.abs(value) >= 100000000 ? `${moneyNumber.format(value / 100000000)} 亿元` : `${asMoneyWan(value)} 万元`;
  }

  function buildYearTable(rows, key = "annual", title = "年度测算结果") {
    return {
      key,
      title,
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

  function buildStorageData(rows, totalEnergy) {
    const required = ["withStorageFullRevenue", "withoutStorageFullRevenue", "incrementalRevenue", "independentSupplementRevenue"];
    const dispatch = rows.map((row) => row.storageDispatch);
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
      title: "配储收益对比",
      headers: ["项目", `首年 ${rows[0].year}（万元）`, "全周期（万元）"],
      rows: tableRows,
      note: hasArbitrageBreakdown ? "现货套利增量为放电收入减去充电机会成本。独立配储收益单独计入。" : "独立配储收益与现货套利分别计入。"
    };
    const lift = withoutStorage > 0 ? `，相当于无储收入的 ${asPercent(increase / withoutStorage)}` : "";
    const unitLift = totalEnergy > 0 ? `，按储前结算电量折合 ${asPrice(increase / totalEnergy)}` : "";
    const intro = [`配储全期收益增量为 ${asMoney(increase)}${lift}${unitLift}。其中现货套利 ${asMoney(arbitrage)}，独立配储收益 ${asMoney(supplements)}。`];
    if (dispatch.every((item) => valuesPresent(item, ["chargeMwh", "dischargeMwh"]))) {
      const efficiency = Number.isFinite(first.roundTripEfficiency) ? `往返效率 ${asPercent(first.roundTripEfficiency)}，` : "";
      intro.push(`首年${efficiency}充电 ${asEnergy(first.chargeMwh)}、放电 ${asEnergy(first.dischargeMwh)}。全期累计充电 ${asEnergy(sum(dispatch, "chargeMwh"))}、放电 ${asEnergy(sum(dispatch, "dischargeMwh"))}。`);
    }
    return { table, intro, finding: `全期收益增量 ${asMoney(increase)}${lift}。` };
  }

  function priceFigure(rows, includesSpot) {
    const series = [
      { name: "度电净价", values: rows.map((row) => row.fullRevenuePrice) },
      { name: "捕获电价", values: rows.map((row) => row.capturePrice) }
    ];
    if (includesSpot) series.push({ name: "现货均价", values: rows.map((row) => row.spotAvgPrice) });
    return {
      key: "price", kind: "trend", title: "年度电价对比",
      years: rows.map((row) => String(row.year)), series
    };
  }

  function contributionItems(result, verifiedConfig, hasDispatch) {
    if (!result.annualRows.every((row) => valuesPresent(row, resultComponentKeys))) return [];
    const items = report.getResultContributionItems(result, verifiedConfig);
    if (!items.every((item) => Number.isFinite(item.amount)) || !agrees(sum(items, "amount"), result.totalFullRevenue)) return [];
    return items.map((item) => hasDispatch && item.colorKey === "storage" ? { ...item, label: "配储收益" } : item);
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

  function buildIncomeDetails(result, items, storage) {
    if (!items.length) return null;
    const nonzero = items.filter((item) => item.amount !== 0 || item.colorKey === "spot");
    const contributionTable = ({ label, amount }) => [label, asMoneyWan(amount),
      result.totalEnergy > 0 ? moneyNumber.format(amount / result.totalEnergy) : "—",
      result.totalFullRevenue > 0 ? moneyNumber.format(amount / result.totalFullRevenue * 100) : "—"];
    return {
      figure: {
        key: "income", kind: "contribution", title: "全周期收入构成",
        caption: storage ? "各项按全周期金额汇总。配储收益包含现货套利增量及独立配储收益。" : "各项按全周期金额汇总。正值为增收，负值为扣减。",
        items: nonzero.map(({ label, amount, colorKey }) => ({ label, value: amount / 10000, colorKey }))
      },
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

  function unitDrivers(row) {
    if (!valuesPresent(row, resultComponentKeys)) return null;
    const parts = [
      field("捕获电价", row.capturePrice),
      field("差价机制结算", row.mechanismRevenue / row.energyMwh),
      field("交易策略损益", row.ltPnlRevenue / row.energyMwh),
      field("环境价值兑现", row.envRevenue / row.energyMwh),
      field("配储收益", row.storageSupplementRevenue / row.energyMwh),
      field("费用及其他净收入", (row.otherIncome - row.comprehensiveFee) / row.energyMwh)
    ];
    return agrees(sum(parts, "value"), row.fullRevenuePrice) ? parts : null;
  }

  function explainPriceChange(change) {
    if (!change) return null;
    const { before, after, delta } = change;
    const event = `${before.year} 至 ${after.year} 年度电净价${directionText(delta)} ${asPrice(Math.abs(delta))}，为相邻年份间的最大变动。`;
    const prior = unitDrivers(before);
    const current = unitDrivers(after);
    if (!prior || !current) return { event, explanation: "" };
    const leading = current.map(({ label, value }, index) => field(label, value - prior[index].value))
      .filter(({ value }) => value * delta > 0 && Math.abs(value) >= 0.005)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 2);
    const contributions = leading.map(({ label, value }) => `${label}${value < 0 ? "减少" : "增加"} ${asPrice(Math.abs(value))}`);
    return { event, explanation: contributions.length ? `主要来自${contributions.join("、")}。` : "" };
  }

  function pricingOverview(rows, result) {
    const first = rows[0];
    const last = rows.at(-1);
    const includesSpot = rows.every((row) => Number.isFinite(row.spotAvgPrice));
    const averageSpot = includesSpot ? `全期现货时均价 ${asPrice(sum(rows, "spotAvgPrice") / rows.length)}，` : "";
    const annualEnergy = sum(rows, "energyMwh");
    const capture = annualEnergy > 0 ? rows.reduce((total, row) => total + row.energyMwh * row.capturePrice, 0) / annualEnergy : null;
    const detail = capture === null ? `${averageSpot}全期平均度电净价 ${asPrice(result.avgFullRevenuePrice)}。`
      : `${averageSpot}加权捕获电价 ${asPrice(capture)}，平均度电净价 ${asPrice(result.avgFullRevenuePrice)}。`;
    const change = largestPriceChange(rows);
    const explanation = explainPriceChange(change);
    const endpoints = rows.length > 1
      ? `首年度电净价 ${asPrice(first.fullRevenuePrice)}，末年 ${asPrice(last.fullRevenuePrice)}。`
      : `首年捕获电价 ${asPrice(first.capturePrice)}，度电净价 ${asPrice(first.fullRevenuePrice)}。`;
    return {
      includesSpot, change,
      intro: [detail, explanation ? `${endpoints}${explanation.event}${explanation.explanation}` : endpoints],
      finding: explanation?.event || endpoints
    };
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
    const spotShare = spot && totalRevenue > 0 ? `现货市场收入 ${asMoney(spot.amount)}，占全期全口径收入的 ${asPercent(spot.amount / totalRevenue)}。` : "";
    const positive = items.filter((item) => item.colorKey !== "spot" && item.amount > 0).sort((a, b) => b.amount - a.amount)[0];
    const negative = items.filter((item) => item.colorKey !== "spot" && item.amount < 0).sort((a, b) => a.amount - b.amount)[0];
    const drivers = [positive ? `${positive.label}是现货收入之外的主要增收项，贡献 ${asMoney(positive.amount)}。` : "",
      negative ? `${negative.label}是主要扣减项，减少收入 ${asMoney(Math.abs(negative.amount))}。` : ""].join("");
    return { peak, low, intro: [`${average}${range}`, `${spotShare}${drivers}`].filter(Boolean), finding: spotShare || `${average}${range}` };
  }

  function buildAnnualIncomeFigure(rows) {
    return { key: "annual-income", kind: "annual", title: "年度全口径收入",
      years: rows.map((row) => String(row.year)), values: rows.map((row) => row.fullRevenue / 10000) };
  }

  function numberItems(items, sections, kind) {
    return sections.flatMap(({ blocks }) => blocks.filter((block) => block.kind === kind))
      .map(({ key }, index) => ({ ...items.find((item) => item.key === key), number: index + 1 }));
  }

  function buildSections(rows, pricing, bridge, income, incomeDetails, storage, keyYears) {
    const first = rows[0];
    const last = rows.at(-1);
    const sections = [
      { key: "price", title: "电价表现与形成", intro: pricing.intro,
        blocks: [figureBlock("price"), ...(bridge ? [figureBlock(bridge.key)] : [])] },
      { key: "income", title: "收入走势与构成", intro: income.intro,
        blocks: [figureBlock("annual-income"), ...(incomeDetails ? [figureBlock("income"), tableBlock("income-details")] : []),
          ...(keyYears ? [tableBlock("key-years")] : [])] }
    ];
    if (storage) sections.push({ key: "storage", title: "配储收益分析", intro: storage.intro, blocks: [tableBlock("storage")] });
    sections.push({ key: "annual", title: "逐年测算明细", intro: rows.length > 1
      ? [`首年结算电量 ${asEnergy(first.energyMwh)}，末年 ${asEnergy(last.energyMwh)}。`] : [], blocks: [tableBlock("annual")] });
    return sections;
  }

  function buildKeyYears(rows, change, { peak, low }) {
    if (rows.length < 6) return null;
    const years = new Set([rows[0].year, rows.at(-1).year, peak.year, low.year, change?.before.year, change?.after.year]);
    return { ...buildYearTable(rows.filter((row) => years.has(row.year)), "key-years", "代表年份表现"),
      note: "列示首末年、收入高低点及最大相邻年度电价变动涉及年份。" };
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
    const items = contributionItems(result, verifiedConfig, Boolean(storage));
    const incomeDetails = buildIncomeDetails(result, items, storage);
    const firstItems = contributionItems({ ...result, annualRows: [first], totalFullRevenue: first.fullRevenue }, verifiedConfig, Boolean(storage));
    const bridge = firstYearBridge(first, firstItems);
    const pricing = pricingOverview(rows, result);
    const income = buildIncomeOverview(rows, result.totalFullRevenue, items);
    const keyYears = buildKeyYears(rows, pricing.change, income);
    const sections = buildSections(rows, pricing, bridge, income, incomeDetails, storage, keyYears);
    const figures = [priceFigure(rows, pricing.includesSpot), bridge, buildAnnualIncomeFigure(rows), incomeDetails?.figure].filter(Boolean);
    const tables = [incomeDetails?.table, keyYears, storage?.table, buildYearTable(rows)].filter(Boolean);
    const findings = [field("电价变化", pricing.finding), field("收入表现", income.finding), ...(storage ? [field("配储收益", storage.finding)] : [])];

    return {
      title: "基准结果简报",
      projectName: origin.name || project?.name || "新能源项目",
      context,
      summary: `${period}累计全口径收入 ${asMoney(result.totalFullRevenue)}，周期平均度电净价 ${asPrice(result.avgFullRevenuePrice)}。`,
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
