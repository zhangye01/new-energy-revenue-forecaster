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
    if (!states.has(documentRef)) states.set(documentRef, { tab: "rough", entries: new Map() });
    return states.get(documentRef);
  }
  function getEntry(state, project, scenario) {
    const key = `${project.id}:${scenario.id}`;
    const source = JSON.stringify(scenario.config || {});
    const locked = Boolean(scenario.locked);
    let entry = state.entries.get(key);
    if (!entry || entry.source !== source || entry.locked !== locked) {
      const lockMessage = locked && entry?.dirty
        ? "方案已锁定，未保存的共用参数调整已撤销，当前显示已保存值。" : "";
      entry = { config: clone(scenario.config || {}), source, locked, dirty: false,
        snapshotId: entry?.snapshotId || "", runId: entry?.runId || project.activeRunId || "",
        threshold: entry?.threshold ?? 10, message: lockMessage, tone: "info", sharedOpen: false };
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
    return fields.map(([key, label, type]) => inputField(key, label, config?.[key], {
      type: type === "boolean" ? "checkbox" : "number", ratio: type === "ratio", group, year,
      disabled: disabled || (key.startsWith("carbon") && project.siteType !== "offshore"),
      min: 0, max: type === "ratio" ? 100 : undefined
    })).join("");
  }

  function manualFieldsHtml(group, fields, config, project, disabled) {
    const rows = config[group] || {};
    return `<div class="rough-manual-years">${yearsFor(project).map((year) => `<details class="rough-year-fields"><summary>${year} 年${rows[year] ? " · 已有配置" : " · 待补齐"}</summary><div class="rough-fields">${fieldsHtml(fields, rows[year] || {}, project, disabled, group, year)}</div></details>`).join("")}</div>`;
  }

  function sharedConfigHtml(project, scenario, entry) {
    const config = entry.config;
    const locked = Boolean(scenario.locked);
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
    return `<details class="rough-shared"${entry.sharedOpen ? " open" : ""} data-rough-shared>
      <summary id="rough-shared-heading">共用参数 <span>${locked ? "方案已锁定，只读" : "已带入当前方案"}</span></summary>
      <p class="rough-note" data-help="共用参数" data-help-anchor="#rough-shared-heading">沿用已有配置，与全口径收入配置共用同一份参数；保存后两处同步，已有逐年配置完整保留。生成粗算时，会一并校验和保存调整中的共用参数。请结合项目确认已有配置与系统初始建议值。</p>
      <fieldset class="rough-fieldset"><legend>机制电价与补差口径</legend><div class="rough-fields">${mechanism}</div><p class="rough-note" data-help="机制补差口径">同类型机组均价＝项目捕获电价＋同类型机组价差；年度有效机制占比按执行月份折算。两侧采用同一补差规则。</p></fieldset>
      <fieldset class="rough-fieldset"><legend>交易策略损益</legend>${selectField("ltPricingMode", "配置方式", config.ltPricingMode || "auto", [["auto", "按首年与目标逐年收敛"], ["manual", "保留 / 设置逐年值"]], locked)}${ltFields}</fieldset>
      <fieldset class="rough-fieldset"><legend>环境价值</legend>${selectField("envValueMode", "配置方式", config.envValueMode || "global", [["global", "全周期分项配置"], ["manual", "保留 / 设置逐年分项"]], locked)}
        <p class="rough-note" data-help="环境价值">价格与兑现比例按绿证、绿电、碳收益分别沿用；兑现比例合计不得超过 100%。</p>${config.envValueMode === "manual" ? manualFieldsHtml("envManualValuesByYear", ENV_FIELDS, config, project, locked) : `<div class="rough-fields">${fieldsHtml(ENV_FIELDS, config, project, locked)}</div>`}</fieldset>
      <fieldset class="rough-fieldset"><legend>费用与其他收入</legend>${selectField("feeConfigMode", "配置方式", config.feeConfigMode || "global", [["global", "全周期分项配置"], ["manual", "保留 / 设置逐年分项"]], locked)}${config.feeConfigMode === "manual" ? manualFieldsHtml("feeManualValuesByYear", FEE_FIELDS, config, project, locked) : `<div class="rough-fields">${fieldsHtml(FEE_FIELDS, config, project, locked)}</div>`}</fieldset>
      ${project.hasStorage ? `<fieldset class="rough-fieldset"><legend>配储补充收益（沿用当前方案）</legend><div class="rough-fields">${fieldsHtml(STORAGE_FIELDS, config, project, locked)}</div></fieldset>` : ""}
      <div class="rough-actions"><button type="button" class="ghost-button" data-rough-save-shared${locked ? " disabled" : ""}>保存共用参数</button><span data-rough-dirty>${entry.dirty ? "有未保存调整，生成粗算时一并保存。" : ""}</span></div>
    </details>`;
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

  function roughResultsHtml(snapshot, snapshots, entry, stale) {
    if (!snapshot) return `<section class="rough-card rough-empty"><h3>暂无粗算结果</h3><p>填写现货均价节点和捕获率，生成首版粗算。</p></section>`;
    const summary = snapshot.summary;
    return `<section class="rough-card"><div class="rough-section-head"><div><h3 id="rough-results-heading">年度粗算结果</h3><p data-help="粗算结果与计算口径" data-help-anchor="#rough-results-heading">每次生成保存独立参数快照，可选择历史版本追溯。综合结算价＝捕获电价＋机制补差＋非机制电量策略贡献＋环境价值贡献＋配储收益－综合扣费＋其他收入。金额收入仍以收入测算工作台为准。</p></div><button type="button" class="ghost-button" data-rough-export>导出粗算 CSV</button></div>${snapshotSelectorHtml(snapshots, snapshot.id, "rough")}
      ${stale ? '<p class="rough-alert">当前共用参数或电量已变化，以下为历史快照。生成新版粗算后可按一致口径交叉验证。</p>' : ""}
      <div class="rough-metrics"><div><span>全周期电量加权均价</span><strong>${number(summary.weightedPrice)}<small> 元/MWh</small></strong>${summary.weightedPrice === null ? "<small>电量未完整录入，暂不展示</small>" : ""}</div><div><span>年度算术均价（参考）</span><strong>${number(summary.simpleAverage)}<small> 元/MWh</small></strong></div><div><span>首年 / 末年综合结算价</span><strong>${number(summary.firstPrice)} / ${number(summary.lastPrice)}</strong></div></div>
      <div class="rough-assumptions"><span>捕获率 ${number(snapshot.draft.captureRate)}%</span><span>${snapshot.config.mechanismReferenceMode === "same_type" ? `同类型补差 · 价差 ${number(snapshot.config.sameTypeSpread)} 元/MWh` : "项目捕获价补差"}</span><span id="rough-source-summary">${snapshot.draft.sourceNote ? "已记录假设来源" : "未填写假设来源"}</span>${snapshot.draft.sourceNote ? `<p data-help="假设来源" data-help-anchor="#rough-source-summary">${escapeHtml(snapshot.draft.sourceNote)}</p>` : ""}</div>
      ${trendSvg(snapshot.rows, [{ key: "spotAvgPrice", label: "现货均价" }, { key: "capturePrice", label: "捕获电价" }, { key: "fullRevenuePrice", label: "综合结算价" }], "年度粗算电价趋势（元/MWh）")}
      <div class="rough-table-wrap"><table class="rough-table"><caption>年度价格及结算贡献（元/MWh；电量为 MWh）</caption><thead><tr>${["年份", "现货均价", "捕获电价", "有效机制占比", "机制补差", "策略贡献", "环境价值贡献", "配储收益", "综合扣费", "其他收入", "综合结算价", "电量"].map((label) => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${snapshot.rows.map((row) => `<tr><th scope="row">${row.year}</th><td>${number(row.spotAvgPrice)}</td><td>${number(row.capturePrice)}</td><td>${number(row.mechanismRatio * 100)}%</td><td>${number(row.mechanismAdjustment)}</td><td>${number((1 - row.mechanismRatio) * row.ltPnlPrice)}</td><td>${number(row.envValue)}</td><td>${number(row.storageSupplement)}</td><td>${number(row.fee)}</td><td>${number(row.otherIncome)}</td><td><strong>${number(row.fullRevenuePrice)}</strong></td><td>${number(row.energyMwh)}</td></tr>`).join("")}</tbody></table></div>
      </section>`;
  }

  function roughHtml(project, scenario, draft, snapshots, snapshot, entry, stale, getProvinceName) {
    return `${projectSummaryHtml(project, scenario, getProvinceName)}<form id="rough-price-form" class="rough-card" novalidate><div class="rough-section-head"><div><h3>粗算价格假设</h3><p data-help="粗算价格假设">已有项目、周期、电量和结算参数自动带入；新增假设保持独立，用于与后续模型精算对照。缺少电量时，仍可计算年度价格；补齐电量后生成新版，查看全周期加权均价。</p></div><span class="rough-badge">元/MWh</span></div>
      <div class="rough-draft-grid"><fieldset class="rough-fieldset"><legend>年度现货均价预期</legend><p class="rough-note" data-help="价格节点">填写起始年及关键变化年份。节点值沿用至下一个节点前一年，采用阶梯填充。</p><div class="rough-nodes">${draft.spotNodes.map((node, index) => `<div class="rough-node"><label>节点年份<input type="number" min="${project.startYear}" max="${Number(project.startYear) + Number(project.forecastYears) - 1}" step="1" data-rough-node="${index}" data-node-field="year" value="${escapeHtml(node.year)}"></label><label>现货均价<input type="number" step="any" data-rough-node="${index}" data-node-field="value" value="${escapeHtml(node.value)}" placeholder="请输入预期价格"></label><button type="button" class="ghost-button" data-rough-remove="${index}" aria-label="删除第 ${index + 1} 个价格节点"${draft.spotNodes.length <= 1 ? " disabled" : ""}>删除</button></div>`).join("")}</div><button type="button" class="ghost-button" data-rough-add>＋ 增加价格节点</button></fieldset>
      <fieldset class="rough-fieldset"><legend>捕获率与假设来源</legend><label>预期捕获率（%）<input type="number" min="0" max="150" step="any" data-rough-capture value="${escapeHtml(draft.captureRate)}"></label><p class="rough-note" data-help="捕获率">粗算捕获电价＝现货均价×捕获率。初始建议值 95%，请结合项目确认。</p><label>假设来源 / 判断依据（选填）<textarea rows="3" data-rough-source placeholder="如历史价格、同类项目经验或客户判断">${escapeHtml(draft.sourceNote)}</textarea></label></fieldset></div>
      ${sharedConfigHtml(project, scenario, entry)}<div class="rough-actions"><button type="submit" class="primary-button">生成并保存粗算版本</button></div><div data-rough-message role="status" class="rough-message ${entry.tone === "error" ? "rough-alert" : ""}">${escapeHtml(entry.message)}</div></form>${roughResultsHtml(snapshot, snapshots, entry, stale)}`;
  }

  function comparisonTable(rows, roughKey, fineKey, title, threshold, settlement = false) {
    return `<section class="rough-comparison-layer"><h4>${title}</h4><div class="rough-table-wrap"><table class="rough-table" aria-label="${escapeHtml(title)}"><caption>元/MWh</caption><thead><tr><th scope="col">年份</th><th scope="col">粗算</th><th scope="col">精算</th><th scope="col">差额</th>${settlement ? '<th scope="col">差异率</th><th scope="col">复核提示</th>' : ""}</tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${row.year}</th><td>${number(row[roughKey])}</td><td>${number(row[fineKey])}</td><td>${signed(row[fineKey] - row[roughKey])}</td>${settlement ? `<td>${row.relativeDelta === null ? "基准接近零" : `${signed(row.relativeDelta * 100)}%`}</td><td>${row.relativeDelta === null ? "参考绝对差额" : Math.abs(row.relativeDelta * 100) >= threshold ? '<span class="rough-review">建议复核</span>' : "阈值以内"}</td>` : ""}</tr>`).join("")}</tbody></table></div></section>`;
  }

  function comparisonBreakdownHtml(rows, captureRate) {
    const columns = [["capturePrice", "捕获电价"], ["mechanismAdjustment", "机制补差"], ["strategyContribution", "策略贡献"],
      ["envValue", "环境价值贡献"], ["storageSupplement", "配储收益"], ["feeContribution", "扣费贡献"], ["otherIncome", "其他收入"]];
    const contribution = (row, key) => key === "strategyContribution" ? (1 - row.mechanismRatio) * row.ltPnlPrice : key === "feeContribution" ? -row.fee : row[key];
    return `<details class="rough-breakdown"><summary id="rough-breakdown-heading">逐年差额与结算分项</summary><p class="rough-note" data-help="结算分项" data-help-anchor="#rough-breakdown-heading">各分项均折算为总电量度电贡献；扣费以负值列示。机制补差可能抵消部分捕获价差异，因此需同时关注三个价格层次。</p>${rows.map((row) => `<details class="rough-year-fields"><summary>${row.year} 年 · 综合价差 ${signed(row.delta)} 元/MWh · 粗算捕获率 ${number(captureRate)}% / 精算 ${row.fineCaptureRate === null ? "不适用" : `${number(row.fineCaptureRate)}%`}</summary><div class="rough-table-wrap"><table class="rough-table"><thead><tr><th>结算分项</th><th>粗算贡献</th><th>精算贡献</th><th>差额</th></tr></thead><tbody>${columns.map(([key, label]) => `<tr><th scope="row">${label}</th><td>${number(contribution(row.roughBreakdown, key))}</td><td>${number(contribution(row.fineBreakdown, key))}</td><td>${signed(contribution(row.fineBreakdown, key) - contribution(row.roughBreakdown, key))}</td></tr>`).join("")}</tbody></table></div></details>`).join("")}</details>`;
  }

  function compareHtml(project, snapshots, snapshot, entry, comparison) {
    const runs = Array.isArray(project.priceRuns) ? project.priceRuns : [];
    const statusLabels = { validated: "未过硬门槛", publishable: "可发布", publishable_warn: "可发布（软门槛预警）", publishable_forced: "强制发布", draft: "草稿" };
    const runLabel = (item) => `${item.id} · ${item.algorithmLabel || item.algorithmName || item.algorithmFamily || "预测版本"} · ${statusLabels[item.status] || item.status || "状态未标注"}${item.id === project.activeRunId ? " / 当前生效" : " / 未生效"}`;
    const head = `<section class="rough-card"><div class="rough-section-head"><div><h3>粗算与精算交叉验证</h3><p data-help="交叉验证口径">共用项目、电量与结算规则，对照独立粗算假设和模型价格曲线。选择版本仅用于查看，未通过模型质量门槛的版本也可只读对照；不会更改精算生效版本或收入测算结果。当前模型含模拟逻辑，差异提示用于复核假设，预测有效性仍需真实数据检验。</p></div><div class="rough-actions"><span class="rough-badge">含模拟逻辑</span>${comparison?.ok ? '<button type="button" class="ghost-button" data-compare-export>导出对照 CSV</button>' : ""}</div></div><div class="rough-compare-controls">${snapshots.length ? snapshotSelectorHtml(snapshots, snapshot?.id, "compare") : ""}<label>模型精算版本<select data-rough-run${runs.length ? "" : " disabled"}>${runs.length ? runs.map((item) => `<option value="${escapeHtml(item.id)}"${item.id === entry.runId ? " selected" : ""}>${escapeHtml(runLabel(item))}</option>`).join("") : '<option value="">待生成模型精算版本</option>'}</select></label><label><span id="rough-threshold-heading">价差提示阈值（%）</span><input type="number" data-rough-threshold min="0.1" max="1000" step="0.1" value="${escapeHtml(entry.threshold)}"></label></div><p data-help="价差与复核阈值" data-help-anchor="#rough-threshold-heading">差额＝精算－粗算；综合价差异率＝（精算－粗算）÷粗算绝对值。达到提示阈值的年份建议复核；阈值以内仍需结合依据判断。</p>${entry.dirty ? '<p class="rough-alert">共用参数有未保存调整，当前对照仍沿用已保存的方案参数。保存调整并生成新版粗算后，可对照更新后的结算口径。</p>' : ""}`;
    if (!snapshot) return `${head}<p class="rough-empty">请先在「关键参数粗算」生成一个版本，再与模型精算结果对照。</p></section>`;
    if (!runs.length) return `${head}<p class="rough-empty">粗算已保存。前往「模型精算」生成价格预测版本后，即可交叉验证。</p></section>`;
    if (!comparison?.ok) return `${head}<p class="rough-alert">${escapeHtml((comparison?.errors || ["当前版本暂不能对照。"]).join(" "))}</p><p class="rough-note">历史粗算快照保留原始结果；共用参数、电量或项目配置变化后，应生成新版粗算。</p></section>`;
    return `${head}
      <div class="rough-metrics"><div><span>粗算全周期电量加权均价</span><strong>${number(comparison.summary.weightedRough)}<small> 元/MWh</small></strong></div><div><span>精算全周期电量加权均价</span><strong>${number(comparison.summary.weightedFine)}<small> 元/MWh</small></strong></div><div><span>最大年度综合价绝对差额</span><strong>${number(comparison.summary.maxAbsDelta)}<small> 元/MWh</small></strong></div></div>
      ${trendSvg(comparison.rows, [{ key: "roughSettlement", label: "粗算综合价" }, { key: "fineSettlement", label: "精算综合价" }], "综合结算电价对照趋势（元/MWh）")}
      <div class="rough-comparison-grid">${comparisonTable(comparison.rows, "roughSpot", "fineSpot", "① 年度现货均价", entry.threshold)}${comparisonTable(comparison.rows, "roughCapture", "fineCapture", "② 项目捕获电价", entry.threshold)}${comparisonTable(comparison.rows, "roughSettlement", "fineSettlement", "③ 综合结算电价", entry.threshold, true)}</div>${comparisonBreakdownHtml(comparison.rows, snapshot.draft.captureRate)}</section>`;
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
  function buildComparisonCsv(snapshot, run, comparison) {
    return csvText([["粗算版本", snapshot.id], ["精算版本", run.id], ["精算状态", run.status || ""],
      ["年份", "粗算现货均价", "精算现货均价", "粗算捕获价", "精算捕获价", "粗算综合结算价", "精算综合结算价", "综合价差额(精算-粗算)", "综合价差异率", "精算捕获率(%)"],
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

  function setTab(documentRef, state, name) {
    state.tab = ["rough", "fine", "compare"].includes(name) ? name : "rough";
    const keys = { rough: "forecast-rough-panel", fine: "forecast-fine-panel", compare: "forecast-compare-panel" };
    documentRef.querySelectorAll("[data-forecast-tab]").forEach((button) => {
      const active = button.dataset.forecastTab === state.tab;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(active));
      button.setAttribute("aria-controls", keys[button.dataset.forecastTab]);
      button.tabIndex = active ? 0 : -1;
      button.classList?.toggle("active", active);
    });
    Object.entries(keys).forEach(([key, id]) => {
      const panel = documentRef.getElementById(id);
      if (panel) { panel.hidden = key !== state.tab; panel.setAttribute("role", "tabpanel"); }
    });
  }

  function bindTabs(documentRef, state, redraw) {
    const buttons = Array.from(documentRef.querySelectorAll("[data-forecast-tab]"));
    buttons.forEach((button, index) => {
      button.onclick = () => {
        setTab(documentRef, state, button.dataset.forecastTab);
        if (state.tab === "compare") redraw();
      };
      button.onkeydown = (event) => {
        const next = event.key === "ArrowRight" ? (index + 1) % buttons.length : event.key === "ArrowLeft" ?
          (index - 1 + buttons.length) % buttons.length : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        setTab(documentRef, state, buttons[next].dataset.forecastTab);
        if (state.tab === "compare") redraw();
        buttons[next].focus?.();
      };
    });
    setTab(documentRef, state, state.tab);
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
    yearsFor(project).forEach((year, index) => {
      if (Object.hasOwn(config[group], year)) return;
      if (key === "ltPricingMode") {
        const first = Number(config.ltYear1Pnl) || 0, target = Number(config.ltTargetPnl) || 0;
        const delta = Math.min(Math.abs(target - first), index * Math.max(0, Number(config.ltConvergeSpeed) || 0));
        config[group][year] = first + Math.sign(target - first) * delta;
      } else config[group][year] = Object.fromEntries((key === "envValueMode" ? ENV_FIELDS : FEE_FIELDS).map(([field, , type]) =>
        [field, type === "boolean" ? Boolean(config[field]) : Number(config[field]) || 0]));
    });
  }

  function bindWorkspace(options, refs, state, entry, draft, snapshot, comparison) {
    const { documentRef, project, scenario, domain, onChange = () => {}, onPersist = () => {}, onMessage = () => {} } = options;
    const redraw = () => renderWorkspace(options);
    const message = (text, tone = "info") => {
      entry.message = text; entry.tone = tone;
      const target = refs.rough.querySelector("[data-rough-message]");
      if (target) { target.textContent = text; target.classList?.toggle("rough-alert", tone === "error"); }
      onMessage(text, tone);
    };
    const commitShared = () => {
      if (!entry.dirty || scenario.locked) return false;
      scenario.config = clone(entry.config);
      scenario.updatedAt = typeof options.nowIso === "function" ? options.nowIso() : options.nowIso || new Date().toISOString();
      entry.source = JSON.stringify(scenario.config); entry.dirty = false;
      return true;
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
    const sharedDetails = refs.rough.querySelector("[data-rough-shared]");
    if (sharedDetails) sharedDetails.ontoggle = () => { entry.sharedOpen = sharedDetails.open; };
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
      message(changed ? "共用参数已保存，收入配置同步更新。历史粗算快照保留，请生成新版后对照。" : "共用参数没有变化。", "success");
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
      message("粗算版本已保存，可前往交叉验证选择精算版本对照。", "success");
      onChange({ sharedChanged: changed });
    };
    [refs.rough, refs.compare].forEach((container) => container.querySelectorAll("[data-rough-snapshot]").forEach((select) => {
      select.onchange = () => { entry.snapshotId = select.value; redraw(); };
    }));
    const runSelect = refs.compare.querySelector("[data-rough-run]");
    if (runSelect) runSelect.onchange = () => { entry.runId = runSelect.value; redraw(); };
    const threshold = refs.compare.querySelector("[data-rough-threshold]");
    if (threshold) threshold.onchange = () => {
      const numeric = Number(threshold.value);
      if (!Number.isFinite(numeric) || numeric < 0.1 || numeric > 1000) { threshold.value = entry.threshold; return; }
      entry.threshold = numeric; redraw();
    };
    const exportRough = refs.rough.querySelector("[data-rough-export]");
    if (exportRough && snapshot) exportRough.onclick = () => downloadCsv(documentRef, `${project.name || "项目"}-粗算-${snapshot.id}.csv`, buildRoughCsv(snapshot));
    const exportComparison = refs.compare.querySelector("[data-compare-export]");
    if (exportComparison && snapshot && comparison?.ok) exportComparison.onclick = () => {
      const run = project.priceRuns.find((item) => item.id === entry.runId);
      downloadCsv(documentRef, `${project.name || "项目"}-交叉验证-${snapshot.id}.csv`, buildComparisonCsv(snapshot, run, comparison));
    };
  }

  function renderWorkspace(options = {}) {
    const { documentRef, project, scenario, domain, getHourlyEnergyForCalculation } = options;
    if (!documentRef?.querySelectorAll || !documentRef?.getElementById) return;
    const refs = { rough: documentRef.getElementById("rough-price-root"), compare: documentRef.getElementById("rough-compare-root") };
    if (!refs.rough || !refs.compare) return;
    if (options.isActive === false) return;
    const state = getState(documentRef);
    bindTabs(documentRef, state, () => renderWorkspace(options));
    if (!project || !scenario || !domain) {
      refs.rough.innerHTML = refs.compare.innerHTML = '<div class="rough-card rough-empty">请先创建或选择项目及测算方案。</div>';
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
    const runs = Array.isArray(project.priceRuns) ? project.priceRuns : [];
    if (!runs.some((run) => run.id === entry.runId)) {
      entry.runId = runs.some((run) => run.id === project.activeRunId) ? project.activeRunId : runs[0]?.id || "";
    }
    const run = runs.find((item) => item.id === entry.runId);
    const fingerprint = snapshot ? domain.contextFingerprint(project, scenario) : "";
    const stale = Boolean(snapshot && snapshot.contextFingerprint !== fingerprint);
    const cache = entry.comparisonCache;
    let comparison = cache && cache.snapshot === snapshot && cache.run === run && cache.fingerprint === fingerprint ? cache.value : null;
    if (state.tab === "compare" && snapshot && run && !comparison) {
      comparison = domain.compareSnapshot(project, scenario, snapshot, run, getHourlyEnergyForCalculation);
      entry.comparisonCache = { snapshot, run, fingerprint, value: comparison };
    }
    refs.rough.innerHTML = roughHtml(project, scenario, draft, snapshots, snapshot, entry, stale, options.getProvinceName);
    refs.compare.innerHTML = compareHtml(project, snapshots, snapshot, entry, comparison);
    bindWorkspace(options, refs, state, entry, draft, snapshot, comparison);
  }

  return Object.freeze({ renderWorkspace, escapeHtml, csvText, buildRoughCsv, buildComparisonCsv,
    roughHtml, compareHtml, validateShared });
});
