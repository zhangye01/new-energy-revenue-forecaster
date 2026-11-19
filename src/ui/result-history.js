"use strict";

(function (root, factory) {
  const commonJs = typeof module !== "undefined" && module.exports;
  const api = factory(
    commonJs ? require("../domain/result-versions") : root.NE_RESULT_VERSIONS,
    commonJs ? require("../domain/compare-analysis") : root.NE_COMPARE_ANALYSIS,
    commonJs ? require("../domain/export-builders") : root.NE_EXPORT_BUILDERS,
    commonJs ? require("../domain/app-utils") : root.NE_APP_UTILS
  );
  if (commonJs) module.exports = api;
  root.NE_RESULT_HISTORY = api;
  if (root.window && root.window !== root) root.window.NE_RESULT_HISTORY = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (versions, analysis, exports, utils) {
  const { escapeHtml } = utils;

  function dateLabel(value) {
    return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "时间未记录";
  }

  function renderCurrentTrace(node, project, result, isHistorical) {
    if (!node) return;
    node.hidden = !result;
    if (!result) { node.textContent = ""; return; }
    const run = project?.priceRuns?.find((item) => item.id === result.sourceContext?.runId);
    const trace = versions.describeResult(result, run);
    node.textContent = [isHistorical ? "历史结果" : "测算版本", trace.versionId || "旧版未编号", dateLabel(trace.generatedAt),
      trace.priceSourceLabel, trace.runId].filter(Boolean).join(" · ");
  }

  function annualRowsHtml(rows, legacyStorage) {
    const money = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    const cell = (value, scale = 1) => Number.isFinite(value) ? money.format(value / scale) : "—";
    return rows.filter((row) => Number.isInteger(row?.year)).map((row) => {
      const fields = legacyStorage
        ? [cell(row.fullRevenuePrice), cell(row.fullRevenue)]
        : [cell(row.energyMwh), cell(row.spotAvgPrice), cell(row.capturePrice), cell(row.fullRevenuePrice), cell(row.fullRevenue, 10000)];
      return `<tr><th scope="row">${row.year}</th>${fields.map((value) => `<td>${value}</td>`).join("")}</tr>`;
    }).join("");
  }

  function collectArchiveEntries(project, scenarioId) {
    const entries = versions.listArchivedResults(project, scenarioId);
    const legacy = project?.legacyStorageResultsByScenario?.[scenarioId];
    if (!Array.isArray(legacy?.annualRows) || !legacy.annualRows.some((row) =>
      Number.isInteger(row?.year) && Number.isFinite(row.fullRevenue) && Number.isFinite(row.fullRevenuePrice))) return entries;
    const legacyVersionId = legacy.resultVersion?.id;
    const legacyRows = legacyVersionId ? "" : JSON.stringify(legacy.annualRows);
    const legacySource = legacyVersionId ? "" : JSON.stringify(legacy.sourceContext ?? null);
    const duplicate = entries.some(({ result }) => legacyVersionId
      ? result.resultVersion?.id === legacyVersionId
      : !result.resultVersion?.id && JSON.stringify(result.sourceContext ?? null) === legacySource
        && JSON.stringify(result.annualRows) === legacyRows);
    if (!duplicate) entries.push({ key: "legacy-storage", result: legacy, legacyStorage: true });
    return entries;
  }

  function renderArchiveDetail(detail, project, scenario, entry, downloadCsv) {
    const { result, legacyStorage } = entry;
    const trace = versions.describeResult(result);
    const context = versions.getArchivedCalculationContext(result);
    const annualReady = context && analysis.isResultComplete(context.project, context.scenario, result);
    const hourlyReady = annualReady && analysis.isResultComplete(context.project, context.scenario, result, { includeHourly: true });
    const name = result.resultVersion?.scenarioName || scenario.name;
    const note = !context ? "旧版归档缺少原测算输入记录，可在此查阅已保留的年表。"
      : !annualReady ? "归档年表未通过对账，请核对原始存档。"
      : !hourlyReady ? "首年小时明细未通过对账。" : "";
    const rows = annualRowsHtml(result.annualRows, legacyStorage);
    const intermediateColumns = legacyStorage ? "" : '<th scope="col">电量 MWh</th><th scope="col">现货均价 元/MWh</th><th scope="col">捕获价 元/MWh</th>';
    detail.innerHTML = `<p class="result-version-trace">${[name, trace.versionId || "旧版未编号", dateLabel(trace.generatedAt), trace.priceSourceLabel, trace.runId].filter(Boolean).map(escapeHtml).join(" · ")}</p>
      ${note ? `<p class="hint">${note}</p>` : ""}
      ${rows ? `<div class="table-scroll"><table aria-label="历史版本年度结果"><thead><tr><th scope="col">年份</th>${intermediateColumns}<th scope="col">综合价 元/MWh</th><th scope="col">全口径收入 ${legacyStorage ? "元" : "万元"}</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
      <div class="actions-row">${annualReady ? '<button class="ghost-button" type="button" data-history-annual>导出历史年度 CSV</button>' : ""}${hourlyReady ? '<button class="ghost-button" type="button" data-history-hourly>导出历史首年8760小时 CSV</button>' : ""}</div>`;
    const settings = { includeSource: true, historical: true };
    const archivedScenario = { ...scenario, name };
    const annualButton = detail.querySelector("[data-history-annual]");
    const hourlyButton = detail.querySelector("[data-history-hourly]");
    if (annualButton) annualButton.onclick = () => downloadCsv(exports.buildAnnualResultExportFilename(project, archivedScenario, result, settings), exports.buildAnnualResultExportRows(result, settings));
    if (hourlyButton) hourlyButton.onclick = () => downloadCsv(exports.buildHourlyResultExportFilename(project, archivedScenario, result, settings), exports.buildHourlyResultExportRows(result, settings));
  }

  function render(input = {}) {
    const { documentRef, project, scenario, result, view, downloadCsv = () => {} } = input;
    const query = (selector) => documentRef?.querySelector?.(selector);
    renderCurrentTrace(query("#result-current-trace"), project, view?.state === "ready" ? result : null, view?.isHistorical);
    const panel = query("#result-history-panel");
    const content = query("#result-history-content");
    const count = query("#result-history-count");
    if (!panel || !content || !count) return;
    const entries = collectArchiveEntries(project, scenario?.id);
    if (view?.includeLastSaved && result?.annualRows?.length && !entries.some((entry) =>
      entry.result === result || (result.resultVersion?.id && entry.result.resultVersion?.id === result.resultVersion.id))) {
      entries.unshift({ key: "last-saved", result });
    }
    const contextKey = JSON.stringify([project?.id, scenario?.id]);
    const sameContext = panel.dataset.context === contextKey;
    const previous = sameContext && panel.dataset.selectedArchive;
    panel.dataset.context = contextKey;
    if (!sameContext) { panel.open = false; delete panel.dataset.selectedArchive; }
    panel.hidden = !entries.length;
    count.textContent = `${entries.length} 份`;
    if (!entries.length) { content.innerHTML = ""; panel.ontoggle = null; return; }
    const options = entries.map(({ key, result: archived, legacyStorage }, index) => {
      const trace = versions.describeResult(archived);
      const label = legacyStorage ? `历史配储原测算 · ${trace.versionId || dateLabel(trace.generatedAt)}`
        : `${dateLabel(trace.generatedAt)} · ${trace.versionId || `旧版存档 ${index + 1}`}`;
      return `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`;
    });
    content.innerHTML = `<label class="result-history-picker"><span>查看版本</span><select>${options.join("")}</select></label><div data-history-detail></div>`;
    const select = content.querySelector("select");
    const detail = content.querySelector("[data-history-detail]");
    if (!select || !detail) return;
    if (entries.some(({ key }) => key === previous)) select.value = previous;
    const refresh = () => {
      const entry = entries.find(({ key }) => key === select.value);
      if (panel.open && entry) renderArchiveDetail(detail, project, scenario, entry, downloadCsv);
    };
    select.onchange = () => { panel.dataset.selectedArchive = select.value; refresh(); };
    panel.ontoggle = refresh;
    refresh();
  }

  return Object.freeze({ render });
});
