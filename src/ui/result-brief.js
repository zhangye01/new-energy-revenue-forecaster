"use strict";

(function (root, factory) {
  const commonJs = typeof module !== "undefined" && module.exports;
  const api = factory(commonJs ? require("../domain/app-utils") : root.NE_APP_UTILS);
  if (commonJs) module.exports = api;
  root.NE_RESULT_BRIEF_VIEW = api;
  if (root.window && root.window !== root) root.window.NE_RESULT_BRIEF_VIEW = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function ({ escapeHtml }) {
  const escapeAttribute = (value) => escapeHtml(value).replaceAll('"', "&quot;");

  function definitionList(items, className) {
    if (!items?.length) return "";
    return `<dl class="${className}">${items.map(({ label, value }) =>
      `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`;
  }

  function numberedTitle(item, kind) {
    const number = Number.isInteger(item.number) ? `<span class="result-brief-object-number">${kind} ${item.number}</span> ` : "";
    return `${number}${escapeHtml(item.title)}`;
  }

  function figureHtml(figure) {
    const key = escapeAttribute(figure.key);
    return `<figure class="result-brief-block result-brief-figure">
      <figcaption id="result-brief-figure-${key}">
        <h4>${numberedTitle(figure, "图")}</h4>
        ${figure.caption ? `<p class="result-brief-note">${escapeHtml(figure.caption)}</p>` : ""}
      </figcaption>
      <div class="result-brief-chart" data-brief-chart="${key}" role="img" aria-labelledby="result-brief-figure-${key}"></div>
    </figure>`;
  }

  function tableHtml(table) {
    const key = escapeAttribute(table.key);
    const headingId = `result-brief-table-${key}`;
    const headers = table.headers.map((text) => `<th scope="col">${escapeHtml(text)}</th>`).join("");
    const rows = table.rows.map(([label, ...values]) => `<tr><th scope="row">${escapeHtml(label)}</th>${values.map((value) =>
      `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
    return `<section class="result-brief-block">
      <h4 id="${headingId}">${numberedTitle(table, "表")}</h4>
      <div class="table-scroll result-brief-table" data-brief-table="${key}">
        <table aria-labelledby="${headingId}"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
      </div>
      ${table.note ? `<p class="result-brief-note">${escapeHtml(table.note)}</p>` : ""}
    </section>`;
  }

  function chaptersHtml(brief) {
    const figures = new Map(brief.figures.map((figure) => [figure.key, figure]));
    const tables = new Map(brief.tables.map((table) => [table.key, table]));
    if (!brief.sections?.length) return [...figures.values()].map(figureHtml).join("") + [...tables.values()].map(tableHtml).join("");
    return brief.sections.map((section) => {
      const headingId = `result-brief-chapter-${escapeAttribute(section.key)}`;
      const intro = (section.intro || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
      const blocks = (section.blocks || []).map(({ kind, key }) => {
        const entries = kind === "figure" ? figures : tables;
        const item = entries.get(key);
        if (!item) return "";
        entries.delete(key);
        return (kind === "figure" ? figureHtml : tableHtml)(item);
      }).join("");
      return `<section class="result-brief-section result-brief-chapter" aria-labelledby="${headingId}">
        <h3 id="${headingId}">${escapeHtml(section.title)}</h3>
        ${intro ? `<div class="result-brief-intro">${intro}</div>` : ""}
        ${blocks}
      </section>`;
    }).join("");
  }

  function buildHtml(brief, message) {
    if (!brief) {
      return `<p class="result-brief-empty">${escapeHtml(message || "暂无测算简报。请在“收益参数补充与细化”发起基准测算。")}</p>`;
    }
    return `<section class="result-brief-section result-brief-overview" aria-labelledby="result-brief-project-title">
        <h3 id="result-brief-project-title">项目概况</h3>
        <p class="result-brief-project-name">${escapeHtml(brief.projectName)}</p>
        ${definitionList(brief.context, "result-brief-context")}
      </section>
      <section class="result-brief-section result-brief-executive" aria-labelledby="result-brief-summary-title">
        <h3 id="result-brief-summary-title">核心结论</h3>
        <p class="result-brief-summary">${escapeHtml(brief.summary)}</p>
        ${definitionList(brief.metrics, "result-brief-metrics")}
        ${definitionList(brief.findings, "result-brief-findings")}
      </section>
      ${chaptersHtml(brief)}`;
  }

  function render({ root, brief, message } = {}) {
    if (root) root.innerHTML = buildHtml(brief, message);
  }

  return Object.freeze({ render });
});
