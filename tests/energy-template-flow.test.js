"use strict";

const assert = require("node:assert/strict");
const {
  applyProvinceTypicalCurve,
  buildEnergySampleRows,
  downloadEnergySampleFile,
  exportEnergyTemplate,
  importEnergyFromFile: importEnergyFromFileImpl
} = require("../src/ui/energy-template-flow");

function importEnergyFromFile(input) {
  const project = input.project || { id: "import-project" };
  return importEnergyFromFileImpl({ ...input, project, actions: {
    getActiveProject: () => project,
    ...input.actions
  } });
}

function createServices(overrides = {}) {
  return {
    normalizeEnergyMode: (mode) => mode,
    buildEnergyTemplateRows: () => [["year", "annual_hours_h"], [2026, 2400]],
    buildEnergyTemplateFilename: () => "energy-template.csv",
    ensureProjectEnergyTemplateExports: (project) => {
      project.energyTemplateExports = project.energyTemplateExports || {};
      return project.energyTemplateExports;
    },
    ensureProjectEnergyDataState: (project) => {
      project.energyData = project.energyData || {};
      return project.energyData;
    },
    getEnergyModeMeta: () => ({ label: "逐年总量", header: "year,annual_hours_h" }),
    isProjectCreateCompleted: () => true,
    generateHourlyHoursFromAnnual: () => [1.234567, 2.345678],
    getAnnualInputYearCount: () => 2,
    getProvinceTypicalCurveRecord: () => ({
      profile: [0.1, 0.2],
      sourceLabel: "模拟库：江苏 风电 典型8760曲线"
    }),
    rebuildProjectEnergyData: (project) => { project.rebuilt = true; },
    countCompleteEnergyYears: () => 2,
    markDownstreamStale: (project, page) => { project.staleFrom = page; },
    ...overrides
  };
}

function createActions(calls = [], overrides = {}) {
  return {
    setEnergyImportMessage: (message, tone) => calls.push(`message:${tone}:${message}`),
    downloadCsv: (filename, rows) => calls.push({ filename, rows }),
    readSpreadsheetToCsv: async () => ({ text: "year,hour\n2026,1", source: "text" }),
    importEnergyDataFromText: (mode, text, sourceLabel) => {
      calls.push(`import:${mode}:${text}:${sourceLabel}`);
      return true;
    },
    renderAll: () => calls.push("render"),
    ...overrides
  };
}

const noProjectCalls = [];
assert.equal(exportEnergyTemplate({
  project: null,
  services: createServices(),
  actions: createActions(noProjectCalls)
}), false);
assert.deepEqual(noProjectCalls, ["message:error:请先创建或进入项目，再导出模板。"]);

const blockedCalls = [];
assert.equal(exportEnergyTemplate({
  project: { startYear: 2026, forecastYears: 2 },
  services: createServices({ isProjectCreateCompleted: () => false }),
  actions: createActions(blockedCalls)
}), false);
assert.deepEqual(blockedCalls, ["message:warn:请先完成步骤1基础信息保存，再导出模板。"]);

const exportProject = { startYear: 2026, forecastYears: 2 };
const exportCalls = [];
assert.equal(exportEnergyTemplate({
  mode: "annual_hours",
  project: exportProject,
  services: createServices(),
  actions: createActions(exportCalls)
}), true);
assert.equal(exportCalls[0].filename, "energy-template.csv");
assert.deepEqual(exportCalls[0].rows, [["year", "annual_hours_h"], [2026, 2400]]);
assert.ok(exportProject.energyTemplateExports.annual_hours);
assert.match(exportCalls[1], /message:success:模板已导出/);

assert.deepEqual(buildEnergySampleRows({
  mode: "annual_hours",
  project: { startYear: 2026, forecastYears: 2, assetType: "wind" },
  services: createServices()
}), [
  ["year", "annual_hours_h"],
  [2026, "2400.00"],
  [2027, "2392.80"]
]);

assert.deepEqual(buildEnergySampleRows({
  mode: "typical_curve_8760",
  project: { startYear: 2026, forecastYears: 1, assetType: "photovoltaic" },
  services: createServices()
}), [
  ["hour_index", "equivalent_hours_h"],
  [1, "1.234567"],
  [2, "2.345678"]
]);

assert.deepEqual(buildEnergySampleRows({
  mode: "hourly_8760",
  project: { startYear: 2026, forecastYears: 1, assetType: "wind" },
  services: createServices()
}), [
  ["year", "hour_index", "equivalent_hours_h"],
  [2026, 1, "1.234567"],
  [2026, 2, "2.345678"]
]);

const sampleCalls = [];
assert.equal(downloadEnergySampleFile({
  mode: "annual_hours",
  project: { startYear: 2026, forecastYears: 1, assetType: "wind" },
  services: createServices(),
  actions: createActions(sampleCalls)
}), true);
assert.equal(sampleCalls[0].filename, "energy-template-示例.csv");

