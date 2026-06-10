"use strict";

const config = window.NE_CONFIG;
const runtime = window.NE_RUNTIME;

if (!config || !runtime || !runtime.appState || !runtime.refs) {
  throw new Error("应用初始化失败：缺少 config.js 或 runtime.js");
}

const {
  PAGE_TITLES,
  PAGE_GROUPS,
  PAGE_HELP_TEXTS,
  WORKFLOW_PAGES,
  REQUIRES_PROJECT,
  REQUIRES_LOGIN,
  AUTH_STORAGE_KEY,
  SIDEBAR_GROUP_STORAGE_KEY_GUEST,
  SIDEBAR_GROUP_STORAGE_KEY_AUTH,
  THEME_SEQUENCE,
  THEME_LABELS,
  PROVINCES,
  POLICY_REGIONS,
  PROVINCE_BENCHMARKS,
  POLICY_CARDS,
  QUALITY_GATE,
  PROVINCE_DEFAULT_PARAMS,
  BATCH_PARAM_SPECS
} = config;
const PAGE_HELP_MAP = PAGE_HELP_TEXTS || {};

const { appState, refs } = runtime;
const energyProfiles = window.NE_ENERGY_PROFILES;
const priceForecast = window.NE_PRICE_FORECAST;
const revenueRules = window.NE_REVENUE_RULES;
const revenueCalculator = window.NE_REVENUE_CALCULATOR;
const resultReport = window.NE_RESULT_REPORT;
const compareAnalysis = window.NE_COMPARE_ANALYSIS;
const historyAnalysis = window.NE_HISTORY_ANALYSIS;
const workflowStatus = window.NE_WORKFLOW_STATUS;
const scenarioConfig = window.NE_SCENARIO_CONFIG;
const scenarioModel = window.NE_SCENARIO_MODEL;
const projectSettings = window.NE_PROJECT_SETTINGS;
const projectModel = window.NE_PROJECT_MODEL;
const energyDataRules = window.NE_ENERGY_DATA;
const energyImportFlow = window.NE_ENERGY_IMPORT_FLOW;
const csvUtils = window.NE_CSV_UTILS;
const exportBuilders = window.NE_EXPORT_BUILDERS;
const policyPanel = window.NE_POLICY_PANEL;
const provinceDefaultsView = window.NE_PROVINCE_DEFAULTS_VIEW;
const energyWorkspace = window.NE_ENERGY_WORKSPACE;
const energyCharts = window.NE_ENERGY_CHARTS;
const projectListView = window.NE_PROJECT_LIST_VIEW;
const resultPage = window.NE_RESULT_PAGE;
const resultPrint = window.NE_RESULT_PRINT;
const resultCharts = window.NE_RESULT_CHARTS;
const scenarioCharts = window.NE_SCENARIO_CHARTS;
const scenarioForm = window.NE_SCENARIO_FORM;
const scenarioVisualData = window.NE_SCENARIO_VISUAL_DATA;
const compareCharts = window.NE_COMPARE_CHARTS;
const comparePage = window.NE_COMPARE_PAGE;
const historyCharts = window.NE_HISTORY_CHARTS;
const historyPage = window.NE_HISTORY_PAGE;
const historyRenderer = window.NE_HISTORY_RENDERER;
const shellEvents = window.NE_SHELL_EVENTS;
const appStorage = window.NE_APP_STORAGE;
const appUtils = window.NE_APP_UTILS;

if (!energyProfiles || !priceForecast || !revenueRules || !revenueCalculator || !resultReport || !compareAnalysis || !historyAnalysis || !workflowStatus || !scenarioConfig || !scenarioModel || !projectSettings || !projectModel || !energyDataRules || !energyImportFlow || !csvUtils || !exportBuilders || !policyPanel || !provinceDefaultsView || !energyWorkspace || !energyCharts || !projectListView || !resultPage || !resultPrint || !resultCharts || !scenarioCharts || !scenarioForm || !scenarioVisualData || !compareCharts || !comparePage || !historyCharts || !historyPage || !historyRenderer || !shellEvents || !appStorage || !appUtils) {
  throw new Error("应用初始化失败：缺少 src/domain 业务测算模块");
}

const {
  makeId,
  cloneData,
  clamp,
  asMoney,
  asCompactMoney,
  asNum,
  asPercent,
  escapeHtml,
  isPlainObject,
  hasNonEmptyObject
} = appUtils;

const APP_DATA_STORAGE_KEY = "ne_app_data_v1";
const APP_DATA_VERSION = 1;
const APP_DATA_DB_NAME = "ne_app_data_db_v1";
const APP_DATA_DB_VERSION = 1;
const APP_DATA_DB_STORE = "snapshots";
const APP_DATA_DB_KEY = "app_data";
const appDataSnapshotStore = appStorage.createAppDataSnapshotStore({
  storageKey: APP_DATA_STORAGE_KEY,
  dbName: APP_DATA_DB_NAME,
  dbVersion: APP_DATA_DB_VERSION,
  storeName: APP_DATA_DB_STORE,
  dbKey: APP_DATA_DB_KEY
});
const OVERVIEW_AUTO_SWITCH_MS = 10000;
const PAGE_ID_SET = new Set(Object.keys(PAGE_TITLES));
const PROJECT_STATUS_SET = new Set(["not_started", "in_progress", "completed", "stale"]);
const PROJECT_WORKSPACE_BUCKET_SET = new Set(["new", "history"]);
const COMPARE_VIEW_SET = new Set(["scenario", "sensitivity"]);
const ENERGY_STEP2_CHOICE_SET = new Set(["typical", "province"]);
const PROVINCE_KEY_SET = new Set(PROVINCES.map((item) => item.key));
const POLICY_REGION_KEY_SET = new Set((POLICY_REGIONS || []).map((item) => item.key));
const ASSET_TYPE_SET = new Set(["wind", "photovoltaic"]);
const SITE_TYPE_SET = new Set(["onshore", "offshore"]);
const ENERGY_MODE_SET = new Set(["hourly_8760", "annual_hours", "typical_curve_8760", "province_typical_curve"]);
const LT_PRICING_MODE_SET = new Set(["auto", "manual"]);
const ENV_VALUE_MODE_SET = new Set(["global", "manual"]);
const FEE_CONFIG_MODE_SET = new Set(["global", "manual"]);
const RESULT_REPORT_VIEW_SET = new Set(["annual", "price", "detail"]);
const ENV_VALUE_RATIO_KEYS = new Set(["greenCertRealizeRatio", "greenPremiumRealizeRatio", "carbonRealizeRatio"]);
const MAP_LEVEL_SET = new Set(["nation", "province"]);
const HISTORY_MONTH_LABELS = historyAnalysis.HISTORY_MONTH_LABELS;
const HISTORY_HEAT_HOUR_LABELS = historyAnalysis.HISTORY_HEAT_HOUR_LABELS;
const HISTORY_QUARTER_LABELS = historyAnalysis.HISTORY_QUARTER_LABELS;
const ENERGY_MONTH_DAY_COUNTS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ENERGY_HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => `${hour}时`);
const ECHARTS_MAP_BASE_URLS = [
  "https://fastly.jsdelivr.net/npm/echarts/map/json",
  "https://unpkg.com/echarts@5.5.0/map/json"
];
const PROVINCE_GEO_FILE_MAP = {
  beijing: "beijing",
  tianjin: "tianjin",
  hebei: "hebei",
  shanxi: "shanxi",
  inner_mongolia: "neimenggu",
  liaoning: "liaoning",
  jilin: "jilin",
  heilongjiang: "heilongjiang",
  shanghai: "shanghai",
  jiangsu: "jiangsu",
  zhejiang: "zhejiang",
  anhui: "anhui",
  fujian: "fujian",
  jiangxi: "jiangxi",
  shandong: "shandong",
  henan: "henan",
  hubei: "hubei",
  hunan: "hunan",
  guangdong: "guangdong",
  guangxi: "guangxi",
  hainan: "hainan",
  chongqing: "chongqing",
  sichuan: "sichuan",
  guizhou: "guizhou",
  yunnan: "yunnan",
  tibet: "xizang",
  shaanxi: "shanxi1",
  gansu: "gansu",
  qinghai: "qinghai",
  ningxia: "ningxia",
  xinjiang: "xinjiang"
};
const PROVINCE_NAME_KEY_MAP = {
  北京: "beijing",
  天津: "tianjin",
  河北: "hebei",
  山西: "shanxi",
  内蒙古: "inner_mongolia",
  辽宁: "liaoning",
  吉林: "jilin",
  黑龙江: "heilongjiang",
  上海: "shanghai",
  江苏: "jiangsu",
  浙江: "zhejiang",
  安徽: "anhui",
  福建: "fujian",
  江西: "jiangxi",
  山东: "shandong",
  河南: "henan",
  湖北: "hubei",
  湖南: "hunan",
  广东: "guangdong",
  广西: "guangxi",
  海南: "hainan",
  重庆: "chongqing",
  四川: "sichuan",
  贵州: "guizhou",
  云南: "yunnan",
  西藏: "tibet",
  陕西: "shaanxi",
  甘肃: "gansu",
  青海: "qinghai",
  宁夏: "ningxia",
  新疆: "xinjiang"
};

let persistAppDataTimer = null;
let suppressNextRenderPersist = false;
let storageWarningShown = false;
let appDataStorageMode = "hybrid";
let persistSequence = 0;
let lastLocalStoragePersistAt = 0;
let topMetaHideTimer = null;
let overviewAutoTimer = null;
let benchmarkMapChart = null;
let benchmarkMapRenderToken = 0;
let benchmarkMapResizeBound = false;
let benchmarkRangeSliderBounds = { min: 0, max: 100 };
let benchmarkRangeDragHandle = null;
let echartsLoaderPromise = null;
let createFormSyncedProjectId = null;
let energyAnnualChart = null;
let energyCurveChart = null;
let energyCurveResizeBound = false;
let activeResultReportView = "annual";
let activeSensitivityFactorKey = "";
let activeCompareScenarioId = "";
const compareSensitivitySettings = {
  rangePercent: 20,
  stepPercent: 5,
  responseScalePercent: 100,
  topN: 8,
  selectedKeys: []
};
const scenarioVisualCharts = {};
let scenarioVisualResizeBound = false;
let resultChartsResizeBound = false;
let compareChartsResizeBound = false;
let historyChartsResizeBound = false;
let historyChartsRefreshTimer = null;
const historyAnalysisCache = new Map();
const provinceTypicalCurveDbCache = new Map();
let lastSyncedProjectProvinceContextKey = "";
const expandedProvinceDefaultKeys = new Set();
let selectedProvinceDefaultKey = "";
let selectedProvinceDefaultContextKey = "";
const compareChartInstances = {
  sensitivityTornado: null,
  sensitivityResponse: null,
  scenarioRanking: null,
  scenarioBridge: null,
  scenarioTrend: null
};
const FORECAST_MODEL_DEFINITIONS = priceForecast.FORECAST_MODEL_DEFINITIONS;
const resultChartInstances = {
  annualStack: null,
  pricePath: null,
  waterfall: null,
  contribution: null
};
const historyChartInstances = {
  monthTrend: null,
  typicalDay: null,
  distribution: null,
  heatmap: null,
  boxplot: null
};
const historyChartExportPayloads = {
  monthTrend: null,
  typicalDay: null,
  distribution: null,
  heatmap: null,
  boxplot: null
};
const benchmarkGeoCache = new Map();
const LOCAL_STORAGE_PERSIST_INTERVAL_MS = 4000;
const BENCHMARK_MAP_ZOOM_MIN = 0.8;
const BENCHMARK_MAP_ZOOM_MAX = 4;
const BENCHMARK_MAP_ZOOM_STEP = 0.18;
const BENCHMARK_RANGE_MIN = 120;
const BENCHMARK_RANGE_MAX = 520;
const DEMO_AUTH_USERS = [
  { accountName: "演示用户A", account: "demo1", password: "demo123" },
  { accountName: "演示用户B", account: "demo2", password: "demo123" },
  { accountName: "演示用户C", account: "demo3", password: "demo123" },
  { accountName: "演示用户D", account: "demo4", password: "demo123" },
  { accountName: "演示用户E", account: "demo5", password: "demo123" }
];
const PAGE_COMPLETION_STANDARD_MAP = {
  "create-page": "项目基础信息填写完整并成功创建。",
  "energy-page": "逐年总量覆盖全部测算年度，并完成典型年曲线来源二选一。",
  "history-page": "已按项目省份自动展示历史现货图表。",
  "forecast-page": "存在已生效且可发布的电价预测版本。",
  "scenario-page": "当前全口径收入配置已保存。",
  "results-page": "当前场景已成功生成一版基准结果。",
  "compare-page": "至少两个场景存在可对比结果。"
};
const PAGE_VIEW_ALIAS = {
  "energy-page": "create-page",
  "province-page": "scenario-page"
};
const OVERVIEW_POLICY_DETAILS = [
  {
    title: "政策卡1：新一轮电改顶层设计",
    policyName: "关于进一步深化电力体制改革的若干意见",
    docNo: "中发〔2015〕9号",
    position: "新一轮电力市场化改革总纲领、根本遵循。",
    highlights: [
      "确立“管住中间、放开两头”总体思路。",
      "放开竞争性环节电价、放开发用电计划。",
      "推进配售电业务放开、交易机构独立规范运行。",
      "还原电力商品属性，构建有效竞争市场结构。"
    ],
    meaning: "打破统购统销模式，开启电力市场化全新时代。"
  },
  {
    title: "政策卡2：全国统一电力市场体系建设",
    policyName: "关于加快建设全国统一电力市场体系的指导意见",
    docNo: "发改体改〔2022〕118号",
    position: "从分散试点走向全国一体化的里程碑文件。",
    highlights: [
      "构建国家—区域—省三级电力市场体系。",
      "破除省间壁垒，推进跨省跨区优化配置。",
      "统一交易规则、计量标准、技术支撑。",
      "明确2025/2030年市场化电量占比目标。"
    ],
    meaning: "实现大范围资源优化，支撑新能源跨省消纳。"
  },
  {
    title: "政策卡3：电力现货市场顶层规则",
    policyName: "电力现货市场基本规则（试行）",
    docNo: "发改能源规〔2023〕1217号",
    position: "电力市场价格发现与实时平衡核心制度。",
    highlights: [
      "统一全国现货市场模式、出清与结算机制。",
      "规范中长期与现货衔接、新能源入市方式。",
      "明确储能、虚拟电厂等主体参与规则。",
      "推动2025年底前现货市场全覆盖连续运行。"
    ],
    meaning: "实现分时电价、精准供需匹配，市场进入精细化运行。"
  },
  {
    title: "政策卡4：新型电力系统调节保障",
    policyName: "电力辅助服务市场基本规则",
    docNo: "发改能源规〔2024〕XX号（通用权威版）",
    position: "高比例新能源下电网安全稳定的市场化支撑。",
    highlights: [
      "统一调频、备用、调压、爬坡等服务品种。",
      "落实“谁受益、谁承担，谁提供、谁获利”。",
      "支持储能、负荷聚合商、虚拟电厂广泛参与。",
      "推动电能量与辅助服务联合优化出清。"
    ],
    meaning: "激活灵活性资源，保障新型电力系统安全运行。"
  },
  {
    title: "政策卡5：绿色转型与市场深化实施",
    policyName: "关于完善全国统一电力市场体系的实施意见",
    docNo: "国办发〔2026〕4号",
    position: "面向新型电力系统的市场机制升级版施工图。",
    highlights: [
      "明确2030年基本建成、2035年全面建成统一市场。",
      "完善容量成本回收、用户侧响应机制。",
      "强化跨省互济、新能源全额保障消纳。",
      "统筹能源安全、绿色转型与市场化改革。"
    ],
    meaning: "适配高比例新能源格局，完善市场化长效机制。"
  }
];
const OVERVIEW_IMAGE_FALLBACK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#10243b"/><stop offset="100%" stop-color="#1f4f7d"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="1300" cy="180" r="120" fill="#f9c55d" opacity=".85"/><path d="M0 760 L420 620 L740 690 L1080 610 L1600 760 L1600 900 L0 900Z" fill="#1a3f63" opacity=".72"/><path d="M220 760 L300 420 L380 760 M255 580 L345 580 M760 760 L840 360 L920 760 M795 540 L885 540 M1180 760 L1240 470 L1300 760 M1210 620 L1270 620" stroke="#f2e3c0" stroke-width="12" stroke-linecap="round" fill="none"/><text x="80" y="150" fill="#ffffff" font-family="Arial,sans-serif" font-size="68" font-weight="700">NEW ENERGY</text></svg>')}`;

function getProvinceName(key) {
  return PROVINCES.find((item) => item.key === key)?.name || key;
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

function describeProvinceTypicalCurve(project) {
  return `${getProvinceName(project?.province)} / ${getAssetTypeLabel(project?.assetType)} / ${getSiteTypeLabel(project?.siteType)}`;
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

function getCompleteEnergyYears(project) {
  if (!project || !Number.isInteger(project.startYear) || !Number.isInteger(project.forecastYears)) return [];
  const energyData = ensureProjectEnergyDataDerivedState(project);
  const years = [];
  for (let i = 0; i < project.forecastYears; i += 1) {
    const year = project.startYear + i;
    if (
      energyData?.annualSummary?.[year]?.status === "完整"
      && Array.isArray(energyData?.hourlyByYear?.[year])
      && energyData.hourlyByYear[year].length === 8760
    ) {
      years.push(year);
    }
  }
  return years;
}

function getForecastPeriodDisplayRange(project) {
  if (!project || !Number.isInteger(project.startYear) || !Number.isInteger(project.forecastYears) || project.forecastYears < 1) {
    return "-";
  }
  return `${project.startYear}-${project.startYear + project.forecastYears - 1}`;
}

function createEmptyEnergyDataState(mode = "annual_hours") {
  return projectModel.createEmptyEnergyDataState(mode);
}

function normalizeTypicalCurveProfile(values) {
  return energyProfiles.normalizeTypicalCurveProfile(values);
}

function ensureProjectEnergyDataState(project) {
  return energyDataRules.ensureProjectEnergyDataState(project);
}

function hasStoredEnergyTypicalCurve(energyData) {
  return energyDataRules.hasStoredEnergyTypicalCurve(energyData);
}

function ensureProjectEnergyDataDerivedState(project) {
  const energyData = ensureProjectEnergyDataState(project);
  if (!project || !Number.isInteger(project.startYear) || !Number.isInteger(project.forecastYears) || project.forecastYears <= 0) {
    return energyData;
  }

  const hasCurve = hasStoredEnergyTypicalCurve(energyData);
  let needsRebuild = false;

  for (let i = 0; i < project.forecastYears; i += 1) {
    const year = project.startYear + i;
    const annualHours = Number(energyData.annualInputByYear?.[year]);
    const summary = energyData.annualSummary?.[year];
    const hourlyValues = energyData.hourlyByYear?.[year];

    if (!Number.isFinite(annualHours) || annualHours <= 0) {
      if (summary?.status && summary.status !== "缺失") {
        needsRebuild = true;
        break;
      }
      continue;
    }

    if (!hasCurve) {
      if (
        summary?.status !== "待典型曲线"
        || !Number.isFinite(Number(summary?.annualHours))
        || Math.abs(Number(summary?.annualHours) - annualHours) > 1e-6
      ) {
        needsRebuild = true;
        break;
      }
      continue;
    }

    if (
      summary?.status !== "完整"
      || !Array.isArray(hourlyValues)
      || hourlyValues.length !== 8760
      || !Number.isFinite(Number(summary?.annualHours))
      || Math.abs(Number(summary?.annualHours) - annualHours) > 1e-6
    ) {
      needsRebuild = true;
      break;
    }
  }

  if (needsRebuild) {
    rebuildProjectEnergyData(project);
    return ensureProjectEnergyDataState(project);
  }
  return energyData;
}

function getAnnualInputYearCount(project) {
  const energyData = ensureProjectEnergyDataDerivedState(project);
  const rangeYears = Number.isInteger(project?.forecastYears) && project.forecastYears > 0 ? project.forecastYears : 0;
  if (!rangeYears) return 0;
  let count = 0;
  for (let i = 0; i < project.forecastYears; i += 1) {
    const year = project.startYear + i;
    const annual = Number(energyData.annualInputByYear?.[year]);
    if (Number.isFinite(annual) && annual > 0) count += 1;
  }
  return count;
}

function getContiguousAnnualInputPeriod(annualInputByYear) {
  if (!isPlainObject(annualInputByYear)) return null;
  const years = Object.keys(annualInputByYear)
    .map((year) => Number(year))
    .filter((year) => Number.isInteger(year))
    .sort((a, b) => a - b);
  if (!years.length) return null;
  for (let index = 1; index < years.length; index += 1) {
    if (years[index] !== years[index - 1] + 1) return null;
  }
  return {
    startYear: years[0],
    endYear: years[years.length - 1],
    count: years.length
  };
}

function parseYearRangeFromLabel(label) {
  const match = String(label || "").match(/(?:^|[^0-9])(\d{4})-(\d{4})(?:[^0-9]|$)/);
  if (!match) return null;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear < startYear) return null;
  return {
    startYear,
    endYear,
    count: endYear - startYear + 1
  };
}

function alignDefaultForecastYearsToAnnualTemplate(project, annualInputByYear, sourceLabel = "") {
  if (!project || project.forecastYears !== 30) return false;
  const annualPeriod = getContiguousAnnualInputPeriod(annualInputByYear);
  const labelPeriod = parseYearRangeFromLabel(sourceLabel);
  if (!annualPeriod || !labelPeriod) return false;
  const samePeriod = annualPeriod.startYear === labelPeriod.startYear
    && annualPeriod.endYear === labelPeriod.endYear
    && annualPeriod.count === labelPeriod.count;
  if (!samePeriod) return false;
  if (annualPeriod.startYear !== project.startYear) return false;
  if (annualPeriod.count < 1 || annualPeriod.count > 30 || annualPeriod.count === project.forecastYears) return false;
  project.forecastYears = annualPeriod.count;
  project.statuses["create-page"] = isProjectCreateCompleted(project) ? "completed" : "in_progress";
  return true;
}

function alignDefaultForecastYearsToStoredAnnualInput(project) {
  if (!project || project.forecastYears !== 30) return false;
  const annualPeriod = getContiguousAnnualInputPeriod(project.energyData?.annualInputByYear);
  if (!annualPeriod) return false;
  if (annualPeriod.startYear !== project.startYear) return false;
  if (annualPeriod.count < 20 || annualPeriod.count >= project.forecastYears) return false;
  project.forecastYears = annualPeriod.count;
  project.statuses["create-page"] = isProjectCreateCompleted(project) ? "completed" : "in_progress";
  return true;
}

function hasEnergyTypicalCurve(project) {
  return energyDataRules.hasEnergyTypicalCurve(project);
}

function buildEnergyMonthHourlyShareCurves(hourlyValues) {
  if (!Array.isArray(hourlyValues) || hourlyValues.length < 8760) return null;
  const curves = [];
  let offset = 0;
  for (const days of ENERGY_MONTH_DAY_COUNTS) {
    const monthHours = days * 24;
    const sums = Array(24).fill(0);
    let total = 0;
    for (let index = 0; index < monthHours; index += 1) {
      const value = Number(hourlyValues[offset + index]);
      if (!Number.isFinite(value) || value < 0) continue;
      const hour = index % 24;
      sums[hour] += value;
      total += value;
    }
    curves.push(sums.map((sum) => (total > 0 ? sum / total * 100 : 0)));
    offset += monthHours;
  }
  return curves;
}

function getEnergyCurvePreviewProfile(project) {
  if (!project || !project.province || !project.assetType) return null;
  const energyData = ensureProjectEnergyDataState(project);
  const storedProfile = normalizeTypicalCurveProfile(energyData.typicalCurveProfile);
  if (storedProfile.length === 8760) {
    return {
      profile: storedProfile,
      sourceLabel: energyData.typicalCurveSource === "typical_curve_8760"
        ? "已导入典型年8760小时模板"
        : `已调用${describeProvinceTypicalCurve(project)}典型曲线`
    };
  }
  const provinceCurveRecord = getProvinceTypicalCurveRecord(project);
  return {
    profile: provinceCurveRecord?.profile || buildProvinceTypicalCurveProfile(project),
    sourceLabel: provinceCurveRecord?.sourceLabel || `${describeProvinceTypicalCurve(project)}典型曲线示意`
  };
}

function getPolicyRegionKeyByProvince(provinceKey) {
  if (!provinceKey) return null;
  return POLICY_CARDS.find((card) => card.provinceKey === provinceKey)?.regionKey || null;
}

function normalizeTheme(theme) {
  return THEME_SEQUENCE.includes(theme) ? theme : "light";
}

function getNextTheme(theme) {
  const current = normalizeTheme(theme);
  const index = THEME_SEQUENCE.indexOf(current);
  return THEME_SEQUENCE[(index + 1) % THEME_SEQUENCE.length];
}

function applyTheme(theme) {
  const targetTheme = normalizeTheme(theme);
  appState.theme = targetTheme;
  document.body.setAttribute("data-theme", targetTheme);
  if (refs.themeToggleButton) {
    refs.themeToggleButton.textContent = `切换${THEME_LABELS[getNextTheme(targetTheme)]}`;
  }
  if (refs.themeCurrentLabel) {
    refs.themeCurrentLabel.textContent = `当前：${THEME_LABELS[targetTheme]}`;
  }
}

function normalizeOverviewIndex(index, total) {
  if (total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  const raw = Math.floor(index);
  return ((raw % total) + total) % total;
}

function restartOverviewProgressBar() {
  if (!refs.overviewProgressBar) return;
  refs.overviewProgressBar.style.transition = "none";
  refs.overviewProgressBar.style.width = "0%";
  if (typeof window === "undefined") return;
  void refs.overviewProgressBar.offsetWidth;
  refs.overviewProgressBar.style.transition = `width ${OVERVIEW_AUTO_SWITCH_MS}ms linear`;
  refs.overviewProgressBar.style.width = "100%";
}

function renderOverviewCarousel() {
  const total = refs.overviewSlides.length;
  if (!refs.overviewTrack || total <= 0) return;
  const nextIndex = normalizeOverviewIndex(appState.overviewSlideIndex, total);
  appState.overviewSlideIndex = nextIndex;
  refs.overviewTrack.style.transform = `translateX(-${nextIndex * 100}%)`;
  refs.overviewDots.forEach((dot, dotIndex) => {
    dot.classList.toggle("active", dotIndex === nextIndex);
    dot.setAttribute("aria-current", dotIndex === nextIndex ? "true" : "false");
  });
  if (refs.overviewDetailTrigger) {
    refs.overviewDetailTrigger.textContent = `查看详情（${nextIndex + 1}/${total}）`;
  }
}

function bindOverviewImageFallbacks() {
  if (!Array.isArray(refs.overviewSlides) || !refs.overviewSlides.length) return;
  refs.overviewSlides.forEach((slide, index) => {
    const image = slide.querySelector(".overview-image");
    if (!image) return;
    const applyFallback = () => {
      if (image.dataset.fallbackApplied === "1") return;
      image.dataset.fallbackApplied = "1";
      image.src = OVERVIEW_IMAGE_FALLBACK;
      image.alt = `轮播配图${index + 1}`;
      image.classList.add("overview-image-fallback");
    };
    image.addEventListener("error", applyFallback);
    if (image.complete && image.naturalWidth === 0) {
      applyFallback();
    }
  });
}

function stopOverviewAutoplay() {
  if (typeof window === "undefined") return;
  if (overviewAutoTimer) {
    window.clearInterval(overviewAutoTimer);
    overviewAutoTimer = null;
  }
  if (!refs.overviewProgressBar) return;
  refs.overviewProgressBar.style.transition = "none";
  refs.overviewProgressBar.style.width = "0%";
}

function startOverviewAutoplay() {
  if (typeof window === "undefined") return;
  const total = refs.overviewSlides.length;
  if (total <= 1 || !refs.overviewTrack) {
    stopOverviewAutoplay();
    return;
  }
  if (overviewAutoTimer) {
    window.clearInterval(overviewAutoTimer);
  }
  restartOverviewProgressBar();
  overviewAutoTimer = window.setInterval(() => {
    appState.overviewSlideIndex = normalizeOverviewIndex(appState.overviewSlideIndex + 1, total);
    renderOverviewCarousel();
    restartOverviewProgressBar();
  }, OVERVIEW_AUTO_SWITCH_MS);
}

function goToOverviewSlide(index) {
  const total = refs.overviewSlides.length;
  appState.overviewSlideIndex = normalizeOverviewIndex(index, total);
  renderOverviewCarousel();
  if (appState.activePage === "home-page") {
    startOverviewAutoplay();
  }
}

function openOverviewPolicyDetail(index = appState.overviewSlideIndex) {
  if (!refs.policyDetailModal) return;
  const total = OVERVIEW_POLICY_DETAILS.length;
  if (total <= 0) return;
  const nextIndex = normalizeOverviewIndex(index, total);
  const detail = OVERVIEW_POLICY_DETAILS[nextIndex];
  if (!detail) return;

  if (refs.policyDetailTitle) refs.policyDetailTitle.textContent = detail.title;
  if (refs.policyDetailDocNo) refs.policyDetailDocNo.textContent = `文号：${detail.docNo}`;
  if (refs.policyDetailName) refs.policyDetailName.textContent = detail.policyName;
  if (refs.policyDetailPosition) refs.policyDetailPosition.textContent = detail.position;
  if (refs.policyDetailMeaning) refs.policyDetailMeaning.textContent = detail.meaning;
  if (refs.policyDetailHighlights) {
    refs.policyDetailHighlights.innerHTML = "";
    detail.highlights.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = entry;
      refs.policyDetailHighlights.appendChild(item);
    });
  }
  refs.policyDetailModal.hidden = false;
  if (refs.policyDetailCloseButton) refs.policyDetailCloseButton.focus();
  stopOverviewAutoplay();
}

function closeOverviewPolicyDetail() {
  if (!refs.policyDetailModal) return;
  refs.policyDetailModal.hidden = true;
  if (appState.activePage === "home-page") {
    startOverviewAutoplay();
  }
}

function getBrowserStorage(name) {
  return appStorage.resolveBrowserStorage(name);
}

function resetAuthState() {
  appState.auth.loggedIn = false;
  appState.auth.accountName = "";
  appState.auth.account = "";
  appState.auth.lastLoginAt = "";
}

function persistAuthState() {
  const payload = {
    loggedIn: appState.auth.loggedIn,
    accountName: appState.auth.accountName,
    account: appState.auth.account,
    lastLoginAt: appState.auth.lastLoginAt
  };
  appStorage.writeJsonToStorages(AUTH_STORAGE_KEY, payload, [
    getBrowserStorage("localStorage"),
    getBrowserStorage("sessionStorage")
  ], {
    onError: (error) => console.warn("写入浏览器登录态失败。", error)
  });
}

function initAuth() {
  let parseFailed = false;
  const result = appStorage.readJsonFromFirstStorage(AUTH_STORAGE_KEY, [
    getBrowserStorage("localStorage"),
    getBrowserStorage("sessionStorage")
  ], {
    onReadError: (error) => console.warn("读取浏览器登录态失败。", error),
    onParseError: (error) => {
      parseFailed = true;
      console.warn("解析浏览器登录态失败。", error);
    }
  });
  if (!result.found) {
    if (parseFailed) resetAuthState();
    return;
  }
  applyAuthPayload(result.value);
}

function applyAuthPayload(payload) {
  if (!isPlainObject(payload)) return false;
  appState.auth.loggedIn = Boolean(payload.loggedIn);
  appState.auth.account = payload.account ? String(payload.account) : "";
  appState.auth.accountName = payload.accountName ? String(payload.accountName) : appState.auth.account;
  appState.auth.lastLoginAt = payload.lastLoginAt ? String(payload.lastLoginAt) : "";
  return appState.auth.loggedIn;
}

function getSidebarGroupStorageKey() {
  return appState.auth.loggedIn ? SIDEBAR_GROUP_STORAGE_KEY_AUTH : SIDEBAR_GROUP_STORAGE_KEY_GUEST;
}

function sidebarGroupDefaults() {
  const defaults = {};
  refs.groupToggles.forEach((toggle) => {
    const key = toggle.dataset.group;
    if (!key) return;
    if (appState.auth.loggedIn) {
      defaults[key] = true;
    } else {
      defaults[key] = false;
    }
  });
  return defaults;
}

function persistSidebarGroups() {
  appStorage.writeJsonToStorage(getBrowserStorage("localStorage"), getSidebarGroupStorageKey(), appState.sidebarGroups, {
    onError: (error) => console.warn("写入侧边栏状态失败。", error)
  });
}

function initSidebarGroups() {
  appState.sidebarGroups = sidebarGroupDefaults();
  if (!appState.auth.loggedIn) return;
  const result = appStorage.readJsonFromStorage(getBrowserStorage("localStorage"), getSidebarGroupStorageKey(), {
    onReadError: (error) => console.warn("读取侧边栏状态失败。", error),
    onParseError: () => {
      appState.sidebarGroups = sidebarGroupDefaults();
    }
  });
  const parsed = result.value;
  if (parsed && typeof parsed === "object") {
    for (const key of Object.keys(appState.sidebarGroups)) {
      if (typeof parsed[key] === "boolean") {
        appState.sidebarGroups[key] = parsed[key];
      }
    }
  }
}

function applySidebarGroups() {
  refs.groupToggles.forEach((toggle) => {
    const key = toggle.dataset.group;
    if (!key) return;
    const expanded = appState.sidebarGroups[key] !== false;
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    refs.groupBodies
      .filter((body) => body.dataset.groupBody === key)
      .forEach((body) => {
        body.hidden = !expanded;
      });
  });
}

function toggleSidebarGroup(groupKey) {
  if (!groupKey) return;
  const current = appState.sidebarGroups[groupKey] !== false;
  appState.sidebarGroups[groupKey] = !current;
  applySidebarGroups();
  persistSidebarGroups();
}

