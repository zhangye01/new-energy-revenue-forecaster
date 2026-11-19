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
  const SENSITIVITY_METRIC = Object.freeze({ label: "全周期综合度电均价", unit: "元/MWh", decimals: 2 });

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

  function buildCompareAvailabilityView(input = {}) {
    const {
      available = [],
      comparePeriod = "-"
    } = input;
    return {
      metrics: [
        { refKey: "compareMetricPeriod", value: comparePeriod },
        {
          refKey: "compareMetricCompareCount",
          value: `${available.length} 个`,
          hint: available.length ? "当前有效结果" : "等待基准重算"
        },
        {
          refKey: "compareMetricScenarioCount",
          value: `${available.length} 个`,
          hint: available.length >= 2 ? "可横向对比" : "至少 2 个方案"
        }
      ]
    };
  }

  function buildCompareOverviewView(input = {}) {
    const {
      available = [],
      baseline = null,
      sensitivityBaseline = baseline?.result?.avgFullRevenuePrice,
      comparePeriod = "-",
      sensitivityFactors = [],
      sensitivityNotice = "",
      bestScenario = null,
      excludedCount = 0,
      maxGapWan = 0,
      asCompactMoney = (value) => String(value),
      asNum = (value, digits = 1) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric.toFixed(digits) : "-";
      }
    } = input;
    const baselineName = baseline?.scenario?.name || "-";
    const baselineTargetText = Number.isFinite(sensitivityBaseline)
      ? `${asNum(sensitivityBaseline, SENSITIVITY_METRIC.decimals)} ${SENSITIVITY_METRIC.unit}` : "-";
    const strongestFactor = sensitivityFactors[0];
    const excludedNotice = excludedCount > 0 ? ` · ${excludedCount} 个历史或无效结果已排除，请重新测算。` : "";
    return {
      labels: {
        compareBaselineLabel: `基准：${baselineName}`,
        compareScenarioLabel: available.length >= 2 ? `${available.length} 个方案已纳入对比` : "当前仅基准方案已测算"
      },
      messages: {
        compareSensitivityMessage: sensitivityNotice || `基准：${baselineName} · ${SENSITIVITY_METRIC.label} ${baselineTargetText} · ${sensitivityFactors.length} 项变量`,
        compareScenarioMessage: (available.length >= 2
          ? `${available.length} 个已测算方案 · 对照基准：${baselineName}`
          : `仅“${baselineName}”有当前有效结果，待其他方案重算后比较。`) + excludedNotice
      },
      metrics: [
        { refKey: "compareMetricBaselineScenario", value: baselineName, hint: "当前基准方案" },
        {
          refKey: "compareMetricBaselineRevenue",
          value: baselineTargetText,
          hint: `周期 ${comparePeriod}`
        },
        {
          refKey: "compareMetricSensitiveFactors",
          value: `${sensitivityFactors.length} 项`,
          hint: strongestFactor?.sensitivity >= 0.005 ? `端点影响最大：${strongestFactor.name}` : sensitivityFactors.length
            ? "端点变化低于显示精度" : "等待基准结果"
        },
        {
          refKey: "compareMetricBestScenario",
          value: available.length >= 2 && bestScenario ? bestScenario.scenario.name : "待比较",
          hint: available.length >= 2 && bestScenario ? `周期总收益 ${asCompactMoney(bestScenario.result.totalFullRevenue)}` : "至少 2 个当前有效方案"
        },
        {
          refKey: "compareMetricMaxGap",
          value: `${asNum(maxGapWan, 1)} 万元`,
          hint: `相对 ${baselineName}`
        }
      ]
    };
  }

  function applyCompareView(input = {}) {
    const {
      refs = {},
      view = {},
      setCompareMetric = () => {}
    } = input;
    (view.metrics || []).forEach((metric) => {
      setCompareMetric(refs[metric.refKey], metric.value, metric.hint);
    });
    Object.entries(view.labels || {}).forEach(([refKey, text]) => {
      setText(refs[refKey], text);
    });
    Object.entries(view.messages || {}).forEach(([refKey, text]) => {
      setText(refs[refKey], text);
    });
  }

  function bindCompareEvents(input = {}) {
    const {
      refs = {},
      handlers = {}
    } = input;
    if (Array.isArray(refs.compareTabButtons)) {
      refs.compareTabButtons.forEach((button) => {
        button.addEventListener("click", () => {
          handlers.changeCompareView?.(button.dataset.compareView);
        });
      });
    }
    refs.compareSensitivityFactorList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-sensitivity-factor]");
      if (button) handlers.selectSensitivityFactor?.(button.dataset.sensitivityFactor || "");
    });
    if (refs.compareScenarioFocusList) {
      refs.compareScenarioFocusList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-compare-focus-scenario]");
        if (!button) return;
        handlers.selectScenarioFocus?.(button.dataset.compareFocusScenario || "");
      });
    }
  }

  function createCompareEventHandlers(input = {}) {
    const {
      getCompareView = () => "",
      setCompareView = () => {},
      sanitizeCompareView = (value) => value,
      setActiveSensitivityFactorKey = () => {},
      setActiveCompareScenarioId = () => {},
      renderCompare = () => {},
      queueCompareChartsResize = () => {},
      schedulePersistAppData = () => {}
    } = input;
    return {
      changeCompareView: (rawView) => {
        const nextView = sanitizeCompareView(rawView);
        if (getCompareView() === nextView) return;
        setCompareView(nextView);
        renderCompare();
        queueCompareChartsResize();
        schedulePersistAppData();
      },
      selectSensitivityFactor: (key) => {
        setActiveSensitivityFactorKey(key);
        renderCompare();
      },
      selectScenarioFocus: (scenarioId) => {
        setActiveCompareScenarioId(scenarioId);
        renderCompare();
      }
    };
  }

  function resetComparePageState(input = {}) {
    const {
      refs = {},
      setCompareMetric = () => {}
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
    setText(refs.compareBaselineLabel, "等待基准方案结果");
    setText(refs.compareScenarioLabel, "等待方案结果");
    setText(refs.compareSensitivityMessage, "请先在收益参数补充与细化中完成基准方案测算，再查看敏感性分析。");
    setText(refs.compareScenarioMessage, "仅纳入当前有效且电量口径一致的结果；过期方案请重新测算。");
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
      excludedCount = 0,
      renderPlaceholder = () => {}
    } = input;
    if (excludedCount > 0) setText(refs.compareScenarioMessage, `${excludedCount} 个已保存结果暂未纳入，请先重新测算基准方案。`);
    setHtml(refs.compareBody, `<tr><td colspan="7">暂无当前有效的基准结果。请在收益参数补充与细化中重新测算。</td></tr>`);
    renderPlaceholder("sensitivityTornado", refs.compareSensitivityTornadoChart, "请先生成当前口径的基准结果。");
    renderPlaceholder("sensitivityResponse", refs.compareSensitivityResponseChart, "请先生成当前口径的基准结果。");
    renderPlaceholder("scenarioRanking", refs.compareRankingChart, "暂无方案结果，无法生成收益排名。");
    renderPlaceholder("scenarioTrend", refs.compareTrendChart, "暂无方案结果，无法生成年度走势。");
    renderPlaceholder("scenarioBridge", refs.compareBridgeChart, "请选择方案查看差异归因。");
  }

  function buildSensitivityFactorListHtml(input = {}) {
    const {
      factors = [],
      activeFactorKey = "",
      tokens = {}
    } = input;
    const palette = Array.isArray(tokens.palette) && tokens.palette.length ? tokens.palette : [tokens.primary || "#3f82e6"];
    const drillHtml = factors.map((factor, index) => {
      const isActive = factor.key === activeFactorKey;
      const colorIndex = Number.isFinite(Number(factor.colorIndex)) ? Number(factor.colorIndex) : 0;
      const color = palette[colorIndex % palette.length] || tokens.primary || palette[0];
      return `
      <div class="compare-factor-help-row">
        <button class="compare-factor-button ${isActive ? "active" : ""}" type="button" aria-pressed="${isActive}" data-sensitivity-factor="${escapeHtml(factor.key)}">
          <span class="compare-factor-rank" style="--factor-color:${color}">${index + 1}</span>
          <span class="compare-factor-main">
            <strong>${escapeHtml(factor.name)}</strong>
            ${factor.presetLabel ? `<small>${escapeHtml(factor.presetLabel)}</small>` : ""}
          </span>
          <span class="compare-factor-value">${factor.available === false ? "未生成" : `${asNum(factor.sensitivity, SENSITIVITY_METRIC.decimals)} ${SENSITIVITY_METRIC.unit}`}</span>
        </button>
        <small data-help="${escapeHtml(factor.name)}计算口径">${escapeHtml(factor.note)}</small>
      </div>
    `;
    }).join("");

    return `
    <div class="compare-factor-drill-list">
      ${drillHtml || `<div class="hint">等待可用的敏感性结果。</div>`}
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
      const firstRow = item.result.annualRows[0] || {};
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
      const topDriver = detectTopDriver(item.result, baseline.result, item.scenario.config, baseline.scenario.config);
      const firstRow = item.result.annualRows[0] || {};
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

  function renderCompareReadyState(input = {}) {
    const {
      refs = {},
      setCompareMetric = () => {},
      available = [],
      compareState = {},
      comparePeriod = "-",
      renderPlaceholder = () => {},
      detectTopDriver = () => "-",
      asCompactMoney = (value) => String(value),
      asNum = (value, digits = 1) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric.toFixed(digits) : "-";
      },
      renderers = {}
    } = input;
    const { sensitivityBaseline = compareState.baseline?.result?.avgFullRevenuePrice, sensitivityFactors = [] } = compareState;

    if (!compareState.sensitivityDeferred) {
      if (compareState.sensitivityNotice) {
        renderPlaceholder("sensitivityTornado", refs.compareSensitivityTornadoChart, compareState.sensitivityNotice);
        renderPlaceholder("sensitivityResponse", refs.compareSensitivityResponseChart, compareState.sensitivityNotice);
      } else {
        renderers.renderSensitivityTornadoChart?.(sensitivityFactors, sensitivityBaseline, SENSITIVITY_METRIC);
        renderers.renderSensitivityResponseChart?.(sensitivityFactors, sensitivityBaseline, SENSITIVITY_METRIC);
      }
      renderers.renderSensitivityFactorList?.(sensitivityFactors);
      renderers.renderSensitivityTable?.(sensitivityFactors, SENSITIVITY_METRIC);
    }

    applyCompareView({
      refs,
      setCompareMetric,
      view: buildCompareOverviewView({
        available,
        baseline: compareState.baseline,
        sensitivityBaseline,
        comparePeriod,
        sensitivityFactors,
        sensitivityNotice: compareState.sensitivityNotice,
        bestScenario: compareState.bestScenario,
        excludedCount: compareState.excludedCount,
        maxGapWan: compareState.maxGapWan,
        asCompactMoney,
        asNum
      })
    });

    renderers.renderScenarioRankingChart?.(available, compareState.baseline);
    renderers.renderCompareTrendChart?.(available);
    renderers.renderScenarioFocusList?.(available, compareState.baseline);
    renderers.renderScenarioBridgeChart?.(compareState.focusScenario, compareState.baseline);
    setHtml(refs.compareBody, buildCompareTableRowsHtml({
      available,
      baseline: compareState.baseline,
      detectTopDriver,
      asCompactMoney
    }));
    renderers.queueCompareChartsResize?.();
  }

  function renderCompareFrame(input = {}) {
    const {
      refs = {},
      setCompareMetric = () => {},
      project = null,
      available = [],
      comparePeriod = "-",
      compareState = {},
      renderPlaceholder = () => {},
      detectTopDriver = () => "-",
      asCompactMoney = (value) => String(value),
      asNum = (value, digits = 1) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric.toFixed(digits) : "-";
      },
      renderers = {}
    } = input;

    resetComparePageState({ refs, setCompareMetric });
    if (!project) {
      renderCompareNoProjectState({ refs, renderPlaceholder });
      return "no-project";
    }

    applyCompareView({
      refs,
      setCompareMetric,
      view: buildCompareAvailabilityView({ available, comparePeriod })
    });
    if (!available.length) {
      renderCompareNoResultsState({ refs, renderPlaceholder, excludedCount: compareState.excludedCount });
      return "no-results";
    }

    renderCompareReadyState({
      refs,
      setCompareMetric,
      available,
      compareState,
      comparePeriod,
      renderPlaceholder,
      detectTopDriver,
      asCompactMoney,
      asNum,
      renderers
    });
    return "ready";
  }

  return Object.freeze({
    applyCompareView,
    bindCompareEvents,
    buildCompareAvailabilityView,
    buildCompareOverviewView,
    buildCompareTableRowsHtml,
    buildScenarioFocusListHtml,
    buildSensitivityFactorListHtml,
    createCompareEventHandlers,
    renderCompareFrame,
    renderCompareReadyState,
    resetComparePageState,
    renderCompareNoProjectState,
    renderCompareNoResultsState
  });
});
