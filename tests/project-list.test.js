"use strict";

const assert = require("node:assert/strict");
const {
  buildProjectListItem,
  buildProjectCardHtml,
  buildProjectListHtml,
  buildProjectListView,
  createProjectListActionHandlers,
  bindProjectListActions
} = require("../src/ui/project-list");

class FakeButton {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.handlers = {};
  }

  addEventListener(name, handler) {
    this.handlers[name] = handler;
  }

  click() {
    this.handlers.click?.();
  }
}

class FakeRoot {
  constructor(map) {
    this.map = map;
  }

  querySelectorAll(selector) {
    return this.map[selector] || [];
  }
}

const workflowPages = ["create-page", "energy-page", "result-page"];
const pageTitles = {
  "create-page": "项目创建",
  "energy-page": "电量配置",
  "result-page": "结果总览"
};
const statusText = (state) => ({
  completed: "已完成",
  stale: "需更新",
  not_started: "未开始"
})[state] || state;

const project = {
  id: "p<1>",
  name: "江苏<海上>风电",
  period: "2026-2050",
  metaLine: "江苏 / 风电 / 海上 / 配储",
  runtimeLine: "场景：基准 | 电价版本：1.0.0",
  statuses: {
    "create-page": "completed",
    "energy-page": "stale"
  }
};

const projectListItem = buildProjectListItem({
  id: "p1",
  name: "基准项目"
}, {
  activeRun: { algorithmVersion: "run-v1" },
  scenario: { name: "基准场景" },
  statuses: { "create-page": "completed" },
  createReady: true,
  forecastPeriod: "2026-2050",
  provinceName: "江苏",
  assetTypeText: "风电",
  siteTypeText: "海上",
  storageText: "配储"
});
assert.deepEqual(projectListItem, {
  id: "p1",
  name: "基准项目",
  period: "2026-2050",
  metaLine: "江苏 / 风电 / 海上 / 配储",
  runtimeLine: "场景：基准场景 | 电价版本：run-v1",
  statuses: { "create-page": "completed" }
});

const draftListItem = buildProjectListItem({ id: "draft", name: "草稿" });
assert.equal(draftListItem.period, "待创建");
assert.equal(draftListItem.metaLine, "基础信息待填写 / 风光类型待选 / 陆海类型待选");
assert.equal(draftListItem.runtimeLine, "场景：未配置 | 电价版本：未生成");

const card = buildProjectCardHtml(project, {}, { workflowPages, pageTitles, statusText });
assert.match(card, /江苏&lt;海上&gt;风电/);
assert.match(card, /data-open-project="p&lt;1&gt;"/);
assert.match(card, /复制项目/);
assert.match(card, /删除项目/);
assert.match(card, /流程进度：1\/3 已完成/);
assert.match(card, /电量配置：需更新/);
assert.match(card, /结果总览：未开始/);

const noDuplicateCard = buildProjectCardHtml(project, { showDuplicate: false }, { workflowPages, pageTitles, statusText });
assert.doesNotMatch(noDuplicateCard, /复制项目/);

const emptyList = buildProjectListHtml({ workflowPages, pageTitles, statusText });
assert.match(emptyList, /当前暂无待建项目/);
assert.match(emptyList, /当前账号暂无历史项目/);
assert.match(emptyList, /data-create-new-project/);

const populatedList = buildProjectListHtml({
  newProjects: [project],
  historyProjects: [{ ...project, id: "p2", name: "历史项目" }],
  workflowPages,
  pageTitles,
  statusText
});
assert.match(populatedList, /新建项目工作区/);
assert.match(populatedList, /历史项目工作区/);
assert.equal((populatedList.match(/复制项目/g) || []).length, 1);
assert.equal((populatedList.match(/进入项目/g) || []).length, 2);

const listView = buildProjectListView({
  projects: [
    { id: "new", name: "新建", workspaceBucket: "new" },
    { id: "history", name: "历史", workspaceBucket: "history" }
  ],
  isNewWorkspaceProject: (item) => item.workspaceBucket === "new",
  buildProjectListItemView: (item) => ({
    id: item.id,
    name: item.name,
    period: "2026-2050",
    metaLine: "江苏 / 风电 / 海上 / 配储",
    runtimeLine: "场景：基准 | 电价版本：v1",
    statuses: {}
  }),
  workflowPages,
  pageTitles,
  statusText
});
assert.equal(listView.historyCount, 1);
assert.match(listView.html, /新建项目工作区/);
assert.match(listView.html, /历史项目工作区/);

const createButton = new FakeButton();
const openButton = new FakeButton({ openProject: "p1" });
const duplicateButton = new FakeButton({ duplicateProject: "p2" });
const deleteButton = new FakeButton({ deleteProject: "p3" });
const actionCalls = [];
bindProjectListActions({
  root: new FakeRoot({
    "[data-create-new-project]": [createButton],
    "[data-open-project]": [openButton],
    "[data-duplicate-project]": [duplicateButton],
    "[data-delete-project]": [deleteButton]
  }),
  handlers: {
    createProject: () => actionCalls.push("create"),
    openProject: (id) => actionCalls.push(`open:${id}`),
    duplicateProject: (id) => actionCalls.push(`duplicate:${id}`),
    deleteProject: (id) => actionCalls.push(`delete:${id}`)
  }
});
createButton.click();
openButton.click();
duplicateButton.click();
deleteButton.click();
assert.deepEqual(actionCalls, ["create", "open:p1", "duplicate:p2", "delete:p3"]);

const handlerCalls = [];
const handlerState = {
  auth: { account: "acct" },
  activeProjectId: "p1",
  projects: [
    { id: "p1", name: "项目一" },
    { id: "p2", name: "项目二" }
  ]
};
const handlers = createProjectListActionHandlers({
  appState: handlerState,
  windowRef: { confirm: () => true },
  createEmptyWorkspaceProject: () => ({ id: "new" }),
  setTopMeta: (message) => handlerCalls.push(`top:${message}`),
  renderAll: () => handlerCalls.push("render"),
  setActivePage: (pageId) => handlerCalls.push(`page:${pageId}`),
  cloneData: (value) => ({ ...value }),
  makeId: () => "proj-copy",
  resolveUniqueProjectName: (name) => `${name}-2`,
  projectBelongsToCurrentAccount: (project) => project.id !== "blocked",
  getProjectsForCurrentAccount: () => handlerState.projects
});
handlers.createProject();
handlers.openProject("p2");
handlers.duplicateProject("p2");
assert.equal(handlerState.projects[0].id, "proj-copy");
assert.equal(handlerState.projects[0].ownerAccount, "acct");
assert.equal(handlerState.projects[0].name, "项目二-副本-2");
handlers.deleteProject("p1");
assert.equal(handlerState.projects.some((item) => item.id === "p1"), false);
assert.deepEqual(handlerCalls, [
  "top:新项目已生成，可进入项目继续配置。",
  "render",
  "page:create-page",
  "render",
  "render"
]);

console.log("project list tests passed");