function applyAuthLayout() {
  const loggedIn = appState.auth.loggedIn;
  refs.authOnlyNavBlocks.forEach((block) => {
    if (!loggedIn) {
      block.hidden = true;
      return;
    }
    const selfGroup = block.dataset.groupBody;
    const parentGroup = block.closest("[data-group-body]")?.dataset.groupBody;
    const group = selfGroup || parentGroup;
    if (group) {
      block.hidden = appState.sidebarGroups[group] === false;
    } else {
      block.hidden = false;
    }
  });
  if (refs.loginEntryButton) {
    refs.loginEntryButton.hidden = loggedIn;
  }
  if (refs.accountModule) {
    refs.accountModule.hidden = !loggedIn;
  }
  if (refs.accountTriggerButton) {
    refs.accountTriggerButton.setAttribute("aria-expanded", "false");
  }
  if (refs.accountDropdown) {
    refs.accountDropdown.hidden = true;
  }
  if (refs.accountNameDisplay) {
    const accountDisplayName = (appState.auth.accountName || appState.auth.account || "").trim();
    refs.accountNameDisplay.textContent = loggedIn ? (accountDisplayName || "当前账号") : "-";
  }
  if (refs.accountAvatar) {
    const name = (appState.auth.accountName || appState.auth.account || "").trim();
    refs.accountAvatar.textContent = loggedIn && name ? name.slice(0, 1).toUpperCase() : "-";
  }
}

function formatAuthTime(isoText) {
  if (!isoText) return "-";
  const dt = new Date(isoText);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("zh-CN", { hour12: false });
}

function openLoginModal() {
  if (!refs.loginModal) return;
  refs.loginModal.hidden = false;
  if (refs.loginForm) refs.loginForm.reset();
  if (refs.loginMessage) refs.loginMessage.textContent = "";
  if (refs.loginSubmitButton) refs.loginSubmitButton.disabled = false;
  if (refs.loginAccount) {
    refs.loginAccount.focus();
  }
}

window.__openLoginModal = openLoginModal;

function closeLoginModal() {
  if (!refs.loginModal) return;
  refs.loginModal.hidden = true;
}

function closeAccountDropdown() {
  if (refs.accountDropdown) {
    refs.accountDropdown.hidden = true;
  }
  if (refs.accountTriggerButton) {
    refs.accountTriggerButton.setAttribute("aria-expanded", "false");
  }
}

function toggleAccountDropdown() {
  if (!appState.auth.loggedIn || !refs.accountDropdown) return;
  const nextHidden = !refs.accountDropdown.hidden;
  refs.accountDropdown.hidden = nextHidden;
  if (refs.accountTriggerButton) {
    refs.accountTriggerButton.setAttribute("aria-expanded", nextHidden ? "false" : "true");
  }
}

function getDemoUserByAccount(account) {
  const normalizedAccount = String(account || "").trim().toLowerCase();
  if (!normalizedAccount) return null;
  return DEMO_AUTH_USERS.find((item) => item.account.toLowerCase() === normalizedAccount) || null;
}

function normalizeAccountKey(account) {
  return String(account || "").trim().toLowerCase();
}

function getCurrentAccountKey() {
  return normalizeAccountKey(appState.auth.account);
}

function getProjectOwnerKey(project) {
  return normalizeAccountKey(project?.ownerAccount);
}

function projectBelongsToCurrentAccount(project) {
  if (!project || !appState.auth.loggedIn) return false;
  const currentAccountKey = getCurrentAccountKey();
  if (!currentAccountKey) return false;
  return getProjectOwnerKey(project) === currentAccountKey;
}

function getProjectWorkspaceBucket(project) {
  const bucket = typeof project?.workspaceBucket === "string" ? project.workspaceBucket : "";
  return PROJECT_WORKSPACE_BUCKET_SET.has(bucket) ? bucket : "history";
}

function isNewWorkspaceProject(project) {
  return getProjectWorkspaceBucket(project) === "new";
}

function getProjectsForCurrentAccount() {
  if (!appState.auth.loggedIn) return [];
  return appState.projects.filter((project) => projectBelongsToCurrentAccount(project));
}

function claimLegacyProjectsForCurrentAccount() {
  if (!appState.auth.loggedIn) return false;
  const ownerAccount = String(appState.auth.account || "").trim();
  if (!ownerAccount) return false;
  let changed = false;
  appState.projects.forEach((project) => {
    if (!project || getProjectOwnerKey(project)) return;
    project.ownerAccount = ownerAccount;
    changed = true;
  });
  return changed;
}

function syncActiveProjectForCurrentAccount(options = {}) {
  const allowNull = Boolean(options.allowNull);
  if (!appState.auth.loggedIn) return;
  if (getActiveProject()) return;
  const accountProjects = getProjectsForCurrentAccount();
  appState.activeProjectId = allowNull ? null : (accountProjects[0]?.id || null);
}

function ensureMockHistoryProjectForCurrentAccount() {
  if (!appState.auth.loggedIn) return false;
  const ownerAccount = String(appState.auth.account || "").trim();
  if (!ownerAccount) return false;
  const accountProjects = getProjectsForCurrentAccount();
  if (accountProjects.some((project) => !isNewWorkspaceProject(project))) {
    return false;
  }

  const now = new Date();
  const year = Math.max(2026, now.getFullYear());
  const project = {
    id: makeId("proj"),
    ownerAccount,
    workspaceBucket: "history",
    name: resolveUniqueProjectName("江苏海上风电示例项目"),
    province: "jiangsu",
    assetType: "wind",
    siteType: "offshore",
    hasStorage: true,
    storagePowerMw: 64,
    storageDurationH: 2,
    storageNote: "按装机容量20% / 2h生成的示例配储口径",
    capacityMw: 320,
    startYear: year,
    forecastYears: 30,
    energyMode: "annual_hours",
    note: "系统自动生成的历史项目示例",
    createdAt: now.toISOString(),
    statuses: statusMapTemplate(),
    energyData: createEmptyEnergyDataState("annual_hours"),
    energyTemplateExports: {
      hourly_8760: "",
      annual_hours: "",
      typical_curve_8760: "",
      province_typical_curve: ""
    },
    historySpotImport: createEmptyHistorySpotImport(),
    priceRuns: [],
    activeRunId: null,
    activationLogs: [],
    spotMarketConfig: createDefaultSpotMarketConfig(),
    scenarios: [],
    activeScenarioId: null,
    resultsByScenario: {}
  };

  project.statuses["create-page"] = "completed";

  const baselineScenario = {
    id: makeId("scn"),
    name: "基准场景",
    isBaseline: true,
    locked: false,
    config: defaultScenarioConfig(project),
    updatedAt: now.toISOString()
  };
  project.scenarios.push(baselineScenario);
  project.activeScenarioId = baselineScenario.id;

  appState.projects.unshift(project);
  if (!getActiveProject()) {
    appState.activeProjectId = project.id;
  }
  return true;
}

function getCurrentResultContext() {
  const project = getActiveProject();
  if (!project) return null;
  const scenario = getActiveScenario(project);
  if (!scenario) return null;
  const result = project.resultsByScenario?.[scenario.id];
  if (!result) return null;
  return {
    projectName: project.name || "当前项目",
    scenarioName: scenario.name || "当前场景",
    years: Array.isArray(result.annualRows) ? result.annualRows.length : 0
  };
}

function resolveLogoutPersistChoice() {
  const context = getCurrentResultContext();
  if (!context || typeof window === "undefined") {
    return "direct";
  }
  const shouldSave = window.confirm(
    `当前项目“${context.projectName}”场景“${context.scenarioName}”已有测算结果。\n是否在退出前立即保存当前结果？\n\n选择“确定”= 保存并退出\n选择“取消”= 继续选择`
  );
  if (shouldSave) return "save";
  const shouldDirectExit = window.confirm("将直接退出（不执行额外保存动作）。是否继续？");
  if (shouldDirectExit) return "direct";
  return "cancel";
}

async function requestAuthLogin(account, password) {
  const normalizedAccount = account.trim();
  if (!normalizedAccount || !password) {
    return { ok: false, message: "请输入账号和密码。" };
  }
  const demoUser = getDemoUserByAccount(normalizedAccount);
  if (demoUser) {
    if (password !== demoUser.password) {
      return { ok: false, message: "账号或密码错误，请重试。" };
    }
    return { ok: true, accountName: demoUser.accountName, account: demoUser.account };
  }
  // 预留真实鉴权接口：后续可替换为 fetch('/api/auth/login', ...)
  return { ok: true, accountName: normalizedAccount, account: normalizedAccount };
}

async function handleLoginSubmit(event) {
  if (event.__loginHandled) return false;
  event.__loginHandled = true;
  event.preventDefault();
  const account = refs.loginAccount?.value || "";
  const password = refs.loginPassword?.value || "";
  if (refs.loginSubmitButton) refs.loginSubmitButton.disabled = true;
  if (refs.loginMessage) refs.loginMessage.textContent = "登录中...";

  const authResult = await requestAuthLogin(account, password);
  if (!authResult.ok) {
    if (refs.loginMessage) refs.loginMessage.textContent = authResult.message || "登录失败，请重试。";
    if (refs.loginSubmitButton) refs.loginSubmitButton.disabled = false;
    return;
  }

  appState.auth.loggedIn = true;
  appState.auth.accountName = authResult.accountName || account.trim();
  appState.auth.account = authResult.account || account.trim();
  appState.auth.lastLoginAt = new Date().toISOString();
  const claimedLegacy = claimLegacyProjectsForCurrentAccount();
  const seededHistoryDemo = ensureMockHistoryProjectForCurrentAccount();
  syncActiveProjectForCurrentAccount();
  resetProjectProvinceContextSync();
  resetPolicyFiltersToDefault();
  persistAuthState();
  persistAppDataNow({ forceLocal: true });
  if (claimedLegacy || seededHistoryDemo) {
    persistAppDataNow({ forceLocal: true });
  }
  initSidebarGroups();
  closeLoginModal();
  closeAccountDropdown();
  setActivePage("projects-page");
  return false;
}

window.__submitLoginForm = handleLoginSubmit;

function handleAccountManage() {
  if (!appState.auth.loggedIn) return;
  closeAccountDropdown();
  setActivePage("settings-page");
}

function handleAccountPassword() {
  if (!appState.auth.loggedIn) return;
  closeAccountDropdown();
  setActivePage("settings-page");
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      if (refs.passwordCurrent) refs.passwordCurrent.focus();
    }, 0);
  }
}

function handleLogout() {
  const persistChoice = resolveLogoutPersistChoice();
  if (persistChoice === "cancel") {
    return;
  }
  if (persistChoice === "save") {
    persistAppDataNow({ forceLocal: true });
  } else {
    cancelScheduledPersistAppData();
    suppressNextRenderPersist = true;
  }
  appState.auth.loggedIn = false;
  appState.auth.accountName = "";
  appState.auth.account = "";
  appState.auth.lastLoginAt = "";
  resetProjectProvinceContextSync();
  resetPolicyFiltersToDefault();
  persistAuthState();
  initSidebarGroups();
  closeLoginModal();
  closeAccountDropdown();
  setAccountManageMessage("");
  setActivePage("home-page");
}

function setAccountManageMessage(text, tone = "default") {
  if (!refs.accountManageMessage) return;
  refs.accountManageMessage.textContent = text;
  if (tone === "error") {
    refs.accountManageMessage.style.color = "#c54d4d";
  } else if (tone === "success") {
    refs.accountManageMessage.style.color = "#1a8f5f";
  } else {
    refs.accountManageMessage.style.color = "";
  }
}

async function handleChangePassword(event) {
  event.preventDefault();
  if (!appState.auth.loggedIn) {
    setAccountManageMessage("请先登录后再修改密码。", "error");
    return;
  }
  const current = refs.passwordCurrent?.value || "";
  const next = refs.passwordNext?.value || "";
  const confirm = refs.passwordConfirm?.value || "";
  if (!current || !next || !confirm) {
    setAccountManageMessage("请完整填写密码信息。", "error");
    return;
  }
  if (next.length < 6) {
    setAccountManageMessage("新密码长度至少 6 位。", "error");
    return;
  }
  if (next !== confirm) {
    setAccountManageMessage("两次输入的新密码不一致。", "error");
    return;
  }
  // 预留真实接口：后续可替换为 fetch('/api/auth/change-password', ...)
  if (refs.changePasswordForm) {
    refs.changePasswordForm.reset();
  }
  setAccountManageMessage("密码修改成功。", "success");
}

function initTheme() {
  const saved = appStorage.readRawFromStorage(getBrowserStorage("localStorage"), "ne_ui_theme", {
    onError: (error) => console.warn("读取主题偏好失败。", error)
  });
  applyTheme(normalizeTheme(saved));
}

function toggleTheme() {
  const next = getNextTheme(appState.theme);
  applyTheme(next);
  appStorage.writeRawToStorage(getBrowserStorage("localStorage"), "ne_ui_theme", next, {
    onError: (error) => console.warn("写入主题偏好失败。", error)
  });
}

function dayOfYearToMonthDay(dayOfYear) {
  return energyProfiles.dayOfYearToMonthDay(dayOfYear);
}

function hourIndexToTimestamp(year, hourIndex) {
  const dayOfYear = Math.floor(hourIndex / 24) + 1;
  const hour = hourIndex % 24;
  const monthDay = dayOfYearToMonthDay(dayOfYear);
  return `${year}-${String(monthDay.month).padStart(2, "0")}-${String(monthDay.day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:00`;
}

function statusMapTemplate() {
  return workflowStatus.statusMapTemplate(WORKFLOW_PAGES);
}

function createEmptyHistorySpotImport() {
  return projectSettings.createEmptyHistorySpotImport();
}

function createDefaultSpotMarketConfig(project = null) {
  const activeRun = project ? getActiveRun(project) : null;
  return projectSettings.createDefaultSpotMarketConfig(activeRun);
}

function isHistoryDatasetUsable(dataset) {
  return projectSettings.isHistoryDatasetUsable(dataset);
}

function sanitizeHistorySpotImport(rawImport) {
  return projectSettings.sanitizeHistorySpotImport(rawImport);
}

function sanitizeSpotMarketConfig(project, rawConfig) {
  const activeRun = project ? getActiveRun(project) : null;
  return projectSettings.sanitizeSpotMarketConfig(rawConfig, activeRun);
}

function ensureProjectSpotMarketConfig(project) {
  if (!project) return createDefaultSpotMarketConfig();
  project.spotMarketConfig = sanitizeSpotMarketConfig(project, project.spotMarketConfig);
  if (project.spotMarketConfig.priceSourceMode === "active_forecast_run") {
    project.spotMarketConfig.linkedRunId = getActiveRun(project)?.id || "";
  }
  return project.spotMarketConfig;
}

function sanitizePolicyFilters(raw) {
  return projectSettings.sanitizePolicyFilters(raw, {
    provinceKeys: Array.from(PROVINCE_KEY_SET),
    regionKeys: Array.from(POLICY_REGION_KEY_SET)
  });
}

function resetPolicyFiltersToDefault() {
  appState.policyFilters.provinceKey = "shanghai";
  appState.policyFilters.regionKey = "east";
}

function sanitizeHistoryAnalysis(raw) {
  return projectSettings.sanitizeHistoryAnalysis(raw);
}

function sanitizeBenchmarkMap(raw) {
  return projectSettings.sanitizeBenchmarkMap(raw, {
    provinceKeys: Array.from(PROVINCE_KEY_SET),
    zoomMin: BENCHMARK_MAP_ZOOM_MIN,
    zoomMax: BENCHMARK_MAP_ZOOM_MAX
  });
}

function sanitizeStatuses(rawStatuses) {
  return workflowStatus.sanitizeStatuses(rawStatuses, WORKFLOW_PAGES);
}

function sanitizeLtManualPricesByYear(rawPrices, project) {
  return scenarioConfig.sanitizeLtManualPricesByYear(rawPrices, project);
}

function parseBooleanLike(value, fallback = false) {
  return scenarioConfig.parseBooleanLike(value, fallback);
}

function sanitizeEnvManualValuesByYear(rawValues, project) {
  return scenarioConfig.sanitizeEnvManualValuesByYear(rawValues, project);
}

function sanitizeFeeManualValuesByYear(rawValues, project) {
  return scenarioConfig.sanitizeFeeManualValuesByYear(rawValues, project);
}

function normalizeLtConvergeStep(rawValue, rawYear1, rawTarget, fallback = 2, isFixedStep = false) {
  return scenarioModel.normalizeLtConvergeStep(rawValue, rawYear1, rawTarget, fallback, isFixedStep);
}

function sanitizeScenario(project, rawScenario, index) {
  return scenarioModel.sanitizeScenario(project, rawScenario, index, {
    provinceDefaults: getProvinceDefaults(project?.province),
    currentYear: new Date().getFullYear(),
    nowIso: () => new Date().toISOString(),
    makeId
  });
}

function sanitizeProject(rawProject, index) {
  if (!isPlainObject(rawProject)) return null;
  const project = {
    ...projectModel.sanitizeProjectBase(rawProject, index, {
      currentYear: new Date().getFullYear(),
      nowIso: () => new Date().toISOString(),
      provinceKeys: Array.from(PROVINCE_KEY_SET),
      makeId,
      resolveUniqueName: resolveUniqueProjectName
    }),
    statuses: sanitizeStatuses(rawProject.statuses),
    energyData: createEmptyEnergyDataState("annual_hours"),
    energyTemplateExports: projectModel.createEmptyEnergyTemplateExports(),
    historySpotImport: createEmptyHistorySpotImport(),
    priceRuns: [],
    activeRunId: null,
    activationLogs: [],
    spotMarketConfig: createDefaultSpotMarketConfig(),
    scenarios: [],
    activeScenarioId: null,
    resultsByScenario: {}
  };

  project.energyData = isPlainObject(rawProject.energyData)
    ? { ...createEmptyEnergyDataState(project.energyMode), ...rawProject.energyData }
    : createEmptyEnergyDataState(project.energyMode);
  ensureProjectEnergyDataState(project);
  alignDefaultForecastYearsToStoredAnnualInput(project);
  ensureProjectEnergyTemplateExports(project);
  project.historySpotImport = sanitizeHistorySpotImport(rawProject.historySpotImport);

  project.priceRuns = projectModel.sanitizePriceRuns(rawProject.priceRuns, {
    makeId,
    nowIso: () => new Date().toISOString()
  });
  project.activeRunId = projectModel.resolveActiveRunId(project.priceRuns, rawProject.activeRunId);
  project.spotMarketConfig = sanitizeSpotMarketConfig(project, rawProject.spotMarketConfig);

  project.activationLogs = projectModel.sanitizeActivationLogs(rawProject.activationLogs, {
    makeId,
    nowIso: () => new Date().toISOString()
  });

  const rawScenarios = Array.isArray(rawProject.scenarios) ? rawProject.scenarios : [];
  project.scenarios = rawScenarios.map((scenario, i) => sanitizeScenario(project, scenario, i));
  if (!project.scenarios.length) {
    project.scenarios = [{
      id: makeId("scn"),
      name: "基准场景",
      isBaseline: true,
      locked: false,
      config: defaultScenarioConfig(project),
      updatedAt: new Date().toISOString()
    }];
  }
  const firstBaselineIndex = project.scenarios.findIndex((scenario) => scenario.isBaseline);
  if (firstBaselineIndex < 0) {
    project.scenarios[0].isBaseline = true;
  } else {
    project.scenarios = project.scenarios.map((scenario, idx) => ({
      ...scenario,
      isBaseline: idx === firstBaselineIndex
    }));
  }
  project.activeScenarioId = project.scenarios.some((scenario) => scenario.id === rawProject.activeScenarioId)
    ? rawProject.activeScenarioId
    : project.scenarios[0].id;

  project.resultsByScenario = isPlainObject(rawProject.resultsByScenario) ? rawProject.resultsByScenario : {};

  return project;
}

function migrateAppDataSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) return null;
  if (snapshot.version === APP_DATA_VERSION && isPlainObject(snapshot.payload)) {
    return snapshot.payload;
  }
  if (snapshot.version === 0 && isPlainObject(snapshot.payload)) {
    return snapshot.payload;
  }
  if (isPlainObject(snapshot.data)) {
    return snapshot.data;
  }
  return null;
}

function applyAppDataPayload(payload) {
  if (!isPlainObject(payload)) return false;
  if (!appState.auth.loggedIn && isPlainObject(payload.auth)) {
    applyAuthPayload(payload.auth);
  }
  const projects = Array.isArray(payload.projects) ? payload.projects : [];
  appState.projects = projects
    .map((project, index) => sanitizeProject(project, index))
    .filter(Boolean);
  reconcileAllProjectStatuses();
  const activeProjectId = typeof payload.activeProjectId === "string" ? payload.activeProjectId : "";
  appState.activeProjectId = appState.projects.some((project) => project.id === activeProjectId)
    ? activeProjectId
    : appState.projects[0]?.id || null;
  appState.activePage = (typeof payload.activePage === "string" && PAGE_ID_SET.has(payload.activePage))
    ? payload.activePage
    : "home-page";
  appState.compareView = sanitizeCompareView(payload.compareView);
  appState.energyStep2Choice = sanitizeEnergyStep2Choice(payload.energyStep2Choice);
  appState.policyFilters = sanitizePolicyFilters(payload.policyFilters);
  appState.historyAnalysis = sanitizeHistoryAnalysis(payload.historyAnalysis);
  appState.benchmarkMap = sanitizeBenchmarkMap(payload.benchmarkMap);
  return true;
}

function sanitizeCompareView(value) {
  return typeof value === "string" && COMPARE_VIEW_SET.has(value) ? value : "scenario";
}

function sanitizeEnergyStep2Choice(value) {
  return typeof value === "string" && ENERGY_STEP2_CHOICE_SET.has(value) ? value : "typical";
}

async function loadAppDataFromStorage() {
  const selected = await appDataSnapshotStore.readLatestSnapshot({
    onLocalReadError: (error) => console.warn("读取localStorage业务快照失败。", error),
    onLocalParseError: (error) => console.warn("读取localStorage业务快照失败。", error),
    onDbReadError: (error) => console.warn("读取IndexedDB业务快照失败。", error)
  });
  if (!selected) return;
  const payload = migrateAppDataSnapshot(selected);
  applyAppDataPayload(payload);
}

function buildAppDataSnapshot() {
  return {
    version: APP_DATA_VERSION,
    savedAt: new Date().toISOString(),
    payload: {
      activePage: appState.activePage,
      compareView: sanitizeCompareView(appState.compareView),
      energyStep2Choice: sanitizeEnergyStep2Choice(appState.energyStep2Choice),
      activeProjectId: appState.activeProjectId,
      projects: appState.projects,
      auth: {
        loggedIn: appState.auth.loggedIn,
        accountName: appState.auth.accountName,
        account: appState.auth.account,
        lastLoginAt: appState.auth.lastLoginAt
      },
      policyFilters: appState.policyFilters,
      historyAnalysis: sanitizeHistoryAnalysis(appState.historyAnalysis),
      benchmarkMap: sanitizeBenchmarkMap(appState.benchmarkMap)
    }
  };
}

function renderCompareWorkspaceState() {
  const activeView = sanitizeCompareView(appState.compareView);
  appState.compareView = activeView;
  if (Array.isArray(refs.compareTabButtons)) {
    refs.compareTabButtons.forEach((button) => {
      const isActive = button.dataset.compareView === activeView;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.tabIndex = isActive ? 0 : -1;
    });
  }
  if (Array.isArray(refs.comparePanes)) {
    refs.comparePanes.forEach((pane) => {
      pane.hidden = pane.dataset.comparePane !== activeView;
    });
  }
}

function renderEnergyStep2ChoiceState() {
  const activeChoice = sanitizeEnergyStep2Choice(appState.energyStep2Choice);
  appState.energyStep2Choice = activeChoice;
  if (Array.isArray(refs.energyStep2ChoiceButtons)) {
    refs.energyStep2ChoiceButtons.forEach((button) => {
      const isActive = button.dataset.energyStep2Choice === activeChoice;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.tabIndex = isActive ? 0 : -1;
    });
  }
  if (refs.energyStep2TypicalPane) {
    refs.energyStep2TypicalPane.hidden = activeChoice !== "typical";
  }
  if (refs.energyStep2ProvincePane) {
    refs.energyStep2ProvincePane.hidden = activeChoice !== "province";
  }
}

function renderEnergyStep2ChoiceSummary(project) {
  if (!refs.energyStep2ChoiceSummary || !refs.energyStep2ChoiceDetail) return;
  const activeChoice = sanitizeEnergyStep2Choice(appState.energyStep2Choice);
  if (!project) {
    refs.energyStep2ChoiceSummary.textContent = "当前选择：待进入项目";
    refs.energyStep2ChoiceDetail.textContent = "请先进入项目并完成基础信息保存，再从两种典型年曲线来源中二选一。";
    return;
  }
  if (!isProjectCreateCompleted(project)) {
    refs.energyStep2ChoiceSummary.textContent = "当前选择：待基础信息保存";
    refs.energyStep2ChoiceDetail.textContent = "基础信息保存完成后，才能上传典型年8760小时模板或调用所选省份典型曲线。";
    return;
  }
  const totalYears = Number.isInteger(project.forecastYears) && project.forecastYears > 0 ? project.forecastYears : 0;
  const annualInputYears = getAnnualInputYearCount(project);
  const annualReady = totalYears > 0 && annualInputYears === totalYears;
  if (!annualInputYears) {
    refs.energyStep2ChoiceSummary.textContent = "当前选择：待完成第一步";
    refs.energyStep2ChoiceDetail.textContent = "请先导入逐年总量模板，录入测算周期内各年度总小时数，再开始第二步二选一。";
    return;
  }
  if (!annualReady) {
    refs.energyStep2ChoiceSummary.textContent = `当前选择：待补齐逐年总量（${annualInputYears}/${totalYears}）`;
    refs.energyStep2ChoiceDetail.textContent = "第二步必须在逐年总量覆盖全部测算年度后再进行。";
    return;
  }
  if (project.energyData?.typicalCurveSource === "province_typical_curve") {
    refs.energyStep2ChoiceSummary.textContent = "当前选择：调用所选省份典型曲线";
    refs.energyStep2ChoiceDetail.textContent = `当前生效来源为 ${describeProvinceTypicalCurve(project)} 典型曲线；如切换为模板导入，将以新来源覆盖当前典型年曲线。`;
    return;
  }
  if (project.energyData?.typicalCurveSource === "typical_curve_8760") {
    refs.energyStep2ChoiceSummary.textContent = "当前选择：上传典型年8760小时模板";
    refs.energyStep2ChoiceDetail.textContent = "当前生效来源为典型年8760小时模板；如切换为省份典型曲线，将以新来源覆盖当前典型年曲线。";
    return;
  }
  refs.energyStep2ChoiceSummary.textContent = activeChoice === "province"
    ? "当前选择：准备调用所选省份典型曲线"
    : "当前选择：准备上传典型年8760小时模板";
  refs.energyStep2ChoiceDetail.textContent = "第二步二选一：确认任一来源完成后，系统将据此生成测算周期内各年上网电量。";
}

function setEnergyButtonVariant(button, variant = "ghost") {
  if (!button) return;
  button.classList.toggle("primary-button", variant === "primary");
  button.classList.toggle("ghost-button", variant !== "primary");
}

function setEnergyPaneCurrentState(pane, statusElement, message = "") {
  if (pane) {
    pane.classList.toggle("is-current-source", Boolean(message));
  }
  if (!statusElement) return;
  if (message) {
    statusElement.hidden = false;
    statusElement.textContent = message;
  } else {
    statusElement.hidden = true;
    statusElement.textContent = "";
  }
}

function persistAppDataNow(options = {}) {
  const snapshot = buildAppDataSnapshot();
  const forceLocal = Boolean(options.forceLocal);
  let localSucceeded = false;
  let localAttempted = false;

  const shouldTryLocal = Boolean(getBrowserStorage("localStorage"))
    && appDataStorageMode !== "idb_only"
    && (forceLocal || Date.now() - lastLocalStoragePersistAt >= LOCAL_STORAGE_PERSIST_INTERVAL_MS);

  if (shouldTryLocal) {
    localAttempted = true;
    localSucceeded = appDataSnapshotStore.writeLocalSnapshot(snapshot, {
      onLocalWriteError: (error) => {
        appDataStorageMode = "idb_only";
        console.warn("localStorage容量不足，已切换IndexedDB持久化。", error);
      }
    });
    if (localSucceeded) {
      lastLocalStoragePersistAt = Date.now();
    }
  }

  const currentSeq = ++persistSequence;
  void appDataSnapshotStore.writeDbSnapshot(snapshot)
    .then(() => {
      if (currentSeq !== persistSequence) return;
      storageWarningShown = false;
    })
    .catch((error) => {
      if (currentSeq !== persistSequence) return;
      console.warn("写入IndexedDB业务快照失败。", error);
      if (!localSucceeded && !storageWarningShown) {
        storageWarningShown = true;
        setTopMeta("本地存储不可用，当前改动可能在刷新后丢失。");
      }
    });

  if (localSucceeded || !localAttempted) {
    storageWarningShown = false;
  } else if (!appDataSnapshotStore.supportsIndexedDb() && !storageWarningShown) {
    storageWarningShown = true;
    setTopMeta("浏览器不支持大容量本地存储，当前改动可能在刷新后丢失。");
  }
}

function schedulePersistAppData() {
  if (typeof window === "undefined") {
    persistAppDataNow();
    return;
  }
  if (persistAppDataTimer) {
    window.clearTimeout(persistAppDataTimer);
  }
  persistAppDataTimer = window.setTimeout(() => {
    persistAppDataTimer = null;
    persistAppDataNow();
  }, 120);
}

function cancelScheduledPersistAppData() {
  if (persistAppDataTimer && typeof window !== "undefined") {
    window.clearTimeout(persistAppDataTimer);
  }
  persistAppDataTimer = null;
}

function getActiveProject() {
  const project = appState.projects.find((item) => item.id === appState.activeProjectId) || null;
  if (!project) return null;
  if (!appState.auth.loggedIn) return null;
  return projectBelongsToCurrentAccount(project) ? project : null;
}

function getActiveScenario(project) {
  return project.scenarios.find((scenario) => scenario.id === project.activeScenarioId) || null;
}

function getActiveRun(project) {
  return project.priceRuns.find((run) => run.id === project.activeRunId) || null;
}

function getProvinceDefaults(provinceKey) {
  if (PROVINCE_DEFAULT_PARAMS[provinceKey]) return { ...PROVINCE_DEFAULT_PARAMS[provinceKey] };
  const benchmark = PROVINCE_BENCHMARKS[provinceKey];
  if (!benchmark) {
    return {
      mechanismEnabled: true,
      mechanismRatio: 0.3,
      mechanismPrice: 340,
      marketOpFee: 6,
      gridAssessFee: 8,
      ancillaryFee: 16,
      otherFee: 3,
      greenCertPrice: 18,
      greenPremiumPrice: 10,
      storageArbitragePrice: 14,
      storageCapacityCompPrice: 8,
      storageAncillaryRevenuePrice: 10,
      storageOtherRevenuePrice: 3
    };
  }
  const mechanismEnabled = benchmark.mechanismState !== "逐步退出";
  return {
    mechanismEnabled,
    mechanismRatio: mechanismEnabled ? 0.32 : 0.12,
    mechanismPrice: benchmark.capturePrice + 6,
    marketOpFee: 6,
    gridAssessFee: 8,
    ancillaryFee: benchmark.ancillaryFee,
    otherFee: 3,
    greenCertPrice: 18,
    greenPremiumPrice: 10,
    storageArbitragePrice: 14,
    storageCapacityCompPrice: 8,
    storageAncillaryRevenuePrice: 10,
    storageOtherRevenuePrice: 3
  };
}

function resetProjectProvinceContextSync() {
  lastSyncedProjectProvinceContextKey = "";
}

function getProjectProvinceContext(project = getActiveProject()) {
  if (!project || !PROVINCE_KEY_SET.has(project.province)) return null;
  return {
    projectId: project.id,
    provinceKey: project.province,
    regionKey: getPolicyRegionKeyByProvince(project.province) || "all"
  };
}

function syncProjectProvinceScopedState(project = getActiveProject(), options = {}) {
  const context = getProjectProvinceContext(project);
  if (!context) {
    resetProjectProvinceContextSync();
    return false;
  }
  const contextKey = `${context.projectId}|${context.provinceKey}`;
  if (!options.force && contextKey === lastSyncedProjectProvinceContextKey) {
    return false;
  }
  appState.policyFilters.provinceKey = context.provinceKey;
  appState.policyFilters.regionKey = context.regionKey;
  if (appState.benchmarkMap.level === "province") {
    appState.benchmarkMap = {
      ...appState.benchmarkMap,
      provinceKey: context.provinceKey,
      zoom: null,
      rangeMin: null,
      rangeMax: null
    };
  }
  lastSyncedProjectProvinceContextKey = contextKey;
  return true;
}

function shouldAutoSyncProvinceDefaults(project) {
  if (!project || !PROVINCE_KEY_SET.has(project.province)) return false;
  ensureScenarioMetadata(project);
  const baseline = getBaselineScenario(project);
  if (!baseline || baseline.locked) return false;
  if (project.scenarios.length !== 1) return false;
  if (project.statuses["scenario-page"] === "completed") return false;
  if (Object.keys(project.resultsByScenario || {}).length) return false;
  return true;
}

function syncProjectProvinceDefaultsToBaseline(project, options = {}) {
  if (!project || !PROVINCE_KEY_SET.has(project.province)) return false;
  ensureScenarioMetadata(project);
  const baseline = getBaselineScenario(project);
  if (!baseline) return false;
  if (!options.force && !shouldAutoSyncProvinceDefaults(project)) {
    return false;
  }
  baseline.config = defaultScenarioConfig(project);
  baseline.updatedAt = new Date().toISOString();
  project.activeScenarioId = baseline.id;
  return true;
}

