"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_PROJECT_DISPLAY = api;
  if (root.window && root.window !== root) {
    root.window.NE_PROJECT_DISPLAY = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function getProvinceName(provinces = [], key) {
    return provinces.find((item) => item.key === key)?.name || key;
  }

  function getAssetTypeLabel(key) {
    if (key === "wind") return "风电";
    if (key === "photovoltaic") return "光伏";
    return "待选";
  }

  function getSiteTypeLabel(key) {
    if (key === "offshore") return "海上";
    if (key === "onshore") return "陆上";
    return "待选";
  }

  function describeProvinceTypicalCurve(project, provinces = []) {
    return `${getProvinceName(provinces, project?.province)} / ${getAssetTypeLabel(project?.assetType)} / ${getSiteTypeLabel(project?.siteType)}`;
  }

  function formatExportStatusTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).replace(/\//g, "-");
  }

  function getForecastPeriodDisplayRange(project) {
    if (!project || !Number.isInteger(project.startYear) || !Number.isInteger(project.forecastYears) || project.forecastYears < 1) {
      return "-";
    }
    return `${project.startYear}-${project.startYear + project.forecastYears - 1}`;
  }

  function createProjectDisplayHelpers(options = {}) {
    const provinces = Array.isArray(options.provinces) ? options.provinces : [];
    return Object.freeze({
      getProvinceName: (key) => getProvinceName(provinces, key),
      getAssetTypeLabel,
      getSiteTypeLabel,
      describeProvinceTypicalCurve: (project) => describeProvinceTypicalCurve(project, provinces),
      formatExportStatusTime,
      getForecastPeriodDisplayRange
    });
  }

  return Object.freeze({
    getProvinceName,
    getAssetTypeLabel,
    getSiteTypeLabel,
    describeProvinceTypicalCurve,
    formatExportStatusTime,
    getForecastPeriodDisplayRange,
    createProjectDisplayHelpers
  });
});
