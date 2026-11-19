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
  const ELEMENT_TABS = Object.keys(COLUMNS).filter((key) => key !== "residualDemand");
  const PERIOD_START = [{ label: "年份", value: (row) => row.year }];
  const TYPICAL_START = [
    { label: "小时", value: (row) => String(row.hour).padStart(2, "0") + ":00" },
    { label: "代表天数", value: (row) => row.representedDays }
  ];
  const CSV_LABELS = { annual: "年度", typical: "典型小时", hourly: "8760小时" };
  const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
  const HOURS = Array.from({ length: 24 }, (_, index) => index);
  const ERROR_LIMIT = 8;
  const EXCEL_ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
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

  function selectedSeries(entry, config) {
    return entry.activeElement === "tieLine" && config.elements.tieLine.mode === "bidirectional"
      ? entry.tieDirection : entry.activeElement;
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

  function growthTotalLabel(project, series, year) {
    const total = yearTotal(project, series, year);
    return total === null ? "电量待推算" : `${energy.format(total)} MWh`;
  }

  function growthPanel(project, entry, key, label, series, disabled) {
    if (entry.growthSeries !== key) return "";
    const preview = entry.staged?.imported?.seriesKey === key ? renderImportPreview(entry) : "";
    return `<div class="sd-growth-panel" id="sd-growth-panel" data-sd-growth-panel><div class="sd-section-head"><h5>${label} · 逐年增长率（%）</h5>
      <div class="sd-actions">${button("download-growth-template", "下载增速模板", false, Boolean(disabled))}
        <label class="sd-file ghost-button"><input type="file" data-sd-growth-file accept="${EXCEL_ACCEPT}"${entry.conflict ? " disabled" : ""}><span>导入增速模板</span></label></div></div>
      ${preview}
      <div class="sd-actions"><label>统一增速 %${numberInput("growth-fill", entry.growthFills[key], `${label}统一增速`, `min="-100"${disabled}`)}</label>${button("growth-fill", "填入空白年份", false, Boolean(disabled))}</div>
      <div class="sd-number-grid">${years(project).slice(1).map((year) => `<div><label>${year}年${numberInput("growth-rate", series.growthRatesByYear[year], `${label}${year}年增长率`, `min="-100" data-sd-series="${key}" data-sd-year="${year}"${disabled}`)}</label><span class="sd-color-muted" data-sd-growth-total="${year}">${growthTotalLabel(project, series, year)}</span></div>`).join("")}</div></div>`;
  }

  function renderAnnualInputs(project, entry, config, key, label, disabled) {
    const laterYears = years(project).slice(1);
    const series = getSeries(config, key);
    const attrs = `data-sd-series="${key}"${key === "tieLine" ? "" : ' min="0"'}${disabled}`;
    const expanded = entry.growthSeries === key;
    const edit = laterYears.length ? `<div class="sd-growth-trigger">
      <button type="button" class="primary-button" data-sd-action="growth-open" data-sd-series="${key}" aria-expanded="${expanded}"${expanded ? ' aria-controls="sd-growth-panel"' : ""}>${expanded ? "收起" : "编辑"}逐年增速<span class="sd-growth-chevron" aria-hidden="true"></span></button>
      <span class="sd-color-muted" data-sd-growth-for="${key}">${growthStatus(laterYears, series)}</span></div>` : "";
    return `<section class="sd-section sd-element-annual"><div class="sd-section-head"><h4 id="sd-annual-heading">年度电量与增速</h4></div>
      <p data-help="电量与增速" data-help-anchor="#sd-annual-heading">${project.startYear} 年填电量，后续按各年增速滚动。增速可手填或用 Excel 模板导入，空白保留原值，填 0 表示不增长。${entry.activeElement === "tieLine" ? "联络线净额正数送出、负数受入。双向分别填写非负电量。" : ""}无该项可填 0。</p>
      <div class="sd-element-summary"><label>首年总量（${project.startYear} 年，MWh）${numberInput("base", series.baseEnergyMwh, `${label}首年总量`, attrs)}</label>${edit}</div>
      ${growthPanel(project, entry, key, label, series, disabled)}</section>`;
  }

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
    const series = getSeries(config, selectedSeries(entry, config));
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

  function monthlyCurvePreview(monthly) {
    const filled = monthly.filter(Number.isFinite);
    const total = filled.reduce((sum, value) => sum + value, 0);
    const status = filled.length ? `合计 ${share.format(total)}${filled.length === 12 ? "" : " · 待补齐"}` : "待导入";
    const values = MONTHS.map((month) => {
      const value = monthly[month - 1];
      return `<span>${month}月 <strong>${Number.isFinite(value) ? share.format(value) : "—"}</strong></span>`;
    }).join("");
    return `<details class="sd-monthly-shares" data-sd-monthly-preview><summary>查看分月占比 <span>${status}</span></summary>
      <div class="sd-month-total-grid">${values}</div></details>`;
  }

  function renderCurves(project, entry, config, domain, key, disabled) {
    const series = getSeries(config, key);
    const curve = domain.getCurve(series, entry.curveYear);
    const override = series.curveOverridesByYear?.[entry.curveYear];
    return `<section class="sd-section"><div class="sd-section-head"><h4 id="sd-curve-heading">典型年曲线</h4><span class="sd-state" data-sd-curve-origin>${curveOrigin(series, entry.curveYear, entry.curveMonth)}</span></div>
      <p data-help="分月与分时占比" data-help-anchor="#sd-curve-heading">分月和分时均通过 Excel 模板导入。分月 12 个占比合计 100%，每月典型日 24 个小时占比也分别合计 100%。默认曲线跨年复用，可单独导入指定年份。模板包含所选范围的全部要素，空白保留现值，填 0 更新为零。</p>
      <div class="sd-actions sd-curve-controls">
        <label>范围<select data-sd-select="curveYear"${disabled}>${option("default", "默认典型年", entry.curveYear === null ? "default" : "")}${years(project).map((year) => option(year, `${year}年`, entry.curveYear)).join("")}</select></label>
        ${button("download-template", "下载 Excel 曲线模板", false, Boolean(disabled))}
        <label class="sd-file ghost-button"><input type="file" data-sd-template-file accept="${EXCEL_ACCEPT}"${entry.conflict ? " disabled" : ""}><span>导入 Excel 曲线</span></label>
        ${button("restore-curve", "恢复默认", false, !override || Boolean(disabled))}</div>
      ${monthlyCurvePreview(curve.monthlyWeights || [])}
      <div class="sd-actions sd-curve-controls"><label>分时预览<select data-sd-select="curveMonth">${MONTHS.map((month) => option(month, `${month}月`, entry.curveMonth)).join("")}</select></label></div>
      <div data-sd-curve-preview>${curvePreview(project, entry, config, domain)}</div>
    </section>`;
  }

  function renderElementEditor(project, entry, config, domain, disabled) {
    const key = selectedSeries(entry, config), mode = config.elements.tieLine.mode;
    const label = key === "tieLine" ? COLUMNS[key] : DIRECTIONAL_COLUMNS[key];
    const tabs = ELEMENT_TABS.map((element) => {
      const selected = element === entry.activeElement;
      return `<button class="sd-element-tab" type="button" role="tab" id="sd-tab-${element}" aria-controls="sd-element-panel" aria-selected="${selected}" tabindex="${selected ? 0 : -1}" data-sd-action="select-element" data-sd-element="${element}">${COLUMNS[element]}</button>`;
    }).join("");
    const tieControls = entry.activeElement === "tieLine" ? `<div class="sd-section-head sd-element-heading">
      <div class="sd-actions"><label class="sd-inline-label">联络线口径<select data-sd-select="tieMode"${disabled}>${option("net", "净额", mode)}${option("bidirectional", "双向送受", mode)}</select></label>
      ${mode === "bidirectional" ? `<label class="sd-inline-label">配置方向<select data-sd-select="tieDirection">${option("tieLineExport", "送出", entry.tieDirection)}${option("tieLineImport", "受入", entry.tieDirection)}</select></label>` : ""}</div>
    </div>` : "";
    return `<div class="sd-element-tabs" role="tablist" aria-label="供需要素">${tabs}</div>
      <div class="sd-element-panel" role="tabpanel" id="sd-element-panel" aria-labelledby="sd-tab-${entry.activeElement}">
        ${tieControls}${renderAnnualInputs(project, entry, config, key, label, disabled)}${renderCurves(project, entry, config, domain, key, disabled)}
      </div>`;
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
      <h4>${entry.previewYear} 年 ${entry.previewMonth} 月典型日24小时</h4>${tableRows(typical, TYPICAL_START, config)}</div>`;
  }

  function renderSupplyChart(entry, project) {
    return `<section class="sd-section sd-supply-chart-panel" aria-labelledby="sd-supply-chart-heading">
      <div class="sd-section-head"><h4 id="sd-supply-chart-heading">供需堆积面积图</h4>
        <div class="sd-actions sd-supply-chart-controls">
          <label>年份<select data-sd-select="previewYear">${years(project).map((year) => option(year, `${year}年`, entry.previewYear)).join("")}</select></label>
          <label>粒度<select data-sd-select="previewGranularity">${option("monthly", "分月", entry.previewGranularity)}${option("typical", "典型日", entry.previewGranularity)}</select></label>
          <label data-sd-chart-month${entry.previewGranularity !== "typical" && !entry.previewOpen ? " hidden" : ""}>月份<select data-sd-select="previewMonth">${MONTHS.map((month) => option(month, `${month}月`, entry.previewMonth)).join("")}</select></label>
        </div></div>
      <p data-help="供需堆积面积图" data-help-anchor="#sd-supply-chart-heading">面积为风电、光伏、水电、非市场化出力及联络线受入。需求线为省内负荷加联络线送出。图表读取已生成数据，悬停可查看各项电量。</p>
      <div class="sd-supply-chart" data-sd-supply-chart role="img" aria-label="已生成供需数据，供给堆积面积及总需求"></div>
      <p class="sd-color-muted sd-supply-chart-feedback" data-sd-chart-fallback role="status" hidden>图表暂不可用，可查看或导出已保存数据。</p>
    </section>`;
  }

  function renderSaved(entry, project, savedErrors, dataset) {
    const saved = project.supplyDemand?.config;
    if (!saved) return "";
    const errors = savedErrors.length ? savedErrors : dataset?.errors || [];
    if (errors.length || !dataset?.ok) return `<div class="sd-alert">请核对已保存的供需配置。 ${escape(errors[0])}</div>`;
    const display = entry.previewOpen ? renderSavedDetails(entry, project, dataset) : "";
    return `<div class="sd-saved-head"><span>已生成 ${project.forecastYears} 年 · 每年288个典型小时 / 8760小时</span>
        <div class="sd-actions">${Object.keys(CSV_LABELS).map((key) => button("export-" + key, CSV_LABELS[key] + "CSV")).join("")}</div></div>
      ${renderSupplyChart(entry, project)}
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
    const { name, year, seriesKey, changedRows, changes, legacy } = imported;
    const growth = Boolean(seriesKey);
    const scope = growth ? `${COLUMNS[seriesKey] || DIRECTIONAL_COLUMNS[seriesKey]}逐年增速` : year === null ? "默认典型年" : `${year} 年`;
    const summary = growth ? (changedRows ? `已载入 ${changedRows} 年增速变更` : "模板与当前增速一致")
      : `${changedRows ? `已载入 ${changedRows} 行曲线变更` : "模板与当前曲线一致"}${legacy ? " · 仅载入旧模板的曲线" : ""}`;
    const shownRows = (changes || []).slice(0, ERROR_LIMIT);
    const preview = shownRows.length ? `<ul>${shownRows.map((change) => `<li>${escape(typeof change === "string" ? change
      : growth ? `${change.year} 年 · ${change.value}%`
          : [change.label, change.month ? `${change.month}月典型日分时` : "分月占比"].filter(Boolean).join(" · "))}</li>`).join("")}</ul>` : "";
    return `<section class="sd-section sd-import-preview" data-sd-import-preview><div class="sd-section-head"><h5>${scope}导入预览</h5><span class="sd-file-name">${escape(name)}</span></div>
      <span>${summary}</span>${preview}</section>`;
  }

  function markup(project, entry, domain, config, savedErrors, savedDataset) {
    const saved = project.supplyDemand?.config, draft = project.supplyDemand?.draft;
    const status = statusLabel(entry, saved, savedErrors.length ? savedErrors : savedDataset?.errors || [], draft);
    const canGenerate = Boolean((entry.staged || draft) && !entry.loading && !entry.conflict);
    const canDiscard = Boolean(entry.staged || entry.loading || draft);
    const savedMarkup = renderSaved(entry, project, savedErrors, savedDataset);
    const disabled = entry.loading || entry.conflict ? " disabled" : "";
    const importedSeries = entry.staged?.imported?.seriesKey;
    const previewInEditor = importedSeries === entry.growthSeries && importedSeries === selectedSeries(entry, config);
    return `<div class="panel sd-workspace"><div class="sd-section-head">
      <div><h3 id="sd-workspace-heading">测算周期供需配置</h3><span class="sd-period">${periodLabel(project)} · ${project.forecastYears}年</span></div>
      <span class="sd-state" data-sd-dirty>${status}</span></div>
      ${renderElementEditor(project, entry, config, domain, disabled)}
      ${previewInEditor ? "" : renderImportPreview(entry)}${renderNotice(entry)}
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
    const supplyChartOptions = () => options.supplyChart || globalRoot.NE_SUPPLY_DEMAND_CHART;
    const xlsx = () => options.xlsx || globalRoot.XLSX;
    const entries = new WeakMap();
    let renderedProject = null, bound = false;
    let mountedChart = null;

    function source(project) {
      return JSON.stringify([project.id, project.province, project.startYear, project.forecastYears, project.supplyDemand || {}]);
    }

    function getEntry(project) {
      let entry = entries.get(project);
      if (!entry || entry.projectId !== project.id) {
        entry = { projectId: project.id, staged: null, loading: null, conflict: false, message: "", errors: [],
          previewYear: project.startYear, previewMonth: 1, previewGranularity: "monthly", previewOpen: false, dataset: null, chartDataset: null,
          activeElement: "load", tieDirection: "tieLineExport", growthSeries: null, growthFills: {}, curveYear: null, curveMonth: 1 };
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

    function loadChartDataset(project, entry, config) {
      const fingerprint = domain.fingerprint(project, config);
      if (entry.dataset?.fingerprint === fingerprint) return entry.dataset;
      if (entry.chartDataset?.fingerprint !== fingerprint) {
        entry.chartDataset = { fingerprint, dataset: domain.buildTypicalSummary(project, config) };
      }
      return entry.chartDataset.dataset;
    }

    function disposeChart() {
      mountedChart?.dispose();
      mountedChart = null;
    }

    function mountChart(entry, dataset) {
      const plot = root.querySelector?.("[data-sd-supply-chart]");
      if (!plot) return;
      const fallback = root.querySelector("[data-sd-chart-fallback]");
      const windowRef = plot.ownerDocument?.defaultView || globalRoot;
      const engine = options.echarts || windowRef.echarts;
      const builder = supplyChartOptions();
      const unavailable = () => {
        plot.hidden = true;
        if (fallback) fallback.hidden = false;
      };
      if (!engine?.init || !builder?.buildOption) { unavailable(); return; }

      let chart = null, width = 0;
      const draw = () => {
        const currentWidth = plot.clientWidth;
        if (!currentWidth || plot.hidden) return;
        try {
          const style = windowRef.getComputedStyle?.(plot);
          const tokenKeys = { ink: "ink", muted: "muted", line: "line", lineStrong: "line-strong", panel: "panel" };
          const tokens = Object.fromEntries(Object.entries(tokenKeys).map(([key, cssKey]) =>
            [key, style?.getPropertyValue(`--${cssKey}`).trim()]).filter(([, value]) => value));
          const option = builder.buildOption(dataset, { year: entry.previewYear, month: entry.previewMonth,
            granularity: entry.previewGranularity, tokens, width: currentWidth });
          if (!option) { unavailable(); return; }
          chart ||= engine.init(plot, null, { renderer: "canvas" });
          width = currentWidth;
          chart.setOption(option, true);
        } catch {
          chart?.dispose();
          chart = null;
          unavailable();
        }
      };
      const resize = () => {
        if (!plot.clientWidth || plot.hidden) return;
        chart?.resize();
        if (width !== plot.clientWidth) draw();
      };
      const sizeObserver = windowRef.ResizeObserver ? new windowRef.ResizeObserver(resize) : null;
      const body = plot.ownerDocument?.body;
      const themeObserver = body && windowRef.MutationObserver ? new windowRef.MutationObserver(draw) : null;
      if (sizeObserver) sizeObserver.observe(plot);
      else windowRef.addEventListener?.("resize", resize);
      themeObserver?.observe(body, { attributes: true, attributeFilter: ["data-theme"] });
      mountedChart = { draw, dispose() {
        sizeObserver?.disconnect();
        if (!sizeObserver) windowRef.removeEventListener?.("resize", resize);
        themeObserver?.disconnect();
        chart?.dispose();
        chart = null;
      } };
      draw();
    }

    function render() {
      if (!root) return;
      disposeChart();
      const project = getProject();
      if (renderedProject && renderedProject !== project) {
        const previous = entries.get(renderedProject);
        if (previous) { previous.loading = null; previous.dataset = null; }
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
      if (project.forecastYears === 1) entry.growthSeries = null;
      const saved = project.supplyDemand?.config;
      const savedErrors = saved ? domain.validateConfig(project, saved) : [];
      const savedDataset = saved && !savedErrors.length ? loadChartDataset(project, entry, saved) : null;
      root.innerHTML = markup(project, entry, domain, config, savedErrors, savedDataset);
      if (savedDataset?.ok) mountChart(entry, savedDataset);
      if (!bound && root.addEventListener) {
        root.addEventListener("input", onInput);
        root.addEventListener("change", onChange);
        root.addEventListener("click", onClick);
        root.addEventListener("keydown", onTabKeyDown);
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
      syncChartMonth(entry);
      if (event.target.open) refreshSavedDetails(event.target, entry, project);
    }

    function syncChartMonth(entry) {
      const label = root.querySelector?.("[data-sd-chart-month]");
      if (label) label.hidden = entry.previewGranularity !== "typical" && !entry.previewOpen;
    }

    function refreshSavedDetails(details, entry, project) {
      const saved = project.supplyDemand?.config;
      if (!details || !saved || !entry.previewOpen) return;
      details.querySelector(".sd-preview-content")?.remove();
      details.insertAdjacentHTML("beforeend", renderSavedDetails(entry, project, loadChartDataset(project, entry, saved)));
    }

    function redrawSavedPreview(entry, project) {
      if (!root.querySelector) { render(); return; }
      syncChartMonth(entry);
      refreshSavedDetails(root.querySelector("[data-sd-preview]"), entry, project);
      mountedChart?.draw();
    }

    function selectElement(entry, key) {
      if (!ELEMENT_TABS.includes(key) || entry.activeElement === key) return;
      entry.activeElement = key;
      render();
      root.querySelector?.(`[data-sd-element="${key}"]`)?.focus?.({ preventScroll: true });
    }

    function onTabKeyDown(event) {
      const index = ELEMENT_TABS.indexOf(event.target?.dataset?.sdElement);
      if (index < 0) return;
      const last = ELEMENT_TABS.length - 1;
      const next = { ArrowLeft: index === 0 ? last : index - 1, ArrowRight: index === last ? 0 : index + 1, Home: 0, End: last };
      if (!Object.hasOwn(next, event.key)) return;
      const context = eventContext(event);
      if (!context) return;
      event.preventDefault?.();
      selectElement(context.entry, ELEMENT_TABS[next[event.key]]);
    }

    function onChange(event) {
      const context = eventContext(event);
      if (!context) return;
      const { project, entry } = context, { dataset, value } = event.target;
      const growthFile = dataset?.sdGrowthFile !== undefined;
      if (growthFile || dataset?.sdTemplateFile !== undefined) {
        const file = event.target.files?.[0];
        if (file) return importFile(project, entry, file, growthFile);
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
      } else if (selected === "tieDirection" && ["tieLineExport", "tieLineImport"].includes(value)) {
        entry.tieDirection = value;
        render();
      } else if (selected === "curveMonth" && MONTHS.includes(Number(value))) {
        entry.curveMonth = Number(value);
        render();
      } else if (selected === "previewYear" && years(project).includes(Number(value))) {
        entry.previewYear = Number(value);
        redrawSavedPreview(entry, project);
      } else if (selected === "previewMonth" && MONTHS.includes(Number(value))) {
        entry.previewMonth = Number(value);
        redrawSavedPreview(entry, project);
      } else if (selected === "previewGranularity" && ["monthly", "typical"].includes(value)) {
        entry.previewGranularity = value;
        redrawSavedPreview(entry, project);
      }
      else return;
      root.querySelector?.(`[data-sd-select="${selected}"]`)?.focus?.({ preventScroll: true });
    }

    function numeric(value) {
      return value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
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
      const series = getSeries(config, key), laterYears = years(project).slice(1);
      setText(`[data-sd-growth-for="${key}"]`, growthStatus(laterYears, series));
      if (entry.growthSeries === key) {
        laterYears.forEach((year) => setText(`[data-sd-growth-total="${year}"]`, growthTotalLabel(project, series, year)));
      }
      const preview = root.querySelector("[data-sd-curve-preview]");
      if (preview) preview.innerHTML = curvePreview(project, entry, config, domain);
      onDraftChange();
    }

    function onInput(event) {
      const context = eventContext(event), kind = event.target?.dataset?.sdInput;
      if (!context || !["base", "growth-rate", "growth-fill"].includes(kind)) return;
      const { project, entry } = context;
      if (entry.loading || entry.conflict) return;
      const value = numeric(event.target.value);
      const config = editableConfig(project, entry);
      const selected = selectedSeries(entry, config), series = getSeries(config, selected);
      if (kind === "growth-fill") { entry.growthFills[selected] = value; return; }
      const key = event.target.dataset.sdSeries;
      if (key !== selected) return;
      if (kind === "base") {
        if (series.baseEnergyMwh === value) return;
        series.baseEnergyMwh = value;
      } else {
        const year = Number(event.target.dataset.sdYear);
        if (!years(project).slice(1).includes(year) || series.growthRatesByYear[year] === value) return;
        series.growthRatesByYear[year] = value;
      }
      stage(project, entry, config);
      updateEditor(project, entry, config, key);
    }

    function refreshDraft() {
      render();
      onDraftChange();
    }

    function workbookScope(project, entry, growth) {
      return growth ? { seriesKey: selectedSeries(entry, editableConfig(project, entry)) } : { year: entry.curveYear };
    }

    async function importFile(project, entry, file, growth) {
      const codec = template();
      const read = growth ? codec?.readGrowthFile : codec?.readCurveFile;
      if (typeof read !== "function" || !/\.xlsx$/i.test(file.name || "")) {
        const wasLoading = Boolean(entry.loading);
        entry.loading = null;
        notice(entry, "无法导入 Excel 模板。", [typeof read === "function" ? "请选择 .xlsx 文件。" : "Excel 模块尚未加载，请刷新后重试。"]);
        if (wasLoading) refreshDraft();
        else render();
        return;
      }
      const scope = workbookScope(project, entry, growth);
      const request = { source: source(project) };
      entry.loading = request;
      const basis = templateBase(project, entry);
      notice(entry, "");
      refreshDraft();
      let result;
      try {
        result = await read.call(codec, project, file, { xlsx: xlsx(), ...scope,
          baseConfig: basis ? clone(basis) : undefined, ...(growth ? {} : { allowLegacy: true }) });
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
      stage(project, entry, clone(result.config), { name: file.name, ...scope,
        changedRows: result.changedRows, changes: clone(result.changes || []), legacy: result.legacy === true });
      notice(entry, growth ? "模板校验通过，请核对增速后生成供需数据。" : "模板校验通过，请核对曲线后保存。");
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
      const config = editableConfig(project, entry), key = selectedSeries(entry, config);
      if (entry.loading || entry.conflict || entry.growthSeries !== key) return;
      const fill = entry.growthFills[key];
      if (!Number.isFinite(fill) || fill < -100) {
        notice(entry, "请填写有效的统一增速。", ["增长率不能低于 -100%。"]);
        render();
        root.querySelector?.('[data-sd-input="growth-fill"]')?.focus?.();
        return;
      }
      const series = getSeries(config, key);
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
      const config = editableConfig(project, entry), series = getSeries(config, selectedSeries(entry, config));
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
        entry.growthFills = {};
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
      if (action === "select-element") {
        selectElement(entry, control.dataset.sdElement);
      } else if (action === "download-template" || action === "download-growth-template") {
        try {
          const codec = template();
          const growth = action === "download-growth-template";
          const download = growth ? codec?.downloadGrowth : codec?.downloadCurves;
          if (typeof download !== "function") throw new Error("Excel 模块尚未加载，请刷新后重试。");
          download.call(codec, project, templateBase(project, entry), { xlsx: xlsx(), ...workbookScope(project, entry, growth) });
        } catch (error) {
          notice(entry, "模板下载失败。", [error?.message || "请重试。"]);
          render();
        }
      } else if (action === "generate") {
        generate(project, entry);
      } else if (action === "discard") {
        discard(project, entry);
      } else if (action === "growth-open") {
        const key = selectedSeries(entry, editableConfig(project, entry));
        if (project.forecastYears < 2 || control.dataset.sdSeries !== key) return;
        entry.growthSeries = entry.growthSeries === key ? null : key;
        render();
        root.querySelector?.('[data-sd-action="growth-open"]')?.focus?.({ preventScroll: true });
      } else if (action === "growth-fill") {
        fillGrowth(project, entry);
      } else if (action === "restore-curve") {
        restoreCurve(project, entry);
      } else if (action.startsWith("export-")) {
        exportSaved(project, entry, action.slice(7));
      }
    }

    return Object.freeze({ render, disposeChart, hasUnsavedChanges(project = getProject()) {
      const entry = project && entries.get(project);
      return Boolean(entry && (entry.staged || entry.loading));
    } });
  }

  return Object.freeze({ createController });
});
