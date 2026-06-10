"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_COMPARE_PAGE = api;
  if (root.window && root.window !== root) {
    root.window.NE_COMPARE_PAGE = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function escapeHtml(text) {
    return String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function asNum(value, digits = 1) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(digits) : "-";
  }

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  function setHtml(node, html) {
    if (node) node.innerHTML = html;
  }

  function resetComparePageState(input = {}) {
    const {
      refs = {},
      setCompareMetric = () => {},
      syncCompareSensitivityControls = () => {}
    } = input;
    setHtml(refs.compareBody, "");
    setHtml(refs.compareSensitivityBody, "");
    setHtml(refs.compareSensitivityFactorList, "");
    setHtml(refs.compareScenarioFocusList, "");
    setCompareMetric(refs.compareMetricBaselineScenario, "-");
    setCompareMetric(refs.compareMetricBaselineRevenue, "-");
    setCompareMetric(refs.compareMetricSensitiveFactors, "0 项");
    setCompareMetric(refs.compareMetricCompareCount, "0 个");
    setCompareMetric(refs.compareMetricScenarioCount, "0 个");
    setCompareMetric(refs.compareMetricBestScenario, "-");
    setCompareMetric(refs.compareMetricMaxGap, "-");
    setCompareMetric(refs.compareMetricPeriod, "-");
    setText(refs.compareSensitivityResponseLabel, "等待变量选择");
    setText(refs.compareScenarioBridgeLabel, "等待方案选择");
    setText(refs.compareSensitivityVariableSummary, "默认启用全部变量");
    setText(refs.compareBaselineLabel, "等待基准方案结果");
    setText(refs.compareScenarioLabel, "等待方案结果");
    setText(refs.compareSensitivityMessage, "请先在基准结果总览完成基准方案测算，再查看敏感性分析。");
    setText(refs.compareScenarioMessage, "当前仅展示已完成测算的方案结果；新增方案并测算后即可加入对比。");
    syncCompareSensitivityControls();
  }

  function renderCompareNoProjectState(input = {}) {
    const {
      refs = {},
      renderPlaceholder = () => {}
    } = input;
    renderPlaceholder("sensitivityTornado", refs.compareSensitivityTornadoChart, "请选择项目后查看敏感性分析。");
    renderPlaceholder("sensitivityResponse", refs.compareSensitivityResponseChart, "请选择项目后查看响应曲线。");
    renderPlaceholder("scenarioRanking", refs.compareRankingChart, "请选择项目后查看方案对标。");
    renderPlaceholder("scenarioTrend", refs.compareTrendChart, "请选择项目后查看方案对比。");
    renderPlaceholder("scenarioBridge", refs.compareBridgeChart, "请选择方案查看差异归因。");
  }

  function renderCompareNoResultsState(input = {}) {
    const {
      refs = {},
      renderPlaceholder = () => {}
    } = input;
    setHtml(refs.compareBody, `<tr><td colspan="7">暂无可对比结果，请先在基准结果总览页完成基准方案测算。</td></tr>`);
    renderPlaceholder("sensitivityTornado", refs.compareSensitivityTornadoChart, "基准方案未测算，暂无法展示。");
    renderPlaceholder("sensitivityResponse", refs.compareSensitivityResponseChart, "基准方案未测算，暂无法展示。");
    renderPlaceholder("scenarioRanking", refs.compareRankingChart, "暂无方案结果，无法生成收益排名。");
    renderPlaceholder("scenarioTrend", refs.compareTrendChart, "暂无方案结果，无法生成年度走势。");
    renderPlaceholder("scenarioBridge", refs.compareBridgeChart, "请选择方案查看差异归因。");
  }

  function buildSensitivityFactorListHtml(input = {}) {
    const {
      allFactors = [],
      enabledFactors = [],
      activeFactorKey = "",
      tokens = {}
    } = input;
    const palette = Array.isArray(tokens.palette) && tokens.palette.length ? tokens.palette : [tokens.primary || "#3f82e6"];
    const enabledSet = new Set(enabledFactors.map((factor) => factor.key));
    const enabledRankMap = new Map(enabledFactors.map((factor, index) => [factor.key, index + 1]));
    const optionHtml = allFactors.map((factor) => {
      const checked = enabledSet.has(factor.key);
      return `
      <label class="compare-variable-option ${checked ? "" : "muted"}">
        <input type="checkbox" data-sensitivity-variable="${escapeHtml(factor.key)}" ${checked ? "checked" : ""}>
        <span>
          <strong>${escapeHtml(factor.name)}</strong>
          <small>${escapeHtml(factor.note)}</small>
        </span>
      </label>
    `;
    }).join("");

    const drillHtml = enabledFactors.map((factor) => {
      const index = enabledRankMap.get(factor.key) || 0;
      const isActive = factor.key === activeFactorKey;
      const colorIndex = Number.isFinite(Number(factor.colorIndex)) ? Number(factor.colorIndex) : 0;
      const color = palette[colorIndex % palette.length] || tokens.primary || palette[0];
      return `
      <button class="compare-factor-button ${isActive ? "active" : ""}" type="button" data-sensitivity-factor="${escapeHtml(factor.key)}">
        <span class="compare-factor-rank" style="--factor-color:${color}">${index + 1}</span>
        <span class="compare-factor-main">
          <strong>${escapeHtml(factor.name)}</strong>
          <small>${escapeHtml(factor.note)}</small>
        </span>
        <span class="compare-factor-value">${asNum(factor.sensitivity, 1)} 万元</span>
      </button>
    `;
    }).join("");

    return `
    <div class="compare-variable-grid">${optionHtml}</div>
    <div class="compare-factor-subhead">
      <strong>响应曲线变量</strong>
      <span>点击下方变量切换右侧曲线</span>
    </div>
    <div class="compare-factor-drill-list">
      ${drillHtml || `<div class="hint">请至少启用一个变量。</div>`}
    </div>
  `;
  }

  function buildScenarioFocusListHtml(input = {}) {
    const {
      available = [],
      baseline = null,
      activeScenarioId = "",
      asCompactMoney = (value) => String(value)
    } = input;
    return available.map((item, index) => {
      const firstRow = item.result.annualRows.find((row) => row.energyMwh > 0) || item.result.annualRows[0] || {};
      const deltaWan = baseline ? (item.result.totalFullRevenue - baseline.result.totalFullRevenue) / 10000 : 0;
      const isActive = item.scenario.id === activeScenarioId;
      return `
      <button class="compare-factor-button ${isActive ? "active" : ""}" type="button" data-compare-focus-scenario="${escapeHtml(item.scenario.id)}">
        <span class="compare-factor-rank">${item.scenario.isBaseline ? "基" : index + 1}</span>
        <span class="compare-factor-main">
          <strong>${escapeHtml(item.scenario.name)}</strong>
          <small>首年 ${asCompactMoney(firstRow.fullRevenue || 0)} / 均价 ${asNum(item.result.avgFullRevenuePrice, 2)} 元/MWh</small>
        </span>
        <span class="compare-factor-value">${deltaWan >= 0 ? "+" : ""}${asNum(deltaWan, 1)} 万元</span>
      </button>
    `;
    }).join("");
  }

  function buildCompareTableRowsHtml(input = {}) {
    const {
      available = [],
      baseline,
      detectTopDriver = () => "-",
      asCompactMoney = (value) => String(value)
    } = input;
    return available.map((item) => {
      const deltaRevenue = item.result.totalFullRevenue - baseline.result.totalFullRevenue;
      const topDriver = detectTopDriver(item.result);
      const firstRow = item.result.annualRows.find((row) => row.energyMwh > 0) || item.result.annualRows[0] || {};
      const scenarioLabel = item.scenario.isBaseline
        ? `${escapeHtml(item.scenario.name)} <span class="table-tag">基准</span>`
        : escapeHtml(item.scenario.name);
      return `
      <tr>
        <td>${scenarioLabel}</td>
        <td>${asCompactMoney(firstRow.fullRevenue || 0)}</td>
        <td>${asCompactMoney(item.result.totalFullRevenue)}</td>
        <td>${asNum(item.result.avgFullRevenuePrice, 2)}</td>
        <td>${asNum(firstRow.capturePrice, 2)} 元/MWh</td>
        <td>${deltaRevenue >= 0 ? "+" : ""}${asCompactMoney(deltaRevenue)}</td>
        <td>${escapeHtml(topDriver)}</td>
      </tr>
    `;
    }).join("");
  }

  return Object.freeze({
    buildCompareTableRowsHtml,
    buildScenarioFocusListHtml,
    buildSensitivityFactorListHtml,
    resetComparePageState,
    renderCompareNoProjectState,
    renderCompareNoResultsState
  });
});
