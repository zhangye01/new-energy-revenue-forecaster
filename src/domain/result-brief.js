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
  const asPercent = (value) => `${moneyNumber.format(value * 100)}%`;
  const field = (label, value) => ({ label, value });

  function asMoney(value) {
    return Math.abs(value) >= 100000000 ? `${moneyNumber.format(value / 100000000)} 亿元` : `${asMoneyWan(value)} 万元`;
  }

  function buildAnnualTable(rows) {
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

  function buildStorageTable(rows) {
    const required = ["withStorageFullRevenue", "withoutStorageFullRevenue", "incrementalRevenue", "independentSupplementRevenue"];
    const dispatch = rows.map((row) => row.storageDispatch);
    if (!dispatch.every((row) => row && required.every((key) => Number.isFinite(row[key])))) return null;
    const sum = (key) => dispatch.reduce((total, row) => total + row[key], 0);
    const withStorage = sum("withStorageFullRevenue");
    const withoutStorage = sum("withoutStorageFullRevenue");
    return {
      key: "storage",
      title: "配储收益对比",
      headers: ["项目", "全周期金额（万元）"],
      rows: [
        ["有储全口径收入", asMoneyWan(withStorage)],
        ["无储全口径收入", asMoneyWan(withoutStorage)],
        ["配储全口径增量", asMoneyWan(withStorage - withoutStorage)],
        ["其中现货套利增量", asMoneyWan(sum("incrementalRevenue"))],
        ["其中独立配储收益", asMoneyWan(sum("independentSupplementRevenue"))]
      ]
    };
  }

  function buildFigures(rows, contributionItems, storage) {
    return [
      {
        key: "price", kind: "trend", title: "年度度电净价趋势",
        caption: "捕获电价按项目上网电量加权。度电净价计入各项收益和费用。",
        years: rows.map((row) => String(row.year)),
        series: [
          { name: "度电净价", values: rows.map((row) => row.fullRevenuePrice) },
          { name: "捕获电价", values: rows.map((row) => row.capturePrice) }
        ]
      },
      {
        key: "income", kind: "contribution", title: "全周期收入构成",
        caption: storage
          ? "各项按全周期金额汇总。配储收益包含现货套利增量及独立配储收益。"
          : "各项按全周期金额汇总。正值为增收，负值为扣减。",
        items: contributionItems.filter((item) => Number.isFinite(item.amount) && (item.amount !== 0 || item.colorKey === "spot"))
          .map(({ label, amount, colorKey }) => ({
            label: storage && colorKey === "storage" ? "配储收益" : label,
            value: amount / 10000,
            colorKey
          }))
      }
    ];
  }

  function buildAssumptions(first, config, storage) {
    const scope = [
      field("度电净价", "全口径收入按结算电量折算。全周期平均价由全期收入与全期结算电量计算。")
    ];
    if (config) {
      scope.push(
        field("差价机制", config.mechanismEnabled
          ? `按有效月份折算。首年机制电量占比 ${asPercent(first.mechanismRatio)}，机制电价 ${asPrice(Number(config.mechanismPrice))}。`
          : "本次测算未启用差价机制。"),
        field("交易策略与环境价值",
          `交易策略按${config.ltPricingMode === "manual" ? "逐年录入" : "逐年收敛"}取值，环境价值采用${config.envValueMode === "manual" ? "逐年" : "全周期统一"}配置。两项均按非机制结算电量计入。`),
        field("费用与其他净收入", config.feeConfigMode === "manual" ? "采用逐年配置。" : "采用全周期统一配置。")
      );
    }
    if (storage) {
      const efficiency = first.storageDispatch.roundTripEfficiency;
      scope.push(field("配储调度", `有储和无储采用同一条现货价格和相同发电曲线。度电指标沿用储前结算电量。储能按逐小时排程，日首和日末荷电量归零。${Number.isFinite(efficiency) ? `首年往返效率为 ${asPercent(efficiency)}。` : ""}`));
    }
    return scope;
  }

  function buildTrace(signal) {
    const timestamp = new Date(signal.generatedAt);
    const dateLabel = Number.isFinite(timestamp.getTime())
      ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
      }).format(timestamp) + "（北京时间）"
      : "未记录";
    const details = [
      field("测算版本", signal.versionId || "旧版未编号"),
      field("测算时间", dateLabel),
      field("电价来源", signal.priceSourceLabel),
      field("电价曲线版本", signal.runId || "未记录")
    ];
    if (signal.priceContentFingerprint) details.push(field("电价内容指纹", signal.priceContentFingerprint));
    return details;
  }

  function buildBrief(input = {}) {
    const { project, scenario, result, run, verifiedConfig, labels = {} } = input;
    const archived = versions.getArchivedCalculationContext(result);
    const origin = archived?.project || project;
    const config = versions.getResultFeeConfig(result, verifiedConfig);
    const rows = result?.annualRows;
    if (!origin || !Array.isArray(rows) || !rows.length ||
        !rows.every((row) => row && Number.isInteger(row.year)
          && [row.energyMwh, row.capturePrice, row.fullRevenuePrice, row.fullRevenue].every(Number.isFinite)) ||
        ![result.totalFullRevenue, result.totalEnergy, result.avgFullRevenuePrice].every(Number.isFinite)) return null;

    const first = rows[0];
    const last = rows.at(-1);
    const period = first.year === last.year ? `${first.year} 年` : `${first.year}–${last.year} 年`;
    const type = [labels.province || origin.province, labels.assetType || origin.assetType, labels.siteType || origin.siteType]
      .filter(Boolean).join(" · ");
    const storageDescription = origin.hasStorage && Number.isFinite(origin.storagePowerMw) && Number.isFinite(origin.storageDurationH)
      ? `${energyNumber.format(origin.storagePowerMw)} MW / ${energyNumber.format(origin.storageDurationH)} h`
      : origin.hasStorage ? "配建储能，规格待核对" : "未配建储能";
    const context = [
      field("测算方案", archived?.scenario.name || scenario?.name || "当前方案"),
      field("测算周期", period),
      field("项目类型", type),
      field("装机容量", Number.isFinite(origin.capacityMw) ? `${energyNumber.format(origin.capacityMw)} MW` : "未记录"),
      field("配储规格", storageDescription)
    ];
    const signal = versions.describeResult(result, run);
    const data = report.buildResultSummaryData(result, verifiedConfig);
    const storage = buildStorageTable(rows);
    const contributors = [
      data.leadingPositive && `${storage && data.leadingPositive.colorKey === "storage" ? "配储收益" : data.leadingPositive.label}是现货收入外的主要增收项，贡献 ${asMoney(data.leadingPositive.amount)}。`,
      data.leadingNegative && `${data.leadingNegative.label}是主要扣减项，减少收益 ${asMoney(Math.abs(data.leadingNegative.amount))}。`
    ].filter(Boolean).join("");
    const sourceNote = signal.priceSourceType === "demo" ? "本次测算采用演示现货曲线。" : "";
    const summary = `${period}累计全口径收入 ${asMoney(result.totalFullRevenue)}，周期平均度电净价 ${asPrice(result.avgFullRevenuePrice)}。${contributors}${sourceNote}`;

    return {
      title: "基准结果简报",
      projectName: origin.name || project?.name || "新能源项目",
      context,
      summary,
      metrics: [
        field("周期全口径收入", asMoney(result.totalFullRevenue)),
        field("周期平均度电净价", asPrice(result.avgFullRevenuePrice)),
        field(storage ? "全期储前结算电量" : "全期结算电量", asEnergy(result.totalEnergy)),
        field("首年度电净价", asPrice(first.fullRevenuePrice))
      ],
      figures: buildFigures(rows, data.contributionItems, storage),
      tables: [storage, buildAnnualTable(rows)].filter(Boolean),
      assumptions: buildAssumptions(first, config, storage),
      trace: buildTrace(signal),
      versionId: signal.versionId
    };
  }

  return Object.freeze({ buildBrief });
});
