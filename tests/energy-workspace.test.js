"use strict";

const assert = require("node:assert/strict");
const {
  BLOCKED_MESSAGE,
  bindCreateEnergyEvents,
  buildEnergyWorkspaceViewModel,
  resolveModeLabel,
  shouldRefreshEnergyMessage
} = require("../src/ui/energy-workspace");

class FakeTarget {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.handlers = {};
  }

  addEventListener(name, handler) {
    this.handlers[name] = handler;
  }

  dispatch(name, event = {}) {
    const nextEvent = {
      target: this,
      prevented: false,
      preventDefault() {
        nextEvent.prevented = true;
      },
      ...event
    };
    this.handlers[name]?.(nextEvent);
    return nextEvent;
  }
}

const energyEventCalls = [];
const annualFileInput = new FakeTarget();
const typicalFileInput = new FakeTarget();
const typicalChoiceButton = new FakeTarget({ energyStep2Choice: "typical" });
const provinceChoiceButton = new FakeTarget({ energyStep2Choice: "province" });
const energyEventRefs = {
  createProjectForm: new FakeTarget(),
  createHasStorage: new FakeTarget(),
  createToEnergyButton: new FakeTarget(),
  energyToHistoryButton: new FakeTarget(),
  exportEnergyAnnualTemplateButton: new FakeTarget(),
  importEnergyAnnualFileButton: new FakeTarget(),
  energyAnnualFileInput: annualFileInput,
  exportEnergyTypicalTemplateButton: new FakeTarget(),
  importEnergyTypicalFileButton: new FakeTarget(),
  energyTypicalFileInput: typicalFileInput,
  applyEnergyProvinceCurveButton: new FakeTarget(),
  energyStep2ChoiceButtons: [typicalChoiceButton, provinceChoiceButton]
};
bindCreateEnergyEvents({
  refs: energyEventRefs,
  handlers: {
    submitCreateProject: () => energyEventCalls.push("submit-create"),
    syncCreateStorageFields: () => energyEventCalls.push("sync-storage"),
    enterEnergyPage: () => energyEventCalls.push("enter-energy"),
    enterHistoryPage: () => energyEventCalls.push("enter-history"),
    exportEnergyTemplate: (mode) => energyEventCalls.push(`export:${mode}`),
    importEnergyFromFile: (mode, input) => energyEventCalls.push(`import:${mode}:${input === annualFileInput ? "annual" : "typical"}`),
    applyProvinceTypicalCurve: () => energyEventCalls.push("apply-province"),
    changeEnergyStep2Choice: (choice) => energyEventCalls.push(`choice:${choice}`)
  }
});
assert.equal(energyEventRefs.createProjectForm.dispatch("submit").prevented, true);
energyEventRefs.createHasStorage.dispatch("change");
energyEventRefs.createToEnergyButton.dispatch("click");
energyEventRefs.energyToHistoryButton.dispatch("click");
energyEventRefs.exportEnergyAnnualTemplateButton.dispatch("click");
energyEventRefs.importEnergyAnnualFileButton.dispatch("click");
energyEventRefs.exportEnergyTypicalTemplateButton.dispatch("click");
energyEventRefs.importEnergyTypicalFileButton.dispatch("click");
energyEventRefs.applyEnergyProvinceCurveButton.dispatch("click");
typicalChoiceButton.dispatch("click");
provinceChoiceButton.dispatch("click");
assert.deepEqual(energyEventCalls, [
  "submit-create",
  "sync-storage",
  "enter-energy",
  "enter-history",
  "export:annual_hours",
  "import:annual_hours:annual",
  "export:typical_curve_8760",
  "import:typical_curve_8760:typical",
  "apply-province",
  "choice:typical",
  "choice:province"
]);

assert.equal(resolveModeLabel(0, ""), "待配置");
assert.equal(resolveModeLabel(2, ""), "仅逐年总量");
assert.equal(resolveModeLabel(2, "typical_curve_8760"), "逐年总量 + 典型年8760小时模板");
assert.equal(resolveModeLabel(2, "province_typical_curve"), "逐年总量 + 省份典型曲线");

