"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_ROUGH_PRICE_WORKSPACE = api;
  if (root.window && root.window !== root) root.window.NE_ROUGH_PRICE_WORKSPACE = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const states = new WeakMap();
  const ENV_FIELDS = [
    ["greenCertPrice", "绿证价格"], ["greenCertRealizeRatio", "绿证兑现比例", "ratio"],
    ["greenPremiumPrice", "绿电溢价"], ["greenPremiumRealizeRatio", "绿电兑现比例", "ratio"],
    ["carbonEnabled", "启用碳收益", "boolean"], ["carbonPrice", "碳收益"],
    ["carbonRealizeRatio", "碳收益兑现比例", "ratio"]
  ];
  const FEE_FIELDS = [["marketOpFee", "市场运营费"], ["gridAssessFee", "电网考核费"],
    ["ancillaryFee", "辅助服务费"], ["otherFee", "其他费用"], ["otherIncome", "其他收入"]];
  const STORAGE_FIELDS = [["storageArbitragePrice", "配储套利收益"],
    ["storageCapacityCompPrice", "配储容量补偿"], ["storageAncillaryRevenuePrice", "配储辅助服务收益"],
    ["storageOtherRevenuePrice", "配储其他收益"]];

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
        threshold: entry?.threshold ?? 10, message: lockMessage, tone: "info", groupOpen: {} };
      state.entries.set(key, entry);
    }
    return entry;
  }

  function inputField(key, label, value, options = {}) {
    const { type = "number", ratio = false, disabled = false, year = "", group = "", min, max } = options;
    const attributes = `data-shared-key="${escapeHtml(key)}" data-shared-group="${escapeHtml(group)}" data-shared-year="${escapeHtml(year)}"${ratio ? ' data-shared-ratio="true"' : ""}`;
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

  function fieldsHtml(fields, config, project, disabled, group = "", year = "") {
    return fields.filter(([key]) => project.siteType === "offshore" || !key.startsWith("carbon"))
      .map(([key, label, type]) => inputField(key, label, config?.[key], {
      type: type === "boolean" ? "checkbox" : "number", ratio: type === "ratio", group, year,
      disabled,
      min: 0, max: type === "ratio" ? 100 : undefined
    })).join("");
  }

  function manualFieldsHtml(group, fields, config, project, disabled, confirmed) {
    const rows = config[group] || {};
    return `<div class="rough-manual-years">${yearsFor(project).map((year) => `<details class="rough-year-fields"${confirmed ? "" : " open"}><summary>${year} 年${rows[year] ? "" : " · 待补齐"}</summary><div class="rough-fields">${fieldsHtml(fields, rows[year] || {}, project, disabled, group, year)}</div></details>`).join("")}</div>`;
  }

  function sharedGroups(project, config) {
    const mechanism = ["mechanismEnabled", ...(config.mechanismEnabled
      ? ["mechanismPrice", "mechanismRatio", "mechanismStartYm", "mechanismEndYm", "mechanismReferenceMode",
        ...(config.mechanismReferenceMode === "same_type" ? ["sameTypeSpread"] : [])] : [])];
    const strategy = config.ltPricingMode === "manual" ? ["ltPricingMode", "ltManualPricesByYear"] : ["ltPricingMode", "ltYear1Pnl", "ltTargetPnl", "ltConvergeSpeed"];
    const environment = config.envValueMode === "manual" ? ["envValueMode", "envManualValuesByYear"] : ["envValueMode", ...ENV_FIELDS.filter(([key]) =>
      !key.startsWith("carbon") || (project.siteType === "offshore" && (key === "carbonEnabled" || config.carbonEnabled))).map(([key]) => key)];
    const fees = config.feeConfigMode === "manual" ? ["feeConfigMode", "feeManualValuesByYear"] : ["feeConfigMode", ...FEE_FIELDS.map(([key]) => key)];
    return { mechanism, strategy, environment, fees, ...(project.hasStorage ? { storage: STORAGE_FIELDS.map(([key]) => key) } : {}) };
  }

  function sharedConfigHtml(project, scenario, entry, inputState) {
    const config = entry.config;
    const locked = Boolean(scenario.locked);
    const groups = sharedGroups(project, config);
    const confirmed = (key) => Boolean(inputState?.isConfigConfirmed?.(scenario, key, config[key]));
    const fieldStates = (html) => html.replace(/(<label[^>]*>)([\s\S]*?)(<\/label>)/g, (match, open, body, close) => {
      const field = body.match(/data-shared-key="([^"]+)"/);
      if (!field) return match;
      const group = body.match(/data-shared-group="([^"]+)"/);
      const isConfirmed = confirmed(group?.[1] || field[1]);
      return `${open}${body.replace(/<(input|select)\b/, `<span class="rough-field-state${isConfirmed ? " is-confirmed" : ""}">${isConfirmed ? "已带入" : "待确认"}</span><$1`)}${close}`;
    });
    const groupHtml = (key, title, body) => {
      const keys = groups[key];
      const count = keys.filter(confirmed).length;
      const complete = count === keys.length;
      const open = entry.groupOpen[key] ?? !complete;
      const status = complete ? "已带入，可展开修改" : count ? `已带入 ${count} 项 · 其余待确认` : "请填写或确认";
      return `<details class="rough-parameter-group" data-rough-group="${key}"${open ? " open" : ""}><summary>${title}<span>${status}</span></summary><div class="rough-fieldset">${fieldStates(body)}</div></details>`;
    };
    const referenceMode = config.mechanismReferenceMode === "same_type" ? "same_type" : "project_capture";
    const mechanism = inputField("mechanismEnabled", "启用机制电价", config.mechanismEnabled, { type: "checkbox", disabled: locked }) +
      inputField("mechanismPrice", "机制电价", config.mechanismPrice, { disabled: locked, min: 0 }) +
      inputField("mechanismRatio", "机制电量占比", config.mechanismRatio, { ratio: true, min: 0, max: 100, disabled: locked }) +
      inputField("mechanismStartYm", "机制开始年月", config.mechanismStartYm, { type: "month", disabled: locked }) +
      inputField("mechanismEndYm", "机制结束年月", config.mechanismEndYm, { type: "month", disabled: locked }) +
      selectField("mechanismReferenceMode", "机制补差参照口径", referenceMode,
        [["project_capture", "项目捕获电价（现有口径）"], ["same_type", "同类型机组均价（九步口径）"]], locked) +
      inputField("sameTypeSpread", "同类型机组价差", config.sameTypeSpread ?? 0, { disabled: locked });
    const ltFields = config.ltPricingMode === "manual"
      ? `<div class="rough-fields">${yearsFor(project).map((year) => inputField("value", `${year} 年策略损益`, config.ltManualPricesByYear?.[year], { disabled: locked, group: "ltManualPricesByYear", year })).join("")}</div>`
      : `<div class="rough-fields">${[["ltYear1Pnl", "首年策略损益"], ["ltTargetPnl", "目标策略损益"], ["ltConvergeSpeed", "每年收敛步长"]].map(([key, label]) => inputField(key, label, config[key], { disabled: locked, min: key === "ltConvergeSpeed" ? 0 : undefined })).join("")}</div>`;
    return `<section class="rough-shared"><div class="rough-section-head"><h3 id="rough-shared-heading">结算参数</h3>${locked ? '<span class="rough-badge">方案已锁定，只读</span>' : ""}</div>
      <p class="rough-note" data-help="结算参数" data-help-anchor="#rough-shared-heading">已确认参数自动带入，未确认参数保留填写。系统建议值需要结合项目确认；保存或生成粗算即确认本页参数，并同步到收益参数补充与细化。</p>
      ${groupHtml("mechanism", "机制电价与补差口径", `<div class="rough-fields">${mechanism}</div><p class="rough-note" data-help="机制补差口径">同类型机组均价＝项目捕获电价＋同类型机组价差；年度有效机制占比按执行月份折算。</p>`)}
      ${groupHtml("strategy", "交易策略损益", selectField("ltPricingMode", "配置方式", config.ltPricingMode || "auto", [["auto", "按首年与目标逐年收敛"], ["manual", "保留 / 设置逐年值"]], locked) + ltFields)}
      ${groupHtml("environment", "环境价值", selectField("envValueMode", "配置方式", config.envValueMode || "global", [["global", "全周期分项配置"], ["manual", "保留 / 设置逐年分项"]], locked) + '<p class="rough-note" data-help="环境价值">价格与兑现比例按绿证、绿电、碳收益分别配置；兑现比例合计不得超过 100%。</p>' + (config.envValueMode === "manual" ? manualFieldsHtml("envManualValuesByYear", ENV_FIELDS, config, project, locked, confirmed("envManualValuesByYear")) : `<div class="rough-fields">${fieldsHtml(ENV_FIELDS, config, project, locked)}</div>`))}
      ${groupHtml("fees", "费用与其他收入", selectField("feeConfigMode", "配置方式", config.feeConfigMode || "global", [["global", "全周期分项配置"], ["manual", "保留 / 设置逐年分项"]], locked) + (config.feeConfigMode === "manual" ? manualFieldsHtml("feeManualValuesByYear", FEE_FIELDS, config, project, locked, confirmed("feeManualValuesByYear")) : `<div class="rough-fields">${fieldsHtml(FEE_FIELDS, config, project, locked)}</div>`))}
      ${project.hasStorage ? groupHtml("storage", "配储补充收益", `<div class="rough-fields">${fieldsHtml(STORAGE_FIELDS, config, project, locked)}</div>`) : ""}
      <div class="rough-actions"><button type="button" class="ghost-button" data-rough-save-shared${locked ? " disabled" : ""}>确认并保存结算参数</button><span data-rough-dirty>${entry.dirty ? "有未保存调整，生成粗算时一并保存。" : ""}</span></div>
    </section>`;
  }

  function projectSummaryHtml(project, scenario, getProvinceName = (value) => value) {
    const years = yearsFor(project);
    const energy = years.filter((year) => project.energyData?.annualSummary?.[year]?.energyMwh !== undefined ||
      Array.isArray(project.energyData?.hourlyByYear?.[year])).length;
    return `<div class="rough-context"><div><span>当前项目</span><strong>${escapeHtml(project.name || project.projectName || "当前项目")}</strong><small>${escapeHtml(getProvinceName(project.province) || "")} · ${project.assetType === "wind" ? "风电" : "光伏"} · ${number(project.capacityMw)} MW${project.hasStorage ? " · 含配储" : ""}</small></div><div><span>当前方案</span><strong>${escapeHtml(scenario.name || "当前方案")}${scenario.locked ? "（已锁定）" : ""}</strong></div><div><span>测算周期</span><strong>${escapeHtml(years[0] ?? "—")} — ${escapeHtml(years.at(-1) ?? "—")} 年</strong><small>${years.length} 年 · 电量记录 ${energy}/${years.length} 年</small></div></div>`;
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

  function roughResultsHtml(snapshot, snapshots, entry, snapshotState) {
    if (!snapshot) return `<section class="rough-card rough-empty"><h3>暂无粗算结果</h3><p>填写现货均价节点和捕获率，生成首版粗算。</p></section>`;
    const summary = snapshot.summary;
    return `<section class="rough-card"><div class="rough-section-head"><div><h3 id="rough-results-heading">年度粗算结果</h3><p data-help="粗算结果与计算口径" data-help-anchor="#rough-results-heading">每次生成保存独立参数快照，可选择历史版本追溯。综合结算价＝捕获电价＋机制补差＋非机制电量策略贡献＋环境价值贡献＋配储收益－综合扣费＋其他收入。金额收入仍以收入测算工作台为准。</p></div><button type="button" class="ghost-button" data-rough-export>导出粗算 CSV</button></div>${snapshotSelectorHtml(snapshots, snapshot.id, "rough")}
      ${snapshotState && !snapshotState.comparable ? `<p class="rough-alert">${escapeHtml(snapshotState.message)}</p>` : snapshotState?.refined ? '<span class="rough-badge">已保留原粗算 · 收益参数已细化</span>' : ""}
      <div class="rough-metrics"><div><span>全周期电量加权均价</span><strong>${number(summary.weightedPrice)}<small> 元/MWh</small></strong>${summary.weightedPrice === null ? "<small>电量未完整录入，暂不展示</small>" : ""}</div><div><span>年度算术均价（参考）</span><strong>${number(summary.simpleAverage)}<small> 元/MWh</small></strong></div><div><span>首年 / 末年综合结算价</span><strong>${number(summary.firstPrice)} / ${number(summary.lastPrice)}</strong></div></div>
      <div class="rough-assumptions"><span>捕获率 ${number(snapshot.draft.captureRate)}%</span><span>${snapshot.config.mechanismReferenceMode === "same_type" ? `同类型补差 · 价差 ${number(snapshot.config.sameTypeSpread)} 元/MWh` : "项目捕获价补差"}</span><span id="rough-source-summary">${snapshot.draft.sourceNote ? "已记录假设来源" : "未填写假设来源"}</span>${snapshot.draft.sourceNote ? `<p data-help="假设来源" data-help-anchor="#rough-source-summary">${escapeHtml(snapshot.draft.sourceNote)}</p>` : ""}</div>
      ${trendSvg(snapshot.rows, [{ key: "spotAvgPrice", label: "现货均价" }, { key: "capturePrice", label: "捕获电价" }, { key: "fullRevenuePrice", label: "综合结算价" }], "年度粗算电价趋势（元/MWh）")}
      <div class="rough-table-wrap"><table class="rough-table"><caption>年度价格及结算贡献（元/MWh；电量为 MWh）</caption><thead><tr>${["年份", "现货均价", "捕获电价", "有效机制占比", "机制补差", "策略贡献", "环境价值贡献", "配储收益", "综合扣费", "其他收入", "综合结算价", "电量"].map((label) => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${snapshot.rows.map((row) => `<tr><th scope="row">${row.year}</th><td>${number(row.spotAvgPrice)}</td><td>${number(row.capturePrice)}</td><td>${number(row.mechanismRatio * 100)}%</td><td>${number(row.mechanismAdjustment)}</td><td>${number((1 - row.mechanismRatio) * row.ltPnlPrice)}</td><td>${number(row.envValue)}</td><td>${number(row.storageSupplement)}</td><td>${number(row.fee)}</td><td>${number(row.otherIncome)}</td><td><strong>${number(row.fullRevenuePrice)}</strong></td><td>${number(row.energyMwh)}</td></tr>`).join("")}</tbody></table></div>
      </section>`;
  }

  function roughHtml(project, scenario, draft, snapshots, snapshot, entry, snapshotState, getProvinceName, inputState) {
    return `${projectSummaryHtml(project, scenario, getProvinceName)}<form id="rough-price-form" class="rough-card" novalidate><div class="rough-section-head"><div><h3>粗算价格假设</h3><p data-help="粗算价格假设">已有项目、周期、电量与已确认结算参数自动带入；未确认参数在下方填写，用于与后续基准结果对照。缺少电量时，仍可计算年度价格；补齐电量后生成新版，查看全周期加权均价。</p></div><span class="rough-badge">元/MWh</span></div>
      <div class="rough-draft-grid"><fieldset class="rough-fieldset"><legend>年度现货均价预期</legend><p class="rough-note" data-help="价格节点">填写起始年及关键变化年份。节点值沿用至下一个节点前一年，采用阶梯填充。</p><div class="rough-nodes">${draft.spotNodes.map((node, index) => `<div class="rough-node"><label>节点年份<input type="number" min="${project.startYear}" max="${Number(project.startYear) + Number(project.forecastYears) - 1}" step="1" data-rough-node="${index}" data-node-field="year" value="${escapeHtml(node.year)}"></label><label>现货均价<input type="number" step="any" data-rough-node="${index}" data-node-field="value" value="${escapeHtml(node.value)}" placeholder="请输入预期价格"></label><button type="button" class="ghost-button" data-rough-remove="${index}" aria-label="删除第 ${index + 1} 个价格节点"${draft.spotNodes.length <= 1 ? " disabled" : ""}>删除</button></div>`).join("")}</div><button type="button" class="ghost-button" data-rough-add>＋ 增加价格节点</button></fieldset>
      <fieldset class="rough-fieldset"><legend>捕获率与假设来源</legend><label>预期捕获率（%）<input type="number" min="0" max="150" step="any" data-rough-capture value="${escapeHtml(draft.captureRate)}"></label><p class="rough-note" data-help="捕获率">粗算捕获电价＝现货均价×捕获率。初始建议值 95%，请结合项目确认。</p><label>假设来源 / 判断依据（选填）<textarea rows="3" data-rough-source placeholder="如历史价格、同类项目经验或客户判断">${escapeHtml(draft.sourceNote)}</textarea></label></fieldset></div>
      ${sharedConfigHtml(project, scenario, entry, inputState)}<div class="rough-actions"><button type="submit" class="primary-button">生成并保存粗算版本</button></div><div data-rough-message role="status" class="rough-message ${entry.tone === "error" ? "rough-alert" : ""}">${escapeHtml(entry.message)}</div></form>${roughResultsHtml(snapshot, snapshots, entry, snapshotState)}`;
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
    const head = `<section class="rough-card"><div class="rough-section-head"><div><h3 id="rough-comparison-heading">粗算与基准结果对照</h3><p data-help="交叉验证" data-help-anchor="#rough-comparison-heading">查看原先的价格预期与基准结果是否存在明显偏差。基准结果直接读取“基准结果总览”，由现货电价预测和收益参数补充与细化共同形成；原粗算保留初步假设，基准结果采用后续细化参数，差异可能来自价格预测及参数细化；一致程度不代表预测准确性。</p></div>${comparison?.ok ? '<button type="button" class="ghost-button" data-compare-export>导出对照 CSV</button>' : ""}</div><div class="rough-compare-controls">${snapshots.length ? snapshotSelectorHtml(snapshots, snapshot?.id, "compare") : ""}<label><span id="rough-threshold-heading">偏差提示阈值（%）</span><input type="number" data-rough-threshold min="0.1" max="1000" step="0.1" value="${escapeHtml(entry.threshold)}"></label></div><p data-help="价差与提示阈值" data-help-anchor="#rough-threshold-heading">差额＝基准结果－粗算；差异率＝差额÷粗算绝对值。达到阈值时提示明显偏差；粗算接近零时仅参考绝对差额。阈值只影响提示，不修改测算结果。</p>`;
    if (!snapshot) return `${head}<div class="rough-empty"><p>请先保存项目电价粗算，形成一份初步价格判断。</p><button type="button" class="ghost-button" data-jump="rough-page">前往项目电价粗算</button></div></section>`;
    if (!result) return `${head}<div class="rough-empty"><p>粗算已保存。完成现货电价预测和收益参数补充与细化，生成基准结果后即可对照。</p><button type="button" class="ghost-button" data-jump="scenario-page">前往收益参数补充与细化</button></div></section>`;
    if (!comparison?.ok) return `${head}<p class="rough-alert">${escapeHtml((comparison?.errors || ["当前结果暂不能对照。"]).join(" "))}</p><div class="rough-actions"><button type="button" class="ghost-button" data-jump="rough-page">查看项目电价粗算</button><button type="button" class="ghost-button" data-jump="results-page">更新基准结果</button></div><p class="rough-note" data-help="比较口径">收益参数细化后重新生成基准结果，原粗算仍可对照；项目、测算期或电量口径变化时需更新粗算。</p></section>`;
    const summary = comparison.summary;
    const delta = summary.delta ?? (summary.weightedFine - summary.weightedRough);
    const relative = summary.relativeDelta ?? summary.weightedRelativeDelta ?? null;
    return `${head}${comparison.snapshotState?.refined ? '<span class="rough-badge">原粗算预期 × 细化后基准</span>' : ""}${comparison.baselineState && !comparison.baselineState.current ? `<p class="rough-alert" role="status">${escapeHtml(comparison.baselineState.message)}本次仍与总览中的同一份已保存结果对照。</p>` : ""}<div class="rough-baseline-source"><span>${escapeHtml(scenario?.name || snapshot.scenarioName || "当前方案")} · 基准结果 ${escapeHtml(timestamp(comparison.source?.generatedAt))}</span><button type="button" class="text-button" data-jump="results-page">查看基准结果</button></div>
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
    return csvText([["粗算版本", snapshot.id], ["生成时间", snapshot.createdAt], ["方案", snapshot.scenarioName],
      ["预期捕获率(%)", snapshot.draft.captureRate], ["假设来源", snapshot.draft.sourceNote],
      ["年份", "现货均价(元/MWh)", "捕获电价(元/MWh)", "有效机制占比", "机制补差(元/MWh)", "策略贡献(元/MWh)", "环境价值贡献(元/MWh)", "配储收益(元/MWh)", "综合扣费(元/MWh)", "其他收入(元/MWh)", "综合结算价(元/MWh)", "电量(MWh)"],
      ...snapshot.rows.map((row) => [row.year, row.spotAvgPrice, row.capturePrice, row.mechanismRatio,
        row.mechanismAdjustment, (1 - row.mechanismRatio) * row.ltPnlPrice, row.envValue,
        row.storageSupplement, row.fee, row.otherIncome, row.fullRevenuePrice, row.energyMwh])]);
  }
  function buildComparisonCsv(snapshot, source, comparison) {
    return csvText([["粗算版本", snapshot.id], ["基准结果方案", source.scenarioId || snapshot.scenarioId],
      ["基准结果生成时间", source.generatedAt || ""], ["基准预测曲线版本", source.runId || ""],
      ["基准结果状态", comparison.baselineState?.message || "与保存结果对照"],
      ["收益参数状态", comparison.snapshotState?.refined ? "已细化；保留原粗算预期" : "沿用粗算参数"],
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

  function validateShared(project, scenario, config, domain) {
    const check = domain.calculateRough(project, { ...scenario, config }, {
      spotNodes: [{ year: project.startYear, value: 0 }], captureRate: 95, sourceNote: ""
    });
    const errors = check.ok ? [] : check.errors.slice();
    const checkNumber = (value, label, min = -Infinity) => {
      if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) || Number(value) < min) errors.push(`${label}应为有效数字${min === 0 ? "且不小于零" : ""}。`);
    };
    if (config.ltPricingMode !== "manual") [["ltYear1Pnl", "首年策略损益"], ["ltTargetPnl", "目标策略损益"], ["ltConvergeSpeed", "收敛步长"]].forEach(([key, label]) => checkNumber(config[key], label, key === "ltConvergeSpeed" ? 0 : -Infinity));
    const groups = [[ENV_FIELDS, config.envValueMode === "manual" ? Object.values(config.envManualValuesByYear || {}) : [config]],
      [FEE_FIELDS, config.feeConfigMode === "manual" ? Object.values(config.feeManualValuesByYear || {}) : [config]]];
    if (project.hasStorage) groups.push([STORAGE_FIELDS, [config]]);
    groups.forEach(([fields, entries]) => entries.forEach((item) => fields.forEach(([key, label, type]) => {
      if (type === "boolean" || (key.startsWith("carbon") && (project.siteType !== "offshore" || !item.carbonEnabled))) return;
      checkNumber(item[key], label, 0);
      if (type === "ratio" && Number(item[key]) > 1) errors.push(`${label}不得超过100%。`);
    })));
    return [...new Set(errors)];
  }

  function initializeManual(config, key, project) {
    if (config[key] !== "manual") return;
    const group = key === "ltPricingMode" ? "ltManualPricesByYear" : key === "envValueMode" ? "envManualValuesByYear" : "feeManualValuesByYear";
    config[group] = config[group] || {};
    const finiteValue = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
    yearsFor(project).forEach((year, index) => {
      if (Object.hasOwn(config[group], year)) return;
      if (key === "ltPricingMode") {
        if ([config.ltYear1Pnl, config.ltTargetPnl, config.ltConvergeSpeed].every(finiteValue)) {
          const first = Number(config.ltYear1Pnl), target = Number(config.ltTargetPnl);
          const delta = Math.min(Math.abs(target - first), index * Math.max(0, Number(config.ltConvergeSpeed)));
          config[group][year] = first + Math.sign(target - first) * delta;
        } else config[group][year] = null;
      } else config[group][year] = Object.fromEntries((key === "envValueMode" ? ENV_FIELDS : FEE_FIELDS).map(([field, , type]) =>
        [field, type === "boolean" ? Boolean(config[field]) : finiteValue(config[field]) ? Number(config[field]) : null]));
    });
  }

  function bindWorkspace(options, refs, state, entry, draft, snapshot, comparison) {
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
    const commitShared = () => {
      if (scenario.locked) return false;
      const changed = entry.dirty;
      scenario.config = clone(entry.config);
      scenario.updatedAt = typeof options.nowIso === "function" ? options.nowIso() : options.nowIso || new Date().toISOString();
      entry.source = JSON.stringify(scenario.config); entry.dirty = false;
      options.inputState?.confirmConfig?.(scenario, Object.values(sharedGroups(project, scenario.config)).flat());
      entry.groupOpen = {};
      return changed;
    };
    refs.rough.querySelectorAll("[data-rough-node]").forEach((field) => {
      field.oninput = () => { draft.spotNodes[Number(field.dataset.roughNode)][field.dataset.nodeField] = field.value === "" ? null : Number(field.value); };
      field.onchange = () => onPersist();
    });
    const capture = refs.rough.querySelector("[data-rough-capture]");
    if (capture) { capture.oninput = () => { draft.captureRate = capture.value === "" ? null : Number(capture.value); }; capture.onchange = () => onPersist(); }
    const source = refs.rough.querySelector("[data-rough-source]");
    if (source) { source.oninput = () => { draft.sourceNote = source.value; }; source.onchange = () => onPersist(); }
    refs.rough.querySelectorAll("[data-shared-key]").forEach((field) => {
      const update = () => {
        if (scenario.locked) return;
        const { sharedKey: key, sharedGroup: group, sharedYear: year } = field.dataset;
        const value = field.type === "checkbox" ? field.checked : field.type === "number" ?
          field.value === "" ? null : Number(field.value) / (field.dataset.sharedRatio ? 100 : 1) : field.value;
        if (group === "ltManualPricesByYear") {
          entry.config[group] = entry.config[group] || {}; entry.config[group][year] = value;
        } else if (group) {
          entry.config[group] = entry.config[group] || {};
          entry.config[group][year] = entry.config[group][year] || {};
          entry.config[group][year][key] = value;
        } else entry.config[key] = value;
        entry.dirty = JSON.stringify(entry.config) !== entry.source;
        const dirtyLabel = refs.rough.querySelector("[data-rough-dirty]");
        if (dirtyLabel) dirtyLabel.textContent = entry.dirty ? "有未保存调整，生成粗算时一并保存。" : "";
      };
      field.oninput = update;
      field.onchange = () => {
        update();
        if (["ltPricingMode", "envValueMode", "feeConfigMode"].includes(field.dataset.sharedKey)) {
          initializeManual(entry.config, field.dataset.sharedKey, project); redraw();
        }
      };
    });
    refs.rough.querySelectorAll("[data-rough-group]").forEach((details) => {
      details.ontoggle = () => { entry.groupOpen[details.dataset.roughGroup] = details.open; };
    });
    refs.rough.querySelectorAll("[data-rough-remove]").forEach((button) => {
      button.onclick = () => { if (draft.spotNodes.length > 1) draft.spotNodes.splice(Number(button.dataset.roughRemove), 1); onPersist(); redraw(); };
    });
    const add = refs.rough.querySelector("[data-rough-add]");
    if (add) add.onclick = () => {
      const used = new Set(draft.spotNodes.map((node) => node.year));
      const year = yearsFor(project).find((value) => !used.has(value));
      if (year === undefined) return message("测算周期内各年份已有节点。", "warn");
      draft.spotNodes.push({ year, value: null }); onPersist(); redraw();
    };
    const save = refs.rough.querySelector("[data-rough-save-shared]");
    if (save) save.onclick = () => {
      if (scenario.locked) return message("当前方案已锁定。", "error");
      const errors = validateShared(project, scenario, entry.config, domain);
      if (errors.length) return message(errors.join(" "), "error");
      const changed = commitShared();
      message(changed ? "结算参数已保存，原粗算快照保留。更新基准结果后即可交叉验证。" : "结算参数已确认，后续自动带入。", "success");
      onChange({ sharedChanged: changed });
    };
    const form = refs.rough.querySelector("#rough-price-form");
    if (form) form.onsubmit = (event) => {
      event.preventDefault();
      const config = scenario.locked ? scenario.config : entry.config;
      const errors = validateShared(project, scenario, config, domain);
      if (errors.length) return message(errors.join(" "), "error");
      const result = domain.calculateRough(project, { ...scenario, config }, draft, {
        id: typeof options.makeId === "function" ? options.makeId("rough") : undefined,
        createdAt: typeof options.nowIso === "function" ? options.nowIso() : options.nowIso
      });
      if (!result.ok) return message(result.errors.join(" "), "error");
      const changed = commitShared();
      project.roughPrice.snapshots.unshift(result.snapshot); entry.snapshotId = result.snapshot.id;
      message("粗算版本已保存。完成现货预测与收益参数细化后，可在交叉验证中对照基准结果。", "success");
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
      downloadCsv(documentRef, `${project.name || "项目"}-交叉验证-${snapshot.id}.csv`, buildComparisonCsv(snapshot, comparison.source || {}, comparison));
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
    if (!project || !scenario || !domain) {
      target.innerHTML = '<div class="rough-card rough-empty">请先创建或选择项目及测算方案。<button type="button" class="ghost-button" data-jump="projects-page">选择项目</button></div>';
      target.querySelector("[data-jump]")?.addEventListener?.("click", () => options.onNavigate?.("projects-page"));
      return;
    }
    if (!project.roughPrice || typeof project.roughPrice !== "object") project.roughPrice = domain.sanitizeWorkspace(null, project);
    if (!project.roughPrice.draftsByScenario || !Array.isArray(project.roughPrice.snapshots)) project.roughPrice = domain.sanitizeWorkspace(project.roughPrice, project);
    if (!project.roughPrice.draftsByScenario[scenario.id]) project.roughPrice.draftsByScenario[scenario.id] = domain.defaultDraft(project);
    const draft = project.roughPrice.draftsByScenario[scenario.id];
    const entry = getEntry(state, project, scenario);
    const snapshots = project.roughPrice.snapshots.filter((item) => item.scenarioId === scenario.id);
    const snapshot = snapshots.find((item) => item.id === entry.snapshotId) || snapshots[0] || null;
    entry.snapshotId = snapshot?.id || "";
    const snapshotState = snapshot ? domain.snapshotState(project, scenario, snapshot) : null;
    const result = project.resultsByScenario?.[scenario.id];
    const comparison = mode === "compare" && snapshot ? domain.compareBaselineResult(project, scenario, snapshot, result) : null;
    target.innerHTML = mode === "rough"
      ? roughHtml(project, scenario, draft, snapshots, snapshot, entry, snapshotState, options.getProvinceName, options.inputState)
      : compareHtml(project, snapshots, snapshot, entry, comparison, scenario, result);
    bindWorkspace(options, refs, state, entry, draft, snapshot, comparison);
  }

  return Object.freeze({ renderWorkspace, escapeHtml, csvText, buildRoughCsv, buildComparisonCsv,
    roughHtml, compareHtml, comparisonSummaryHtml, validateShared });
});
