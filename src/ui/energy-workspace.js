"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_ENERGY_WORKSPACE = api;
  if (root.window && root.window !== root) {
    root.window.NE_ENERGY_WORKSPACE = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const BLOCKED_MESSAGE = "请先完成步骤1基础信息保存，再执行结算电量配置。";

  function disabledControls(overrides = {}) {
    return {
      annualExport: true,
      annualFile: true,
      annualImport: true,
      typicalExport: true,
      typicalFile: true,
      typicalImport: true,
      provinceApply: true,
      ...overrides
    };
  }

  function defaultStep2Actions() {
    return {
      typicalExportText: "导出典型年8760模板",
      typicalImportText: "读取文件并导入",
      typicalImportVariant: "primary",
      provinceApplyText: "调用所选省份典型曲线",
      provinceApplyVariant: "ghost",
      typicalPaneMessage: "",
      provincePaneMessage: ""
    };
  }

  function bindCreateEnergyEvents(input = {}) {
    const {
      refs = {},
      handlers = {}
    } = input;
    refs.createProjectForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      handlers.submitCreateProject?.();
    });
    refs.createHasStorage?.addEventListener("change", () => {
      handlers.syncCreateStorageFields?.();
    });
    refs.createToEnergyButton?.addEventListener("click", () => {
      handlers.enterEnergyPage?.();
    });
    refs.energyToHistoryButton?.addEventListener("click", () => {
      handlers.enterHistoryPage?.();
    });
    refs.exportEnergyAnnualTemplateButton?.addEventListener("click", () => {
      handlers.exportEnergyTemplate?.("annual_hours");
    });
    refs.importEnergyAnnualFileButton?.addEventListener("click", () => {
      handlers.importEnergyFromFile?.("annual_hours", refs.energyAnnualFileInput);
    });
    refs.exportEnergyTypicalTemplateButton?.addEventListener("click", () => {
      handlers.exportEnergyTemplate?.("typical_curve_8760");
    });
    refs.importEnergyTypicalFileButton?.addEventListener("click", () => {
      handlers.importEnergyFromFile?.("typical_curve_8760", refs.energyTypicalFileInput);
    });
    refs.applyEnergyProvinceCurveButton?.addEventListener("click", () => {
      handlers.applyProvinceTypicalCurve?.();
    });
    if (Array.isArray(refs.energyStep2ChoiceButtons)) {
      refs.energyStep2ChoiceButtons.forEach((button) => {
        button.addEventListener("click", () => {
          handlers.changeEnergyStep2Choice?.(button.dataset.energyStep2Choice);
        });
      });
    }
  }

  function hasAllowedValue(allowedValues, value) {
    if (!value) return false;
    if (allowedValues && typeof allowedValues.has === "function") {
      return allowedValues.has(value);
    }
    return Array.isArray(allowedValues) && allowedValues.includes(value);
  }

  function positiveNumberValue(value) {
    return Number.isFinite(value) && value > 0 ? String(value) : "";
  }

  function finiteNumberValue(value) {
    return Number.isFinite(value) ? String(value) : "";
  }

  function buildCreateProjectFormValues(input = {}) {
    const {
      project = null,
      provinceKeys = [],
      assetTypes = [],
      siteTypes = [],
      createReady = false
    } = input;
    if (!project) return null;

    const provinceKnown = hasAllowedValue(provinceKeys, project.province);
    const assetTypeKnown = hasAllowedValue(assetTypes, project.assetType);
    const siteTypeKnown = hasAllowedValue(siteTypes, project.siteType);
    const hasStorageChosen = typeof project.hasStorage === "boolean" && (
      createReady
      || provinceKnown
      || assetTypeKnown
      || siteTypeKnown
      || Number.isFinite(project.capacityMw)
      || Number.isFinite(project.startYear)
      || Number.isFinite(project.forecastYears)
      || Number.isFinite(project.storagePowerMw)
      || Number.isFinite(project.storageDurationH)
      || Boolean(String(project.storageNote || "").trim())
    );
    const energyMode = project.energyData?.mode || project.energyMode || "hourly_8760";

    return {
      projectName: project.name || "",
      province: provinceKnown ? project.province : "",
      assetType: assetTypeKnown ? project.assetType : "",
      siteType: siteTypeKnown ? project.siteType : "",
      hasStorage: hasStorageChosen ? (project.hasStorage ? "yes" : "no") : "",
      storagePower: positiveNumberValue(project.storagePowerMw),
      storageDuration: positiveNumberValue(project.storageDurationH),
      storageNote: project.storageNote || "",
      capacity: positiveNumberValue(project.capacityMw),
      startYear: finiteNumberValue(project.startYear),
      forecastYears: finiteNumberValue(project.forecastYears),
      note: project.note || "",
      energyMode,
      message: `正在编辑当前项目：${project.name}（保存后更新此项目）`
    };
  }

  function setInputValue(target, value) {
    if (target) target.value = value;
  }

  function getTargetValue(target) {
    return target?.value || "";
  }

  function readCreateProjectFormRawInput(input = {}) {
    const {
      refs = {},
      documentRef = null,
      existingProject = null
    } = input;
    const query = (selector) => documentRef?.querySelector?.(selector) || null;
    return {
      name: getTargetValue(query("#create-project-name")),
      province: getTargetValue(refs.createProvince),
      assetType: getTargetValue(query("#create-asset-type")),
      siteType: getTargetValue(query("#create-site-type")),
      hasStorage: getTargetValue(query("#create-has-storage")),
      storagePower: getTargetValue(refs.createStoragePowerMw),
      storageDuration: getTargetValue(refs.createStorageDurationH),
      storageNote: getTargetValue(refs.createStorageNote),
      capacity: getTargetValue(query("#create-capacity-mw")),
      startYear: getTargetValue(query("#create-start-year")),
      forecastYears: getTargetValue(query("#create-forecast-years")),
      energyMode: existingProject?.energyData?.mode || existingProject?.energyMode || "annual_hours",
      note: getTargetValue(query("#create-note"))
    };
  }

  function applyCreateProjectFormValues(input = {}) {
    const {
      refs = {},
      documentRef = null,
      values = null
    } = input;
    if (!values) return false;
    const query = (selector) => documentRef?.querySelector?.(selector) || null;
    setInputValue(query("#create-project-name"), values.projectName);
    setInputValue(refs.createProvince, values.province);
    setInputValue(query("#create-asset-type"), values.assetType);
    setInputValue(query("#create-site-type"), values.siteType);
    setInputValue(query("#create-has-storage"), values.hasStorage);
    setInputValue(refs.createStoragePowerMw, values.storagePower);
    setInputValue(refs.createStorageDurationH, values.storageDuration);
    setInputValue(refs.createStorageNote, values.storageNote);
    setInputValue(query("#create-capacity-mw"), values.capacity);
    setInputValue(query("#create-start-year"), values.startYear);
    setInputValue(query("#create-forecast-years"), values.forecastYears);
    setInputValue(query("#create-note"), values.note);
    return true;
  }

  function applyCreateStorageFieldsState(input = {}) {
    const { refs = {} } = input;
    const storageEnabled = refs.createHasStorage?.value === "yes";
    [
      refs.createStoragePowerField,
      refs.createStorageDurationField,
      refs.createStorageNoteField
    ].forEach((field) => {
      if (field) field.hidden = !storageEnabled;
    });
    [
      refs.createStoragePowerMw,
      refs.createStorageDurationH,
      refs.createStorageNote
    ].forEach((field) => {
      if (field) field.disabled = !storageEnabled;
    });
    return storageEnabled;
  }

  function applyCreateWorkspaceEntryState(input = {}) {
    const {
      refs = {},
      ready = false,
      disabledTitle = "请先保存并完成项目基础信息。"
    } = input;
    if (!refs.createToEnergyButton) return false;
    refs.createToEnergyButton.disabled = !ready;
    if (ready) {
      refs.createToEnergyButton.removeAttribute?.("title");
    } else {
      refs.createToEnergyButton.title = disabledTitle;
    }
    return true;
  }

  function getCreateSaveMessageStyle(tone = "info") {
    if (tone === "success") {
      return { borderColor: "#8fb48d", background: "#f1fbf1" };
    }
    if (tone === "warn") {
      return { borderColor: "#d6bb90", background: "#fff8ed" };
    }
    return { borderColor: "#97b5d8", background: "#f6faff" };
  }

  function applyCreateSaveMessage(input = {}) {
    const {
      refs = {},
      text = "",
      tone = "info"
    } = input;
    if (!refs.createSaveMessage) return false;
    refs.createSaveMessage.textContent = text;
    const style = getCreateSaveMessageStyle(tone);
    refs.createSaveMessage.style.borderColor = style.borderColor;
    refs.createSaveMessage.style.background = style.background;
    return true;
  }

  function templateStatus(text, stateClass, title = "") {
    return { text, stateClass, title };
  }

  function shouldRefreshEnergyMessage(currentMessage, blockedMessage, isProjectSwitched) {
    const message = String(currentMessage || "").trim();
    return (
      isProjectSwitched
      || !message
      || message === blockedMessage
      || message.includes("请先在“我的项目”进入一个项目")
      || message.includes("请先创建")
      || message.includes("支持自动识别")
      || message.includes("当前识别模式")
      || message.includes("当前已生成")
      || message.includes("当前生成")
    );
  }

  function resolveModeLabel(annualInputYears, typicalCurveSource) {
    if (annualInputYears <= 0) return "待配置";
    if (typicalCurveSource === "province_typical_curve") return "逐年总量 + 省份典型曲线";
    if (typicalCurveSource === "typical_curve_8760") return "逐年总量 + 典型年8760小时模板";
    return "仅逐年总量";
  }

  function buildEnergyWorkspaceViewModel(input = {}) {
    const {
      project = null,
      createReady = false,
      energyState = {},
      exports = {},
      labels = {},
      currentMessage = "",
      isProjectSwitched = false,
      activeStep2Choice = "typical",
      missingYears = [],
      formatExportTime = (value) => value
    } = input;

    const base = {
      message: null,
      mode: "annual_hours",
      nextStep2Choice: activeStep2Choice === "province" ? "province" : "typical",
      resetMessageProjectId: false,
      projectIdForMessage: project?.id || "",
      projectContext: "",
      metrics: {
        period: "-",
        mode: "-",
        completeYears: "0/0",
        totalMwh: "0.00"
      },
      historyButton: {
        enabled: false,
        title: "请先进入项目并完成上网电量配置。"
      },
      controls: disabledControls(),
      templateStatuses: {
        annual: templateStatus("待进入项目", "blocked"),
        typical: templateStatus("待进入项目", "blocked"),
        province: templateStatus("待进入项目", "blocked")
      },
      step2Actions: defaultStep2Actions()
    };

    if (!project) {
      return {
        ...base,
        resetMessageProjectId: true,
        projectContext: "请选择项目并完成基础信息保存后，再执行上网电量配置。",
        message: {
          text: "请先在“我的项目”进入一个项目，再执行模板导出与文件导入。",
          tone: "info"
        }
      };
    }

    const energyData = energyState.energyData || {};
    const totalYears = Number(energyState.totalYears) || 0;
    const annualInputYears = Number(energyState.annualInputYears) || 0;
    const completeYears = Number(energyState.completeYears) || 0;
    const totalEnergyMwh = Number(energyState.totalEnergyMwh) || 0;
    const hasTypicalCurve = Boolean(energyState.hasTypicalCurve);
    const ready = Boolean(energyState.ready);
    const periodText = createReady ? labels.periodText : "待保存";
    const projectContext = createReady
      ? `当前项目：${project.name} | ${labels.provinceName || ""} / ${labels.assetTypeLabel || ""} / ${labels.siteTypeLabel || ""} / ${labels.storageText || ""} | 预测周期 ${periodText}`
      : `当前项目：${project.name}。基础信息尚未完成，请先补齐省份、风/光类型、陆/海类型、配储信息、装机容量、开始年份和预测周期。`;

    const model = {
      ...base,
      mode: energyData.mode || "annual_hours",
      nextStep2Choice: isProjectSwitched
        ? (energyData.typicalCurveSource === "province_typical_curve" ? "province" : "typical")
        : base.nextStep2Choice,
      projectContext,
      metrics: {
        period: periodText,
        mode: resolveModeLabel(annualInputYears, energyData.typicalCurveSource),
        completeYears: `${completeYears}/${totalYears || 0}`,
        totalMwh: totalEnergyMwh.toFixed(2)
      },
      historyButton: {
        enabled: ready,
        title: ready ? "进入下一步，查看历史现货电价分析。" : "请先完成全部预测年份的结算电量配置。"
      }
    };

    if (!createReady) {
      return {
        ...model,
        templateStatuses: {
          annual: templateStatus("待基础信息保存", "blocked"),
          typical: templateStatus("待基础信息保存", "blocked"),
          province: templateStatus("待基础信息保存", "blocked")
        },
        message: {
          text: BLOCKED_MESSAGE,
          tone: "warn"
        }
      };
    }

    const annualReady = totalYears > 0 && annualInputYears === totalYears;
    const step2Actions = defaultStep2Actions();
    if (annualReady && energyData.typicalCurveSource === "typical_curve_8760") {
      step2Actions.typicalExportText = "重新导出模板";
      step2Actions.typicalImportText = "读取文件并更新典型曲线";
      step2Actions.typicalImportVariant = "ghost";
      step2Actions.typicalPaneMessage = "当前正在使用这套典型年8760模板；如需替换，可重新上传覆盖。";
    } else if (annualReady && energyData.typicalCurveSource === "province_typical_curve") {
      step2Actions.provinceApplyText = "重新调用当前省份曲线";
      step2Actions.provincePaneMessage = `当前正在使用 ${labels.provinceCurveText || ""} 典型曲线；如需刷新，可重新调用。`;
    }

    let message = null;
    if (shouldRefreshEnergyMessage(currentMessage, BLOCKED_MESSAGE, isProjectSwitched)) {
      if (!annualInputYears) {
        message = {
          text: "步骤1必做：请先导出并上传逐年总量模板，填写测算周期内各年的总小时数。",
          tone: "info"
        };
      } else if (!annualReady) {
        message = {
          text: `逐年总量已录入 ${annualInputYears}/${totalYears} 年，请先补齐全部年度总小时数。`,
          tone: "warn"
        };
      } else if (!hasTypicalCurve) {
        message = {
          text: "步骤2二选一：请上传典型年8760小时模板，或直接调用所选省份典型曲线。",
          tone: "info"
        };
      } else if (ready) {
        message = {
          text: `逐年总量与典型曲线来源已配置完成，可进入历史电价分析。当前已生成 ${completeYears}/${totalYears} 年上网电量。`,
          tone: "success"
        };
      } else {
        const missingHint = missingYears.length ? `；待补年份：${missingYears.join("、")}` : "";
        message = {
          text: `已完成逐年总量与典型曲线配置，当前生成 ${completeYears}/${totalYears} 年上网电量${missingHint}。`,
          tone: "warn"
        };
      }
    }

    return {
      ...model,
      controls: disabledControls({
        annualExport: false,
        annualFile: false,
        annualImport: false,
        typicalExport: false,
        typicalFile: !annualReady,
        typicalImport: !annualReady,
        provinceApply: !annualReady
      }),
      templateStatuses: {
        annual: templateStatus(
          annualInputYears > 0 ? `已录入 ${annualInputYears}/${totalYears} 年` : (exports.annual_hours ? `已导出 ${formatExportTime(exports.annual_hours)}` : "未导出"),
          annualReady ? "ready" : "pending",
          exports.annual_hours || ""
        ),
        typical: templateStatus(
          energyData.typicalCurveSource === "typical_curve_8760"
            ? "已导入典型年8760小时模板"
            : (exports.typical_curve_8760 ? `已导出 ${formatExportTime(exports.typical_curve_8760)}` : "待导出"),
          energyData.typicalCurveSource === "typical_curve_8760" ? "ready" : "pending",
          exports.typical_curve_8760 || ""
        ),
        province: templateStatus(
          energyData.typicalCurveSource === "province_typical_curve"
            ? `已调用 ${labels.provinceCurveText || ""} 典型曲线`
            : (exports.province_typical_curve ? `最近调用 ${formatExportTime(exports.province_typical_curve)}` : "待调用"),
          energyData.typicalCurveSource === "province_typical_curve" ? "ready" : "pending",
          exports.province_typical_curve || ""
        )
      },
      step2Actions,
      message
    };
  }

  function collectCompleteAnnualEnergyRows(project = {}, energyData = {}) {
    const forecastYears = Number.isInteger(project.forecastYears) && project.forecastYears > 0
      ? project.forecastYears
      : 0;
    const rows = [];
    for (let i = 0; i < forecastYears; i += 1) {
      const year = project.startYear + i;
      const item = energyData.annualSummary?.[year];
      if (item?.status === "完整" && Array.isArray(energyData.hourlyByYear?.[year]) && energyData.hourlyByYear[year].length === 8760) {
        rows.push({
          year,
          annualHours: Number(item.annualHours) || 0,
          energyMwh: Number(item.energyMwh) || 0
        });
      }
    }
    return rows;
  }

  function buildEnergySummaryNote(input = {}) {
    const {
      project = null,
      createReady = false,
      energyState = {},
      sourceLabel = "",
      missingYears = []
    } = input;
    if (!project) {
      return "请先在“我的项目”中进入一个项目，再查看结算电量配置摘要。";
    }
    if (!createReady) {
      return "请先完成步骤1基础信息保存，再查看结算电量配置摘要。";
    }
    const {
      completeYears = 0,
      totalYears = 0,
      annualInputYears = 0,
      hasTypicalCurve = false,
      energyData = {}
    } = energyState;
    if (!totalYears) {
      return "当前预测周期未设定，暂无法生成结算电量配置摘要。";
    }
    if (!annualInputYears) {
      return "当前尚未导入逐年总量模板数据。请先完成步骤1逐年总量导入。";
    }
    if (!hasTypicalCurve) {
      return `已录入 ${annualInputYears}/${totalYears} 年逐年总量；第二步待完成，当前尚未选择典型曲线来源。请上传典型年8760小时模板，或调用所选省份典型曲线。`;
    }
    const annualRows = collectCompleteAnnualEnergyRows(project, energyData);
    if (!annualRows.length) {
      return "逐年总量与典型曲线已识别，但尚未生成完整年度曲线，请重新导入逐年总量或重新调用典型曲线。";
    }
    const sourceText = energyData.typicalCurveSource === "province_typical_curve"
      ? `来源：已调用 ${sourceLabel} 典型曲线`
      : "来源：已导入典型年8760小时模板";
    const hoursValues = annualRows.map((item) => item.annualHours);
    const energyValues = annualRows.map((item) => item.energyMwh);
    const missingText = missingYears.length ? `；待补年份：${missingYears.join("、")}` : "；预测周期内年份已全部覆盖";
    return `${sourceText}；已完成 ${completeYears}/${totalYears} 年电量导入；年度小时范围 ${Math.min(...hoursValues).toFixed(2)}-${Math.max(...hoursValues).toFixed(2)} h；年度上网电量范围 ${Math.min(...energyValues).toFixed(2)}-${Math.max(...energyValues).toFixed(2)} MWh${missingText}。`;
  }

  return Object.freeze({
    BLOCKED_MESSAGE,
    applyCreateProjectFormValues,
    applyCreateSaveMessage,
    applyCreateStorageFieldsState,
    applyCreateWorkspaceEntryState,
    bindCreateEnergyEvents,
    buildCreateProjectFormValues,
    buildEnergySummaryNote,
    buildEnergyWorkspaceViewModel,
    collectCompleteAnnualEnergyRows,
    readCreateProjectFormRawInput,
    shouldRefreshEnergyMessage,
    resolveModeLabel
  });
});
