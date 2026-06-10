"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_PROJECT_MODEL = api;
  if (root.window && root.window !== root) {
    root.window.NE_PROJECT_MODEL = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const PROJECT_WORKSPACE_BUCKET_SET = new Set(["new", "history"]);
  const ASSET_TYPE_SET = new Set(["wind", "photovoltaic"]);
  const SITE_TYPE_SET = new Set(["onshore", "offshore"]);
  const ENERGY_MODE_SET = new Set(["hourly_8760", "annual_hours", "typical_curve_8760", "province_typical_curve"]);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function trimText(value) {
    return typeof value === "string" ? value.trim() : String(value || "").trim();
  }

  function hasAllowedValue(allowedValues, value) {
    if (!value) return false;
    if (allowedValues && typeof allowedValues.has === "function") {
      return allowedValues.has(value);
    }
    return Array.isArray(allowedValues) && allowedValues.includes(value);
  }

  function normalizeEnergyMode(mode) {
    return ENERGY_MODE_SET.has(mode) ? mode : "annual_hours";
  }

  function createEmptyEnergyDataState(mode = "annual_hours") {
    return {
      mode: normalizeEnergyMode(mode),
      annualInputByYear: {},
      typicalCurveSource: "",
      typicalCurveProfile: [],
      hourlyByYear: {},
      annualSummary: {}
    };
  }

  function createEmptyEnergyTemplateExports() {
    return {
      hourly_8760: "",
      annual_hours: "",
      typical_curve_8760: "",
      province_typical_curve: ""
    };
  }

  function createMockHistoryProject(options = {}) {
    const nowIso = resolveNowIso(options);
    const startYear = Number.isInteger(options.startYear) ? options.startYear : Math.max(2026, resolveCurrentYear(options));
    const project = {
      id: typeof options.id === "string" && options.id ? options.id : resolveMakeId(options)("proj"),
      ownerAccount: typeof options.ownerAccount === "string" ? options.ownerAccount.trim() : "",
      workspaceBucket: "history",
      name: typeof options.name === "string" && options.name ? options.name : "江苏海上风电示例项目",
      province: "jiangsu",
      assetType: "wind",
      siteType: "offshore",
      hasStorage: true,
      storagePowerMw: 64,
      storageDurationH: 2,
      storageNote: "按装机容量20% / 2h生成的示例配储口径",
      capacityMw: 320,
      startYear,
      forecastYears: 30,
      energyMode: "annual_hours",
      note: "系统自动生成的历史项目示例",
      createdAt: nowIso,
      statuses: isPlainObject(options.statuses) ? { ...options.statuses } : {},
      energyData: createEmptyEnergyDataState("annual_hours"),
      energyTemplateExports: createEmptyEnergyTemplateExports(),
      historySpotImport: isPlainObject(options.historySpotImport) ? { ...options.historySpotImport } : {},
      priceRuns: [],
      activeRunId: null,
      activationLogs: [],
      spotMarketConfig: isPlainObject(options.spotMarketConfig) ? { ...options.spotMarketConfig } : {},
      scenarios: [],
      activeScenarioId: null,
      resultsByScenario: {}
    };
    project.statuses["create-page"] = "completed";
    const baselineScenario = typeof options.createBaselineScenario === "function"
      ? options.createBaselineScenario(project)
      : options.baselineScenario;
    if (isPlainObject(baselineScenario)) {
      project.scenarios.push(baselineScenario);
      project.activeScenarioId = baselineScenario.id || null;
    }
    return project;
  }

  function createEmptyWorkspaceProject(options = {}) {
    const nowIso = resolveNowIso(options);
    const project = {
      id: typeof options.id === "string" && options.id ? options.id : resolveMakeId(options)("proj"),
      ownerAccount: typeof options.ownerAccount === "string" ? options.ownerAccount.trim() : "",
      workspaceBucket: "new",
      name: typeof options.name === "string" && options.name ? options.name : "新建项目",
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
      createdAt: nowIso,
      statuses: isPlainObject(options.statuses) ? { ...options.statuses } : {},
      energyData: createEmptyEnergyDataState("annual_hours"),
      energyTemplateExports: createEmptyEnergyTemplateExports(),
      historySpotImport: isPlainObject(options.historySpotImport) ? { ...options.historySpotImport } : {},
      priceRuns: [],
      activeRunId: null,
      activationLogs: [],
      spotMarketConfig: isPlainObject(options.spotMarketConfig) ? { ...options.spotMarketConfig } : {},
      scenarios: [],
      activeScenarioId: null,
      resultsByScenario: {}
    };
    const baselineScenario = typeof options.createBaselineScenario === "function"
      ? options.createBaselineScenario(project)
      : options.baselineScenario;
    if (isPlainObject(baselineScenario)) {
      project.scenarios.push(baselineScenario);
      project.activeScenarioId = baselineScenario.id || null;
    }
    return project;
  }

  function createProjectRecord(input = {}, options = {}) {
    const nowIso = resolveNowIso(options);
    const energyMode = normalizeEnergyMode(input.energyMode);
    return {
      id: typeof options.id === "string" && options.id ? options.id : resolveMakeId(options)("proj"),
      ownerAccount: typeof options.ownerAccount === "string" ? options.ownerAccount.trim() : "",
      workspaceBucket: PROJECT_WORKSPACE_BUCKET_SET.has(options.workspaceBucket) ? options.workspaceBucket : "history",
      name: input.name || "新建项目",
      province: input.province || "",
      assetType: input.assetType || "",
      siteType: input.siteType || "",
      hasStorage: Boolean(input.hasStorage),
      storagePowerMw: Number.isFinite(input.storagePowerMw) ? input.storagePowerMw : null,
      storageDurationH: Number.isFinite(input.storageDurationH) ? input.storageDurationH : null,
      storageNote: typeof input.storageNote === "string" ? input.storageNote : "",
      capacityMw: Number.isFinite(input.capacityMw) ? input.capacityMw : 0,
      startYear: Number.isInteger(input.startYear) ? input.startYear : resolveCurrentYear(options),
      forecastYears: Number.isInteger(input.forecastYears) ? clamp(input.forecastYears, 1, 30) : 30,
      energyMode,
      note: typeof input.note === "string" ? input.note : "",
      createdAt: nowIso,
      statuses: isPlainObject(options.statuses) ? { ...options.statuses } : {},
      energyData: createEmptyEnergyDataState(energyMode),
      energyTemplateExports: createEmptyEnergyTemplateExports(),
      historySpotImport: isPlainObject(options.historySpotImport) ? { ...options.historySpotImport } : {},
      priceRuns: [],
      activeRunId: null,
      activationLogs: [],
      spotMarketConfig: isPlainObject(options.spotMarketConfig) ? { ...options.spotMarketConfig } : {},
      scenarios: [],
      activeScenarioId: null,
      resultsByScenario: {}
    };
  }

  function resolveNowIso(options = {}) {
    if (typeof options.nowIso === "function") return options.nowIso();
    if (typeof options.nowIso === "string" && options.nowIso) return options.nowIso;
    return new Date().toISOString();
  }

  function resolveCurrentYear(options = {}) {
    return Number.isInteger(options.currentYear) ? options.currentYear : new Date().getFullYear();
  }

  function resolveMakeId(options = {}) {
    return typeof options.makeId === "function" ? options.makeId : ((prefix) => `${prefix}-${Date.now()}`);
  }

  function normalizeCreateProjectFormInput(rawInput = {}, options = {}) {
    const currentYear = resolveCurrentYear(options);
    let name = trimText(rawInput.name);
    if (!name && options.autoUniqueName) {
      name = "新建项目";
    }
    const storageChoice = trimText(rawInput.hasStorage);
    const hasStorage = storageChoice === "yes";
    const storagePowerRaw = trimText(rawInput.storagePower);
    const storageDurationRaw = trimText(rawInput.storageDuration);
    const storageNoteRaw = trimText(rawInput.storageNote);
    const capacityRaw = trimText(rawInput.capacity);
    const startYearRaw = trimText(rawInput.startYear);
    const forecastYearsRaw = trimText(rawInput.forecastYears);
    const storagePowerInput = Number(storagePowerRaw);
    const storageDurationInput = Number(storageDurationRaw);
    const capacityInput = Number(capacityRaw);
    const startYearInput = Number(startYearRaw);
    const forecastYearsInput = Number(forecastYearsRaw);
    return {
      name,
      province: trimText(rawInput.province),
      assetType: trimText(rawInput.assetType),
      siteType: trimText(rawInput.siteType),
      storageChoice,
      hasStorage,
      storagePowerInput,
      storageDurationInput,
      capacityInput,
      startYearInput,
      forecastYearsInput,
      storagePowerMw: hasStorage && Number.isFinite(storagePowerInput) && storagePowerInput > 0 ? storagePowerInput : null,
      storageDurationH: hasStorage && Number.isFinite(storageDurationInput) && storageDurationInput > 0 ? storageDurationInput : null,
      storageNote: hasStorage ? storageNoteRaw : "",
      capacityMw: Number.isFinite(capacityInput) && capacityInput > 0 ? capacityInput : 0,
      startYear: Number.isFinite(startYearInput) && startYearInput >= 2026 ? Math.floor(startYearInput) : currentYear,
      forecastYears: clamp(
        Number.isFinite(forecastYearsInput) && forecastYearsInput > 0 ? Math.floor(forecastYearsInput) : 30,
        1,
        30
      ),
      energyMode: normalizeEnergyMode(rawInput.energyMode),
      note: trimText(rawInput.note)
    };
  }

  function validateCreateProjectFormInput(input = {}, options = {}) {
    if (!input.name) {
      return {
        topMeta: "项目名称不能为空",
        message: "保存失败：请先填写项目名称。"
      };
    }
    if (options.forceCreate) return null;
    if (!hasAllowedValue(options.provinceKeys, input.province)) {
      return {
        topMeta: "请选择省份。",
        message: "保存失败：请选择省份。"
      };
    }
    if (!hasAllowedValue(options.assetTypes, input.assetType)) {
      return {
        topMeta: "请选择风/光类型。",
        message: "保存失败：请选择风/光类型。"
      };
    }
    if (!hasAllowedValue(options.siteTypes, input.siteType)) {
      return {
        topMeta: "请选择陆/海类型。",
        message: "保存失败：请选择陆/海类型。"
      };
    }
    if (!["yes", "no"].includes(input.storageChoice)) {
      return {
        topMeta: "请选择是否配建储能。",
        message: "保存失败：请选择是否配建储能。"
      };
    }
    if (input.hasStorage && (!Number.isFinite(input.storagePowerInput) || input.storagePowerInput <= 0)) {
      return {
        topMeta: "请填写有效的储能功率（MW）。",
        message: "保存失败：储能功率未填写或格式无效。"
      };
    }
    if (input.hasStorage && (!Number.isFinite(input.storageDurationInput) || input.storageDurationInput <= 0)) {
      return {
        topMeta: "请填写有效的储能时长（h）。",
        message: "保存失败：储能时长未填写或格式无效。"
      };
    }
    if (!Number.isFinite(input.capacityInput) || input.capacityInput <= 0) {
      return {
        topMeta: "请填写有效的装机容量（MW）。",
        message: "保存失败：装机容量未填写或格式无效。"
      };
    }
    if (!Number.isFinite(input.startYearInput) || input.startYearInput < 2026) {
      return {
        topMeta: "开始年份需为2026及以后。",
        message: "保存失败：请填写有效的开始年份（>=2026）。"
      };
    }
    if (!Number.isFinite(input.forecastYearsInput) || input.forecastYearsInput < 1) {
      return {
        topMeta: "预测周期需为1-30年。",
        message: "保存失败：请填写有效的预测周期（1-30年）。"
      };
    }
    return null;
  }

  function buildCreateProjectFormInput(rawInput = {}, options = {}) {
    const input = normalizeCreateProjectFormInput(rawInput, options);
    return {
      input,
      error: validateCreateProjectFormInput(input, options)
    };
  }

  function sanitizeProjectBase(rawProject, index = 0, options = {}) {
    if (!isPlainObject(rawProject)) return null;
    const makeId = resolveMakeId(options);
    const nowIso = resolveNowIso(options);
    const currentYear = resolveCurrentYear(options);
    const provinceKeys = new Set(Array.isArray(options.provinceKeys) ? options.provinceKeys : []);
    const resolveUniqueName = typeof options.resolveUniqueName === "function"
      ? options.resolveUniqueName
      : ((name) => name);
    const isNewDraft = rawProject.workspaceBucket === "new";
    const rawName = typeof rawProject.name === "string" ? rawProject.name.trim() : "";
    const rawCapacity = Number(rawProject.capacityMw);
    const rawStoragePower = Number(rawProject.storagePowerMw);
    const rawStorageDuration = Number(rawProject.storageDurationH);
    const hasStorage = Boolean(rawProject.hasStorage);
    const migratedStoragePower = hasStorage && (!Number.isFinite(rawStoragePower) || rawStoragePower <= 0) && Number.isFinite(rawCapacity) && rawCapacity > 0
      ? Number((rawCapacity * 0.2).toFixed(1))
      : null;
    const migratedStorageDuration = hasStorage && (!Number.isFinite(rawStorageDuration) || rawStorageDuration <= 0)
      ? 2
      : null;
    const rawStartYear = Number(rawProject.startYear);
    const rawForecastYears = Number(rawProject.forecastYears);
    return {
      id: typeof rawProject.id === "string" && rawProject.id ? rawProject.id : makeId("proj"),
      ownerAccount: typeof rawProject.ownerAccount === "string"
        ? rawProject.ownerAccount.trim()
        : (typeof rawProject.account === "string" ? rawProject.account.trim() : ""),
      workspaceBucket: PROJECT_WORKSPACE_BUCKET_SET.has(rawProject.workspaceBucket) ? rawProject.workspaceBucket : "history",
      name: rawName || (isNewDraft ? resolveUniqueName("新建项目") : `项目${index + 1}`),
      province: provinceKeys.has(rawProject.province) ? rawProject.province : (isNewDraft ? "" : "shandong"),
      assetType: ASSET_TYPE_SET.has(rawProject.assetType) ? rawProject.assetType : (isNewDraft ? "" : "wind"),
      siteType: SITE_TYPE_SET.has(rawProject.siteType) ? rawProject.siteType : (isNewDraft ? "" : "onshore"),
      hasStorage,
      storagePowerMw: Number.isFinite(rawStoragePower) && rawStoragePower > 0 ? rawStoragePower : migratedStoragePower,
      storageDurationH: Number.isFinite(rawStorageDuration) && rawStorageDuration > 0 ? rawStorageDuration : migratedStorageDuration,
      storageNote: typeof rawProject.storageNote === "string" ? rawProject.storageNote : "",
      capacityMw: Number.isFinite(rawCapacity) ? rawCapacity : (isNewDraft ? null : 0),
      startYear: Number.isFinite(rawStartYear) ? Math.floor(rawStartYear) : (isNewDraft ? null : currentYear),
      forecastYears: Number.isFinite(rawForecastYears) ? clamp(Math.floor(rawForecastYears), 1, 30) : (isNewDraft ? null : 30),
      energyMode: normalizeEnergyMode(rawProject.energyMode),
      note: typeof rawProject.note === "string" ? rawProject.note : "",
      createdAt: typeof rawProject.createdAt === "string" && rawProject.createdAt ? rawProject.createdAt : nowIso
    };
  }

  function sanitizePriceRuns(rawRuns, options = {}) {
    if (!Array.isArray(rawRuns)) return [];
    const makeId = resolveMakeId(options);
    const nowIso = resolveNowIso(options);
    return rawRuns
      .filter(isPlainObject)
      .map((run) => ({
        ...run,
        id: typeof run.id === "string" && run.id ? run.id : makeId("run"),
        createdAt: typeof run.createdAt === "string" && run.createdAt ? run.createdAt : nowIso,
        pricesByYear: isPlainObject(run.pricesByYear) ? run.pricesByYear : {}
      }));
  }

  function resolveActiveRunId(priceRuns, rawActiveRunId) {
    return Array.isArray(priceRuns) && priceRuns.some((run) => run.id === rawActiveRunId) ? rawActiveRunId : null;
  }

  function sanitizeActivationLogs(rawLogs, options = {}) {
    if (!Array.isArray(rawLogs)) return [];
    const makeId = resolveMakeId(options);
    const nowIso = resolveNowIso(options);
    return rawLogs
      .filter(isPlainObject)
      .map((item) => ({
        id: typeof item.id === "string" && item.id ? item.id : makeId("act"),
        fromRunId: typeof item.fromRunId === "string" ? item.fromRunId : "-",
        toRunId: typeof item.toRunId === "string" ? item.toRunId : "-",
        reason: typeof item.reason === "string" ? item.reason : "",
        changedAt: typeof item.changedAt === "string" && item.changedAt ? item.changedAt : nowIso
      }));
  }

  return Object.freeze({
    normalizeEnergyMode,
    buildCreateProjectFormInput,
    normalizeCreateProjectFormInput,
    validateCreateProjectFormInput,
    createProjectRecord,
    createMockHistoryProject,
    createEmptyWorkspaceProject,
    createEmptyEnergyDataState,
    createEmptyEnergyTemplateExports,
    sanitizeProjectBase,
    sanitizePriceRuns,
    resolveActiveRunId,
    sanitizeActivationLogs
  });
});
