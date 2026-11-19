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
  OVERVIEW_POLICY_DETAILS,
  PROVINCE_DEFAULT_PARAMS,
  BATCH_PARAM_SPECS
} = config;
const PAGE_HELP_MAP = PAGE_HELP_TEXTS || {};

const { appState, refs } = runtime;
const energyProfiles = window.NE_ENERGY_PROFILES;
const priceForecast = window.NE_PRICE_FORECAST;
const supplyDemandFlowModule = window.NE_SUPPLY_DEMAND_FLOW;
const revenueRules = window.NE_REVENUE_RULES;
const revenueCalculator = window.NE_REVENUE_CALCULATOR;
const resultCalculation = window.NE_RESULT_CALCULATION;
const resultReport = window.NE_RESULT_REPORT;
const resultVersions = window.NE_RESULT_VERSIONS;
const compareAnalysis = window.NE_COMPARE_ANALYSIS;
const historyAnalysis = window.NE_HISTORY_ANALYSIS;
const workflowStatus = window.NE_WORKFLOW_STATUS;
const scenarioConfig = window.NE_SCENARIO_CONFIG;
const scenarioModel = window.NE_SCENARIO_MODEL;
const projectSettings = window.NE_PROJECT_SETTINGS;
const projectModel = window.NE_PROJECT_MODEL;
const projectDisplay = window.NE_PROJECT_DISPLAY;
const energyDataRules = window.NE_ENERGY_DATA;
const energyImportFlow = window.NE_ENERGY_IMPORT_FLOW;
const csvUtils = window.NE_CSV_UTILS;
const exportBuilders = window.NE_EXPORT_BUILDERS;
const fileImportUtils = window.NE_FILE_IMPORT_UTILS;
const scriptLoader = window.NE_SCRIPT_LOADER;
const policyPanel = window.NE_POLICY_PANEL;
const energyWorkspace = window.NE_ENERGY_WORKSPACE;
const createProjectFlow = window.NE_CREATE_PROJECT_FLOW;
const energyTemplateFlow = window.NE_ENERGY_TEMPLATE_FLOW;
const manualScenarioFlow = window.NE_MANUAL_SCENARIO_FLOW;
const chartLifecycle = window.NE_CHART_LIFECYCLE;
const energyCharts = window.NE_ENERGY_CHARTS;
const forecastPage = window.NE_FORECAST_PAGE;
const forecastResultsView = window.NE_FORECAST_RESULTS_VIEW;
const forecastRunFlow = window.NE_FORECAST_RUN_FLOW;
const roughPrice = window.NE_ROUGH_PRICE;
const roughPriceWorkspace = window.NE_ROUGH_PRICE_WORKSPACE;
const projectListView = window.NE_PROJECT_LIST_VIEW;
const resultPage = window.NE_RESULT_PAGE;
const resultHistory = window.NE_RESULT_HISTORY;
const resultRunner = window.NE_RESULT_RUNNER;
const resultPrint = window.NE_RESULT_PRINT;
const resultCharts = window.NE_RESULT_CHARTS;
const scenarioForm = window.NE_SCENARIO_FORM;
const compareCharts = window.NE_COMPARE_CHARTS;
const comparePage = window.NE_COMPARE_PAGE;
const historyCharts = window.NE_HISTORY_CHARTS;
const historyPage = window.NE_HISTORY_PAGE;
const historyRenderer = window.NE_HISTORY_RENDERER;
const themeController = window.NE_THEME_CONTROLLER;
const shellEvents = window.NE_SHELL_EVENTS;
const appEventBindings = window.NE_APP_EVENT_BINDINGS;
const appStorage = window.NE_APP_STORAGE;
const appPersistence = window.NE_APP_PERSISTENCE;
const appUtils = window.NE_APP_UTILS;

if (!supplyDemandFlowModule || !energyProfiles || !priceForecast || !revenueRules || !revenueCalculator || !resultCalculation || !resultReport || !compareAnalysis || !historyAnalysis || !workflowStatus || !scenarioConfig || !scenarioModel || !projectSettings || !projectModel || !projectDisplay || !energyDataRules || !energyImportFlow || !csvUtils || !exportBuilders || !fileImportUtils || !scriptLoader || !policyPanel || !energyWorkspace || !createProjectFlow || !energyTemplateFlow || !manualScenarioFlow || !chartLifecycle || !energyCharts || !forecastPage || !forecastResultsView || !forecastRunFlow || !roughPrice || !roughPriceWorkspace || !projectListView || !resultPage || !resultRunner || !resultPrint || !resultCharts || !scenarioForm || !compareCharts || !comparePage || !historyCharts || !historyPage || !historyRenderer || !themeController || !shellEvents || !appEventBindings || !appStorage || !appPersistence || !appUtils) {
  throw new Error("应用初始化失败：缺少 src/domain 业务测算模块");
}

if (!resultVersions || !resultHistory) throw new Error("应用初始化失败：缺少结果版本模块");

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
const { normalizeTheme } = themeController;
const loadScriptResourceOnce = scriptLoader.loadScriptResourceOnce;
const {
  getProvinceName,
  getAssetTypeLabel,
  getSiteTypeLabel,
  describeProvinceTypicalCurve,
  formatExportStatusTime,
  getForecastPeriodDisplayRange
} = projectDisplay.createProjectDisplayHelpers({ provinces: PROVINCES });
const supplyDemandFlow = supplyDemandFlowModule.create({
  documentRef: document, getProject: getActiveProject, downloadCsv,
  onInvalidate: (project) => markDownstreamStale(project, "forecast-page"),
  onPersist: schedulePersistAppData, onRender: renderAll, onMessage: setTopMeta,
  onDraftChange: () => backendForecastPanel.render()
});
let renderedForecastResults = { projectId: null, html: "", chartKey: "", visible: {}, disposeChart: null };
const backendForecastPanel = forecastPage.createBackendForecastPanel({
  documentRef: document, getProject: getActiveProject,
  getService: () => config.backendForecastService,
  inspectInput: supplyDemandFlow.inspectSupplyDemand, prepareInput: supplyDemandFlow.prepareSupplyDemand,
  hasUsableRun: (project) => !supplyDemandFlow.hasUnsavedChanges() && !supplyDemandFlow.hasPendingDraft(project)
    && hasActiveActivatableRun(project),
  isActive: () => appState.activePage === "forecast-page",
  acceptTask: acceptBackendForecastTask,
  onTask: renderBackendForecastResults
});
const createEmptyEnergyDataState = projectModel.createEmptyEnergyDataState;
const normalizeTypicalCurveProfile = energyProfiles.normalizeTypicalCurveProfile;
const ensureProjectEnergyDataState = energyDataRules.ensureProjectEnergyDataState;
const ensureProjectEnergyDataDerivedState = energyDataRules.ensureProjectEnergyDataDerivedState;
const hasEnergyTypicalCurve = energyDataRules.hasEnergyTypicalCurve;
const getCompleteEnergyYears = energyDataRules.getCompleteEnergyYears;
const getAnnualInputYearCount = energyDataRules.getAnnualInputYearCount;
const getContiguousAnnualInputPeriod = energyDataRules.getContiguousAnnualInputPeriod;
const parseYearRangeFromLabel = energyDataRules.parseYearRangeFromLabel;

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
const MAP_LEVEL_SET = new Set(["nation", "province"]);
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
let allowStorageReload = false;
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
let resultChartsResizeBound = false;
let compareChartsResizeBound = false;
let historyChartsResizeBound = false;
let historyChartsRefreshTimer = null;
const historyAnalysisCache = new Map();
const provinceTypicalCurveDbCache = new Map();
let lastSyncedProjectProvinceContextKey = "";
const compareChartInstances = {
  sensitivityTornado: null,
  sensitivityResponse: null,
  scenarioRanking: null,
  scenarioBridge: null,
  scenarioTrend: null
};
const resultChartInstances = {
  annualStack: null,
  pricePath: null,
  waterfall: null,
  contribution: null
};
const historyChartInstances = {
  monthTrend: null,
  heatmap: null,
  duration: null,
  intradaySpread: null
};
const historyChartExportPayloads = {
  monthTrend: null,
  heatmap: null,
  duration: null,
  intradaySpread: null
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
  "rough-page": "已保存与当前项目、测算期和电量口径一致的粗算版本。",
  "history-page": "已按项目省份自动展示历史现货图表。",
  "forecast-page": "项目已有可用于收益测算的有效价源。",
  "scenario-page": "当前收益参数补充与细化已保存。",
  "results-page": "当前方案已成功生成一版基准结果。",
  "compare-page": "至少两个方案存在可对比结果。"
};
const PAGE_VIEW_ALIAS = {
  "energy-page": "create-page",
  "province-page": "scenario-page"
};
const OVERVIEW_IMAGE_FALLBACK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#10243b"/><stop offset="100%" stop-color="#1f4f7d"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="1300" cy="180" r="120" fill="#f9c55d" opacity=".85"/><path d="M0 760 L420 620 L740 690 L1080 610 L1600 760 L1600 900 L0 900Z" fill="#1a3f63" opacity=".72"/><path d="M220 760 L300 420 L380 760 M255 580 L345 580 M760 760 L840 360 L920 760 M795 540 L885 540 M1180 760 L1240 470 L1300 760 M1210 620 L1270 620" stroke="#f2e3c0" stroke-width="12" stroke-linecap="round" fill="none"/><text x="80" y="150" fill="#ffffff" font-family="Arial,sans-serif" font-size="68" font-weight="700">NEW ENERGY</text></svg>')}`;

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
  shellEvents.applyAuthLayout({ refs, auth: appState.auth, sidebarGroups: appState.sidebarGroups });
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
  const seed = projectModel.buildMockHistoryProjectSeed({
    loggedIn: appState.auth.loggedIn,
    ownerAccount: appState.auth.account,
    accountProjects: getProjectsForCurrentAccount(),
    isNewWorkspaceProject,
    makeId,
    resolveUniqueName: resolveUniqueProjectName,
    statuses: statusMapTemplate(),
    historySpotImport: createEmptyHistorySpotImport(),
    spotMarketConfig: createDefaultSpotMarketConfig(),
    createBaselineScenario
  });
  if (!seed.created) return false;

  appState.projects.unshift(seed.project);
  if (!getActiveProject()) {
    appState.activeProjectId = seed.project.id;
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
    scenarioName: scenario.name || "当前方案",
    years: Array.isArray(result.annualRows) ? result.annualRows.length : 0
  };
}

