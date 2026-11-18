"use strict";

(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_SUPPLY_DEMAND_WORKSPACE = api;
  if (root.window && root.window !== root) root.window.NE_SUPPLY_DEMAND_WORKSPACE = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (globalRoot) {
  const COLUMNS = {
    load: "省内负荷", tieLine: "联络线负荷", wind: "风电出力", solar: "光伏出力",
    hydro: "水电出力", nonMarket: "非市场化出力", residualDemand: "剩余需求"
  };
  const DIRECTIONAL_COLUMNS = {
    load: COLUMNS.load, tieLine: "联络线净电量", tieLineExport: "联络线送出", tieLineImport: "联络线受入",
    wind: COLUMNS.wind, solar: COLUMNS.solar, hydro: COLUMNS.hydro, nonMarket: COLUMNS.nonMarket, residualDemand: COLUMNS.residualDemand
  };
  const PERIOD_START = [{ label: "年份", value: (row) => row.year }];
  const TYPICAL_START = [
    { label: "小时", value: (row) => String(row.hour).padStart(2, "0") + ":00" },
    { label: "代表天数", value: (row) => row.representedDays }
  ];
  const CSV_LABELS = { annual: "年度", typical: "典型小时", hourly: "8760小时" };
  const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
  const HOURS = Array.from({ length: 24 }, (_, index) => index);
  const ERROR_LIMIT = 8;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const energy = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const share = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 3 });

  function years(project) {
    if (!Number.isInteger(project?.startYear) || !Number.isInteger(project?.forecastYears) || project.forecastYears < 1 || project.forecastYears > 30) return [];
    return Array.from({ length: project.forecastYears }, (_, index) => project.startYear + index);
  }

  function periodLabel(project) { return project.startYear + "—" + (project.startYear + project.forecastYears - 1) + "年"; }
  function option(value, label, selected) { return `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`; }
  function button(action, label, primary = false, disabled = false) {
    return `<button type="button" class="${primary ? "primary-button" : "ghost-button"}" data-sd-action="${action}"${disabled ? " disabled" : ""}>${label}</button>`;
  }

  function tableRows(rows, leading, config) {
    const columns = config?.elements?.tieLine?.mode === "bidirectional" ? DIRECTIONAL_COLUMNS : COLUMNS;
    const keys = Object.keys(columns);
    return `<div class="sd-table-wrap"><table class="sd-table"><thead><tr>${leading.map((item) => `<th scope="col">${item.label}</th>`).join("")}${keys.map((key) => `<th scope="col">${columns[key]}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${leading.map((item, index) => index === 0 ? `<th scope="row">${item.value(row)}</th>` : `<td>${item.value(row)}</td>`).join("")}${keys.map((key) => `<td>${energy.format(row[key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function seriesLabels(config) {
    const columns = config.elements.tieLine.mode === "bidirectional" ? DIRECTIONAL_COLUMNS : COLUMNS;
    return Object.entries(columns).filter(([key]) => key !== "residualDemand" &&
      (key !== "tieLine" || config.elements.tieLine.mode !== "bidirectional"));
  }

  function getSeries(config, key) {
    if (key === "tieLineExport") return config.elements.tieLine.export;
    if (key === "tieLineImport") return config.elements.tieLine.import;
    return config.elements[key];
  }

  function numberInput(key, value, label, attributes = "") {
    return `<input type="number" step="any" inputmode="decimal" data-sd-input="${key}" aria-label="${label}" value="${escape(value)}" ${attributes}>`;
  }

  function growthStatus(forecastYears, series) {
    const rates = forecastYears.map((year) => series.growthRatesByYear[year]);
    const filled = rates.filter(Number.isFinite).length;
    if (!filled || filled < rates.length) return `${filled}/${rates.length} 年`;
    return rates.every((rate) => rate === rates[0]) ? `${rates[0]}%` : "已逐年配置";
  }

  function growthPanel(project, entry, config, labels, disabled) {
    const key = entry.growthSeries;
    if (!key) return "";
    const label = labels.find(([series]) => series === key)?.[1];
    if (!label) return "";
    const selected = getSeries(config, key);
    return `<div class="sd-growth-panel" data-sd-growth-panel><div class="sd-section-head"><h5>${label} · 逐年增长率（%）</h5>${button("growth-close", "收起")}</div>
      <div class="sd-actions"><label>统一增速 %${numberInput("growth-fill", entry.growthFill, `${label}统一增速`, `min="-100"${disabled}`)}</label>${button("growth-fill", "填入空白年份", false, Boolean(disabled))}</div>
      <div class="sd-number-grid">${years(project).slice(1).map((year) => `<label>${year}年${numberInput("growth-rate", selected.growthRatesByYear[year], `${label}${year}年增长率`, `min="-100" data-sd-series="${key}" data-sd-year="${year}"${disabled}`)}</label>`).join("")}</div></div>`;
  }

  function renderAnnualInputs(project, entry, config, labels, disabled) {
    const laterYears = years(project).slice(1);
    const rows = labels.map(([key, label]) => {
      const series = getSeries(config, key);
      const attrs = `data-sd-series="${key}"${key === "tieLine" ? "" : ' min="0"'}${disabled}`;
      const edit = laterYears.length ? `<button type="button" class="ghost-button" data-sd-action="growth-open" data-sd-series="${key}" aria-expanded="${entry.growthSeries === key}"><span data-sd-growth-for="${key}">${growthStatus(laterYears, series)}</span> <span class="sd-edit-label">编辑</span></button>` : "—";
      return `<tr><th scope="row">${label}</th><td>${numberInput("base", series.baseEnergyMwh, `${label}首年电量`, attrs)}</td><td>${edit}</td></tr>`;
    }).join("");
    return `<section class="sd-section sd-edit-section"><div class="sd-section-head"><h4 id="sd-annual-heading">年度电量与增速</h4>
      <label class="sd-inline-label">联络线<select data-sd-select="tieMode"${disabled}>${option("net", "净额", config.elements.tieLine.mode)}${option("bidirectional", "双向送受", config.elements.tieLine.mode)}</select></label></div>
      <p data-help="电量与增速" data-help-anchor="#sd-annual-heading">${project.startYear} 年填电量，后续按各年增速滚动。联络线净额正数送出、负数受入；双向分别填送出和受入的非负电量。无该项可填 0。</p>
      <div class="sd-table-wrap sd-annual-input-wrap"><table class="sd-table sd-annual-input"><thead><tr><th scope="col">供需要素</th><th scope="col">首年电量（MWh）</th><th scope="col">逐年增速</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${growthPanel(project, entry, config, labels, disabled)}</section>`;
  }

  function shareInput(value) { return Number.isFinite(value) ? Number((value * 100).toFixed(6)) : null; }

  function yearTotal(project, series, year) {
    let total = series.baseEnergyMwh;
    if (!Number.isFinite(total)) return null;
    for (let index = project.startYear + 1; index <= year; index += 1) {
      const growth = series.growthRatesByYear[index];
      if (!Number.isFinite(growth) || growth < -100) return null;
      total *= 1 + growth / 100;
    }
    return Number.isFinite(total) ? total : null;
  }

  function curvePreview(project, entry, config, domain) {
    const series = getSeries(config, entry.curveSeries);
    const curve = domain.getCurve(series, entry.curveYear);
    const month = entry.curveMonth, hourly = curve.hourlyWeightsByMonth?.[month] || [];
    const annual = entry.curveYear === null ? null : yearTotal(project, series, entry.curveYear);
    const monthValid = !domain.validateShares(curve.monthlyWeights, 12, "分月占比");
    const hourValid = !domain.validateShares(hourly, 24, "典型日分时占比");
    const monthEnergy = annual !== null && monthValid ? annual * curve.monthlyWeights[month - 1] / curve.monthlyWeights.reduce((a, b) => a + b, 0) : null;
    const typicalEnergy = monthEnergy === null ? null : monthEnergy / domain.MONTH_DAYS[month - 1];
    const rows = entry.curveYear !== null && (annual !== null && monthValid)
      ? `<div class="sd-month-total"><span>${entry.curveYear} 年分月电量（MWh）</span><div class="sd-month-total-grid">${MONTHS.map((value) => `<span${value === month ? ' class="sd-month-current"' : ""}>${value}月 <strong>${energy.format(annual * curve.monthlyWeights[value - 1] / curve.monthlyWeights.reduce((a, b) => a + b, 0))}</strong></span>`).join("")}</div></div>` : "";
    const unit = typicalEnergy === null ? "%" : "MWh";
    const hourlyZero = typicalEnergy === 0;
    if (!hourValid && !hourlyZero) return `${rows}<p class="sd-curve-empty">${month} 月典型日分时曲线待通过 Excel 补充。</p>`;
    const total = hourValid ? hourly.reduce((a, b) => a + b, 0) : 1;
    const values = HOURS.map((hour) => (hourlyZero ? 0 : hourly[hour] / total) * (typicalEnergy ?? 100));
    const peak = Math.max(...values.map(Math.abs));
    const points = values.map((value, hour) => {
      const time = `${String(hour).padStart(2, "0")}:00`;
      const number = `${value.toLocaleString("zh-CN", { maximumFractionDigits: 6 })} ${unit}`;
      return `<li title="${time} · ${number}" aria-label="${time} ${number}"><i style="--sd-bar:${peak ? (Math.abs(value) / peak * 100).toFixed(4) : 0}%"></i></li>`;
    }).join("");
    return `${rows}<div class="sd-curve-chart"><div class="sd-section-head"><h5>${month} 月典型日分时曲线（${unit}）</h5>${typicalEnergy === null ? "" : `<span>典型日 ${energy.format(typicalEnergy)} MWh</span>`}</div><ol class="sd-curve-bars${typicalEnergy < 0 ? " sd-negative" : ""}" aria-label="${month} 月典型日 24 小时">${points}</ol><div class="sd-curve-axis" aria-hidden="true"><span>0 时</span><span>6 时</span><span>12 时</span><span>18 时</span><span>23 时</span></div></div>`;
  }

  function curveOrigin(series, year, month) {
    if (year === null) return "默认典型年";
    const override = series.curveOverridesByYear?.[year];
    if (!override) return "沿用默认";
    const monthText = override.monthlyWeights ? "分月已调整" : "分月沿用默认";
    const hourText = override.hourlyWeightsByMonth?.[month] ? "本月分时已调整" : "本月分时沿用默认";
    return `本年已调整 · ${monthText} · ${hourText}`;
  }

  function renderCurves(project, entry, config, domain, labels, disabled) {
    const series = getSeries(config, entry.curveSeries);
    const curve = domain.getCurve(series, entry.curveYear);
    const monthly = curve.monthlyWeights || [];
    const total = monthly.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    const complete = monthly.length === 12 && monthly.every(Number.isFinite);
    const override = series.curveOverridesByYear?.[entry.curveYear];
    return `<section class="sd-section sd-edit-section"><div class="sd-section-head"><h4 id="sd-curve-heading">典型年曲线</h4><span class="sd-state" data-sd-curve-origin>${curveOrigin(series, entry.curveYear, entry.curveMonth)}</span></div>
      <p data-help="分月与分时占比" data-help-anchor="#sd-curve-heading">分月 12 个占比合计 100%。每月典型日 24 个小时占比也分别合计 100%。默认曲线跨年复用，可为选中年份配置分月曲线或部分月份的分时曲线。模型年固定 365 天。Excel 空白保留现值，填 0 才更新为零。</p>
      <div class="sd-actions sd-curve-controls">
        <label>范围<select data-sd-select="curveYear"${disabled}>${option("default", "默认典型年", entry.curveYear === null ? "default" : "")}${years(project).map((year) => option(year, `${year}年`, entry.curveYear)).join("")}</select></label>
        <label>供需要素<select data-sd-select="curveSeries">${labels.map(([key, name]) => option(key, name, entry.curveSeries)).join("")}</select></label>
        <label>分时预览<select data-sd-select="curveMonth">${MONTHS.map((month) => option(month, `${month}月`, entry.curveMonth)).join("")}</select></label>
        ${button("restore-curve", "恢复默认", false, !override || Boolean(disabled))}</div>
      <div class="sd-section-head"><h5>分月占比（%）</h5><span class="sd-color-muted" data-sd-month-total>合计 ${share.format(total)}${complete ? "" : " · 待补齐"}</span></div>
      <div class="sd-number-grid">${MONTHS.map((month) => `<label>${month}月${numberInput("month-share", shareInput(monthly[month - 1]), `${month}月占比`, `min="0" max="100" data-sd-month="${month}"${disabled}`)}</label>`).join("")}</div>
      <div data-sd-curve-preview>${curvePreview(project, entry, config, domain)}</div>
      <div class="sd-actions">${button("download-template", "下载 Excel 曲线模板", false, Boolean(disabled))}
        <label class="sd-file ghost-button"><input type="file" data-sd-template-file accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"${entry.conflict ? " disabled" : ""}><span>导入 Excel 曲线</span></label></div>
    </section>`;
  }

  function notice(entry, text, errors = []) {
    entry.message = text;
    entry.errors = errors;
  }

  function renderNotice(entry) {
    const errors = entry.errors;
    const list = errors.length ? `<ul>${errors.slice(0, ERROR_LIMIT).map((error) => `<li>${escape(error)}</li>`).join("")}</ul>` : "";
    const remaining = errors.length > ERROR_LIMIT ? `<p>另有 ${errors.length - ERROR_LIMIT} 项，请核对后重新导入。</p>` : "";
    return `<div class="sd-message${errors.length ? " sd-alert" : ""}" role="status" aria-live="polite" data-sd-message>${escape(entry.message)}${list}${remaining}</div>`;
  }

  function renderSavedDetails(entry, project, dataset) {
    if (!dataset.ok) return `<div class="sd-alert sd-preview-content">${escape(dataset.errors[0])}</div>`;
    const config = project.supplyDemand.config;
    const typical = dataset.typicalRows.filter((row) => row.year === entry.previewYear && row.month === entry.previewMonth);
    return `<div class="sd-preview-content"><h4>年度供需总量</h4>${tableRows(dataset.annualRows, PERIOD_START, config)}
      <div class="sd-actions"><h4>典型日24小时</h4>
        <label>年份<select data-sd-select="previewYear">${years(project).map((year) => option(year, year + "年", entry.previewYear)).join("")}</select></label>
        <label>月份<select data-sd-select="previewMonth">${Array.from({ length: 12 }, (_, i) => option(i + 1, (i + 1) + "月", entry.previewMonth)).join("")}</select></label>
      </div>${tableRows(typical, TYPICAL_START, config)}</div>`;
  }

  function renderSaved(entry, project, errors, loadDataset) {
    const saved = project.supplyDemand?.config;
    if (!saved) return "";
    if (errors.length) return `<div class="sd-alert">请核对已保存的供需配置。 ${escape(errors[0])}</div>`;
    const display = entry.previewOpen ? renderSavedDetails(entry, project, loadDataset(project, entry, saved)) : "";
    return `<div class="sd-saved-head"><span>已生成 ${project.forecastYears} 年 · 每年288个典型小时 / 8760小时</span>
        <div class="sd-actions">${Object.keys(CSV_LABELS).map((key) => button("export-" + key, CSV_LABELS[key] + "CSV")).join("")}</div></div>
      <details class="sd-preview"${entry.previewOpen ? " open" : ""} data-sd-preview><summary>查看已保存数据（MWh）</summary>${display}</details>`;
  }

  function statusLabel(entry, saved, savedErrors, draft) {
    if (entry.loading) return "读取模板中";
    if (entry.conflict) return "待重新核对";
    if (entry.staged) return "待保存";
    if (draft) return "草稿待生成";
    return savedErrors.length ? "待核对" : saved ? "已保存" : "待配置";
  }

  function renderImportPreview(entry) {
    const imported = entry.staged?.imported;
    if (!imported) return "";
    const { name, year, changedRows, changes, legacy } = imported;
    const shownRows = (changes || []).slice(0, ERROR_LIMIT);
    const preview = shownRows.length ? `<ul>${shownRows.map((change) => `<li>${escape(typeof change === "string" ? change
      : [change.label, change.month ? `${change.month}月典型日分时` : "分月占比"].filter(Boolean).join(" · "))}</li>`).join("")}</ul>` : "";
    return `<section class="sd-section sd-import-preview" data-sd-import-preview><div class="sd-section-head"><h5>${year === null ? "默认典型年" : `${year} 年`}导入预览</h5><span class="sd-file-name">${escape(name)}</span></div>
      <span>${changedRows ? `已载入 ${changedRows} 行曲线变更` : "模板与当前曲线一致"}${legacy ? " · 仅载入旧模板的曲线" : ""}</span>${preview}</section>`;
  }

  function markup(project, entry, domain, loadDataset, config) {
    const saved = project.supplyDemand?.config, draft = project.supplyDemand?.draft;
    const savedErrors = saved ? domain.validateConfig(project, saved) : [];
    const status = statusLabel(entry, saved, savedErrors, draft);
    const canGenerate = Boolean((entry.staged || draft) && !entry.loading && !entry.conflict);
    const canDiscard = Boolean(entry.staged || entry.loading || draft);
    const savedMarkup = renderSaved(entry, project, savedErrors, loadDataset);
    const labels = seriesLabels(config);
    const disabled = entry.loading || entry.conflict ? " disabled" : "";
    return `<div class="panel sd-workspace"><div class="sd-section-head">
      <div><h3 id="sd-workspace-heading">测算周期供需配置</h3><span class="sd-period">${periodLabel(project)} · ${project.forecastYears}年</span></div>
      <span class="sd-state" data-sd-dirty>${status}</span></div>
      ${renderAnnualInputs(project, entry, config, labels, disabled)}
      ${renderCurves(project, entry, config, domain, labels, disabled)}
      ${renderImportPreview(entry)}${renderNotice(entry)}
      ${entry.conflict ? '<div class="sd-alert">当前项目周期或已保存供需配置已更新。请放弃草稿后继续配置。</div>' : ""}
      <div class="sd-actions">${button("generate", "校验并生成供需数据", true, !canGenerate)}
        <span data-sd-discard-wrap${canDiscard ? "" : " hidden"}>${button("discard", entry.loading ? "取消读取" : "放弃草稿")}</span></div>
      ${savedMarkup ? `<section class="sd-output">${savedMarkup}</section>` : ""}</div>`;
  }

  function createController(options = {}) {
    const { root, getProject = () => null, onCommit = () => false, onDraftChange = () => {},
      downloadCsv = () => {}, now = () => new Date().toISOString() } = options;
    const domain = options.domain || globalRoot.NE_SUPPLY_DEMAND || (typeof module !== "undefined" && module.exports ? require("../domain/supply-demand") : null);
    const template = () => options.template || globalRoot.NE_SUPPLY_DEMAND_TEMPLATE;
    const xlsx = () => options.xlsx || globalRoot.XLSX;
    const entries = new WeakMap();
    let renderedProject = null, bound = false;

    function source(project) {
      return JSON.stringify([project.id, project.province, project.startYear, project.forecastYears, project.supplyDemand || {}]);
    }

    function getEntry(project) {
      let entry = entries.get(project);
      if (!entry || entry.projectId !== project.id) {
        entry = { projectId: project.id, staged: null, loading: null, conflict: false, message: "", errors: [],
          previewYear: project.startYear, previewMonth: 1, previewOpen: false, dataset: null,
          growthSeries: null, growthFill: null, curveYear: null, curveSeries: "load", curveMonth: 1 };
        entries.set(project, entry);
      }
      const current = source(project);
      if (entry.loading && entry.loading.source !== current) entry.loading = null;
      entry.conflict = Boolean(entry.staged && entry.staged.source !== current);
      return entry;
    }

    function templateBase(project, entry) {
      const { draft, config } = project.supplyDemand || {};
      return (!entry.conflict && entry.staged?.config) || draft || config;
    }

    function editableConfig(project, entry) {
      const basis = templateBase(project, entry);
      if (entry.staged?.config === basis && basis?.version === 2 && entry.staged.imported?.changedRows !== 0) return basis;
      return domain.prepareShareConfig(project, basis);
    }

    function stage(project, entry, config, imported = entry.staged?.imported?.changedRows ? entry.staged.imported : undefined) {
      entry.staged = { source: source(project), config, imported };
      notice(entry, "");
    }

    function loadDataset(project, entry, config) {
      const fingerprint = domain.fingerprint(project, config);
      if (!entry.dataset || entry.dataset.fingerprint !== fingerprint) entry.dataset = domain.buildDataset(project, config);
      return entry.dataset;
    }

    function render() {
      if (!root) return;
      const project = getProject();
      if (renderedProject && renderedProject !== project) {
        const previous = entries.get(renderedProject);
        if (previous) previous.loading = null;
      }
      renderedProject = project;
      if (!project || !years(project).length) {
        root.innerHTML = '<div class="panel sd-preview-empty">请先完成项目创建，供需配置将自动读取测算周期。</div>';
        return;
      }
      if (!domain) { root.innerHTML = '<div class="sd-alert">供需模块尚未加载，请刷新后重试。</div>'; return; }
      const entry = getEntry(project);
      const projectYears = years(project);
      if (!projectYears.includes(entry.previewYear)) entry.previewYear = project.startYear;
      if (entry.curveYear !== null && !projectYears.includes(entry.curveYear)) entry.curveYear = null;
      const config = editableConfig(project, entry);
      const active = seriesLabels(config).map(([key]) => key);
      if (!active.includes(entry.curveSeries)) entry.curveSeries = "load";
      if (!active.includes(entry.growthSeries) || project.forecastYears === 1) entry.growthSeries = null;
      root.innerHTML = markup(project, entry, domain, loadDataset, config);
      if (!bound && root.addEventListener) {
        root.addEventListener("input", onInput);
        root.addEventListener("change", onChange);
        root.addEventListener("click", onClick);
        root.addEventListener("toggle", onToggle, true);
        bound = true;
      }
    }

    function eventContext(event) {
      const project = getProject();
      if (!project || project !== renderedProject || !years(project).length || (root.contains && !root.contains(event.target))) {
        if (project !== renderedProject) render();
        return null;
      }
      return { project, entry: getEntry(project) };
    }

    function onToggle(event) {
      if (!event.target?.hasAttribute?.("data-sd-preview")) return;
      const context = eventContext(event);
      if (!context || context.entry.previewOpen === Boolean(event.target.open)) return;
      context.entry.previewOpen = Boolean(event.target.open);
      // Keep keyboard focus on the disclosure while filling its lazy contents.
      const { project, entry } = context;
      const saved = project.supplyDemand?.config;
      if (event.target.open && saved && !event.target.querySelector(".sd-preview-content")) {
        event.target.insertAdjacentHTML("beforeend", renderSavedDetails(entry, project, loadDataset(project, entry, saved)));
      }
    }

    function onChange(event) {
      const context = eventContext(event);
      if (!context) return;
      const { project, entry } = context, { dataset, value } = event.target;
      if (dataset?.sdTemplateFile !== undefined) {
        const file = event.target.files?.[0];
        if (file) return importFile(project, entry, file);
        return;
      }
      const selected = dataset?.sdSelect;
      if (selected === "tieMode" && !entry.loading && !entry.conflict && ["net", "bidirectional"].includes(value)) {
        const config = editableConfig(project, entry);
        if (config.elements.tieLine.mode !== value) {
          config.elements.tieLine.mode = value;
          stage(project, entry, config);
          refreshDraft();
        }
      } else if (selected === "curveYear" && !entry.loading && !entry.conflict && (value === "default" || years(project).includes(Number(value)))) {
        entry.curveYear = value === "default" ? null : Number(value);
        render();
      } else if (selected === "curveSeries" && seriesLabels(editableConfig(project, entry)).some(([key]) => key === value)) {
        entry.curveSeries = value;
        render();
      } else if (["curveMonth", "previewMonth"].includes(selected) && MONTHS.includes(Number(value))) {
        entry[selected] = Number(value);
        render();
      } else if (selected === "previewYear" && years(project).includes(Number(value))) {
        entry.previewYear = Number(value);
        render();
      }
      else return;
      root.querySelector?.(`[data-sd-select="${selected}"]`)?.focus?.({ preventScroll: true });
    }

    function numeric(value) {
      return value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
    }

    function editMonthly(series, year, month, value) {
      const monthly = domain.getCurve(series, year).monthlyWeights;
      const index = month - 1;
      if (shareInput(monthly[index]) === value) return false;
      const changed = [...monthly];
      changed[index] = value === null ? null : value / 100;
      if (year === null) { series.monthlyWeights = changed; return true; }
      series.curveOverridesByYear ||= {};
      const override = series.curveOverridesByYear[year] ||= {};
      if (changed.every((entry, position) => entry === series.monthlyWeights[position])) delete override.monthlyWeights;
      else override.monthlyWeights = changed;
      if (!Object.keys(override).length) delete series.curveOverridesByYear[year];
      if (!Object.keys(series.curveOverridesByYear).length) delete series.curveOverridesByYear;
      return true;
    }

    function updateEditor(project, entry, config, key) {
      if (!root.querySelector) { refreshDraft(); return; }
      const setText = (selector, text) => {
        const node = root.querySelector(selector);
        if (node) node.textContent = text;
      };
      const setDisabled = (selector, value) => {
        const node = root.querySelector(selector);
        if (node) node.disabled = value;
      };
      setText("[data-sd-dirty]", "待保存");
      setDisabled('[data-sd-action="generate"]', false);
      const discard = root.querySelector("[data-sd-discard-wrap]");
      if (discard) discard.hidden = false;
      const message = root.querySelector("[data-sd-message]");
      if (message) { message.textContent = ""; message.classList?.remove("sd-alert"); }
      if (key) setText(`[data-sd-growth-for="${key}"]`, growthStatus(years(project).slice(1), getSeries(config, key)));
      const series = getSeries(config, entry.curveSeries);
      const monthly = domain.getCurve(series, entry.curveYear).monthlyWeights;
      const total = monthly.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
      setText("[data-sd-month-total]", `合计 ${share.format(total)}${monthly.every(Number.isFinite) ? "" : " · 待补齐"}`);
      setText("[data-sd-curve-origin]", curveOrigin(series, entry.curveYear, entry.curveMonth));
      setDisabled('[data-sd-action="restore-curve"]', !series.curveOverridesByYear?.[entry.curveYear]);
      const preview = root.querySelector("[data-sd-curve-preview]");
      if (preview) preview.innerHTML = curvePreview(project, entry, config, domain);
      onDraftChange();
    }

    function onInput(event) {
      const context = eventContext(event), kind = event.target?.dataset?.sdInput;
      if (!context || !kind) return;
      const { project, entry } = context;
      if (entry.loading || entry.conflict) return;
      const value = numeric(event.target.value);
      if (kind === "growth-fill") { entry.growthFill = value; return; }
      const config = editableConfig(project, entry);
      const key = event.target.dataset.sdSeries;
      if (kind === "month-share") {
        const month = Number(event.target.dataset.sdMonth);
        if (!MONTHS.includes(month) || !editMonthly(getSeries(config, entry.curveSeries), entry.curveYear, month, value)) return;
      } else {
        if (!seriesLabels(config).some(([id]) => id === key)) return;
        const series = getSeries(config, key);
        if (kind === "base") {
          if (series.baseEnergyMwh === value) return;
          series.baseEnergyMwh = value;
        } else if (kind === "growth-rate") {
          const year = Number(event.target.dataset.sdYear);
          if (!years(project).slice(1).includes(year) || series.growthRatesByYear[year] === value) return;
          series.growthRatesByYear[year] = value;
        } else return;
      }
      stage(project, entry, config);
      updateEditor(project, entry, config, key);
    }

    function refreshDraft() {
      render();
      onDraftChange();
    }

    async function importFile(project, entry, file) {
      const codec = template();
      if (!codec || !/\.xlsx$/i.test(file.name || "")) {
        const wasLoading = Boolean(entry.loading);
        entry.loading = null;
        notice(entry, "无法导入 Excel 模板。", [codec ? "请选择 .xlsx 文件。" : "Excel 模块尚未加载，请刷新后重试。"]);
        if (wasLoading) refreshDraft();
        else render();
        return;
      }
      const request = { source: source(project), year: entry.curveYear };
      entry.loading = request;
      const basis = templateBase(project, entry);
      notice(entry, "");
      refreshDraft();
      let result;
      try {
        result = await codec.readCurveFile(project, file, { xlsx: xlsx(), year: request.year,
          baseConfig: basis ? clone(basis) : undefined, allowLegacy: true });
      } catch (error) {
        result = { ok: false, errors: [error?.message || "无法读取工作簿，请核对文件。"] };
      }
      if (entry.loading !== request) return;
      entry.loading = null;
      if (project !== getProject() || project !== renderedProject) return;
      if (request.source !== source(project)) { refreshDraft(); return; }
      if (!result?.ok || !result.config) {
        notice(entry, "模板校验未通过。", result?.errors?.length ? result.errors : ["请重新下载模板核对。"]);
        refreshDraft();
        return;
      }
      stage(project, entry, clone(result.config), { name: file.name, year: request.year,
        changedRows: result.changedRows, changes: clone(result.changes || []), legacy: result.legacy === true });
      notice(entry, "模板校验通过，请核对曲线后保存。");
      refreshDraft();
    }

    function clearStaged(entry, message) {
      entry.staged = null;
      entry.loading = null;
      notice(entry, message);
      refreshDraft();
    }

    function commit(project, entry, next, flags, message, dataset = null) {
      const staged = entry.staged, previousDataset = entry.dataset;
      entry.staged = null;
      if (dataset) entry.dataset = dataset;
      try {
        if (onCommit(project, next, flags) === false) throw new Error("未能保存供需配置，请重试。");
      } catch (error) {
        entry.staged = staged;
        entry.dataset = previousDataset;
        notice(entry, "供需配置保存失败。", [error?.message || "请重试。"]);
        render();
        return;
      }
      notice(entry, message);
      render();
    }

    function savedConfigMatches(project, saved, candidate) {
      if (!saved) return false;
      const fingerprint = domain.fingerprint(project, candidate);
      if (domain.fingerprint(project, saved) === fingerprint) return true;
      return saved.version === 1 && candidate.version === 2 && !domain.validateConfig(project, saved).length &&
        domain.fingerprint(project, domain.prepareShareConfig(project, saved)) === fingerprint;
    }

    function generate(project, entry) {
      const previous = project.supplyDemand || {};
      const candidate = entry.staged?.config || previous.draft;
      if (!candidate || entry.loading || entry.conflict) return;
      if (savedConfigMatches(project, previous.config, candidate)) {
        if (domain.validateConfig(project, candidate).length) return;
        if (!previous.draft) { clearStaged(entry, "已保留相同的供需配置。"); return; }
        const next = clone(previous);
        delete next.draft;
        commit(project, entry, next, { changed: false, generated: false }, "已保留相同的供需配置。");
        return;
      }
      const result = domain.buildDataset(project, candidate);
      if (!result.ok) {
        notice(entry, "供需数据生成失败。", result.errors);
        render();
        return;
      }
      const next = { ...clone(previous), version: 1, config: clone(candidate), inputFingerprint: result.fingerprint, generatedAt: now() };
      delete next.draft;
      commit(project, entry, next, { changed: true, generated: true },
        "已生成 " + result.annualRows.length + " 年供需输入，年度与小时电量已核验。", result);
    }

    function exportSaved(project, entry, kind) {
      const config = project.supplyDemand?.config;
      if (!config || !Object.hasOwn(CSV_LABELS, kind)) return;
      const result = loadDataset(project, entry, config);
      if (!result.ok) { notice(entry, "请核对已保存的供需配置。", result.errors); render(); return; }
      const label = CSV_LABELS[kind];
      downloadCsv((project.name || "项目") + "_供需" + label + "_" + project.startYear + "-" + (project.startYear + project.forecastYears - 1) + ".csv",
        domain.csvRows(result, kind));
    }

    function fillGrowth(project, entry) {
      if (entry.loading || entry.conflict || !entry.growthSeries) return;
      const fill = entry.growthFill;
      if (!Number.isFinite(fill) || fill < -100) {
        notice(entry, "请填写有效的统一增速。", ["增长率不能低于 -100%。"]);
        render();
        root.querySelector?.('[data-sd-input="growth-fill"]')?.focus?.();
        return;
      }
      const config = editableConfig(project, entry), series = getSeries(config, entry.growthSeries);
      const empty = years(project).slice(1).filter((year) => series.growthRatesByYear[year] == null);
      empty.forEach((year) => { series.growthRatesByYear[year] = fill; });
      if (!empty.length) { notice(entry, "各年增速已填，可逐年修改。"); render(); return; }
      stage(project, entry, config);
      notice(entry, `已填入 ${empty.length} 个空白年份。`);
      refreshDraft();
      root.querySelector?.('[data-sd-action="growth-fill"]')?.focus?.({ preventScroll: true });
    }

    function restoreCurve(project, entry) {
      if (entry.loading || entry.conflict || entry.curveYear === null) return;
      const config = editableConfig(project, entry), series = getSeries(config, entry.curveSeries);
      const overrides = series.curveOverridesByYear;
      if (!overrides?.[entry.curveYear]) return;
      delete overrides[entry.curveYear];
      if (!Object.keys(overrides).length) delete series.curveOverridesByYear;
      stage(project, entry, config);
      notice(entry, `${entry.curveYear} 年该要素已恢复默认曲线。`);
      refreshDraft();
    }

    function discard(project, entry) {
      if (entry.loading) {
        entry.loading = null;
        notice(entry, "已取消读取模板。");
        refreshDraft();
      } else if (entry.staged) {
        clearStaged(entry, "已放弃本次草稿。");
      } else if (project.supplyDemand?.draft) {
        const next = clone(project.supplyDemand);
        delete next.draft;
        commit(project, entry, next, { changed: false, generated: false }, "已放弃已保存草稿。");
      }
    }

    function onClick(event) {
      const control = event.target?.closest?.("[data-sd-action]");
      if (!control || control.disabled) return;
      const context = eventContext(event);
      if (!context) return;
      event.preventDefault?.();
      const { project, entry } = context, action = control.dataset.sdAction;
      if (action === "download-template") {
        try {
          const codec = template();
          if (!codec) throw new Error("Excel 模块尚未加载，请刷新后重试。");
          codec.downloadCurves(project, templateBase(project, entry), { xlsx: xlsx(), year: entry.curveYear });
        } catch (error) {
          notice(entry, "模板下载失败。", [error?.message || "请重试。"]);
          render();
        }
      } else if (action === "generate") {
        generate(project, entry);
      } else if (action === "discard") {
        discard(project, entry);
      } else if (action === "growth-open" || action === "growth-close") {
        const key = control.dataset.sdSeries;
        if (action === "growth-open" && (!seriesLabels(editableConfig(project, entry)).some(([id]) => id === key) || project.forecastYears < 2)) return;
        entry.growthSeries = entry.growthSeries === key || action === "growth-close" ? null : key;
        entry.growthFill = null;
        render();
        if (entry.growthSeries) root.querySelector?.('[data-sd-input="growth-fill"]')?.focus?.({ preventScroll: true });
      } else if (action === "growth-fill") {
        fillGrowth(project, entry);
      } else if (action === "restore-curve") {
        restoreCurve(project, entry);
      } else if (action.startsWith("export-")) {
        exportSaved(project, entry, action.slice(7));
      }
    }

    return Object.freeze({ render, hasUnsavedChanges(project = getProject()) {
      const entry = project && entries.get(project);
      return Boolean(entry && (entry.staged || entry.loading));
    } });
  }

  return Object.freeze({ createController });
});
