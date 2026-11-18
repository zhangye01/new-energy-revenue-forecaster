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
  const ERROR_LIMIT = 8;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const energy = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

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

  function markup(project, entry, domain, loadDataset) {
    const saved = project.supplyDemand?.config, draft = project.supplyDemand?.draft;
    const candidate = entry.staged?.config || draft;
    const preview = entry.staged?.preview || (draft ? domain.buildAnnualSummary(project, draft) : null);
    const savedErrors = saved ? domain.validateConfig(project, saved) : [];
    const status = entry.loading ? "读取模板中" : entry.conflict ? "待重新核对" : entry.staged ? "待保存"
      : draft ? preview.ok ? "草稿待生成" : "草稿待核对" : savedErrors.length ? "待核对" : saved ? "已保存" : "待配置";
    const actions = candidate || entry.loading ? `
      <div class="sd-actions">${candidate ? button("generate", "保存并生成供需数据", true, !preview?.ok || entry.loading || entry.conflict) : ""}
        ${button("discard", entry.staged || entry.loading ? "放弃本次导入" : "放弃已保存草稿")}</div>` : "";
    const savedMarkup = renderSaved(entry, project, savedErrors, loadDataset);
    return `<div class="panel sd-workspace"><div class="sd-section-head">
      <div><h3 id="sd-workspace-heading">测算周期供需配置</h3><span class="sd-period">${periodLabel(project)} · ${project.forecastYears}年</span></div>
      <span class="sd-state" data-sd-dirty>${status}</span></div>
      <p data-help="供需输入口径" data-help-anchor="#sd-workspace-heading">在 Excel 中填写省内负荷、联络线负荷、风电出力、光伏出力、水电出力和非市场化出力。首年填电量，后续按逐年增速滚动，分月及各月典型日分时曲线跨年复用。联络线净额正数为送出、负数为受入。模型年固定365天、8760小时。</p>
      <div class="sd-actions">${button("download-template", "下载 Excel 模板")}
        <label class="sd-file ghost-button"><input type="file" data-sd-template-file accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><span>导入 Excel 模板</span></label></div>
      ${renderNotice(entry)}
      ${entry.conflict ? '<div class="sd-alert">当前项目周期或已保存供需配置已更新。请放弃本次导入或按最新模板重新导入。</div>' : ""}
      ${preview?.ok ? `<section class="sd-section sd-import-preview" data-sd-import-preview>
        <div class="sd-section-head"><h4>${entry.staged ? "导入预览" : "已保存草稿预览"} · 年度供需总量（MWh）</h4>${entry.staged ? `<span class="sd-file-name">${escape(entry.staged.name)}</span>` : ""}</div>
        ${tableRows(preview.annualRows, PERIOD_START, candidate)}${actions}</section>` : `
        ${preview ? `<div class="sd-alert">请下载模板核对已保存草稿。 ${escape(preview.errors[0])}</div>` : ""}${actions}`}
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
          previewYear: project.startYear, previewMonth: 1, previewOpen: false, dataset: null };
        entries.set(project, entry);
      }
      const current = source(project);
      if (entry.loading && entry.loading.source !== current) entry.loading = null;
      entry.conflict = Boolean(entry.staged && entry.staged.source !== current);
      return entry;
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
      if (!years(project).includes(entry.previewYear)) entry.previewYear = project.startYear;
      root.innerHTML = markup(project, entry, domain, loadDataset);
      if (!bound && root.addEventListener) {
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
      if (dataset?.sdSelect === "previewYear" && years(project).includes(Number(value))) entry.previewYear = Number(value);
      else if (dataset?.sdSelect === "previewMonth" && Number(value) >= 1 && Number(value) <= 12) entry.previewMonth = Number(value);
      else return;
      render();
    }

    function templateBase(project, entry) {
      const { draft, config } = project.supplyDemand || {};
      return (!entry.conflict && entry.staged?.config) || draft || config;
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
      const request = { source: source(project) };
      entry.loading = request;
      const basis = templateBase(project, entry);
      notice(entry, "");
      refreshDraft();
      let result;
      try {
        result = await codec.readFile(project, file, { xlsx: xlsx(), baseConfig: basis ? clone(basis) : undefined });
      } catch (error) {
        result = { ok: false, errors: [error?.message || "无法读取工作簿，请核对文件。"] };
      }
      if (entry.loading !== request) return;
      entry.loading = null;
      if (project !== getProject() || project !== renderedProject) return;
      if (request.source !== source(project)) { refreshDraft(); return; }
      const preview = result?.ok ? domain.buildAnnualSummary(project, result.config) : result;
      if (!preview?.ok) {
        notice(entry, "模板校验未通过。", preview?.errors?.length ? preview.errors : ["请重新下载模板核对。"]);
        refreshDraft();
        return;
      }
      const config = clone(result.config);
      const same = project.supplyDemand?.config
        && domain.fingerprint(project, project.supplyDemand.config) === domain.fingerprint(project, config);
      entry.staged = { config, preview, name: file.name, source: request.source };
      notice(entry, same ? "模板校验通过，配置与已保存版本一致。" : "模板校验通过，请核对年度数据后保存。");
      refreshDraft();
    }

    function clearStaged(entry, message) {
      entry.staged = null;
      entry.loading = null;
      notice(entry, message);
      refreshDraft();
    }

    function commit(project, entry, next, flags, message, dataset = null) {
      const staged = entry.staged;
      entry.staged = null;
      try {
        if (onCommit(project, next, flags) === false) throw new Error("未能保存供需配置，请重试。");
      } catch (error) {
        entry.staged = staged;
        notice(entry, "供需配置保存失败。", [error?.message || "请重试。"]);
        render();
        return;
      }
      if (dataset) entry.dataset = dataset;
      notice(entry, message);
      render();
    }

    function generate(project, entry) {
      const previous = project.supplyDemand || {};
      const candidate = entry.staged?.config || previous.draft;
      if (!candidate || entry.loading || entry.conflict) return;
      const fingerprint = domain.fingerprint(project, candidate);
      if (previous.config && domain.fingerprint(project, previous.config) === fingerprint) {
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
          codec.download(project, templateBase(project, entry), { xlsx: xlsx() });
        } catch (error) {
          notice(entry, "模板下载失败。", [error?.message || "请重试。"]);
          render();
        }
      } else if (action === "generate") {
        generate(project, entry);
      } else if (action === "discard") {
        if (entry.staged || entry.loading) { clearStaged(entry, "已放弃本次导入。"); return; }
        if (!project.supplyDemand?.draft) return;
        const next = clone(project.supplyDemand);
        delete next.draft;
        commit(project, entry, next, { changed: false, generated: false }, "已放弃已保存草稿。");
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
