"use strict";

(function (root, factory) {
  const isCommonJs = typeof module !== "undefined" && module.exports;
  const api = factory(isCommonJs ? require("../domain/result-versions") : root.NE_RESULT_VERSIONS,
    isCommonJs ? require("../domain/revenue-rules") : root.NE_REVENUE_RULES,
    isCommonJs ? require("./rough-trend-chart") : root.NE_ROUGH_TREND_CHART);
  if (isCommonJs) module.exports = api;
  root.NE_ROUGH_PRICE_WORKSPACE = api;
  if (root.window && root.window !== root) root.window.NE_ROUGH_PRICE_WORKSPACE = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (versions, revenueRules, trendChart) {
  const states = new WeakMap();

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function number(value, digits = 2) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
      ? Number(value).toFixed(digits) : "—";
  }
  function signed(value) { return `${Number(value) > 0 ? "+" : ""}${number(value)}`; }
  function yearsFor(project) {
    return Array.from({ length: Math.min(100, Math.max(0, Number(project?.forecastYears) || 0)) },
      (_, index) => Number(project.startYear) + index);
  }
  function timestamp(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || "") : date.toLocaleString("zh-CN", { hour12: false });
  }
  function getState(documentRef) {
    if (!states.has(documentRef)) states.set(documentRef, { entries: new Map() });
    return states.get(documentRef);
  }
  function getEntry(state, project, scenario) {
    const key = `${project.id}:${scenario.id}`;
    const source = JSON.stringify(scenario.config || {});
    const projectContext = JSON.stringify([project.siteType, Boolean(project.hasStorage), project.startYear, project.forecastYears]);
    const locked = Boolean(scenario.locked);
    let entry = state.entries.get(key);
    if (!entry || entry.source !== source || entry.locked !== locked || entry.projectContext !== projectContext) {
      const lockMessage = locked && entry?.dirty
        ? "方案已锁定，未保存的共用参数调整已撤销，当前显示已保存值。" : "";
      entry = { config: clone(scenario.config || {}), source, projectContext, locked, dirty: false,
        snapshotId: entry?.snapshotId || "",
        trendVisibility: entry?.trendVisibility || {},
        threshold: entry?.threshold ?? 10, message: lockMessage, tone: "info", groupOpen: {} };
      state.entries.set(key, entry);
    }
    return entry;
  }

  function inputField(key, label, value, options = {}) {
    const { type = "number", ratio = false, disabled = false, min, max } = options;
    const attributes = `data-shared-key="${escapeHtml(key)}"${ratio ? ' data-shared-ratio="true"' : ""}`;
    const display = ratio && value !== null && value !== undefined && value !== "" ? Number((Number(value) * 100).toFixed(6)) : value;
    const control = type === "checkbox"
      ? `<input type="checkbox" ${attributes}${value ? " checked" : ""}${disabled ? " disabled" : ""}>`
      : `<input type="${type}" ${attributes} value="${escapeHtml(display)}"${type === "number" ? ' step="any"' : ""}${min !== undefined ? ` min="${min}"` : ""}${max !== undefined ? ` max="${max}"` : ""}${disabled ? " disabled" : ""}>`;
    return `<label${type === "checkbox" ? ' class="rough-checkbox"' : ""}>${escapeHtml(label)}${ratio ? "（%）" : type === "number" ? "（元/MWh）" : ""}${control}</label>`;
  }

  function selectField(key, label, value, choices, disabled) {
    return `<label>${escapeHtml(label)}<select data-shared-key="${escapeHtml(key)}"${disabled ? " disabled" : ""}>${choices.map(([id, text]) =>
      `<option value="${id}"${id === value ? " selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
  }

  function mechanismFields(config) {
    return ["mechanismEnabled", ...(config.mechanismEnabled
      ? ["mechanismPrice", "mechanismRatio", "mechanismStartYm", "mechanismEndYm", "mechanismReferenceMode",
        ...(config.mechanismReferenceMode === "same_type" ? ["sameTypeSpread"] : [])] : [])];
  }

  function sharedConfigHtml(scenario, entry, inputState) {
    const config = entry.config;
    const locked = Boolean(scenario.locked);
    const keys = mechanismFields(config);
    const confirmed = (key) => Boolean(inputState?.isConfigConfirmed?.(scenario, key, config[key]));
    const fieldStates = (html) => html.replace(/(<label[^>]*>)([\s\S]*?)(<\/label>)/g, (match, open, body, close) => {
      const field = body.match(/data-shared-key="([^"]+)"/);
      if (!field) return match;
      const isConfirmed = confirmed(field[1]);
      return `${open}${body.replace(/<(input|select)\b/, `<span class="rough-field-state${isConfirmed ? " is-confirmed" : ""}">${isConfirmed ? "已带入" : "待确认"}</span><$1`)}${close}`;
    });
    const count = keys.filter(confirmed).length;
    const complete = count === keys.length;
    const open = entry.groupOpen.mechanism ?? !complete;
    const status = complete ? "已带入，可展开核对" : count ? `已带入 ${count} 项 · 其余待确认` : "请填写或确认";
    const referenceMode = config.mechanismReferenceMode === "same_type" ? "same_type" : "project_capture";
    const mechanism = inputField("mechanismEnabled", "启用机制电价", config.mechanismEnabled, { type: "checkbox", disabled: locked }) +
      inputField("mechanismPrice", "机制电价", config.mechanismPrice, { disabled: locked, min: 0 }) +
      inputField("mechanismRatio", "机制电量占比", config.mechanismRatio, { ratio: true, min: 0, max: 100, disabled: locked }) +
      inputField("mechanismStartYm", "机制开始年月", config.mechanismStartYm, { type: "month", disabled: locked }) +
      inputField("mechanismEndYm", "机制结束年月", config.mechanismEndYm, { type: "month", disabled: locked }) +
      selectField("mechanismReferenceMode", "机制补差参照口径", referenceMode,
        [["project_capture", "项目捕获电价（现有口径）"], ["same_type", "同类型机组均价（九步口径）"]], locked) +
      inputField("sameTypeSpread", "同类型机组价差", config.sameTypeSpread ?? 0, { disabled: locked });
    return `<details class="rough-parameter-group" data-rough-group="mechanism"${open ? " open" : ""}>
      <summary><strong id="rough-group-mechanism-title">机制电价与补差口径</strong><span>${locked ? "方案已锁定，只读" : status}</span></summary>
      <div class="rough-fieldset"><div class="rough-fields">${fieldStates(mechanism)}</div>
      <p class="rough-note" data-help="机制补差口径" data-help-anchor="#rough-group-mechanism-title">已确认机制参数自动带入。年度有效机制占比按执行月份折算，同类型机组均价等于项目捕获电价加同类型机组价差。</p>
      <div class="rough-actions"><button type="button" class="ghost-button" data-rough-save-shared${locked ? " disabled" : ""}>确认并保存机制参数</button><span data-rough-dirty>${entry.dirty ? "有未保存调整，生成粗算时一并保存。" : ""}</span></div></div></details>`;
  }

  function settlementHtml(project, settlement = {}) {
    const field = (key, label, min, unit = "元/MWh") => `<label>${label}（${unit}）<input type="number" step="any" required data-rough-settlement="${key}" value="${escapeHtml(settlement[key])}"${min === undefined ? "" : ` min="${min}"`}></label>`;
    return `<fieldset class="rough-fieldset"><legend id="rough-strategy-heading">交易策略损益</legend>
      <p class="rough-note" data-help="交易策略损益" data-help-anchor="#rough-strategy-heading">从首年假设按设定步长逐年向目标值收敛，达到目标后沿用目标值。策略损益按非机制电量计入。</p>
      <div class="rough-fields">${field("ltYear1Pnl", "首年策略损益")}${field("ltTargetPnl", "目标策略损益")}${field("ltConvergeSpeed", "每年收敛步长", 0, "元/MWh/年")}</div></fieldset>
      <fieldset class="rough-fieldset"><legend id="rough-adjustments-heading">其他度电调整</legend>
      <p class="rough-note" data-help="度电调整" data-help-anchor="#rough-adjustments-heading">按全部项目结算电量填写，全周期采用同一个度电值。收入填正数，净扣费填负数。没有该项时填 0。</p>
      <div class="rough-fields">${field("environmentPrice", "环境价值", 0)}${field("feesNetPrice", "费用及其他净收入")}${project.hasStorage ? field("storagePrice", "配储补充收益") : ""}</div></fieldset>`;
  }

  function snapshotSelectorHtml(snapshots, selected, key) {
    return `<label>粗算版本<select data-rough-snapshot="${key}">${snapshots.map((snapshot) => `<option value="${escapeHtml(snapshot.id)}"${snapshot.id === selected ? " selected" : ""}>${escapeHtml(timestamp(snapshot.createdAt))} · ${escapeHtml(snapshot.id)}</option>`).join("")}</select></label>`;
  }

  function trendSvg(rows, lines, title) {
    if (!rows.length) return "";
    const values = rows.flatMap((row) => lines.map((line) => Number(row[line.key]))).filter(Number.isFinite);
    if (!values.length) return "";
    const low = Math.min(...values), high = Math.max(...values);
    const span = Math.max(high - low, 20);
    const x = (index) => 58 + (rows.length === 1 ? 270 : index / (rows.length - 1) * 534);
    const y = (value) => 145 - (value - low + span * 0.1) / (span * 1.2) * 112;
    const path = lines.map((line, index) => `<polyline class="rough-trend-line rough-trend-line-${index}" points="${rows.map((row, offset) => `${x(offset).toFixed(1)},${y(Number(row[line.key])).toFixed(1)}`).join(" ")}"/>${rows.length === 1 ? `<circle class="rough-trend-line rough-trend-line-${index}" cx="${x(0).toFixed(1)}" cy="${y(Number(rows[0][line.key])).toFixed(1)}" r="3"/>` : ""}`).join("");
    return `<figure class="rough-trend"><figcaption>${escapeHtml(title)} <span>${lines.map((line, index) => `<i class="rough-legend rough-legend-${index}">${escapeHtml(line.label)}</i>`).join(" ")}</span></figcaption><svg viewBox="0 0 620 190" role="img" aria-label="${escapeHtml(title)}，详细数值见下方年度明细"><line x1="58" y1="154" x2="592" y2="154" class="rough-trend-axis"/><text x="5" y="37">${escapeHtml(number(high))}</text><text x="5" y="145">${escapeHtml(number(low))}</text>${path}<text x="58" y="177">${rows[0].year}</text><text x="558" y="177">${rows.at(-1).year}</text></svg></figure>`;
  }

  function annualTrendHtml(visible) {
    const buttons = trendChart.SERIES.map(({ key, label, stroke, colorKey }) =>
      `<button type="button" class="rough-trend-toggle" data-rough-trend-series="${key}" data-series-color="${colorKey}" data-series-stroke="${stroke}" aria-pressed="${visible[key] !== false}" aria-controls="rough-annual-trend-plot">${escapeHtml(label)}</button>`).join("");
    return `<figure class="rough-annual-trend" data-rough-trend>
      <figcaption><div class="rough-annual-trend-title"><strong id="rough-annual-trend-title">年度粗算电价趋势</strong><span class="rough-trend-unit">元/MWh</span></div>
        <div class="rough-trend-controls" data-rough-trend-controls role="group" aria-label="显示的电价曲线" hidden>${buttons}</div></figcaption>
      <p data-help="粗算趋势图" data-help-anchor="#rough-annual-trend-title">点图例显示或隐藏曲线，至少保留一条。小圆点对应各年，悬停查看同年价格。现货线上的空心圆标记价格节点，菱形标记测算末年。</p>
      <div class="rough-annual-plot" id="rough-annual-trend-plot" data-rough-trend-plot role="img" aria-label="年度粗算电价趋势，可导出 CSV 查看详细数值" hidden></div>
      <p class="rough-trend-fallback" data-rough-trend-fallback>图表暂不可用，可导出粗算 CSV 查看年度数值。</p>
    </figure>`;
  }

  function bindAnnualTrend(documentRef, root, snapshot, visible) {
    const plot = root.querySelector("[data-rough-trend-plot]");
    const windowRef = documentRef.defaultView;
    if (!plot || !windowRef?.echarts?.init) return null;
    const buttons = Array.from(root.querySelectorAll("[data-rough-trend-series]"));
    const tokenKeys = { spot: "blue", capture: "orange", settlement: "green", ink: "ink", muted: "muted",
      line: "line", lineStrong: "line-strong", panel: "panel" };
    plot.hidden = false;
    let chart;
    let width = plot.clientWidth;
    const draw = () => {
      const style = windowRef.getComputedStyle(plot);
      const tokens = Object.fromEntries(Object.entries(tokenKeys).map(([key, cssKey]) =>
        [key, style.getPropertyValue(`--${cssKey}`).trim()]));
      chart.setOption(trendChart.buildOption(snapshot, visible, tokens, width), true);
    };
    try {
      chart = windowRef.echarts.init(plot, null, { renderer: "canvas" });
      draw();
    } catch {
      chart?.dispose();
      plot.hidden = true;
      return null;
    }
    root.querySelector("[data-rough-trend-fallback]").hidden = true;
    root.querySelector("[data-rough-trend-controls]").hidden = false;
    const syncLegend = () => {
      const count = trendChart.SERIES.filter(({ key }) => visible[key] !== false).length;
      buttons.forEach((button) => {
        const selected = visible[button.dataset.roughTrendSeries] !== false;
        const required = selected && count === 1;
        button.setAttribute("aria-pressed", String(selected));
        if (required) button.setAttribute("aria-disabled", "true");
        else button.removeAttribute("aria-disabled");
        button.title = required ? "至少保留一条曲线" : "";
      });
    };
    buttons.forEach((button) => {
      const series = trendChart.SERIES.find(({ key }) => key === button.dataset.roughTrendSeries);
      button.onclick = () => {
        if (button.getAttribute("aria-disabled") === "true") return;
        visible[series.key] = visible[series.key] === false;
        chart.dispatchAction({ type: "hideTip" });
        chart.dispatchAction({ type: visible[series.key] ? "legendSelect" : "legendUnSelect", name: series.label });
        syncLegend();
      };
    });
    syncLegend();
    const resize = () => {
      const currentWidth = plot.clientWidth;
      if (!currentWidth || chart.isDisposed()) return;
      chart.resize();
      if (currentWidth === width) return;
      width = currentWidth;
      draw();
    };
    const observer = windowRef.ResizeObserver ? new windowRef.ResizeObserver(resize) : null;
    if (observer) observer.observe(plot);
    else windowRef.addEventListener("resize", resize);
    const themeObserver = windowRef.MutationObserver && documentRef.body ? new windowRef.MutationObserver(() => {
      if (!chart.isDisposed() && plot.clientWidth) draw();
    }) : null;
    themeObserver?.observe(documentRef.body, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      themeObserver?.disconnect();
      if (observer) observer.disconnect();
      else windowRef.removeEventListener("resize", resize);
      chart.dispose();
    };
  }

  function roughFeeBreakdown(snapshot, row) {
    return revenueRules.getOtherNetBreakdown(snapshot.calculationConfig || snapshot.config, row.year, row.fee, row.otherIncome);
  }

  function roughResultsHtml(snapshot, snapshots, entry, snapshotState) {
    if (!snapshot) return "";
    const summary = snapshot.summary;
    const formula = snapshot.settlementMethod === "compact-v1"
      ? "综合结算价＝捕获电价＋机制补差＋非机制电量策略贡献＋环境价值＋配储补充收益＋费用及其他净收入。费用及其他净收入按带符号净额计入。"
      : "综合结算价＝捕获电价＋机制补差＋非机制电量策略贡献＋环境价值贡献＋配储收益－三项费用＋其他净收入。三项费用包括市场运营费、电网考核费和辅助服务费。历史明细无法核对时，费用分项留空，仍显示原结算价。";
    return `<section class="rough-card"><div class="rough-section-head"><div><h3 id="rough-results-heading">年度粗算结果</h3><p data-help="粗算结果与计算口径" data-help-anchor="#rough-results-heading">每次生成保存独立参数快照，可选择历史版本追溯。${formula}</p></div><button type="button" class="ghost-button" data-rough-export>导出粗算 CSV</button></div>${snapshotSelectorHtml(snapshots, snapshot.id, "rough")}
      ${snapshotState && !snapshotState.comparable ? `<p class="rough-alert">${escapeHtml(snapshotState.message)}</p>` : snapshotState?.refined ? '<span class="rough-badge">已保留原粗算 · 收益参数已细化</span>' : ""}
      <div class="rough-metrics"><div><span>全周期电量加权均价</span><strong>${number(summary.weightedPrice)}<small> 元/MWh</small></strong>${summary.weightedPrice === null ? "<small>电量未完整录入，暂不展示</small>" : ""}</div><div><span>年度算术均价（参考）</span><strong>${number(summary.simpleAverage)}<small> 元/MWh</small></strong></div><div><span>首年 / 末年综合结算价</span><strong>${number(summary.firstPrice)} / ${number(summary.lastPrice)}</strong></div></div>
      <div class="rough-assumptions"><span>捕获率 ${number(snapshot.draft.captureRate)}%</span><span>${snapshot.config.mechanismReferenceMode === "same_type" ? `同类型补差 · 价差 ${number(snapshot.config.sameTypeSpread)} 元/MWh` : "项目捕获价补差"}</span><span id="rough-source-summary">${snapshot.draft.sourceNote ? "已记录假设来源" : "未填写假设来源"}</span>${snapshot.draft.sourceNote ? `<p data-help="假设来源" data-help-anchor="#rough-source-summary">${escapeHtml(snapshot.draft.sourceNote)}</p>` : ""}</div>
      ${annualTrendHtml(entry.trendVisibility || {})}
      </section>`;
  }

  function availablePriceNodeYear(years, nodes) {
    const used = new Set(nodes.map((node) => node.year));
    return years.slice(0, -1).find((year) => !used.has(year));
  }

  function endPricePlaceholder(years, defaultPrice) {
    if (years.length === 1) return "请输入预期价格";
    return defaultPrice === null || defaultPrice === undefined ? "沿用最近节点" : String(defaultPrice);
  }

  function isRequiredStartNode(nodes, node, startYear) {
    return node !== undefined && nodes.find((item) => item.year === startYear) === node;
  }

  function priceNodesHtml(years, nodes, defaultEndPrice) {
    const startYear = years[0];
    const endYear = years.at(-1);
    const endIndex = nodes.findIndex((node) => node.year === endYear);
    const editableNodes = nodes.map((node, index) => ({ node, index }))
      .filter(({ index }) => index !== endIndex)
      .sort((left, right) => (left.node.year ?? Infinity) - (right.node.year ?? Infinity));
    const rows = editableNodes.map(({ node, index }, position) => {
      const canRemove = !isRequiredStartNode(nodes, node, startYear);
      return `<div class="rough-node"><label>节点年份<input type="number" min="${startYear}" max="${endYear - 1}" step="1" data-rough-node="${index}" data-node-field="year" value="${escapeHtml(node.year)}"></label><label>现货均价<input type="number" step="any" data-rough-node="${index}" data-node-field="value" value="${escapeHtml(node.value)}" placeholder="请输入预期价格"></label><button type="button" class="ghost-button" data-rough-remove="${index}" aria-label="删除第 ${position + 1} 个价格节点"${canRemove ? "" : " disabled"}>删除</button></div>`;
    }).join("");
    const endPrice = nodes[endIndex]?.value;
    return `${rows}<div class="rough-node"><label>${years.length === 1 ? "起止年份" : "末年节点"}<input type="number" data-rough-end-year value="${endYear}" readonly></label><label>${years.length === 1 ? "现货均价" : "末年现货均价"}<input type="number" step="any" data-rough-end-price value="${escapeHtml(endPrice)}" placeholder="${escapeHtml(endPricePlaceholder(years, defaultEndPrice))}"></label></div>`;
  }

  function roughHtml(project, scenario, draft, snapshots, snapshot, entry, snapshotState, inputState, getDefaultEndPrice, settlement = draft.settlement) {
    const years = yearsFor(project);
    const savedEnergyYears = years.filter((year) => project.energyData?.annualSummary?.[year]?.energyMwh !== undefined ||
      Array.isArray(project.energyData?.hourlyByYear?.[year])).length;
    const energyStatus = savedEnergyYears < years.length ? `<span class="rough-badge">结算电量 ${savedEnergyYears}/${years.length} 年</span>` : "";
    return `<form id="rough-price-form" class="rough-card" novalidate><div class="rough-section-head"><div><h3 id="rough-assumptions-heading">粗算价格假设</h3><p data-help="粗算价格假设" data-help-anchor="#rough-assumptions-heading">自动带入项目周期、结算电量和已确认机制参数。度电调整和策略损益保存为独立粗算假设。缺少电量时可先计算年度价格，补齐后生成新版即可查看全周期加权均价。</p></div><span class="rough-badge">元/MWh</span>${energyStatus}</div>
      <div class="rough-draft-grid"><fieldset class="rough-fieldset"><legend>年度现货均价预期</legend><p class="rough-note" data-help="价格节点">相邻节点间按年份线性插值。末年年份自动带入，价格可手动填写，留空时沿用此前最近的已填价格。仅测算一年时，填写该年价格。</p><div class="rough-nodes">${priceNodesHtml(years, draft.spotNodes, getDefaultEndPrice?.(project, draft.spotNodes))}</div><button type="button" class="ghost-button" data-rough-add${availablePriceNodeYear(years, draft.spotNodes) === undefined ? " disabled" : ""}>＋ 增加价格节点</button></fieldset>
      <fieldset class="rough-fieldset"><legend>捕获率与假设来源</legend><label>预期捕获率（%）<input type="number" min="0" max="150" step="any" id="rough-capture-input" data-rough-capture value="${escapeHtml(draft.captureRate)}"></label><p class="rough-note" data-help="捕获率" data-help-for="rough-capture-input">粗算捕获电价＝现货均价×捕获率。初始建议值 95%，请结合项目确认。</p><label>假设来源 / 判断依据（选填）<textarea rows="3" data-rough-source placeholder="如历史价格、同类项目经验或客户判断">${escapeHtml(draft.sourceNote)}</textarea></label></fieldset></div>
      ${sharedConfigHtml(scenario, entry, inputState)}${settlementHtml(project, settlement)}<div class="rough-actions"><button type="submit" class="primary-button">生成并保存粗算版本</button></div><div data-rough-message role="status" class="rough-message ${entry.tone === "error" ? "rough-alert" : ""}">${escapeHtml(entry.message)}</div></form>${roughResultsHtml(snapshot, snapshots, entry, snapshotState)}`;
  }

  function comparisonReviewHtml(relativeDelta, threshold) {
    return relativeDelta === null ? "参考绝对差额" : Math.abs(relativeDelta * 100) >= threshold
      ? '<span class="rough-review">明显偏差</span>' : "与预期接近";
  }

  function comparisonSummaryHtml(comparison, threshold) {
    const { summary, rows } = comparison;
    const relative = summary.relativeDelta ?? summary.weightedRelativeDelta ?? null;
    const delta = summary.delta ?? (summary.weightedFine - summary.weightedRough);
    const flagged = rows.filter((row) => row.relativeDelta !== null && Math.abs(row.relativeDelta * 100) >= threshold);
    const zeroBasis = rows.filter((row) => row.relativeDelta === null);
    const overall = relative === null ? "整体粗算接近零，请结合绝对差额查看。" : Math.abs(relative * 100) >= threshold
      ? `整体存在明显偏差，基准结果${delta >= 0 ? "高于" : "低于"}粗算预期。` : "整体与粗算预期接近。";
    const annual = flagged.length ? `${flagged.slice(0, 6).map((row) => row.year).join("、")}${flagged.length > 6 ? " 等" : ""} 年存在明显偏差（${flagged.length} 年）。` : zeroBasis.length ? "可比较年份未见明显偏差。" : "各年度差异均在提示阈值以内。";
    return `<strong>${overall}</strong><span>${annual}${zeroBasis.length ? `其中 ${zeroBasis.length} 年粗算接近零，请查看绝对差额。` : ""}</span>`;
  }

  function comparisonTable(rows, roughKey, fineKey, title, threshold, settlement = false) {
    return `<section class="rough-comparison-layer"><h4>${title}</h4><div class="rough-table-wrap"><table class="rough-table" aria-label="${escapeHtml(title)}"><caption>元/MWh</caption><thead><tr><th scope="col">年份</th><th scope="col">粗算</th><th scope="col">基准结果</th><th scope="col">差额</th>${settlement ? '<th scope="col">差异率</th><th scope="col">提示</th>' : ""}</tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${row.year}</th><td>${number(row[roughKey])}</td><td>${number(row[fineKey])}</td><td>${signed(row[fineKey] - row[roughKey])}</td>${settlement ? `<td>${row.relativeDelta === null ? "粗算接近零" : `${signed(row.relativeDelta * 100)}%`}</td><td data-rough-review-delta="${row.relativeDelta ?? ""}">${comparisonReviewHtml(row.relativeDelta, threshold)}</td>` : ""}</tr>`).join("")}</tbody></table></div></section>`;
  }

  function compareHtml(project, snapshots, snapshot, entry, comparison, scenario, result) {
    const historical = comparison?.baselineState?.current === false;
    const exportButton = comparison?.ok ? `<button type="button" class="ghost-button" data-compare-export>导出${historical ? "历史" : ""}对照 CSV</button>` : "";
    const head = `<section class="rough-card"><div class="rough-section-head"><div><h3 id="rough-comparison-heading">粗算与基准结果对照</h3><p data-help="交叉验证" data-help-anchor="#rough-comparison-heading">查看原先的价格预期与基准结果是否存在明显偏差。基准结果直接读取“基准结果总览”，由现货电价预测和收益参数补充与细化共同形成；原粗算保留初步假设，基准结果采用后续细化参数，差异可能来自价格预测及参数细化；一致程度不代表预测准确性。</p></div>${exportButton}</div><div class="rough-compare-controls">${snapshots.length ? snapshotSelectorHtml(snapshots, snapshot?.id, "compare") : ""}<label><span id="rough-threshold-heading">偏差提示阈值（%）</span><input type="number" data-rough-threshold min="0.1" max="1000" step="0.1" value="${escapeHtml(entry.threshold)}"></label></div><p data-help="价差与提示阈值" data-help-anchor="#rough-threshold-heading">差额＝基准结果－粗算；差异率＝差额÷粗算绝对值。达到阈值时提示明显偏差；粗算接近零时仅参考绝对差额。阈值只影响提示，不修改测算结果。</p>`;
    if (!snapshot) return `${head}<div class="rough-empty"><p>请先保存项目电价粗算，形成一份初步价格判断。</p><button type="button" class="ghost-button" data-jump="rough-page">前往项目电价粗算</button></div></section>`;
    if (!result) return `${head}<div class="rough-empty"><p>粗算已保存。完成现货电价预测和收益参数补充与细化，生成基准结果后即可对照。</p><button type="button" class="ghost-button" data-jump="scenario-page">前往收益参数补充与细化</button></div></section>`;
    if (!comparison?.ok) return `${head}<p class="rough-alert">${escapeHtml((comparison?.errors || ["当前结果暂不能对照。"]).join(" "))}</p><div class="rough-actions"><button type="button" class="ghost-button" data-jump="rough-page">查看项目电价粗算</button><button type="button" class="ghost-button" data-jump="results-page">更新基准结果</button></div><p class="rough-note" data-help="比较口径">收益参数细化后重新生成基准结果，原粗算仍可对照；项目、测算期或电量口径变化时需更新粗算。</p></section>`;
    const summary = comparison.summary;
    const delta = summary.delta ?? (summary.weightedFine - summary.weightedRough);
    const relative = summary.relativeDelta ?? summary.weightedRelativeDelta ?? null;
    const trace = comparison.resultTrace || {};
    const resultLabel = scenario?.isBaseline === false ? "方案结果" : "基准结果";
    const sourceLine = [scenario?.name || snapshot.scenarioName || "当前方案", `${historical ? "历史" : ""}${resultLabel} ${timestamp(comparison.source?.generatedAt)}`, trace.versionId, trace.priceSourceLabel].filter(Boolean).map(escapeHtml).join(" · ");
    return `${head}${comparison.snapshotState?.refined ? '<span class="rough-badge">原粗算预期 × 细化后基准</span>' : ""}${historical ? `<p class="rough-alert" role="status">历史对照。${escapeHtml(comparison.baselineState.message)}</p>` : ""}<div class="rough-baseline-source"><span>${sourceLine}</span><button type="button" class="text-button" data-jump="results-page">查看${resultLabel}</button></div>
      <div class="rough-metrics"><div><span>粗算电量加权均价</span><strong>${number(summary.weightedRough)}<small> 元/MWh</small></strong></div><div><span>基准电量加权均价</span><strong>${number(summary.weightedFine)}<small> 元/MWh</small></strong></div><div><span>整体差额 / 差异率</span><strong>${signed(delta)}<small> 元/MWh</small></strong><small>${relative === null ? "粗算接近零，参考绝对差额" : `${signed(relative * 100)}%`}</small></div></div>
      <div class="rough-comparison-summary" data-rough-comparison-summary role="status">${comparisonSummaryHtml(comparison, entry.threshold)}</div>
      ${trendSvg(comparison.rows, [{ key: "roughSettlement", label: "粗算综合价" }, { key: "fineSettlement", label: "基准综合价" }], "综合结算电价对照趋势（元/MWh）")}
      ${comparisonTable(comparison.rows, "roughSettlement", "fineSettlement", "年度综合结算电价", entry.threshold, true)}
      <details class="rough-breakdown"><summary>查看现货均价与捕获电价</summary><div class="rough-comparison-grid">${comparisonTable(comparison.rows, "roughSpot", "fineSpot", "年度现货均价", entry.threshold)}${comparisonTable(comparison.rows, "roughCapture", "fineCapture", "项目捕获电价", entry.threshold)}</div></details></section>`;
  }

  function csvText(rows) {
    return "\ufeff" + rows.map((row) => row.map((value) => {
      const text = String(value ?? "");
      return `"${text.replaceAll('"', '""')}"`;
    }).join(",")).join("\r\n");
  }
  function buildRoughCsv(snapshot) {
    const compact = snapshot.settlementMethod === "compact-v1";
    const feeHeaders = compact ? ["费用及其他净收入(元/MWh)"] : ["三项费用(元/MWh)", "其他净收入(元/MWh)"];
    return csvText([["粗算版本", snapshot.id], ["生成时间", snapshot.createdAt], ["方案", snapshot.scenarioName],
      ["预期捕获率(%)", snapshot.draft.captureRate], ["假设来源", snapshot.draft.sourceNote],
      ["年份", "现货均价(元/MWh)", "捕获电价(元/MWh)", "有效机制占比", "机制补差(元/MWh)", "策略贡献(元/MWh)", "环境价值贡献(元/MWh)", "配储收益(元/MWh)", ...feeHeaders, "综合结算价(元/MWh)", "电量(MWh)"],
      ...snapshot.rows.map((row) => {
        const legacy = compact ? null : roughFeeBreakdown(snapshot, row);
        const feeCells = compact ? [row.feesNetPrice] : [legacy.primaryFees, legacy.otherNetIncome];
        return [row.year, row.spotAvgPrice, row.capturePrice, row.mechanismRatio,
          row.mechanismAdjustment, (1 - row.mechanismRatio) * row.ltPnlPrice, row.envValue,
          row.storageSupplement, ...feeCells, row.fullRevenuePrice, row.energyMwh];
      })]);
  }
  function buildComparisonCsv(snapshot, source, comparison) {
    const trace = comparison.resultTrace || versions.describeResult({ sourceContext: source });
    return csvText([["粗算版本", snapshot.id], ["基准结果方案", source.scenarioId || snapshot.scenarioId],
      ["基准结果生成时间", source.generatedAt || ""], ["基准预测曲线版本", source.runId || ""],
      ["基准结果状态", comparison.baselineState?.current === false ? `历史版。${comparison.baselineState.message}` : "与当前基准结果对照"],
      ["测算版本", trace.versionId || "旧版未编号"], ["价格来源", trace.priceSourceLabel], ["价格内容指纹", trace.priceContentFingerprint],
      ["收益参数状态", snapshot.settlementMethod === "compact-v1" ? "独立粗算假设与基准收益参数对照"
        : comparison.snapshotState?.refined ? "已细化；保留原粗算预期" : "沿用粗算参数"],
      ["粗算电量加权均价", comparison.summary?.weightedRough], ["基准电量加权均价", comparison.summary?.weightedFine],
      ["年份", "粗算现货均价", "基准现货均价", "粗算捕获价", "基准捕获价", "粗算综合结算价", "基准综合结算价", "综合价差额(基准-粗算)", "综合价差异率", "基准捕获率(%)"],
      ...comparison.rows.map((row) => [row.year, row.roughSpot, row.fineSpot, row.roughCapture,
        row.fineCapture, row.roughSettlement, row.fineSettlement, row.delta, row.relativeDelta, row.fineCaptureRate])]);
  }
  function downloadCsv(documentRef, filename, content) {
    const windowRef = documentRef.defaultView || globalThis;
    const URLRef = windowRef.URL;
    if (!URLRef?.createObjectURL || !documentRef.createElement) return;
    const url = URLRef.createObjectURL(new windowRef.Blob([content], { type: "text/csv;charset=utf-8;" }));
    const anchor = documentRef.createElement("a");
    anchor.href = url;
    anchor.download = filename.replace(/[\\/:*?"<>|]/g, "_");
    anchor.click();
    windowRef.setTimeout(() => URLRef.revokeObjectURL(url), 1000);
  }

  function bindPriceNodes(root, draft, options, redraw, message) {
    const { project, domain, onPersist = () => {} } = options;
    const years = yearsFor(project);
    const endYear = years.at(-1);
    const endPrice = root.querySelector("[data-rough-end-price]");
    const add = root.querySelector("[data-rough-add]");
    const removals = Array.from(root.querySelectorAll("[data-rough-remove]"),
      (button) => ({ button, node: draft.spotNodes[Number(button.dataset.roughRemove)] }));
    let endNode = draft.spotNodes.find((node) => node.year === endYear);
    const refresh = () => {
      if (endPrice) endPrice.placeholder = endPricePlaceholder(years, domain.getDefaultEndPrice?.(project, draft.spotNodes));
      if (add) add.disabled = availablePriceNodeYear(years, draft.spotNodes) === undefined;
      removals.forEach(({ button, node }) => { button.disabled = isRequiredStartNode(draft.spotNodes, node, years[0]); });
    };
    root.querySelectorAll("[data-rough-node]").forEach((field) => {
      const node = draft.spotNodes[Number(field.dataset.roughNode)];
      if (!node) return;
      field.oninput = () => {
        node[field.dataset.nodeField] = field.value === "" ? null : Number(field.value);
        refresh();
      };
      field.onchange = () => onPersist();
    });
    if (endPrice) {
      endPrice.oninput = () => {
        if (endPrice.validity?.badInput) return;
        const value = endPrice.value === "" ? null : Number(endPrice.value);
        if (endNode && value === null && years.length > 1) {
          draft.spotNodes.splice(draft.spotNodes.indexOf(endNode), 1);
          endNode = undefined;
        } else if (endNode) {
          endNode.value = value;
        } else if (value !== null) {
          endNode = { year: endYear, value };
          draft.spotNodes.push(endNode);
        }
      };
      endPrice.onchange = () => { if (!endPrice.validity?.badInput) onPersist(); };
    }
    removals.forEach(({ button, node }) => {
      button.onclick = () => {
        if (button.disabled) return;
        const index = draft.spotNodes.indexOf(node);
        if (index < 0) return;
        draft.spotNodes.splice(index, 1);
        onPersist();
        redraw();
      };
    });
    if (add) add.onclick = () => {
      const year = availablePriceNodeYear(years, draft.spotNodes);
      if (year === undefined) return message("可填写的节点年份已用完。", "warn");
      draft.spotNodes.push({ year, value: null });
      onPersist();
      redraw();
    };
    refresh();
  }

  function bindWorkspace(options, refs, entry, draft, settlement, snapshot, comparison) {
    const { documentRef, project, scenario, domain, onChange = () => {}, onPersist = () => {}, onMessage = () => {} } = options;
    const redraw = () => renderWorkspace(options);
    [refs.rough, refs.compare].forEach((container) => container.querySelectorAll("[data-jump]").forEach((button) => {
      button.onclick = () => options.onNavigate?.(button.dataset.jump);
    }));
    const message = (text, tone = "info") => {
      entry.message = text; entry.tone = tone;
      const target = refs.rough.querySelector("[data-rough-message]");
      if (target) { target.textContent = text; target.classList?.toggle("rough-alert", tone === "error"); }
      onMessage(text, tone);
    };
    const commitShared = (confirmAll = false) => {
      if (scenario.locked || !confirmAll && !entry.dirty) return false;
      const changed = entry.dirty;
      const applicableKeys = mechanismFields(entry.config);
      // Approve only individually edited mechanism inputs when saving a rough snapshot.
      const confirmedKeys = confirmAll ? applicableKeys : applicableKeys.filter((key) =>
        JSON.stringify(entry.config[key]) !== JSON.stringify(scenario.config?.[key]));
      options.inputState?.invalidateInactiveConfirmations?.(project, scenario);
      scenario.config = clone(entry.config);
      scenario.updatedAt = typeof options.nowIso === "function" ? options.nowIso() : options.nowIso || new Date().toISOString();
      entry.source = JSON.stringify(scenario.config); entry.dirty = false;
      options.inputState?.confirmConfig?.(scenario, confirmedKeys, { source: confirmAll ? "explicit" : "rough_edit", project });
      entry.groupOpen = {};
      return changed;
    };
    bindPriceNodes(refs.rough, draft, options, redraw, message);
    const capture = refs.rough.querySelector("[data-rough-capture]");
    if (capture) { capture.oninput = () => { draft.captureRate = capture.value === "" ? null : Number(capture.value); }; capture.onchange = () => onPersist(); }
    const source = refs.rough.querySelector("[data-rough-source]");
    if (source) { source.oninput = () => { draft.sourceNote = source.value; }; source.onchange = () => onPersist(); }
    const settlementFields = Array.from(refs.rough.querySelectorAll("[data-rough-settlement]"));
    settlementFields.forEach((field) => {
      field.oninput = () => {
        const key = field.dataset.roughSettlement;
        const value = field.value === "" ? null : Number(field.value);
        settlement[key] = value;
        (draft.settlement ||= {})[key] = value;
      };
      field.onchange = () => onPersist();
    });
    refs.rough.querySelectorAll("[data-shared-key]").forEach((field) => {
      const update = () => {
        if (scenario.locked) return;
        const { sharedKey: key } = field.dataset;
        const value = field.type === "checkbox" ? field.checked : field.type === "number" ?
          field.value === "" ? null : Number(field.value) / (field.dataset.sharedRatio ? 100 : 1) : field.value;
        entry.config[key] = value;
        entry.dirty = JSON.stringify(entry.config) !== entry.source;
        const dirtyLabel = refs.rough.querySelector("[data-rough-dirty]");
        if (dirtyLabel) dirtyLabel.textContent = entry.dirty ? "有未保存调整，生成粗算时一并保存。" : "";
      };
      field.oninput = update;
      field.onchange = update;
    });
    refs.rough.querySelectorAll("[data-rough-group]").forEach((details) => {
      details.ontoggle = () => { entry.groupOpen[details.dataset.roughGroup] = details.open; };
    });
    const save = refs.rough.querySelector("[data-rough-save-shared]");
    if (save) save.onclick = () => {
      if (scenario.locked) return message("当前方案已锁定。", "error");
      const errors = domain.validateRoughMechanism(entry.config);
      if (errors.length) return message(errors.join(" "), "error");
      const changed = commitShared(true);
      message(changed ? "机制参数已保存。更新基准结果后即可交叉验证。" : "机制参数已确认，后续自动带入。", "success");
      onChange({ sharedChanged: changed });
    };
    const form = refs.rough.querySelector("#rough-price-form");
    if (form) form.onsubmit = (event) => {
      event.preventDefault();
      if (refs.rough.querySelector("[data-rough-end-price]")?.validity?.badInput) {
        return message("请填写有效的末年现货均价。", "error");
      }
      const endYear = yearsFor(project).at(-1);
      const repeatedEnd = Array.from(refs.rough.querySelectorAll('[data-rough-node][data-node-field="year"]'))
        .some((field) => Number(field.value) === endYear);
      if (repeatedEnd) return message("末年价格请填写在自动生成的末年节点，其他节点请选择不同年份。", "error");
      const config = scenario.locked ? scenario.config : entry.config;
      const result = domain.calculateCompactRough(project, { ...scenario, config }, { ...draft, settlement }, {
        id: typeof options.makeId === "function" ? options.makeId("rough") : undefined,
        createdAt: typeof options.nowIso === "function" ? options.nowIso() : options.nowIso
      });
      if (!result.ok) {
        settlementFields.find((field) => field.value === "" || field.validity?.valid === false)?.focus?.();
        return message(result.errors.join(" "), "error");
      }
      const changed = commitShared();
      draft.settlement = { ...draft.settlement, ...result.snapshot.draft.settlement };
      project.roughPrice.snapshots.unshift(result.snapshot); entry.snapshotId = result.snapshot.id;
      message("粗算版本已保存。明细参数可在收益参数补充与细化中核对。", "success");
      onChange({ sharedChanged: changed });
    };
    [refs.rough, refs.compare].forEach((container) => container.querySelectorAll("[data-rough-snapshot]").forEach((select) => {
      select.onchange = () => { entry.snapshotId = select.value; redraw(); };
    }));
    const threshold = refs.compare.querySelector("[data-rough-threshold]");
    if (threshold) {
      const updateThreshold = () => {
        const numeric = Number(threshold.value);
        if (!Number.isFinite(numeric) || numeric < 0.1 || numeric > 1000) return false;
        entry.threshold = numeric;
        refs.compare.querySelectorAll("[data-rough-review-delta]").forEach((cell) => {
          const relativeDelta = cell.dataset.roughReviewDelta === "" ? null : Number(cell.dataset.roughReviewDelta);
          cell.innerHTML = comparisonReviewHtml(relativeDelta, numeric);
        });
        const summary = refs.compare.querySelector("[data-rough-comparison-summary]");
        if (summary && comparison?.ok) summary.innerHTML = comparisonSummaryHtml(comparison, numeric);
        return true;
      };
      threshold.oninput = updateThreshold;
      threshold.onchange = () => { if (!updateThreshold()) threshold.value = entry.threshold; };
    }
    const exportRough = refs.rough.querySelector("[data-rough-export]");
    if (exportRough && snapshot) exportRough.onclick = () => downloadCsv(documentRef, `${project.name || "项目"}-粗算-${snapshot.id}.csv`, buildRoughCsv(snapshot));
    const exportComparison = refs.compare.querySelector("[data-compare-export]");
    if (exportComparison && snapshot && comparison?.ok) exportComparison.onclick = () => {
      const label = comparison.baselineState?.current === false ? "历史交叉验证" : "交叉验证";
      const version = comparison.resultTrace?.versionId ? `-${comparison.resultTrace.versionId}` : "";
      downloadCsv(documentRef, `${project.name || "项目"}-${label}-${snapshot.id}${version}.csv`, buildComparisonCsv(snapshot, comparison.source || {}, comparison));
    };
  }

  function renderWorkspace(options = {}) {
    const { documentRef, project, scenario, domain } = options;
    if (!documentRef?.querySelectorAll || !documentRef?.getElementById || options.isActive === false) return;
    const mode = options.mode === "compare" ? "compare" : "rough";
    const target = documentRef.getElementById(mode === "compare" ? "rough-compare-root" : "rough-price-root");
    if (!target) return;
    const inactive = { querySelector: () => null, querySelectorAll: () => [] };
    const refs = { rough: mode === "rough" ? target : inactive, compare: mode === "compare" ? target : inactive };
    const state = getState(documentRef);
    state.disposeTrend?.();
    state.disposeTrend = null;
    if (!project || !scenario || !domain) {
      target.innerHTML = '<div class="rough-card rough-empty">请先创建或选择项目及测算方案。<button type="button" class="ghost-button" data-jump="projects-page">选择项目</button></div>';
      target.querySelector("[data-jump]")?.addEventListener?.("click", () => options.onNavigate?.("projects-page"));
      return;
    }
    if (!project.roughPrice || typeof project.roughPrice !== "object") project.roughPrice = domain.sanitizeWorkspace(null, project);
    if (!project.roughPrice.draftsByScenario || !Array.isArray(project.roughPrice.snapshots)) project.roughPrice = domain.sanitizeWorkspace(project.roughPrice, project);
    if (!project.roughPrice.draftsByScenario[scenario.id]) project.roughPrice.draftsByScenario[scenario.id] = domain.defaultDraft(project);
    const draft = project.roughPrice.draftsByScenario[scenario.id];
    const settlement = mode === "rough" ? domain.getCompactSettlementDraft(project, scenario, draft.settlement, options.inputState) : null;
    const entry = getEntry(state, project, scenario);
    const snapshots = project.roughPrice.snapshots.filter((item) => item.scenarioId === scenario.id);
    const snapshot = snapshots.find((item) => item.id === entry.snapshotId) || snapshots[0] || null;
    entry.snapshotId = snapshot?.id || "";
    const snapshotState = snapshot ? domain.snapshotState(project, scenario, snapshot) : null;
    const result = project.resultsByScenario?.[scenario.id];
    const comparison = mode === "compare" && snapshot ? domain.compareBaselineResult(project, scenario, snapshot, result, options.getBaselineResultState) : null;
    if (comparison?.ok) {
      const run = project.priceRuns?.find((item) => item.id === result?.sourceContext?.runId);
      comparison.resultTrace = versions.describeResult(result, run);
    }
    target.innerHTML = mode === "rough"
      ? roughHtml(project, scenario, draft, snapshots, snapshot, entry, snapshotState, options.inputState, domain.getDefaultEndPrice, settlement)
      : compareHtml(project, snapshots, snapshot, entry, comparison, scenario, result);
    if (mode === "rough" && snapshot) state.disposeTrend = bindAnnualTrend(documentRef, target, snapshot, entry.trendVisibility);
    bindWorkspace(options, refs, entry, draft, settlement, snapshot, comparison);
  }

  return Object.freeze({ renderWorkspace, escapeHtml, csvText, buildRoughCsv, buildComparisonCsv,
    roughHtml, compareHtml, comparisonSummaryHtml,
    hasUnsubmittedChanges: (documentRef, projects = []) => projects.some((project) =>
      project.scenarios?.some((scenario) => states.get(documentRef)?.entries.get(`${project.id}:${scenario.id}`)?.dirty)) });
});
