"use strict";

(function (root, factory) {
  const csvUtils = typeof module !== "undefined" && module.exports
    ? require("./csv-utils")
    : root.NE_CSV_UTILS;
  const api = factory(csvUtils);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_EXPORT_BUILDERS = api;
  if (root.window && root.window !== root) {
    root.window.NE_EXPORT_BUILDERS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (csvUtils) {
  if (!csvUtils) {
    throw new Error("导出模块初始化失败：缺少 CSV 工具模块");
  }

  function sanitizeExportFilenamePart(value) {
    return csvUtils.sanitizeExportFilenamePart(value);
  }

  function scenarioFilename(project, scenario, suffix) {
    return `${sanitizeExportFilenamePart(project?.name || "项目")}-${sanitizeExportFilenamePart(scenario?.name || "场景")}-${suffix}.csv`;
  }

  function buildLtManualTemplateFilename(project, scenario) {
    return scenarioFilename(project, scenario, "交易策略逐年损益模板");
  }

  function buildEnvManualTemplateFilename(project, scenario) {
    return scenarioFilename(project, scenario, "环境价值逐年兑现模板");
  }

  function buildFeeManualTemplateFilename(project, scenario) {
    return scenarioFilename(project, scenario, "逐年扣费收益模板");
  }

  function buildAnnualResultExportFilename(project, scenario) {
    return scenarioFilename(project, scenario, "年度收入");
  }

  function buildHourlyResultExportFilename(project, scenario) {
    return scenarioFilename(project, scenario, "首年8760小时明细");
  }

  function withSourceMetadata(rows, result, options) {
    if (!options.includeSource) return rows;
    const source = result.sourceContext || {};
    const headers = ["generated_at", "project_id", "scenario_id", "price_run_id", "input_fingerprint"];
    const values = [source.generatedAt, source.projectId, source.scenarioId, source.runId, source.contextFingerprint].map((value) => value || "");
    return rows.map((row, index) => [...row, ...(index === 0 ? headers : values)]);
  }

  function withDispatchColumns(rows, details, fields) {
    if (!details.some(Boolean)) return rows;
    return rows.map((row, index) => [...row, ...fields.map(([column, key, digits]) => {
      if (index === 0) return column;
      const value = details[index - 1]?.[key];
      return Number.isFinite(value) ? value.toFixed(digits) : "";
    })]);
  }

  function buildAnnualResultExportRows(result, options = {}) {
    const rows = Array.isArray(result?.annualRows) ? result.annualRows : [];
    const baseRows = [
      ["year", "annual_hours_h", "energy_mwh", "spot_avg_price", "capture_price", "spot_revenue", "mechanism_revenue", "lt_pnl_revenue", "env_revenue", "storage_supplement_revenue", "comprehensive_fee", "other_income", "full_revenue", "full_revenue_price"],
      ...rows.map((row) => [
        row.year,
        Number(row.annualHours || 0).toFixed(6),
        Number(row.energyMwh || 0).toFixed(6),
        Number(row.spotAvgPrice || 0).toFixed(6),
        Number(row.capturePrice || 0).toFixed(6),
        Number(row.spotRevenue || 0).toFixed(2),
        Number(row.mechanismRevenue || 0).toFixed(2),
        Number(row.ltPnlRevenue || 0).toFixed(2),
        Number(row.envRevenue || 0).toFixed(2),
        Number(row.storageSupplementRevenue || 0).toFixed(2),
        Number(row.comprehensiveFee || 0).toFixed(2),
        Number(row.otherIncome || 0).toFixed(2),
        Number(row.fullRevenue || 0).toFixed(2),
        Number(row.fullRevenuePrice || 0).toFixed(6)
      ])
    ];
    const exported = withDispatchColumns(baseRows, rows.map((row) => row.storageDispatch), [
      ["storage_power_mw", "powerMw", 6], ["storage_duration_h", "durationH", 6],
      ["storage_capacity_mwh", "capacityMwh", 6], ["storage_round_trip_efficiency_ratio", "roundTripEfficiency", 6],
      ["storage_charge_mwh", "chargeMwh", 6], ["storage_discharge_mwh", "dischargeMwh", 6],
      ["storage_charge_opportunity_cost", "chargeOpportunityCost", 2], ["storage_discharge_revenue", "dischargeRevenue", 2],
      ["storage_spot_increment", "incrementalRevenue", 2], ["storage_independent_revenue", "independentSupplementRevenue", 2],
      ["without_storage_spot_revenue", "withoutStorageSpotRevenue", 2], ["with_storage_spot_revenue", "withStorageSpotRevenue", 2],
      ["without_storage_full_revenue", "withoutStorageFullRevenue", 2], ["with_storage_full_revenue", "withStorageFullRevenue", 2]
    ]);
    return withSourceMetadata(exported, result, options);
  }

  function buildHourlyResultExportRows(result, options = {}) {
    const rows = Array.isArray(result?.hourlyPreview) ? result.hourlyPreview : [];
    const baseRows = [
      ["time", "equivalent_hours_h", "energy_mwh", "spot_price_yuan_per_mwh", "spot_revenue", "full_revenue"],
      ...rows.map((row) => [
        row.time,
        Number(row.equivalentHours || 0).toFixed(6),
        Number(row.energyMwh || 0).toFixed(6),
        Number(row.spotPrice || 0).toFixed(6),
        Number(row.spotRevenue || 0).toFixed(2),
        Number(row.fullRevenue || 0).toFixed(2)
      ])
    ];
    const exported = withDispatchColumns(baseRows, rows.map((row) => row.storageDispatch), [
      ["storage_charge_mwh", "chargeMwh", 6], ["storage_discharge_mwh", "dischargeMwh", 6],
      ["storage_soc_mwh", "socMwh", 6], ["net_export_with_storage_mwh", "netExportMwh", 6],
      ["storage_spot_increment", "incrementalRevenue", 2], ["with_storage_spot_revenue", "withStorageSpotRevenue", 2]
    ]);
    return withSourceMetadata(exported, result, options);
  }

  return Object.freeze({
    sanitizeExportFilenamePart,
    buildLtManualTemplateFilename,
    buildEnvManualTemplateFilename,
    buildFeeManualTemplateFilename,
    buildAnnualResultExportFilename,
    buildHourlyResultExportFilename,
    buildAnnualResultExportRows,
    buildHourlyResultExportRows
  });
});
