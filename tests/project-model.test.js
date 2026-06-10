"use strict";

const assert = require("node:assert/strict");
const {
  normalizeEnergyMode,
  buildCreateProjectFormInput,
  normalizeCreateProjectFormInput,
  validateCreateProjectFormInput,
  hasProjectBaseInputChanged,
  applyCreateProjectInput,
  createProjectRecord,
  createProjectRecordWithBaseline,
  createMockHistoryProject,
  createEmptyWorkspaceProject,
  createEmptyEnergyDataState,
  createEmptyEnergyTemplateExports,
  sanitizeProjectBase,
  sanitizePriceRuns,
  resolveActiveRunId,
  sanitizeActivationLogs
} = require("../src/domain/project-model");

const options = {
  currentYear: 2026,
  nowIso: "2026-06-09T00:00:00.000Z",
  provinceKeys: ["jiangsu", "shandong"],
  assetTypes: ["wind", "photovoltaic"],
  siteTypes: ["onshore", "offshore"],
  makeId: (prefix) => `${prefix}-test`,
  resolveUniqueName: (name) => `${name}2`
};

assert.equal(normalizeEnergyMode("hourly_8760"), "hourly_8760");
assert.equal(normalizeEnergyMode("bad"), "annual_hours");
assert.deepEqual(createEmptyEnergyDataState("bad"), {
  mode: "annual_hours",
  annualInputByYear: {},
  typicalCurveSource: "",
  typicalCurveProfile: [],
  hourlyByYear: {},
  annualSummary: {}
});
assert.deepEqual(createEmptyEnergyTemplateExports(), {
  hourly_8760: "",
  annual_hours: "",
  typical_curve_8760: "",
  province_typical_curve: ""
});

const createInput = normalizeCreateProjectFormInput({
  name: " 江苏海上风电 ",
  province: "jiangsu",
  assetType: "wind",
  siteType: "offshore",
  hasStorage: "yes",
  storagePower: "64",
  storageDuration: "2",
  storageNote: " 两小时 ",
  capacity: "200",
  startYear: "2026.9",
  forecastYears: "40",
  energyMode: "province_typical_curve",
  note: " 备注 "
}, options);
assert.equal(createInput.name, "江苏海上风电");
assert.equal(createInput.hasStorage, true);
assert.equal(createInput.storageChoice, "yes");
assert.equal(createInput.storagePowerMw, 64);
assert.equal(createInput.storageDurationH, 2);
assert.equal(createInput.storageNote, "两小时");
assert.equal(createInput.capacityMw, 200);
assert.equal(createInput.startYear, 2026);
assert.equal(createInput.forecastYears, 30);
assert.equal(createInput.energyMode, "province_typical_curve");
assert.equal(createInput.note, "备注");
assert.equal(validateCreateProjectFormInput(createInput, {
  provinceKeys: new Set(["jiangsu"]),
  assetTypes: new Set(["wind"]),
  siteTypes: new Set(["offshore"])
}), null);

assert.equal(normalizeCreateProjectFormInput({
  name: "",
  hasStorage: "",
  startYear: "",
  forecastYears: "",
  energyMode: "bad"
}, { currentYear: 2028, autoUniqueName: true }).name, "新建项目");
assert.deepEqual(buildCreateProjectFormInput({
  name: "强制草稿",
  hasStorage: "",
  startYear: "",
  forecastYears: "",
  energyMode: "bad"
}, {
  currentYear: 2028,
  forceCreate: true
}).input, {
  name: "强制草稿",
  province: "",
  assetType: "",
  siteType: "",
  storageChoice: "",
  hasStorage: false,
  storagePowerInput: 0,
  storageDurationInput: 0,
  capacityInput: 0,
  startYearInput: 0,
  forecastYearsInput: 0,
  storagePowerMw: null,
  storageDurationH: null,
  storageNote: "",
  capacityMw: 0,
  startYear: 2028,
  forecastYears: 30,
  energyMode: "annual_hours",
  note: ""
});

