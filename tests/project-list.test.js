"use strict";

const assert = require("node:assert/strict");
const {
  buildProjectCardHtml,
  buildProjectListHtml
} = require("../src/ui/project-list");

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

console.log("project list tests passed");
