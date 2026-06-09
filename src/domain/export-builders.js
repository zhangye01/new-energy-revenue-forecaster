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

  function buildAnnualResultExportRows(result) {
    const rows = Array.isArray(result?.annualRows) ? result.annualRows : [];
    return [
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
  }

  function buildHourlyResultExportRows(result) {
    const rows = Array.isArray(result?.hourlyPreview) ? result.hourlyPreview : [];
    return [
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