assert.deepEqual(buildCreateProjectFormInput({
  name: "",
  province: "jiangsu"
}, options).error, {
  topMeta: "项目名称不能为空",
  message: "保存失败：请先填写项目名称。"
});
assert.deepEqual(buildCreateProjectFormInput({
  name: "缺省份",
  province: "bad"
}, options).error, {
  topMeta: "请选择省份。",
  message: "保存失败：请选择省份。"
});
assert.deepEqual(buildCreateProjectFormInput({
  name: "缺储能选择",
  province: "jiangsu",
  assetType: "wind",
  siteType: "offshore",
  hasStorage: "",
  capacity: "200",
  startYear: "2026",
  forecastYears: "20"
}, options).error, {
  topMeta: "请选择是否配建储能。",
  message: "保存失败：请选择是否配建储能。"
});
assert.deepEqual(buildCreateProjectFormInput({
  name: "缺储能功率",
  province: "jiangsu",
  assetType: "wind",
  siteType: "offshore",
  hasStorage: "yes",
  storagePower: "",
  storageDuration: "2",
  capacity: "200",
  startYear: "2026",
  forecastYears: "20"
}, options).error, {
  topMeta: "请填写有效的储能功率（MW）。",
  message: "保存失败：储能功率未填写或格式无效。"
});
assert.deepEqual(buildCreateProjectFormInput({
  name: "缺周期",
  province: "jiangsu",
  assetType: "wind",
  siteType: "offshore",
  hasStorage: "no",
  capacity: "200",
  startYear: "2026",
  forecastYears: "0"
}, options).error, {
  topMeta: "预测周期需为1-30年。",
  message: "保存失败：请填写有效的预测周期（1-30年）。"
});

assert.equal(hasProjectBaseInputChanged({
  province: "jiangsu",
  assetType: "wind",
  siteType: "offshore",
  hasStorage: true,
  storagePowerMw: 64,
  storageDurationH: 2,
  storageNote: "两小时",
  capacityMw: 200,
  startYear: 2026,
  forecastYears: 30,
  name: "旧名称",
  note: "旧备注",
  energyMode: "annual_hours"
}, {
  province: "jiangsu",
  assetType: "wind",
  siteType: "offshore",
  hasStorage: true,
  storagePowerMw: 64,
  storageDurationH: 2,
  storageNote: "两小时",
  capacityMw: 200,
  startYear: 2026,
  forecastYears: 30,
  name: "新名称",
  note: "新备注",
  energyMode: "province_typical_curve"
}), false);
assert.equal(hasProjectBaseInputChanged({
  province: "jiangsu",
  assetType: "wind",
  siteType: "offshore",
  hasStorage: false,
  storagePowerMw: null,
  storageDurationH: null,
  storageNote: "",
  capacityMw: 200,
  startYear: 2026,
  forecastYears: 30
}, {
  province: "jiangsu",
  assetType: "wind",
  siteType: "offshore",
  hasStorage: true,
  storagePowerMw: 64,
  storageDurationH: 2,
  storageNote: "两小时",
  capacityMw: 200,
  startYear: 2026,
  forecastYears: 30
}), true);

const projectForInputUpdate = createProjectRecord({ name: "旧项目", energyMode: "annual_hours" }, {
  id: "proj-update",
  nowIso: "2026-06-10T03:00:00.000Z"
});
applyCreateProjectInput(projectForInputUpdate, {
  name: "更新项目",
  province: "jiangsu",
  assetType: "wind",
  siteType: "offshore",
  hasStorage: true,
  storagePowerMw: 64,
  storageDurationH: 2,
  storageNote: "两小时",
  capacityMw: 320,
  startYear: 2026,
  forecastYears: 25,
  energyMode: "province_typical_curve",
  note: "已更新"
});
assert.equal(projectForInputUpdate.name, "更新项目");
assert.equal(projectForInputUpdate.province, "jiangsu");
assert.equal(projectForInputUpdate.hasStorage, true);
assert.equal(projectForInputUpdate.storagePowerMw, 64);
assert.equal(projectForInputUpdate.capacityMw, 320);
assert.equal(projectForInputUpdate.forecastYears, 25);
assert.equal(projectForInputUpdate.energyMode, "province_typical_curve");
assert.equal(projectForInputUpdate.note, "已更新");
applyCreateProjectInput(projectForInputUpdate, {
  name: "坏模式回退",
  energyMode: "bad"
});
assert.equal(projectForInputUpdate.energyMode, "annual_hours");
assert.equal(projectForInputUpdate.note, "");

