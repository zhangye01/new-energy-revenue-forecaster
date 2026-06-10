"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_ENERGY_IMPORT_FLOW = api;
  if (root.window && root.window !== root) {
    root.window.NE_ENERGY_IMPORT_FLOW = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function fail(message, level = "error") {
    return { ok: false, message, level };
  }

  function importEnergyDataFromText(input = {}) {
    const {
      project,
      mode,
      csvText,
      sourceLabel = "",
      appState = {},
      services = {}
    } = input;
    if (!project) return fail("请先创建项目。");
    if (!services.isProjectCreateCompleted(project)) {
      return fail("请先完成步骤1基础信息保存，再进行结算电量配置。", "warn");
    }
    const normalizedMode = services.normalizeEnergyMode(mode);
    const parsed = services.validateAndBuildEnergyData(project, csvText, normalizedMode);

    if (!parsed.ok) return fail(parsed.message);

    const periodAligned = normalizedMode === "annual_hours"
      ? services.alignDefaultForecastYearsToAnnualTemplate(project, parsed.annualInputByYear, sourceLabel)
      : false;
    const exportMarks = services.ensureProjectEnergyTemplateExports(project);
    if (!exportMarks[normalizedMode]) {
      exportMarks[normalizedMode] = new Date().toISOString();
    }
    const energyData = services.ensureProjectEnergyDataState(project);

    if (normalizedMode === "annual_hours") {
      energyData.annualInputByYear = parsed.annualInputByYear;
      if (!services.hasEnergyTypicalCurve(project)) {
        energyData.typicalCurveSource = "";
        energyData.typicalCurveProfile = [];
      }
      services.rebuildProjectEnergyData(project);
    } else if (normalizedMode === "typical_curve_8760") {
      energyData.typicalCurveProfile = parsed.typicalCurveProfile;
      energyData.typicalCurveSource = "typical_curve_8760";
      appState.energyStep2Choice = "typical";
      services.rebuildProjectEnergyData(project);
    } else {
      energyData.mode = normalizedMode;
      energyData.hourlyByYear = parsed.hourlyByYear;
      energyData.annualSummary = parsed.annualSummary;
      energyData.annualInputByYear = parsed.annualInputByYear || {};
    }

    const completeYears = services.countCompleteEnergyYears(project);
    const allComplete = completeYears === project.forecastYears;
    project.statuses["energy-page"] = allComplete ? "completed" : "in_progress";
    if (services.isProjectCreateCompleted(project) && project.statuses["history-page"] === "not_started") {
      project.statuses["history-page"] = "in_progress";
    }
    services.markDownstreamStale(project, "energy-page");

    const annualCount = services.getAnnualInputYearCount(project);
    if (normalizedMode === "annual_hours") {
      const annualReady = annualCount === project.forecastYears;
      const periodText = periodAligned ? `已按模板年份识别当前测算周期为 ${project.forecastYears} 年。` : "";
      return {
        ok: true,
        level: annualReady ? "success" : "warn",
        message: annualReady
          ? `逐年总量导入成功：已录入 ${annualCount}/${project.forecastYears} 年${sourceLabel ? `（来源：${sourceLabel}）` : ""}。${periodText}请继续第二步：导入典型年8760模板，或调用所选省份典型曲线。`
          : `逐年总量部分导入成功：已录入 ${annualCount}/${project.forecastYears} 年${sourceLabel ? `（来源：${sourceLabel}）` : ""}。${periodText}请先补齐测算周期内全部年度总小时数。`
      };
    }

    const missingYears = services.listMissingEnergyYears(project, 6);
    const missingText = missingYears.length ? `；待补年份：${missingYears.join("、")}` : "";
    const curveSourceText = energyData.typicalCurveSource === "province_typical_curve" ? "所选省份典型曲线" : "典型年8760模板";
    return {
      ok: true,
      level: allComplete ? "success" : "warn",
      message: allComplete
        ? `上网电量配置完成：逐年总量 + ${curveSourceText} 已生成 ${completeYears}/${project.forecastYears} 年上网电量${sourceLabel ? `（来源：${sourceLabel}）` : ""}。`
        : `已导入 ${curveSourceText}，当前完成 ${completeYears}/${project.forecastYears} 年上网电量${missingText}${sourceLabel ? `（来源：${sourceLabel}）` : ""}。`
    };
  }

  return Object.freeze({
    importEnergyDataFromText
  });
});