function ensureScenarioMetadata(project) {
  if (!project.scenarios?.length) return;
  const baselineId = project.scenarios.find((scenario) => scenario.isBaseline)?.id || project.scenarios[0].id;
  project.scenarios.forEach((scenario) => {
    scenario.isBaseline = scenario.id === baselineId;
    if (typeof scenario.locked !== "boolean") {
      scenario.locked = false;
    }
  });
  if (!project.scenarios.some((scenario) => scenario.id === project.activeScenarioId)) {
    project.activeScenarioId = project.scenarios[0].id;
  }
}

function getBaselineScenario(project) {
  ensureScenarioMetadata(project);
  return project.scenarios.find((scenario) => scenario.isBaseline) || project.scenarios[0] || null;
}

function countScenariosForCompare(project) {
  return project.scenarios.filter((scenario) => project.resultsByScenario[scenario.id]).length;
}

function isProjectCreateCompleted(project) {
  if (!project) return false;
  const nameReady = typeof project.name === "string" && project.name.trim().length > 0;
  const provinceReady = PROVINCE_KEY_SET.has(project.province);
  const assetReady = ASSET_TYPE_SET.has(project.assetType);
  const siteReady = SITE_TYPE_SET.has(project.siteType);
  const storageReady = !project.hasStorage
    || (
      Number.isFinite(project.storagePowerMw)
      && project.storagePowerMw > 0
      && Number.isFinite(project.storageDurationH)
      && project.storageDurationH > 0
    );
  const capacityReady = Number.isFinite(project.capacityMw) && project.capacityMw > 0;
  const startReady = Number.isInteger(project.startYear) && project.startYear >= 2026;
  const periodReady = Number.isInteger(project.forecastYears) && project.forecastYears >= 1;
  return nameReady && provinceReady && assetReady && siteReady && storageReady && capacityReady && startReady && periodReady;
}

function countCompleteEnergyYears(project) {
  const energyData = ensureProjectEnergyDataDerivedState(project);
  if (!project || !energyData?.annualSummary) return 0;
  if (!Number.isInteger(project.forecastYears) || project.forecastYears <= 0) return 0;
  let count = 0;
  for (let i = 0; i < project.forecastYears; i += 1) {
    const year = project.startYear + i;
    if (
      energyData.annualSummary?.[year]?.status === "完整"
      && Array.isArray(energyData.hourlyByYear?.[year])
      && energyData.hourlyByYear[year].length === 8760
    ) {
      count += 1;
    }
  }
  return count;
}

function hasEnergyHistoryEntryReadiness(project) {
  if (!project || !Number.isInteger(project.forecastYears) || project.forecastYears <= 0) {
    return false;
  }
  if (!isProjectCreateCompleted(project)) return false;
  const annualInputYears = getAnnualInputYearCount(project);
  if (annualInputYears !== project.forecastYears) return false;
  if (!hasEnergyTypicalCurve(project)) return false;
  return true;
}

function listMissingEnergyYears(project, limit = 6) {
  const energyData = ensureProjectEnergyDataDerivedState(project);
  if (!project || !energyData?.annualSummary) return [];
  if (!Number.isInteger(project.forecastYears) || project.forecastYears <= 0) return [];
  const years = [];
  for (let i = 0; i < project.forecastYears; i += 1) {
    const year = project.startYear + i;
    if (
      energyData.annualSummary?.[year]?.status !== "完整"
      || !Array.isArray(energyData.hourlyByYear?.[year])
      || energyData.hourlyByYear[year].length !== 8760
    ) {
      years.push(year);
    }
  }
  if (years.length <= limit) return years;
  return [...years.slice(0, limit), `...共${years.length}年`];
}

function getEnergyCompletionState(project) {
  const createReady = Boolean(project && isProjectCreateCompleted(project));
  const totalYears = Number.isInteger(project?.forecastYears) && project.forecastYears > 0
    ? project.forecastYears
    : 0;
  const energyData = project ? ensureProjectEnergyDataDerivedState(project) : createEmptyEnergyDataState("annual_hours");
  const annualInputYears = project ? getAnnualInputYearCount(project) : 0;
  const hasTypicalCurve = project ? hasEnergyTypicalCurve(project) : false;
  const completeYears = project ? countCompleteEnergyYears(project) : 0;
  const totalEnergyMwh = Object.values(energyData.annualSummary || {}).reduce((sum, item) => {
    const value = Number(item?.energyMwh);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const ready = createReady && hasEnergyHistoryEntryReadiness(project);

  return {
    createReady,
    totalYears,
    annualInputYears,
    hasTypicalCurve,
    completeYears,
    totalEnergyMwh,
    energyData,
    ready
  };
}

function hasActiveActivatableRun(project) {
  const run = getActiveRun(project);
  return Boolean(run && canActivateRun(run));
}


function hasResultForScenario(project, scenarioId) {
  if (!project || !scenarioId) return false;
  const result = project.resultsByScenario?.[scenarioId];
  return Boolean(result && Array.isArray(result.annualRows) && result.annualRows.length);
}

function hasActiveScenarioResult(project) {
  const scenario = getActiveScenario(project);
  return hasResultForScenario(project, scenario?.id || "");
}

function buildWorkflowCompletionSnapshot(project) {
  const energyState = getEnergyCompletionState(project);
  const completeEnergyYears = energyState.completeYears;
  const energyCompleted = energyState.ready;
  const historyReady = isProjectCreateCompleted(project) && Boolean(project.province);
  const historyCompleted = historyReady && project.statuses["history-page"] === "completed";
  const forecastCompleted = hasActiveActivatableRun(project);
  const scenarioCompleted = project.statuses["scenario-page"] === "completed";
  const resultsCompleted = hasActiveScenarioResult(project);
  const compareReadyCount = countScenariosForCompare(project);
  const compareCompleted = compareReadyCount >= 2;
  return {
    createCompleted: isProjectCreateCompleted(project),
    energyCompleted,
    historyReady,
    historyCompleted,
    forecastCompleted,
    scenarioCompleted,
    resultsCompleted,
    compareCompleted,
    hasPriceRuns: (project.priceRuns?.length || 0) > 0,
    completeEnergyYears,
    compareReadyCount
  };
}

function reconcileProjectStatuses(project) {
  if (!project) return;
  const snapshot = buildWorkflowCompletionSnapshot(project);
  project.statuses = workflowStatus.reconcileStatuses(project.statuses, snapshot, {
    workflowPages: WORKFLOW_PAGES,
    hasProjectName: Boolean(project.name?.trim?.())
  });
}

function reconcileAllProjectStatuses() {
  appState.projects.forEach((project) => reconcileProjectStatuses(project));
}

function setPageStatus(project, pageId, state) {
  if (!project || !project.statuses[pageId]) return;
  project.statuses[pageId] = state;
}

function closePageHelp() {
  if (refs.pageHelp) {
    refs.pageHelp.classList.remove("open");
  }
  if (refs.pageHelpButton) {
    refs.pageHelpButton.setAttribute("aria-expanded", "false");
  }
}

function togglePageHelp(event) {
  if (event) {
    event.stopPropagation();
  }
  if (!refs.pageHelp || !refs.pageHelpButton) return;
  const opening = !refs.pageHelp.classList.contains("open");
  refs.pageHelp.classList.toggle("open", opening);
  refs.pageHelpButton.setAttribute("aria-expanded", opening ? "true" : "false");
}

function getPageHelpContent(pageId, title, group) {
  const preset = PAGE_HELP_MAP[pageId];
  if (preset) return preset;
  return {
    purpose: `用于处理“${title}”相关设置与输入。`,
    meaning: `${group}页面用于承接当前流程节点的业务操作。`,
    guide: "建议先完成当前页关键输入，再进入下一流程页。"
  };
}

function statusText(state) {
  return workflowStatus.statusText(state);
}

function markDownstreamStale(project, fromPage) {
  if (!project) return;
  project.statuses = workflowStatus.markDownstreamStale(project.statuses, fromPage, {
    workflowPages: WORKFLOW_PAGES
  });
}

function setTopMeta(text, tone = "info") {
  const message = typeof text === "string" ? text.trim() : "";
  if (!refs.globalToast) return;
  if (topMetaHideTimer && typeof window !== "undefined") {
    window.clearTimeout(topMetaHideTimer);
    topMetaHideTimer = null;
  }
  if (!message) {
    refs.globalToast.hidden = true;
    refs.globalToast.textContent = "";
    refs.globalToast.removeAttribute("data-tone");
    return;
  }
  refs.globalToast.textContent = message;
  refs.globalToast.dataset.tone = tone;
  refs.globalToast.hidden = false;
  if (typeof window !== "undefined") {
    topMetaHideTimer = window.setTimeout(() => {
      refs.globalToast.hidden = true;
      refs.globalToast.textContent = "";
      refs.globalToast.removeAttribute("data-tone");
      topMetaHideTimer = null;
    }, 5600);
  }
}

function normalizeUserFacingError(errorLike) {
  const rawMessage = typeof errorLike === "string"
    ? errorLike
    : typeof errorLike?.message === "string"
      ? errorLike.message
      : "";
  const message = rawMessage.trim();
  if (!message) return "系统出现异常，请刷新页面后重试。";
  const referenceMatch = message.match(/Can't find variable:\s*([A-Za-z0-9_$]+)/i);
  if (referenceMatch) {
    return `系统脚本异常：缺少变量“${referenceMatch[1]}”，请刷新页面后重试。`;
  }
  if (/is not defined/i.test(message)) {
    const variableName = message.split(/\s+/)[0] || "未知变量";
    return `系统脚本异常：变量“${variableName}”未定义，请刷新页面后重试。`;
  }
  if (/Unexpected token/i.test(message)) {
    return "系统脚本解析失败，请刷新页面后重试。";
  }
  if (/NetworkError|Failed to fetch|Load failed|Script error/i.test(message)) {
    return "资源加载失败，请检查网络或刷新页面后重试。";
  }
  return message.replace(/^Uncaught\s+/i, "").trim() || "系统出现异常，请刷新页面后重试。";
}

function updatePrintReportHeader(project, scenario) {
  if (!refs.printProjectName || !refs.printScenarioName || !refs.printPeriodRange || !refs.printGeneratedTime) {
    return;
  }
  const period = getForecastPeriodDisplayRange(project);
  refs.printProjectName.textContent = project?.name || "-";
  refs.printScenarioName.textContent = scenario?.name || "-";
  refs.printPeriodRange.textContent = period;
  refs.printGeneratedTime.textContent = new Date().toLocaleString("zh-CN", { hour12: false });
}

function resolveVisiblePageId(pageId) {
  return PAGE_VIEW_ALIAS[pageId] || pageId;
}

function scrollCreateWorkspaceToStep(pageId) {
  if (typeof window === "undefined") return;
  const target = pageId === "energy-page" ? refs.createStepEnergy : refs.createStepForm;
  if (!target) return;
  window.requestAnimationFrame(() => {
    target.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

function scrollCreateWorkspaceToBottom() {
  if (typeof window === "undefined") return;
  const scrollContainer = refs.mainArea;
  const target = refs.createToEnergyButton || refs.createSaveMessage || refs.createStepForm;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: "smooth"
        });
        return;
      }
      if (target?.scrollIntoView) {
        target.scrollIntoView({ block: "end", behavior: "smooth" });
      }
    });
  });
}

function syncCreateWorkspaceStepVisibility(pageId) {
  if (!refs.createStepForm || !refs.createStepEnergy) return;
  if (pageId === "create-page") {
    refs.createStepForm.hidden = false;
    refs.createStepEnergy.hidden = true;
    return;
  }
  if (pageId === "energy-page") {
    refs.createStepForm.hidden = true;
    refs.createStepEnergy.hidden = false;
    return;
  }
  refs.createStepForm.hidden = false;
  refs.createStepEnergy.hidden = false;
}

function setActivePage(pageId) {
  if (pageId === "province-page" || pageId === "spot-page") {
    pageId = "scenario-page";
  }
  if (REQUIRES_LOGIN.has(pageId) && !appState.auth.loggedIn) {
    pageId = "home-page";
  }
  if (REQUIRES_PROJECT.has(pageId) && !getActiveProject()) {
    setTopMeta("请先创建项目或在“我的项目”里选择一个项目");
    pageId = "projects-page";
  }
  closeOverviewPolicyDetail();

  appState.activePage = pageId;
  const visiblePageId = resolveVisiblePageId(pageId);
  refs.topTitle.textContent = PAGE_TITLES[pageId] || "新能源平台";

  refs.navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === pageId);
  });

  refs.pages.forEach((page) => {
    page.classList.toggle("active", page.id === visiblePageId);
  });

  syncCreateWorkspaceStepVisibility(pageId);

  if (pageId === "home-page") {
    renderOverviewCarousel();
    startOverviewAutoplay();
    queueBenchmarkMapRefresh();
  } else {
    stopOverviewAutoplay();
  }

  if (pageId === "create-page" || pageId === "energy-page") {
    scrollCreateWorkspaceToStep(pageId);
  }

  renderAll();
  if (pageId === "scenario-page") {
    queueScenarioVisualResize();
  }
  if (pageId === "history-page") {
    queueHistoryChartsResize();
    queueHistoryChartsRefresh();
  }
  if (pageId === "compare-page") {
    queueCompareChartsResize();
  }
}

function refreshNavigationAvailability() {
  const hasProject = Boolean(getActiveProject());
  const loggedIn = appState.auth.loggedIn;
  refs.navItems.forEach((item) => {
    const page = item.dataset.page;
    const disabled = (REQUIRES_LOGIN.has(page) && !loggedIn) || (REQUIRES_PROJECT.has(page) && !hasProject);
    item.disabled = disabled;
    item.classList.toggle("disabled", disabled);
  });
}

function renderStatuses() {
  const project = getActiveProject();
  for (const pageId of WORKFLOW_PAGES) {
    const dot = document.querySelector(`#status-${pageId}`);
    if (!dot) continue;
    const pageTitle = PAGE_TITLES[pageId] || pageId;
    const standard = PAGE_COMPLETION_STANDARD_MAP[pageId] || "按当前页核心输入与结果校验通过后完成。";
    if (!project) {
      dot.removeAttribute("data-state");
      dot.title = `${pageTitle}：未绑定项目；完成标准：${standard}`;
      dot.setAttribute("aria-label", `${pageTitle}：未绑定项目；完成标准：${standard}`);
      continue;
    }
    const state = project.statuses[pageId];
    if (state === "completed") dot.dataset.state = "completed";
    else if (state === "in_progress") dot.dataset.state = "in_progress";
    else if (state === "stale") dot.dataset.state = "stale";
    else dot.removeAttribute("data-state");
    const label = statusText(state);
    dot.title = `${pageTitle}：${label}；完成标准：${standard}`;
    dot.setAttribute("aria-label", `${pageTitle}：${label}；完成标准：${standard}`);
  }
}

function renderTopbar() {
  const pageId = appState.activePage;
  const title = PAGE_TITLES[pageId] || "新能源平台";
  const group = PAGE_GROUPS[pageId] || "平台概览";
  const help = getPageHelpContent(pageId, title, group);
  if (refs.topTitle) {
    refs.topTitle.textContent = title;
  }
  if (refs.topSectionPath) {
    refs.topSectionPath.textContent = `${group} / ${title}`;
  }
  if (refs.pageHelpTitle) {
    refs.pageHelpTitle.textContent = `${title}说明`;
  }
  if (refs.pageHelpPurpose) {
    refs.pageHelpPurpose.textContent = `设置目的：${help.purpose}`;
  }
  if (refs.pageHelpMeaning) {
    refs.pageHelpMeaning.textContent = `页面意义：${help.meaning}`;
  }
  if (refs.pageHelpGuide) {
    refs.pageHelpGuide.textContent = `操作指导：${help.guide}`;
  }
  closePageHelp();
}

function renderSettings() {
  if (!refs.settingsAccountName || !refs.settingsAccountId || !refs.settingsLastLogin) return;
  const accountControls = [
    refs.passwordCurrent,
    refs.passwordNext,
    refs.passwordConfirm,
    refs.settingsLogoutButton
  ].filter(Boolean);
  if (!appState.auth.loggedIn) {
    refs.settingsAccountName.value = "-";
    refs.settingsAccountId.value = "-";
    refs.settingsLastLogin.value = "-";
    if (refs.changePasswordForm) refs.changePasswordForm.reset();
    accountControls.forEach((control) => {
      control.disabled = true;
    });
    setAccountManageMessage("");
    return;
  }
  accountControls.forEach((control) => {
    control.disabled = false;
  });
  refs.settingsAccountName.value = appState.auth.accountName || appState.auth.account || "-";
  refs.settingsAccountId.value = appState.auth.account || "-";
  refs.settingsLastLogin.value = formatAuthTime(appState.auth.lastLoginAt);
}

function hashSeed(text) {
  let hash = 2166136261;
  const raw = String(text || "");
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededNumber(seed, min, max) {
  if (max <= min) return min;
  const span = max - min;
  return min + (hashSeed(seed) % (span + 1));
}

function getProvinceBenchmarkValue(provinceKey) {
  const benchmark = PROVINCE_BENCHMARKS[provinceKey];
  if (benchmark && Number.isFinite(benchmark.capturePrice)) {
    return Number(benchmark.capturePrice);
  }
  const seeded = seededNumber(`province:${provinceKey}`, 258, 468);
  return Math.round(seeded);
}

function normalizeRegionName(name) {
  return String(name || "")
    .replace(/\s+/g, "")
    .replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市/g, "");
}

function resolveProvinceKeyFromGeoName(name) {
  const normalized = normalizeRegionName(name);
  return PROVINCE_NAME_KEY_MAP[normalized] || null;
}

function loadScriptResourceOnce(src, key) {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("当前环境不支持动态加载脚本"));
  }
  const loadedTag = `data-loaded-${key}`;
  const existingLoaded = document.querySelector(`script[${loadedTag}="1"]`);
  if (existingLoaded) {
    return Promise.resolve();
  }
  const existingLoading = document.querySelector(`script[data-loading-key="${key}"]`);
  if (existingLoading) {
    return new Promise((resolve, reject) => {
      existingLoading.addEventListener("load", () => resolve(), { once: true });
      existingLoading.addEventListener("error", () => reject(new Error(`脚本加载失败：${src}`)), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    script.dataset.loadingKey = key;
    script.addEventListener("load", () => {
      script.setAttribute(loadedTag, "1");
      resolve();
    }, { once: true });
    script.addEventListener("error", () => {
      reject(new Error(`脚本加载失败：${src}`));
    }, { once: true });
    document.head.appendChild(script);
  });
}

async function ensureMapRuntimeReady() {
  if (typeof window === "undefined") return false;
  if (!window.echarts) {
    if (!echartsLoaderPromise) {
      echartsLoaderPromise = loadScriptResourceOnce("./vendor/echarts.min.js?v=20260427b", "echarts-local")
        .catch(() => loadScriptResourceOnce("https://fastly.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js", "echarts-cdn-fastly"))
        .catch(() => loadScriptResourceOnce("https://unpkg.com/echarts@5.5.0/dist/echarts.min.js", "echarts-cdn-unpkg"));
    }
    try {
      await echartsLoaderPromise;
    } catch (error) {
      return false;
    }
  }
  return Boolean(window.echarts);
}

function ensureBenchmarkChart() {
  if (!refs.benchmarkMapCanvas) return null;
  if (typeof window === "undefined" || !window.echarts) return null;
  if (benchmarkMapChart && !benchmarkMapChart.isDisposed()) {
    benchmarkMapChart.resize();
    return benchmarkMapChart;
  }
  benchmarkMapChart = window.echarts.init(refs.benchmarkMapCanvas, null, { renderer: "canvas" });
  if (!benchmarkMapResizeBound && typeof window !== "undefined") {
    window.addEventListener("resize", () => {
      if (benchmarkMapChart && !benchmarkMapChart.isDisposed()) {
        benchmarkMapChart.resize();
      }
    });
    benchmarkMapResizeBound = true;
  }
  return benchmarkMapChart;
}

function queueBenchmarkMapRefresh() {
  if (typeof window === "undefined") return;
  const refresh = () => {
    if (appState.activePage !== "home-page") return;
    if (benchmarkMapChart && !benchmarkMapChart.isDisposed()) {
      benchmarkMapChart.resize();
    }
    void renderBenchmarkMap();
  };
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => window.requestAnimationFrame(refresh));
  }
  window.setTimeout(refresh, 180);
  window.setTimeout(() => {
    if (appState.activePage !== "home-page") return;
    if (benchmarkMapChart && !benchmarkMapChart.isDisposed()) {
      benchmarkMapChart.resize();
    }
  }, 420);
}

function setBenchmarkMapMessage(text) {
  if (!refs.benchmarkMapCanvas) return;
  if (benchmarkMapChart && !benchmarkMapChart.isDisposed()) {
    benchmarkMapChart.dispose();
    benchmarkMapChart = null;
  }
  refs.benchmarkMapCanvas.innerHTML = `<div class="map-empty">${escapeHtml(text)}</div>`;
}

function mapSourceOf(view) {
  if (view.level === "province" && view.provinceKey) {
    const fileName = PROVINCE_GEO_FILE_MAP[view.provinceKey];
    if (!fileName) return null;
    const provinceName = getProvinceName(view.provinceKey);
    return {
      mapName: provinceName || fileName,
      embeddedKey: `ne-map-${view.provinceKey}`,
      localScriptPath: `./vendor/echarts-map/province/${fileName}.js?v=20260427b`,
      urls: ECHARTS_MAP_BASE_URLS.map((baseUrl) => `${baseUrl}/province/${fileName}.json`)
    };
  }
  return {
    mapName: "china",
    embeddedKey: "ne-map-china",
    localScriptPath: "./vendor/echarts-map/china.js?v=20260427b",
    urls: ECHARTS_MAP_BASE_URLS.map((baseUrl) => `${baseUrl}/china.json`)
  };
}

function decodeMapCoordinate(encoded, encodeOffsets) {
  if (typeof encoded !== "string" || !Array.isArray(encodeOffsets) || encodeOffsets.length < 2) {
    return encoded;
  }
  let prevX = Number(encodeOffsets[0]);
  let prevY = Number(encodeOffsets[1]);
  if (!Number.isFinite(prevX) || !Number.isFinite(prevY)) {
    return encoded;
  }
  const result = [];
  for (let index = 0; index < encoded.length; index += 2) {
    const xCode = encoded.charCodeAt(index);
    const yCode = encoded.charCodeAt(index + 1);
    if (!Number.isFinite(xCode) || !Number.isFinite(yCode)) break;
    let x = xCode - 64;
    let y = yCode - 64;
    x = (x >> 1) ^ (-(x & 1));
    y = (y >> 1) ^ (-(y & 1));
    x += prevX;
    y += prevY;
    prevX = x;
    prevY = y;
    result.push([x / 1024, y / 1024]);
  }
  return result;
}

function decodePolygonRings(coordinates, encodeOffsets) {
  if (!Array.isArray(coordinates) || !Array.isArray(encodeOffsets)) {
    return coordinates;
  }
  return coordinates.map((ring, index) => {
    const ringOffsets = encodeOffsets[index];
    return decodeMapCoordinate(ring, ringOffsets);
  });
}

function cloneGeoJsonSafe(geoJson) {
  try {
    return JSON.parse(JSON.stringify(geoJson));
  } catch (error) {
    return geoJson;
  }
}

function decodeMapGeoIfNeeded(geoJson) {
  if (!geoJson || geoJson.UTF8Encoding !== true || !Array.isArray(geoJson.features)) {
    return geoJson;
  }
  const decodedGeo = cloneGeoJsonSafe(geoJson);
  if (!decodedGeo || !Array.isArray(decodedGeo.features)) {
    return geoJson;
  }
  decodedGeo.features.forEach((feature) => {
    const geometry = feature?.geometry;
    if (!geometry) return;
    if (geometry.type === "Polygon") {
      geometry.coordinates = decodePolygonRings(geometry.coordinates, geometry.encodeOffsets || []);
    } else if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
      const offsets = Array.isArray(geometry.encodeOffsets) ? geometry.encodeOffsets : [];
      geometry.coordinates = geometry.coordinates.map((polygon, index) => decodePolygonRings(polygon, offsets[index] || []));
    }
    if (Object.prototype.hasOwnProperty.call(geometry, "encodeOffsets")) {
      delete geometry.encodeOffsets;
    }
  });
  decodedGeo.UTF8Encoding = false;
  return decodedGeo;
}

function extractGeoFromRegisteredMap(registered) {
  const geoJson = registered?.geoJSON || registered?.geoJson || null;
  if (geoJson && Array.isArray(geoJson.features)) {
    return geoJson;
  }
  return null;
}

function tryGetRegisteredGeo(mapName) {
  if (typeof window === "undefined" || !window.echarts || !mapName) return null;
  const registered = window.echarts.getMap(mapName);
  return extractGeoFromRegisteredMap(registered);
}

async function loadMapGeo(source) {
  const directGeo = tryGetRegisteredGeo(source.mapName);
  if (directGeo) {
    const decodedDirectGeo = decodeMapGeoIfNeeded(directGeo);
    if (typeof window !== "undefined" && window.echarts && decodedDirectGeo && decodedDirectGeo !== directGeo) {
      window.echarts.registerMap(source.mapName, decodedDirectGeo);
    }
    return decodedDirectGeo;
  }

  const embeddedGeoKey = source.embeddedKey || source.mapName;
  const embeddedGeo = (typeof window !== "undefined" && window.NE_MAP_GEO && window.NE_MAP_GEO[embeddedGeoKey]) || null;
  if (embeddedGeo) {
    const decodedEmbeddedGeo = decodeMapGeoIfNeeded(embeddedGeo);
    if (typeof window !== "undefined" && window.echarts && !window.echarts.getMap(source.mapName)) {
      window.echarts.registerMap(source.mapName, decodedEmbeddedGeo);
    }
    return decodedEmbeddedGeo;
  }

  if (source.localScriptPath) {
    await loadScriptResourceOnce(source.localScriptPath, `emap-${source.mapName}`);
    const localDirectGeo = tryGetRegisteredGeo(source.mapName);
    if (localDirectGeo) {
      const decodedLocalGeo = decodeMapGeoIfNeeded(localDirectGeo);
      if (typeof window !== "undefined" && window.echarts && decodedLocalGeo && decodedLocalGeo !== localDirectGeo) {
        window.echarts.registerMap(source.mapName, decodedLocalGeo);
      }
      return decodedLocalGeo;
    }
  }
  const urls = Array.isArray(source.urls) ? source.urls.filter(Boolean) : [];
  if (!urls.length) {
    throw new Error("地图数据源为空");
  }
  const cacheKey = `${source.mapName}:${urls[0]}`;
  if (benchmarkGeoCache.has(cacheKey)) {
    return benchmarkGeoCache.get(cacheKey);
  }
  const loading = (async () => {
    let lastError = null;
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        const geoJson = decodeMapGeoIfNeeded(await response.json());
        if (typeof window !== "undefined" && window.echarts && !window.echarts.getMap(source.mapName)) {
          window.echarts.registerMap(source.mapName, geoJson);
        }
        return geoJson;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("地图数据加载失败");
  })().catch((error) => {
    benchmarkGeoCache.delete(cacheKey);
    throw error;
  });
  benchmarkGeoCache.set(cacheKey, loading);
  return loading;
}