(async () => {
  const importCalls = [];
  const inputElement = { files: [{ name: "annual.csv" }], value: "chosen" };
  assert.equal(await importEnergyFromFile({
    mode: "annual_hours",
    inputElement,
    actions: createActions(importCalls)
  }), true);
  assert.deepEqual(importCalls, ["import:annual_hours:year,hour\n2026,1:annual.csv"]);
  assert.equal(inputElement.value, "");

  const excelCalls = [];
  assert.equal(await importEnergyFromFile({
    mode: "typical_curve_8760",
    inputElement: { files: [{ name: "annual.xlsx" }], value: "chosen" },
    actions: createActions(excelCalls, {
      readSpreadsheetToCsv: async () => ({ text: "hour,value\n1,0.1", source: "excel:Sheet1" })
    })
  }), true);
  assert.deepEqual(excelCalls, ["import:typical_curve_8760:hour,value\n1,0.1:Sheet1"]);

  const emptyCalls = [];
  assert.equal(await importEnergyFromFile({
    inputElement: { files: [{ name: "empty.csv" }] },
    actions: createActions(emptyCalls, {
      readSpreadsheetToCsv: async () => ({ text: "  ", source: "text" })
    })
  }), false);
  assert.deepEqual(emptyCalls, ["message:error:文件内容为空，请检查模板后重试。"]);

  const missingCalls = [];
  assert.equal(await importEnergyFromFile({
    inputElement: { files: [] },
    actions: createActions(missingCalls)
  }), false);
  assert.deepEqual(missingCalls, ["message:error:请先选择CSV或Excel文件。"]);

  for (const mode of ["annual_hours", "typical_curve_8760", "hourly_8760"]) {
    for (const change of ["switch", "delete", "reload-same-id", "id-change"]) {
      const originalProject = { id: "original", energyData: { annualInputByYear: { 2026: 2000 } },
        roughPrice: { snapshots: [{ id: "rough", price: 333.9 }] } };
      const otherProject = { id: "other", energyData: { annualInputByYear: { 2026: 3000 } } };
      let activeProject = originalProject, finishRead, writes = 0;
      const reading = new Promise((resolve) => { finishRead = resolve; });
      const calls = [], control = { files: [{ name: "energy.csv" }], value: "chosen" };
      const importing = importEnergyFromFile({ mode, project: originalProject, inputElement: control,
        actions: createActions(calls, { getActiveProject: () => activeProject, readSpreadsheetToCsv: () => reading,
          importEnergyDataFromText: () => { writes++; activeProject.energyData = {}; return true; } }) });
      if (change === "switch") activeProject = otherProject;
      if (change === "delete") activeProject = null;
      if (change === "reload-same-id") activeProject = JSON.parse(JSON.stringify(originalProject));
      if (change === "id-change") originalProject.id = "replaced";
      const before = JSON.stringify([originalProject, otherProject]);
      finishRead({ text: "year,annual_hours_h\n2026,2100", source: "text" });
      assert.equal(await importing, false, `${mode}/${change} must cancel`);
      assert.equal(writes, 0); assert.equal(control.value, "chosen");
      assert.equal(JSON.stringify([originalProject, otherProject]), before);
      assert.match(calls[0], /导入已取消.*项目/);
    }
  }
  assert.equal(await importEnergyFromFileImpl({ project: { id: "p" },
    inputElement: { files: [{ name: "energy.csv" }] }, actions: createActions([])
  }), false, "energy imports without a live target getter must fail closed");

  const project = {
    forecastYears: 2,
    statuses: { "energy-page": "not_started", "history-page": "not_started" }
  };
  const appState = {};
  const provinceCalls = [];
  assert.equal(applyProvinceTypicalCurve({
    project,
    appState,
    services: createServices(),
    actions: createActions(provinceCalls)
  }), true);
  assert.deepEqual(project.energyData.typicalCurveProfile, [0.1, 0.2]);
  assert.equal(project.energyData.typicalCurveSource, "province_typical_curve");
  assert.equal(appState.energyStep2Choice, "province");
  assert.equal(project.rebuilt, true);
  assert.ok(project.energyTemplateExports.province_typical_curve);
  assert.equal(project.statuses["energy-page"], "completed");
  assert.equal(project.statuses["history-page"], "in_progress");
  assert.equal(project.staleFrom, "energy-page");
  assert.ok(provinceCalls.includes("render"));
  assert.ok(provinceCalls.some((item) => String(item).includes("message:success:已调用 模拟库")));

  const annualBlockedCalls = [];
  assert.equal(applyProvinceTypicalCurve({
    project: { forecastYears: 3, statuses: {} },
    services: createServices({ getAnnualInputYearCount: () => 1 }),
    actions: createActions(annualBlockedCalls)
  }), false);
  assert.deepEqual(annualBlockedCalls, ["message:warn:请先完成逐年总量模板导入。当前仅录入 1/3 年。"]);

  console.log("energy template flow tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
