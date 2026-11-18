"use strict";

const assert = require("node:assert/strict");
const {
  createManualScenarioImportConfigs,
  exportManualScenarioTemplate,
  importManualScenarioTemplate: importManualScenarioTemplateImpl
} = require("../src/ui/manual-scenario-flow");

function importManualScenarioTemplate(input) {
  return importManualScenarioTemplateImpl({ ...input, actions: {
    getActiveProject: () => input.project,
    getActiveScenario: () => input.scenario,
    ...input.actions
  } });
}

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
  assert.equal(lockedRefs.scenarioMessage.textContent, "当前方案已锁定，不能导入逐年损益。");
  assert.equal(lockedRefs.scenarioMessage.style.borderColor, "var(--red)");

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

  const realScenarioConfig = require("../src/domain/scenario-config");
  const realConfigs = createManualScenarioImportConfigs({ scenarioConfig: realScenarioConfig });
  for (const [kind, buildRows] of [["lt", realScenarioConfig.buildLtManualTemplateRows],
    ["env", realScenarioConfig.buildEnvManualTemplateRows], ["fee", realScenarioConfig.buildFeeManualTemplateRows]]) {
    const blankProject = { id: "blank-project", startYear: 2026, forecastYears: 2, siteType: "offshore", statuses: {} };
    const blankScenario = { id: "blank-scenario", config: { mechanismPrice: 365 }, confirmedConfig: { mechanismPrice: 365 } };
    const original = JSON.stringify(blankScenario);
    const blankText = buildRows(blankProject).map((row) => row.join(",")).join("\n");
    assert.equal(await importManualScenarioTemplate({
      kind, configs: realConfigs, refs: createRefs({ name: "blank.csv" }), project: blankProject, scenario: blankScenario,
      actions: { readSpreadsheetToCsv: async () => ({ text: blankText }) }
    }), false, `${kind} must reject an unfilled exported template`);
    assert.equal(JSON.stringify(blankScenario), original, "failed imports preserve saved parameters and confirmation state");
  }

  // Importing a manual table changes applicability just like saving that mode.
  // Old global / auto values survive, but returning to them requires review.
  const scenarioModel = require("../src/domain/scenario-model");
  const { buildRefinementState } = require("../src/ui/scenario-form");
  for (const [kind, modeKey, valuesKey, originalMode, globalKey, csvRow] of [
    ["lt", "ltPricingMode", "ltManualPricesByYear", "auto", "ltYear1Pnl", [2026, 8]],
    ["env", "envValueMode", "envManualValuesByYear", "global", "greenCertPrice", [2026, 20, 50, 10, 25, "否", 4, 25]],
    ["fee", "feeConfigMode", "feeManualValuesByYear", "global", "otherFee", [2026, 6, 7, 14, 9, 2]]
  ]) {
    const importProject = { id: `review-${kind}`, startYear: 2026, forecastYears: 1,
      siteType: "offshore", hasStorage: false, statuses: {} };
    const importScenario = scenarioModel.createBaselineScenario(importProject);
    scenarioModel.confirmConfig(importScenario, undefined, { project: importProject });
    const originalGlobalValue = importScenario.config[globalKey];
    const originalEvidence = JSON.parse(JSON.stringify({ confirmedConfig: importScenario.confirmedConfig,
      confirmedConfigSources: importScenario.confirmedConfigSources }));
    importProject.roughPrice = { snapshots: [{ id: `rough-${kind}`, config: JSON.parse(JSON.stringify(importScenario.config)) }] };
    const roughBefore = JSON.stringify(importProject.roughPrice);
    const csvText = [realConfigs[kind].rows(importProject)[0], csvRow].map((row) => row.join(",")).join("\n");
    assert.equal(await importManualScenarioTemplate({ kind, configs: realConfigs, project: importProject,
      scenario: importScenario, refs: createRefs({ name: `${kind}-valid.csv` }),
      actions: { readSpreadsheetToCsv: async () => ({ text: csvText }) }
    }), true);
    assert.equal(importScenario.config[modeKey], "manual");
    assert.equal(importScenario.config[globalKey], originalGlobalValue);
    assert.equal(scenarioModel.isConfigConfirmed(importScenario, globalKey), false);
    assert.equal(scenarioModel.isConfigConfirmed(importScenario, valuesKey), true);
    assert.equal(scenarioModel.isConfigConfirmed(importScenario, "mechanismPrice"), true, "unrelated active confirmation stays valid");
    assert.deepEqual(importScenario.confirmationEvidence, originalEvidence);
    assert.equal(buildRefinementState({ project: importProject, scenario: importScenario,
      config: { ...importScenario.config, [modeKey]: originalMode } }).fields[globalKey], "pending");
    assert.equal(JSON.stringify(importProject.roughPrice), roughBefore);
  }

  const project = { id: "p1", statuses: {} };
  const scenario = { id: "s1", name: "基准场景", config: { mechanismPrice: 365 } };
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
  assert.deepEqual(scenario.confirmedConfig, {
    ltPricingMode: "manual",
    ltManualPricesByYear: { 2026: 8, 2027: 6.8 }
  }, "manual import must confirm only the imported group, not unrelated defaults");
  assert.equal(project.statuses["scenario-page"], "in_progress");
  assert.ok(successCalls.includes("stale:p1:scenario-page"));
  assert.ok(successCalls.includes("render"));
  assert.ok(successCalls.includes("persist"));
  assert.equal(successRefs.scenarioMessage.textContent, "已导入“基准场景”的逐年交易策略损益值，请确认后保存当前配置。");

  for (const [kind, modeKey, valuesKey] of [
    ["env", "envValueMode", "envManualValuesByYear"],
    ["fee", "feeConfigMode", "feeManualValuesByYear"]
  ]) {
    const importScenario = { config: { mechanismPrice: 365 } };
    const values = { 2026: { value: 3 } };
    assert.equal(await importManualScenarioTemplate({
      kind,
      configs: createConfigs({ ok: true, values }),
      refs: createRefs({ name: "ok.csv" }),
      project: { statuses: {} },
      scenario: importScenario,
      actions: { readSpreadsheetToCsv: async () => ({ text: "ok" }) }
    }), true);
    assert.deepEqual(importScenario.confirmedConfig, { [modeKey]: "manual", [valuesKey]: values });
    values[2026].value = 99;
    assert.equal(importScenario.confirmedConfig[valuesKey][2026].value, 3);
  }

  const lockedDuringRead = { config: { mechanismPrice: 365 }, locked: false };
  assert.equal(await importManualScenarioTemplate({
    kind: "lt",
    configs: createConfigs(),
    refs: createRefs({ name: "ok.csv" }),
    project: { statuses: {} },
    scenario: lockedDuringRead,
    actions: { readSpreadsheetToCsv: async () => { lockedDuringRead.locked = true; return { text: "ok" }; } }
  }), false);
  assert.deepEqual(lockedDuringRead.config, { mechanismPrice: 365 });
  assert.equal(lockedDuringRead.confirmedConfig, undefined);

  // The file can finish after a switch, deletion, reload or lock. No target may be changed.
  for (const kind of ["lt", "env", "fee"]) {
    for (const change of ["project-switch", "scenario-switch", "project-delete", "scenario-delete", "reload-same-ids", "lock", "id-change"]) {
      const originalScenario = { id: "s-old", name: "原方案", locked: false,
        config: { otherFee: 14.75 }, confirmedConfig: { otherFee: 14.75 }, confirmedConfigSources: { otherFee: "explicit" } };
      const originalProject = { id: "p-old", scenarios: [originalScenario], statuses: {},
        roughPrice: { snapshots: [{ id: "keep-rough", original: 333.9 }] } };
      const otherScenario = { id: "s-other", name: "另一方案", config: { otherFee: 9 } };
      const otherProject = { id: "p-other", scenarios: [otherScenario], statuses: {} };
      let activeProject = originalProject, activeScenario = originalScenario, finishRead;
      const readPromise = new Promise((resolve) => { finishRead = resolve; });
      const calls = [], refs = createRefs({ name: `${kind}-${change}.csv` });
      const importing = importManualScenarioTemplate({ kind, project: originalProject, scenario: originalScenario,
        configs: createConfigs({ ok: true, prices: { 2026: 5 }, values: { 2026: { otherFee: 3 } } }), refs,
        actions: { getActiveProject: () => activeProject, getActiveScenario: () => activeScenario,
          readSpreadsheetToCsv: () => readPromise, markDownstreamStale: () => calls.push("stale"),
          renderAll: () => calls.push("render"), schedulePersistAppData: () => calls.push("persist") } });
      if (change === "project-switch") { activeProject = otherProject; activeScenario = otherScenario; }
      if (change === "scenario-switch") activeScenario = otherScenario;
      if (change === "project-delete") { activeProject = null; activeScenario = null; }
      if (change === "scenario-delete") { originalProject.scenarios = []; activeScenario = null; }
      if (change === "reload-same-ids") { activeProject = JSON.parse(JSON.stringify(originalProject)); activeScenario = activeProject.scenarios[0]; }
      if (change === "lock") originalScenario.locked = true;
      if (change === "id-change") originalScenario.id = "s-replaced";
      const before = JSON.stringify([originalProject, originalScenario, otherProject, otherScenario]);
      finishRead({ text: "valid file" });
      assert.equal(await importing, false, `${kind}/${change} must cancel`);
      assert.equal(JSON.stringify([originalProject, originalScenario, otherProject, otherScenario]), before,
        `${kind}/${change} must preserve values, confirmations, snapshots and statuses`);
      assert.deepEqual(calls, [], `${kind}/${change} cannot persist or announce completion`);
      assert.match(refs.scenarioMessage.textContent, /已取消|已锁定/);
      assert.doesNotMatch(refs.scenarioMessage.textContent, /已导入/);
    }
  }
  let unguardedRead = false;
  assert.equal(await importManualScenarioTemplateImpl({ kind: "lt", configs: createConfigs(),
    project: { id: "p" }, scenario: { id: "s", config: {} }, refs: createRefs({ name: "unsafe-context.csv" }),
    actions: { readSpreadsheetToCsv: async () => { unguardedRead = true; return { text: "ok" }; } }
  }), false, "an entry point without live target getters must fail closed");
  assert.equal(unguardedRead, false);

  console.log("manual scenario flow tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
