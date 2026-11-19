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

  function figureHtml(figure, heading = "h4") {
    const key = escapeAttribute(figure.key);
    return `<figure class="result-brief-block result-brief-figure">
      <figcaption id="result-brief-figure-${key}">
        <${heading} class="result-brief-block-title">${numberedTitle(figure, "图")}</${heading}>
      </figcaption>
      <div class="result-brief-chart" data-brief-chart="${key}" role="img" aria-labelledby="result-brief-figure-${key}"></div>
      ${figure.caption ? `<p class="result-brief-note">${escapeHtml(figure.caption)}</p>` : ""}
    </figure>`;
  }

  function tableHtml(table, heading = "h4") {
    const key = escapeAttribute(table.key);
    const headingId = `result-brief-table-${key}`;
    const headers = table.headers.map((text) => `<th scope="col">${escapeHtml(text)}</th>`).join("");
    const rows = table.rows.map(([label, ...values]) => `<tr><th scope="row">${escapeHtml(label)}</th>${values.map((value) =>
      `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
    return `<section class="result-brief-block">
      <${heading} class="result-brief-block-title" id="${headingId}">${numberedTitle(table, "表")}</${heading}>
      <div class="table-scroll result-brief-table" data-brief-table="${key}">
        <table aria-labelledby="${headingId}"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
      </div>
      ${table.note ? `<p class="result-brief-note">${escapeHtml(table.note)}</p>` : ""}
    </section>`;
  }

  function chapterBlocks({ blocks = [], appendix }, figures, tables) {
    const heading = appendix ? "h5" : "h4";
    const content = [];
    for (const { kind, key } of blocks) {
      const isFigure = kind === "figure";
      const entries = isFigure ? figures : tables;
      const item = entries.get(key);
      if (!item) continue;
      entries.delete(key);
      content.push({ chart: isFigure && ["trend", "annual", "columns", "lines"].includes(item.kind),
        html: (isFigure ? figureHtml : tableHtml)(item, heading) });
    }
    const layout = [];
    for (let index = 0; index < content.length; index += 1) {
      const item = content[index];
      if (item.chart && content[index + 1]?.chart) {
        layout.push(`<div class="result-brief-figure-pair">${item.html}${content[index + 1].html}</div>`);
        index += 1;
      } else layout.push(item.html);
    }
    return layout.join("");
  }

  function chaptersHtml(brief) {
    const figures = new Map(brief.figures.map((figure) => [figure.key, figure]));
    const tables = new Map(brief.tables.map((table) => [table.key, table]));
    if (!brief.sections?.length) return [...figures.values()].map((figure) => figureHtml(figure)).join("") +
      [...tables.values()].map((table) => tableHtml(table)).join("");
    const chapters = brief.sections.map((section) => {
      const headingId = `result-brief-chapter-${escapeAttribute(section.key)}`;
      const heading = section.appendix ? "h4" : "h3";
      const intro = (section.intro || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
      const blocks = chapterBlocks(section, figures, tables);
      return `<section class="result-brief-section result-brief-chapter" aria-labelledby="${headingId}">
        <${heading} id="${headingId}" class="result-brief-chapter-title">${escapeHtml(section.title)}</${heading}>
        ${intro ? `<div class="result-brief-intro">${intro}</div>` : ""}
        ${blocks}
      </section>`;
    });
    const appendixIndex = brief.sections.findIndex(({ appendix }) => appendix);
    if (appendixIndex < 0) return chapters.join("");
    return `${chapters.slice(0, appendixIndex).join("")}
      <section class="result-brief-appendix" aria-labelledby="result-brief-appendix-title">
        <h3 id="result-brief-appendix-title">附录</h3>
        ${chapters.slice(appendixIndex).join("")}
      </section>`;
  }

  function buildHtml(brief, message) {
    if (!brief) {
      return `<p class="result-brief-empty">${escapeHtml(message || "暂无测算简报。请在“收益参数补充与细化”发起基准测算。")}</p>`;
    }
    return `<section class="result-brief-section result-brief-overview" aria-labelledby="result-brief-project-title">
        <h3 id="result-brief-project-title">项目概况</h3>
        <p class="result-brief-project-name">${escapeHtml(brief.projectName)}</p>
        ${brief.syntheticCaseLabel ? `<p class="result-brief-note" data-brief-synthetic-case>${escapeHtml(brief.syntheticCaseLabel)}</p>` : ""}
        ${definitionList(brief.context, "result-brief-context")}
      </section>
      <section class="result-brief-section result-brief-executive" aria-labelledby="result-brief-summary-title">
        <h3 id="result-brief-summary-title">核心结论</h3>
        ${brief.summary ? `<p class="result-brief-summary">${escapeHtml(brief.summary)}</p>` : ""}
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
