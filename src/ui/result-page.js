"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_RESULT_PAGE = api;
  if (root.window && root.window !== root) {
    root.window.NE_RESULT_PAGE = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const EMPTY_METRIC_LABELS = Object.freeze([
    "首年全口径收入",
    "首年度电净价",
    "周期全口径收入",
    "周期平均度电净价",
    "周期总上网电量",
    "生效场景"
  ]);

  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function asMoney(value) {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      maximumFractionDigits: 0
    }).format(value);
  }

  function asCompactMoney(value) {
    const numericValue = Number(value) || 0;
    const abs = Math.abs(numericValue);
    if (abs >= 100000000) return `${(numericValue / 100000000).toFixed(2)} 亿元`;
    if (abs >= 10000) return `${(numericValue / 10000).toFixed(1)} 万元`;
    return asMoney(numericValue);
  }

  function asNum(value, digits = 1) {
    return Number(value || 0).toFixed(digits);
  }

  function asPercent(value) {
    return `${(Number(value) * 100).toFixed(1)}%`;
  }

  function buildEmptyMetricCards() {
    return EMPTY_METRIC_LABELS.map((label) => `
    <article class="metric-card">
      <div class="label">${label}</div>
      <div class="value">-</div>
    </article>
  `).join("");
  }

  function buildResultMetaHtml(labels = {}) {
    return `
      <span>项目：${escapeHtml(labels.projectName || "-")}</span>
      <span>方案：${escapeHtml(labels.scenarioName || "-")}</span>
      <span>周期：${escapeHtml(labels.periodText || "-")}</span>
      <span>口径：${escapeHtml(labels.assetTypeLabel || "-")} / ${escapeHtml(labels.siteTypeLabel || "-")} / ${escapeHtml(labels.storageText || "-")}</span>
    `;
  }

  function buildMetricCards(metricItems) {
    return metricItems.map((item) => `
    <article class="metric-card">
      <div class="label">${escapeHtml(item.label)}</div>
      <div class="value">${escapeHtml(item.value)}</div>
      <small>${escapeHtml(item.note)}</small>
    </article>
  `).join("");
  }

  function buildTextItems(items, className) {
    return items.map((item) => `
      <article class="${className}">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.body)}</span>
      </article>
    `).join("");
  }

  function buildAnnualRowsHtml(rows) {
    return rows.map((row) => `
    <tr>
      <td>${row.year}</td>
      <td>${asNum(row.annualHours, 2)}</td>
      <td>${asNum(row.energyMwh, 2)}</td>
      <td>${asNum(row.spotAvgPrice, 2)}</td>
      <td>${asNum(row.capturePrice, 2)}</td>
      <td>${asMoney(row.spotRevenue)}</td>
      <td>${asMoney(row.mechanismRevenue)}</td>
      <td>${asMoney(row.ltPnlRevenue)}</td>
      <td>${asMoney(row.envRevenue)}</td>
      <td>${asMoney(row.storageSupplementRevenue)}</td>
      <td>${asMoney(-row.comprehensiveFee)}</td>
      <td>${asMoney(row.otherIncome)}</td>
      <td>${asMoney(row.fullRevenue)}</td>
      <td>${asNum(row.fullRevenuePrice, 2)}</td>
    </tr>
  `).join("");
  }

  function buildHourlyRowsHtml(rows) {
    return rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.time)}</td>
      <td>${asNum(row.equivalentHours, 6)}</td>
      <td>${asNum(row.energyMwh, 4)}</td>
      <td>${asNum(row.spotPrice, 2)}</td>
      <td>${asMoney(row.spotRevenue)}</td>
      <td>${asMoney(row.fullRevenue)}</td>
    </tr>
  `).join("");
  }

  function buildReadyResultView(input) {
    const {
      project,
      scenario,
      result,
      summaryData,
      labels,
      envValueMode,
      feeConfigMode,
      previewLimit
    } = input;
    const { rows, first, maxRevenueRow, minRevenueRow, unitLift, liftText, leadingPositive, leadingNegative } = summaryData;
    if (!first) {
      return { state: "empty_result", chartPlaceholder: "暂无年度测算结果" };
    }

    const positiveText = leadingPositive ? `主要补充贡献来自${leadingPositive.label}（${asCompactMoney(leadingPositive.amount)}）` : "补充收益项贡献较小";
    const negativeText = leadingNegative ? `主要扣减来自${leadingNegative.label}（${asCompactMoney(leadingNegative.amount)}）` : "未形成显著扣减项";
    const metricItems = [
      { label: "首年全口径收入", value: asCompactMoney(first.fullRevenue), note: `度电净价 ${asNum(first.fullRevenuePrice, 2)} 元/MWh` },
      { label: "首年度电净价", value: `${asNum(first.fullRevenuePrice, 2)} 元/MWh`, note: `较捕获电价${liftText} ${asNum(Math.abs(unitLift), 2)}` },
      { label: "周期全口径收入", value: asCompactMoney(result.totalFullRevenue), note: `测算周期 ${labels.periodText}` },
      { label: "周期平均度电净价", value: `${asNum(result.avgFullRevenuePrice, 2)} 元/MWh`, note: `总电量 ${asNum(result.totalEnergy, 0)} MWh` },
      { label: "首年捕获电价", value: `${asNum(first.capturePrice, 2)} 元/MWh`, note: `现货均价 ${asNum(first.spotAvgPrice, 2)} 元/MWh` },
      { label: "年度收入区间", value: `${asNum(minRevenueRow.fullRevenue / 10000, 1)}-${asNum(maxRevenueRow.fullRevenue / 10000, 1)} 万元`, note: `${minRevenueRow.year} 至 ${maxRevenueRow.year}` }
    ];
    const insightItems = [
      {
        title: "首年结果",
        body: `首年全口径收入${asCompactMoney(first.fullRevenue)}，度电净价${asNum(first.fullRevenuePrice, 2)}元/MWh。`
      },
      {
        title: "价格增量",
        body: `较首年捕获电价${liftText}${asNum(Math.abs(unitLift), 2)}元/MWh，捕获价差为${asNum(first.captureSpread, 2)}元/MWh。`
      },
      {
        title: "主要贡献项",
        body: leadingPositive ? `${leadingPositive.label}全周期贡献${asCompactMoney(leadingPositive.amount)}。` : "补充收益项贡献较小。"
      },
      {
        title: "主要扣减项",
        body: leadingNegative ? `${leadingNegative.label}全周期影响${asCompactMoney(leadingNegative.amount)}。` : "当前未形成显著扣减项。"
      }
    ];
    const cfg = scenario?.config || {};
    const assumptionItems = [
      {
        title: "差价机制口径",
        body: cfg.mechanismEnabled
          ? `机制电量按有效月份折算，首年机制电量占比${asPercent(first.mechanismRatio)}，机制电价${asNum(cfg.mechanismPrice, 1)}元/MWh。`
          : "当前基准场景未启用差价机制。"
      },
      {
        title: "市场化交易电量",
        body: `交易策略损益与环境价值兑现均基于非纳入机制电量，首年市场化交易电量占比${asPercent(summaryData.firstMarketRatio)}。`
      },
      {
        title: "环境价值兑现",
        body: envValueMode === "manual"
          ? "环境价值采用逐年导入配置，逐年校核三类兑现空间合计不超过市场化交易电量空间。"
          : "环境价值采用当前全周期默认配置，绿证、绿电溢价、碳收益不重复兑现。"
      },
      {
        title: "费用与补充收益",
        body: feeConfigMode === "manual"
          ? "综合费用与其他收入采用逐年导入配置；配储补充收益按当前储能收益口径计入。"
          : "综合费用与其他收入按当前默认全周期配置执行；配储补充收益按当前储能收益口径计入。"
      }
    ];
    const previewRows = (result.hourlyPreview || []).slice(0, previewLimit);

    return {
      state: "ready",
      executiveSummary: `基准场景下，${project.name}测算周期为${labels.periodText}，周期全口径收入合计${asCompactMoney(result.totalFullRevenue)}，平均度电净价${asNum(result.avgFullRevenuePrice, 2)}元/MWh。首年度电净价较捕获电价${liftText}${asNum(Math.abs(unitLift), 2)}元/MWh，${positiveText}，${negativeText}。`,
      metricHtml: buildMetricCards(metricItems),
      insightHtml: buildTextItems(insightItems, "result-insight-item"),
      assumptionHtml: buildTextItems(assumptionItems, "result-assumption-item"),
      annualRowsHtml: buildAnnualRowsHtml(rows),
      hourlyRowsHtml: buildHourlyRowsHtml(previewRows),
      hourlyPreviewHint: `首年小时明细附件：展开后预览前 ${previewRows.length} 条，共 ${(result.hourlyPreview || []).length} 条；导出为完整8760。`
    };
  }

  function buildResultPageViewModel(input = {}) {
    const {
      project = null,
      scenario = null,
      result = null,
      summaryData = null,
      labels = {},
      envValueMode = "global",
      feeConfigMode = "global",
      previewLimit = 240
    } = input;

    if (!project) {
      return {
        state: "no_project",
        executiveSummary: "请先选择项目并完成基准场景测算，生成可导出的结果简报。",
        metaHtml: "<span>项目：-</span><span>方案：-</span><span>周期：-</span><span>口径：-</span>",
        chartPlaceholder: "请选择项目后发起测算"
      };
    }

    const metaHtml = buildResultMetaHtml(labels);
    if (!result) {
      return {
        state: "no_result",
        executiveSummary: "当前基准场景尚未生成测算结果。点击“发起基准测算”后，将自动形成简报摘要、图表与明细附表。",
        metaHtml,
        metricHtml: buildEmptyMetricCards(),
        chartPlaceholder: "请先发起基准测算"
      };
    }

    return {
      metaHtml,
      ...buildReadyResultView({
        project,
        scenario,
        result,
        summaryData,
        labels,
        envValueMode,
        feeConfigMode,
        previewLimit
      })
    };
  }

  return Object.freeze({
    buildEmptyMetricCards,
    buildResultMetaHtml,
    buildResultPageViewModel
  });
});
