"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_PROJECT_LIST_VIEW = api;
  if (root.window && root.window !== root) {
    root.window.NE_PROJECT_LIST_VIEW = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function buildStepStatusHtml(project, workflowPages, pageTitles, statusText) {
    const statusMap = project.statuses || {};
    return workflowPages.map((pageId) => {
      const state = statusMap[pageId] || "not_started";
      return `<span class="project-step-chip ${escapeHtml(state)}">${escapeHtml(pageTitles[pageId] || pageId)}：${escapeHtml(statusText(state))}</span>`;
    }).join("");
  }

  function buildProjectCardHtml(project, options = {}, workflow = {}) {
    const {
      showDuplicate = true,
      showDelete = true,
      useNewStyle = false
    } = options;
    const workflowPages = workflow.workflowPages || [];
    const pageTitles = workflow.pageTitles || {};
    const statusText = workflow.statusText || ((state) => state);
    const completedCount = workflowPages.filter((pageId) => project.statuses?.[pageId] === "completed").length;
    const duplicateButton = showDuplicate
      ? `<button class="ghost-button" data-duplicate-project="${escapeHtml(project.id)}">复制项目</button>`
      : "";
    const deleteButton = showDelete
      ? `<button class="ghost-button danger-ghost" data-delete-project="${escapeHtml(project.id)}">删除项目</button>`
      : "";
    return `
      <article class="project-item${useNewStyle ? " project-item-new" : ""}">
        <div class="head">
          <strong>${escapeHtml(project.name)}</strong>
          <span class="hint">${escapeHtml(project.period)}</span>
        </div>
        <div class="meta">${escapeHtml(project.metaLine)}</div>
        <div class="meta">${escapeHtml(project.runtimeLine)}</div>
        <div class="project-progress">
          <div class="project-progress-head">流程进度：${completedCount}/${workflowPages.length} 已完成</div>
          <div class="project-step-grid">${buildStepStatusHtml(project, workflowPages, pageTitles, statusText)}</div>
        </div>
        <div class="project-actions">
          <button class="ghost-button" data-open-project="${escapeHtml(project.id)}">进入项目</button>
          ${duplicateButton}
          ${deleteButton}
        </div>
      </article>
    `;
  }

  function buildWorkspaceHtml(title, innerHtml, actionHtml = "") {
    return `
    <section class="project-workspace">
      <div class="project-workspace-head">
        <h4 class="project-workspace-title">${escapeHtml(title)}</h4>
        ${actionHtml}
      </div>
      <div class="project-list">${innerHtml}</div>
    </section>
  `;
  }

  function buildProjectListHtml(input = {}) {
    const {
      newProjects = [],
      historyProjects = [],
      workflowPages = [],
      pageTitles = {},
      statusText = (state) => state
    } = input;
    const workflow = { workflowPages, pageTitles, statusText };
    const newWorkspaceHtml = newProjects.length
      ? newProjects.map((project) => buildProjectCardHtml(project, {
        showDuplicate: false,
        showDelete: true
      }, workflow)).join("")
      : '<div class="project-empty">当前暂无待建项目，请点击“新建项目”。</div>';
    const historyHtml = historyProjects.length
      ? historyProjects.map((project) => buildProjectCardHtml(project, {
        showDuplicate: true,
        showDelete: true
      }, workflow)).join("")
      : '<div class="project-empty">当前账号暂无历史项目。</div>';

    return [
      buildWorkspaceHtml(
        "新建项目工作区",
        newWorkspaceHtml,
        '<button class="ghost-button" type="button" data-create-new-project>新建项目</button>'
      ),
      buildWorkspaceHtml("历史项目工作区", historyHtml)
    ].join("");
  }

  function bindProjectListActions(input = {}) {
    const {
      root = null,
      handlers = {}
    } = input;
    if (!root || typeof root.querySelectorAll !== "function") return;

    root.querySelectorAll("[data-create-new-project]").forEach((button) => {
      button.addEventListener("click", () => handlers.createProject?.());
    });
    root.querySelectorAll("[data-open-project]").forEach((button) => {
      button.addEventListener("click", () => handlers.openProject?.(button.dataset.openProject));
    });
    root.querySelectorAll("[data-duplicate-project]").forEach((button) => {
      button.addEventListener("click", () => handlers.duplicateProject?.(button.dataset.duplicateProject));
    });
    root.querySelectorAll("[data-delete-project]").forEach((button) => {
      button.addEventListener("click", () => handlers.deleteProject?.(button.dataset.deleteProject));
    });
  }

  return Object.freeze({
    buildProjectCardHtml,
    buildProjectListHtml,
    bindProjectListActions
  });
});
