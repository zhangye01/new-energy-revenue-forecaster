"use strict";

(function (root, factory) {
  const getScenarioForm = () => typeof module !== "undefined" && module.exports
    ? require("./scenario-form") : root.NE_SCENARIO_FORM;
  const api = factory(getScenarioForm);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_MANUAL_SCENARIO_FLOW = api;
  if (root.window && root.window !== root) {
    root.window.NE_MANUAL_SCENARIO_FLOW = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (getScenarioForm) {
  const readVersions = new WeakMap();
  function createManualScenarioImportConfigs(input = {}) {
    const {
      exportBuilders = {},
      scenarioConfig = {}
    } = input;
    return Object.freeze({
      lt: {
        fileInputRef: "ltManualFileInput",
        statusRef: "ltManualStatus",
        parsedKey: "prices",
        filename: exportBuilders.buildLtManualTemplateFilename,
        rows: scenarioConfig.buildLtManualTemplateRows,
        parse: scenarioConfig.parseLtManualPricesCsv,
        exportedMessage: "已导出空白逐年损益模板，可填写后重新导入。",
        lockedMessage: "当前方案已锁定，不能导入逐年损益。",
        successMessage: (scenario) => `已暂存“${scenario.name}”的逐年交易策略损益值，请核对预览后确认并保存。`
      },
      env: {
        fileInputRef: "envManualFileInput",
        statusRef: "envManualStatus",
        parsedKey: "values",
        filename: exportBuilders.buildEnvManualTemplateFilename,
        rows: scenarioConfig.buildEnvManualTemplateRows,
        parse: scenarioConfig.parseEnvManualValuesCsv,
        exportedMessage: "已导出空白逐年环境价值兑现模板，可填写后重新导入。",
        lockedMessage: "当前方案已锁定，不能导入逐年环境价值兑现配置。",
        successMessage: (scenario) => `已暂存“${scenario.name}”的逐年环境价值兑现配置，请核对预览后确认并保存。`
      },
      fee: {
        fileInputRef: "feeManualFileInput",
        statusRef: "feeManualStatus",
        parsedKey: "values",
        filename: exportBuilders.buildFeeManualTemplateFilename,
        rows: scenarioConfig.buildFeeManualTemplateRows,
        parse: scenarioConfig.parseFeeManualValuesCsv,
        exportedMessage: "已导出空白逐年扣费收益模板，可填写后重新导入。",
        lockedMessage: "当前方案已锁定，不能导入逐年扣费收益配置。",
        successMessage: (scenario) => `已暂存“${scenario.name}”的逐年扣费收益配置，请核对预览后确认并保存。`
      }
    });
  }

  function getManualScenarioConfig(configs, kind) {
    return configs?.[kind] || null;
  }

  function setManualScenarioStatus(input = {}) {
    const {
      refs = {},
      config = {},
      text = ""
    } = input;
    const node = refs[config.statusRef];
    if (node) node.textContent = text;
  }

  function setScenarioImportMessage(input = {}) {
    getScenarioForm().setScenarioMessage(input);
  }

  function exportManualScenarioTemplate(input = {}) {
    const {
      kind = "",
      configs = {},
      refs = {},
      project = null,
      scenario = null,
      actions = {}
    } = input;
    const config = getManualScenarioConfig(configs, kind);
    if (!config) return false;
    if (!project) {
      actions.setTopMeta?.("请先创建或选择项目。", "warn");
      return false;
    }
    if (!scenario) return false;
    actions.downloadCsv?.(config.filename(project, scenario), config.rows(project));
    setManualScenarioStatus({ refs, config, text: config.exportedMessage });
    return true;
  }

  async function importManualScenarioTemplate(input = {}) {
    const {
      kind = "",
      configs = {},
      refs = {},
      project = null,
      scenario = null,
      actions = {}
    } = input;
    const config = getManualScenarioConfig(configs, kind);
    if (!config) return false;
    if (!project || !scenario) {
      actions.setTopMeta?.("请先创建或选择项目。", "warn");
      return false;
    }
    if (scenario.locked) {
      setScenarioImportMessage({ refs, project, scenario, text: config.lockedMessage, tone: "error" });
      return false;
    }
    const file = refs[config.fileInputRef]?.files?.[0];
    if (!file) {
      setManualScenarioStatus({ refs, config, text: "请先选择CSV或Excel文件。" });
      return false;
    }
    const target = { projectId: project.id, scenarioId: scenario.id };
    const sourceBefore = JSON.stringify([project.startYear, project.forecastYears, project.siteType, scenario.config]);
    const epoch = getScenarioForm().getManualImportEpoch(scenario);
    const version = {};
    if (!readVersions.has(scenario)) readVersions.set(scenario, {});
    readVersions.get(scenario)[kind] = version;
    const sameIdentity = () => typeof actions.getActiveProject === "function"
      && typeof actions.getActiveScenario === "function"
      && actions.getActiveProject() === project && project.id === target.projectId
      && actions.getActiveScenario(project) === scenario && scenario.id === target.scenarioId;
    const readingIsCurrent = () => readVersions.get(scenario)?.[kind] === version
      && getScenarioForm().getManualImportEpoch(scenario) === epoch;
    const targetIsCurrent = () => sameIdentity() && readingIsCurrent()
      && JSON.stringify([project.startYear, project.forecastYears, project.siteType, scenario.config]) === sourceBefore;
    const rejectChangedTarget = () => {
      // A discarded or superseded read must not resurrect a draft, nor replace
      // a newer preview / discard notice with an obsolete error message.
      if (!readingIsCurrent()) return false;
      const text = `“${file.name || "所选文件"}”导入已取消：项目、方案或参数已变化，或已有新的导入任务，请在目标方案重新核对。`;
      if (sameIdentity()) {
        setManualScenarioStatus({ refs, config, text });
        setScenarioImportMessage({ refs, project, scenario, text, tone: "error" });
      } else actions.setTopMeta?.(text, "warn");
      return false;
    };
    if (!targetIsCurrent()) return rejectChangedTarget();
    try {
      const { text } = await actions.readSpreadsheetToCsv(file);
      if (!targetIsCurrent()) return rejectChangedTarget();
      const parsed = config.parse(text, project);
      if (!parsed.ok) {
        setManualScenarioStatus({ refs, config, text: parsed.message });
        setScenarioImportMessage({ refs, project, scenario, text: parsed.message, tone: "error" });
        return false;
      }
      if (!targetIsCurrent()) return rejectChangedTarget();
      if (scenario.locked) {
        setScenarioImportMessage({ refs, project, scenario, text: config.lockedMessage, tone: "error" });
        return false;
      }
      const staged = getScenarioForm().stageManualImport({ project, scenario, kind, values: parsed[config.parsedKey],
        refs, querySelector: actions.querySelector });
      if (!staged.ok) throw new Error(staged.message);
      actions.renderDraft?.();
      getScenarioForm().renderManualImportStatus({ project, scenario, kind, node: refs[config.statusRef] });
      setScenarioImportMessage({ refs, project, scenario, text: config.successMessage(scenario), tone: "warning" });
      return true;
    } catch (error) {
      if (!targetIsCurrent()) return rejectChangedTarget();
      const message = actions.normalizeUserFacingError?.(error) || error?.message || "导入失败，请检查文件后重试。";
      setManualScenarioStatus({ refs, config, text: message });
      setScenarioImportMessage({ refs, project, scenario, text: message, tone: "error" });
      return false;
    }
  }

  return Object.freeze({
    createManualScenarioImportConfigs,
    exportManualScenarioTemplate,
    getManualScenarioConfig,
    importManualScenarioTemplate,
    setManualScenarioStatus,
    setScenarioImportMessage
  });
});
