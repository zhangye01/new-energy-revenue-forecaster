"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_CREATE_PROJECT_FLOW = api;
  if (root.window && root.window !== root) {
    root.window.NE_CREATE_PROJECT_FLOW = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function resetEnergyTemplateExports(exports = {}) {
    exports.hourly_8760 = "";
    exports.annual_hours = "";
    exports.typical_curve_8760 = "";
    exports.province_typical_curve = "";
    return exports;
  }

  function updateExistingProjectFromForm(input = {}) {
    const {
      project = null,
      projectInput = {},
      targetPage = "create-page",
      appState = {},
      modules = {},
      actions = {}
    } = input;
    const { projectModel } = modules;
    if (!project || !projectModel) return null;
    const oldProvince = project.province;
    const baseChanged = projectModel.hasProjectBaseInputChanged(project, projectInput);

    projectModel.applyCreateProjectInput(project, projectInput);
    project.statuses["create-page"] = actions.isProjectCreateCompleted?.(project) ? "completed" : "in_progress";
    const provinceDefaultsAutoSynced = actions.syncProjectProvinceDefaultsToBaseline?.(project, {
      force: actions.shouldAutoSyncProvinceDefaults?.(project)
    });
    actions.syncProjectProvinceScopedState?.(project, { force: true });

    if (baseChanged) {
      project.energyData = actions.createEmptyEnergyDataState?.(projectInput.energyMode);
      project.historySpotImport = actions.createEmptyHistorySpotImport?.();
      actions.clearHistoryAnalysisCacheForProject?.(project.id);
      resetEnergyTemplateExports(actions.ensureProjectEnergyTemplateExports?.(project));
      project.statuses["energy-page"] = "in_progress";
      project.statuses["history-page"] = "not_started";
      actions.markDownstreamStale?.(project, "energy-page");
      actions.setTopMeta?.("当前项目已更新，请在步骤2重新导入电量。");
      applyBaseChangedMessage({ project, oldProvince, projectInput, provinceDefaultsAutoSynced, actions });
    } else {
      if (!project.energyData || typeof project.energyData !== "object") {
        project.energyData = actions.createEmptyEnergyDataState?.(projectInput.energyMode);
      } else {
        const energyState = actions.ensureProjectEnergyDataState?.(project);
        if (energyState) energyState.mode = projectInput.energyMode;
      }
      if (project.statuses["energy-page"] === "not_started") {
        project.statuses["energy-page"] = "in_progress";
      }
      actions.setTopMeta?.("当前项目已保存。");
      const message = provinceDefaultsAutoSynced
        ? `已更新当前项目：${project.name}。${actions.getProvinceName?.(project.province)}默认参数已同步到基准场景。`
        : `已更新当前项目：${project.name}。`;
      actions.setCreateSaveMessage?.(message, "success");
    }

    actions.ensureProjectEnergyTemplateExports?.(project);
    const movedToHistory = actions.moveProjectToHistoryWorkspaceIfReady?.(project);
    actions.setCreateFormSyncedProjectId?.(project.id);
    appState.activeProjectId = project.id;
    if (movedToHistory) {
      actions.setTopMeta?.("当前项目已完成基础信息校准，已转入历史项目工作区。");
      actions.setCreateSaveMessage?.(`已更新当前项目：${project.name}。已转入历史项目工作区。`, "success");
    }
    actions.setActivePage?.(targetPage);
    if (targetPage === "create-page") {
      actions.scrollCreateWorkspaceToBottom?.();
    }
    return project;
  }

  function applyBaseChangedMessage(input = {}) {
    const {
      project = {},
      oldProvince = "",
      projectInput = {},
      provinceDefaultsAutoSynced = false,
      actions = {}
    } = input;
    if (provinceDefaultsAutoSynced) {
      actions.setCreateSaveMessage?.(`已更新当前项目：${project.name}。基础参数变化，请重新导入电量；${actions.getProvinceName?.(project.province)}默认参数已同步到基准场景。`, "warn");
    } else if (oldProvince !== projectInput.province) {
      actions.setCreateSaveMessage?.(`已更新当前项目：${project.name}。基础参数变化，请重新导入电量，并在全口径收入配置页复核${actions.getProvinceName?.(project.province)}默认参数。`, "warn");
    } else {
      actions.setCreateSaveMessage?.(`已更新当前项目：${project.name}。基础参数变化，请重新导入电量。`, "warn");
    }
  }

  function saveCreateProjectFromForm(input = {}) {
    const {
      options = {},
      refs = {},
      documentRef = null,
      appState = {},
      modules = {},
      sets = {},
      actions = {}
    } = input;
    const { projectModel, energyWorkspace } = modules;
    const {
      targetPage = "create-page",
      appendToBottom = false,
      autoUniqueName = false,
      workspaceBucket = "history",
      forceCreate = false
    } = options;
    const existingProject = forceCreate ? null : actions.getActiveProject?.();
    const formState = projectModel.buildCreateProjectFormInput(energyWorkspace.readCreateProjectFormRawInput({
      refs,
      documentRef,
      existingProject
    }), {
      autoUniqueName,
      forceCreate,
      currentYear: new Date().getFullYear(),
      provinceKeys: sets.provinceKeys,
      assetTypes: sets.assetTypes,
      siteTypes: sets.siteTypes
    });
    if (formState.error) {
      actions.setTopMeta?.(formState.error.topMeta);
      actions.setCreateSaveMessage?.(formState.error.message, "warn");
      return null;
    }
    const projectInput = {
      ...formState.input,
      name: !existingProject && autoUniqueName ? actions.resolveUniqueProjectName?.(formState.input.name) : formState.input.name
    };
    if (existingProject) {
      return updateExistingProjectFromForm({ project: existingProject, projectInput, targetPage, appState, modules, actions });
    }
    return createProjectFromValidatedInput({
      projectInput,
      appendToBottom,
      workspaceBucket,
      targetPage,
      appState,
      modules,
      actions
    });
  }

  function createProjectFromValidatedInput(input = {}) {
    const {
      projectInput = {},
      appendToBottom = false,
      workspaceBucket = "history",
      targetPage = "create-page",
      appState = {},
      modules = {},
      actions = {}
    } = input;
    const nowIso = new Date().toISOString();
    const project = modules.projectModel.createProjectRecordWithBaseline(projectInput, {
      id: actions.makeId?.("proj"),
      ownerAccount: String(appState.auth?.account || "").trim(),
      workspaceBucket,
      nowIso,
      statuses: actions.statusMapTemplate?.(),
      historySpotImport: actions.createEmptyHistorySpotImport?.(),
      spotMarketConfig: actions.createDefaultSpotMarketConfig?.(),
      isProjectCreateCompleted: actions.isProjectCreateCompleted,
      createBaselineScenario: (targetProject) => actions.createBaselineScenario?.(targetProject, { nowIso: targetProject.createdAt })
    });
    if (!Array.isArray(appState.projects)) appState.projects = [];
    if (appendToBottom) {
      appState.projects.push(project);
    } else {
      appState.projects.unshift(project);
    }
    actions.setCreateFormSyncedProjectId?.(project.id);
    appState.activeProjectId = project.id;
    actions.syncProjectProvinceScopedState?.(project, { force: true });
    actions.moveProjectToHistoryWorkspaceIfReady?.(project);
    actions.setCreateSaveMessage?.(`已创建新项目：${project.name}。`, "success");
    actions.setActivePage?.(targetPage);
    if (targetPage === "create-page") {
      actions.scrollCreateWorkspaceToBottom?.();
    }
    return project;
  }

  return Object.freeze({
    createProjectFromValidatedInput,
    resetEnergyTemplateExports,
    saveCreateProjectFromForm,
    updateExistingProjectFromForm
  });
});