function mapValueRange(data) {
  if (!Array.isArray(data) || !data.length) {
    return { min: 0, max: 0 };
  }
  const values = data
    .map((item) => Number(item?.value))
    .filter((value) => Number.isFinite(value));
  if (!values.length) {
    return { min: 0, max: 0 };
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function benchmarkFallbackRange(view) {
  const isProvinceLevel = view.level === "province" && Boolean(view.provinceKey);
  if (isProvinceLevel) {
    const base = getProvinceBenchmarkValue(view.provinceKey);
    return {
      min: clamp(Math.floor(base - 45), BENCHMARK_RANGE_MIN, BENCHMARK_RANGE_MAX),
      max: clamp(Math.ceil(base + 45), BENCHMARK_RANGE_MIN, BENCHMARK_RANGE_MAX)
    };
  }
  const values = PROVINCES.map((item) => getProvinceBenchmarkValue(item.key)).filter((value) => Number.isFinite(value));
  if (!values.length) {
    return { min: BENCHMARK_RANGE_MIN, max: BENCHMARK_RANGE_MAX };
  }
  return {
    min: Math.floor(Math.min(...values)),
    max: Math.ceil(Math.max(...values))
  };
}

function buildNationMapSeries(geoJson) {
  const features = Array.isArray(geoJson?.features) ? geoJson.features : [];
  return features.map((feature) => {
    const name = String(feature?.properties?.name || "");
    if (!name) return null;
    const provinceKey = resolveProvinceKeyFromGeoName(name);
    const value = provinceKey
      ? getProvinceBenchmarkValue(provinceKey)
      : seededNumber(`province-name:${name}`, 258, 468);
    return {
      name,
      value,
      provinceKey
    };
  }).filter(Boolean);
}

function buildCityMapSeries(provinceKey, geoJson) {
  const features = Array.isArray(geoJson?.features) ? geoJson.features : [];
  const provinceBase = getProvinceBenchmarkValue(provinceKey);
  return features.map((feature) => {
    const name = String(feature?.properties?.name || "");
    if (!name) return null;
    const offset = seededNumber(`city:${provinceKey}:${name}`, -48, 46);
    return {
      name,
      value: clamp(Math.round(provinceBase + offset), 120, 520)
    };
  }).filter(Boolean);
}

function benchmarkMapPalette(theme) {
  const normalizedTheme = normalizeTheme(theme);
  if (normalizedTheme === "dark") {
    return {
      text: "#c9d8eb",
      border: "#1a2433",
      shadow: "rgba(5, 11, 20, 0.55)"
    };
  }
  if (normalizedTheme === "eye") {
    return {
      text: "#294a35",
      border: "#edf5ea",
      shadow: "rgba(35, 71, 47, 0.2)"
    };
  }
  return {
    text: "#223a58",
    border: "#f4f7fb",
    shadow: "rgba(20, 36, 57, 0.2)"
  };
}

function benchmarkMapDefaultZoom(level) {
  return level === "province" ? 1.12 : 1.25;
}

function getBenchmarkMapCurrentZoom(chart, fallbackZoom) {
  const option = chart?.getOption?.();
  const rawSeries = Array.isArray(option?.series) ? option.series[0] : null;
  const rawZoom = Array.isArray(rawSeries?.zoom) ? Number(rawSeries.zoom[0]) : Number(rawSeries?.zoom);
  if (Number.isFinite(rawZoom)) {
    return clamp(rawZoom, BENCHMARK_MAP_ZOOM_MIN, BENCHMARK_MAP_ZOOM_MAX);
  }
  return clamp(fallbackZoom, BENCHMARK_MAP_ZOOM_MIN, BENCHMARK_MAP_ZOOM_MAX);
}

function adjustBenchmarkMapZoom(step) {
  const chart = ensureBenchmarkChart();
  if (!chart) return;
  const view = sanitizeBenchmarkMap(appState.benchmarkMap);
  const fallbackZoom = Number.isFinite(view.zoom)
    ? view.zoom
    : benchmarkMapDefaultZoom(view.level);
  const currentZoom = getBenchmarkMapCurrentZoom(chart, fallbackZoom);
  const nextZoom = clamp(currentZoom + step, BENCHMARK_MAP_ZOOM_MIN, BENCHMARK_MAP_ZOOM_MAX);
  appState.benchmarkMap.zoom = nextZoom;
  chart.setOption({
    series: [{ zoom: nextZoom }]
  });
  schedulePersistAppData();
}

function resetBenchmarkMapZoom() {
  appState.benchmarkMap.zoom = null;
  void renderBenchmarkMap();
  schedulePersistAppData();
}

function benchmarkRangeToTop(value) {
  const { min, max } = benchmarkRangeSliderBounds;
  const span = Math.max(max - min, 1);
  const raw = ((max - value) / span) * 100;
  return clamp(raw, 2, 98);
}

function syncBenchmarkRangeSlider(min, max, rangeMin, rangeMax) {
  benchmarkRangeSliderBounds = {
    min: Math.floor(min),
    max: Math.ceil(max)
  };
  const normalizedMin = clamp(Math.round(rangeMin), benchmarkRangeSliderBounds.min, benchmarkRangeSliderBounds.max);
  const normalizedMax = clamp(Math.round(rangeMax), benchmarkRangeSliderBounds.min, benchmarkRangeSliderBounds.max);
  if (refs.benchmarkRangeSlider) {
    refs.benchmarkRangeSlider.style.setProperty("--handle-max-pos", `${benchmarkRangeToTop(normalizedMax).toFixed(2)}%`);
    refs.benchmarkRangeSlider.style.setProperty("--handle-min-pos", `${benchmarkRangeToTop(normalizedMin).toFixed(2)}%`);
  }
}

function benchmarkValueFromClientY(clientY) {
  if (!refs.benchmarkRangeSlider) return null;
  const rect = refs.benchmarkRangeSlider.getBoundingClientRect();
  const ratio = clamp((clientY - rect.top) / Math.max(rect.height, 1), 0, 1);
  const { min, max } = benchmarkRangeSliderBounds;
  return Math.round(max - ratio * (max - min));
}

function applyBenchmarkRangeFilter(nextMin, nextMax, persist = false) {
  const { min, max } = benchmarkRangeSliderBounds;
  let rangeMin = clamp(Math.round(nextMin), min, max);
  let rangeMax = clamp(Math.round(nextMax), min, max);
  if (rangeMin > rangeMax) {
    const swap = rangeMin;
    rangeMin = rangeMax;
    rangeMax = swap;
  }
  appState.benchmarkMap.rangeMin = rangeMin;
  appState.benchmarkMap.rangeMax = rangeMax;
  if (refs.benchmarkMapLegendMin) {
    refs.benchmarkMapLegendMin.textContent = `${rangeMin.toFixed(0)} 元`;
  }
  if (refs.benchmarkMapLegendMax) {
    refs.benchmarkMapLegendMax.textContent = `${rangeMax.toFixed(0)} 元`;
  }
  syncBenchmarkRangeSlider(min, max, rangeMin, rangeMax);
  if (benchmarkMapChart && !benchmarkMapChart.isDisposed()) {
    benchmarkMapChart.setOption({
      visualMap: {
        range: [rangeMin, rangeMax]
      }
    });
  }
  if (persist) {
    schedulePersistAppData();
  }
}

function startBenchmarkRangeDrag(handleType, clientY) {
  benchmarkRangeDragHandle = handleType;
  if (refs.benchmarkRangeHandleMax) {
    refs.benchmarkRangeHandleMax.classList.toggle("active", handleType === "max");
  }
  if (refs.benchmarkRangeHandleMin) {
    refs.benchmarkRangeHandleMin.classList.toggle("active", handleType === "min");
  }
  updateBenchmarkRangeDrag(clientY, true);
}

function updateBenchmarkRangeDrag(clientY, persist) {
  if (!benchmarkRangeDragHandle) return;
  const value = benchmarkValueFromClientY(clientY);
  if (!Number.isFinite(value)) return;
  const { min, max } = benchmarkRangeSliderBounds;
  const currentMin = Number.isFinite(appState.benchmarkMap.rangeMin) ? appState.benchmarkMap.rangeMin : min;
  const currentMax = Number.isFinite(appState.benchmarkMap.rangeMax) ? appState.benchmarkMap.rangeMax : max;
  if (benchmarkRangeDragHandle === "max") {
    applyBenchmarkRangeFilter(currentMin, Math.max(value, currentMin), persist);
  } else {
    applyBenchmarkRangeFilter(Math.min(value, currentMax), currentMax, persist);
  }
}

function stopBenchmarkRangeDrag() {
  benchmarkRangeDragHandle = null;
  if (refs.benchmarkRangeHandleMax) {
    refs.benchmarkRangeHandleMax.classList.remove("active");
  }
  if (refs.benchmarkRangeHandleMin) {
    refs.benchmarkRangeHandleMin.classList.remove("active");
  }
}

async function renderBenchmarkMap() {
  if (!refs.benchmarkMapCanvas) return;
  const runtimeReady = await ensureMapRuntimeReady();
  if (!runtimeReady) {
    setBenchmarkMapMessage("地图组件加载失败，请刷新后重试。");
    const fallbackRange = benchmarkFallbackRange(sanitizeBenchmarkMap(appState.benchmarkMap));
    const fallbackMin = Number.isFinite(fallbackRange.min) ? fallbackRange.min : BENCHMARK_RANGE_MIN;
    const fallbackMax = Number.isFinite(fallbackRange.max) ? Math.max(fallbackRange.max, fallbackMin + 1) : BENCHMARK_RANGE_MAX;
    if (refs.benchmarkMapLegendMin) refs.benchmarkMapLegendMin.textContent = `${fallbackMin.toFixed(0)} 元`;
    if (refs.benchmarkMapLegendMax) refs.benchmarkMapLegendMax.textContent = `${fallbackMax.toFixed(0)} 元`;
    syncBenchmarkRangeSlider(fallbackMin, fallbackMax, fallbackMin, fallbackMax);
    return;
  }
  const view = sanitizeBenchmarkMap(appState.benchmarkMap);
  appState.benchmarkMap = view;
  const isProvinceLevel = view.level === "province" && Boolean(view.provinceKey);
  if (refs.benchmarkBackButton) {
    refs.benchmarkBackButton.hidden = !isProvinceLevel;
    refs.benchmarkBackButton.textContent = isProvinceLevel ? `返回全国（${getProvinceName(view.provinceKey)}）` : "返回全国";
  }
  if (refs.benchmarkMapSubtitle) {
    refs.benchmarkMapSubtitle.textContent = isProvinceLevel
      ? `${getProvinceName(view.provinceKey)}地州电价分布（虚拟样例）`
      : "点击省份查看地州详情";
  }
  if (refs.benchmarkMapTip) {
    refs.benchmarkMapTip.innerHTML = isProvinceLevel
      ? "提示：当前地州数据为虚拟样例，<br>可拖动左侧图例游标筛选电价区间。"
      : "提示：鼠标悬停查看详细电价数据，点击省份可查看地州详情，<br>可拖动左侧图例游标筛选电价区间。";
  }
  if (refs.benchmarkMapUpdated) {
    refs.benchmarkMapUpdated.textContent = "数据更新时间：2026-04-13";
  }

  const chart = ensureBenchmarkChart();
  if (!chart) {
    setBenchmarkMapMessage("地图组件加载失败，请检查网络后刷新。");
    return;
  }
  chart.resize();

  const source = mapSourceOf(view);
  if (!source) {
    setBenchmarkMapMessage("暂不支持该省份地州地图。");
    return;
  }
  const renderToken = ++benchmarkMapRenderToken;
  try {
    const geoJson = await loadMapGeo(source);
    if (renderToken !== benchmarkMapRenderToken) return;
    const seriesData = isProvinceLevel
      ? buildCityMapSeries(view.provinceKey, geoJson)
      : buildNationMapSeries(geoJson);
    const valueRange = mapValueRange(seriesData);
    let min = Number.isFinite(valueRange.min) ? Math.floor(valueRange.min) : BENCHMARK_RANGE_MIN;
    let max = Number.isFinite(valueRange.max) ? Math.ceil(valueRange.max) : BENCHMARK_RANGE_MAX;
    if (max < min) {
      const swap = min;
      min = max;
      max = swap;
    }
    if (max === min) {
      max = min + 1;
    }
    const selectedMin = clamp(
      Number.isFinite(view.rangeMin) ? view.rangeMin : min,
      min,
      max
    );
    const selectedMax = clamp(
      Number.isFinite(view.rangeMax) ? view.rangeMax : max,
      min,
      max
    );
    let rangeMin = Math.min(selectedMin, selectedMax);
    let rangeMax = Math.max(selectedMin, selectedMax);
    // 兼容历史持久化里“单点区间”导致地图几乎全灰的情况：自动回到全量区间
    if (max > min && (rangeMax - rangeMin) < 1) {
      rangeMin = min;
      rangeMax = max;
    }
    appState.benchmarkMap.rangeMin = rangeMin;
    appState.benchmarkMap.rangeMax = rangeMax;
    if (refs.benchmarkMapLegendMin) {
      refs.benchmarkMapLegendMin.textContent = `${rangeMin.toFixed(0)} 元`;
    }
    if (refs.benchmarkMapLegendMax) {
      refs.benchmarkMapLegendMax.textContent = `${rangeMax.toFixed(0)} 元`;
    }
    syncBenchmarkRangeSlider(min, max, rangeMin, rangeMax);
    const defaultZoom = benchmarkMapDefaultZoom(view.level);
    const resolvedZoom = Number.isFinite(view.zoom)
      ? clamp(view.zoom, BENCHMARK_MAP_ZOOM_MIN, BENCHMARK_MAP_ZOOM_MAX)
      : defaultZoom;
    appState.benchmarkMap.zoom = resolvedZoom;

    const palette = benchmarkMapPalette(appState.theme);
    chart.off("click");
    chart.setOption({
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          const value = Number(params?.value);
          const valueText = Number.isFinite(value) ? `${value.toFixed(1)} 元/MWh` : "暂无数据";
          return `${escapeHtml(params.name)}<br/>${valueText}`;
        }
      },
      visualMap: {
        show: false,
        min,
        max,
        range: [rangeMin, rangeMax],
        orient: "vertical",
        left: 6,
        bottom: 8,
        itemWidth: 12,
        itemHeight: 150,
        text: ["高价", "低价"],
        textStyle: {
          color: palette.text
        },
        calculable: false,
        inRange: {
          color: ["#18a74c", "#f1c882", "#e85d4e"]
        },
        outOfRange: {
          color: ["#c9d3e1"]
        }
      },
      series: [{
        type: "map",
        map: source.mapName,
        roam: true,
        zoom: resolvedZoom,
        label: {
          show: true,
          color: palette.text,
          fontSize: isProvinceLevel ? 11 : 10
        },
        emphasis: {
          label: {
            show: true,
            color: "#ffffff",
            fontWeight: 700
          },
          itemStyle: {
            areaColor: "#2f7be6"
          }
        },
        itemStyle: {
          borderColor: palette.border,
          borderWidth: 1.1,
          shadowColor: palette.shadow,
          shadowBlur: 2
        },
        data: seriesData
      }]
    }, true);
    const resizeBenchmarkMap = () => {
      if (benchmarkMapChart && !benchmarkMapChart.isDisposed()) {
        benchmarkMapChart.resize();
      }
    };
    resizeBenchmarkMap();
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(resizeBenchmarkMap);
      window.setTimeout(resizeBenchmarkMap, 120);
      window.setTimeout(resizeBenchmarkMap, 360);
    }

    chart.on("click", (params) => {
      const areaName = String(params?.name || "");
      if (!areaName) return;
      const value = Number(params?.value);
      if (!isProvinceLevel) {
        const provinceKey = resolveProvinceKeyFromGeoName(areaName);
        if (!provinceKey || !PROVINCE_GEO_FILE_MAP[provinceKey]) return;
        const regionKey = getPolicyRegionKeyByProvince(provinceKey);
        appState.benchmarkMap = {
          level: "province",
          provinceKey,
          zoom: null,
          rangeMin: null,
          rangeMax: null
        };
        appState.policyFilters.provinceKey = provinceKey;
        if (regionKey) {
          appState.policyFilters.regionKey = regionKey;
        }
        void renderBenchmarkMap();
        renderPolicyPanel();
        schedulePersistAppData();
        return;
      }
      const valueText = Number.isFinite(value) ? `${value.toFixed(1)} 元/MWh` : "暂无数据";
      setTopMeta(`${areaName}：${valueText}`);
    });
  } catch (error) {
    if (renderToken !== benchmarkMapRenderToken) return;
    const fallbackRange = benchmarkFallbackRange(view);
    const fallbackMin = Number.isFinite(fallbackRange.min) ? fallbackRange.min : BENCHMARK_RANGE_MIN;
    const fallbackMax = Number.isFinite(fallbackRange.max) ? Math.max(fallbackRange.max, fallbackMin + 1) : BENCHMARK_RANGE_MAX;
    appState.benchmarkMap.rangeMin = fallbackMin;
    appState.benchmarkMap.rangeMax = fallbackMax;
    if (refs.benchmarkMapLegendMin) {
      refs.benchmarkMapLegendMin.textContent = `${fallbackMin.toFixed(0)} 元`;
    }
    if (refs.benchmarkMapLegendMax) {
      refs.benchmarkMapLegendMax.textContent = `${fallbackMax.toFixed(0)} 元`;
    }
    syncBenchmarkRangeSlider(fallbackMin, fallbackMax, fallbackMin, fallbackMax);
    chart.clear();
    chart.setOption({
      graphic: {
        type: "text",
        left: "center",
        top: "middle",
        style: {
          text: "地图数据加载失败，请检查网络后重试",
          fill: normalizeTheme(appState.theme) === "dark" ? "#c7d6ea" : "#355176",
          fontSize: 14,
          fontWeight: 700
        }
      }
    }, true);
  }
}

function renderPolicyPanel() {
  const view = policyPanel.buildPolicyPanelViewModel({
    filters: appState.policyFilters,
    provinceKeySet: PROVINCE_KEY_SET,
    regionKeySet: POLICY_REGION_KEY_SET,
    regions: POLICY_REGIONS,
    provinces: PROVINCES,
    cards: POLICY_CARDS
  });
  appState.policyFilters.provinceKey = view.filters.provinceKey;
  appState.policyFilters.regionKey = view.filters.regionKey;
  refs.policyFilterRegion.innerHTML = view.regionOptionsHtml;
  refs.policyFilterRegion.value = appState.policyFilters.regionKey;
  refs.policyFilterProvince.innerHTML = view.provinceOptionsHtml;
  refs.policyFilterProvince.value = appState.policyFilters.provinceKey;
  refs.policyCardList.innerHTML = view.cardListHtml;
}

function renderHome() {
  renderPolicyPanel();
  if (appState.activePage === "home-page") {
    void renderBenchmarkMap();
  }
}

function renderProjects() {
  const accountProjects = getProjectsForCurrentAccount();
  const newWorkspaceProjects = accountProjects.filter((project) => isNewWorkspaceProject(project));
  const historyProjects = accountProjects.filter((project) => !isNewWorkspaceProject(project));
  refs.projectCountBadge.textContent = String(historyProjects.length);
  const buildProjectListItem = (project) => {
    const createReady = isProjectCreateCompleted(project);
    return projectListView.buildProjectListItem(project, {
      activeRun: getActiveRun(project),
      scenario: getActiveScenario(project),
      statuses: project.statuses || statusMapTemplate(),
      createReady,
      forecastPeriod: createReady ? getForecastPeriodDisplayRange(project) : "待创建",
      provinceName: getProvinceName(project.province),
      assetTypeText: project.assetType === "wind" ? "风电" : "光伏",
      siteTypeText: project.siteType === "offshore" ? "海上" : "陆上",
      storageText: getStorageConfigText(project)
    });
  };

  refs.projectList.innerHTML = projectListView.buildProjectListHtml({
    newProjects: newWorkspaceProjects.map(buildProjectListItem),
    historyProjects: historyProjects.map(buildProjectListItem),
    workflowPages: WORKFLOW_PAGES,
    pageTitles: PAGE_TITLES,
    statusText
  });

  projectListView.bindProjectListActions({
    root: refs.projectList,
    handlers: {
      createProject: () => {
        const created = createEmptyWorkspaceProject();
        if (created) {
          setTopMeta("新项目已生成，可进入项目继续配置。");
          renderAll();
        }
      },
      openProject: (projectId) => {
        appState.activeProjectId = projectId;
        setActivePage("create-page");
      },
      duplicateProject: (projectId) => {
        const source = appState.projects.find((item) => item.id === projectId);
        if (!source || !projectBelongsToCurrentAccount(source)) return;
        const clone = cloneData(source);
        clone.id = makeId("proj");
        clone.ownerAccount = String(appState.auth.account || "").trim();
        clone.name = resolveUniqueProjectName(`${source.name}-副本`);
        clone.createdAt = new Date().toISOString();
        appState.projects.unshift(clone);
        renderAll();
      },
      deleteProject: (targetId) => {
        const target = appState.projects.find((item) => item.id === targetId);
        if (!target || !projectBelongsToCurrentAccount(target)) return;
        const confirmed = typeof window === "undefined"
          ? true
          : window.confirm(`确定删除项目“${target.name}”吗？删除后不可恢复。`);
        if (!confirmed) return;
        appState.projects = appState.projects.filter((item) => item.id !== targetId);
        if (appState.activeProjectId === targetId) {
          appState.activeProjectId = getProjectsForCurrentAccount()[0]?.id || null;
        }
        renderAll();
      }
    }
  });
}

function initProvinceSelect() {
  refs.createProvince.innerHTML = [
    '<option value="">请选择省份</option>',
    ...PROVINCES.map((province) => `
    <option value="${province.key}">${province.name}</option>
  `)
  ].join("");
  refs.createProvince.value = "";
}

function syncCreateStorageFieldsUi() {
  const storageEnabled = refs.createHasStorage?.value === "yes";
  if (refs.createStoragePowerField) {
    refs.createStoragePowerField.hidden = !storageEnabled;
  }
  if (refs.createStorageDurationField) {
    refs.createStorageDurationField.hidden = !storageEnabled;
  }
  if (refs.createStorageNoteField) {
    refs.createStorageNoteField.hidden = !storageEnabled;
  }
  if (refs.createStoragePowerMw) {
    refs.createStoragePowerMw.disabled = !storageEnabled;
  }
  if (refs.createStorageDurationH) {
    refs.createStorageDurationH.disabled = !storageEnabled;
  }
  if (refs.createStorageNote) {
    refs.createStorageNote.disabled = !storageEnabled;
  }
}

function resetCreateProjectFormForNew() {
  if (!refs.createProjectForm) return;
  createFormSyncedProjectId = null;
  refs.createProjectForm.reset();
  const projectName = document.querySelector("#create-project-name");
  const assetType = document.querySelector("#create-asset-type");
  const siteType = document.querySelector("#create-site-type");
  const hasStorage = document.querySelector("#create-has-storage");
  const storagePower = refs.createStoragePowerMw;
  const storageDuration = refs.createStorageDurationH;
  const storageNote = refs.createStorageNote;
  const capacity = document.querySelector("#create-capacity-mw");
  const startYear = document.querySelector("#create-start-year");
  const forecastYears = document.querySelector("#create-forecast-years");
  const note = document.querySelector("#create-note");
  if (projectName) projectName.value = "";
  if (refs.createProvince) refs.createProvince.value = "";
  if (assetType) assetType.value = "";
  if (siteType) siteType.value = "";
  if (hasStorage) hasStorage.value = "";
  if (storagePower) storagePower.value = "";
  if (storageDuration) storageDuration.value = "";
  if (storageNote) storageNote.value = "";
  if (capacity) capacity.value = "";
  if (startYear) startYear.value = "";
  if (forecastYears) forecastYears.value = "";
  applyEnergyModeUi("annual_hours");
  syncCreateStorageFieldsUi();
  if (note) note.value = "";
  setCreateSaveMessage("当前为新建模板，填写后点击保存。", "info");
}

function createEmptyWorkspaceProject() {
  const now = new Date();
  const project = {
    id: makeId("proj"),
    ownerAccount: String(appState.auth.account || "").trim(),
    workspaceBucket: "new",
    name: resolveUniqueProjectName("新建项目"),
    province: "",
    assetType: "",
    siteType: "",
    hasStorage: false,
    storagePowerMw: null,
    storageDurationH: null,
    storageNote: "",
    capacityMw: null,
    startYear: null,
    forecastYears: null,
    energyMode: "annual_hours",
    note: "",
    createdAt: now.toISOString(),
    statuses: statusMapTemplate(),
    energyData: createEmptyEnergyDataState("annual_hours"),
    energyTemplateExports: {
      hourly_8760: "",
      annual_hours: "",
      typical_curve_8760: "",
      province_typical_curve: ""
    },
    historySpotImport: createEmptyHistorySpotImport(),
    priceRuns: [],
    activeRunId: null,
    activationLogs: [],
    spotMarketConfig: createDefaultSpotMarketConfig(),
    scenarios: [],
    activeScenarioId: null,
    resultsByScenario: {}
  };
  const baselineScenario = {
    id: makeId("scn"),
    name: "基准场景",
    isBaseline: true,
    locked: false,
    config: defaultScenarioConfig({
      province: "",
      siteType: "onshore",
      startYear: Math.max(2026, now.getFullYear()),
      forecastYears: 30
    }),
    updatedAt: now.toISOString()
  };
  project.scenarios.push(baselineScenario);
  project.activeScenarioId = baselineScenario.id;
  appState.projects.unshift(project);
  createFormSyncedProjectId = null;
  appState.activeProjectId = project.id;
  syncProjectProvinceScopedState(project, { force: true });
  return project;
}

function syncCreateProjectFormWithActiveProject() {
  if (!refs.createProjectForm) return;
  const project = getActiveProject();
  if (!project) {
    if (createFormSyncedProjectId !== null) {
      resetCreateProjectFormForNew();
    }
    return;
  }
  if (createFormSyncedProjectId === project.id) return;
  const projectName = document.querySelector("#create-project-name");
  const assetType = document.querySelector("#create-asset-type");
  const siteType = document.querySelector("#create-site-type");
  const hasStorage = document.querySelector("#create-has-storage");
  const storagePower = refs.createStoragePowerMw;
  const storageDuration = refs.createStorageDurationH;
  const storageNote = refs.createStorageNote;
  const capacity = document.querySelector("#create-capacity-mw");
  const startYear = document.querySelector("#create-start-year");
  const forecastYears = document.querySelector("#create-forecast-years");
  const note = document.querySelector("#create-note");
  if (projectName) projectName.value = project.name || "";
  if (refs.createProvince) refs.createProvince.value = PROVINCE_KEY_SET.has(project.province) ? project.province : "";
  if (assetType) assetType.value = ASSET_TYPE_SET.has(project.assetType) ? project.assetType : "";
  if (siteType) siteType.value = SITE_TYPE_SET.has(project.siteType) ? project.siteType : "";
  const hasStorageChosen = typeof project.hasStorage === "boolean" && (
    isProjectCreateCompleted(project)
    || PROVINCE_KEY_SET.has(project.province)
    || ASSET_TYPE_SET.has(project.assetType)
    || SITE_TYPE_SET.has(project.siteType)
    || Number.isFinite(project.capacityMw)
    || Number.isFinite(project.startYear)
    || Number.isFinite(project.forecastYears)
    || Number.isFinite(project.storagePowerMw)
    || Number.isFinite(project.storageDurationH)
    || Boolean(String(project.storageNote || "").trim())
  );
  if (hasStorage) hasStorage.value = hasStorageChosen
    ? (project.hasStorage ? "yes" : "no")
    : "";
  if (storagePower) storagePower.value = Number.isFinite(project.storagePowerMw) && project.storagePowerMw > 0 ? String(project.storagePowerMw) : "";
  if (storageDuration) storageDuration.value = Number.isFinite(project.storageDurationH) && project.storageDurationH > 0 ? String(project.storageDurationH) : "";
  if (storageNote) storageNote.value = project.storageNote || "";
  if (capacity) capacity.value = Number.isFinite(project.capacityMw) && project.capacityMw > 0 ? String(project.capacityMw) : "";
  if (startYear) startYear.value = Number.isFinite(project.startYear) ? String(project.startYear) : "";
  if (forecastYears) forecastYears.value = Number.isFinite(project.forecastYears) ? String(project.forecastYears) : "";
  if (note) note.value = project.note || "";
  const mode = project.energyData?.mode || project.energyMode || "hourly_8760";
  applyEnergyModeUi(mode);
  syncCreateStorageFieldsUi();
  setCreateSaveMessage(`正在编辑当前项目：${project.name}（保存后更新此项目）`, "info");
  createFormSyncedProjectId = project.id;
}

function renderCreateWorkspaceState() {
  if (!refs.createToEnergyButton) return;
  const project = getActiveProject();
  const ready = Boolean(project) && isProjectCreateCompleted(project);
  refs.createToEnergyButton.disabled = !ready;
  if (ready) {
    refs.createToEnergyButton.removeAttribute("title");
  } else {
    refs.createToEnergyButton.title = "请先保存并完成项目基础信息。";
  }
}

function setCreateSaveMessage(text, tone = "info") {
  if (!refs.createSaveMessage) return;
  refs.createSaveMessage.textContent = text;
  if (tone === "success") {
    refs.createSaveMessage.style.borderColor = "#8fb48d";
    refs.createSaveMessage.style.background = "#f1fbf1";
    return;
  }
  if (tone === "warn") {
    refs.createSaveMessage.style.borderColor = "#d6bb90";
    refs.createSaveMessage.style.background = "#fff8ed";
    return;
  }
  refs.createSaveMessage.style.borderColor = "#97b5d8";
  refs.createSaveMessage.style.background = "#f6faff";
}

function initBatchParamSelect() {
  refs.batchParamKey.innerHTML = Object.entries(BATCH_PARAM_SPECS).map(([key, spec]) => `
    <option value="${key}">${spec.label}</option>
  `).join("");
  refs.batchParamKey.value = "marketOpFee";
}

function defaultScenarioConfig(project) {
  return scenarioModel.defaultScenarioConfig(project, {
    provinceDefaults: getProvinceDefaults(project?.province),
    currentYear: new Date().getFullYear()
  });
}

function resolveUniqueProjectName(baseName) {
  const normalized = baseName || "新建项目";
  const scopeProjects = appState.auth.loggedIn ? getProjectsForCurrentAccount() : appState.projects;
  if (!scopeProjects.some((project) => project.name === normalized)) {
    return normalized;
  }
  let suffix = 2;
  let candidate = `${normalized}-${suffix}`;
  while (scopeProjects.some((project) => project.name === candidate)) {
    suffix += 1;
    candidate = `${normalized}-${suffix}`;
  }
  return candidate;
}

function getStorageConfigText(project) {
  if (!project?.hasStorage) return "无配储";
  const powerReady = Number.isFinite(project.storagePowerMw) && project.storagePowerMw > 0;
  const durationReady = Number.isFinite(project.storageDurationH) && project.storageDurationH > 0;
  if (powerReady && durationReady) {
    return `配储（${project.storagePowerMw}MW / ${project.storageDurationH}h）`;
  }
  return "配储";
}

function createProjectFromForm(options = {}) {
  const {
    targetPage = "create-page",
    appendToBottom = false,
    autoUniqueName = false,
    workspaceBucket = "history",
    forceCreate = false
  } = options;
  const resolvedWorkspaceBucket = PROJECT_WORKSPACE_BUCKET_SET.has(workspaceBucket) ? workspaceBucket : "history";
  const existingProject = forceCreate ? null : getActiveProject();
  let name = document.querySelector("#create-project-name").value.trim();
  const province = refs.createProvince.value;
  const assetType = document.querySelector("#create-asset-type").value;
  const siteType = document.querySelector("#create-site-type").value;
  const hasStorage = document.querySelector("#create-has-storage").value === "yes";
  const storagePowerRaw = String(refs.createStoragePowerMw?.value || "").trim();
  const storageDurationRaw = String(refs.createStorageDurationH?.value || "").trim();
  const storageNoteRaw = String(refs.createStorageNote?.value || "").trim();
  const capacityRaw = document.querySelector("#create-capacity-mw").value.trim();
  const startYearRaw = document.querySelector("#create-start-year").value.trim();
  const forecastYearsRaw = document.querySelector("#create-forecast-years").value.trim();
  const storagePowerInput = Number(storagePowerRaw);
  const storageDurationInput = Number(storageDurationRaw);
  const capacityInput = Number(capacityRaw);
  const startYearInput = Number(startYearRaw);
  const forecastYearsInput = Number(forecastYearsRaw);
  const currentYear = new Date().getFullYear();
  const storagePowerMw = hasStorage && Number.isFinite(storagePowerInput) && storagePowerInput > 0 ? storagePowerInput : null;
  const storageDurationH = hasStorage && Number.isFinite(storageDurationInput) && storageDurationInput > 0 ? storageDurationInput : null;
  const storageNote = hasStorage ? storageNoteRaw : "";
  const capacityMw = Number.isFinite(capacityInput) && capacityInput > 0 ? capacityInput : 0;
  const startYear = Number.isFinite(startYearInput) && startYearInput >= 2026 ? Math.floor(startYearInput) : currentYear;
  const forecastYears = clamp(
    Number.isFinite(forecastYearsInput) && forecastYearsInput > 0 ? Math.floor(forecastYearsInput) : 30,
    1,
    30
  );
  const defaultEnergyMode = normalizeEnergyMode(existingProject?.energyData?.mode || existingProject?.energyMode || "annual_hours");
  const energyMode = defaultEnergyMode;
  const note = document.querySelector("#create-note").value.trim();

  if (!name && autoUniqueName) {
    name = "新建项目";
  }
  if (!name) {
    setTopMeta("项目名称不能为空");
    setCreateSaveMessage("保存失败：请先填写项目名称。", "warn");
    return null;
  }
  if (!forceCreate) {
    if (!PROVINCE_KEY_SET.has(province)) {
      setTopMeta("请选择省份。");
      setCreateSaveMessage("保存失败：请选择省份。", "warn");
      return null;
    }
    if (!ASSET_TYPE_SET.has(assetType)) {
      setTopMeta("请选择风/光类型。");
      setCreateSaveMessage("保存失败：请选择风/光类型。", "warn");
      return null;
    }
    if (!SITE_TYPE_SET.has(siteType)) {
      setTopMeta("请选择陆/海类型。");
      setCreateSaveMessage("保存失败：请选择陆/海类型。", "warn");
      return null;
    }
    if (!["yes", "no"].includes(document.querySelector("#create-has-storage").value)) {
      setTopMeta("请选择是否配建储能。");
      setCreateSaveMessage("保存失败：请选择是否配建储能。", "warn");
      return null;
    }
    if (hasStorage && (!Number.isFinite(storagePowerInput) || storagePowerInput <= 0)) {
      setTopMeta("请填写有效的储能功率（MW）。");
      setCreateSaveMessage("保存失败：储能功率未填写或格式无效。", "warn");
      return null;
    }
    if (hasStorage && (!Number.isFinite(storageDurationInput) || storageDurationInput <= 0)) {
      setTopMeta("请填写有效的储能时长（h）。");
      setCreateSaveMessage("保存失败：储能时长未填写或格式无效。", "warn");
      return null;
    }
    if (!Number.isFinite(capacityInput) || capacityInput <= 0) {
      setTopMeta("请填写有效的装机容量（MW）。");
      setCreateSaveMessage("保存失败：装机容量未填写或格式无效。", "warn");
      return null;
    }
    if (!Number.isFinite(startYearInput) || startYearInput < 2026) {
      setTopMeta("开始年份需为2026及以后。");
      setCreateSaveMessage("保存失败：请填写有效的开始年份（>=2026）。", "warn");
      return null;
    }
    if (!Number.isFinite(forecastYearsInput) || forecastYearsInput < 1) {
      setTopMeta("预测周期需为1-30年。");
      setCreateSaveMessage("保存失败：请填写有效的预测周期（1-30年）。", "warn");
      return null;
    }
  }
  if (!existingProject && autoUniqueName) {
    name = resolveUniqueProjectName(name);
  }

  if (existingProject) {
    const project = existingProject;
    const oldProvince = project.province;
    const baseChanged = project.province !== province
      || project.assetType !== assetType
      || project.siteType !== siteType
      || project.hasStorage !== hasStorage
      || project.storagePowerMw !== storagePowerMw
      || project.storageDurationH !== storageDurationH
      || project.storageNote !== storageNote
      || project.capacityMw !== capacityMw
      || project.startYear !== startYear
      || project.forecastYears !== forecastYears;

    project.name = name;
    project.province = province;
    project.assetType = assetType;
    project.siteType = siteType;
    project.hasStorage = hasStorage;
    project.storagePowerMw = storagePowerMw;
    project.storageDurationH = storageDurationH;
    project.storageNote = storageNote;
    project.capacityMw = capacityMw;
    project.startYear = startYear;
    project.forecastYears = forecastYears;
    project.energyMode = energyMode;
    project.note = note;
    project.statuses["create-page"] = isProjectCreateCompleted(project) ? "completed" : "in_progress";
    const provinceDefaultsAutoSynced = syncProjectProvinceDefaultsToBaseline(project, {
      force: shouldAutoSyncProvinceDefaults(project)
    });
    syncProjectProvinceScopedState(project, { force: true });

    if (baseChanged) {
      project.energyData = createEmptyEnergyDataState(energyMode);
      project.historySpotImport = createEmptyHistorySpotImport();
      clearHistoryAnalysisCacheForProject(project.id);
      const exports = ensureProjectEnergyTemplateExports(project);
      exports.hourly_8760 = "";
      exports.annual_hours = "";
      exports.typical_curve_8760 = "";
      exports.province_typical_curve = "";
      project.statuses["energy-page"] = "in_progress";
      project.statuses["history-page"] = "not_started";
      markDownstreamStale(project, "energy-page");
      setTopMeta("当前项目已更新，请在步骤2重新导入电量。");
      if (provinceDefaultsAutoSynced) {
        setCreateSaveMessage(`已更新当前项目：${project.name}。基础参数变化，请重新导入电量；${getProvinceName(project.province)}默认参数已同步到基准场景。`, "warn");
      } else if (oldProvince !== province) {
        setCreateSaveMessage(`已更新当前项目：${project.name}。基础参数变化，请重新导入电量，并在全口径收入配置页复核${getProvinceName(project.province)}默认参数。`, "warn");
      } else {
        setCreateSaveMessage(`已更新当前项目：${project.name}。基础参数变化，请重新导入电量。`, "warn");
      }
    } else {
      if (!project.energyData || typeof project.energyData !== "object") {
        project.energyData = createEmptyEnergyDataState(energyMode);
      } else {
        ensureProjectEnergyDataState(project).mode = energyMode;
      }
      if (project.statuses["energy-page"] === "not_started") {
        project.statuses["energy-page"] = "in_progress";
      }
      setTopMeta("当前项目已保存。");
      if (provinceDefaultsAutoSynced) {
        setCreateSaveMessage(`已更新当前项目：${project.name}。${getProvinceName(project.province)}默认参数已同步到基准场景。`, "success");
      } else {
        setCreateSaveMessage(`已更新当前项目：${project.name}。`, "success");
      }
    }

    ensureProjectEnergyTemplateExports(project);
    const movedToHistory = moveProjectToHistoryWorkspaceIfReady(project);
    createFormSyncedProjectId = project.id;
    appState.activeProjectId = project.id;
    applyEnergyModeUi(energyMode);
    if (movedToHistory) {
      setTopMeta("当前项目已完成基础信息校准，已转入历史项目工作区。");
      setCreateSaveMessage(`已更新当前项目：${project.name}。已转入历史项目工作区。`, "success");
    }
    setActivePage(targetPage);
    if (targetPage === "create-page") {
      scrollCreateWorkspaceToBottom();
    }
    return project;
  }

  const project = {
    id: makeId("proj"),
    ownerAccount: String(appState.auth.account || "").trim(),
    workspaceBucket: resolvedWorkspaceBucket,
    name,
    province,
    assetType,
    siteType,
    hasStorage,
    storagePowerMw,
    storageDurationH,
    storageNote,
    capacityMw,
    startYear,
    forecastYears,
    energyMode,
    note,
    createdAt: new Date().toISOString(),
    statuses: statusMapTemplate(),
    energyData: createEmptyEnergyDataState(energyMode),
    energyTemplateExports: {
      hourly_8760: "",
      annual_hours: "",
      typical_curve_8760: "",
      province_typical_curve: ""
    },
    historySpotImport: createEmptyHistorySpotImport(),
    priceRuns: [],
    activeRunId: null,
    activationLogs: [],
    spotMarketConfig: createDefaultSpotMarketConfig(),
    scenarios: [],
    activeScenarioId: null,
    resultsByScenario: {}
  };

  project.statuses["create-page"] = isProjectCreateCompleted(project) ? "completed" : "in_progress";
  project.statuses["energy-page"] = project.statuses["create-page"] === "completed" ? "in_progress" : "not_started";

  const baselineScenario = {
    id: makeId("scn"),
    name: "基准场景",
    isBaseline: true,
    locked: false,
    config: defaultScenarioConfig(project),
    updatedAt: new Date().toISOString()
  };
  project.scenarios.push(baselineScenario);
  project.activeScenarioId = baselineScenario.id;

  if (appendToBottom) {
    appState.projects.push(project);
  } else {
    appState.projects.unshift(project);
  }
  createFormSyncedProjectId = project.id;
  appState.activeProjectId = project.id;
  syncProjectProvinceScopedState(project, { force: true });
  applyEnergyModeUi(energyMode);
  moveProjectToHistoryWorkspaceIfReady(project);
  setCreateSaveMessage(`已创建新项目：${project.name}。`, "success");
  setActivePage(targetPage);
  if (targetPage === "create-page") {
    scrollCreateWorkspaceToBottom();
  }
  return project;
}

