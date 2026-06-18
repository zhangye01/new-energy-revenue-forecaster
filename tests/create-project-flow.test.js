"use strict";

const assert = require("node:assert/strict");
const {
  createCreateProjectFormFlowContext,
  resetEnergyTemplateExports,
  saveCreateProjectFromForm,
  updateExistingProjectFromForm
} = require("../src/ui/create-project-flow");

const context = createCreateProjectFormFlowContext({
  refs: { name: "refs" },
  documentRef: { nodeType: 9 },
  appState: { projects: [] },
  projectModel: { name: "projectModel" },
  energyWorkspace: { name: "energyWorkspace" },
  provinceKeys: new Set(["jiangsu"]),
  assetTypes: new Set(["wind"]),
  siteTypes: new Set(["offshore"]),
  actions: { setActivePage: () => {} }
});
assert.equal(context.refs.name, "refs");
assert.equal(context.modules.projectModel.name, "projectModel");
assert.equal(context.modules.energyWorkspace.name, "energyWorkspace");
assert.equal(context.sets.provinceKeys.has("jiangsu"), true);
assert.equal(typeof context.actions.setActivePage, "function");

assert.deepEqual(resetEnergyTemplateExports({
  hourly_8760: "a",
  annual_hours: "b",
  typical_curve_8760: "c",
  province_typical_curve: "d"
}), {
  hourly_8760: "",
  annual_hours: "",
  typical_curve_8760: "",
  province_typical_curve: ""
});

function createModules(formState) {
  return {
    energyWorkspace: {
      readCreateProjectFormRawInput(input) {
        assert.equal(Boolean(input.refs), true);
        return { name: "raw" };
      }
    },
    projectModel: {
      buildCreateProjectFormInput(rawInput) {
        assert.deepEqual(rawInput, { name: "raw" });
        return formState;
      },
      createProjectRecordWithBaseline(projectInput, options) {
        const project = {
          id: options.id,
          name: projectInput.name,
          province: projectInput.province,
          energyMode: projectInput.energyMode,
          ownerAccount: options.ownerAccount,
          workspaceBucket: options.workspaceBucket,
          createdAt: options.nowIso,
          statuses: options.statuses,
          historySpotImport: options.historySpotImport,
          spotMarketConfig: options.spotMarketConfig,
          scenarios: [],
          activeScenarioId: null
        };
        const scenario = options.createBaselineScenario(project);
        project.scenarios.push(scenario);
        project.activeScenarioId = scenario.id;
        return project;
      },
      hasProjectBaseInputChanged(project, projectInput) {
        return project.province !== projectInput.province;
      },
      applyCreateProjectInput(project, projectInput) {
        Object.assign(project, projectInput);
      }
    }
  };
}

function createActions(calls, overrides = {}) {
  return {
    getActiveProject: () => null,
    setTopMeta: (message) => calls.push(`top:${message}`),
    setCreateSaveMessage: (message, tone) => calls.push(`message:${tone}:${message}`),
    resolveUniqueProjectName: (name) => `${name}-2`,
    makeId: (prefix) => `${prefix}-1`,
    statusMapTemplate: () => ({ "create-page": "not_started" }),
    createEmptyHistorySpotImport: () => ({ source: "empty" }),
    createDefaultSpotMarketConfig: () => ({ market: "demo" }),
    isProjectCreateCompleted: () => true,
    createBaselineScenario: () => ({ id: "scenario-1" }),
    syncProjectProvinceScopedState: (project) => calls.push(`sync-province:${project.id}`),
    moveProjectToHistoryWorkspaceIfReady: (project) => {
      calls.push(`move:${project.id}`);
      return false;
    },
    setCreateFormSyncedProjectId: (projectId) => calls.push(`synced:${projectId}`),
    setActivePage: (page) => calls.push(`page:${page}`),
    scrollCreateWorkspaceToBottom: () => calls.push("scroll"),
    ...overrides
  };
}

const errorCalls = [];
assert.equal(saveCreateProjectFromForm({
  refs: {},
  appState: { auth: {}, projects: [] },
  modules: createModules({
    input: {},
    error: {
      topMeta: "项目名称不能为空",
      message: "保存失败：请先填写项目名称。"
    }
  }),
  actions: createActions(errorCalls)
}), null);
assert.deepEqual(errorCalls, [
  "top:项目名称不能为空",
  "message:warn:保存失败：请先填写项目名称。"
]);

const newCalls = [];
const newAppState = { auth: { account: "demo" }, projects: [] };
const newProject = saveCreateProjectFromForm({
  options: { autoUniqueName: true, targetPage: "create-page" },
  refs: {},
  appState: newAppState,
  modules: createModules({
    input: {
      name: "江苏项目",
      province: "jiangsu",
      energyMode: "annual_hours"
    },
    error: null
  }),
  actions: createActions(newCalls)
});
assert.equal(newProject.name, "江苏项目-2");
assert.equal(newProject.ownerAccount, "demo");
assert.equal(newProject.activeScenarioId, "scenario-1");
assert.equal(newAppState.projects[0], newProject);
assert.equal(newAppState.activeProjectId, "proj-1");
assert.deepEqual(newCalls, [
  "synced:proj-1",
  "sync-province:proj-1",
  "move:proj-1",
  "message:success:已创建新项目：江苏项目-2。",
  "page:create-page",
  "scroll"
]);

const existingProject = {
  id: "proj-old",
  name: "旧项目",
  province: "jiangsu",
  statuses: {
    "create-page": "completed",
    "energy-page": "completed",
    "history-page": "completed"
  },
  energyData: { mode: "annual_hours" },
  energyTemplateExports: {
    hourly_8760: "old",
    annual_hours: "old",
    typical_curve_8760: "old",
    province_typical_curve: "old"
  }
};
const existingCalls = [];
const updated = updateExistingProjectFromForm({
  project: existingProject,
  projectInput: {
    name: "新项目",
    province: "shandong",
    energyMode: "province_typical_curve"
  },
  targetPage: "energy-page",
  appState: { projects: [] },
  modules: createModules({ input: {}, error: null }),
  actions: createActions(existingCalls, {
    syncProjectProvinceDefaultsToBaseline: () => false,
    shouldAutoSyncProvinceDefaults: () => true,
    createEmptyEnergyDataState: (mode) => ({ mode }),
    clearHistoryAnalysisCacheForProject: (projectId) => existingCalls.push(`clear-history:${projectId}`),
    ensureProjectEnergyTemplateExports: (project) => project.energyTemplateExports,
    markDownstreamStale: (project, page) => existingCalls.push(`stale:${project.id}:${page}`),
    getProvinceName: (province) => `省份-${province}`,
    createEmptyHistorySpotImport: () => ({ source: "empty" })
  })
});
assert.equal(updated, existingProject);
assert.equal(existingProject.name, "新项目");
assert.deepEqual(existingProject.energyData, { mode: "province_typical_curve" });
assert.deepEqual(existingProject.historySpotImport, { source: "empty" });
assert.equal(existingProject.statuses["energy-page"], "in_progress");
assert.equal(existingProject.statuses["history-page"], "not_started");
assert.equal(existingProject.energyTemplateExports.hourly_8760, "");
assert.ok(existingCalls.includes("clear-history:proj-old"));
assert.ok(existingCalls.includes("stale:proj-old:energy-page"));
assert.ok(existingCalls.includes("top:当前项目已更新，请在步骤2重新导入电量。"));
assert.ok(existingCalls.includes("page:energy-page"));

console.log("create project flow tests passed");
