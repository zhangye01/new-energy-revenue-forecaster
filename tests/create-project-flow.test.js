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
  supplyDemand: { config: { startYear: 2028, forecastYears: 20 }, inputFingerprint: "original-supply" },
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
    ensureProjectEnergyTemplateExports: (project) => project.energyTemplateExports,
    markDownstreamStale: (project, page) => existingCalls.push(`stale:${project.id}:${page}`),
    getProvinceName: (province) => `省份-${province}`,
    createEmptyHistorySpotImport: () => ({ source: "empty" })
  })
});
assert.equal(updated, existingProject);
assert.equal(existingProject.name, "新项目");
assert.deepEqual(existingProject.supplyDemand, {
  config: { startYear: 2028, forecastYears: 20 }, inputFingerprint: "original-supply", requiresProvinceReview: true
});
assert.deepEqual(existingProject.energyData, { mode: "province_typical_curve" });
assert.deepEqual(existingProject.historySpotImport, { source: "empty" });
assert.equal(existingProject.statuses["energy-page"], "in_progress");
assert.equal(existingProject.statuses["history-page"], "not_started");
assert.equal(existingProject.energyTemplateExports.hourly_8760, "");
assert.ok(existingCalls.includes("stale:proj-old:energy-page"));
assert.ok(existingCalls.includes("top:当前项目已更新，请在步骤2重新导入电量。"));
assert.ok(existingCalls.includes("page:energy-page"));

const realProjectModel = require("../src/domain/project-model");
const workflowStatus = require("../src/domain/workflow-status");
for (const changes of [
  { hasStorage: true, storagePowerMw: 30, storageDurationH: 2 },
  { hasStorage: false, storagePowerMw: null, storageDurationH: null },
  { storagePowerMw: 40 },
  { storageDurationH: 4 },
  { storageRoundTripEfficiency: 0.84 },
  { storageNote: "仅修改配储备注" },
  { note: "仅修改项目备注" }
]) {
  const preserved = {
    id: "preserved-project", name: "保留历史", province: "jiangsu", assetType: "wind", siteType: "onshore",
    capacityMw: 100, startYear: 2028, forecastYears: 2, energyMode: "annual_hours",
    hasStorage: true, storagePowerMw: 20, storageDurationH: 2, storageNote: "旧备注", note: "",
    statuses: Object.fromEntries(workflowStatus.DEFAULT_WORKFLOW_PAGES.map((key) => [key, "completed"])),
    energyData: { mode: "annual_hours", annualInputByYear: { 2028: 2200.123456789, 2029: 2180 }, hourlyByYear: { 2028: [0, 0.25] } },
    historySpotImport: { sourceType: "csv", dataset: { values: [-32, 100.123456789] } },
    energyTemplateExports: { annual_hours: "old-time" },
    scenarios: [{ id: "baseline", config: { storageArbitragePrice: 7, feeManualValuesByYear: { 2028: { otherFee: 13 }, 2050: { otherFee: null } } }, confirmedConfig: {} }],
    roughPrice: { snapshots: [{ id: "old-rough", value: 321.123456789 }] },
    resultsByScenario: { baseline: { value: 321.5 } },
    priceRuns: [{ id: "legacy-run", pricesByYear: { 2028: [-5, 300] } }], activeRunId: "legacy-run"
  };
  if (changes.hasStorage === true) Object.assign(preserved, { hasStorage: false, storagePowerMw: null, storageDurationH: null });
  const retainedKeys = ["energyData", "historySpotImport", "energyTemplateExports", "scenarios", "roughPrice", "resultsByScenario", "priceRuns", "activeRunId"];
  const before = Object.fromEntries(retainedKeys.map((key) => [key, JSON.stringify(preserved[key])]));
  const statusesBefore = JSON.stringify(preserved.statuses);
  const storageEdited = ["hasStorage", "storagePowerMw", "storageDurationH"].some((key) => Object.hasOwn(changes, key));
  updateExistingProjectFromForm({
    project: preserved, projectInput: { ...preserved, ...changes }, modules: { projectModel: realProjectModel },
    actions: createActions([], {
      syncProjectProvinceDefaultsToBaseline: () => { throw new Error("配储或备注编辑不得覆盖原收益参数"); },
      ensureProjectEnergyDataState: () => { throw new Error("配储或备注编辑不得重写原电量"); },
      ensureProjectEnergyTemplateExports: (target) => target.energyTemplateExports,
      markDownstreamStale: (target, page) => { target.statuses = workflowStatus.markDownstreamStale(target.statuses, page); }
    })
  });
  retainedKeys.forEach((key) => assert.equal(JSON.stringify(preserved[key]), before[key], `${JSON.stringify(changes)}须逐值保留${key}`));
  assert.equal(preserved.statuses["energy-page"], "completed");
  assert.equal(preserved.statuses["history-page"], "completed");
  assert.equal(preserved.statuses["forecast-page"], "completed", "市场价版本保留，旧配储价源是否可计算由运行前校验决定");
  if (storageEdited) {
    for (const page of ["rough-page", "scenario-page", "results-page", "compare-page"]) assert.equal(preserved.statuses[page], "stale");
  } else if (changes.storageRoundTripEfficiency) {
    assert.equal(preserved.storageRoundTripEfficiency, 0.84);
    assert.equal(preserved.statuses["rough-page"], "completed");
    for (const page of ["scenario-page", "results-page", "compare-page"]) assert.equal(preserved.statuses[page], "stale");
  } else assert.equal(JSON.stringify(preserved.statuses), statusesBefore, "备注编辑不触发测算失效");
}

console.log("create project flow tests passed");