function normalizeCsvHeaderToken(value) {
  return csvUtils.normalizeCsvHeaderToken(value);
}

function normalizeCsvHeaderRow(row) {
  return csvUtils.normalizeCsvHeaderRow(row);
}

function normalizeEnergyMode(mode) {
  return projectModel.normalizeEnergyMode(mode);
}

function ensureProjectEnergyTemplateExports(project) {
  if (!project || !isPlainObject(project)) {
    return { hourly_8760: "", annual_hours: "", typical_curve_8760: "", province_typical_curve: "" };
  }
  const raw = isPlainObject(project.energyTemplateExports) ? project.energyTemplateExports : {};
  project.energyTemplateExports = {
    hourly_8760: typeof raw.hourly_8760 === "string" ? raw.hourly_8760 : "",
    annual_hours: typeof raw.annual_hours === "string" ? raw.annual_hours : "",
    typical_curve_8760: typeof raw.typical_curve_8760 === "string" ? raw.typical_curve_8760 : "",
    province_typical_curve: typeof raw.province_typical_curve === "string" ? raw.province_typical_curve : ""
  };
  return project.energyTemplateExports;
}

function ensureProjectHistorySpotImport(project) {
  if (!project || !isPlainObject(project)) return createEmptyHistorySpotImport();
  project.historySpotImport = sanitizeHistorySpotImport(project.historySpotImport);
  return project.historySpotImport;
}

function hasImportedHistoryDataset(project) {
  const state = ensureProjectHistorySpotImport(project);
  return state.sourceType === "csv" && isHistoryDatasetUsable(state.dataset);
}

function clearHistoryAnalysisCacheForProject(projectId) {
  const prefix = `${String(projectId || "")}|`;
  if (!prefix) return;
  for (const cacheKey of historyAnalysisCache.keys()) {
    if (cacheKey.startsWith(prefix)) {
      historyAnalysisCache.delete(cacheKey);
    }
  }
}

function getEnergyModeMeta(mode) {
  return energyDataRules.getEnergyModeMeta(mode);
}

function detectEnergyModeByHeader(headerRow) {
  return energyDataRules.detectEnergyModeByHeader(headerRow);
}

function applyEnergyModeUi(mode) {
  normalizeEnergyMode(mode);
}

function setEnergyImportMessage(text, tone = "info", options = {}) {
  const { toast = true } = options;
  if (toast) {
    setTopMeta(text, tone);
  }
  if (!refs.energyImportMessage) return;
  refs.energyImportMessage.textContent = text;
  refs.energyImportMessage.dataset.tone = tone;
}

function buildEnergyTemplateFilename(project, mode) {
  const safeProjectName = String(project?.name || "项目").replace(/[\\/:*?"<>|]/g, "_");
  const provinceName = getProvinceName(project?.province || "") || "省份";
  const safeProvinceName = String(provinceName).replace(/[\\/:*?"<>|]/g, "_");
  const startYear = Number.isInteger(project?.startYear) ? project.startYear : "-";
  const endYear = Number.isInteger(project?.startYear) && Number.isInteger(project?.forecastYears)
    ? project.startYear + project.forecastYears - 1
    : "-";
  const modeTagMap = {
    annual_hours: "逐年总量模板",
    typical_curve_8760: "典型年8760模板",
    province_typical_curve: "省份典型曲线模板",
    hourly_8760: "完整8760小时曲线模板"
  };
  const modeTag = modeTagMap[mode] || "上网电量模板";
  return `${safeProjectName}-${safeProvinceName}-${startYear}-${endYear}-${modeTag}.csv`;
}

function moveProjectToHistoryWorkspaceIfReady(project) {
  if (!project || !isNewWorkspaceProject(project)) return false;
  if (!isProjectCreateCompleted(project)) return false;
  project.workspaceBucket = "history";
  return true;
}

function parseCsvRows(text) {
  return csvUtils.parseCsvRows(text);
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file, "utf-8");
  });
}

async function readSpreadsheetToCsv(file) {
  const filename = file.name.toLowerCase();
  if (filename.endsWith(".csv") || filename.endsWith(".txt")) {
    const text = await readTextFile(file);
    return { text, source: "text" };
  }
  if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
    if (typeof window === "undefined" || typeof window.XLSX === "undefined") {
      throw new Error("当前环境未加载XLSX解析器。请检查网络后重试，或先导出CSV。");
    }
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const firstSheetName = workbook.SheetNames?.[0];
    if (!firstSheetName) {
      throw new Error("Excel文件不包含可读取工作表。");
    }
    const worksheet = workbook.Sheets[firstSheetName];
    const csv = window.XLSX.utils.sheet_to_csv(worksheet, { FS: ",", RS: "\n", blankrows: false });
    return { text: csv, source: `excel:${firstSheetName}` };
  }
  throw new Error("当前仅支持CSV/TXT/XLSX/XLS文件。");
}

function monthSerial(ym) {
  return revenueRules.monthSerial(ym);
}

function mechanismActiveMonthsForYear(year, startYm, endYm) {
  return revenueRules.mechanismActiveMonthsForYear(year, startYm, endYm);
}

function pseudoNoise(index, seed) {
  return energyProfiles.pseudoNoise(index, seed);
}

function generationWeight(assetType, hourIndex, seed) {
  return energyProfiles.generationWeight(assetType, hourIndex, seed);
}

function generateHourlyHoursFromAnnual(annualHours, assetType, seed) {
  return energyProfiles.generateHourlyHoursFromAnnual(annualHours, assetType, seed);
}

function getProvinceTypicalCurveRecordKey(project) {
  if (!project?.province || !project?.assetType) return "";
  const siteType = SITE_TYPE_SET.has(project.siteType) ? project.siteType : "onshore";
  return `${project.province}:${project.assetType}:${siteType}`;
}

function createProvinceTypicalCurveMockRecord(project) {
  const benchmark = PROVINCE_BENCHMARKS?.[project?.province] || {};
  const provinceSeed = Number(benchmark.historyPrice || 360);
  const siteType = SITE_TYPE_SET.has(project?.siteType) ? project.siteType : "onshore";
  const assetType = project?.assetType;
  const coastalSet = new Set(["liaoning", "tianjin", "shanghai", "jiangsu", "zhejiang", "fujian", "shandong", "guangdong", "guangxi", "hainan"]);
  const northernSet = new Set(["heilongjiang", "jilin", "liaoning", "inner_mongolia", "gansu", "ningxia", "xinjiang", "qinghai"]);
  const raw = [];

  for (let hourIndex = 0; hourIndex < 8760; hourIndex += 1) {
    const dayOfYear = Math.floor(hourIndex / 24) + 1;
    const hour = hourIndex % 24;
    const { month } = dayOfYearToMonthDay(dayOfYear);
    let value = generationWeight(assetType, hourIndex, provinceSeed + 17);

    if (assetType === "wind") {
      const winterBoost = (month === 12 || month <= 2) ? (northernSet.has(project?.province) ? 1.18 : 1.06) : 1;
      const nightBoost = hour <= 6 || hour >= 19 ? (siteType === "offshore" ? 1.14 : 1.08) : 0.97;
      const coastalBoost = siteType === "offshore" || coastalSet.has(project?.province) ? 1.05 : 0.99;
      value *= winterBoost * nightBoost * coastalBoost;
    } else if (assetType === "photovoltaic") {
      const summerBoost = month >= 4 && month <= 9 ? 1.12 : 0.88;
      const noonBoost = hour >= 10 && hour <= 15 ? 1.14 : (hour >= 7 && hour <= 17 ? 0.98 : 1);
      const cloudFactor = coastalSet.has(project?.province) ? 0.97 : 1.02;
      const offshoreBoost = siteType === "offshore" ? 1.03 : 1;
      value *= summerBoost * noonBoost * cloudFactor * offshoreBoost;
    }

    value *= 0.94 + (provinceSeed % 23) / 100;
    raw.push(value);
  }

  return {
    key: getProvinceTypicalCurveRecordKey(project),
    profile: normalizeTypicalCurveProfile(raw),
    sourceLabel: `模拟库：${describeProvinceTypicalCurve(project)} 典型8760曲线`
  };
}

function getProvinceTypicalCurveRecord(project) {
  const cacheKey = getProvinceTypicalCurveRecordKey(project);
  if (!cacheKey) return null;
  if (!provinceTypicalCurveDbCache.has(cacheKey)) {
    provinceTypicalCurveDbCache.set(cacheKey, createProvinceTypicalCurveMockRecord(project));
  }
  return provinceTypicalCurveDbCache.get(cacheKey) || null;
}

function buildProvinceTypicalCurveProfile(project) {
  return getProvinceTypicalCurveRecord(project)?.profile || [];
}

function deriveEnergyModeFromInputs(energyData) {
  return energyDataRules.deriveEnergyModeFromInputs(energyData);
}

function rebuildProjectEnergyData(project) {
  energyDataRules.rebuildProjectEnergyData(project);
}

function validateAndBuildEnergyData(project, csvText, expectedMode = null) {
  return energyDataRules.validateAndBuildEnergyData(project, csvText, expectedMode);
}

function importEnergyDataFromText(mode, csvText, sourceLabel = "") {
  const project = getActiveProject();
  const result = energyImportFlow.importEnergyDataFromText({
    project,
    mode,
    csvText,
    sourceLabel,
    appState,
    services: {
      isProjectCreateCompleted,
      normalizeEnergyMode,
      validateAndBuildEnergyData,
      alignDefaultForecastYearsToAnnualTemplate,
      ensureProjectEnergyTemplateExports,
      ensureProjectEnergyDataState,
      hasEnergyTypicalCurve,
      rebuildProjectEnergyData,
      countCompleteEnergyYears,
      markDownstreamStale,
      getAnnualInputYearCount,
      listMissingEnergyYears
    }
  });
  setEnergyImportMessage(result.message, result.level);
  if (result.ok) renderAll();
  return result.ok;
}

function exportEnergyTemplate(mode = "hourly_8760") {
  const project = getActiveProject();
  if (!project) {
    setEnergyImportMessage("请先创建或进入项目，再导出模板。", "error");
    return;
  }
  if (!isProjectCreateCompleted(project)) {
    setEnergyImportMessage("请先完成步骤1基础信息保存，再导出模板。", "warn");
    return;
  }
  const normalizedMode = normalizeEnergyMode(mode);
  const rows = energyDataRules.buildEnergyTemplateRows(project, normalizedMode);

  downloadCsv(buildEnergyTemplateFilename(project, normalizedMode), rows);
  const exports = ensureProjectEnergyTemplateExports(project);
  exports[normalizedMode] = new Date().toISOString();
  setEnergyImportMessage(
    `模板已导出（${getEnergyModeMeta(normalizedMode).label}）：${getEnergyModeMeta(normalizedMode).header}（${project.startYear}-${project.startYear + project.forecastYears - 1}）`,
    "success"
  );
}

async function importEnergyFromFile(mode, inputElement) {
  const file = inputElement?.files?.[0];
  if (!file) {
    setEnergyImportMessage("请先选择CSV或Excel文件。", "error");
    return false;
  }

  try {
    const output = await readSpreadsheetToCsv(file);
    const text = output.text.trim();
    if (!text) {
      setEnergyImportMessage("文件内容为空，请检查模板后重试。", "error");
      return false;
    }
    const sourceLabel = output.source.startsWith("excel:") ? output.source.slice(6) : file.name;
    const imported = importEnergyDataFromText(mode, text.trim(), sourceLabel);
    if (imported && inputElement) {
      inputElement.value = "";
    }
    return imported;
  } catch (error) {
    setEnergyImportMessage(error?.message || "文件读取失败，请检查格式后重试。", "error");
    return false;
  }
}

function downloadEnergySampleFile(mode = "annual_hours") {
  const project = getActiveProject();
  if (!project) return;
  const normalizedMode = normalizeEnergyMode(mode);
  const rows = [];
  if (normalizedMode === "annual_hours") {
    rows.push(["year", "annual_hours_h"]);
    for (let i = 0; i < project.forecastYears; i += 1) {
      const year = project.startYear + i;
      const annual = (project.assetType === "wind" ? 2400 : 1300) * Math.pow(0.997, i);
      rows.push([year, annual.toFixed(2)]);
    }
    downloadCsv(buildEnergyTemplateFilename(project, "annual_hours").replace(".csv", "-示例.csv"), rows);
    return;
  }
  if (normalizedMode === "typical_curve_8760") {
    rows.push(["hour_index", "equivalent_hours_h"]);
    const values = generateHourlyHoursFromAnnual(project.assetType === "wind" ? 2400 : 1300, project.assetType, project.startYear);
    for (let hour = 1; hour <= 8760; hour += 1) {
      rows.push([hour, values[hour - 1].toFixed(6)]);
    }
    downloadCsv(buildEnergyTemplateFilename(project, "typical_curve_8760").replace(".csv", "-示例.csv"), rows);
    return;
  }
  const year = project.startYear;
  rows.push(["year", "hour_index", "equivalent_hours_h"]);
  const values = generateHourlyHoursFromAnnual(project.assetType === "wind" ? 2400 : 1300, project.assetType, year);
  for (let hour = 1; hour <= 8760; hour += 1) {
    rows.push([year, hour, values[hour - 1].toFixed(6)]);
  }
  downloadCsv(buildEnergyTemplateFilename(project, "hourly_8760").replace(".csv", "-示例.csv"), rows);
}

function applyProvinceTypicalCurve() {
  const project = getActiveProject();
  if (!project) {
    setEnergyImportMessage("请先进入项目。", "error");
    return;
  }
  if (!isProjectCreateCompleted(project)) {
    setEnergyImportMessage("请先完成步骤1基础信息保存，再调用所选省份典型曲线。", "warn");
    return;
  }
  const annualCount = getAnnualInputYearCount(project);
  if (annualCount !== project.forecastYears) {
    setEnergyImportMessage(`请先完成逐年总量模板导入。当前仅录入 ${annualCount}/${project.forecastYears} 年。`, "warn");
    return;
  }
  const energyData = ensureProjectEnergyDataState(project);
  const curveRecord = getProvinceTypicalCurveRecord(project);
  if (!curveRecord?.profile?.length) {
    setEnergyImportMessage("当前项目未匹配到可调用的省份典型曲线，请检查省份、风/光类型和陆/海类型。", "error");
    return;
  }
  energyData.typicalCurveProfile = curveRecord.profile;
  energyData.typicalCurveSource = "province_typical_curve";
  appState.energyStep2Choice = "province";
  rebuildProjectEnergyData(project);
  const exports = ensureProjectEnergyTemplateExports(project);
  exports.province_typical_curve = new Date().toISOString();
  const completeYears = countCompleteEnergyYears(project);
  project.statuses["energy-page"] = completeYears === project.forecastYears ? "completed" : "in_progress";
  if (isProjectCreateCompleted(project) && project.statuses["history-page"] === "not_started") {
    project.statuses["history-page"] = "in_progress";
  }
  markDownstreamStale(project, "energy-page");
  setEnergyImportMessage(
    `已调用 ${curveRecord.sourceLabel}，已生成 ${completeYears}/${project.forecastYears} 年上网电量。`,
    completeYears === project.forecastYears ? "success" : "warn"
  );
  renderAll();
}

function defaultAnnualEquivalentHours(project, offset = 0) {
  const assetType = ASSET_TYPE_SET.has(project?.assetType) ? project.assetType : "wind";
  const siteType = SITE_TYPE_SET.has(project?.siteType) ? project.siteType : "onshore";
  let base = assetType === "photovoltaic" ? 1350 : 2450;
  if (assetType === "wind" && siteType === "offshore") base = 3300;
  if (assetType === "photovoltaic" && siteType === "offshore") base = 1450;
  const provinceShift = ((getPriceBaseForProvince(project?.province) || 360) % 37) - 18;
  const annualDrift = Math.pow(0.997, Math.max(0, offset));
  return Number(Math.max(800, base + provinceShift * 4).toFixed(2)) * annualDrift;
}

function ensureAnnualEnergyInputsForCalculation(project) {
  const energyData = ensureProjectEnergyDataState(project);
  let changed = false;
  for (let i = 0; i < project.forecastYears; i += 1) {
    const year = project.startYear + i;
    const value = Number(energyData.annualInputByYear?.[year]);
    if (Number.isFinite(value) && value > 0) continue;
    energyData.annualInputByYear[year] = Number(defaultAnnualEquivalentHours(project, i).toFixed(2));
    changed = true;
  }
  return changed;
}

function ensureHourlyEnergyForCalculation(project) {
  if (!project || !Number.isInteger(project.startYear) || !Number.isInteger(project.forecastYears) || project.forecastYears < 1) {
    return { changed: false, completed: 0, total: 0, defaultAnnualFilled: false };
  }
  const before = countCompleteEnergyYears(project);
  const total = project.forecastYears;
  if (before === total) {
    return { changed: false, completed: before, total, defaultAnnualFilled: false };
  }

  const defaultAnnualFilled = ensureAnnualEnergyInputsForCalculation(project);

  const energyData = ensureProjectEnergyDataState(project);
  if (!hasEnergyTypicalCurve(project)) {
    const curveRecord = getProvinceTypicalCurveRecord(project);
    if (!curveRecord?.profile?.length) {
      return { changed: defaultAnnualFilled, completed: before, total, defaultAnnualFilled };
    }
    energyData.typicalCurveProfile = curveRecord.profile;
    energyData.typicalCurveSource = "province_typical_curve";
    appState.energyStep2Choice = "province";
  }

  rebuildProjectEnergyData(project);
  const completed = countCompleteEnergyYears(project);
  project.statuses["energy-page"] = completed === total ? "completed" : "in_progress";
  return { changed: completed !== before || defaultAnnualFilled, completed, total, defaultAnnualFilled };
}

function getHourlyEnergyForCalculation(project, year, yearIndex) {
  const energyData = ensureProjectEnergyDataState(project);
  const existing = energyData.hourlyByYear?.[year];
  if (Array.isArray(existing) && existing.length === 8760) {
    return existing;
  }

  const annualFromInput = Number(energyData.annualInputByYear?.[year]);
  const annualFromSummary = Number(energyData.annualSummary?.[year]?.annualHours);
  const annualHours = Number.isFinite(annualFromInput) && annualFromInput > 0
    ? annualFromInput
    : (Number.isFinite(annualFromSummary) && annualFromSummary > 0
      ? annualFromSummary
      : defaultAnnualEquivalentHours(project, yearIndex - 1));

  let hourlyValues = [];
  const profile = normalizeTypicalCurveProfile(energyData.typicalCurveProfile);
  if (profile.length === 8760) {
    hourlyValues = profile.map((weight) => annualHours * weight);
  } else {
    hourlyValues = generateHourlyHoursFromAnnual(annualHours, project.assetType, project.startYear + yearIndex);
  }

  if (hourlyValues.length !== 8760) return [];
  energyData.annualInputByYear[year] = Number(annualHours.toFixed(2));
  energyData.hourlyByYear[year] = hourlyValues;
  energyData.annualSummary[year] = {
    annualHours,
    energyMwh: annualHours * project.capacityMw,
    status: "完整"
  };
  project.energyMode = energyData.mode;
  return hourlyValues;
}

function getPriceBaseForProvince(province) {
  return priceForecast.getPriceBaseForProvince(province, PROVINCE_BENCHMARKS);
}

function priceShape(hourIndex, seed) {
  const day = Math.floor(hourIndex / 24);
  const hour = hourIndex % 24;
  const dayFactor = hour <= 6 ? 0.82 : hour <= 10 ? 1.02 : hour <= 16 ? 0.95 : hour <= 21 ? 1.18 : 0.97;
  const season = 1 + 0.08 * Math.sin(((day - 160) / 365) * 2 * Math.PI);
  const noise = 0.95 + 0.1 * pseudoNoise(hourIndex, seed + 13);
  return dayFactor * season * noise;
}

function buildForecastDayMeta(year) {
  return priceForecast.buildForecastDayMeta(year);
}

function hourlyPricesFromQuarterPrices(quarterPrices) {
  return priceForecast.hourlyPricesFromQuarterPrices(quarterPrices);
}

function forecastQuarterPrice(project, model, context) {
  return priceForecast.forecastQuarterPrice(project, model, context);
}

function buildForecastPriceSeries(project, model, seed, growth) {
  return priceForecast.buildForecastPriceSeries(project, model, seed, growth, {
    provinceBenchmarks: PROVINCE_BENCHMARKS
  });
}

function createForecastRunForModel(project, model, options) {
  const {
    algorithmVersion,
    featureVersion,
    dataSnapshotId,
    trainStart,
    trainEnd,
    seed,
    growth
  } = options;
  return priceForecast.createForecastRunForModel(project, model, {
    algorithmVersion,
    featureVersion,
    dataSnapshotId,
    trainStart,
    trainEnd,
    seed,
    growth,
    id: makeId("run"),
    createdAt: new Date().toISOString(),
    qualityGate: QUALITY_GATE,
    provinceBenchmarks: PROVINCE_BENCHMARKS
  });
}

function formatForecastGranularity(run) {
  if (run?.granularityMinutes === 15) {
    return `15分钟 / ${run.pointsPerYear || 35040}点/年`;
  }
  return "小时 / 8760点/年";
}

function countForecastPriceMissing(project, run) {
  return priceForecast.countForecastPriceMissing(project, run);
}

function evaluateRunQuality(project, run) {
  return priceForecast.evaluateRunQuality(project, run, QUALITY_GATE);
}

function canActivateRun(run) {
  return ["publishable", "publishable_warn", "publishable_forced"].includes(run.status);
}

function statusLabel(run) {
  const labels = {
    validated: "未过硬门槛",
    publishable: "可发布",
    publishable_warn: "可发布(软门槛预警)",
    publishable_forced: "强制发布"
  };
  return labels[run.status] || run.status;
}

function addActivationLog(project, fromRunId, toRunId, reason) {
  project.activationLogs.unshift({
    id: makeId("act"),
    fromRunId: fromRunId || "-",
    toRunId,
    reason: reason || "手动切换",
    changedAt: new Date().toISOString()
  });
}

function generateForecastRun() {
  const project = getActiveProject();
  if (!project) return;

  if (!Number.isInteger(project.startYear) || !Number.isInteger(project.forecastYears) || project.forecastYears < 1) {
    setTopMeta("请先保存项目测算起始年份和测算周期，再生成电价预测。");
    return;
  }

  const algorithmVersion = document.querySelector("#algo-version").value.trim() || "1.0.0";
  const featureVersion = document.querySelector("#feature-version").value.trim() || "1.0.0";
  const dataSnapshotId = document.querySelector("#data-snapshot-id").value.trim() || `snapshot-${new Date().toISOString().slice(0, 10)}`;
  const trainStartInput = Number(document.querySelector("#train-start").value);
  const trainEndInput = Number(document.querySelector("#train-end").value);
  const trainStart = Number.isFinite(trainStartInput) ? trainStartInput : Math.max(2010, project.startYear - 8);
  const trainEnd = Number.isFinite(trainEndInput) ? trainEndInput : Math.max(trainStart, project.startYear - 1);
  const seed = Number(document.querySelector("#algo-seed").value) || 2027;
  const growthInput = Number(document.querySelector("#algo-growth").value);
  const growth = Number.isFinite(growthInput) ? growthInput / 100 : 0;

  const generatedRuns = FORECAST_MODEL_DEFINITIONS.map((model) => createForecastRunForModel(project, model, {
    algorithmVersion,
    featureVersion,
    dataSnapshotId,
    trainStart,
    trainEnd,
    seed,
    growth
  }));
  project.priceRuns.unshift(...generatedRuns.slice().reverse());

  const preferredRun = generatedRuns.find((run) => run.algorithmFamily === "ensemble" && canActivateRun(run))
    || generatedRuns.find((run) => canActivateRun(run));
  if (preferredRun) {
    const old = project.activeRunId;
    project.activeRunId = preferredRun.id;
    addActivationLog(project, old, preferredRun.id, "三模型15分钟模拟完成，融合模型自动生效");
  }
  project.statuses["forecast-page"] = hasActiveActivatableRun(project) ? "completed" : "in_progress";
  if (project.statuses["scenario-page"] === "not_started") {
    project.statuses["scenario-page"] = "in_progress";
  }
  setTopMeta(`已生成 LSTM、XGBoost、Ensemble 三套 ${project.startYear}-${project.startYear + project.forecastYears - 1} 年15分钟现货电价模拟曲线。`);
  markDownstreamStale(project, "forecast-page");
  renderAll();
}

function setActiveRun(runId) {
  const project = getActiveProject();
  if (!project) return;
  const target = project.priceRuns.find((run) => run.id === runId);
  if (!target) return;
  if (!canActivateRun(target)) {
    setTopMeta("该版本未通过硬门槛，不能直接生效。");
    return;
  }
  if (project.activeRunId === target.id) return;
  const old = project.activeRunId;
  project.activeRunId = target.id;
  addActivationLog(project, old, target.id, "设置为生效版本");
  project.statuses["forecast-page"] = "completed";
  if (project.statuses["scenario-page"] === "not_started") {
    project.statuses["scenario-page"] = "in_progress";
  }
  markDownstreamStale(project, "forecast-page");
  renderAll();
}

function forceActivateRun(runId) {
  const project = getActiveProject();
  if (!project) return;
  const target = project.priceRuns.find((run) => run.id === runId);
  if (!target) return;
  const reason = typeof window !== "undefined" && typeof window.prompt === "function"
    ? window.prompt("请输入强制发布原因：", "初版阶段人工放行")
    : "初版阶段人工放行";
  if (reason === null) return;
  target.status = "publishable_forced";
  const old = project.activeRunId;
  project.activeRunId = target.id;
  addActivationLog(project, old, target.id, reason || "初版阶段人工放行");
  project.statuses["forecast-page"] = "completed";
  if (project.statuses["scenario-page"] === "not_started") {
    project.statuses["scenario-page"] = "in_progress";
  }
  markDownstreamStale(project, "forecast-page");
  renderAll();
}