function resolveLogoutPersistChoice() {
  const context = getCurrentResultContext();
  if (!context || typeof window === "undefined") {
    return "direct";
  }
  const shouldSave = window.confirm(
    `当前项目“${context.projectName}”方案“${context.scenarioName}”已有测算结果。\n是否在退出前立即保存当前结果？\n\n选择“确定”= 保存并退出\n选择“取消”= 继续选择`
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
  setAccountManageMessage("当前为演示账号，未修改密码。", "error");
}

function getThemeControllerInput() {
  return {
    appState,
    refs,
    documentRef: typeof document !== "undefined" ? document : null,
    storageApi: appStorage,
    storageArea: getBrowserStorage("localStorage"),
    themeSequence: THEME_SEQUENCE,
    themeLabels: THEME_LABELS,
    onError: (error) => console.warn("读取主题偏好失败。", error)
  };
}

function initTheme() {
  themeController.initTheme(getThemeControllerInput());
}

function toggleTheme() {
  themeController.toggleTheme({
    ...getThemeControllerInput(),
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

function sanitizeScenario(project, rawScenario, index, roughSnapshots) {
  return scenarioModel.sanitizeScenario(project, rawScenario, index, {
    provinceDefaults: getProvinceDefaults(project?.province), roughSnapshots,
    currentYear: new Date().getFullYear(),
    nowIso: () => new Date().toISOString(),
    makeId
  });
}

function sanitizeProjectEnergyState(project, rawProject) {
  project.energyData = isPlainObject(rawProject.energyData)
    ? { ...createEmptyEnergyDataState(project.energyMode), ...rawProject.energyData }
    : createEmptyEnergyDataState(project.energyMode);
  ensureProjectEnergyDataState(project);
  alignDefaultForecastYearsToStoredAnnualInput(project);
  ensureProjectEnergyTemplateExports(project);
}

function sanitizeProjectForecastState(project, rawProject) {
  project.historySpotImport = sanitizeHistorySpotImport(rawProject.historySpotImport);
  project.priceRuns = projectModel.sanitizePriceRuns(rawProject.priceRuns, {
    makeId,
    nowIso: () => new Date().toISOString()
  });
  project.activeRunId = projectModel.resolveActiveRunId(project.priceRuns, rawProject.activeRunId, project);
  supplyDemandFlow.hydrate(project, rawProject);
  project.spotMarketConfig = sanitizeSpotMarketConfig(project, rawProject.spotMarketConfig);
  project.activationLogs = projectModel.sanitizeActivationLogs(rawProject.activationLogs, {
    makeId,
    nowIso: () => new Date().toISOString()
  });
}

function sanitizeProjectScenarioState(project, rawProject) {
  const rawScenarios = Array.isArray(rawProject.scenarios) ? rawProject.scenarios : [];
  project.scenarios = rawScenarios.map((scenario, i) => sanitizeScenario(project, scenario, i, rawProject.roughPrice?.snapshots));
  if (!project.scenarios.length) {
    project.scenarios = [createBaselineScenario(project)];
  }
  project.activeScenarioId = rawProject.activeScenarioId;
  scenarioModel.normalizeScenarioMetadata(project);
  project.resultsByScenario = isPlainObject(rawProject.resultsByScenario) ? rawProject.resultsByScenario : {};
  const resultArchive = resultVersions.restoreResultHistory(rawProject.resultHistoryByScenario);
  if (resultArchive) project.resultHistoryByScenario = resultArchive;
  if (isPlainObject(rawProject.legacyStorageResultsByScenario)) {
    project.legacyStorageResultsByScenario = rawProject.legacyStorageResultsByScenario;
  }
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

  sanitizeProjectEnergyState(project, rawProject);
  sanitizeProjectForecastState(project, rawProject);
  sanitizeProjectScenarioState(project, rawProject);
  project.roughPrice = roughPrice.sanitizeWorkspace(rawProject.roughPrice, project);
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
  const savedPage = payload.activePage === "validation-page" ? "results-page" : payload.activePage;
  appState.activePage = PAGE_ID_SET.has(savedPage) ? savedPage : "home-page";
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
  const content = energyWorkspace.buildEnergyStep2ChoiceSummary({
    project,
    activeChoice: sanitizeEnergyStep2Choice(appState.energyStep2Choice),
    createReady: project ? isProjectCreateCompleted(project) : false,
    annualInputYears: project ? getAnnualInputYearCount(project) : 0,
    provinceCurveText: project ? describeProvinceTypicalCurve(project) : ""
  });
  refs.energyStep2ChoiceSummary.textContent = content.summary;
  refs.energyStep2ChoiceDetail.textContent = content.detail;
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
  const result = appPersistence.persistAppDataSnapshot({
    appStorage,
    store: appDataSnapshotStore,
    snapshot: buildAppDataSnapshot(),
    hasLocalStorage: Boolean(getBrowserStorage("localStorage")),
    storageMode: appDataStorageMode,
    forceLocal: Boolean(options.forceLocal),
    nowMs: Date.now(),
    lastLocalWriteAt: lastLocalStoragePersistAt,
    intervalMs: LOCAL_STORAGE_PERSIST_INTERVAL_MS,
    sequence: ++persistSequence,
    isLatestSequence: (seq) => seq === persistSequence,
    getStorageWarningShown: () => storageWarningShown,
    setStorageWarningShown: (value) => {
      storageWarningShown = value;
    },
    setTopMeta,
    onStorageStateChange: (state) => {
      window.NE_PROJECT_BACKUP.renderStorageState(document, state);
      scenarioForm.updateScenarioStorageStatus({ refs, status: state });
    },
    consoleRef: console
  });
  appDataStorageMode = result.storageMode;
  lastLocalStoragePersistAt = result.lastLocalWriteAt;
  return result.completion;
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
  return projectSettings.resolveProvinceDefaults(provinceKey, {
    provinceDefaultParams: PROVINCE_DEFAULT_PARAMS,
    provinceBenchmarks: PROVINCE_BENCHMARKS
  });
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
  if (Object.keys(baseline.confirmedConfig || {}).length || project.roughPrice?.snapshots?.length) return false;
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
  baseline.confirmedConfig = {}; baseline.confirmedConfigSources = {};
  baseline.updatedAt = new Date().toISOString();
  project.activeScenarioId = baseline.id;
  return true;
}

function ensureScenarioMetadata(project) {
  scenarioModel.normalizeScenarioMetadata(project);
}

function getBaselineScenario(project) {
  ensureScenarioMetadata(project);
  return project.scenarios.find((scenario) => scenario.isBaseline) || project.scenarios[0] || null;
}

function countScenariosForCompare(project) {
  return compareAnalysis.buildAvailableScenarioResults(project, getValidatedResultState).length;
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
  return forecastRunFlow.hasActiveActivatableRun(project, { validateSupplyDemandRun: supplyDemandFlow.validateSupplyDemandRun });
}


function isScenarioConfigConfirmed(project, scenario) {
  if (!scenario) return false;
  const state = scenarioForm.buildRefinementState({ project, scenario });
  return state.total > 0 && state.confirmed === state.total;
}

function buildWorkflowCompletionSnapshot(project) {
  const scenario = getActiveScenario(project);
  return workflowStatus.buildCompletionSnapshot({
    project, scenario, roughPrice, getBaselineResultState: getValidatedResultState,
    energyState: getEnergyCompletionState(project),
    createCompleted: isProjectCreateCompleted(project),
    forecastCompleted: hasActiveActivatableRun(project),
    scenarioConfirmed: isScenarioConfigConfirmed(project, scenario),
    compareReadyCount: countScenariosForCompare(project)
  });
}

function reconcileProjectStatuses(project) {
  if (!project) return;
  supplyDemandFlow.reconcile(project);
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

function updatePrintReportHeader(project, scenario, result = project?.resultsByScenario?.[scenario?.id]) {
  if (!refs.printProjectName || !refs.printScenarioName || !refs.printPeriodRange || !refs.printGeneratedTime) {
    return;
  }
  const period = resultPage.savedResultPeriod(result) || getForecastPeriodDisplayRange(project);
  refs.printProjectName.textContent = project?.name || "-";
  refs.printScenarioName.textContent = scenario?.name || "-";
  refs.printPeriodRange.textContent = period;
  refs.printGeneratedTime.textContent = new Date().toLocaleString("zh-CN", { hour12: false });
  resultPrint.renderVersionTrace(document.querySelector("#print-result-trace"), project, result);
}

function resolveVisiblePageId(pageId) {
  return PAGE_VIEW_ALIAS[pageId] || pageId;
}

function scrollCreateWorkspaceToStep(pageId) {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    const target = refs.workflowContext && !refs.workflowContext.hidden ? refs.workflowContext
      : pageId === "energy-page" ? refs.createStepEnergy : refs.createStepForm;
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
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

function resolveActivePageRequest(pageId) {
  const request = shellEvents.resolveActivePageRequest({
    pageId,
    aliases: { "province-page": "scenario-page", "spot-page": "scenario-page" },
    requiresLogin: REQUIRES_LOGIN,
    requiresProject: REQUIRES_PROJECT,
    loggedIn: appState.auth.loggedIn,
    hasProject: Boolean(getActiveProject()),
    projectRequiredMessage: "请先创建项目或在“我的项目”里选择一个项目"
  });
  if (request.topMetaMessage) setTopMeta(request.topMetaMessage);
  return request.pageId;
}

function syncActivePageDom(pageId) {
  const visiblePageId = resolveVisiblePageId(pageId);
  refs.topTitle.textContent = PAGE_TITLES[pageId] || "新能源平台";
  refs.navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === pageId);
  });
  refs.pages.forEach((page) => {
    page.classList.toggle("active", page.id === visiblePageId);
  });
  syncCreateWorkspaceStepVisibility(pageId);
}

function runActivePageEntryEffects(pageId) {
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
}

function queueActivePageCharts(pageId) {
  if (pageId === "history-page") {
    queueHistoryChartsResize();
    queueHistoryChartsRefresh();
  }
  if (pageId === "compare-page") queueCompareChartsResize();
}

function setActivePage(pageId) {
  pageId = resolveActivePageRequest(pageId);
  closeOverviewPolicyDetail();
  appState.activePage = pageId;
  syncActivePageDom(pageId);
  runActivePageEntryEffects(pageId);
  renderAll();
  queueActivePageCharts(pageId);
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
  benchmarkMapResizeBound = chartLifecycle.bindWindowResizeOnce({
    windowRef: window,
    isBound: benchmarkMapResizeBound,
    resize: () => chartLifecycle.resizeChart(benchmarkMapChart)
  });
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
      : "全国省级电价（演示样例）";
  }
  if (refs.benchmarkMapTip) {
    refs.benchmarkMapTip.innerHTML = isProvinceLevel
      ? "提示：当前地州数据为虚拟样例，<br>可拖动左侧图例游标筛选电价区间。"
      : "提示：鼠标悬停查看详细电价数据，点击省份可查看地州详情，<br>可拖动左侧图例游标筛选电价区间。";
  }
  if (refs.benchmarkMapUpdated) {
    refs.benchmarkMapUpdated.textContent = "演示样例 · 待接入实测数据";
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
  projectListView.renderProjectListFrameFromContext({
    refs, appState, projects: getProjectsForCurrentAccount(), isNewWorkspaceProject,
    workflowPages: WORKFLOW_PAGES, pageTitles: PAGE_TITLES, statusText,
    windowRef: typeof window !== "undefined" ? window : null,
    projectQueries: {
      isProjectCreateCompleted, getActiveRun, getActiveScenario, statusMapTemplate,
      getForecastPeriodDisplayRange, getProvinceName, getStorageConfigText
    },
    projectActions: {
      createEmptyWorkspaceProject, setTopMeta, renderAll, setActivePage, cloneData,
      makeId, resolveUniqueProjectName, projectBelongsToCurrentAccount, getProjectsForCurrentAccount
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
  energyWorkspace.applyCreateStorageFieldsState({ refs });
}

function resetCreateProjectFormForNew() {
  if (!refs.createProjectForm) return;
  createFormSyncedProjectId = null;
  energyWorkspace.resetCreateProjectFormForNew({
    refs,
    documentRef: document,
    syncCreateStorageFields: syncCreateStorageFieldsUi,
    setCreateSaveMessage
  });
}

function createEmptyWorkspaceProject() {
  const now = new Date();
  const nowIso = now.toISOString();
  const project = projectModel.createEmptyWorkspaceProject({
    id: makeId("proj"),
    ownerAccount: String(appState.auth.account || "").trim(),
    name: resolveUniqueProjectName("新建项目"),
    nowIso,
    statuses: statusMapTemplate(),
    historySpotImport: createEmptyHistorySpotImport(),
    spotMarketConfig: createDefaultSpotMarketConfig(),
    createBaselineScenario: (projectDraft) => createBaselineScenario(projectDraft, {
      currentYear: now.getFullYear(),
      nowIso
    })
  });
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
  const values = energyWorkspace.buildCreateProjectFormValues({
    project,
    provinceKeys: PROVINCE_KEY_SET,
    assetTypes: ASSET_TYPE_SET,
    siteTypes: SITE_TYPE_SET,
    createReady: isProjectCreateCompleted(project)
  });
  energyWorkspace.applyCreateProjectFormValues({
    refs,
    documentRef: document,
    values
  });
  syncCreateStorageFieldsUi();
  setCreateSaveMessage(values.message, "info");
  createFormSyncedProjectId = project.id;
}

function renderCreateWorkspaceState() {
  const project = getActiveProject();
  const ready = Boolean(project) && isProjectCreateCompleted(project);
  energyWorkspace.applyCreateWorkspaceEntryState({ refs, ready });
}

function setCreateSaveMessage(text, tone = "info") {
  energyWorkspace.applyCreateSaveMessage({ refs, text, tone });
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

function createBaselineScenario(project, options = {}) {
  return scenarioModel.createBaselineScenario(project, {
    provinceDefaults: getProvinceDefaults(project?.province),
    currentYear: Number.isInteger(options.currentYear) ? options.currentYear : new Date().getFullYear(),
    nowIso: options.nowIso || (() => new Date().toISOString()),
    makeId
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

function createProjectFormFlowContext() {
  return createProjectFlow.createCreateProjectFormFlowContext({
    refs,
    documentRef: document,
    appState,
    projectModel,
    energyWorkspace,
    provinceKeys: PROVINCE_KEY_SET,
    assetTypes: ASSET_TYPE_SET,
    siteTypes: SITE_TYPE_SET,
    actions: {
      getActiveProject, setTopMeta, setCreateSaveMessage, resolveUniqueProjectName, makeId,
      statusMapTemplate, createEmptyHistorySpotImport, createDefaultSpotMarketConfig,
      isProjectCreateCompleted, createBaselineScenario, syncProjectProvinceDefaultsToBaseline,
      shouldAutoSyncProvinceDefaults, syncProjectProvinceScopedState, createEmptyEnergyDataState,
      ensureProjectEnergyTemplateExports, markDownstreamStale,
      getProvinceName, ensureProjectEnergyDataState, moveProjectToHistoryWorkspaceIfReady,
      setCreateFormSyncedProjectId: (projectId) => {
        createFormSyncedProjectId = projectId;
      },
      setActivePage, scrollCreateWorkspaceToBottom
    }
  });
}

function createProjectFromForm(options = {}) {
  return createProjectFlow.saveCreateProjectFromForm({
    ...createProjectFormFlowContext(),
    options
  });
}

function normalizeCsvHeaderToken(value) {
  return csvUtils.normalizeCsvHeaderToken(value);
}

function normalizeCsvHeaderRow(row) {
  return csvUtils.normalizeCsvHeaderRow(row);
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

function getEnergyModeMeta(mode) {
  return energyDataRules.getEnergyModeMeta(mode);
}

function detectEnergyModeByHeader(headerRow) {
  return energyDataRules.detectEnergyModeByHeader(headerRow);
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

async function readSpreadsheetToCsv(file) {
  return fileImportUtils.readSpreadsheetToCsv(file, { xlsx: window.XLSX });
}

function energyTemplateFlowContext() {
  return {
    project: getActiveProject(),
    appState,
    services: {
      normalizeEnergyMode: projectModel.normalizeEnergyMode,
      buildEnergyTemplateRows: energyDataRules.buildEnergyTemplateRows,
      buildEnergyTemplateFilename,
      ensureProjectEnergyTemplateExports,
      ensureProjectEnergyDataState,
      getEnergyModeMeta,
      isProjectCreateCompleted,
      generateHourlyHoursFromAnnual,
      getAnnualInputYearCount,
      getProvinceTypicalCurveRecord,
      rebuildProjectEnergyData,
      countCompleteEnergyYears,
      markDownstreamStale
    },
    actions: {
      getActiveProject, setEnergyImportMessage,
      downloadCsv,
      readSpreadsheetToCsv,
      importEnergyDataFromText,
      renderAll
    }
  };
}

function pseudoNoise(index, seed) {
  return energyProfiles.pseudoNoise(index, seed);
}

function generateHourlyHoursFromAnnual(annualHours, assetType, seed) {
  return energyProfiles.generateHourlyHoursFromAnnual(annualHours, assetType, seed);
}

function getProvinceTypicalCurveRecord(project) {
  const curveOptions = {
    provinceBenchmarks: PROVINCE_BENCHMARKS,
    siteTypeSet: SITE_TYPE_SET,
    describeProvinceTypicalCurve
  };
  const cacheKey = energyDataRules.getProvinceTypicalCurveRecordKey(project, curveOptions);
  if (!cacheKey) return null;
  if (!provinceTypicalCurveDbCache.has(cacheKey)) {
    provinceTypicalCurveDbCache.set(cacheKey, energyDataRules.createProvinceTypicalCurveMockRecord(project, curveOptions));
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
      normalizeEnergyMode: projectModel.normalizeEnergyMode,
      validateAndBuildEnergyData,
      alignDefaultForecastYearsToAnnualTemplate,
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
  return energyTemplateFlow.exportEnergyTemplate({
    ...energyTemplateFlowContext(),
    mode
  });
}

async function importEnergyFromFile(mode, inputElement) {
  return energyTemplateFlow.importEnergyFromFile({
    ...energyTemplateFlowContext(),
    mode,
    inputElement
  });
}

function downloadEnergySampleFile(mode = "annual_hours") {
  return energyTemplateFlow.downloadEnergySampleFile({
    ...energyTemplateFlowContext(),
    mode
  });
}

function applyProvinceTypicalCurve() {
  return energyTemplateFlow.applyProvinceTypicalCurve(energyTemplateFlowContext());
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

function acceptBackendForecastTask(input) {
  if (getActiveProject() !== input.project) return { ok: false, changed: false, errors: ["当前项目已切换。"] };
  const result = forecastRunFlow.acceptBackendTask({
    ...input,
    services: { prepareSupplyDemand: supplyDemandFlow.prepareSupplyDemand, markDownstreamStale },
    actions: { makeId, nowIso: () => new Date().toISOString() }
  });
  if (result.changed) {
    schedulePersistAppData();
    renderStatuses();
  }
  return result;
}

function renderBackendForecastResults(state) {
  const root = document.querySelector("#forecast-results-root");
  if (!root) return;
  const projectId = state.project?.id ?? null;
  const ready = !supplyDemandFlow.hasUnsavedChanges() && !supplyDemandFlow.hasPendingDraft(state.project);
  const publishedRuns = ready ? forecastRunFlow.getPublishedBackendResults(state.project) : [];
  const caseRuns = ready && !publishedRuns.length ? forecastRunFlow.getArchivedCaseRuns(state.project) : [];
  const { html, chart } = forecastResultsView.buildView({ ...state, caseRuns, publishedRuns });
  const chartKey = chart ? JSON.stringify(chart) : "";
  const sameProject = renderedForecastResults.projectId === projectId;
  const visible = sameProject ? renderedForecastResults.visible : {};
  if (sameProject && renderedForecastResults.html === html && renderedForecastResults.chartKey === chartKey) {
    if (chart && !renderedForecastResults.disposeChart) renderedForecastResults.disposeChart = forecastResultsView.mountChart(root, chart, visible);
    return;
  }
  const historyOpen = sameProject && root.querySelector("[data-forecast-history]")?.open;
  renderedForecastResults.disposeChart?.();
  root.innerHTML = html;
  const history = root.querySelector("[data-forecast-history]");
  if (history && historyOpen) history.open = true;
  const disposeChart = chart ? forecastResultsView.mountChart(root, chart, visible) : null;
  renderedForecastResults = { projectId, html, chartKey, visible, disposeChart };
}

function renderForecastRuns() {
  const project = getActiveProject();
  if (appState.activePage === "forecast-page") {
    supplyDemandFlow.render();
    backendForecastPanel.render();
  } else {
    supplyDemandFlow.disposeChart();
    backendForecastPanel.dispose();
    renderedForecastResults.disposeChart?.();
    renderedForecastResults.disposeChart = null;
  }
  if (appState.activePage === "rough-page") roughPriceWorkspace.renderWorkspace({
    documentRef: typeof document !== "undefined" ? document : null,
    project, scenario: project ? getActiveScenario(project) : null, domain: roughPrice, inputState: scenarioModel,
    makeId, nowIso: () => new Date().toISOString(),
    onMessage: setTopMeta, onPersist: schedulePersistAppData, onNavigate: setActivePage,
    onChange: (change = {}) => { if (change.sharedChanged) markDownstreamStale(project, "scenario-page"); renderAll(); }
  });
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
  refs.energySummaryNote.textContent = energyWorkspace.buildEnergySummaryNote({
    project,
    createReady: Boolean(project && isProjectCreateCompleted(project)),
    energyState: project ? getEnergyCompletionState(project) : {},
    sourceLabel: project ? describeProvinceTypicalCurve(project) : "",
    missingYears: project ? listMissingEnergyYears(project, 8) : []
  });
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
    refs.exportEnergyTypicalTemplateButton.textContent = actions.typicalExportText || "下载空白8760模板";
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
  if (model.resetMessageProjectId) {
    refs.energyImportMessage.removeAttribute("data-project-id");
  } else if (model.projectIdForMessage) {
    refs.energyImportMessage.dataset.projectId = model.projectIdForMessage;
  }
  if (refs.energyProjectContext) {
    refs.energyProjectContext.hidden = isProjectCreateCompleted(project);
    refs.energyProjectContext.textContent = model.projectContext;
  }
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
  energyCurveResizeBound = chartLifecycle.bindWindowResizeOnce({
    windowRef: window,
    isBound: energyCurveResizeBound,
    resize: () => chartLifecycle.resizeCharts([energyAnnualChart, energyCurveChart])
  });
  return energyCurveChart;
}

function ensureEnergyAnnualChart() {
  if (!refs.energyAnnualChart || typeof window === "undefined" || !window.echarts) return null;
  if (energyAnnualChart && !energyAnnualChart.isDisposed()) {
    return energyAnnualChart;
  }
  energyAnnualChart = window.echarts.init(refs.energyAnnualChart, null, { renderer: "canvas" });
  energyCurveResizeBound = chartLifecycle.bindWindowResizeOnce({
    windowRef: window,
    isBound: energyCurveResizeBound,
    resize: () => chartLifecycle.resizeCharts([energyAnnualChart, energyCurveChart])
  });
  return energyAnnualChart;
}

function renderEnergyCurveChart() {
  if (appState.activePage !== "energy-page") return;
  if (!refs.energyCurveChart || !refs.energyAnnualChart) return;
  if (typeof window === "undefined" || !window.echarts) return;
  const project = getActiveProject();
  const createReady = Boolean(project && isProjectCreateCompleted(project));
  const energyState = project ? getEnergyCompletionState(project) : {};
  const chartModel = energyCharts.buildEnergyCurveChartViewModel({
    project,
    createReady,
    energyState,
    previewMeta: project && energyState.hasTypicalCurve ? getEnergyCurvePreviewProfile(project) : null
  });
  const chart = ensureEnergyCurveChart();
  const annualChart = ensureEnergyAnnualChart();
  if (!chart || !annualChart) return;
  energyCharts.applyEnergyCurveChartRender({
    refs,
    chartModel,
    annualChart,
    typicalChart: chart,
    tokens: historyThemeTokens()
  });
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
    heatmap: ensureHistoryChart("heatmap", refs.historyHeatmapChart),
    duration: ensureHistoryChart("duration", refs.historyDurationChart),
    intradaySpread: ensureHistoryChart("intradaySpread", refs.historyIntradaySpreadChart)
  };
  historyChartsResizeBound = chartLifecycle.bindWindowResizeOnce({
    windowRef: window,
    isBound: historyChartsResizeBound,
    resize: () => chartLifecycle.resizeCharts(historyChartInstances)
  });
  return charts;
}

function queueHistoryChartsResize() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;
  chartLifecycle.queueDoubleFrame({
    windowRef: window,
    callback: () => chartLifecycle.resizeCharts(historyChartInstances)
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
  compareChartsResizeBound = chartLifecycle.bindWindowResizeOnce({
    windowRef: window,
    isBound: compareChartsResizeBound,
    resize: () => chartLifecycle.resizeCharts(compareChartInstances)
  });
  return chart;
}

function queueCompareChartsResize() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;
  chartLifecycle.queueDoubleFrame({
    windowRef: window,
    callback: () => chartLifecycle.resizeCharts(compareChartInstances)
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
  const focusTotals = compareAnalysis.resultComponentTotals(focusItem.result, focusItem.scenario.config);
  const baseTotals = compareAnalysis.resultComponentTotals(baseline.result, baseline.scenario.config);
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
    sanitizeExportFilenamePart,
    renderStatuses,
    renderProjects,
    schedulePersistAppData
  });
}

function loadScenarioToForm(project, scenario) {
  scenarioForm.loadScenarioToForm({
    project, scenario,
    onManualDraftDiscard: syncScenarioFieldLocks,
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
      : clamp(Number(scenario?.config?.mechanismRatio || 0), 0, 1)
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

function readEnvValueAllocationDraft() {
  const readPercent = (selector) => {
    const value = Number(document.querySelector(selector)?.value);
    return Number.isFinite(value) ? value / 100 : 0;
  };
  const greenCertRatio = readPercent("#green-cert-realize-ratio");
  const greenPremiumRatio = readPercent("#green-premium-realize-ratio");
  return {
    greenCertRatio,
    greenPremiumRatio,
    totalRatio: greenCertRatio + greenPremiumRatio
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
  let draft = readEnvValueAllocationDraft();
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
      refs.envValueUsedRatio.style.borderColor = "var(--red)";
      refs.envValueUsedRatio.style.background = "color-mix(in srgb, var(--red) 10%, var(--panel))";
    } else {
      refs.envValueUsedRatio.style.removeProperty("border-color");
      refs.envValueUsedRatio.style.removeProperty("background");
    }
  }
}

function updateEnvManualStatus(project = getActiveProject(), scenario = null) {
  if (!refs.envManualStatus) return;
  const activeScenario = scenario || (project ? getActiveScenario(project) : null);
  if (scenarioForm.renderManualImportStatus({ project, scenario: activeScenario, kind: "env", node: refs.envManualStatus })) return;
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
    refs.envManualStatus.textContent = "尚未导入逐年环境价值兑现配置。";
    return;
  }
  refs.envManualStatus.textContent = complete === total
    ? `已导入完整逐年环境价值兑现配置：${complete}/${total} 年。`
    : `已导入 ${complete}/${total} 年，缺少：${missingYears.slice(0, 5).join("、")}${missingYears.length > 5 ? "…" : ""}。`;
}

function syncEnvValueControls(project = getActiveProject(), scenario = null, locked = false) {
  const activeScenario = scenario || (project ? getActiveScenario(project) : null);
  scenarioForm.applyEnvValueControlState({
    refs,
    querySelector: (selector) => document.querySelector(selector),
    project,
    scenario: activeScenario,
    locked,
    envValueMode: getEnvValueMode(activeScenario?.config)
  });
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
  if (scenarioForm.renderManualImportStatus({ project, scenario: activeScenario, kind: "fee", node: refs.feeManualStatus })) return;
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
    refs.feeManualStatus.textContent = "尚未导入逐年扣费收益配置。";
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
    "#other-net-income"
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
  if (scenarioForm.renderManualImportStatus({ project, scenario: activeScenario, kind: "lt", node: refs.ltManualStatus })) return;
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
    refs.ltManualStatus.textContent = "尚未导入逐年损益值。";
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
  if (project) ensureScenarioMetadata(project);
  scenarioForm.applyScenarioManagerView(refs, scenarioForm.buildScenarioManagerView({
    project,
    activeScenario: project ? getActiveScenario(project) : null,
    baselineScenario: project ? getBaselineScenario(project) : null,
    getEnvValueAllocation,
    getFeeConfigForYear,
    asPercent,
    asNum,
    formatDate: (value) => new Date(value).toLocaleString("zh-CN", { hour12: false })
  }));
}

function renderWorkflowContext() {
  const { workflowContext } = refs;
  if (!workflowContext) return;
  const project = WORKFLOW_PAGES.includes(appState.activePage) ? getActiveProject() : null;
  const visiblePageId = resolveVisiblePageId(appState.activePage);
  const page = refs.pages.find((node) => node.id === visiblePageId);
  workflowContext.hidden = !project || !page;
  if (workflowContext.hidden) return;
  if (workflowContext.parentElement !== page) page.prepend(workflowContext);
  const scenario = getActiveScenario(project);
  const asset = [getProvinceName(project.province), project.assetType && getAssetTypeLabel(project.assetType),
    project.siteType && getSiteTypeLabel(project.siteType), project.capacityMw && `${project.capacityMw} MW`].filter(Boolean).join(" · ");
  refs.workflowContextProject.textContent = project.name || "未命名项目";
  refs.workflowContextAsset.hidden = !asset;
  refs.workflowContextAsset.textContent = asset;
  refs.workflowContextScenario.textContent = scenario ? `${scenario.name}${scenario.isBaseline ? "（基准）" : ""}${scenario.locked ? " · 已锁定" : ""}` : "—";
  refs.workflowContextPeriod.textContent = getForecastPeriodDisplayRange(project);
  refs.workflowContextStorage.textContent = project.hasStorage == null ? "待配置" : getStorageConfigText(project);
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
    isBaseline: false, locked: false,
    config: cloneData(source.config), confirmedConfig: cloneData(source.confirmedConfig || {}),
    ...(source.confirmationEvidence ? { confirmationEvidence: cloneData(source.confirmationEvidence) } : {}),
    confirmedConfigSources: cloneData(source.confirmedConfigSources || {}), confirmationReviewVersion: source.confirmationReviewVersion,
    updatedAt: new Date().toISOString()
  };
  const roughDraft = project.roughPrice?.draftsByScenario?.[source.id];
  if (roughDraft) project.roughPrice.draftsByScenario[clone.id] = cloneData(roughDraft);
  project.scenarios.push(clone);
  project.activeScenarioId = clone.id;
  project.statuses["scenario-page"] = "in_progress";
  setScenarioImportMessage(`已复制方案“${source.name}”，当前正在编辑“${clone.name}”。`, "success");
  renderAll();
}

function setScenarioImportMessage(text, tone = "error") {
  const project = getActiveProject(), scenario = project && getActiveScenario(project);
  manualScenarioFlow.setScenarioImportMessage({ refs, project, scenario, text, tone });
}

function renameActiveScenario() {
  const project = getActiveProject();
  if (!project) return;
  ensureScenarioMetadata(project);
  const target = getActiveScenario(project);
  if (!target) return;
  const result = scenarioModel.renameScenario(project, target, {
    name: refs.scenarioQuickName.value,
    nowIso: () => new Date().toISOString()
  });
  setScenarioImportMessage(result.message, result.tone);
  if (!result.changed) return;
  renderAll();
}

function deleteActiveScenario() {
  const project = getActiveProject();
  if (!project) return;
  ensureScenarioMetadata(project);
  const target = getActiveScenario(project);
  if (!target) return;
  if (target.isBaseline) {
    setScenarioImportMessage("基准方案不能删除。", "error");
    return;
  }
  if (target.locked) {
    setScenarioImportMessage("当前方案已锁定，无法删除。", "error");
    return;
  }
  project.scenarios = project.scenarios.filter((scenario) => scenario.id !== target.id);
  delete project.resultsByScenario[target.id];
  delete project.resultHistoryByScenario?.[target.id];
  const fallback = getBaselineScenario(project) || project.scenarios[0] || null;
  project.activeScenarioId = fallback?.id || null;
  project.statuses["compare-page"] = countScenariosForCompare(project) >= 2 ? "completed" : "in_progress";
  setScenarioImportMessage(`方案“${target.name}”已删除。`, "success");
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
  setScenarioImportMessage(baseline.locked ? "基准方案已锁定。" : "基准方案已解锁。", "success");
  renderAll();
}

function applyBatchParameter() {
  const project = getActiveProject();
  if (!project) return;
  ensureScenarioMetadata(project);
  const key = refs.batchParamKey.value;
  const spec = BATCH_PARAM_SPECS[key];
  if (!spec) return;
  const result = scenarioModel.applyBatchParameter(project, {
    key,
    spec,
    rawValue: refs.batchParamValue.value.trim(),
    scope: refs.batchTargetScope.value,
    nowIso: () => new Date().toISOString(),
    getEnvValueAllocation
  });
  if (!result.ok || !result.updated) {
    setScenarioImportMessage(result.message, "error");
    return;
  }

  markDownstreamStale(project, "scenario-page");
  setScenarioImportMessage(result.message, "success");
  renderAll();
}

function syncScenarioFieldLocks() {
  const project = getActiveProject();
  const scenario = project ? getActiveScenario(project) : null;
  const locked = Boolean(scenario?.locked);
  setScenarioFormDisabled(locked);
  scenarioForm.applyScenarioFieldLocks({
    refs,
    querySelector: (selector) => document.querySelector(selector),
    locked,
    canUseStorageRevenue: Boolean(project?.hasStorage)
  });

  syncEnvValueControls(project, scenario, locked);
  syncLtPricingControls(project, scenario, locked);
  syncFeeConfigControls(project, scenario, locked);
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
  const project = getActiveProject(); if (!project) return;
  ensureScenarioMetadata(project);
  const scenario = getActiveScenario(project); if (!scenario) return;

  const draft = scenarioForm.buildScenarioSaveDraft({
    project, scenario, refs, clamp, scenarioConfig,
    querySelector: (selector) => document.querySelector(selector),
    readEnvValueAllocationDraft
  });
  if (!draft.ok) {
    setScenarioImportMessage(draft.message, "error");
    return;
  }
  const saved = scenarioForm.applyScenarioSaveDraft({ project, scenario, draft, nowIso: () => new Date().toISOString() });
  if (!saved.ok) { setScenarioImportMessage(saved.message, "error"); return; }
  markDownstreamStale(project, "scenario-page");
  setScenarioImportMessage(saved.message, "success");
  renderAll();
}

function ltPnlPriceForYear(config, yearIndex) {
  return revenueRules.ltPnlPriceForYear(config, yearIndex);
}

function calculateScenarioResult(project, scenario, run) {
  return revenueCalculator.calculateScenarioResult(project, scenario, run, { hourIndexToTimestamp });
}

function runCalculation() {
  const project = getActiveProject();
  if (!project) return;
  if (scenarioForm.hasPendingManualImports([project])) {
    setTopMeta("请先在收益参数补充与细化页确认保存或放弃已暂存的年表，再发起基准测算。");
    return;
  }
  const scenario = getActiveScenario(project);
  const run = getActiveRun(project);
  if (project.hasStorage && run && run.marketPriceBasis !== priceForecast.MARKET_PRICE_BASIS) {
    setTopMeta("这条历史价格曲线尚未核对为同一市场价口径。请先在电价预测工作台生成并启用新版价格，再测算配储增量。");
    return;
  }
  resultRunner.runScenarioCalculation({
    project,
    scenario,
    run,
    scenarioConfig,
    resultCalculation,
    scenarioConfirmed: isScenarioConfigConfirmed(project, scenario),
    calculateScenarioResult, stampResult: roughPrice.stampBaselineResult, validateConfig: roughPrice.validateBaselineConfig,
    validateResult: (project, scenario, result) => compareAnalysis.isResultComplete(project, scenario, result, { includeHourly: true }),
    countScenariosForCompare,
    setTopMeta,
    renderAll
  });
}

function setResultReportView(view) {
  activeResultReportView = resultPage.applyResultReportView({
    refs,
    view,
    allowedViews: RESULT_REPORT_VIEW_SET
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
  resultChartsResizeBound = chartLifecycle.bindWindowResizeOnce({
    windowRef: window,
    isBound: resultChartsResizeBound,
    resize: () => chartLifecycle.resizeCharts(resultChartInstances)
  });
  return chart;
}

function queueResultChartsResize() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;
  chartLifecycle.queueDoubleFrame({
    windowRef: window,
    callback: () => chartLifecycle.resizeCharts(resultChartInstances)
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

function renderResultCharts(verifiedConfig, result) {
  if (resolveVisiblePageId(appState.activePage) !== "results-page") return;
  const rows = result?.annualRows || [];
  if (!rows.length) {
    renderResultChartsPlaceholder("请先发起基准测算");
    return;
  }

  const tokens = resultChartTokens();
  const chartData = resultReport.buildResultChartData(result, verifiedConfig);
  const options = resultCharts.buildResultChartOptions(chartData, tokens, {
    yearInterval: resultCharts.yearLabelInterval(rows)
  });
  Object.entries(options).forEach(([key, option]) => {
    const chart = ensureResultChart(key);
    if (chart) chart.setOption(option, true);
  });

  queueResultChartsResize();
}

function resetResultDom() {
  resultPage.resetResultDom(refs);
}

function renderResults() {
  resetResultDom();
  setResultReportView(activeResultReportView);
  const state = resultPage.buildResultPageRenderState({
    project: getActiveProject(),
    getActiveScenario,
    getBaselineResultState: getValidatedResultState,
    buildResultSummaryData: resultReport.buildResultSummaryData,
    getForecastPeriodDisplayRange,
    getAssetTypeLabel,
    getSiteTypeLabel,
    getStorageConfigText,
    getEnvValueMode,
    getFeeConfigMode
  });
  const { project, scenario, result, view } = state;
  updatePrintReportHeader(project, scenario);

  resultPage.applyResultPageViewModel({ refs, view });
  if (appState.activePage === "results-page") resultHistory.render({ documentRef: document, project, scenario, result, view, downloadCsv });
  if (view.chartPlaceholder) {
    renderResultChartsPlaceholder(view.chartPlaceholder);
    return;
  }
  renderResultCharts(state.verifiedConfig, result);
}

function createCompareRenderers() {
  return {
    renderSensitivityTornadoChart,
    renderSensitivityFactorList,
    renderSensitivityResponseChart,
    renderSensitivityTable,
    renderScenarioRankingChart,
    renderCompareTrendChart,
    renderScenarioFocusList,
    renderScenarioBridgeChart,
    queueCompareChartsResize
  };
}

function renderCompare() {
  renderCompareWorkspaceState();
  const project = getActiveProject();
  if (project) ensureScenarioMetadata(project);
  const frameState = compareAnalysis.buildCompareFrameState({
    project, getBaselineResultState: getValidatedResultState,
    comparePeriod: project ? getForecastPeriodDisplayRange(project) : "-",
    activeCompareScenarioId,
    activeSensitivityFactorKey,
    sensitivitySettings: compareSensitivitySettings
  });
  ({ activeCompareScenarioId, activeSensitivityFactorKey } = compareAnalysis.applyCompareFrameSelection({
    frameState, sensitivitySettings: compareSensitivitySettings, activeCompareScenarioId, activeSensitivityFactorKey
  }));
  comparePage.renderCompareFrame({
    refs,
    setCompareMetric,
    syncCompareSensitivityControls,
    project,
    available: frameState.available,
    compareState: frameState.compareState,
    comparePeriod: frameState.comparePeriod,
    sensitivitySettings: compareSensitivitySettings,
    renderPlaceholder: renderCompareChartPlaceholder,
    detectTopDriver: compareAnalysis.detectTopDriver,
    asCompactMoney,
    asNum,
    renderers: createCompareRenderers()
  });
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
  ...manualScenarioFlow.createManualScenarioImportConfigs({ exportBuilders, scenarioConfig })
});

function manualScenarioFlowContext() {
  const project = getActiveProject();
  return {
    refs,
    configs: MANUAL_SCENARIO_IMPORTS,
    project,
    scenario: project ? getActiveScenario(project) : null,
    actions: {
      getActiveProject: () => appState.activePage === "scenario-page" ? getActiveProject() : null, getActiveScenario,
      setTopMeta,
      downloadCsv,
      readSpreadsheetToCsv,
      querySelector: (selector) => document.querySelector(selector),
      renderDraft: syncScenarioFieldLocks,
      normalizeUserFacingError
    }
  };
}

function exportManualScenarioTemplate(kind) {
  return manualScenarioFlow.exportManualScenarioTemplate({
    ...manualScenarioFlowContext(),
    kind
  });
}

async function importManualScenarioTemplate(kind) {
  return manualScenarioFlow.importManualScenarioTemplate({
    ...manualScenarioFlowContext(),
    kind
  });
}

function syncHistoryExportButtons() {
  const buttonMap = {
    monthTrend: refs.historyExportMonthTrendButton,
    heatmap: refs.historyExportHeatmapButton,
    duration: refs.historyExportDurationButton,
    intradaySpread: refs.historyExportIntradaySpreadButton
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

function getValidatedResultState(project, scenario, result, options = {}) {
  const state = roughPrice.baselineResultState(project, scenario, result);
  if (!state.current && state.reason !== "stale_run") return state;
  const sourceRun = project.priceRuns?.find((run) => run.id === result.sourceContext.runId);
  if (!sourceRun || !priceForecast.validateForecastPriceData(project, sourceRun).ok) {
    return { current: false, reason: "invalid_source_prices", message: "基准结果对应的现货曲线缺失或含无效价格，请生成完整曲线并重新测算。" };
  }
  if (!compareAnalysis.isResultComplete(project, scenario, result, options)) {
    return { current: false, reason: "incomplete_result", message: "结果明细缺失或金额无法对账，请重新发起基准测算。" };
  }
  const priceSourceLabel = sourceRun.supplyDemandInput?.featureConsumption === "not_used_by_demo_model" ? "现货来源为演示曲线" : "";
  return { ...state, priceSourceLabel };
}

function getCurrentExportContext(options = {}) {
  const project = getActiveProject();
  const scenario = project ? getActiveScenario(project) : null;
  const result = project?.resultsByScenario?.[scenario?.id];
  const state = getValidatedResultState(project, scenario, result, options);
  if (!state.current) { setTopMeta(state.message); return null; }
  return { project, scenario, result };
}

function exportResultCsv(kind) {
  const context = getCurrentExportContext({ includeHourly: kind === "hourly" });
  if (!context) return;
  const { project, scenario, result } = context;
  const hourly = kind === "hourly";
  const filename = hourly ? exportBuilders.buildHourlyResultExportFilename : exportBuilders.buildAnnualResultExportFilename;
  const rows = hourly ? exportBuilders.buildHourlyResultExportRows : exportBuilders.buildAnnualResultExportRows;
  const run = project.priceRuns?.find((item) => item.id === result.sourceContext?.runId);
  downloadCsv(filename(project, scenario, result), rows(result, { includeSource: true, run, verifiedConfig: scenario.config }));
}

function exportAnnualCsv() { exportResultCsv("annual"); }
function exportHourlyCsv() { exportResultCsv("hourly"); }

function printScenarioReport() {
  const context = getCurrentExportContext();
  if (!context) return;
  const { project, scenario, result } = context;
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

function renderWorkflowViews() {
  renderHome();
  renderProjects();
  renderEnergyWorkspaceState();
  renderEnergySummary();
  renderEnergyCurveChart();
  renderHistoryPrices();
  renderForecastRuns();
  renderWorkflowContext();
  renderScenarioForm();
  renderResults();
  renderCompareWorkspaceState();
  renderCompare();
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
  renderWorkflowViews();
  window.NE_PROJECT_BACKUP.captureFormState(document);
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
  policyPanel.bindBenchmarkRangeDrag({
    refs,
    windowRef: typeof window !== "undefined" ? window : null,
    handlers: {
      startDrag: startBenchmarkRangeDrag,
      updateDrag: updateBenchmarkRangeDrag,
      stopDrag: stopBenchmarkRangeDrag,
      valueFromClientY: benchmarkValueFromClientY,
      isDragActive: () => Boolean(benchmarkRangeDragHandle),
      getRangeState: () => ({
        rangeMin: appState.benchmarkMap.rangeMin,
        rangeMax: appState.benchmarkMap.rangeMax,
        bounds: benchmarkRangeSliderBounds
      })
    }
  });
}

function createEventBindingModules() {
  return {
    shellEvents,
    historyPage,
    comparePage,
    energyWorkspace,
    scenarioForm,
    resultPage
  };
}

function createEventBindingChartRefs() {
  return {
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
  };
}

function createEventBindingStateAccessors() {
  return {
    compareSensitivitySettings,
    getActiveSensitivityFactorKey: () => activeSensitivityFactorKey,
    setActiveSensitivityFactorKey: (key) => {
      activeSensitivityFactorKey = key;
    },
    setActiveCompareScenarioId: (scenarioId) => {
      activeCompareScenarioId = scenarioId;
    }
  };
}

function createEventBindingActions() {
  return appEventBindings.createAppActionRegistry({
    toggleTheme, renderBenchmarkMap, schedulePersistAppData, adjustBenchmarkMapZoom,
    resetBenchmarkMapZoom, bindBenchmarkRangeDrag, togglePageHelp, goToOverviewSlide,
    openOverviewPolicyDetail, openLoginModal, toggleSidebarGroup, toggleAccountDropdown,
    setHistoryDatePanelOpen, handleAccountManage, handleAccountPassword, handleLogout,
    handleChangePassword, closeLoginModal, handleLoginSubmit, closeOverviewPolicyDetail,
    closeAccountDropdown, closePageHelp, stopOverviewAutoplay, disposeHistoryCharts,
    disposeCompareCharts, disposeResultCharts, persistAppDataNow, normalizeUserFacingError,
    hasUnpersistedAppData: () => !allowStorageReload && (hasUnsubmittedInputs() || appDataSnapshotStore.hasUnpersistedChanges(buildAppDataSnapshot())),
    setTopMeta, sanitizeHistoryAnalysis, renderPolicyPanel, renderHistoryPrices,
    exportHistoryChartData, setActivePage, setResultReportView, queueResultChartsResize,
    sanitizeCompareView, sanitizeCompareSensitivitySettings, renderCompareWorkspaceState,
    renderCompare, queueCompareChartsResize, getActiveProject, isProjectCreateCompleted,
    hasEnergyHistoryEntryReadiness, sanitizeEnergyStep2Choice, createProjectFromForm,
    syncCreateStorageFieldsUi, setCreateSaveMessage, setEnergyImportMessage,
    exportEnergyTemplate, importEnergyFromFile, applyProvinceTypicalCurve,
    renderEnergyStep2ChoiceState, saveScenarioFromForm,
    switchActiveScenario, renameActiveScenario, duplicateActiveScenario, deleteActiveScenario,
    toggleBaselineLock, applyBatchParameter, syncScenarioFieldLocks, exportManualScenarioTemplate,
    importManualScenarioTemplate, updateMarketTradeEnergyDisplay,
    updateEnvValueSpaceDisplay, runCalculation, exportAnnualCsv, exportHourlyCsv,
    printScenarioReport
  });
}

function bindEvents() {
  appEventBindings.bindAppEvents({
    refs,
    documentRef: typeof document !== "undefined" ? document : null,
    windowRef: typeof window !== "undefined" ? window : null,
    appState,
    benchmarkMapZoomStep: BENCHMARK_MAP_ZOOM_STEP,
    modules: createEventBindingModules(),
    chartRefs: createEventBindingChartRefs(),
    state: createEventBindingStateAccessors(),
    actions: createEventBindingActions()
  });
}

function hasUnsubmittedInputs() {
  return window.NE_PROJECT_BACKUP.hasUnsubmittedFormChanges(document)
    || scenarioForm.hasPendingManualImports(appState.projects)
    || supplyDemandFlow.hasUnsavedChanges()
    || roughPriceWorkspace.hasUnsubmittedChanges(document, appState.projects);
}

function bindProjectBackup() {
  window.NE_PROJECT_BACKUP.bind({
    documentRef: document, getSnapshot: buildAppDataSnapshot, hasUnsubmittedChanges: hasUnsubmittedInputs,
    getRecoverySnapshots: () => [
      { label: "其他页面已保存版本", snapshot: appDataSnapshotStore.getConflictState()?.latest },
      { label: "本地存储恢复分支", snapshot: appDataSnapshotStore.getConflictState()?.alternate },
      { label: "本页待保存分支", snapshot: appDataSnapshotStore.getPendingSnapshot() }
    ],
    getAccount: () => appState.auth.loggedIn ? appState.auth.account : "", makeId,
    notify: setTopMeta,
    reload: () => {
      if (scenarioForm.hasPendingManualImports(appState.projects) && !window.confirm("重新加载将丢失尚未确认保存的导入年表。确定继续吗？")) return;
      allowStorageReload = true; cancelScheduledPersistAppData(); window.location.reload();
    },
    restore: (projects) => {
      const restored = projects.map((project, index) => sanitizeProject(project, index));
      if (restored.some((project) => !project)) throw new Error("备份结构无效，未恢复项目。");
      appState.projects.push(...restored);
      appState.activeProjectId = restored[0].id;
      setActivePage("projects-page"); renderAll();
    }
  });
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
  bindProjectBackup();
  syncScenarioFieldLocks();
  setActivePage(appState.activePage || "home-page");
}

init();
