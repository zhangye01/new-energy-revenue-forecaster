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

  return Object.freeze({
    BLOCKED_MESSAGE,
    buildEnergyWorkspaceViewModel,
    shouldRefreshEnergyMessage,
    resolveModeLabel
  });
});