function renderForecastRuns() {
  const project = getActiveProject();
  if (!project) {
    refs.forecastRunBody.innerHTML = "";
    refs.forecastActivationBody.innerHTML = "";
    refs.forecastGateMessage.textContent = "质量门槛：MAPE ≤ 15%，sMAPE ≤ 18%，且价格曲线完整覆盖测算周期。";
    return;
  }
  if (!project.priceRuns.length) {
    refs.forecastRunBody.innerHTML = `<tr><td colspan="12">还没有电价预测版本，请先生成。</td></tr>`;
    refs.forecastActivationBody.innerHTML = `<tr><td colspan="4">暂无激活日志。</td></tr>`;
    refs.forecastGateMessage.textContent = "质量门槛：MAPE ≤ 15%，sMAPE ≤ 18%，且价格曲线完整覆盖测算周期。";
    return;
  }
  const latest = project.priceRuns[0];
  refs.forecastGateMessage.textContent =
    `硬门槛：MAPE ≤ 15%，sMAPE ≤ 18%，缺失点=0。软门槛：MAE ≤ ${QUALITY_GATE.soft.mae}，RMSE ≤ ${QUALITY_GATE.soft.rmse}。最新运行 ${latest.id} 状态：${statusLabel(latest)}。`;

  refs.forecastRunBody.innerHTML = project.priceRuns.map((run) => `
    <tr>
      <td>${run.id}</td>
      <td>${run.algorithmLabel || run.algorithmName || run.algorithmFamily}</td>
      <td>${run.algorithmVersion}</td>
      <td>${run.featureVersion}</td>
      <td>${formatForecastGranularity(run)}</td>
      <td>${run.trainStart}-${run.trainEnd}</td>
      <td>${(run.mape * 100).toFixed(2)}%</td>
      <td>${(run.smape * 100).toFixed(2)}%</td>
      <td>${run.mae.toFixed(2)}</td>
      <td>${run.rmse.toFixed(2)}</td>
      <td>${statusLabel(run)}${project.activeRunId === run.id ? " / 生效中" : ""}</td>
      <td>
        ${canActivateRun(run)
          ? `<button class="ghost-button" data-active-run="${run.id}">设为生效</button>`
          : `<button class="ghost-button" data-force-run="${run.id}">强制发布</button>`
        }
      </td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-active-run]").forEach((button) => {
    button.addEventListener("click", () => setActiveRun(button.dataset.activeRun));
  });
  document.querySelectorAll("[data-force-run]").forEach((button) => {
    button.addEventListener("click", () => forceActivateRun(button.dataset.forceRun));
  });

  refs.forecastActivationBody.innerHTML = project.activationLogs.length
    ? project.activationLogs.map((log) => `
      <tr>
        <td>${new Date(log.changedAt).toLocaleString("zh-CN", { hour12: false })}</td>
        <td>${log.fromRunId}</td>
        <td>${log.toRunId}</td>
        <td>${escapeHtml(log.reason)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4">暂无激活日志。</td></tr>`;
}

function removeLegacyEnergySummaryTable() {
  if (typeof document === "undefined") return;
  const legacySummaryBody = document.querySelector("#energy-year-summary-body");
  if (!legacySummaryBody) return;
  const legacyWrap = legacySummaryBody.closest(".table-scroll");
  if (legacyWrap) {
    legacyWrap.remove();
    return;
  }
  const legacyTable = legacySummaryBody.closest("table");
  if (legacyTable) {
    legacyTable.remove();
  }
}

function renderEnergySummary() {
  removeLegacyEnergySummaryTable();
  const project = getActiveProject();
  if (!refs.energySummaryNote) return;
  if (!project) {
    refs.energySummaryNote.textContent = "请先在“我的项目”中进入一个项目，再查看结算电量配置摘要。";
    return;
  }
  if (!isProjectCreateCompleted(project)) {
    refs.energySummaryNote.textContent = "请先完成步骤1基础信息保存，再查看结算电量配置摘要。";
    return;
  }
  const energyState = getEnergyCompletionState(project);
  const { completeYears, totalYears, annualInputYears, hasTypicalCurve, energyData } = energyState;
  if (!totalYears) {
    refs.energySummaryNote.textContent = "当前预测周期未设定，暂无法生成结算电量配置摘要。";
    return;
  }
  if (!annualInputYears) {
    refs.energySummaryNote.textContent = "当前尚未导入逐年总量模板数据。请先完成步骤1逐年总量导入。";
    return;
  }
  if (!hasTypicalCurve) {
    refs.energySummaryNote.textContent =
      `已录入 ${annualInputYears}/${totalYears} 年逐年总量；第二步待完成，当前尚未选择典型曲线来源。` +
      "请上传典型年8760小时模板，或调用所选省份典型曲线。";
    return;
  }
  const annualRows = [];
  for (let i = 0; i < project.forecastYears; i += 1) {
    const year = project.startYear + i;
    const item = energyData.annualSummary?.[year];
    if (item?.status === "完整" && Array.isArray(energyData.hourlyByYear?.[year]) && energyData.hourlyByYear[year].length === 8760) {
      annualRows.push({
        year,
        annualHours: Number(item.annualHours) || 0,
        energyMwh: Number(item.energyMwh) || 0
      });
    }
  }
  if (!annualRows.length) {
    refs.energySummaryNote.textContent = "逐年总量与典型曲线已识别，但尚未生成完整年度曲线，请重新导入逐年总量或重新调用典型曲线。";
    return;
  }
  const sourceText = energyData.typicalCurveSource === "province_typical_curve"
    ? `来源：已调用 ${describeProvinceTypicalCurve(project)} 典型曲线`
    : "来源：已导入典型年8760小时模板";
  const hoursValues = annualRows.map((item) => item.annualHours);
  const energyValues = annualRows.map((item) => item.energyMwh);
  const missingYears = listMissingEnergyYears(project, 8);
  const missingText = missingYears.length ? `；待补年份：${missingYears.join("、")}` : "；预测周期内年份已全部覆盖";
  refs.energySummaryNote.textContent =
    `${sourceText}；已完成 ${completeYears}/${totalYears} 年电量导入；年度小时范围 ${Math.min(...hoursValues).toFixed(2)}-${Math.max(...hoursValues).toFixed(2)} h；` +
    `年度上网电量范围 ${Math.min(...energyValues).toFixed(2)}-${Math.max(...energyValues).toFixed(2)} MWh${missingText}。`;
}

function setEnergyTemplateStatus(element, status = {}) {
  if (!element) return;
  element.textContent = status.text || "";
  element.classList.remove("ready", "pending", "blocked");
  if (status.stateClass) {
    element.classList.add(status.stateClass);
  }
  if (status.title) {
    element.title = status.title;
  } else {
    element.removeAttribute("title");
  }
}

function setEnergyMetricValue(element, text) {
  if (element) element.textContent = text;
}

function setHistoryEntryButtonState(state = {}) {
  if (!refs.energyToHistoryButton) return;
  refs.energyToHistoryButton.disabled = !state.enabled;
  if (state.title) {
    refs.energyToHistoryButton.title = state.title;
  } else {
    refs.energyToHistoryButton.removeAttribute("title");
  }
}

function setEnergyControlDisabled(element, disabled) {
  if (element) element.disabled = disabled;
}

function setEnergyControlState(state = {}) {
  setEnergyControlDisabled(refs.exportEnergyAnnualTemplateButton, state.annualExport);
  setEnergyControlDisabled(refs.energyAnnualFileInput, state.annualFile);
  setEnergyControlDisabled(refs.importEnergyAnnualFileButton, state.annualImport);
  setEnergyControlDisabled(refs.exportEnergyTypicalTemplateButton, state.typicalExport);
  setEnergyControlDisabled(refs.energyTypicalFileInput, state.typicalFile);
  setEnergyControlDisabled(refs.importEnergyTypicalFileButton, state.typicalImport);
  setEnergyControlDisabled(refs.applyEnergyProvinceCurveButton, state.provinceApply);
}

function applyEnergyStep2ActionPresentation(actions = {}) {
  if (refs.exportEnergyTypicalTemplateButton) {
    refs.exportEnergyTypicalTemplateButton.textContent = actions.typicalExportText || "导出典型年8760模板";
  }
  if (refs.importEnergyTypicalFileButton) {
    refs.importEnergyTypicalFileButton.textContent = actions.typicalImportText || "读取文件并导入";
    setEnergyButtonVariant(refs.importEnergyTypicalFileButton, actions.typicalImportVariant || "primary");
  }
  if (refs.applyEnergyProvinceCurveButton) {
    refs.applyEnergyProvinceCurveButton.textContent = actions.provinceApplyText || "调用所选省份典型曲线";
    setEnergyButtonVariant(refs.applyEnergyProvinceCurveButton, actions.provinceApplyVariant || "ghost");
  }
  setEnergyPaneCurrentState(refs.energyStep2TypicalPane, refs.energyStep2TypicalPaneStatus, actions.typicalPaneMessage || "");
  setEnergyPaneCurrentState(refs.energyStep2ProvincePane, refs.energyStep2ProvincePaneStatus, actions.provincePaneMessage || "");
}

function applyEnergyWorkspaceModel(model, project) {
  applyEnergyStep2ActionPresentation(model.step2Actions);
  appState.energyStep2Choice = sanitizeEnergyStep2Choice(model.nextStep2Choice);
  renderEnergyStep2ChoiceState();
  renderEnergyStep2ChoiceSummary(project);
  applyEnergyModeUi(model.mode);
  if (model.resetMessageProjectId) {
    refs.energyImportMessage.removeAttribute("data-project-id");
  } else if (model.projectIdForMessage) {
    refs.energyImportMessage.dataset.projectId = model.projectIdForMessage;
  }
  if (refs.energyProjectContext) refs.energyProjectContext.textContent = model.projectContext;
  setEnergyTemplateStatus(refs.energyTemplateAnnualStatus, model.templateStatuses.annual);
  setEnergyTemplateStatus(refs.energyTemplateTypicalStatus, model.templateStatuses.typical);
  setEnergyTemplateStatus(refs.energyTemplateProvinceStatus, model.templateStatuses.province);
  setEnergyMetricValue(refs.energyPeriodLabel, model.metrics.period);
  setEnergyMetricValue(refs.energyModeLabel, model.metrics.mode);
  setEnergyMetricValue(refs.energyCompleteYearsLabel, model.metrics.completeYears);
  setEnergyMetricValue(refs.energyTotalMwhLabel, model.metrics.totalMwh);
  setHistoryEntryButtonState(model.historyButton);
  setEnergyControlState(model.controls);
  if (model.message) {
    setEnergyImportMessage(model.message.text, model.message.tone, { toast: false });
  }
}

function renderEnergyWorkspaceState() {
  if (!refs.energyImportMessage) return;
  const project = getActiveProject();
  const createReady = Boolean(project && isProjectCreateCompleted(project));
  const energyState = project ? getEnergyCompletionState(project) : {};
  const model = energyWorkspace.buildEnergyWorkspaceViewModel({
    project,
    createReady,
    energyState,
    exports: project ? ensureProjectEnergyTemplateExports(project) : {},
    currentMessage: refs.energyImportMessage.textContent || "",
    isProjectSwitched: Boolean(project && refs.energyImportMessage.dataset.projectId !== project.id),
    activeStep2Choice: appState.energyStep2Choice,
    missingYears: project ? listMissingEnergyYears(project, 6) : [],
    labels: {
      periodText: project && createReady ? getForecastPeriodDisplayRange(project) : "待保存",
      provinceName: project ? getProvinceName(project.province) : "",
      assetTypeLabel: project ? getAssetTypeLabel(project.assetType) : "",
      siteTypeLabel: project ? getSiteTypeLabel(project.siteType) : "",
      storageText: project ? getStorageConfigText(project) : "",
      provinceCurveText: project ? describeProvinceTypicalCurve(project) : ""
    },
    formatExportTime: formatExportStatusTime
  });
  applyEnergyWorkspaceModel(model, project);
}

function ensureEnergyCurveChart() {
  if (!refs.energyCurveChart || typeof window === "undefined" || !window.echarts) return null;
  if (energyCurveChart && !energyCurveChart.isDisposed()) {
    return energyCurveChart;
  }
  energyCurveChart = window.echarts.init(refs.energyCurveChart, null, { renderer: "canvas" });
  if (!energyCurveResizeBound) {
    window.addEventListener("resize", () => {
      if (energyAnnualChart && !energyAnnualChart.isDisposed()) {
        energyAnnualChart.resize();
      }
      if (energyCurveChart && !energyCurveChart.isDisposed()) {
        energyCurveChart.resize();
      }
    });
    energyCurveResizeBound = true;
  }
  return energyCurveChart;
}

function ensureEnergyAnnualChart() {
  if (!refs.energyAnnualChart || typeof window === "undefined" || !window.echarts) return null;
  if (energyAnnualChart && !energyAnnualChart.isDisposed()) {
    return energyAnnualChart;
  }
  energyAnnualChart = window.echarts.init(refs.energyAnnualChart, null, { renderer: "canvas" });
  if (!energyCurveResizeBound) {
    window.addEventListener("resize", () => {
      if (energyAnnualChart && !energyAnnualChart.isDisposed()) {
        energyAnnualChart.resize();
      }
      if (energyCurveChart && !energyCurveChart.isDisposed()) {
        energyCurveChart.resize();
      }
    });
    energyCurveResizeBound = true;
  }
  return energyAnnualChart;
}

function setEnergyChartEmpty(chart, message) {
  if (!chart) return;
  const tokens = historyThemeTokens();
  chart.clear();
  chart.setOption(energyCharts.buildEnergyChartEmptyOption(message, tokens), true);
}

function setEnergyChartsNoData(noteMessage, annualMessage = noteMessage, typicalMessage = noteMessage) {
  if (refs.energyCurveNote) {
    refs.energyCurveNote.textContent = noteMessage;
  }
  if (refs.energyCurveSubtitle) {
    refs.energyCurveSubtitle.textContent = "按月份拆解典型年24小时曲线，支持后续替换为正式数据库结果。";
  }
  setEnergyChartEmpty(ensureEnergyAnnualChart(), annualMessage);
  setEnergyChartEmpty(ensureEnergyCurveChart(), typicalMessage);
}

function renderEnergyCurveChart() {
  if (appState.activePage !== "energy-page") return;
  if (!refs.energyCurveChart || !refs.energyAnnualChart) return;
  if (typeof window === "undefined" || !window.echarts) return;
  const project = getActiveProject();
  if (!project) {
    setEnergyChartsNoData(
      "请先进入项目，再查看上网电量图形展示。",
      "请先进入项目，再查看逐年上网电量小时数。",
      "请先进入项目，再查看典型年日内曲线（月度）。"
    );
    return;
  }
  if (!isProjectCreateCompleted(project)) {
    setEnergyChartsNoData(
      "请先完成步骤1基础信息保存，再查看上网电量图形展示。",
      "请先完成步骤1基础信息保存，再查看逐年上网电量小时数。",
      "请先完成步骤1基础信息保存，再查看典型年日内曲线（月度）。"
    );
    return;
  }
  const energyState = getEnergyCompletionState(project);
  const energyData = energyState.energyData;
  const annualRows = energyCharts.buildAnnualRows(project, energyData);
  const hasAnnualValues = energyCharts.hasAnnualValues(annualRows);
  const hasConfiguredTypicalCurve = energyState.hasTypicalCurve;
  const previewMeta = hasConfiguredTypicalCurve ? getEnergyCurvePreviewProfile(project) : null;
  const typicalProfile = previewMeta?.profile || null;
  const chart = ensureEnergyCurveChart();
  const annualChart = ensureEnergyAnnualChart();
  if (!chart || !annualChart) return;
  const tokens = historyThemeTokens();

  if (hasAnnualValues) {
    annualChart.setOption(energyCharts.buildAnnualHoursOption(annualRows, tokens), true);
  } else {
    setEnergyChartEmpty(annualChart, "请先导出逐年总量模板并上传结果。");
  }

  const typicalOption = energyCharts.buildTypicalDayCurveOption(typicalProfile, tokens);
  if (typicalOption) {
    chart.setOption(typicalOption, true);
  } else {
    setEnergyChartEmpty(chart, "第二步未完成：请导入典型年8760模板，或调用所选省份典型曲线。");
  }

  const chartText = energyCharts.buildEnergyCurveText({
    hasAnnualValues,
    hasConfiguredTypicalCurve,
    sourceLabel: previewMeta?.sourceLabel || ""
  });
  if (refs.energyCurveSubtitle) {
    refs.energyCurveSubtitle.textContent = chartText.subtitle;
  }
  if (refs.energyCurveNote) {
    refs.energyCurveNote.textContent = chartText.note;
  }
}

function buildHistorySpotAnalysisDataset(project) {
  return historyAnalysis.buildMockHistorySpotAnalysisDataset(project, {
    provinceBenchmarks: PROVINCE_BENCHMARKS,
    cache: historyAnalysisCache
  });
}

function historyThemeTokens() {
  return historyCharts.buildHistoryThemeTokens(appState.theme);
}

function ensureHistoryChart(chartKey, node) {
  if (!node || !window.echarts) return null;
  const existed = historyChartInstances[chartKey];
  if (existed && !existed.isDisposed()) {
    return existed;
  }
  const chart = window.echarts.init(node, null, { renderer: "canvas" });
  historyChartInstances[chartKey] = chart;
  return chart;
}

function ensureHistoryCharts() {
  const charts = {
    monthTrend: ensureHistoryChart("monthTrend", refs.historyMonthTrendChart),
    typicalDay: ensureHistoryChart("typicalDay", refs.historyTypicalDayChart),
    distribution: ensureHistoryChart("distribution", refs.historyDistributionChart),
    heatmap: ensureHistoryChart("heatmap", refs.historyHeatmapChart),
    boxplot: ensureHistoryChart("boxplot", refs.historyBoxplotChart)
  };
  if (!historyChartsResizeBound && typeof window !== "undefined") {
    window.addEventListener("resize", () => {
      Object.values(historyChartInstances).forEach((chart) => {
        if (chart && !chart.isDisposed()) chart.resize();
      });
    });
    historyChartsResizeBound = true;
  }
  return charts;
}

function queueHistoryChartsResize() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      Object.values(historyChartInstances).forEach((chart) => {
        if (chart && !chart.isDisposed()) {
          chart.resize();
        }
      });
    });
  });
}

function queueHistoryChartsRefresh() {
  if (typeof window === "undefined") return;
  if (historyChartsRefreshTimer) {
    window.clearTimeout(historyChartsRefreshTimer);
  }
  historyChartsRefreshTimer = window.setTimeout(() => {
    historyChartsRefreshTimer = null;
    if (resolveVisiblePageId(appState.activePage) !== "history-page") return;
    renderHistoryPrices();
  }, 90);
}

function getScenarioVisualChartNode(key) {
  const nodeMap = {
    energy: refs.scenarioVisualEnergyChart,
    unit: refs.scenarioVisualUnitChart,
    trend: refs.scenarioVisualTrendChart
  };
  return nodeMap[key] || null;
}

function ensureScenarioVisualChart(key) {
  const node = getScenarioVisualChartNode(key);
  if (!node || !window.echarts) return null;
  const existing = scenarioVisualCharts[key];
  if (existing && !existing.isDisposed()) {
    return existing;
  }
  scenarioVisualCharts[key] = window.echarts.init(node, null, { renderer: "canvas" });
  if (!scenarioVisualResizeBound && typeof window !== "undefined") {
    window.addEventListener("resize", () => {
      Object.values(scenarioVisualCharts).forEach((chart) => {
        if (chart && !chart.isDisposed()) {
          chart.resize();
        }
      });
    });
    scenarioVisualResizeBound = true;
  }
  return scenarioVisualCharts[key];
}

function getScenarioVisualCharts() {
  return ["energy", "trend", "unit"]
    .map((key) => ensureScenarioVisualChart(key))
    .filter(Boolean);
}

function queueScenarioVisualResize() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      Object.values(scenarioVisualCharts).forEach((chart) => {
        if (chart && !chart.isDisposed()) {
          chart.resize();
        }
      });
    });
  });
}

function renderScenarioVisualPlaceholder(message) {
  if (refs.scenarioVisualMessage) {
    refs.scenarioVisualMessage.textContent = message;
  }

  if (resolveVisiblePageId(appState.activePage) !== "scenario-page") return;
  const tokens = scenarioCharts.buildScenarioVisualThemeTokens(appState.theme);
  const option = scenarioCharts.buildScenarioVisualEmptyOption(message, tokens);
  getScenarioVisualCharts().forEach((chart) => {
    chart.clear();
    chart.setOption(option, true);
  });
}

function renderScenarioVisualization() {
  if (!refs.scenarioVisualMessage) return;
  const project = getActiveProject();
  if (!project) {
    renderScenarioVisualPlaceholder("请选择项目后查看参数结构。");
    return;
  }
  ensureScenarioMetadata(project);
  const scenario = getActiveScenario(project);
  if (!scenario) {
    renderScenarioVisualPlaceholder("请选择方案后查看参数结构。");
    return;
  }

  const provinceName = getProvinceName(project.province || "");

  refs.scenarioVisualMessage.textContent = `当前展示：${scenario.name} | ${provinceName || "未选省份"} / ${getAssetTypeLabel(project.assetType)} / ${getSiteTypeLabel(project.siteType)} / ${getStorageConfigText(project)}`;

  if (resolveVisiblePageId(appState.activePage) !== "scenario-page") return;
  const tokens = scenarioCharts.buildScenarioVisualThemeTokens(appState.theme);
  const visualRows = scenarioVisualData.buildScenarioVisualRows({
    project,
    scenario,
    energyData: ensureProjectEnergyDataDerivedState(project),
    clamp,
    mechanismActiveMonthsForYear,
    tradeStrategyPnlPriceForYear,
    getEnvValueAllocation,
    getFeeConfigForYear
  });
  const options = scenarioCharts.buildScenarioVisualOptions(visualRows, tokens);
  Object.entries(options).forEach(([key, option]) => {
    const chart = ensureScenarioVisualChart(key);
    if (chart) chart.setOption(option, true);
  });
  queueScenarioVisualResize();
}

function compareThemeTokens() {
  return compareCharts.buildCompareThemeTokens(appState.theme);
}

function ensureCompareChart(chartKey, node) {
  if (!node || !window.echarts) return null;
  const existed = compareChartInstances[chartKey];
  if (existed && !existed.isDisposed()) {
    return existed;
  }
  const chart = window.echarts.init(node, null, { renderer: "canvas" });
  compareChartInstances[chartKey] = chart;
  if (!compareChartsResizeBound && typeof window !== "undefined") {
    window.addEventListener("resize", () => {
      Object.values(compareChartInstances).forEach((instance) => {
        if (instance && !instance.isDisposed()) {
          instance.resize();
        }
      });
    });
    compareChartsResizeBound = true;
  }
  return chart;
}

function queueCompareChartsResize() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      Object.values(compareChartInstances).forEach((instance) => {
        if (instance && !instance.isDisposed()) {
          instance.resize();
        }
      });
    });
  });
}

function setCompareMetric(node, primaryText, secondaryText = "") {
  if (!node) return;
  node.innerHTML = secondaryText
    ? `${escapeHtml(primaryText)}<small>${escapeHtml(secondaryText)}</small>`
    : escapeHtml(primaryText);
}

function renderCompareChartPlaceholder(chartKey, node, message) {
  if (resolveVisiblePageId(appState.activePage) !== "compare-page") return;
  const chart = ensureCompareChart(chartKey, node);
  if (!chart) return;
  const tokens = compareThemeTokens();
  chart.clear();
  chart.setOption(compareCharts.buildComparePlaceholderOption(message, tokens), true);
}

function sanitizeCompareSensitivitySettings() {
  Object.assign(compareSensitivitySettings, compareAnalysis.sanitizeCompareSensitivitySettings(compareSensitivitySettings));
  return compareSensitivitySettings;
}

function syncCompareSensitivityControls() {
  const settings = sanitizeCompareSensitivitySettings();
  if (refs.compareSensitivityRange) refs.compareSensitivityRange.value = String(settings.rangePercent);
  if (refs.compareSensitivityStep) refs.compareSensitivityStep.value = String(settings.stepPercent);
  if (refs.compareSensitivityScale) refs.compareSensitivityScale.value = String(settings.responseScalePercent);
  if (refs.compareSensitivityTopn) refs.compareSensitivityTopn.value = settings.topN === "all" ? "all" : String(settings.topN);
}

function sensitivityAxisLabels(settings = compareSensitivitySettings) {
  return compareAnalysis.sensitivityAxisLabels(settings);
}

function buildCompareSensitivityFactors(baselineFirst, baselineRevenueWan, settings = compareSensitivitySettings) {
  sanitizeCompareSensitivitySettings();
  return compareAnalysis.buildCompareSensitivityFactors(baselineFirst, baselineRevenueWan, settings);
}

function renderSensitivityTornadoChart(factors, baselineRevenueWan) {
  const chart = ensureCompareChart("sensitivityTornado", refs.compareSensitivityTornadoChart);
  if (!chart) return;
  const tokens = compareThemeTokens();
  const settings = sanitizeCompareSensitivitySettings();
  if (refs.compareSensitivityTornadoNote) {
    refs.compareSensitivityTornadoNote.textContent = `变量在 -${settings.rangePercent}% 与 +${settings.rangePercent}% 扰动下的首年收益变化区间`;
  }
  if (!factors.length) {
    renderCompareChartPlaceholder("sensitivityTornado", refs.compareSensitivityTornadoChart, "基准方案未测算，暂无法展示。");
    return;
  }
  chart.setOption(compareCharts.buildSensitivityTornadoOption(factors, baselineRevenueWan, settings, tokens), true);
}

function renderSensitivityFactorList(allFactors, enabledFactors) {
  if (!refs.compareSensitivityFactorList) return;
  const tokens = compareThemeTokens();
  refs.compareSensitivityFactorList.innerHTML = comparePage.buildSensitivityFactorListHtml({
    allFactors,
    enabledFactors,
    activeFactorKey: activeSensitivityFactorKey,
    tokens
  });
  if (refs.compareSensitivityVariableSummary) {
    refs.compareSensitivityVariableSummary.textContent = `已启用 ${enabledFactors.length}/${allFactors.length} 项，排序按敏感度自动更新`;
  }
}

function renderSensitivityResponseChart(factors, baselineRevenueWan) {
  const chart = ensureCompareChart("sensitivityResponse", refs.compareSensitivityResponseChart);
  if (!chart) return;
  const tokens = compareThemeTokens();
  const selected = factors.find((factor) => factor.key === activeSensitivityFactorKey) || factors[0] || null;
  if (!selected) {
    if (refs.compareSensitivityResponseLabel) refs.compareSensitivityResponseLabel.textContent = "等待变量选择";
    renderCompareChartPlaceholder("sensitivityResponse", refs.compareSensitivityResponseChart, "请选择变量查看响应曲线。");
    return;
  }
  activeSensitivityFactorKey = selected.key;
  if (refs.compareSensitivityResponseLabel) refs.compareSensitivityResponseLabel.textContent = selected.name;
  chart.setOption(compareCharts.buildSensitivityResponseOption(selected, baselineRevenueWan, sensitivityAxisLabels(), tokens), true);
}

function renderSensitivityTable(factors) {
  if (!refs.compareSensitivityBody) return;
  const settings = sanitizeCompareSensitivitySettings();
  if (refs.compareSensitivityLowHead) refs.compareSensitivityLowHead.textContent = `-${settings.rangePercent}%影响`;
  if (refs.compareSensitivityHighHead) refs.compareSensitivityHighHead.textContent = `+${settings.rangePercent}%影响`;
  refs.compareSensitivityBody.innerHTML = factors.map((factor) => {
    const direction = factor.highDelta >= factor.lowDelta ? "同向" : "反向";
    return `
      <tr>
        <td>${escapeHtml(factor.name)}</td>
        <td>${factor.lowDelta >= 0 ? "+" : ""}${asNum(factor.lowDelta, 2)} 万元</td>
        <td>${factor.highDelta >= 0 ? "+" : ""}${asNum(factor.highDelta, 2)} 万元</td>
        <td>${asNum(factor.sensitivity, 2)} 万元</td>
        <td>${direction}</td>
      </tr>
    `;
  }).join("");
}

function renderCompareTrendChart(available) {
  if (resolveVisiblePageId(appState.activePage) !== "compare-page") return;
  const chart = ensureCompareChart("scenarioTrend", refs.compareTrendChart);
  if (!chart) return;
  const tokens = compareThemeTokens();
  chart.setOption(compareCharts.buildScenarioTrendOption(available, tokens), true);
}

function renderScenarioRankingChart(available, baseline) {
  if (resolveVisiblePageId(appState.activePage) !== "compare-page") return;
  const chart = ensureCompareChart("scenarioRanking", refs.compareRankingChart);
  if (!chart) return;
  const tokens = compareThemeTokens();
  if (!available.length) {
    renderCompareChartPlaceholder("scenarioRanking", refs.compareRankingChart, "暂无方案结果，无法生成收益排名。");
    return;
  }
  chart.setOption(compareCharts.buildScenarioRankingOption(available, baseline, tokens), true);
}

function renderScenarioFocusList(available, baseline) {
  if (!refs.compareScenarioFocusList) return;
  refs.compareScenarioFocusList.innerHTML = comparePage.buildScenarioFocusListHtml({
    available,
    baseline,
    activeScenarioId: activeCompareScenarioId,
    asCompactMoney
  });
}

function renderScenarioBridgeChart(focusItem, baseline) {
  if (resolveVisiblePageId(appState.activePage) !== "compare-page") return;
  const chart = ensureCompareChart("scenarioBridge", refs.compareBridgeChart);
  if (!chart) return;
  const tokens = compareThemeTokens();
  if (!focusItem || !baseline) {
    if (refs.compareScenarioBridgeLabel) refs.compareScenarioBridgeLabel.textContent = "等待方案选择";
    renderCompareChartPlaceholder("scenarioBridge", refs.compareBridgeChart, "请选择方案查看差异归因。");
    return;
  }
  if (refs.compareScenarioBridgeLabel) {
    refs.compareScenarioBridgeLabel.textContent = focusItem.scenario.isBaseline
      ? "基准方案自身，无差异"
      : `${focusItem.scenario.name} 相对 ${baseline.scenario.name}`;
  }
  const focusTotals = compareAnalysis.resultComponentTotals(focusItem.result);
  const baseTotals = compareAnalysis.resultComponentTotals(baseline.result);
  chart.setOption(compareCharts.buildScenarioBridgeOption(focusTotals, baseTotals, tokens), true);
}

function disposeCompareCharts() {
  Object.keys(compareChartInstances).forEach((key) => {
    const chart = compareChartInstances[key];
    if (chart && !chart.isDisposed()) {
      chart.dispose();
    }
    compareChartInstances[key] = null;
  });
}

function disposeResultCharts() {
  Object.keys(resultChartInstances).forEach((key) => {
    const chart = resultChartInstances[key];
    if (chart && !chart.isDisposed()) {
      chart.dispose();
    }
    resultChartInstances[key] = null;
  });
}

function disposeHistoryCharts() {
  Object.keys(historyChartInstances).forEach((key) => {
    const chart = historyChartInstances[key];
    if (chart && !chart.isDisposed()) {
      chart.dispose();
    }
    historyChartInstances[key] = null;
  });
}

function renderHistoryPrices() {
  historyRenderer.renderHistoryPrices({
    refs,
    appState,
    windowRef: typeof window !== "undefined" ? window : null,
    resolveVisiblePageId,
    sanitizeHistoryAnalysis,
    resetHistoryExportPayloads,
    ensureHistoryCharts,
    historyThemeTokens,
    historyCharts,
    queueHistoryChartsResize,
    getActiveProject,
    isProjectCreateCompleted,
    buildHistorySpotAnalysisDataset,
    historyAnalysis,
    historyPage,
    setHistoryExportPayload,
    syncHistoryExportButtons,
    getProvinceName,
    getAssetTypeLabel,
    getSiteTypeLabel,
    sanitizeExportFilenamePart,
    renderStatuses,
    renderProjects,
    schedulePersistAppData,
    historyMonthLabels: HISTORY_MONTH_LABELS,
    historyQuarterLabels: HISTORY_QUARTER_LABELS
  });
}

function applyProvinceDefaultsToProject(provinceKey) {
  const project = getActiveProject();
  if (!project) {
    refs.provinceApplyMessage.textContent = "请先创建或选择项目，再带入省份默认参数。";
    refs.provinceApplyMessage.style.borderColor = "#d39191";
    refs.provinceApplyMessage.style.background = "#fff2f2";
    return;
  }
  ensureScenarioMetadata(project);
  const scenario = getActiveScenario(project);
  if (!scenario) return;
  if (scenario.locked) {
    refs.provinceApplyMessage.textContent = "当前场景已锁定，请先切换到可编辑场景。";
    refs.provinceApplyMessage.style.borderColor = "#d39191";
    refs.provinceApplyMessage.style.background = "#fff2f2";
    return;
  }

  const defaults = getProvinceDefaults(provinceKey);
  scenario.config.mechanismEnabled = defaults.mechanismEnabled;
  scenario.config.mechanismRatio = defaults.mechanismRatio;
  scenario.config.mechanismPrice = defaults.mechanismPrice;
  scenario.config.marketOpFee = defaults.marketOpFee;
  scenario.config.gridAssessFee = defaults.gridAssessFee;
  scenario.config.ancillaryFee = defaults.ancillaryFee;
  scenario.config.otherFee = defaults.otherFee;
  scenario.config.greenCertPrice = defaults.greenCertPrice;
  scenario.config.greenCertRealizeRatio = 1;
  scenario.config.greenPremiumPrice = defaults.greenPremiumPrice;
  scenario.config.greenPremiumRealizeRatio = 0;
  scenario.config.carbonRealizeRatio = 0;
  scenario.config.storageArbitragePrice = project.hasStorage ? defaults.storageArbitragePrice : 0;
  scenario.config.storageCapacityCompPrice = project.hasStorage ? defaults.storageCapacityCompPrice : 0;
  scenario.config.storageAncillaryRevenuePrice = project.hasStorage ? defaults.storageAncillaryRevenuePrice : 0;
  scenario.config.storageOtherRevenuePrice = project.hasStorage ? defaults.storageOtherRevenuePrice : 0;
  if (project.siteType !== "offshore") {
    scenario.config.carbonEnabled = false;
    scenario.config.carbonPrice = 0;
  }
  scenario.updatedAt = new Date().toISOString();
  project.statuses["scenario-page"] = "completed";
  markDownstreamStale(project, "scenario-page");

  const sourceProvinceName = getProvinceName(provinceKey);
  const projectProvinceName = getProvinceName(project.province);
  refs.provinceApplyMessage.textContent = provinceKey === project.province
    ? `已带入 ${sourceProvinceName} 默认参数，并应用到当前场景“${scenario.name}”。`
    : `已调用 ${sourceProvinceName} 默认参数，并应用到当前场景“${scenario.name}”。项目省份仍为 ${projectProvinceName}。`;
  refs.provinceApplyMessage.style.borderColor = "#8fb48d";
  refs.provinceApplyMessage.style.background = "#f1fbf1";
  refs.scenarioMessage.textContent = `场景“${scenario.name}”已按 ${sourceProvinceName} 参数更新。`;
  refs.scenarioMessage.style.borderColor = "#8fb48d";
  refs.scenarioMessage.style.background = "#f1fbf1";
  renderAll();
  schedulePersistAppData();
}

function toggleProvinceDefaultDetails(provinceKey) {
  if (!provinceKey) return;
  if (expandedProvinceDefaultKeys.has(provinceKey)) {
    expandedProvinceDefaultKeys.delete(provinceKey);
  } else {
    expandedProvinceDefaultKeys.add(provinceKey);
  }
  renderProvinceLibrary();
}

function renderProvinceLibrary() {
  const project = getActiveProject();
  if (!refs.provinceParamBody || !refs.provinceApplyMessage) return;
  const model = provinceDefaultsView.buildProvinceDefaultsViewModel({
    project,
    provinces: PROVINCES,
    selectedProvinceDefaultKey,
    selectedProvinceDefaultContextKey,
    expandedKeys: Array.from(expandedProvinceDefaultKeys),
    currentMessage: refs.provinceApplyMessage.textContent,
    getProvinceDefaults,
    getProvinceName,
    getRegionKey: getPolicyRegionKeyByProvince
  });
  selectedProvinceDefaultKey = model.selectedKey;
  selectedProvinceDefaultContextKey = model.contextKey;
  if (refs.provinceDefaultSelector) {
    refs.provinceDefaultSelector.disabled = model.selector.disabled;
    refs.provinceDefaultSelector.innerHTML = model.selector.html;
    refs.provinceDefaultSelector.value = model.selector.value;
  }
  if (model.message) {
    refs.provinceApplyMessage.textContent = model.message.text;
    refs.provinceApplyMessage.style.borderColor = model.message.borderColor;
    refs.provinceApplyMessage.style.background = model.message.background;
  }
  refs.provinceParamBody.innerHTML = model.bodyHtml;

  document.querySelectorAll("[data-toggle-province-details]").forEach((button) => {
    button.addEventListener("click", () => toggleProvinceDefaultDetails(button.dataset.toggleProvinceDetails));
  });
  document.querySelectorAll("[data-apply-province]").forEach((button) => {
    button.addEventListener("click", () => applyProvinceDefaultsToProject(button.dataset.applyProvince));
  });
}

function loadScenarioToForm(project, scenario) {
  scenarioForm.loadScenarioToForm({
    scenario,
    refs,
    querySelector: (selector) => document.querySelector(selector),
    asNum,
    modes: {
      ltPricingMode: LT_PRICING_MODE_SET.has(scenario.config.ltPricingMode) ? scenario.config.ltPricingMode : "auto",
      envValueMode: ENV_VALUE_MODE_SET.has(scenario.config.envValueMode) ? scenario.config.envValueMode : "global",
      feeConfigMode: FEE_CONFIG_MODE_SET.has(scenario.config.feeConfigMode) ? scenario.config.feeConfigMode : "global"
    }
  });
  updateMarketTradeEnergyDisplay(project, scenario);
  updateLtManualStatus(project, scenario);
  updateEnvManualStatus(project, scenario);
  updateFeeManualStatus(project, scenario);
}

function readScenarioMechanismDraft(scenario) {
  const ratioInput = Number(document.querySelector("#mechanism-ratio")?.value);
  return {
    mechanismEnabled: document.querySelector("#mechanism-enabled")?.value === "yes",
    mechanismRatio: Number.isFinite(ratioInput)
      ? clamp(ratioInput / 100, 0, 1)
      : clamp(Number(scenario?.config?.mechanismRatio || 0), 0, 1),
    mechanismStartYm: document.querySelector("#mechanism-start-ym")?.value || scenario?.config?.mechanismStartYm || "",
    mechanismEndYm: document.querySelector("#mechanism-end-ym")?.value || scenario?.config?.mechanismEndYm || ""
  };
}

function updateMarketTradeEnergyDisplay(project = getActiveProject(), scenario = null) {
  if (!refs.marketTradeEnergyRatio) {
    return;
  }
  const activeScenario = scenario || (project ? getActiveScenario(project) : null);
  if (!project || !activeScenario) {
    refs.marketTradeEnergyRatio.value = "-";
    updateEnvValueSpaceDisplay(project, activeScenario, 0);
    return;
  }
  const mechanismDraft = readScenarioMechanismDraft(activeScenario);
  const marketTradeRatio = mechanismDraft.mechanismEnabled ? clamp(1 - mechanismDraft.mechanismRatio, 0, 1) : 1;
  refs.marketTradeEnergyRatio.value = asPercent(marketTradeRatio);
  updateEnvValueSpaceDisplay(project, activeScenario, marketTradeRatio);
}

function getEnvValueMode(config) {
  return scenarioConfig.getEnvValueMode(config);
}

function getEnvManualEntryForYear(project, config, year) {
  return scenarioConfig.getEnvManualEntryForYear(project, config, year);
}

function getEnvValueAllocation(project, config, year = null) {
  return revenueRules.getEnvValueAllocation(project, config, year);
}

function getEnvManualCompleteness(project, config) {
  return scenarioConfig.getEnvManualCompleteness(project, config);
}

