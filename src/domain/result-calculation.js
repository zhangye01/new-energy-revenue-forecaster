"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_RESULT_CALCULATION = api;
  if (root.window && root.window !== root) {
    root.window.NE_RESULT_CALCULATION = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function incompleteMessage(label, completeness) {
    return `请先导入完整的逐年${label}（当前 ${completeness.complete}/${completeness.total} 年）。`;
  }

  function validateManualCompleteness(input = {}) {
    const {
      project = null,
      config = {},
      scenarioConfig = {}
    } = input;
    const checks = [
      {
        mode: scenarioConfig.getLtPricingMode?.(config),
        completeness: () => scenarioConfig.getLtManualCompleteness?.(project, config),
        label: "交易策略损益值"
      },
      {
        mode: scenarioConfig.getEnvValueMode?.(config),
        completeness: () => scenarioConfig.getEnvManualCompleteness?.(project, config),
        label: "环境价值兑现配置"
      },
      {
        mode: scenarioConfig.getFeeConfigMode?.(config),
        completeness: () => scenarioConfig.getFeeManualCompleteness?.(project, config),
        label: "扣费收益配置"
      }
    ];
    for (const check of checks) {
      if (check.mode !== "manual") continue;
      const completeness = check.completeness() || { complete: 0, total: 0 };
      if (completeness.complete !== completeness.total) {
        return {
          ok: false,
          message: incompleteMessage(check.label, completeness)
        };
      }
    }
    return { ok: true, message: "" };
  }

  function validateSavedEnergy(project) {
    const { startYear, forecastYears } = project || {};
    if (!Number.isInteger(startYear) || !Number.isInteger(forecastYears) || forecastYears < 1) {
      return { ok: false, message: "请先保存有效的项目测算周期。" };
    }
    let complete = 0;
    for (let index = 0; index < forecastYears; index += 1) {
      const hours = project.energyData?.hourlyByYear?.[startYear + index];
      if (!Array.isArray(hours) || hours.length !== 8760) continue;
      let total = 0;
      for (const value of hours) {
        if (!Number.isFinite(value) || value < 0) { total = NaN; break; }
        total += value;
      }
      if (Number.isFinite(total)) complete += 1;
    }
    return complete === forecastYears ? { ok: true, message: "" } : {
      ok: false,
      message: `请先在结算电量页保存完整的逐年8760小时上网电量（当前 ${complete}/${forecastYears} 年），再发起正式测算。`
    };
  }

  function validateCalculationReadiness(input = {}) {
    const {
      project = null,
      scenario = null,
      run = null,
      scenarioConfig = {}
    } = input;
    if (!project) {
      return { ok: false, message: "请先选择项目后再发起测算。" };
    }
    if (!scenario) {
      return { ok: false, message: "请先在收益参数补充与细化页保存至少一个配置方案。" };
    }
    if (!run) {
      return { ok: false, message: "请先在电价预测工作台生成并生效一个电价版本。" };
    }
    const energy = validateSavedEnergy(project);
    if (!energy.ok) return energy;
    const errors = input.validateConfig?.(project, scenario.config) || [];
    if (errors.length) return { ok: false, message: `请先补充或修正收益参数：${errors.join("；")}` };
    const manual = validateManualCompleteness({
      project,
      config: scenario.config || {},
      scenarioConfig
    });
    if (!manual.ok) return manual;
    if (input.scenarioConfirmed !== true) {
      return { ok: false, message: "请先在收益参数补充与细化页确认并保存全部适用参数，再发起正式测算。" };
    }
    return { ok: true, message: "" };
  }

  function formatYearListCompact(years) {
    const sorted = Array.from(new Set((years || []).map((year) => Number(year)).filter(Number.isInteger))).sort((a, b) => a - b);
    const ranges = [];
    let start = null;
    let prev = null;
    sorted.forEach((year) => {
      if (start === null) {
        start = year;
        prev = year;
        return;
      }
      if (year === prev + 1) {
        prev = year;
        return;
      }
      ranges.push(start === prev ? String(start) : `${start}-${prev}`);
      start = year;
      prev = year;
    });
    if (start !== null) {
      ranges.push(start === prev ? String(start) : `${start}-${prev}`);
    }
    return ranges.join("、");
  }

  function buildMissingCurveMessage(result = {}) {
    const pieces = [];
    if (result.missingEnergyYears?.length) {
      pieces.push(`缺失上网电量曲线：${formatYearListCompact(result.missingEnergyYears)}`);
    }
    if (result.missingPriceYears?.length) {
      pieces.push(`缺失生效电价曲线：${formatYearListCompact(result.missingPriceYears)}`);
    }
    if (!pieces.length && result.missingYears?.length) {
      pieces.push(`缺失年份：${formatYearListCompact(result.missingYears)}`);
    }
    return pieces.length ? `测算失败：${pieces.join("；")}` : "";
  }

  return Object.freeze({
    buildMissingCurveMessage,
    formatYearListCompact,
    validateSavedEnergy,
    validateCalculationReadiness,
    validateManualCompleteness
  });
});
