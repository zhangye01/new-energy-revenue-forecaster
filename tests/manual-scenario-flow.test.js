"use strict";

const assert = require("node:assert/strict");
const {
  createManualScenarioImportConfigs,
  exportManualScenarioTemplate,
  importManualScenarioTemplate
} = require("../src/ui/manual-scenario-flow");

function createConfigs(parseResult = { ok: true, prices: { 2026: 8 } }) {
  return createManualScenarioImportConfigs({
    exportBuilders: {
      buildLtManualTemplateFilename: () => "lt-template.csv",
      buildEnvManualTemplateFilename: () => "env-template.csv",
      buildFeeManualTemplateFilename: () => "fee-template.csv"
    },
    scenarioConfig: {
      buildLtManualTemplateRows: () => [["year", "trade_strategy_pnl_yuan_per_mwh"]],
      buildEnvManualTemplateRows: () => [["year", "green_certificate_ratio_pct"]],
      buildFeeManualTemplateRows: () => [["year", "market_operation_fee_yuan_per_mwh"]],
      parseLtManualPricesCsv: () => parseResult,
      parseEnvManualValuesCsv: () => parseResult,
      parseFeeManualValuesCsv: () => parseResult
    }
  });
}

function createRefs(file = null) {
  return {
    scenarioMessage: { textContent: "", style: {} },
    ltManualStatus: { textContent: "" },
    envManualStatus: { textContent: "" },
    feeManualStatus: { textContent: "" },
    ltManualFileInput: { files: file ? [file] : [] },
    envManualFileInput: { files: file ? [file] : [] },
    feeManualFileInput: { files: file ? [file] : [] }
  };
}

const noProjectCalls = [];
assert.equal(exportManualScenarioTemplate({
  kind: "lt",
  configs: createConfigs(),
  refs: createRefs(),
  actions: {
    setTopMeta: (message, tone) => noProjectCalls.push(`${tone}:${message}`)
  }
}), false);
assert.deepEqual(noProjectCalls, ["warn:请先创建或选择项目。"]);

const exportRefs = createRefs();
const exportCalls = [];
assert.equal(exportManualScenarioTemplate({
  kind: "lt",
  configs: createConfigs(),
  refs: exportRefs,
  project: { id: "p1" },
  scenario: { id: "s1", name: "基准场景" },
  actions: {
    downloadCsv: (filename, rows) => exportCalls.push({ filename, rows })
  }
}), true);
assert.deepEqual(exportCalls, [{
  filename: "lt-template.csv",
  rows: [["year", "trade_strategy_pnl_yuan_per_mwh"]]
}]);
assert.equal(exportRefs.ltManualStatus.textContent, "已导出空白逐年损益模板，可填写后重新导入。");

(async () => {
  const lockedRefs = createRefs({ name: "lt.csv" });
  assert.equal(await importManualScenarioTemplate({
    kind: "lt",
    configs: createConfigs(),
    refs: lockedRefs,
    project: { id: "p1" },
    scenario: { id: "s1", name: "锁定场景", locked: true }
  }), false);
  assert.equal(lockedRefs.scenarioMessage.textContent, "当前场景已锁定，不能导入逐年损益。");
  assert.equal(lockedRefs.scenarioMessage.style.borderColor, "#d39191");

  const missingFileRefs = createRefs();
  assert.equal(await importManualScenarioTemplate({
    kind: "lt",
    configs: createConfigs(),
    refs: missingFileRefs,
    project: { id: "p1" },
    scenario: { id: "s1", name: "基准场景", config: {} }
  }), false);
  assert.equal(missingFileRefs.ltManualStatus.textContent, "请先选择CSV或Excel文件。");

  const parseFailRefs = createRefs({ name: "bad.csv" });
  assert.equal(await importManualScenarioTemplate({
    kind: "lt",
    configs: createConfigs({ ok: false, message: "模板字段缺失" }),
    refs: parseFailRefs,
    project: { id: "p1" },
    scenario: { id: "s1", name: "基准场景", config: {} },
    actions: {
      readSpreadsheetToCsv: async () => ({ text: "bad" })
    }
  }), false);
  assert.equal(parseFailRefs.ltManualStatus.textContent, "模板字段缺失");
  assert.equal(parseFailRefs.scenarioMessage.textContent, "模板字段缺失");

  const project = { id: "p1", statuses: {} };
  const scenario = { id: "s1", name: "基准场景", config: {} };
  const successRefs = createRefs({ name: "ok.csv" });
  const successCalls = [];
  assert.equal(await importManualScenarioTemplate({
    kind: "lt",
    configs: createConfigs({ ok: true, prices: { 2026: 8, 2027: 6.8 } }),
    refs: successRefs,
    project,
    scenario,
    actions: {
      readSpreadsheetToCsv: async () => ({ text: "ok" }),
      markDownstreamStale: (targetProject, page) => successCalls.push(`stale:${targetProject.id}:${page}`),
      renderAll: () => successCalls.push("render"),
      schedulePersistAppData: () => successCalls.push("persist")
    }
  }), true);
  assert.equal(scenario.config.ltPricingMode, "manual");
  assert.deepEqual(scenario.config.ltManualPricesByYear, { 2026: 8, 2027: 6.8 });
  assert.equal(project.statuses["scenario-page"], "in_progress");
  assert.ok(successCalls.includes("stale:p1:scenario-page"));
  assert.ok(successCalls.includes("render"));
  assert.ok(successCalls.includes("persist"));
  assert.equal(successRefs.scenarioMessage.textContent, "已导入“基准场景”的逐年交易策略损益值，请确认后保存当前配置。");

  console.log("manual scenario flow tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
