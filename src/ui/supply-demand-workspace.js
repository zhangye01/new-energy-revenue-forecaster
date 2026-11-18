"use strict";

(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_SUPPLY_DEMAND_WORKSPACE = api;
  if (root.window && root.window !== root) root.window.NE_SUPPLY_DEMAND_WORKSPACE = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (globalRoot) {
  const KEYS = ["load", "tieLine", "wind", "solar", "hydro", "nonMarket"];
  const LABELS = { load: "省内负荷", tieLine: "联络线负荷", wind: "风电出力", solar: "光伏出力", hydro: "水电出力", nonMarket: "非市场化出力", residualDemand: "剩余需求" };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const finite = (value) => value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
  const number = (value, digits = 2) => finite(value) ? Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
  const inputNumber = (value) => String(value ?? "").trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : value;
  const hasPendingBulk = (entry) => Boolean(entry && [entry.batchGrowth, entry.matrix].some((value) => String(value ?? "").trim() !== ""));

  function years(project) {
    if (!Number.isInteger(project?.startYear) || !Number.isInteger(project?.forecastYears) || project.forecastYears < 1 || project.forecastYears > 30) return [];
    return Array.from({ length: project.forecastYears }, (_, index) => project.startYear + index);
  }

  function emptySeries(project) {
    return { baseEnergyMwh: null, growthRatesByYear: Object.fromEntries(years(project).slice(1).map((year) => [year, null])),
      monthlyWeights: Array(12).fill(null), hourlyWeightsByMonth: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, Array(24).fill(null)])) };
  }

  function parseCurveMatrix(text, rowCount = 12, columnCount = 24) {
    const lines = String(text || "").trim().split(/\r?\n/);
    if (lines.length !== rowCount) return { ok: false, message: `需要${rowCount}行，每行${columnCount}个数字；当前为${String(text || "").trim() ? lines.length : 0}行。` };
    const rows = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      const cells = /[\t,，;]/.test(line) ? line.split(/[\t,，;]/).map((cell) => cell.trim()) : line.split(/\s+/);
      if (cells.length !== columnCount || cells.some((cell) => !finite(cell) || Number(cell) < 0)) {
        return { ok: false, message: `第${index + 1}行需要${columnCount}个非负有效数字；空单元格不能当作0。` };
      }
      rows.push(cells.map(Number));
    }
    return { ok: true, rows };
  }

  function annualPreview(series, project) {
    let amount = finite(series?.baseEnergyMwh) ? Number(series.baseEnergyMwh) : null;
    return years(project).map((year, index) => {
      const rate = series?.growthRatesByYear?.[year];
      if (index > 0) amount = amount !== null && finite(rate) && Number(rate) >= -100 ? amount * (1 + Number(rate) / 100) : null;
      if (!Number.isFinite(amount)) amount = null;
      return { year, growthRate: index ? rate : null, energyMwh: amount };
    });
  }

  function option(value, label, selected) { return `<option value="${escape(value)}"${String(value) === String(selected) ? " selected" : ""}>${escape(label)}</option>`; }
  function button(action, label, primary = false, disabled = false) {
    return `<button type="button" class="${primary ? "primary-button" : "ghost-button"}" data-sd-action="${action}"${disabled ? " disabled" : ""}>${label}</button>`;
  }
  function numericField(field, label, value, extra = "") {
    return `<label><span>${label}</span><input type="number" step="any" data-sd-field="${field}" value="${escape(value)}" ${extra}></label>`;
  }
  function curveSvg(values, label) {
    if (!Array.isArray(values) || values.some((value) => !finite(value) || Number(value) < 0) || !(values.reduce((s, v) => s + Number(v), 0) > 0)) return "";
    const maximum = Math.max(...values.map(Number));
    const scaled = values.map((value) => Number(value) / maximum), total = scaled.reduce((sum, value) => sum + value, 0);
    const shares = scaled.map((value) => value / total * 100), max = Math.max(...shares);
    const points = shares.map((value, index) => `${20 + index * 560 / (shares.length - 1)},${98 - value / max * 76}`).join(" ");
    return `<svg class="sd-curve" viewBox="0 0 600 120" role="img" aria-label="${escape(label)}归一化占比曲线"><path d="M20 12V98H580" class="sd-curve-axis"/><polyline points="${points}" class="sd-curve-line"/><text x="20" y="115">${values.length === 12 ? "1月" : "00时"}</text><text x="552" y="115">${values.length === 12 ? "12月" : "23时"}</text><text x="25" y="17">最高 ${number(max, 1)}%</text></svg>`;
  }

  function selectedSeries(entry, project) {
    const element = entry.draft.elements?.[entry.element];
    if (entry.element === "tieLine" && element?.mode === "bidirectional") return element[entry.branch];
    return element;
  }

  function renderAnnualEditor(series, project, entry) {
    const signed = entry.element === "tieLine" && entry.draft.elements.tieLine?.mode !== "bidirectional";
    const label = signed ? "首年净电量 MWh（正送出／负受入）" : `首年${entry.element === "tieLine" ? entry.branch === "export" ? "送出" : "受入" : ""}电量 MWh`;
    const rows = annualPreview(series, project);
    return `<section class="sd-section"><div class="sd-section-head"><h4>年度总量</h4>${button("zero", entry.element === "tieLine" && !signed ? "本方向为0" : "本元素为0")}</div>
      <div class="sd-annual-controls">${numericField("base", label, series?.baseEnergyMwh, signed ? "" : 'min="0"')}
      <label><span>批量设置后续年增长率 %</span><div class="sd-inline"><input type="number" step="any" min="-100" data-sd-field="batchGrowth" value="${escape(entry.batchGrowth)}">${button("growth-fill", "应用")}</div></label></div>
      <div class="sd-table-wrap"><table class="sd-table"><thead><tr><th>年份</th><th>较上年增长率 %</th><th>年度电量 MWh</th></tr></thead><tbody>${rows.map((row, index) => `<tr><th>${row.year}</th><td>${index === 0 ? "起点值" : `<input type="number" step="any" min="-100" aria-label="${row.year}年增长率百分比" data-sd-field="growth" data-sd-year="${row.year}" value="${escape(row.growthRate)}">`}</td><td data-sd-annual-output="${row.year}">${number(row.energyMwh)}</td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function renderCurveEditor(series, entry) {
    const monthly = Array.isArray(series?.monthlyWeights) ? series.monthlyWeights : Array(12).fill(null);
    const hourly = Array.isArray(series?.hourlyWeightsByMonth?.[entry.month]) ? series.hourlyWeightsByMonth[entry.month] : Array(24).fill(null);
    return `<section class="sd-section"><div class="sd-section-head"><h4 id="sd-monthly-title">分月电量曲线</h4>${button("monthly-equal", "12个月均分")}</div>
      <p data-help="月度权重" data-help-anchor="#sd-monthly-title">填写相对权重，系统自动换算占比，不要求合计100。月电量按年度总量分配，再除以该月天数；权重为0表示该月无电量。示例均分只在点击后填写。</p>
      <div class="sd-weight-grid sd-month-grid">${Array.from({ length: 12 }, (_, index) => numericField("monthly", `${index + 1}月`, monthly[index], `min="0" data-sd-index="${index}"`)).join("")}</div><div class="sd-curve-preview" data-sd-curve="monthly">${curveSvg(monthly, "月度")}</div></section>
      <section class="sd-section"><div class="sd-section-head"><h4 id="sd-hourly-title">各月典型日曲线</h4><div class="sd-actions"><label class="sd-month-picker"><span>月份</span><select data-sd-select="month">${Array.from({ length: 12 }, (_, index) => option(index + 1, `${index + 1}月`, entry.month)).join("")}</select></label>${button("hourly-equal", "本月24小时均分")}${button("hourly-copy", "本月复制到全年")}</div></div>
      <p data-help="典型日小时权重" data-help-anchor="#sd-hourly-title">每个月独立设置24小时相对权重。系统按当月典型日电量归一化，00时表示00:00—01:00；曲线默认在测算周期各年复用。年度为0时可不填无用曲线。</p>
      <div class="sd-weight-grid sd-hour-grid">${Array.from({ length: 24 }, (_, index) => numericField("hourly", `${String(index).padStart(2, "0")}时`, hourly[index], `min="0" data-sd-index="${index}"`)).join("")}</div><div class="sd-curve-preview" data-sd-curve="hourly">${curveSvg(hourly, "典型日")}</div>
      <details class="sd-matrix"><summary>批量粘贴12个月×24小时曲线</summary><label><span>每行一个月，24列按00—23时排列（支持表格复制、逗号分隔）</span><textarea rows="4" data-sd-field="matrix" aria-label="12个月24小时曲线矩阵" placeholder="粘贴12行，每行24个非负数字">${escape(entry.matrix)}</textarea></label>${button("matrix-apply", "应用全部12个月曲线")}</details></section>`;
  }

  function tableRows(rows, keys, leading) {
    return `<div class="sd-table-wrap"><table class="sd-table"><thead><tr>${leading.map((item) => `<th>${item.label}</th>`).join("")}${keys.map((key) => `<th>${LABELS[key]}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${leading.map((item) => `<th>${escape(item.value(row))}</th>`).join("")}${keys.map((key) => `<td>${number(row[key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function elementStatus(key, project, config, errors) {
    if (config.startYear !== project.startYear || config.forecastYears !== project.forecastYears) return "待核对";
    if (errors.some((error) => error.startsWith(key === "tieLine" ? "联络线" : LABELS[key])
        || error.startsWith("供需配置") || (key === "tieLine" && error.startsWith("请选择有效的联络线")))) return "待补齐";
    return "已填写";
  }

  function renderPreview(entry, project, domain) {
    const saved = project.supplyDemand?.config;
    if (!saved) return `<div class="sd-preview-empty">尚未生成供需数据。六个元素填写完成后保存并生成。</div>`;
    const errors = domain.validateConfig(project, saved);
    if (errors.length) return `<div class="sd-alert">已保存输入需要核对：${escape(errors[0])}。历史输入仍保留。</div>`;
    const fp = domain.fingerprint(project, saved);
    if (!entry.dataset || entry.dataset.fingerprint !== fp) entry.dataset = domain.buildDataset(project, saved);
    const dataset = entry.dataset;
    if (!dataset.ok) return `<div class="sd-alert">${escape(dataset.errors?.[0] || "供需数据生成失败")}</div>`;
    const annual = dataset.annualRows || [], typical = (dataset.typicalRows || []).filter((row) => row.year === Number(entry.previewYear) && row.month === Number(entry.previewMonth));
    const columns = [...KEYS, "residualDemand"];
    return `<div class="sd-saved-head"><span>已生成 ${annual.length} 年 · 每年288个典型小时 / 8760小时</span><div class="sd-actions">${button("export-annual", "年度CSV")}${button("export-typical", "典型小时CSV")}${button("export-hourly", "8760小时CSV")}</div></div>
      <details class="sd-preview"${entry.previewOpen ? " open" : ""} data-sd-preview><summary>查看已保存数据（MWh）</summary>
      <h4>年度供需总量</h4>${tableRows(annual, columns, [{ label: "年份", value: (row) => row.year }])}
      <div class="sd-actions"><h4>典型日24小时</h4><label>年份<select data-sd-select="previewYear">${years(project).map((year) => option(year, `${year}年`, entry.previewYear)).join("")}</select></label><label>月份<select data-sd-select="previewMonth">${Array.from({ length: 12 }, (_, i) => option(i + 1, `${i + 1}月`, entry.previewMonth)).join("")}</select></label></div>
      ${tableRows(typical, columns, [{ label: "小时", value: (row) => `${String(row.hour).padStart(2, "0")}:00` }, { label: "代表天数", value: (row) => row.representedDays }])}</details>`;
  }

  function markup(project, entry, domain) {
    const elements = entry.draft?.elements;
    const isSeries = (value) => value && typeof value === "object" && !Array.isArray(value);
    if (!isSeries(elements) || KEYS.some((key) => !isSeries(elements[key]))
        || (elements.tieLine.mode === "bidirectional" && (!isSeries(elements.tieLine.export) || !isSeries(elements.tieLine.import)))) {
      return `<div class="panel sd-workspace"><h3>测算周期供需配置</h3><div class="sd-alert">已保存的供需输入结构不完整，原记录仍保留。请重新建立编辑草稿后核对。</div><div class="sd-actions">${button("reset-period", "按项目周期重新填写")}${button("discard", "放弃草稿")}</div></div>`;
    }
    const periodMismatch = entry.draft.startYear !== project.startYear || entry.draft.forecastYears !== project.forecastYears;
    const series = selectedSeries(entry, project), mode = entry.draft.elements.tieLine?.mode || "net";
    const pending = project.supplyDemand?.draft && !equal(project.supplyDemand.draft, project.supplyDemand.config);
    const validation = domain.validateConfig(project, entry.draft);
    const elementState = (key) => elementStatus(key, project, entry.draft, validation);
    return `<div class="panel sd-workspace"><div class="sd-section-head"><div><h3 id="sd-workspace-heading">测算周期供需配置</h3><span class="sd-period">${project.startYear}—${project.startYear + project.forecastYears - 1}年 · ${project.forecastYears}年 · 已从项目创建带入</span></div><span class="sd-state" data-sd-dirty>${hasPendingBulk(entry) ? "有未应用批量输入" : entry.dirty ? "有未保存修改" : pending ? "草稿已保存，尚未生成" : project.supplyDemand?.config ? "已生成输入" : "待配置"}</span></div>
      <p data-help="供需输入口径" data-help-anchor="#sd-workspace-heading">六个元素独立配置。首年直接使用起点电量，后续年度按各年增长率滚动。月度/典型日曲线跨年复用。沿用365天、8760小时模型年，2月固定28天。小时电量单位MWh，相应1小时平均功率单位MW。供需输入用于算法接口；当前演示价格模型尚未按供需定价。</p>
      <div class="sd-message${entry.error ? " sd-alert" : ""}" role="status" aria-live="polite" data-sd-message>${escape(entry.message)}</div>
      ${entry.conflict ? `<div class="sd-alert">供需配置已由其他操作更新，当前未保存编辑不能覆盖最新数据。${button("load-latest", "载入最新并放弃编辑")}</div>` : ""}
      ${periodMismatch ? `<div class="sd-alert">项目周期已变化。原输入为${escape(entry.draft.startYear)}年起、${escape(entry.draft.forecastYears)}年；请明确核对起点电量和增长率。<div class="sd-actions">${button("rebase", "确认沿用起点和曲线到新周期")}${button("reset-period", "按新周期重新填写")}</div></div>` : ""}
      <form id="supply-demand-form" novalidate><div class="sd-element-tabs" role="group" aria-label="选择供需元素">${KEYS.map((key) => `<button type="button" data-sd-action="element" data-sd-element="${key}" class="sd-element${entry.element === key ? " is-active" : ""}" aria-pressed="${entry.element === key}">${LABELS[key]}<small data-sd-element-state="${key}">${elementState(key)}</small></button>`).join("")}</div>
      <div class="sd-editor-head"><h4>${LABELS[entry.element]}</h4>${entry.element === "tieLine" ? `<div class="sd-actions"><label>配置方式<select data-sd-select="mode">${option("net", "单向净额（正送出／负受入）", mode)}${option("bidirectional", "同年双向送受", mode)}</select></label>${mode === "bidirectional" ? `<label>编辑方向<select data-sd-select="branch">${option("export", "送出电量（正值）", entry.branch)}${option("import", "受入电量（正值，输出扣减）", entry.branch)}</select></label>` : ""}</div>` : ""}</div>
      ${entry.element === "tieLine" ? `<p data-help="联络线方向" data-help-anchor=".sd-editor-head h4">正数表示送出，负数表示受入。单向净额模式全年保持同一方向；同年双向模式分别输入送出与受入规模、增长和曲线，最终逐小时相减。全年净值为0仍保留不同时段流动。切换方式保留另一方式的原输入。</p>` : ""}
      ${renderAnnualEditor(series, project, entry)}${renderCurveEditor(series, entry)}
      <div data-sd-pending${hasPendingBulk(entry) ? "" : " hidden"}><span>批量输入尚未应用。</span> ${button("clear-bulk", "清除未应用输入")}</div>
      <div class="sd-footer sd-actions">${button("save-draft", "保存草稿", false, entry.conflict)}${button("generate", "保存并生成供需数据", true, periodMismatch || entry.conflict)}${button("discard", project.supplyDemand?.config ? "恢复已生成配置" : "放弃草稿")}</div></form>
      <section class="sd-output">${renderPreview(entry, project, domain)}</section></div>`;
  }

  function createController(options = {}) {
    const { root, getProject = () => null, onCommit = () => false, downloadCsv = () => {}, now = () => new Date().toISOString() } = options;
    const domain = options.domain || globalRoot.NE_SUPPLY_DEMAND || (typeof module !== "undefined" && module.exports ? require("../domain/supply-demand") : null);
    const entries = new WeakMap();
    let renderedProject = null, bound = false;

    function getEntry(project) {
      const source = JSON.stringify(project.supplyDemand || {});
      let entry = entries.get(project);
      if (!entry) {
        const draft = clone(project.supplyDemand?.draft || project.supplyDemand?.config || domain.createConfig(project));
        entry = { projectId: project.id, source, draft, dirty: false, element: "load", branch: "export", month: 1,
          previewYear: project.startYear, previewMonth: 1, previewOpen: false, batchGrowth: "", matrix: "", message: "", error: false, conflict: false, dataset: null };
        entries.set(project, entry);
      } else if (entry.source !== source) {
        if (entry.dirty || hasPendingBulk(entry)) entry.conflict = true;
        else { entry.draft = clone(project.supplyDemand?.draft || project.supplyDemand?.config || domain.createConfig(project)); entry.source = source; entry.dataset = null; }
      }
      return entry;
    }

    function render() {
      if (!root) return;
      const project = getProject(); renderedProject = project;
      if (!project || !years(project).length) { root.innerHTML = '<div class="panel sd-preview-empty">请先完成项目创建，供需配置将自动读取测算周期。</div>'; return; }
      if (!domain) { root.innerHTML = '<div class="sd-alert">供需模块尚未加载，请刷新后重试。</div>'; return; }
      const entry = getEntry(project);
      if (!years(project).includes(Number(entry.previewYear))) entry.previewYear = project.startYear;
      root.innerHTML = markup(project, entry, domain);
      if (!bound && root.addEventListener) {
        root.addEventListener("input", onInput); root.addEventListener("change", onChange); root.addEventListener("click", onClick);
        root.addEventListener("submit", (event) => event.preventDefault());
        root.addEventListener("toggle", (event) => { if (event.target?.hasAttribute?.("data-sd-preview") && getProject() === renderedProject) getEntry(renderedProject).previewOpen = Boolean(event.target.open); }, true);
        bound = true;
      }
    }

    function eventContext(event) {
      const project = getProject();
      if (!project || project !== renderedProject || (root.contains && !root.contains(event.target))) { render(); return null; }
      const entry = getEntry(project);
      if (project.id !== entry.projectId) { entries.delete(project); render(); return null; }
      return { project, entry };
    }
    function message(entry, text, error = false) { entry.message = text; entry.error = error; }
    function changed(entry) { entry.dirty = true; message(entry, ""); }
    function blockPendingBulk(entry) {
      if (!hasPendingBulk(entry)) return false;
      message(entry, "请先应用或清除批量输入，再保存、生成或切换元素与方向。", true);
      render(); return true;
    }

    function onInput(event) {
      const context = eventContext(event), field = event.target?.dataset?.sdField;
      if (!context || !field) return;
      const { project, entry } = context;
      if (entry.conflict) return;
      if (field === "batchGrowth" || field === "matrix") {
        entry[field] = event.target.value; message(entry, "");
        const pending = root.querySelector?.("[data-sd-pending]"); if (pending) pending.hidden = !hasPendingBulk(entry);
        const dirty = root.querySelector?.("[data-sd-dirty]");
        if (dirty) dirty.textContent = hasPendingBulk(entry) ? "有未应用批量输入" : entry.dirty ? "有未保存修改" : "批量输入已清除";
        const notice = root.querySelector?.("[data-sd-message]"); if (notice) notice.textContent = "";
        return;
      }
      const series = selectedSeries(entry, project);
      if (!series) return;
      const value = inputNumber(event.target.value), index = Number(event.target.dataset.sdIndex);
      if (field === "base") series.baseEnergyMwh = value;
      else if (field === "growth") { series.growthRatesByYear ||= {}; series.growthRatesByYear[event.target.dataset.sdYear] = value; }
      else if (field === "monthly" && index >= 0 && index < 12) { series.monthlyWeights ||= Array(12).fill(null); series.monthlyWeights[index] = value; }
      else if (field === "hourly" && index >= 0 && index < 24) { series.hourlyWeightsByMonth ||= {}; series.hourlyWeightsByMonth[entry.month] ||= Array(24).fill(null); series.hourlyWeightsByMonth[entry.month][index] = value; }
      else return;
      changed(entry);
      const dirty = root.querySelector?.("[data-sd-dirty]"); if (dirty) dirty.textContent = hasPendingBulk(entry) ? "有未应用批量输入" : "有未保存修改";
      const notice = root.querySelector?.("[data-sd-message]"); if (notice) notice.textContent = "";
      annualPreview(series, project).forEach((row) => { const cell = root.querySelector?.(`[data-sd-annual-output="${row.year}"]`); if (cell) cell.textContent = number(row.energyMwh); });
      const validation = domain.validateConfig(project, entry.draft);
      KEYS.forEach((key) => { const state = root.querySelector?.(`[data-sd-element-state="${key}"]`); if (state) state.textContent = elementStatus(key, project, entry.draft, validation); });
      if (field === "monthly" || field === "hourly") {
        const preview = root.querySelector?.(`[data-sd-curve="${field}"]`);
        if (preview) preview.innerHTML = curveSvg(field === "monthly" ? series.monthlyWeights : series.hourlyWeightsByMonth[entry.month], field === "monthly" ? "月度" : "典型日");
      }
    }

    function onChange(event) {
      const context = eventContext(event);
      if (!context) return;
      const { project, entry } = context, select = event.target?.dataset?.sdSelect, value = event.target?.value;
      // Keep the clicked control alive while a numeric field blurs: replacing the
      // form during change would swallow the subsequent save/copy button click.
      if (event.target?.dataset?.sdField) return;
      if (["branch", "mode"].includes(select) && blockPendingBulk(entry)) return;
      if (select === "month" && Number(value) >= 1 && Number(value) <= 12) entry.month = Number(value);
      else if (select === "previewYear" && years(project).includes(Number(value))) entry.previewYear = Number(value);
      else if (select === "previewMonth" && Number(value) >= 1 && Number(value) <= 12) entry.previewMonth = Number(value);
      else if (select === "branch" && ["export", "import"].includes(value)) { entry.branch = value; entry.matrix = ""; }
      else if (select === "mode" && ["net", "bidirectional"].includes(value) && !entry.conflict) {
        const tieLine = entry.draft.elements.tieLine ||= { mode: "net", ...emptySeries(project) };
        tieLine.mode = value;
        if (value === "bidirectional") { tieLine.export ||= emptySeries(project); tieLine.import ||= emptySeries(project); }
        else if (!Object.hasOwn(tieLine, "baseEnergyMwh")) Object.assign(tieLine, emptySeries(project));
        entry.matrix = ""; changed(entry);
      } else return;
      render();
    }

    function commit(project, entry, next, flags, text, clearBulk = false) {
      if (getProject() !== project || project.id !== entry.projectId || entry.conflict || JSON.stringify(project.supplyDemand || {}) !== entry.source) {
        message(entry, "当前项目或供需输入已变化，请载入最新配置后再保存。", true); render(); return false;
      }
      const before = { source: entry.source, dirty: entry.dirty, draft: entry.draft, conflict: entry.conflict, batchGrowth: entry.batchGrowth, matrix: entry.matrix };
      entry.source = JSON.stringify(next); entry.dirty = false; entry.conflict = false;
      entry.draft = clone(next.draft || next.config || domain.createConfig(project));
      if (clearBulk) { entry.batchGrowth = ""; entry.matrix = ""; }
      try {
        const result = onCommit(project, next, flags);
        if (result === false) { Object.assign(entry, before); message(entry, "未能保存供需配置，请检查保存状态后重试。", true); render(); return false; }
        entry.source = JSON.stringify(project.supplyDemand || next);
        message(entry, text); render(); return true;
      } catch (error) {
        Object.assign(entry, before); message(entry, error?.message || "保存供需配置失败，原输入未被替换。", true); render(); return false;
      }
    }

    function generate(project, entry) {
      const result = domain.buildDataset(project, entry.draft);
      if (!result.ok) {
        const errors = result.errors || ["请补齐有效配置"];
        message(entry, `${errors.slice(0, 8).join("；")}${errors.length > 8 ? `；另有${errors.length - 8}项，请逐项核对。` : ""}`, true); render(); return;
      }
      const previous = project.supplyDemand || {}, next = { ...clone(previous), version: 1, config: clone(entry.draft), inputFingerprint: result.fingerprint, generatedAt: now() };
      delete next.draft;
      const wasChanged = previous.inputFingerprint !== result.fingerprint;
      if (commit(project, entry, next, { changed: wasChanged, generated: true }, `已生成${result.annualRows.length}年供需输入，年度与小时电量已核验。`)) entry.dataset = result;
    }

    function exportSaved(project, entry, kind) {
      const config = project.supplyDemand?.config;
      if (!config) { message(entry, "请先保存并生成供需数据。", true); render(); return; }
      const result = domain.buildDataset(project, config);
      if (!result.ok) { message(entry, result.errors?.[0] || "已保存输入需要核对。", true); render(); return; }
      const labels = { annual: "年度", typical: "典型小时", hourly: "8760小时" };
      downloadCsv(`${project.name || "项目"}_供需${labels[kind]}_${project.startYear}-${project.startYear + project.forecastYears - 1}.csv`, domain.csvRows(result, kind));
      message(entry, `已导出已生成配置的${labels[kind]}数据；未应用草稿不参与导出。`); render();
    }

    function onClick(event) {
      const control = event.target?.closest?.("[data-sd-action]") || (event.target?.dataset?.sdAction ? event.target : null);
      if (!control || control.disabled) return;
      const context = eventContext(event); if (!context) return;
      event.preventDefault?.();
      const { project, entry } = context, action = control.dataset.sdAction;
      if (action === "load-latest") { entries.delete(project); render(); return; }
      if (action === "element" && KEYS.includes(control.dataset.sdElement)) {
        if (entry.element === control.dataset.sdElement || blockPendingBulk(entry)) return;
        entry.element = control.dataset.sdElement; entry.matrix = ""; render(); return;
      }
      if (action.startsWith("export-")) { exportSaved(project, entry, action.slice(7)); return; }
      if (action === "clear-bulk") { entry.matrix = ""; entry.batchGrowth = ""; message(entry, "已清除未应用的批量输入，原配置未改变。"); render(); return; }
      if (entry.conflict) return;
      const series = selectedSeries(entry, project);
      if (["generate", "save-draft", "rebase"].includes(action) && blockPendingBulk(entry)) return;
      if (action === "generate") { generate(project, entry); return; }
      if (action === "save-draft") {
        commit(project, entry, { ...clone(project.supplyDemand || {}), version: 1, draft: clone(entry.draft) }, { changed: false, generated: false }, "供需草稿已保存，生成后才用于新的预测输入。"); return;
      }
      if (action === "discard") {
        const next = { ...clone(project.supplyDemand || {}), version: 1 }; delete next.draft;
        commit(project, entry, next, { changed: false, generated: false }, next.config ? "已恢复已生成配置，草稿已放弃。" : "草稿已放弃，可重新填写。", true); return;
      }
      if (action === "rebase" || action === "reset-period") {
        if (action === "reset-period") { entry.draft = domain.createConfig(project); entry.matrix = ""; entry.batchGrowth = ""; }
        else { entry.draft.startYear = project.startYear; entry.draft.forecastYears = project.forecastYears; }
        entry.previewYear = project.startYear; changed(entry); message(entry, "已按新周期建立编辑草稿，请核对首年量并补齐各年增长率后生成。"); render(); return;
      }
      if (!series) return;
      if (action === "zero") { series.baseEnergyMwh = 0; series.growthRatesByYear ||= {}; years(project).slice(1).forEach((year) => { series.growthRatesByYear[year] = 0; }); }
      else if (action === "monthly-equal") series.monthlyWeights = Array(12).fill(1);
      else if (action === "hourly-equal") { series.hourlyWeightsByMonth ||= {}; series.hourlyWeightsByMonth[entry.month] = Array(24).fill(1); }
      else if (action === "hourly-copy") {
        const row = series.hourlyWeightsByMonth?.[entry.month];
        if (!Array.isArray(row) || row.length !== 24 || row.some((value) => !finite(value) || Number(value) < 0) || !(row.reduce((s, v) => s + Number(v), 0) > 0)) { message(entry, "当前月份的24小时曲线不完整或合计为0，请先补齐。", true); render(); return; }
        series.hourlyWeightsByMonth = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, clone(row)]));
      } else if (action === "growth-fill") {
        if (!finite(entry.batchGrowth) || Number(entry.batchGrowth) < -100) { message(entry, "增长率需为不低于-100%的有效数字；不增长请填写0。", true); render(); return; }
        series.growthRatesByYear ||= {}; years(project).slice(1).forEach((year) => { series.growthRatesByYear[year] = Number(entry.batchGrowth); });
        entry.batchGrowth = "";
      } else if (action === "matrix-apply") {
        const parsed = parseCurveMatrix(entry.matrix);
        if (!parsed.ok) { message(entry, parsed.message, true); render(); return; }
        series.hourlyWeightsByMonth = Object.fromEntries(parsed.rows.map((row, index) => [index + 1, row]));
        entry.matrix = "";
      } else return;
      changed(entry); render();
    }

    return Object.freeze({ render, hasUnsavedChanges(project = getProject()) { const entry = project && entries.get(project); return Boolean(entry && (entry.dirty || hasPendingBulk(entry))); } });
  }

  return Object.freeze({ createController, parseCurveMatrix, annualPreview });
});
