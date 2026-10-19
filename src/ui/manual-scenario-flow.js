"use strict";

(function (root, factory) {
  const getScenarioModel = () => typeof module !== "undefined" && module.exports
    ? require("../domain/scenario-model") : root.NE_SCENARIO_MODEL;
  const api = factory(getScenarioModel);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_MANUAL_SCENARIO_FLOW = api;
  if (root.window && root.window !== root) {
    root.window.NE_MANUAL_SCENARIO_FLOW = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (getScenarioModel) {
  function createManualScenarioImportConfigs(input = {}) {
    const {
      exportBuilders = {},
      scenarioConfig = {}
    } = input;
    return Object.freeze({
      lt: {
        fileInputRef: "ltManualFileInput",
        statusRef: "ltManualStatus",
        modeKey: "ltPricingMode",
        valuesKey: "ltManualPricesByYear",
        parsedKey: "prices",
        filename: exportBuilders.buildLtManualTemplateFilename,
        rows: scenarioConfig.buildLtManualTemplateRows,
        parse: scenarioConfig.parseLtManualPricesCsv,
        exportedMessage: "已导出空白逐年损益模板，可填写后重新导入。",
        lockedMessage: "当前场景已锁定，不能导入逐年损益。",
        successMessage: (scenario) => `已导入“${scenario.name}”的逐年交易策略损益值，请确认后保存当前配置。`
      },
      env: {
        fileInputRef: "envManualFileInput",
        statusRef: "envManualStatus",
        modeKey: "envValueMode",
        valuesKey: "envManualValuesByYear",
        parsedKey: "values",
        filename: exportBuilders.buildEnvManualTemplateFilename,
        rows: scenarioConfig.buildEnvManualTemplateRows,
        parse: scenarioConfig.parseEnvManualValuesCsv,
        exportedMessage: "已导出空白逐年环境价值兑现模板，可填写后重新导入。",
        lockedMessage: "当前场景已锁定，不能导入逐年环境价值兑现配置。",
        successMessage: (scenario) => `已导入“${scenario.name}”的逐年环境价值兑现配置，请确认后保存当前配置。`
      },
      fee: {
        fileInputRef: "feeManualFileInput",
        statusRef: "feeManualStatus",
        modeKey: "feeConfigMode",
        valuesKey: "feeManualValuesByYear",
        parsedKey: "values",
        filename: exportBuilders.buildFeeManualTemplateFilename,
        rows: scenarioConfig.buildFeeManualTemplateRows,
        parse: scenarioConfig.parseFeeManualValuesCsv,
        exportedMessage: "已导出空白逐年扣费收益模板，可填写后重新导入。",
        lockedMessage: "当前场景已锁定，不能导入逐年扣费收益配置。",
        successMessage: (scenario) => `已导入“${scenario.name}”的逐年扣费收益配置，请确认后保存当前配置。`
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
    const {
      refs = {},
      text = "",
      tone = "error"
    } = input;
    const node = refs.scenarioMessage;
    if (!node) return;
    node.textContent = text;
    node.style.borderColor = tone === "success" ? "#8fb48d" : "#d39191";
    node.style.background = tone === "success" ? "#f1fbf1" : "#fff2f2";
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
      setScenarioImportMessage({ refs, text: config.lockedMessage, tone: "error" });
      return false;
    }
    const file = refs[config.fileInputRef]?.files?.[0];
    if (!file) {
      setManualScenarioStatus({ refs, config, text: "请先选择CSV或Excel文件。" });
      return false;
    }
    try {
      const { text } = await actions.readSpreadsheetToCsv(file);
      const parsed = config.parse(text, project);
      if (!parsed.ok) {
        setManualScenarioStatus({ refs, config, text: parsed.message });
        setScenarioImportMessage({ refs, text: parsed.message, tone: "error" });
        return false;
      }
      if (scenario.locked) {
        setScenarioImportMessage({ refs, text: config.lockedMessage, tone: "error" });
        return false;
      }
      if (!scenario.config || typeof scenario.config !== "object") {
        scenario.config = {};
      }
      scenario.config[config.modeKey] = "manual";
      scenario.config[config.valuesKey] = parsed[config.parsedKey];
      getScenarioModel().confirmConfig(scenario, [config.modeKey, config.valuesKey]);
      scenario.updatedAt = new Date().toISOString();
      if (!project.statuses || typeof project.statuses !== "object") {
        project.statuses = {};
      }
      project.statuses["scenario-page"] = "in_progress";
      actions.markDownstreamStale?.(project, "scenario-page");
      setScenarioImportMessage({ refs, text: config.successMessage(scenario), tone: "success" });
      actions.renderAll?.();
      actions.schedulePersistAppData?.();
      return true;
    } catch (error) {
      const message = actions.normalizeUserFacingError?.(error) || error?.message || "导入失败，请检查文件后重试。";
      setManualScenarioStatus({ refs, config, text: message });
      setScenarioImportMessage({ refs, text: message, tone: "error" });
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
