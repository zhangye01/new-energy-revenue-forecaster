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
    "当前方案"
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

  function bindResultActionEvents(input = {}) {
    const {
      refs = {},
      handlers = {}
    } = input;
    refs.runCalcButton?.addEventListener("click", () => handlers.runCalculation?.());
    refs.exportAnnualButton?.addEventListener("click", () => handlers.exportAnnualCsv?.());
    refs.exportHourlyButton?.addEventListener("click", () => handlers.exportHourlyCsv?.());
    refs.printReportButton?.addEventListener("click", () => handlers.printScenarioReport?.());
  }

  function hasAllowedView(allowedViews, value) {
    if (allowedViews && typeof allowedViews.has === "function") {
      return allowedViews.has(value);
    }
    return Array.isArray(allowedViews) && allowedViews.includes(value);
  }

  function applyResultReportView(input = {}) {
    const {
      refs = {},
      view = "annual",
      allowedViews = ["annual", "price", "detail"]
    } = input;
    const nextView = hasAllowedView(allowedViews, view) ? view : "annual";
    refs.resultReportTabs?.forEach((button) => {
      const isActive = button.dataset.resultView === nextView;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    refs.resultReportPanes?.forEach((pane) => {
      const isActive = pane.dataset.resultPane === nextView;
      pane.hidden = !isActive;
      pane.classList.toggle("active", isActive);
    });
    return nextView;
  }

  function hasViewValue(value) {
    return value !== undefined && value !== null;
  }

  function setHtml(target, value) {
    if (target && hasViewValue(value)) target.innerHTML = value;
  }

  function setText(target, value) {
    if (target && hasViewValue(value)) target.textContent = value;
  }

  function resetResultDom(refs = {}) {
    if (refs.resultMetricGrid) refs.resultMetricGrid.innerHTML = "";
    if (refs.resultInsightList) refs.resultInsightList.innerHTML = "";
    if (refs.resultAssumptionList) refs.resultAssumptionList.innerHTML = "";
    if (refs.annualResultBody) refs.annualResultBody.innerHTML = "";
    if (refs.hourlyResultBody) refs.hourlyResultBody.innerHTML = "";
    if (refs.hourlyPreviewHint) refs.hourlyPreviewHint.textContent = "等待测算";
  }

  function applyResultPrimaryAction(refs, view) {
    const current = view.state === "ready" && !view.isHistorical;
    for (const [button, primary] of [[refs.runCalcButton, !current], [refs.resultValidationButton, current]]) {
      button?.classList?.toggle("primary-button", primary);
      button?.classList?.toggle("ghost-button", !primary);
    }
    if (refs.runCalcButton) refs.runCalcButton.disabled = view.state === "no_project";
  }

  function applyResultPageViewModel(input = {}) {
    const {
      refs = {},
      view = {}
    } = input;
    applyResultPrimaryAction(refs, view);
    for (const button of [refs.exportAnnualButton, refs.exportHourlyButton, refs.printReportButton]) {
      if (button) {
        button.disabled = view.state !== "ready" || Boolean(view.isHistorical);
        button.title = button.disabled ? "请先生成当前方案的有效结果" : "";
      }
    }
    setHtml(refs.resultReportMeta, view.metaHtml);
    if (refs.resultReportMeta) refs.resultReportMeta.hidden = !view.isHistorical;
    setText(refs.resultScenarioHeading, view.scenarioHeading);
    setText(refs.runCalcButton, view.calculationLabel);
    setText(refs.resultExecutiveSummary, view.executiveSummary);
    setHtml(refs.resultMetricGrid, view.metricHtml);
    setHtml(refs.resultInsightList, view.insightHtml);
    setHtml(refs.resultAssumptionList, view.assumptionHtml);
    if (refs.storageDispatchSummary) {
      refs.storageDispatchSummary.hidden = !view.storageDispatchHtml;
      refs.storageDispatchSummary.innerHTML = view.storageDispatchHtml || "";
    }
    setHtml(refs.annualResultBody, view.annualRowsHtml);
    setHtml(refs.hourlyResultBody, view.hourlyRowsHtml);
    setText(refs.hourlyPreviewHint, view.hourlyPreviewHint);
    return view;
  }

  function buildResultMetaHtml(labels = {}) {
    return `
      <span>项目：${escapeHtml(labels.projectName || "-")}</span>
      <span>方案：${escapeHtml(labels.scenarioName || "-")}</span>
      <span>周期：${escapeHtml(labels.periodText || "-")}</span>
      <span>口径：${escapeHtml(labels.assetTypeLabel || "-")} / ${escapeHtml(labels.siteTypeLabel || "-")} / ${escapeHtml(labels.storageText || "-")}</span>
    `;
  }

  function savedResultPeriod(result) {
    const rows = Array.isArray(result?.annualRows) ? result.annualRows : [];
    const years = rows.filter((row) => row?.year !== null && row?.year !== undefined)
      .map((row) => Number(row.year)).filter(Number.isInteger);
    return years.length ? `${Math.min(...years)}-${Math.max(...years)}` : "";
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

  function buildStorageDispatchHtml(rows) {
    const storageRows = rows.filter((row) => row.storageDispatch);
    if (!storageRows.length) return "";
    const first = storageRows[0].storageDispatch;
    const total = storageRows.reduce((sum, row) => sum + row.storageDispatch.incrementalRevenue, 0);
    return `
      <details class="result-disclosure">
        <summary><span>配储增量测算 · 全期现货套利增量 ${asCompactMoney(total)}</span></summary>
        <p>${asNum(first.powerMw)} MW / ${asNum(first.capacityMwh)} MWh，往返效率 ${asPercent(first.roundTripEfficiency)}。两侧使用同一条现货价格，充电取自项目上网电量，按日内价差配对。</p>
        <div class="table-scroll"><table>
          <caption>金额单位为元，充放电量单位为 MWh。全口径增量包含容量补偿、辅助服务与其他独立配储收益。</caption>
          <thead><tr><th>年份</th><th>无储现货收入</th><th>有储现货收入</th><th>充电机会成本</th><th>放电收入</th><th>现货套利增量</th><th>全口径增量</th><th>充电量</th><th>放电量</th></tr></thead>
          <tbody>${storageRows.map(({ year, storageDispatch: row }) => `<tr>
            <td>${escapeHtml(year)}</td><td>${asMoney(row.withoutStorageSpotRevenue)}</td><td>${asMoney(row.withStorageSpotRevenue)}</td>
            <td>${asMoney(row.chargeOpportunityCost)}</td><td>${asMoney(row.dischargeRevenue)}</td>
            <td>${asMoney(row.incrementalRevenue)}</td><td>${asMoney(row.incrementalRevenue + row.independentSupplementRevenue)}</td>
            <td>${asNum(row.chargeMwh, 2)}</td><td>${asNum(row.dischargeMwh, 2)}</td>
          </tr>`).join("")}</tbody>
        </table></div>
      </details>`;
  }

  function buildArchivedStorageHtml(archive) {
    const rows = Array.isArray(archive?.annualRows) ? archive.annualRows.filter((row) =>
      Number.isInteger(row?.year) && Number.isFinite(row.fullRevenue) && Number.isFinite(row.fullRevenuePrice)) : [];
    if (!rows.length) return "";
    return `<details><summary>历史基准 · 原测算口径</summary>
      <div class="table-scroll"><table><thead>
        <tr><th>年份</th><th>原全口径收入（元）</th><th>原综合电价（元/MWh）</th></tr>
      </thead><tbody>${rows.map((row) => `<tr><td>${row.year}</td>
        <td>${asMoney(row.fullRevenue)}</td><td>${asNum(row.fullRevenuePrice, 2)}</td></tr>`).join("")}</tbody></table></div>
    </details>`;
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
      resultState,
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
      { label: "首年度电净价", value: `${asNum(first.fullRevenuePrice, 2)} 元/MWh`, note: `较捕获电价${liftText} ${asNum(Math.abs(unitLift), 2)} 元/MWh` },
      { label: "周期全口径收入", value: asCompactMoney(result.totalFullRevenue), note: `测算周期 ${labels.periodText}` },
      { label: "周期平均度电净价", value: `${asNum(result.avgFullRevenuePrice, 2)} 元/MWh`, note: `${first.storageDispatch ? "储前结算电量" : "总电量"} ${asNum(result.totalEnergy, 0)} MWh` },
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
    const assumptionItems = resultState && !resultState.current ? [{
      title: "历史计算口径",
      body: "本页保留已保存的测算数值。请重新测算后查看当前配置的口径说明。"
    }] : [
      {
        title: "差价机制口径",
        body: cfg.mechanismEnabled
          ? `机制电量按有效月份折算，首年机制电量占比${asPercent(first.mechanismRatio)}，机制电价${asNum(cfg.mechanismPrice, 1)}元/MWh。`
          : "当前方案未启用差价机制。"
      },
      {
        title: "市场化交易电量",
        body: `交易策略损益与环境价值兑现均基于非纳入机制电量，首年市场化交易电量占比${asPercent(summaryData.firstMarketRatio)}。`
      },
      {
        title: "环境价值兑现",
        body: envValueMode === "manual"
          ? "环境价值采用逐年配置，兑现空间按市场化交易电量核对。"
          : "环境价值采用全周期统一配置，兑现空间按市场化交易电量核对。"
      },
      {
        title: "费用与补充收益",
        body: feeConfigMode === "manual"
          ? "综合费用与其他收入采用逐年导入配置；配储补充收益按当前储能收益口径计入。"
          : "综合费用与其他收入按当前默认全周期配置执行；配储补充收益按当前储能收益口径计入。"
      }
    ];
    if (first.storageDispatch) {
      assumptionItems.push({
        title: "配储调度口径",
        body: "使用同一市场价和场站发电曲线，站内充电、日首日末荷电量为零。现货套利按放电收入减充电机会成本计算；差价机制、环境价值等其他项沿用储前结算电量。"
      });
    }
    const previewRows = (result.hourlyPreview || []).slice(0, previewLimit);

    return {
      state: "ready",
      isHistorical: Boolean(resultState && !resultState.current),
      executiveSummary: `${resultState?.priceSourceLabel ? `${resultState.priceSourceLabel}。` : ""}${resultState && !resultState.current ? "已保存结果中，" : ""}${project.name}测算周期为${labels.periodText}，周期全口径收入合计${asCompactMoney(result.totalFullRevenue)}，平均度电净价${asNum(result.avgFullRevenuePrice, 2)}元/MWh。首年度电净价较捕获电价${liftText}${asNum(Math.abs(unitLift), 2)}元/MWh，${positiveText}，${negativeText}。`,
      metricHtml: buildMetricCards(metricItems),
      insightHtml: buildTextItems(insightItems, "result-insight-item"),
      assumptionHtml: buildTextItems(assumptionItems, "result-assumption-item"),
      storageDispatchHtml: buildStorageDispatchHtml(rows)
        + buildArchivedStorageHtml(project.legacyStorageResultsByScenario?.[scenario?.id]),
      annualRowsHtml: buildAnnualRowsHtml(rows),
      hourlyRowsHtml: buildHourlyRowsHtml(previewRows),
      hourlyPreviewHint: `测算完成 · 首年小时明细 ${(result.hourlyPreview || []).length} 条`
    };
  }

  function resultRowsAreRenderable(result) {
    const validRows = (rows) => Array.isArray(rows) && rows.every((row) => row && typeof row === "object" && !Array.isArray(row));
    return validRows(result?.annualRows) && (result.hourlyPreview == null || validRows(result.hourlyPreview));
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
      resultState = null,
      previewLimit = 240
    } = input;
    const scenarioName = String(scenario?.name || "").trim();
    const scenarioRole = scenario?.isBaseline === true ? "基准方案" : "当前方案";
    const scenarioHeading = scenarioName && scenarioName !== scenarioRole
      ? `${scenarioRole} · ${scenarioName}` : scenarioName || "方案测算简报";
    const calculationLabel = scenario?.isBaseline === true ? "发起基准测算" : "发起测算";
    const presentation = { scenarioHeading, calculationLabel };

    if (!project) {
      return {
        ...presentation,
        state: "no_project",
        executiveSummary: "请先选择项目和方案，再发起测算。",
        metaHtml: "<span>项目：-</span><span>方案：-</span><span>周期：-</span><span>口径：-</span>",
        chartPlaceholder: "请选择项目后发起测算"
      };
    }

    let metaHtml = buildResultMetaHtml(labels);
    if (!result) {
      return {
        ...presentation,
        state: "no_result",
        executiveSummary: `当前方案尚未生成结果。点击“${calculationLabel}”查看测算简报。`,
        metaHtml,
        metricHtml: buildEmptyMetricCards(),
        chartPlaceholder: `请先${calculationLabel}`
      };
    }

    if (["incomplete_result", "invalid_source_prices"].includes(resultState?.reason) || !resultRowsAreRenderable(result)) {
      return {
        ...presentation,
        state: "invalid_result", isHistorical: true, metaHtml,
        executiveSummary: resultState?.message || "已保存的结果明细不完整或无法对账，请重新测算。",
        metricHtml: buildEmptyMetricCards(), annualRowsHtml: "", hourlyRowsHtml: "",
        chartPlaceholder: "结果明细不完整，请重新测算"
      };
    }

    const historical = resultState && !resultState.current;
    const resultLabels = historical ? { ...labels, periodText: savedResultPeriod(result) || "-" } : labels;
    if (historical) {
      metaHtml = `<span>项目：${escapeHtml(labels.projectName || "-")}</span><span>方案：${escapeHtml(labels.scenarioName || "-")}</span><span>周期：${escapeHtml(resultLabels.periodText)}</span><span class="result-stale-notice" role="status">${escapeHtml(resultState.message)}</span>`;
    }

    return {
      ...presentation,
      metaHtml,
      ...buildReadyResultView({
        project,
        scenario,
        result,
        summaryData,
        labels: resultLabels,
        envValueMode,
        feeConfigMode,
        resultState,
        previewLimit
      })
    };
  }

  function buildResultPageRenderState(input = {}) {
    const {
      project = null,
      getActiveScenario = () => null,
      buildResultSummaryData = () => null,
      getForecastPeriodDisplayRange = () => "-",
      getAssetTypeLabel = () => "-",
      getSiteTypeLabel = () => "-",
      getStorageConfigText = () => "-",
      getEnvValueMode = () => "global",
      getFeeConfigMode = () => "global",
      getBaselineResultState = () => null
    } = input;
    const scenario = project ? getActiveScenario(project) : null;
    const result = project ? project.resultsByScenario?.[scenario?.id || ""] : null;
    const cfg = scenario?.config || {};
    const resultState = result ? getBaselineResultState(project, scenario, result) : null;
    const canSummarize = result && !["incomplete_result", "invalid_source_prices"].includes(resultState?.reason) && resultRowsAreRenderable(result);
    const view = buildResultPageViewModel({
      project,
      scenario,
      result,
      resultState,
      summaryData: canSummarize ? buildResultSummaryData(result) : null,
      labels: {
        projectName: project?.name || "-",
        scenarioName: scenario?.name || "-",
        periodText: project ? getForecastPeriodDisplayRange(project) : "-",
        assetTypeLabel: project ? getAssetTypeLabel(project.assetType) : "-",
        siteTypeLabel: project ? getSiteTypeLabel(project.siteType) : "-",
        storageText: project ? getStorageConfigText(project) : "-"
      },
      envValueMode: getEnvValueMode(cfg),
      feeConfigMode: getFeeConfigMode(cfg)
    });
    return { project, scenario, result, view };
  }

  return Object.freeze({
    applyResultPageViewModel,
    applyResultReportView,
    bindResultActionEvents,
    buildEmptyMetricCards,
    buildResultMetaHtml,
    savedResultPeriod,
    buildResultPageRenderState,
    buildResultPageViewModel,
    resetResultDom
  });
});