assert.equal(shouldRefreshEnergyMessage("", BLOCKED_MESSAGE, false), true);
assert.equal(shouldRefreshEnergyMessage("用户刚手动上传了文件", BLOCKED_MESSAGE, false), false);
assert.equal(shouldRefreshEnergyMessage("用户刚手动上传了文件", BLOCKED_MESSAGE, true), true);

const noProject = buildEnergyWorkspaceViewModel();
assert.equal(noProject.resetMessageProjectId, true);
assert.equal(noProject.message.text, "请先在“我的项目”进入一个项目，再执行模板导出与文件导入。");
assert.equal(noProject.templateStatuses.annual.stateClass, "blocked");
assert.equal(noProject.controls.annualExport, true);

const baseProject = {
  id: "p1",
  name: "测试项目",
  energyData: {
    mode: "annual_hours",
    typicalCurveSource: ""
  }
};
const draftProject = buildEnergyWorkspaceViewModel({
  project: baseProject,
  createReady: false,
  energyState: {
    energyData: baseProject.energyData,
    totalYears: 0,
    annualInputYears: 0,
    completeYears: 0,
    totalEnergyMwh: 0,
    ready: false
  },
  labels: { periodText: "待保存" }
});
assert.equal(draftProject.projectContext.includes("基础信息尚未完成"), true);
assert.equal(draftProject.message.text, BLOCKED_MESSAGE);
assert.equal(draftProject.historyButton.enabled, false);

const partialAnnual = buildEnergyWorkspaceViewModel({
  project: baseProject,
  createReady: true,
  energyState: {
    energyData: baseProject.energyData,
    totalYears: 3,
    annualInputYears: 2,
    completeYears: 0,
    totalEnergyMwh: 0,
    ready: false
  },
  exports: { annual_hours: "2026-06-10T00:00:00.000Z" },
  labels: {
    periodText: "2026-2028",
    provinceName: "江苏",
    assetTypeLabel: "风电",
    siteTypeLabel: "海上",
    storageText: "配储"
  },
  currentMessage: "",
  formatExportTime: () => "刚刚"
});
assert.equal(partialAnnual.metrics.period, "2026-2028");
assert.equal(partialAnnual.metrics.mode, "仅逐年总量");
assert.equal(partialAnnual.templateStatuses.annual.text, "已录入 2/3 年");
assert.equal(partialAnnual.controls.typicalFile, true);
assert.equal(partialAnnual.message.tone, "warn");

const readyProject = buildEnergyWorkspaceViewModel({
  project: {
    ...baseProject,
    energyData: {
      mode: "province_typical_curve",
      typicalCurveSource: "province_typical_curve"
    }
  },
  createReady: true,
  energyState: {
    energyData: {
      mode: "province_typical_curve",
      typicalCurveSource: "province_typical_curve"
    },
    totalYears: 3,
    annualInputYears: 3,
    completeYears: 3,
    totalEnergyMwh: 123456.789,
    hasTypicalCurve: true,
    ready: true
  },
  exports: {
    annual_hours: "a",
    province_typical_curve: "b"
  },
  labels: {
    periodText: "2026-2028",
    provinceName: "江苏",
    assetTypeLabel: "风电",
    siteTypeLabel: "海上",
    storageText: "配储",
    provinceCurveText: "江苏海上风电"
  },
  currentMessage: "",
  isProjectSwitched: true,
  activeStep2Choice: "typical"
});
assert.equal(readyProject.nextStep2Choice, "province");
assert.equal(readyProject.metrics.totalMwh, "123456.79");
assert.equal(readyProject.historyButton.enabled, true);
assert.equal(readyProject.templateStatuses.province.text, "已调用 江苏海上风电 典型曲线");
assert.equal(readyProject.step2Actions.provinceApplyText, "重新调用当前省份曲线");
assert.equal(readyProject.message.tone, "success");

console.log("energy workspace tests passed");
