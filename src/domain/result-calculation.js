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
      return { ok: false, message: "请先在全口径收入配置页保存至少一个配置方案。" };
    }
    if (!run) {
      return { ok: false, message: "请先在电价预测工作台生成并生效一个电价版本。" };
    }
    return validateManualCompleteness({
      project,
      config: scenario.config || {},
      scenarioConfig
    });
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
    validateCalculationReadiness,
    validateManualCompleteness
  });
});
