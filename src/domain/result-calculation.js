"use strict";

(function (root, factory) {
  const commonJs = typeof module !== "undefined" && module.exports;
  const api = factory(
    commonJs ? require("./revenue-calculator") : root.NE_REVENUE_CALCULATOR,
    commonJs ? require("./storage-dispatch") : root.NE_STORAGE_DISPATCH
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_RESULT_CALCULATION = api;
  if (root.window && root.window !== root) {
    root.window.NE_RESULT_CALCULATION = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (calculator, dispatch) {
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

  function closeAmount(a, b) {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 1e-9);
  }

  function closeStorageQuantity(a, b) {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-7, Math.abs(b) * 1e-9);
  }

  function annualStorageIsComplete(project, config, row) {
    const stored = row.storageDispatch;
    // Historical results used a uniform storage supplement and have no dispatch record.
    if (!stored) return true;
    if (!project.hasStorage || stored.version !== dispatch.ALGORITHM_VERSION) return false;
    const scheme = { powerMw: project.storagePowerMw, durationH: project.storageDurationH,
      capacityMwh: project.storagePowerMw * project.storageDurationH,
      roundTripEfficiency: config.storageRoundTripEfficiency ?? 0.9 };
    if (!Object.entries(scheme).every(([key, value]) => closeStorageQuantity(stored[key], value)) ||
        scheme.powerMw < 0 || !(scheme.durationH > 0) || !(scheme.roundTripEfficiency > 0 && scheme.roundTripEfficiency <= 1) ||
        ![stored.chargeMwh, stored.dischargeMwh].every((value) => Number.isFinite(value) && value >= 0) ||
        (stored.chargeMwh > row.energyMwh && !closeStorageQuantity(stored.chargeMwh, row.energyMwh)) ||
        !closeStorageQuantity(stored.dischargeMwh, stored.chargeMwh * scheme.roundTripEfficiency)) return false;
    const independent = row.energyMwh * ["storageCapacityCompPrice", "storageAncillaryRevenuePrice", "storageOtherRevenuePrice"]
      .reduce((sum, key) => sum + Number(config[key] || 0), 0);
    const expected = {
      incrementalRevenue: stored.dischargeRevenue - stored.chargeOpportunityCost,
      independentSupplementRevenue: independent,
      withoutStorageSpotRevenue: row.spotRevenue,
      withStorageSpotRevenue: row.spotRevenue + stored.incrementalRevenue,
      withoutStorageFullRevenue: row.fullRevenue - row.storageSupplementRevenue,
      withStorageFullRevenue: row.fullRevenue
    };
    return Object.entries(expected).every(([key, value]) => closeAmount(stored[key], value)) &&
      closeAmount(row.storageSupplementRevenue, independent + stored.incrementalRevenue);
  }

  function verifiedHourlyDispatch(project, scenario, rows, first) {
    if (!first.storageDispatch) return [];
    try {
      // Rebuild from raw hourly prices and generation before trusting saved dispatch amounts.
      const rebuilt = dispatch.calculateHourlyDispatch({
        prices: rows.map((row) => row?.spotPrice), generationMwh: rows.map((row) => row?.energyMwh),
        powerMw: project.storagePowerMw, durationH: project.storageDurationH,
        roundTripEfficiency: scenario.config.storageRoundTripEfficiency ?? 0.9, includeHourly: true
      });
      const quantities = ["chargeMwh", "dischargeMwh"], amounts = ["chargeOpportunityCost", "dischargeRevenue", "incrementalRevenue"];
      return quantities.every((key) => closeStorageQuantity(first.storageDispatch[key], rebuilt[key])) &&
        amounts.every((key) => closeAmount(first.storageDispatch[key], rebuilt[key])) ? rebuilt.hourly : null;
    } catch (_) {
      return null;
    }
  }

  function hourlyStorageIsComplete(row, scheduled) {
    if (!scheduled) return !row.storageDispatch;
    const stored = row.storageDispatch;
    return Boolean(stored) && ["chargeMwh", "dischargeMwh", "socMwh"].every((key) => closeStorageQuantity(stored[key], scheduled[key])) &&
      closeAmount(stored.incrementalRevenue, scheduled.incrementalRevenue) &&
      closeStorageQuantity(stored.netExportMwh, row.energyMwh - scheduled.chargeMwh + scheduled.dischargeMwh) &&
      closeAmount(stored.withStorageSpotRevenue, row.spotRevenue + scheduled.incrementalRevenue);
  }

  function hourlyRowsAreComplete(project, scenario, result) {
    const rows = result?.hourlyPreview, first = result?.annualRows?.[0];
    if (!project || !scenario?.config || !Array.isArray(rows) || rows.length !== 8760 || !first ||
        !annualStorageIsComplete(project, scenario.config, first)) return false;
    const scheduled = verifiedHourlyDispatch(project, scenario, rows, first);
    if (!scheduled) return false;
    const dispatchRevenue = first.storageDispatch?.incrementalRevenue ?? 0;
    const adjustment = first.energyMwh > 0 ? (first.fullRevenue - first.spotRevenue - dispatchRevenue) / first.energyMwh : 0;
    const totals = { energyMwh: 0, spotRevenue: 0, fullRevenue: 0, spotPrice: 0 };
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row || row.time !== calculator.hourIndexToTimestamp(first.year, index) ||
          ![row.equivalentHours, row.energyMwh, row.spotPrice, row.spotRevenue, row.fullRevenue].every(Number.isFinite) ||
          row.energyMwh < 0 || !closeAmount(row.energyMwh, row.equivalentHours * project.capacityMw) ||
          !closeAmount(row.spotRevenue, row.energyMwh * row.spotPrice) ||
          !hourlyStorageIsComplete(row, scheduled[index]) ||
          !closeAmount(row.fullRevenue, row.spotRevenue + row.energyMwh * adjustment + (scheduled[index]?.incrementalRevenue ?? 0))) return false;
      Object.keys(totals).forEach((key) => { totals[key] += row[key]; });
    }
    return closeAmount(totals.energyMwh, first.energyMwh) && closeAmount(totals.spotRevenue, first.spotRevenue) &&
      closeAmount(totals.fullRevenue, first.fullRevenue) && closeAmount(totals.spotPrice / 8760, first.spotAvgPrice);
  }

  return Object.freeze({
    annualStorageIsComplete,
    buildMissingCurveMessage,
    closeAmount,
    formatYearListCompact,
    hourlyRowsAreComplete,
    validateSavedEnergy,
    validateCalculationReadiness,
    validateManualCompleteness
  });
});
