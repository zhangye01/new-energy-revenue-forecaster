"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_ENERGY_TEMPLATE_FLOW = api;
  if (root.window && root.window !== root) {
    root.window.NE_ENERGY_TEMPLATE_FLOW = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function exportEnergyTemplate(input = {}) {
    const {
      mode = "hourly_8760",
      project = null,
      services = {},
      actions = {}
    } = input;
    if (!project) {
      actions.setEnergyImportMessage?.("请先创建或进入项目，再导出模板。", "error");
      return false;
    }
    if (!services.isProjectCreateCompleted?.(project)) {
      actions.setEnergyImportMessage?.("请先完成步骤1基础信息保存，再导出模板。", "warn");
      return false;
    }
    const normalizedMode = services.normalizeEnergyMode?.(mode) || mode;
    const rows = services.buildEnergyTemplateRows?.(project, normalizedMode) || [];
    actions.downloadCsv?.(services.buildEnergyTemplateFilename?.(project, normalizedMode), rows);
    const exports = services.ensureProjectEnergyTemplateExports?.(project) || {};
    exports[normalizedMode] = new Date().toISOString();
    const meta = services.getEnergyModeMeta?.(normalizedMode) || {};
    actions.setEnergyImportMessage?.(
      `模板已导出（${meta.label || normalizedMode}）：${meta.header || ""}（${project.startYear}-${project.startYear + project.forecastYears - 1}）`,
      "success"
    );
    return true;
  }

  async function importEnergyFromFile(input = {}) {
    const {
      mode = "hourly_8760",
      inputElement = null,
      actions = {}
    } = input;
    const file = inputElement?.files?.[0];
    if (!file) {
      actions.setEnergyImportMessage?.("请先选择CSV或Excel文件。", "error");
      return false;
    }

    try {
      const output = await actions.readSpreadsheetToCsv?.(file);
      const text = String(output?.text || "").trim();
      if (!text) {
        actions.setEnergyImportMessage?.("文件内容为空，请检查模板后重试。", "error");
        return false;
      }
      const source = String(output?.source || "");
      const sourceLabel = source.startsWith("excel:") ? source.slice(6) : file.name;
      const imported = actions.importEnergyDataFromText?.(mode, text, sourceLabel);
      if (imported && inputElement) {
        inputElement.value = "";
      }
      return Boolean(imported);
    } catch (error) {
      actions.setEnergyImportMessage?.(error?.message || "文件读取失败，请检查格式后重试。", "error");
      return false;
    }
  }

  function buildEnergySampleRows(input = {}) {
    const {
      mode = "annual_hours",
      project = {},
      services = {}
    } = input;
    const normalizedMode = services.normalizeEnergyMode?.(mode) || mode;
    const rows = [];
    if (normalizedMode === "annual_hours") {
      rows.push(["year", "annual_hours_h"]);
      for (let i = 0; i < project.forecastYears; i += 1) {
        const year = project.startYear + i;
        const annual = (project.assetType === "wind" ? 2400 : 1300) * Math.pow(0.997, i);
        rows.push([year, annual.toFixed(2)]);
      }
      return rows;
    }

    const annualHours = project.assetType === "wind" ? 2400 : 1300;
    const values = services.generateHourlyHoursFromAnnual?.(annualHours, project.assetType, project.startYear) || [];
    if (normalizedMode === "typical_curve_8760") {
      rows.push(["hour_index", "equivalent_hours_h"]);
      values.forEach((value, index) => {
        rows.push([index + 1, Number(value).toFixed(6)]);
      });
      return rows;
    }

    const year = project.startYear;
    rows.push(["year", "hour_index", "equivalent_hours_h"]);
    values.forEach((value, index) => {
      rows.push([year, index + 1, Number(value).toFixed(6)]);
    });
    return rows;
  }

  function downloadEnergySampleFile(input = {}) {
    const {
      mode = "annual_hours",
      project = null,
      services = {},
      actions = {}
    } = input;
    if (!project) return false;
    const normalizedMode = services.normalizeEnergyMode?.(mode) || mode;
    const rows = buildEnergySampleRows({ mode: normalizedMode, project, services });
    const filename = String(services.buildEnergyTemplateFilename?.(project, normalizedMode) || "energy-template.csv")
      .replace(".csv", "-示例.csv");
    actions.downloadCsv?.(filename, rows);
    return true;
  }

  function applyProvinceTypicalCurve(input = {}) {
    const {
      project = null,
      appState = {},
      services = {},
      actions = {}
    } = input;
    if (!project) {
      actions.setEnergyImportMessage?.("请先进入项目。", "error");
      return false;
    }
    if (!services.isProjectCreateCompleted?.(project)) {
      actions.setEnergyImportMessage?.("请先完成步骤1基础信息保存，再调用所选省份典型曲线。", "warn");
      return false;
    }
    const annualCount = services.getAnnualInputYearCount?.(project) || 0;
    if (annualCount !== project.forecastYears) {
      actions.setEnergyImportMessage?.(`请先完成逐年总量模板导入。当前仅录入 ${annualCount}/${project.forecastYears} 年。`, "warn");
      return false;
    }
    const energyData = services.ensureProjectEnergyDataState?.(project);
    const curveRecord = services.getProvinceTypicalCurveRecord?.(project);
    if (!curveRecord?.profile?.length) {
      actions.setEnergyImportMessage?.("当前项目未匹配到可调用的省份典型曲线，请检查省份、风/光类型和陆/海类型。", "error");
      return false;
    }
    energyData.typicalCurveProfile = curveRecord.profile;
    energyData.typicalCurveSource = "province_typical_curve";
    appState.energyStep2Choice = "province";
    services.rebuildProjectEnergyData?.(project);
    const exports = services.ensureProjectEnergyTemplateExports?.(project) || {};
    exports.province_typical_curve = new Date().toISOString();
    const completeYears = services.countCompleteEnergyYears?.(project) || 0;
    if (!project.statuses || typeof project.statuses !== "object") {
      project.statuses = {};
    }
    project.statuses["energy-page"] = completeYears === project.forecastYears ? "completed" : "in_progress";
    if (services.isProjectCreateCompleted?.(project) && project.statuses["history-page"] === "not_started") {
      project.statuses["history-page"] = "in_progress";
    }
    services.markDownstreamStale?.(project, "energy-page");
    actions.setEnergyImportMessage?.(
      `已调用 ${curveRecord.sourceLabel}，已生成 ${completeYears}/${project.forecastYears} 年上网电量。`,
      completeYears === project.forecastYears ? "success" : "warn"
    );
    actions.renderAll?.();
    return true;
  }

  return Object.freeze({
    applyProvinceTypicalCurve,
    buildEnergySampleRows,
    downloadEnergySampleFile,
    exportEnergyTemplate,
    importEnergyFromFile
  });
});
