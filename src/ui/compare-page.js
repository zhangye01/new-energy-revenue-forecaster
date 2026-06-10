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
    buildSensitivityFactorListHtml
  });
});