const createdRecord = createProjectRecord(createInput, {
  id: "proj-created",
  ownerAccount: " demo ",
  workspaceBucket: "new",
  nowIso: "2026-06-10T02:00:00.000Z",
  statuses: { "create-page": "in_progress" },
  historySpotImport: { sourceType: "mock" },
  spotMarketConfig: { energyBasis: "settlement_generation_hourly" }
});
assert.equal(createdRecord.id, "proj-created");
assert.equal(createdRecord.ownerAccount, "demo");
assert.equal(createdRecord.workspaceBucket, "new");
assert.equal(createdRecord.name, "江苏海上风电");
assert.equal(createdRecord.storagePowerMw, 64);
assert.equal(createdRecord.energyMode, "province_typical_curve");
assert.deepEqual(createdRecord.energyData, createEmptyEnergyDataState("province_typical_curve"));
assert.deepEqual(createdRecord.energyTemplateExports, createEmptyEnergyTemplateExports());
assert.deepEqual(createdRecord.statuses, { "create-page": "in_progress" });
assert.deepEqual(createdRecord.historySpotImport, { sourceType: "mock" });
assert.deepEqual(createdRecord.spotMarketConfig, { energyBasis: "settlement_generation_hourly" });
assert.deepEqual(createdRecord.priceRuns, []);
assert.deepEqual(createdRecord.scenarios, []);
assert.equal(createdRecord.createdAt, "2026-06-10T02:00:00.000Z");
assert.equal(createProjectRecord({ name: "默认工作区" }).workspaceBucket, "history");

const recordWithBaseline = createProjectRecordWithBaseline(createInput, {
  id: "proj-baseline",
  nowIso: "2026-06-10T04:00:00.000Z",
  statuses: {},
  isProjectCreateCompleted: (targetProject) => targetProject.capacityMw > 0,
  createBaselineScenario: (targetProject) => ({
    id: `scenario-${targetProject.id}`,
    name: "基准场景"
  })
});
assert.equal(recordWithBaseline.statuses["create-page"], "completed");
assert.equal(recordWithBaseline.statuses["energy-page"], "in_progress");
assert.equal(recordWithBaseline.activeScenarioId, "scenario-proj-baseline");
assert.deepEqual(recordWithBaseline.scenarios, [{
  id: "scenario-proj-baseline",
  name: "基准场景"
}]);

const incompleteRecordWithBaseline = createProjectRecordWithBaseline({ name: "缺装机" }, {
  isProjectCreateCompleted: () => false
});
assert.equal(incompleteRecordWithBaseline.statuses["create-page"], "in_progress");
assert.equal(incompleteRecordWithBaseline.statuses["energy-page"], "not_started");
assert.deepEqual(incompleteRecordWithBaseline.scenarios, []);

const mockHistoryProject = createMockHistoryProject({
  id: "proj-demo",
  ownerAccount: " demo ",
  name: "示例项目",
  startYear: 2027,
  nowIso: "2026-06-10T00:00:00.000Z",
  statuses: { "home-page": "completed" },
  historySpotImport: { source: "mock" },
  spotMarketConfig: { market: "jiangsu" },
  createBaselineScenario: (project) => ({
    id: "scn-demo",
    name: `${project.name}-基准`,
    isBaseline: true
  })
});
assert.equal(mockHistoryProject.id, "proj-demo");
assert.equal(mockHistoryProject.ownerAccount, "demo");
assert.equal(mockHistoryProject.workspaceBucket, "history");
assert.equal(mockHistoryProject.name, "示例项目");
assert.equal(mockHistoryProject.province, "jiangsu");
assert.equal(mockHistoryProject.assetType, "wind");
assert.equal(mockHistoryProject.siteType, "offshore");
assert.equal(mockHistoryProject.storagePowerMw, 64);
assert.equal(mockHistoryProject.startYear, 2027);
assert.equal(mockHistoryProject.forecastYears, 30);
assert.equal(mockHistoryProject.statuses["home-page"], "completed");
assert.equal(mockHistoryProject.statuses["create-page"], "completed");
assert.deepEqual(mockHistoryProject.energyData, createEmptyEnergyDataState("annual_hours"));
assert.deepEqual(mockHistoryProject.energyTemplateExports, createEmptyEnergyTemplateExports());
assert.deepEqual(mockHistoryProject.historySpotImport, { source: "mock" });
assert.deepEqual(mockHistoryProject.spotMarketConfig, { market: "jiangsu" });
assert.equal(mockHistoryProject.scenarios[0].id, "scn-demo");
assert.equal(mockHistoryProject.scenarios[0].name, "示例项目-基准");
assert.equal(mockHistoryProject.activeScenarioId, "scn-demo");