function readEnvValueAllocationDraft(project = getActiveProject()) {
  const canUseCarbon = project?.siteType === "offshore" && document.querySelector("#carbon-enabled")?.value === "yes";
  const readPercent = (selector) => {
    const value = Number(document.querySelector(selector)?.value);
    return Number.isFinite(value) ? value / 100 : 0;
  };
  const greenCertRatio = readPercent("#green-cert-realize-ratio");
  const greenPremiumRatio = readPercent("#green-premium-realize-ratio");
  const carbonRatio = canUseCarbon ? readPercent("#carbon-realize-ratio") : 0;
  return {
    greenCertRatio,
    greenPremiumRatio,
    carbonRatio,
    totalRatio: greenCertRatio + greenPremiumRatio + carbonRatio
  };
}

function updateEnvValueSpaceDisplay(project = getActiveProject(), scenario = null, marketTradeRatio = null) {
  if (!refs.envValueSpaceRatio && !refs.envValueUsedRatio) return;
  const activeScenario = scenario || (project ? getActiveScenario(project) : null);
  const mechanismDraft = activeScenario ? readScenarioMechanismDraft(activeScenario) : null;
  const hasMarketTradeRatio = marketTradeRatio !== null && marketTradeRatio !== undefined && Number.isFinite(Number(marketTradeRatio));
  const maxRatio = hasMarketTradeRatio
    ? clamp(Number(marketTradeRatio), 0, 1)
    : mechanismDraft
      ? (mechanismDraft.mechanismEnabled ? clamp(1 - mechanismDraft.mechanismRatio, 0, 1) : 1)
      : 0;
  let draft = readEnvValueAllocationDraft(project);
  const selectedEnvMode = refs.envValueMode?.value || getEnvValueMode(activeScenario?.config);
  if (selectedEnvMode === "manual") {
    const firstYear = Number.isInteger(project?.startYear) ? project.startYear : null;
    draft = firstYear !== null && getEnvManualEntryForYear(project, activeScenario?.config, firstYear)
      ? getEnvValueAllocation(project, activeScenario?.config, firstYear)
      : { totalRatio: 0 };
  }
  if (refs.envValueSpaceRatio) refs.envValueSpaceRatio.value = project && activeScenario ? asPercent(maxRatio) : "-";
  if (refs.envValueUsedRatio) {
    refs.envValueUsedRatio.value = project && activeScenario ? asPercent(draft.totalRatio) : "-";
    if (draft.totalRatio > 1 + 0.000001) {
      refs.envValueUsedRatio.style.borderColor = "#d39191";
      refs.envValueUsedRatio.style.background = "#fff2f2";
    } else {
      refs.envValueUsedRatio.style.removeProperty("border-color");
      refs.envValueUsedRatio.style.removeProperty("background");
    }
  }
}

function updateEnvManualStatus(project = getActiveProject(), scenario = null) {
  if (!refs.envManualStatus) return;
  const activeScenario = scenario || (project ? getActiveScenario(project) : null);
  if (!project || !activeScenario) {
    refs.envManualStatus.textContent = "请先创建或选择项目。";
    return;
  }
  const { complete, total, missingYears } = getEnvManualCompleteness(project, activeScenario.config);
  if (!total) {
    refs.envManualStatus.textContent = "保存项目测算周期后，可导出逐年环境价值兑现模板。";
    return;
  }
  if (!complete) {
    refs.envManualStatus.textContent = "尚未导入逐年环境价值兑现配置。各年份三条路径兑现空间合计不能超过100%。";
    return;
  }
  refs.envManualStatus.textContent = complete === total
    ? `已导入完整逐年环境价值兑现配置：${complete}/${total} 年。`
    : `已导入 ${complete}/${total} 年，缺少：${missingYears.slice(0, 5).join("、")}${missingYears.length > 5 ? "…" : ""}。`;
}

function syncEnvValueControls(project = getActiveProject(), scenario = null, locked = false) {
  const activeScenario = scenario || (project ? getActiveScenario(project) : null);
  const mode = refs.envValueMode?.value || getEnvValueMode(activeScenario?.config);
  const isManual = mode === "manual";
  const canUseCarbon = project?.siteType === "offshore";
  const carbonEnabled = document.querySelector("#carbon-enabled")?.value === "yes";
  if (refs.envManualPanel) refs.envManualPanel.hidden = !isManual;
  if (refs.envValueMode) refs.envValueMode.disabled = locked;
  [
    "#green-cert-price",
    "#green-cert-realize-ratio",
    "#green-premium-price",
    "#green-premium-realize-ratio"
  ].forEach((selector) => {
    const field = document.querySelector(selector);
    if (field) field.disabled = locked || isManual;
  });
  const carbonEnabledField = document.querySelector("#carbon-enabled");
  const carbonPriceField = document.querySelector("#carbon-price");
  const carbonRatioField = document.querySelector("#carbon-realize-ratio");
  if (carbonEnabledField) carbonEnabledField.disabled = locked || isManual || !canUseCarbon;
  if (carbonPriceField) carbonPriceField.disabled = locked || isManual || !(canUseCarbon && carbonEnabled);
  if (carbonRatioField) carbonRatioField.disabled = locked || isManual || !(canUseCarbon && carbonEnabled);
  if (!canUseCarbon) {
    if (carbonEnabledField) carbonEnabledField.value = "no";
    if (carbonPriceField) carbonPriceField.value = "0";
    if (carbonRatioField) carbonRatioField.value = "0";
  } else if (!carbonEnabled && !isManual && carbonRatioField) {
    carbonRatioField.value = "0";
  }
  if (refs.envValueSpaceRatio) refs.envValueSpaceRatio.disabled = true;
  if (refs.envValueUsedRatio) refs.envValueUsedRatio.disabled = true;
  if (refs.exportEnvTemplateButton) refs.exportEnvTemplateButton.disabled = locked || !project;
  if (refs.envManualFileInput) refs.envManualFileInput.disabled = locked || !project || !isManual;
  if (refs.importEnvTemplateButton) refs.importEnvTemplateButton.disabled = locked || !project || !isManual;
  updateEnvManualStatus(project, activeScenario);
  updateEnvValueSpaceDisplay(project, activeScenario);
}

function getFeeConfigMode(config) {
  return scenarioConfig.getFeeConfigMode(config);
}

function getFeeManualEntryForYear(project, config, year) {
  return scenarioConfig.getFeeManualEntryForYear(project, config, year);
}

function getFeeConfigForYear(project, config, year = null) {
  return revenueRules.getFeeConfigForYear(project, config, year);
}

function getFeeManualCompleteness(project, config) {
  return scenarioConfig.getFeeManualCompleteness(project, config);
}

function updateFeeManualStatus(project = getActiveProject(), scenario = null) {
  if (!refs.feeManualStatus) return;
  const activeScenario = scenario || (project ? getActiveScenario(project) : null);
  if (!project || !activeScenario) {
    refs.feeManualStatus.textContent = "请先创建或选择项目。";
    return;
  }
  const { complete, total, missingYears } = getFeeManualCompleteness(project, activeScenario.config);
  if (!total) {
    refs.feeManualStatus.textContent = "保存项目测算周期后，可导出逐年扣费收益模板。";
    return;
  }
  if (!complete) {
    refs.feeManualStatus.textContent = "尚未导入逐年扣费收益配置。模板字段包含四类扣费和其他收入。";
    return;
  }
  refs.feeManualStatus.textContent = complete === total
    ? `已导入完整逐年扣费收益配置：${complete}/${total} 年。`
    : `已导入 ${complete}/${total} 年，缺少：${missingYears.slice(0, 5).join("、")}${missingYears.length > 5 ? "…" : ""}。`;
}

function syncFeeConfigControls(project = getActiveProject(), scenario = null, locked = false) {
  const activeScenario = scenario || (project ? getActiveScenario(project) : null);
  const mode = refs.feeConfigMode?.value || getFeeConfigMode(activeScenario?.config);
  const isManual = mode === "manual";
  if (refs.feeManualPanel) refs.feeManualPanel.hidden = !isManual;
  if (refs.feeConfigMode) refs.feeConfigMode.disabled = locked;
  [
    "#market-op-fee",
    "#grid-assess-fee",
    "#ancillary-fee",
    "#other-fee",
    "#other-income"
  ].forEach((selector) => {
    const field = document.querySelector(selector);
    if (field) field.disabled = locked || isManual;
  });
  if (refs.exportFeeTemplateButton) refs.exportFeeTemplateButton.disabled = locked || !project;
  if (refs.feeManualFileInput) refs.feeManualFileInput.disabled = locked || !project || !isManual;
  if (refs.importFeeTemplateButton) refs.importFeeTemplateButton.disabled = locked || !project || !isManual;
  updateFeeManualStatus(project, activeScenario);
}

function getLtPricingMode(config) {
  return scenarioConfig.getLtPricingMode(config);
}

function getLtManualCompleteness(project, config) {
  return scenarioConfig.getLtManualCompleteness(project, config);
}

function updateLtManualStatus(project = getActiveProject(), scenario = null) {
  if (!refs.ltManualStatus) return;
  const activeScenario = scenario || (project ? getActiveScenario(project) : null);
  if (!project || !activeScenario) {
    refs.ltManualStatus.textContent = "请先创建或选择项目。";
    return;
  }
  const { complete, total, missingYears } = getLtManualCompleteness(project, activeScenario.config);
  if (!total) {
    refs.ltManualStatus.textContent = "保存项目测算周期后，可导出逐年损益模板。";
    return;
  }
  if (!complete) {
    refs.ltManualStatus.textContent = "尚未导入逐年损益值。模板字段：year,trade_strategy_pnl_yuan_per_mwh。";
    return;
  }
  refs.ltManualStatus.textContent = complete === total
    ? `已导入完整逐年损益值：${complete}/${total} 年。`
    : `已导入 ${complete}/${total} 年，缺少：${missingYears.slice(0, 5).join("、")}${missingYears.length > 5 ? "…" : ""}。`;
}

function syncLtPricingControls(project = getActiveProject(), scenario = null, locked = false) {
  const activeScenario = scenario || (project ? getActiveScenario(project) : null);
  const mode = refs.ltPricingMode?.value || getLtPricingMode(activeScenario?.config);
  const isManual = mode === "manual";
  if (refs.ltManualPanel) refs.ltManualPanel.hidden = !isManual;
  ["#lt-year1-pnl", "#lt-target-pnl", "#lt-converge-speed"].forEach((selector) => {
    const field = document.querySelector(selector);
    if (field) field.disabled = locked || isManual;
  });
  if (refs.ltPricingMode) refs.ltPricingMode.disabled = locked;
  if (refs.exportLtTemplateButton) refs.exportLtTemplateButton.disabled = locked || !project;
  if (refs.ltManualFileInput) refs.ltManualFileInput.disabled = locked || !project || !isManual;
  if (refs.importLtTemplateButton) refs.importLtTemplateButton.disabled = locked || !project || !isManual;
  updateLtManualStatus(project, activeScenario);
}

function setScenarioFormDisabled(disabled) {
  refs.scenarioForm.querySelectorAll("input, select, button").forEach((element) => {
    if (element.id === "market-trade-energy-ratio") {
      element.disabled = true;
      return;
    }
    element.disabled = disabled;
  });
}

function renderScenarioManager() {
  const project = getActiveProject();
  if (!project) {
    refs.scenarioSelector.innerHTML = "";
    refs.scenarioQuickName.value = "";
    refs.scenarioQuickName.disabled = true;
    refs.scenarioListBody.innerHTML = "";
    refs.scenarioLockHint.textContent = "请先创建项目。";
    refs.duplicateScenarioButton.disabled = true;
    refs.renameScenarioButton.disabled = true;
    refs.deleteScenarioButton.disabled = true;
    refs.toggleBaselineLockButton.disabled = true;
    refs.applyBatchButton.disabled = true;
    return;
  }
  ensureScenarioMetadata(project);
  const activeScenario = getActiveScenario(project);
  const baselineScenario = getBaselineScenario(project);

  refs.scenarioSelector.innerHTML = project.scenarios.map((scenario) => `
    <option value="${scenario.id}">
      ${scenario.name}${scenario.isBaseline ? "（基准）" : ""}${scenario.locked ? " [已锁定]" : ""}
    </option>
  `).join("");
  refs.scenarioSelector.value = activeScenario?.id || "";
  refs.scenarioQuickName.value = activeScenario?.name || "";
  refs.scenarioQuickName.disabled = !activeScenario || activeScenario.locked;

  refs.scenarioListBody.innerHTML = project.scenarios.map((scenario) => {
    const valuePart = getEnvValueAllocation(project, scenario.config, project.startYear).unitValuePerMarketMwh;
    const feeConfig = getFeeConfigForYear(project, scenario.config, project.startYear);
    const storagePart = project.hasStorage
      ? scenario.config.storageArbitragePrice
        + scenario.config.storageCapacityCompPrice
        + scenario.config.storageAncillaryRevenuePrice
        + scenario.config.storageOtherRevenuePrice
      : null;
    const feePart = feeConfig.marketOpFee + feeConfig.gridAssessFee + feeConfig.ancillaryFee + feeConfig.otherFee;
    const marks = [
      scenario.id === project.activeScenarioId ? "当前" : "",
      scenario.isBaseline ? "基准" : "",
      scenario.locked ? "已锁定" : ""
    ].filter(Boolean).join(" / ");
    return `
      <tr>
        <td>${escapeHtml(scenario.name)}</td>
        <td>${marks || "-"}</td>
        <td>${asPercent(scenario.config.mechanismRatio)}</td>
        <td>${asNum(scenario.config.mechanismPrice, 1)}</td>
        <td>${asNum(scenario.config.ltYear1Pnl, 1)}</td>
        <td>${asNum(valuePart, 1)}</td>
        <td>${storagePart === null ? "-" : asNum(storagePart, 1)}</td>
        <td>${asNum(feePart, 1)}</td>
        <td>${new Date(scenario.updatedAt).toLocaleString("zh-CN", { hour12: false })}</td>
      </tr>
    `;
  }).join("");

  refs.deleteScenarioButton.disabled = !activeScenario || activeScenario.isBaseline || activeScenario.locked || project.scenarios.length <= 1;
  refs.duplicateScenarioButton.disabled = !activeScenario;
  refs.renameScenarioButton.disabled = !activeScenario || activeScenario.locked;
  refs.toggleBaselineLockButton.disabled = !baselineScenario;
  refs.applyBatchButton.disabled = !project.scenarios.length;
  refs.toggleBaselineLockButton.textContent = baselineScenario?.locked ? "解锁基准场景" : "锁定基准场景";
  refs.scenarioLockHint.textContent = baselineScenario?.locked
    ? "基准场景已锁定。切换到其他场景可继续编辑。"
    : "基准场景未锁定。建议阶段性锁定用于对比。";
}

function renderScenarioPageSummary() {
  if (!refs.scenarioSummaryProject) return;
  const project = getActiveProject();
  if (!project) {
    refs.scenarioSummaryProject.textContent = "请选择项目";
    refs.scenarioSummaryActive.textContent = "-";
    refs.scenarioSummaryPeriod.textContent = "-";
    refs.scenarioSummaryStorage.textContent = "-";
    return;
  }
  ensureScenarioMetadata(project);
  const scenario = getActiveScenario(project);
  const provinceName = getProvinceName(project.province || "") || "未选省份";
  const assetText = getAssetTypeLabel(project.assetType);
  const siteText = getSiteTypeLabel(project.siteType);
  refs.scenarioSummaryProject.textContent = `${project.name || "未命名项目"} | ${provinceName} / ${assetText} / ${siteText}`;
  refs.scenarioSummaryActive.textContent = scenario
    ? `${scenario.name}${scenario.isBaseline ? "（基准）" : ""}${scenario.locked ? " / 已锁定" : ""}`
    : "-";
  refs.scenarioSummaryPeriod.textContent = getForecastPeriodDisplayRange(project);
  refs.scenarioSummaryStorage.textContent = getStorageConfigText(project);
}

function switchActiveScenario(scenarioId) {
  const project = getActiveProject();
  if (!project) return;
  if (!project.scenarios.some((scenario) => scenario.id === scenarioId)) return;
  project.activeScenarioId = scenarioId;
  renderAll();
}

function makeScenarioCopyName(project, sourceName) {
  const base = `${sourceName}-副本`;
  let seq = 1;
  let name = `${base}${seq}`;
  const exists = new Set(project.scenarios.map((item) => item.name));
  while (exists.has(name)) {
    seq += 1;
    name = `${base}${seq}`;
  }
  return name;
}

function duplicateActiveScenario() {
  const project = getActiveProject();
  if (!project) return;
  ensureScenarioMetadata(project);
  const source = getActiveScenario(project);
  if (!source) return;
  const clone = {
    id: makeId("scn"),
    name: makeScenarioCopyName(project, source.name),
    isBaseline: false,
    locked: false,
    config: cloneData(source.config),
    updatedAt: new Date().toISOString()
  };
  project.scenarios.push(clone);
  project.activeScenarioId = clone.id;
  project.statuses["scenario-page"] = "in_progress";
  refs.scenarioMessage.textContent = `已复制场景“${source.name}”，当前正在编辑“${clone.name}”。`;
  refs.scenarioMessage.style.borderColor = "#8fb48d";
  refs.scenarioMessage.style.background = "#f1fbf1";
  renderAll();
}

function renameActiveScenario() {
  const project = getActiveProject();
  if (!project) return;
  ensureScenarioMetadata(project);
  const target = getActiveScenario(project);
  if (!target) return;
  if (target.locked) {
    refs.scenarioMessage.textContent = "当前场景已锁定，不能重命名。";
    refs.scenarioMessage.style.borderColor = "#d39191";
    refs.scenarioMessage.style.background = "#fff2f2";
    return;
  }
  const trimmedName = refs.scenarioQuickName.value.trim();
  if (!trimmedName) {
    refs.scenarioMessage.textContent = "场景名称不能为空。";
    refs.scenarioMessage.style.borderColor = "#d39191";
    refs.scenarioMessage.style.background = "#fff2f2";
    return;
  }
  if (trimmedName === target.name) {
    refs.scenarioMessage.textContent = "场景名称未变化。";
    refs.scenarioMessage.style.borderColor = "#8fb48d";
    refs.scenarioMessage.style.background = "#f1fbf1";
    return;
  }
  const duplicatedName = project.scenarios.some((scenario) => (
    scenario.id !== target.id && scenario.name === trimmedName
  ));
  if (duplicatedName) {
    refs.scenarioMessage.textContent = "场景名称重复，请换一个名称。";
    refs.scenarioMessage.style.borderColor = "#d39191";
    refs.scenarioMessage.style.background = "#fff2f2";
    return;
  }
  const oldName = target.name;
  target.name = trimmedName;
  target.updatedAt = new Date().toISOString();
  refs.scenarioMessage.textContent = `场景“${oldName}”已重命名为“${target.name}”。`;
  refs.scenarioMessage.style.borderColor = "#8fb48d";
  refs.scenarioMessage.style.background = "#f1fbf1";
  renderAll();
}

function deleteActiveScenario() {
  const project = getActiveProject();
  if (!project) return;
  ensureScenarioMetadata(project);
  const target = getActiveScenario(project);
  if (!target) return;
  if (target.isBaseline) {
    refs.scenarioMessage.textContent = "基准场景不能删除。";
    refs.scenarioMessage.style.borderColor = "#d39191";
    refs.scenarioMessage.style.background = "#fff2f2";
    return;
  }
  if (target.locked) {
    refs.scenarioMessage.textContent = "当前场景已锁定，无法删除。";
    refs.scenarioMessage.style.borderColor = "#d39191";
    refs.scenarioMessage.style.background = "#fff2f2";
    return;
  }
  project.scenarios = project.scenarios.filter((scenario) => scenario.id !== target.id);
  delete project.resultsByScenario[target.id];
  const fallback = getBaselineScenario(project) || project.scenarios[0] || null;
  project.activeScenarioId = fallback?.id || null;
  project.statuses["compare-page"] = countScenariosForCompare(project) >= 2 ? "completed" : "in_progress";
  refs.scenarioMessage.textContent = `场景“${target.name}”已删除。`;
  refs.scenarioMessage.style.borderColor = "#8fb48d";
  refs.scenarioMessage.style.background = "#f1fbf1";
  renderAll();
}

function toggleBaselineLock() {
  const project = getActiveProject();
  if (!project) return;
  ensureScenarioMetadata(project);
  const baseline = getBaselineScenario(project);
  if (!baseline) return;
  baseline.locked = !baseline.locked;
  baseline.updatedAt = new Date().toISOString();
  refs.scenarioMessage.textContent = baseline.locked ? "基准场景已锁定。" : "基准场景已解锁。";
  refs.scenarioMessage.style.borderColor = "#8fb48d";
  refs.scenarioMessage.style.background = "#f1fbf1";
  renderAll();
}

function parseBatchValue(spec, rawText) {
  const num = Number(rawText);
  if (!Number.isFinite(num)) return null;
  if (spec.type === "percent") {
    return clamp(num / 100, spec.min / 100, spec.max / 100);
  }
  return clamp(num, spec.min, spec.max);
}

function applyBatchParameter() {
  const project = getActiveProject();
  if (!project) return;
  ensureScenarioMetadata(project);
  const key = refs.batchParamKey.value;
  const spec = BATCH_PARAM_SPECS[key];
  if (!spec) return;
  const parsed = parseBatchValue(spec, refs.batchParamValue.value.trim());
  if (parsed === null) {
    refs.scenarioMessage.textContent = "批量参数值无效，请输入数字。";
    refs.scenarioMessage.style.borderColor = "#d39191";
    refs.scenarioMessage.style.background = "#fff2f2";
    return;
  }
  const scope = refs.batchTargetScope.value;
  let updated = 0;
  let skippedBaseline = 0;
  let skippedLocked = 0;
  let skippedSpace = 0;
  for (const scenario of project.scenarios) {
    if (scope === "non_baseline" && scenario.isBaseline) {
      skippedBaseline += 1;
      continue;
    }
    if (scenario.locked) {
      skippedLocked += 1;
      continue;
    }
    if (key === "carbonPrice" && project.siteType !== "offshore") {
      scenario.config.carbonPrice = 0;
      scenario.config.carbonEnabled = false;
      scenario.config.carbonRealizeRatio = 0;
    } else if (key === "carbonRealizeRatio" && project.siteType !== "offshore") {
      scenario.config.carbonRealizeRatio = 0;
    } else if (ENV_VALUE_RATIO_KEYS.has(key)) {
      const nextConfig = { ...scenario.config, [key]: parsed };
      if (project.siteType !== "offshore") {
        nextConfig.carbonRealizeRatio = 0;
      }
      const allocation = getEnvValueAllocation(project, nextConfig);
      if (allocation.totalRatio > 1 + 0.000001) {
        skippedSpace += 1;
        continue;
      }
      scenario.config[key] = parsed;
    } else {
      scenario.config[key] = parsed;
    }
    scenario.updatedAt = new Date().toISOString();
    updated += 1;
  }

  if (!updated) {
    refs.scenarioMessage.textContent = "没有可更新的场景（可能被锁定或范围过滤）。";
    refs.scenarioMessage.style.borderColor = "#d39191";
    refs.scenarioMessage.style.background = "#fff2f2";
    return;
  }

  markDownstreamStale(project, "scenario-page");
  refs.scenarioMessage.textContent = `批量更新完成：${updated} 个场景已更新，跳过基准 ${skippedBaseline} 个，跳过锁定 ${skippedLocked} 个。`;
  if (skippedSpace) {
    refs.scenarioMessage.textContent += ` 另有 ${skippedSpace} 个场景因环境价值兑现空间超过100%未更新。`;
  }
  refs.scenarioMessage.style.borderColor = "#8fb48d";
  refs.scenarioMessage.style.background = "#f1fbf1";
  renderAll();
}

function syncScenarioFieldLocks() {
  const project = getActiveProject();
  const scenario = project ? getActiveScenario(project) : null;
  const locked = Boolean(scenario?.locked);
  setScenarioFormDisabled(locked);
  const canUseStorageRevenue = Boolean(project?.hasStorage);
  if (refs.scenarioStorageRevenueSection) {
    refs.scenarioStorageRevenueSection.hidden = !canUseStorageRevenue;
  }

  const mechanismEnabled = document.querySelector("#mechanism-enabled").value === "yes";
  const mechanismFields = [
    "#mechanism-ratio",
    "#mechanism-price",
    "#mechanism-start-ym",
    "#mechanism-end-ym"
  ];
  mechanismFields.forEach((selector) => {
    const target = document.querySelector(selector);
    target.disabled = locked || !mechanismEnabled;
  });

  syncEnvValueControls(project, scenario, locked);
  syncLtPricingControls(project, scenario, locked);
  syncFeeConfigControls(project, scenario, locked);
  [
    refs.storageArbitragePrice,
    refs.storageCapacityCompPrice,
    refs.storageAncillaryRevenuePrice,
    refs.storageOtherRevenuePrice
  ].forEach((field) => {
    if (!field) return;
    field.disabled = locked || !canUseStorageRevenue;
    if (!canUseStorageRevenue) {
      field.value = "0";
    }
  });
  refs.scenarioLockHint.textContent = locked
    ? "当前为锁定场景，已禁止编辑。可切换场景或解锁基准场景。"
    : "当前场景可编辑。";
  updateMarketTradeEnergyDisplay(project, scenario);
}

function renderScenarioForm() {
  const project = getActiveProject();
  renderScenarioManager();
  if (!project) return;
  ensureScenarioMetadata(project);
  const scenario = getActiveScenario(project);
  if (!scenario) return;
  loadScenarioToForm(project, scenario);
  syncScenarioFieldLocks();
}

function saveScenarioFromForm() {
  const project = getActiveProject();
  if (!project) return;
  ensureScenarioMetadata(project);

  let scenario = getActiveScenario(project);
  if (!scenario) return;
  if (scenario.locked) {
    refs.scenarioMessage.textContent = "当前场景已锁定，不能保存修改。";
    refs.scenarioMessage.style.borderColor = "#d39191";
    refs.scenarioMessage.style.background = "#fff2f2";
    return;
  }
  const scenarioName = document.querySelector("#scenario-name").value.trim() || "基准场景";
  const duplicatedName = project.scenarios.find((item) => item.id !== scenario.id && item.name === scenarioName);
  if (duplicatedName) {
    refs.scenarioMessage.textContent = "场景名称重复，请修改后再保存。";
    refs.scenarioMessage.style.borderColor = "#d39191";
    refs.scenarioMessage.style.background = "#fff2f2";
    return;
  }
  scenario.name = scenarioName;

  const mechanismEnabled = document.querySelector("#mechanism-enabled").value === "yes";
  const mechanismStartYm = document.querySelector("#mechanism-start-ym").value;
  const mechanismEndYm = document.querySelector("#mechanism-end-ym").value;
  if (mechanismEnabled) {
    const startSerial = monthSerial(mechanismStartYm);
    const endSerial = monthSerial(mechanismEndYm);
    if (startSerial === null || endSerial === null || endSerial < startSerial) {
      refs.scenarioMessage.textContent = "机制执行年月无效，请检查起止区间。";
      refs.scenarioMessage.style.borderColor = "#d39191";
      refs.scenarioMessage.style.background = "#fff2f2";
      return;
    }
  }
  const ltPricingMode = LT_PRICING_MODE_SET.has(refs.ltPricingMode?.value) ? refs.ltPricingMode.value : "auto";
  const ltManualPricesByYear = sanitizeLtManualPricesByYear(scenario.config?.ltManualPricesByYear || {}, project);
  if (ltPricingMode === "manual") {
    const completeness = getLtManualCompleteness(project, { ltManualPricesByYear });
    if (completeness.complete !== completeness.total) {
      refs.scenarioMessage.textContent = `逐年损益值不完整，当前 ${completeness.complete}/${completeness.total} 年。请导入完整测算周期后再保存。`;
      refs.scenarioMessage.style.borderColor = "#d39191";
      refs.scenarioMessage.style.background = "#fff2f2";
      return;
    }
  }
  const envValueMode = ENV_VALUE_MODE_SET.has(refs.envValueMode?.value) ? refs.envValueMode.value : "global";
  const envManualValuesByYear = sanitizeEnvManualValuesByYear(scenario.config?.envManualValuesByYear || {}, project);
  const envAllocationDraft = readEnvValueAllocationDraft(project);
  if (envValueMode === "manual") {
    const completeness = getEnvManualCompleteness(project, { envManualValuesByYear });
    if (completeness.complete !== completeness.total) {
      refs.scenarioMessage.textContent = `逐年环境价值兑现配置不完整，当前 ${completeness.complete}/${completeness.total} 年。请导入完整测算周期后再保存。`;
      refs.scenarioMessage.style.borderColor = "#d39191";
      refs.scenarioMessage.style.background = "#fff2f2";
      return;
    }
  } else if (
    envAllocationDraft.greenCertRatio < 0
    || envAllocationDraft.greenPremiumRatio < 0
    || envAllocationDraft.carbonRatio < 0
    || envAllocationDraft.totalRatio > 1 + 0.000001
  ) {
    refs.scenarioMessage.textContent = `环境价值兑现空间分配无效：绿证、绿电溢价、碳收益合计为 ${asPercent(envAllocationDraft.totalRatio)}，不能超过 100.0%。`;
    refs.scenarioMessage.style.borderColor = "#d39191";
    refs.scenarioMessage.style.background = "#fff2f2";
    return;
  }
  const feeConfigMode = FEE_CONFIG_MODE_SET.has(refs.feeConfigMode?.value) ? refs.feeConfigMode.value : "global";
  const feeManualValuesByYear = sanitizeFeeManualValuesByYear(scenario.config?.feeManualValuesByYear || {}, project);
  if (feeConfigMode === "manual") {
    const completeness = getFeeManualCompleteness(project, { feeManualValuesByYear });
    if (completeness.complete !== completeness.total) {
      refs.scenarioMessage.textContent = `逐年扣费收益配置不完整，当前 ${completeness.complete}/${completeness.total} 年。请导入完整测算周期后再保存。`;
      refs.scenarioMessage.style.borderColor = "#d39191";
      refs.scenarioMessage.style.background = "#fff2f2";
      return;
    }
  }

  const config = scenarioForm.buildScenarioConfigFromForm({
    project,
    refs,
    querySelector: (selector) => document.querySelector(selector),
    clamp,
    ltPricingMode,
    ltManualPricesByYear,
    envValueMode,
    envManualValuesByYear,
    envAllocationDraft,
    feeConfigMode,
    feeManualValuesByYear
  });
  scenario.config = config;
  scenario.updatedAt = new Date().toISOString();

  project.statuses["scenario-page"] = "completed";
  markDownstreamStale(project, "scenario-page");
  refs.scenarioMessage.textContent = `场景“${scenario.name}”已保存。`;
  refs.scenarioMessage.style.borderColor = "#8fb48d";
  refs.scenarioMessage.style.background = "#f1fbf1";
  renderAll();
}

function ltPnlPriceForYear(config, yearIndex) {
  return revenueRules.ltPnlPriceForYear(config, yearIndex);
}

function tradeStrategyPnlPriceForYear(config, yearIndex, year) {
  return revenueRules.tradeStrategyPnlPriceForYear(config, yearIndex, year);
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

function calculateScenarioResult(project, scenario, run) {
  return revenueCalculator.calculateScenarioResult(project, scenario, run, {
    getHourlyEnergyForCalculation,
    hourIndexToTimestamp
  });
}

function runCalculation() {
  const project = getActiveProject();
  if (!project) return;
  const scenario = getActiveScenario(project);
  const run = getActiveRun(project);
  if (!scenario) {
    setTopMeta("请先在全口径收入配置页保存至少一个配置方案。");
    return;
  }
  if (!run) {
    setTopMeta("请先在电价预测工作台生成并生效一个电价版本。");
    return;
  }
  if (getLtPricingMode(scenario.config) === "manual") {
    const completeness = getLtManualCompleteness(project, scenario.config);
    if (completeness.complete !== completeness.total) {
      setTopMeta(`请先导入完整的逐年交易策略损益值（当前 ${completeness.complete}/${completeness.total} 年）。`);
      return;
    }
  }
  if (getEnvValueMode(scenario.config) === "manual") {
    const completeness = getEnvManualCompleteness(project, scenario.config);
    if (completeness.complete !== completeness.total) {
      setTopMeta(`请先导入完整的逐年环境价值兑现配置（当前 ${completeness.complete}/${completeness.total} 年）。`);
      return;
    }
  }
  if (getFeeConfigMode(scenario.config) === "manual") {
    const completeness = getFeeManualCompleteness(project, scenario.config);
    if (completeness.complete !== completeness.total) {
      setTopMeta(`请先导入完整的逐年扣费收益配置（当前 ${completeness.complete}/${completeness.total} 年）。`);
      return;
    }
  }

  const energyPrepared = ensureHourlyEnergyForCalculation(project);
  const result = calculateScenarioResult(project, scenario, run);
  if (result.missingYears.length) {
    const pieces = [];
    if (result.missingEnergyYears.length) {
      pieces.push(`缺失上网电量曲线：${formatYearListCompact(result.missingEnergyYears)}`);
    }
    if (result.missingPriceYears.length) {
      pieces.push(`缺失生效电价曲线：${formatYearListCompact(result.missingPriceYears)}`);
    }
    setTopMeta(`测算失败：${pieces.join("；")}`);
    if (energyPrepared.changed) {
      renderAll();
    }
    return;
  }

  project.resultsByScenario[scenario.id] = result;
  project.statuses["results-page"] = "completed";
  project.statuses["compare-page"] = countScenariosForCompare(project) >= 2 ? "completed" : "in_progress";
  if (energyPrepared.changed) {
    const fillText = energyPrepared.defaultAnnualFilled ? "补齐默认逐年总量并" : "";
    setTopMeta(`已自动${fillText}调用省份典型曲线生成 ${energyPrepared.completed}/${energyPrepared.total} 年上网电量，并完成测算。`);
  }
  renderAll();
}

function setResultReportView(view) {
  const nextView = RESULT_REPORT_VIEW_SET.has(view) ? view : "annual";
  activeResultReportView = nextView;
  refs.resultReportTabs?.forEach((button) => {
    const isActive = button.dataset.resultView === nextView;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  refs.resultReportPanes?.forEach((pane) => {
    const isActive = pane.dataset.resultPane === nextView;
    pane.hidden = !isActive;
    pane.classList.toggle("active", isActive);
  });
  queueResultChartsResize();
}

function resultChartTokens() {
  return resultCharts.buildResultChartTokens(compareThemeTokens());
}

function getResultChartNode(key) {
  const nodeMap = {
    annualStack: refs.resultAnnualStackChart,
    pricePath: refs.resultPricePathChart,
    waterfall: refs.resultWaterfallChart,
    contribution: refs.resultContributionChart
  };
  return nodeMap[key] || null;
}

function ensureResultChart(key) {
  const node = getResultChartNode(key);
  if (!node || !window.echarts) return null;
  const existing = resultChartInstances[key];
  if (existing && !existing.isDisposed()) return existing;
  const chart = window.echarts.init(node, null, { renderer: "canvas" });
  resultChartInstances[key] = chart;
  if (!resultChartsResizeBound && typeof window !== "undefined") {
    window.addEventListener("resize", () => {
      Object.values(resultChartInstances).forEach((instance) => {
        if (instance && !instance.isDisposed()) instance.resize();
      });
    });
    resultChartsResizeBound = true;
  }
  return chart;
}

function queueResultChartsResize() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      Object.values(resultChartInstances).forEach((instance) => {
        if (instance && !instance.isDisposed()) instance.resize();
      });
    });
  });
}