const emptyWorkspaceProject = createEmptyWorkspaceProject({
  id: "proj-new",
  ownerAccount: " demo ",
  name: "新建项目2",
  nowIso: "2026-06-10T01:00:00.000Z",
  statuses: { "create-page": "not_started" },
  historySpotImport: { source: "empty" },
  spotMarketConfig: { market: "empty" },
  createBaselineScenario: (project) => ({
    id: "scn-new",
    name: `${project.name}-基准`,
    isBaseline: true
  })
});
assert.equal(emptyWorkspaceProject.id, "proj-new");
assert.equal(emptyWorkspaceProject.ownerAccount, "demo");
assert.equal(emptyWorkspaceProject.workspaceBucket, "new");
assert.equal(emptyWorkspaceProject.name, "新建项目2");
assert.equal(emptyWorkspaceProject.province, "");
assert.equal(emptyWorkspaceProject.assetType, "");
assert.equal(emptyWorkspaceProject.siteType, "");
assert.equal(emptyWorkspaceProject.hasStorage, false);
assert.equal(emptyWorkspaceProject.capacityMw, null);
assert.equal(emptyWorkspaceProject.startYear, null);
assert.equal(emptyWorkspaceProject.forecastYears, null);
assert.equal(emptyWorkspaceProject.createdAt, "2026-06-10T01:00:00.000Z");
assert.deepEqual(emptyWorkspaceProject.energyData, createEmptyEnergyDataState("annual_hours"));
assert.deepEqual(emptyWorkspaceProject.energyTemplateExports, createEmptyEnergyTemplateExports());
assert.deepEqual(emptyWorkspaceProject.historySpotImport, { source: "empty" });
assert.deepEqual(emptyWorkspaceProject.spotMarketConfig, { market: "empty" });
assert.equal(emptyWorkspaceProject.scenarios[0].id, "scn-new");
assert.equal(emptyWorkspaceProject.activeScenarioId, "scn-new");

const historyProject = sanitizeProjectBase({
  account: " legacy ",
  workspaceBucket: "history",
  province: "jiangsu",
  assetType: "wind",
  siteType: "offshore",
  hasStorage: true,
  capacityMw: "320",
  storagePowerMw: "",
  storageDurationH: "",
  startYear: "2026.8",
  forecastYears: "40",
  energyMode: "typical_curve_8760",
  note: "note"
}, 0, options);
assert.equal(historyProject.id, "proj-test");
assert.equal(historyProject.ownerAccount, "legacy");
assert.equal(historyProject.name, "项目1");
assert.equal(historyProject.province, "jiangsu");
assert.equal(historyProject.storagePowerMw, 64);
assert.equal(historyProject.storageDurationH, 2);
assert.equal(historyProject.startYear, 2026);
assert.equal(historyProject.forecastYears, 30);
assert.equal(historyProject.energyMode, "typical_curve_8760");
assert.equal(historyProject.createdAt, "2026-06-09T00:00:00.000Z");

const draftProject = sanitizeProjectBase({
  workspaceBucket: "new",
  province: "bad",
  assetType: "bad",
  siteType: "bad",
  capacityMw: "bad",
  startYear: "bad",
  forecastYears: "bad"
}, 2, options);
assert.equal(draftProject.workspaceBucket, "new");
assert.equal(draftProject.name, "新建项目2");
assert.equal(draftProject.province, "");
assert.equal(draftProject.assetType, "");
assert.equal(draftProject.siteType, "");
assert.equal(draftProject.capacityMw, null);
assert.equal(draftProject.startYear, null);
assert.equal(draftProject.forecastYears, null);

const runs = sanitizePriceRuns([
  null,
  {
    algorithmFamily: "ensemble",
    pricesByYear: { 2026: [1, 2] }
  },
  {
    id: "run-keep",
    createdAt: "2026-01-01T00:00:00.000Z",
    pricesByYear: []
  }
], options);
assert.equal(runs.length, 2);
assert.equal(runs[0].id, "run-test");
assert.deepEqual(runs[0].pricesByYear, { 2026: [1, 2] });
assert.equal(runs[1].id, "run-keep");
assert.deepEqual(runs[1].pricesByYear, {});
assert.equal(resolveActiveRunId(runs, "run-keep"), "run-keep");
assert.equal(resolveActiveRunId(runs, "missing"), null);

const logs = sanitizeActivationLogs([
  {},
  {
    id: "act-keep",
    fromRunId: "a",
    toRunId: "b",
    reason: "手动切换",
    changedAt: "2026-01-01T00:00:00.000Z"
  }
], options);
assert.equal(logs[0].id, "act-test");
assert.equal(logs[0].fromRunId, "-");
assert.equal(logs[0].changedAt, "2026-06-09T00:00:00.000Z");
assert.equal(logs[1].reason, "手动切换");

console.log("project model tests passed");