function renderResultChartsPlaceholder(message) {
  if (resolveVisiblePageId(appState.activePage) !== "results-page") return;
  const tokens = resultChartTokens();
  const option = resultCharts.buildResultPlaceholderOption(message, tokens);
  ["annualStack", "pricePath", "waterfall", "contribution"].forEach((key) => {
    const chart = ensureResultChart(key);
    if (!chart) return;
    chart.clear();
    chart.setOption(option, true);
  });
}

function renderResultCharts(project, scenario, result) {
  if (resolveVisiblePageId(appState.activePage) !== "results-page") return;
  const rows = result?.annualRows || [];
  if (!rows.length) {
    renderResultChartsPlaceholder("请先发起基准测算");
    return;
  }

  const tokens = resultChartTokens();
  const chartData = resultReport.buildResultChartData(result, scenario?.config || {});
  const options = resultCharts.buildResultChartOptions(chartData, tokens, {
    yearInterval: scenarioCharts.scenarioVisualYearInterval(rows)
  });
  Object.entries(options).forEach(([key, option]) => {
    const chart = ensureResultChart(key);
    if (chart) chart.setOption(option, true);
  });

  queueResultChartsResize();
}

function resetResultDom() {
  if (refs.resultMetricGrid) refs.resultMetricGrid.innerHTML = "";
  if (refs.resultInsightList) refs.resultInsightList.innerHTML = "";
  if (refs.resultAssumptionList) refs.resultAssumptionList.innerHTML = "";
  if (refs.annualResultBody) refs.annualResultBody.innerHTML = "";
  if (refs.hourlyResultBody) refs.hourlyResultBody.innerHTML = "";
  if (refs.hourlyPreviewHint) refs.hourlyPreviewHint.textContent = "等待测算";
}

function renderResults() {
  const project = getActiveProject();
  resetResultDom();
  setResultReportView(activeResultReportView);
  const scenario = project ? getActiveScenario(project) : null;
  updatePrintReportHeader(project, scenario);
  const result = project ? project.resultsByScenario[scenario?.id || ""] : null;
  const cfg = scenario?.config || {};
  const view = resultPage.buildResultPageViewModel({
    project,
    scenario,
    result,
    summaryData: result ? resultReport.buildResultSummaryData(result) : null,
    labels: {
      projectName: project?.name || "-",
      scenarioName: scenario?.name || "-",
      periodText: project ? getForecastPeriodDisplayRange(project) : "-",
      assetTypeLabel: project ? getAssetTypeLabel(project.assetType) : "-",
      siteTypeLabel: project ? getSiteTypeLabel(project.siteType) : "-",
      storageText: project ? getStorageConfigText(project) : "-"
    },
    envValueMode: getEnvValueMode(cfg),
    feeConfigMode: getFeeConfigMode(cfg)
  });

  if (refs.resultReportMeta && view.metaHtml) refs.resultReportMeta.innerHTML = view.metaHtml;
  if (refs.resultExecutiveSummary && view.executiveSummary) refs.resultExecutiveSummary.textContent = view.executiveSummary;
  if (refs.resultMetricGrid && view.metricHtml) refs.resultMetricGrid.innerHTML = view.metricHtml;
  if (refs.resultInsightList && view.insightHtml) refs.resultInsightList.innerHTML = view.insightHtml;
  if (refs.resultAssumptionList && view.assumptionHtml) refs.resultAssumptionList.innerHTML = view.assumptionHtml;
  if (refs.annualResultBody && view.annualRowsHtml) refs.annualResultBody.innerHTML = view.annualRowsHtml;
  if (refs.hourlyResultBody && view.hourlyRowsHtml) refs.hourlyResultBody.innerHTML = view.hourlyRowsHtml;
  if (refs.hourlyPreviewHint && view.hourlyPreviewHint) refs.hourlyPreviewHint.textContent = view.hourlyPreviewHint;
  if (view.chartPlaceholder) {
    renderResultChartsPlaceholder(view.chartPlaceholder);
    return;
  }
  renderResultCharts(project, scenario, result);
}

function renderCompare() {
  renderCompareWorkspaceState();
  const project = getActiveProject();
  comparePage.resetComparePageState({
    refs,
    setCompareMetric,
    syncCompareSensitivityControls
  });
  if (!project) {
    comparePage.renderCompareNoProjectState({
      refs,
      renderPlaceholder: renderCompareChartPlaceholder
    });
    return;
  }
  ensureScenarioMetadata(project);
  const available = project.scenarios
    .map((scenario) => ({
      scenario,
      result: project.resultsByScenario[scenario.id]
    }))
    .filter((item) => item.result);
  const comparePeriod = getForecastPeriodDisplayRange(project);
  setCompareMetric(refs.compareMetricPeriod, comparePeriod);
  setCompareMetric(refs.compareMetricCompareCount, `${available.length} 个`, available.length ? "已完成测算" : "等待测算");
  setCompareMetric(refs.compareMetricScenarioCount, `${available.length} 个`, available.length >= 2 ? "可横向对比" : "至少 2 个方案");
  if (!available.length) {
    comparePage.renderCompareNoResultsState({
      refs,
      renderPlaceholder: renderCompareChartPlaceholder
    });
    return;
  }

  const baseline = available.find((item) => item.scenario.isBaseline) || available[0];
  const baselineFirst = baseline.result.annualRows.find((row) => row.energyMwh > 0) || baseline.result.annualRows[0];
  const baselineRevenueWan = baselineFirst ? baselineFirst.fullRevenue / 10000 : 0;
  const baselineCountLabel = available.length >= 2 ? `${available.length} 个方案已纳入对比` : "当前仅基准方案已测算";
  if (refs.compareBaselineLabel) refs.compareBaselineLabel.textContent = `基准：${baseline.scenario.name}`;
  if (refs.compareScenarioLabel) refs.compareScenarioLabel.textContent = baselineCountLabel;
  setCompareMetric(refs.compareMetricBaselineScenario, baseline.scenario.name, "当前基准方案");
  setCompareMetric(refs.compareMetricBaselineRevenue, `${asNum(baselineRevenueWan, 1)} 万元`, `首年总收益 / 周期 ${comparePeriod}`);

  syncCompareSensitivityControls();
  const allSensitivityFactors = buildCompareSensitivityFactors(baselineFirst, baselineRevenueWan, compareSensitivitySettings);
  const allFactorKeys = allSensitivityFactors.map((factor) => factor.key);
  if (!compareSensitivitySettings.selectedKeys.length) {
    compareSensitivitySettings.selectedKeys = allFactorKeys;
  } else {
    compareSensitivitySettings.selectedKeys = compareSensitivitySettings.selectedKeys.filter((key) => allFactorKeys.includes(key));
    if (!compareSensitivitySettings.selectedKeys.length) {
      compareSensitivitySettings.selectedKeys = allFactorKeys;
    }
  }
  const selectedFactorSet = new Set(compareSensitivitySettings.selectedKeys);
  const sensitivityFactors = allSensitivityFactors.filter((factor) => selectedFactorSet.has(factor.key));
  if (!activeSensitivityFactorKey || !sensitivityFactors.some((factor) => factor.key === activeSensitivityFactorKey)) {
    activeSensitivityFactorKey = sensitivityFactors[0]?.key || "";
  }
  setCompareMetric(
    refs.compareMetricSensitiveFactors,
    `${sensitivityFactors.length} 项`,
    sensitivityFactors[0] ? `最高敏感：${sensitivityFactors[0].name}` : "等待基准结果"
  );
  if (refs.compareSensitivityMessage) {
    refs.compareSensitivityMessage.textContent = `基于基准方案“${baseline.scenario.name}”的首年总收益 ${asCompactMoney(baselineFirst.fullRevenue)}，按 ±${compareSensitivitySettings.rangePercent}% / ${compareSensitivitySettings.stepPercent}% 步长，对 ${sensitivityFactors.length} 个已启用变量做扰动。`;
  }
  renderSensitivityTornadoChart(sensitivityFactors, baselineRevenueWan);
  renderSensitivityFactorList(allSensitivityFactors, sensitivityFactors);
  renderSensitivityResponseChart(sensitivityFactors, baselineRevenueWan);
  renderSensitivityTable(sensitivityFactors);

  const bestScenario = available.reduce((best, current) => {
    if (!best) return current;
    return current.result.totalFullRevenue > best.result.totalFullRevenue ? current : best;
  }, null);
  const maxGapWan = available.reduce((maxValue, item) => {
    const gap = Math.abs(item.result.totalFullRevenue - baseline.result.totalFullRevenue) / 10000;
    return Math.max(maxValue, gap);
  }, 0);
  setCompareMetric(refs.compareMetricBestScenario, bestScenario?.scenario?.name || "-", bestScenario ? `周期总收益 ${asCompactMoney(bestScenario.result.totalFullRevenue)}` : "");
  setCompareMetric(refs.compareMetricMaxGap, `${asNum(maxGapWan, 1)} 万元`, `相对 ${baseline.scenario.name}`);
  if (refs.compareScenarioMessage) {
    refs.compareScenarioMessage.textContent = available.length >= 2
      ? `当前已纳入 ${available.length} 个已测算方案，方案名称沿用全口径收入配置页中的命名；以下对比均以“${baseline.scenario.name}”作为基准。`
      : `当前仅“${baseline.scenario.name}”完成测算。可在全口径收入配置页新增并命名方案，完成测算后自动加入对比。`;
  }

  if (!activeCompareScenarioId || !available.some((item) => item.scenario.id === activeCompareScenarioId)) {
    const bestNonBaseline = available
      .filter((item) => item.scenario.id !== baseline.scenario.id)
      .sort((a, b) => b.result.totalFullRevenue - a.result.totalFullRevenue)[0];
    activeCompareScenarioId = bestNonBaseline?.scenario?.id || baseline.scenario.id;
  }
  const focusScenario = available.find((item) => item.scenario.id === activeCompareScenarioId) || baseline;
  renderScenarioRankingChart(available, baseline);
  renderCompareTrendChart(available);
  renderScenarioFocusList(available, baseline);
  renderScenarioBridgeChart(focusScenario, baseline);
  if (refs.compareBody) {
    refs.compareBody.innerHTML = comparePage.buildCompareTableRowsHtml({
      available,
      baseline,
      detectTopDriver: compareAnalysis.detectTopDriver,
      asCompactMoney
    });
  }
  queueCompareChartsResize();
}

function toCsvLine(values) {
  return csvUtils.toCsvLine(values);
}

function downloadCsv(filename, rows) {
  const content = rows.map((row) => toCsvLine(row)).join("\n");
  const blob = new Blob([`\ufeff${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sanitizeExportFilenamePart(value) {
  return exportBuilders.sanitizeExportFilenamePart(value);
}

const MANUAL_SCENARIO_IMPORTS = Object.freeze({
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

function setManualScenarioStatus(config, text) {
  const node = refs[config.statusRef];
  if (node) node.textContent = text;
}

function setScenarioImportMessage(text, tone) {
  refs.scenarioMessage.textContent = text;
  refs.scenarioMessage.style.borderColor = tone === "success" ? "#8fb48d" : "#d39191";
  refs.scenarioMessage.style.background = tone === "success" ? "#f1fbf1" : "#fff2f2";
}

function exportManualScenarioTemplate(kind) {
  const config = MANUAL_SCENARIO_IMPORTS[kind];
  const project = getActiveProject();
  if (!project) {
    setTopMeta("请先创建或选择项目。", "warn");
    return;
  }
  const scenario = getActiveScenario(project);
  if (!scenario) return;
  downloadCsv(config.filename(project, scenario), config.rows(project));
  setManualScenarioStatus(config, config.exportedMessage);
}

async function importManualScenarioTemplate(kind) {
  const config = MANUAL_SCENARIO_IMPORTS[kind];
  const project = getActiveProject();
  const scenario = project ? getActiveScenario(project) : null;
  if (!project || !scenario) {
    setTopMeta("请先创建或选择项目。", "warn");
    return;
  }
  if (scenario.locked) {
    setScenarioImportMessage(config.lockedMessage, "error");
    return;
  }
  const file = refs[config.fileInputRef]?.files?.[0];
  if (!file) {
    setManualScenarioStatus(config, "请先选择CSV或Excel文件。");
    return;
  }
  try {
    const { text } = await readSpreadsheetToCsv(file);
    const parsed = config.parse(text, project);
    if (!parsed.ok) {
      setManualScenarioStatus(config, parsed.message);
      setScenarioImportMessage(parsed.message, "error");
      return;
    }
    scenario.config[config.modeKey] = "manual";
    scenario.config[config.valuesKey] = parsed[config.parsedKey];
    scenario.updatedAt = new Date().toISOString();
    project.statuses["scenario-page"] = "in_progress";
    markDownstreamStale(project, "scenario-page");
    setScenarioImportMessage(config.successMessage(scenario), "success");
    renderAll();
    schedulePersistAppData();
  } catch (error) {
    const message = normalizeUserFacingError(error);
    setManualScenarioStatus(config, message);
    setScenarioImportMessage(message, "error");
  }
}

function syncHistoryExportButtons() {
  const buttonMap = {
    monthTrend: refs.historyExportMonthTrendButton,
    typicalDay: refs.historyExportTypicalDayButton,
    distribution: refs.historyExportDistributionButton,
    heatmap: refs.historyExportHeatmapButton,
    boxplot: refs.historyExportBoxplotButton
  };
  Object.entries(buttonMap).forEach(([key, button]) => {
    if (!button) return;
    const enabled = Array.isArray(historyChartExportPayloads[key]?.rows) && historyChartExportPayloads[key].rows.length > 1;
    button.disabled = !enabled;
    button.setAttribute("aria-disabled", String(!enabled));
  });
}

function resetHistoryExportPayloads() {
  Object.keys(historyChartExportPayloads).forEach((key) => {
    historyChartExportPayloads[key] = null;
  });
  syncHistoryExportButtons();
}

function setHistoryExportPayload(key, filename, rows) {
  historyChartExportPayloads[key] = {
    filename,
    rows
  };
}

function exportHistoryChartData(key) {
  const payload = historyChartExportPayloads[key];
  if (!payload || !Array.isArray(payload.rows) || payload.rows.length <= 1) return;
  downloadCsv(payload.filename, payload.rows);
}

function exportAnnualCsv() {
  const project = getActiveProject();
  if (!project) return;
  const scenario = getActiveScenario(project);
  const result = project.resultsByScenario[scenario?.id || ""];
  if (!result) return;
  downloadCsv(
    exportBuilders.buildAnnualResultExportFilename(project, scenario),
    exportBuilders.buildAnnualResultExportRows(result)
  );
}

function exportHourlyCsv() {
  const project = getActiveProject();
  if (!project) return;
  const scenario = getActiveScenario(project);
  const result = project.resultsByScenario[scenario?.id || ""];
  if (!result) return;
  downloadCsv(
    exportBuilders.buildHourlyResultExportFilename(project, scenario),
    exportBuilders.buildHourlyResultExportRows(result)
  );
}

function printScenarioReport() {
  const project = getActiveProject();
  if (project) ensureScenarioMetadata(project);
  const scenario = project ? getActiveScenario(project) : null;
  const result = project ? project.resultsByScenario[scenario?.id || ""] : null;
  resultPrint.printScenarioReport({
    project,
    scenario,
    result,
    appState,
    refs,
    documentRef: typeof document !== "undefined" ? document : null,
    windowRef: typeof window !== "undefined" ? window : null,
    resultChartInstances,
    setTopMeta,
    updatePrintReportHeader,
    setActivePage,
    renderAll
  });
}

function renderAll() {
  syncProjectProvinceScopedState();
  reconcileAllProjectStatuses();
  applySidebarGroups();
  applyAuthLayout();
  refreshNavigationAvailability();
  syncCreateProjectFormWithActiveProject();
  renderCreateWorkspaceState();
  renderStatuses();
  renderTopbar();
  renderSettings();
  renderHome();
  renderProjects();
  renderEnergyWorkspaceState();
  renderEnergySummary();
  renderEnergyCurveChart();
  renderHistoryPrices();
  renderForecastRuns();
  renderScenarioPageSummary();
  renderScenarioForm();
  renderProvinceLibrary();
  renderScenarioVisualization();
  renderResults();
  renderCompareWorkspaceState();
  renderCompare();
  if (suppressNextRenderPersist) {
    suppressNextRenderPersist = false;
  } else {
    schedulePersistAppData();
  }
}

function setHistoryDatePanelOpen(isOpen) {
  if (!refs.historyDatePanel || !refs.historyDateToggle) return;
  refs.historyDatePanel.hidden = !isOpen;
  refs.historyDateToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function bindBenchmarkRangeDrag() {
  if (!refs.benchmarkRangeSlider) return;

  const onPointerMove = (event) => {
    updateBenchmarkRangeDrag(event.clientY, false);
  };

  const onPointerUp = (event) => {
    if (benchmarkRangeDragHandle) {
      updateBenchmarkRangeDrag(event.clientY, true);
    }
    stopBenchmarkRangeDrag();
    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }
  };

  const beginDrag = (handleType, event) => {
    event.preventDefault();
    startBenchmarkRangeDrag(handleType, event.clientY);
    if (typeof window !== "undefined") {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    }
  };

  if (refs.benchmarkRangeHandleMax) {
    refs.benchmarkRangeHandleMax.addEventListener("pointerdown", (event) => {
      beginDrag("max", event);
    });
  }

  if (refs.benchmarkRangeHandleMin) {
    refs.benchmarkRangeHandleMin.addEventListener("pointerdown", (event) => {
      beginDrag("min", event);
    });
  }

  refs.benchmarkRangeSlider.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target === refs.benchmarkRangeHandleMax || target === refs.benchmarkRangeHandleMin) return;
    const value = benchmarkValueFromClientY(event.clientY);
    if (!Number.isFinite(value)) return;
    const currentMin = Number.isFinite(appState.benchmarkMap.rangeMin)
      ? appState.benchmarkMap.rangeMin
      : benchmarkRangeSliderBounds.min;
    const currentMax = Number.isFinite(appState.benchmarkMap.rangeMax)
      ? appState.benchmarkMap.rangeMax
      : benchmarkRangeSliderBounds.max;
    const handleType = Math.abs(value - currentMax) <= Math.abs(value - currentMin) ? "max" : "min";
    beginDrag(handleType, event);
  });
}

function bindShellEvents() {
  shellEvents.bindAppShellEvents({
    refs,
    documentRef: typeof document !== "undefined" ? document : null,
    windowRef: typeof window !== "undefined" ? window : null,
    appState,
    benchmarkMapZoomStep: BENCHMARK_MAP_ZOOM_STEP,
    scenarioVisualCharts,
    chartRefs: {
      energyAnnual: {
        get: () => energyAnnualChart,
        set: (chart) => {
          energyAnnualChart = chart;
        }
      },
      energyCurve: {
        get: () => energyCurveChart,
        set: (chart) => {
          energyCurveChart = chart;
        }
      },
      benchmarkMap: {
        get: () => benchmarkMapChart,
        set: (chart) => {
          benchmarkMapChart = chart;
        }
      }
    },
    actions: {
      toggleTheme,
      renderBenchmarkMap,
      schedulePersistAppData,
      adjustBenchmarkMapZoom,
      resetBenchmarkZoom: resetBenchmarkMapZoom,
      bindBenchmarkRangeDrag,
      togglePageHelp,
      goToOverviewSlide,
      openOverviewPolicyDetail,
      openLoginModal,
      toggleSidebarGroup,
      toggleAccountDropdown,
      setHistoryDatePanelOpen,
      handleAccountManage,
      handleAccountPassword,
      handleLogout,
      handleChangePassword,
      closeLoginModal,
      handleLoginSubmit,
      closeOverviewPolicyDetail,
      closeAccountDropdown,
      closePageHelp,
      stopOverviewAutoplay,
      disposeHistoryCharts,
      disposeCompareCharts,
      disposeResultCharts,
      persistAppDataNow,
      normalizeUserFacingError,
      setTopMeta
    }
  });
}

function bindPolicyHistoryEvents() {
  if (refs.policyFilterProvince) {
    refs.policyFilterProvince.addEventListener("change", () => {
      appState.policyFilters.provinceKey = refs.policyFilterProvince.value;
      renderPolicyPanel();
      schedulePersistAppData();
    });
  }
  if (refs.policyFilterRegion) {
    refs.policyFilterRegion.addEventListener("change", () => {
      appState.policyFilters.regionKey = refs.policyFilterRegion.value;
      renderPolicyPanel();
      schedulePersistAppData();
    });
  }
  if (refs.historyStartDate) {
    refs.historyStartDate.addEventListener("change", () => {
      const next = sanitizeHistoryAnalysis({
        ...appState.historyAnalysis,
        startDate: refs.historyStartDate.value
      });
      appState.historyAnalysis = next;
      renderHistoryPrices();
      schedulePersistAppData();
    });
  }
  if (refs.historyEndDate) {
    refs.historyEndDate.addEventListener("change", () => {
      const next = sanitizeHistoryAnalysis({
        ...appState.historyAnalysis,
        endDate: refs.historyEndDate.value
      });
      appState.historyAnalysis = next;
      renderHistoryPrices();
      schedulePersistAppData();
    });
  }
  if (refs.historyExportMonthTrendButton) {
    refs.historyExportMonthTrendButton.addEventListener("click", () => {
      exportHistoryChartData("monthTrend");
    });
  }
  if (refs.historyExportTypicalDayButton) {
    refs.historyExportTypicalDayButton.addEventListener("click", () => {
      exportHistoryChartData("typicalDay");
    });
  }
  if (refs.historyExportDistributionButton) {
    refs.historyExportDistributionButton.addEventListener("click", () => {
      exportHistoryChartData("distribution");
    });
  }
  if (refs.historyExportHeatmapButton) {
    refs.historyExportHeatmapButton.addEventListener("click", () => {
      exportHistoryChartData("heatmap");
    });
  }
  if (refs.historyExportBoxplotButton) {
    refs.historyExportBoxplotButton.addEventListener("click", () => {
      exportHistoryChartData("boxplot");
    });
  }
}

function bindNavigationEvents() {
  refs.navItems.forEach((item) => {
    item.addEventListener("click", () => setActivePage(item.dataset.page));
  });

  document.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => setActivePage(button.dataset.jump));
  });
  refs.resultReportTabs?.forEach((button) => {
    button.addEventListener("click", () => setResultReportView(button.dataset.resultView));
  });
  document.querySelectorAll(".result-disclosure").forEach((node) => {
    node.addEventListener("toggle", queueResultChartsResize);
  });
}

function bindCompareEvents() {
  if (Array.isArray(refs.compareTabButtons)) {
    refs.compareTabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const nextView = sanitizeCompareView(button.dataset.compareView);
        if (appState.compareView === nextView) return;
        appState.compareView = nextView;
        renderCompareWorkspaceState();
        queueCompareChartsResize();
        schedulePersistAppData();
      });
    });
  }
  if (refs.compareSensitivityFactorList) {
    refs.compareSensitivityFactorList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-sensitivity-factor]");
      if (!button) return;
      activeSensitivityFactorKey = button.dataset.sensitivityFactor || "";
      renderCompare();
    });
    refs.compareSensitivityFactorList.addEventListener("change", (event) => {
      const input = event.target.closest("[data-sensitivity-variable]");
      if (!input) return;
      const key = input.dataset.sensitivityVariable || "";
      const current = new Set(compareSensitivitySettings.selectedKeys);
      if (input.checked) {
        current.add(key);
      } else {
        current.delete(key);
      }
      compareSensitivitySettings.selectedKeys = Array.from(current);
      if (!compareSensitivitySettings.selectedKeys.includes(activeSensitivityFactorKey)) {
        activeSensitivityFactorKey = compareSensitivitySettings.selectedKeys[0] || "";
      }
      renderCompare();
    });
  }
  [
    refs.compareSensitivityRange,
    refs.compareSensitivityStep,
    refs.compareSensitivityScale,
    refs.compareSensitivityTopn
  ].forEach((control) => {
    if (!control) return;
    control.addEventListener("change", () => {
      compareSensitivitySettings.rangePercent = Number(refs.compareSensitivityRange?.value) || compareSensitivitySettings.rangePercent;
      compareSensitivitySettings.stepPercent = Number(refs.compareSensitivityStep?.value) || compareSensitivitySettings.stepPercent;
      compareSensitivitySettings.responseScalePercent = Number(refs.compareSensitivityScale?.value) || compareSensitivitySettings.responseScalePercent;
      compareSensitivitySettings.topN = refs.compareSensitivityTopn?.value === "all" ? "all" : Number(refs.compareSensitivityTopn?.value);
      sanitizeCompareSensitivitySettings();
      renderCompare();
    });
  });
  if (refs.compareScenarioFocusList) {
    refs.compareScenarioFocusList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-compare-focus-scenario]");
      if (!button) return;
      activeCompareScenarioId = button.dataset.compareFocusScenario || "";
      renderCompare();
    });
  }
}

function bindCreateEnergyEvents() {
  refs.createProjectForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createProjectFromForm({ targetPage: "create-page" });
  });
  if (refs.createHasStorage) {
    refs.createHasStorage.addEventListener("change", syncCreateStorageFieldsUi);
  }
  if (refs.createToEnergyButton) {
    refs.createToEnergyButton.addEventListener("click", () => {
      const project = getActiveProject();
      if (!project || !isProjectCreateCompleted(project)) {
        setTopMeta("请先完成并保存项目基础信息。");
        setCreateSaveMessage("请先保存基础信息，再进入结算电量配置。", "warn");
        return;
      }
      setActivePage("energy-page");
    });
  }
  if (refs.energyToHistoryButton) {
    refs.energyToHistoryButton.addEventListener("click", () => {
      const project = getActiveProject();
      const ready = project && hasEnergyHistoryEntryReadiness(project);
      if (!ready) {
        setEnergyImportMessage("请先完成全部预测年份的结算电量配置，再进入历史电价分析。", "warn");
        return;
      }
      setActivePage("history-page");
    });
  }

  if (refs.exportEnergyAnnualTemplateButton) {
    refs.exportEnergyAnnualTemplateButton.addEventListener("click", () => {
      exportEnergyTemplate("annual_hours");
    });
  }
  if (refs.importEnergyAnnualFileButton) {
    refs.importEnergyAnnualFileButton.addEventListener("click", () => {
      importEnergyFromFile("annual_hours", refs.energyAnnualFileInput);
    });
  }
  if (refs.exportEnergyTypicalTemplateButton) {
    refs.exportEnergyTypicalTemplateButton.addEventListener("click", () => {
      exportEnergyTemplate("typical_curve_8760");
    });
  }
  if (refs.importEnergyTypicalFileButton) {
    refs.importEnergyTypicalFileButton.addEventListener("click", () => {
      importEnergyFromFile("typical_curve_8760", refs.energyTypicalFileInput);
    });
  }
  if (refs.applyEnergyProvinceCurveButton) {
    refs.applyEnergyProvinceCurveButton.addEventListener("click", applyProvinceTypicalCurve);
  }
  if (Array.isArray(refs.energyStep2ChoiceButtons)) {
    refs.energyStep2ChoiceButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const nextChoice = sanitizeEnergyStep2Choice(button.dataset.energyStep2Choice);
        if (appState.energyStep2Choice === nextChoice) return;
        appState.energyStep2Choice = nextChoice;
        renderEnergyStep2ChoiceState();
        schedulePersistAppData();
      });
    });
  }
}

function bindForecastScenarioEvents() {
  refs.forecastRunForm.addEventListener("submit", (event) => {
    event.preventDefault();
    generateForecastRun();
  });
  refs.scenarioForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveScenarioFromForm();
  });
  refs.scenarioSelector.addEventListener("change", () => switchActiveScenario(refs.scenarioSelector.value));
  refs.scenarioQuickName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      renameActiveScenario();
    }
  });
  refs.duplicateScenarioButton.addEventListener("click", duplicateActiveScenario);
  refs.renameScenarioButton.addEventListener("click", renameActiveScenario);
  refs.deleteScenarioButton.addEventListener("click", deleteActiveScenario);
  refs.toggleBaselineLockButton.addEventListener("click", toggleBaselineLock);
  refs.applyBatchButton.addEventListener("click", applyBatchParameter);
  if (refs.ltPricingMode) {
    refs.ltPricingMode.addEventListener("change", () => {
      syncScenarioFieldLocks();
    });
  }
  if (refs.exportLtTemplateButton) {
    refs.exportLtTemplateButton.addEventListener("click", () => exportManualScenarioTemplate("lt"));
  }
  if (refs.importLtTemplateButton) {
    refs.importLtTemplateButton.addEventListener("click", () => importManualScenarioTemplate("lt"));
  }
  if (refs.envValueMode) {
    refs.envValueMode.addEventListener("change", () => {
      syncScenarioFieldLocks();
    });
  }
  if (refs.exportEnvTemplateButton) {
    refs.exportEnvTemplateButton.addEventListener("click", () => exportManualScenarioTemplate("env"));
  }
  if (refs.importEnvTemplateButton) {
    refs.importEnvTemplateButton.addEventListener("click", () => importManualScenarioTemplate("env"));
  }
  if (refs.feeConfigMode) {
    refs.feeConfigMode.addEventListener("change", () => {
      syncScenarioFieldLocks();
    });
  }
  if (refs.exportFeeTemplateButton) {
    refs.exportFeeTemplateButton.addEventListener("click", () => exportManualScenarioTemplate("fee"));
  }
  if (refs.importFeeTemplateButton) {
    refs.importFeeTemplateButton.addEventListener("click", () => importManualScenarioTemplate("fee"));
  }
  if (refs.provinceDefaultSelector) {
    refs.provinceDefaultSelector.addEventListener("change", () => {
      selectedProvinceDefaultKey = refs.provinceDefaultSelector.value;
      if (refs.provinceApplyMessage) {
        refs.provinceApplyMessage.textContent = "";
      }
      renderProvinceLibrary();
    });
  }
}

function bindScenarioDerivedFieldEvents() {
  document.querySelector("#mechanism-enabled").addEventListener("change", syncScenarioFieldLocks);
  [
    "#mechanism-ratio",
    "#mechanism-start-ym",
    "#mechanism-end-ym"
  ].forEach((selector) => {
    const field = document.querySelector(selector);
    if (!field) return;
    field.addEventListener("input", () => updateMarketTradeEnergyDisplay());
    field.addEventListener("change", () => updateMarketTradeEnergyDisplay());
  });
  document.querySelector("#carbon-enabled").addEventListener("change", syncScenarioFieldLocks);
  [
    "#green-cert-realize-ratio",
    "#green-premium-realize-ratio",
    "#carbon-realize-ratio"
  ].forEach((selector) => {
    const field = document.querySelector(selector);
    if (!field) return;
    field.addEventListener("input", () => updateEnvValueSpaceDisplay());
    field.addEventListener("change", () => updateEnvValueSpaceDisplay());
  });
}

function bindResultActionEvents() {
  refs.runCalcButton.addEventListener("click", runCalculation);
  refs.exportAnnualButton.addEventListener("click", exportAnnualCsv);
  refs.exportHourlyButton.addEventListener("click", exportHourlyCsv);
  refs.printReportButton.addEventListener("click", printScenarioReport);
}

function bindEvents() {
  bindShellEvents();
  bindPolicyHistoryEvents();
  bindNavigationEvents();
  bindCompareEvents();
  bindCreateEnergyEvents();
  bindForecastScenarioEvents();
  bindScenarioDerivedFieldEvents();
  bindResultActionEvents();
}

async function init() {
  initTheme();
  initAuth();
  initSidebarGroups();
  await loadAppDataFromStorage();
  resetPolicyFiltersToDefault();
  const claimedLegacy = claimLegacyProjectsForCurrentAccount();
  const seededHistoryDemo = ensureMockHistoryProjectForCurrentAccount();
  if (claimedLegacy || seededHistoryDemo) {
    persistAppDataNow({ forceLocal: true });
  }
  syncActiveProjectForCurrentAccount({ allowNull: appState.activePage === "create-page" });
  initProvinceSelect();
  syncCreateStorageFieldsUi();
  initBatchParamSelect();
  bindOverviewImageFallbacks();
  bindEvents();
  syncScenarioFieldLocks();
  setActivePage(appState.activePage || "home-page");
}

init();
