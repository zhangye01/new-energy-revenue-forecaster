"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_PROVINCE_DEFAULTS_VIEW = api;
  if (root.window && root.window !== root) {
    root.window.NE_PROVINCE_DEFAULTS_VIEW = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function asNum(value, digits = 1) {
    return Number(value || 0).toFixed(digits);
  }

  function message(text, borderColor, background) {
    return { text, borderColor, background };
  }

  function applyMessageToElement(element, viewModel) {
    if (!element || !viewModel) return;
    element.textContent = viewModel.text;
    element.style.borderColor = viewModel.borderColor;
    element.style.background = viewModel.background;
  }

  function shouldRefreshProvinceDefaultMessage(currentMessage) {
    const text = String(currentMessage || "");
    return (
      !text
      || text.includes("请选择一个省份")
      || text.includes("请选择项目后")
      || text.includes("当前项目已选省份")
      || text.includes("当前正在查看")
    );
  }

  function sortProvinceOptions(provinces, currentProvinceKey, currentRegionKey, getRegionKey) {
    return [...provinces].sort((left, right) => {
      if (left.key === currentProvinceKey) return -1;
      if (right.key === currentProvinceKey) return 1;
      const leftSameRegion = getRegionKey(left.key) === currentRegionKey;
      const rightSameRegion = getRegionKey(right.key) === currentRegionKey;
      if (leftSameRegion && !rightSameRegion) return -1;
      if (!leftSameRegion && rightSameRegion) return 1;
      return left.name.localeCompare(right.name, "zh-CN");
    });
  }

  function buildSelectorHtml(options, currentProvinceKey) {
    return options.map((province) => {
      const currentMark = province.key === currentProvinceKey ? "（当前项目）" : "";
      return `<option value="${escapeHtml(province.key)}">调用其他省份参数：${escapeHtml(province.name)}${currentMark}</option>`;
    }).join("");
  }

  function buildStorageDetails(defaults) {
    return `
              <div class="province-default-detail">
                <span class="label">现货价差套利</span>
                <span class="value">${asNum(defaults.storageArbitragePrice, 1)} 元/MWh</span>
              </div>
              <div class="province-default-detail">
                <span class="label">容量补偿收益</span>
                <span class="value">${asNum(defaults.storageCapacityCompPrice, 1)} 元/MWh</span>
              </div>
              <div class="province-default-detail">
                <span class="label">配储辅助服务收益</span>
                <span class="value">${asNum(defaults.storageAncillaryRevenuePrice, 1)} 元/MWh</span>
              </div>
              <div class="province-default-detail">
                <span class="label">其他配储收益</span>
                <span class="value">${asNum(defaults.storageOtherRevenuePrice, 1)} 元/MWh</span>
              </div>
            `;
  }

  function buildProvinceDefaultItem({ province, defaults, isCurrentProvince, isExpanded, hasProject, hasStorage }) {
    return `
      <article class="province-default-item ${isCurrentProvince ? "province-row-current" : ""}">
        <div class="province-default-summary">
          <div class="province-default-main">
            <div class="province-default-title-row">
              <span class="province-default-title">${escapeHtml(province.name)}</span>
              ${isCurrentProvince ? '<span class="project-province-badge">当前项目</span>' : ""}
              ${!isCurrentProvince ? '<span class="project-province-badge province-source-badge">参数来源</span>' : ""}
            </div>
            <div class="province-default-summary-grid">
              <div class="province-default-metric">
                <span class="label">机制状态</span>
                <span class="value">${defaults.mechanismEnabled ? "纳入" : "不纳入"}</span>
              </div>
              <div class="province-default-metric">
                <span class="label">机制占比</span>
                <span class="value">${asNum(defaults.mechanismRatio * 100, 1)}%</span>
              </div>
              <div class="province-default-metric">
                <span class="label">机制电价</span>
                <span class="value">${asNum(defaults.mechanismPrice, 1)} 元/MWh</span>
              </div>
            </div>
          </div>
          <div class="province-default-actions">
            <button
              type="button"
              class="ghost-button province-default-toggle"
              data-toggle-province-details="${escapeHtml(province.key)}"
              aria-expanded="${isExpanded ? "true" : "false"}"
            >
              ${isExpanded ? "收起详情" : "展开详情"}
            </button>
            <button type="button" class="ghost-button" data-apply-province="${escapeHtml(province.key)}" ${hasProject ? "" : "disabled"}>
              带入当前场景
            </button>
          </div>
        </div>
        ${isExpanded ? `
          <div class="province-default-details">
            <div class="province-default-detail">
              <span class="label">市场运营费</span>
              <span class="value">${asNum(defaults.marketOpFee, 1)} 元/MWh</span>
            </div>
            <div class="province-default-detail">
              <span class="label">并网考核费</span>
              <span class="value">${asNum(defaults.gridAssessFee, 1)} 元/MWh</span>
            </div>
            <div class="province-default-detail">
              <span class="label">辅助服务费</span>
              <span class="value">${asNum(defaults.ancillaryFee, 1)} 元/MWh</span>
            </div>
            <div class="province-default-detail">
              <span class="label">其他费用</span>
              <span class="value">${asNum(defaults.otherFee, 1)} 元/MWh</span>
            </div>
            <div class="province-default-detail">
              <span class="label">绿证</span>
              <span class="value">${asNum(defaults.greenCertPrice, 1)} 元/MWh</span>
            </div>
            <div class="province-default-detail">
              <span class="label">绿电溢价</span>
              <span class="value">${asNum(defaults.greenPremiumPrice, 1)} 元/MWh</span>
            </div>
            ${hasStorage ? buildStorageDetails(defaults) : ""}
          </div>
        ` : ""}
      </article>
    `;
  }

  function buildProvinceDefaultsViewModel(input = {}) {
    const {
      project = null,
      provinces = [],
      selectedProvinceDefaultKey = "",
      selectedProvinceDefaultContextKey = "",
      expandedKeys = [],
      currentMessage = "",
      getProvinceDefaults = () => ({}),
      getProvinceName = (key) => key || "",
      getRegionKey = () => ""
    } = input;
    const provinceKeys = new Set(provinces.map((province) => province.key));

    if (!project) {
      return {
        selectedKey: "",
        contextKey: "",
        selector: {
          disabled: true,
          value: "",
          html: '<option value="">调用其他省份参数</option>'
        },
        message: message("请选择项目后再一键带入省份默认参数。", "#9ab7e5", "#eff5ff"),
        bodyHtml: '<div class="empty-box compact">当前项目尚未选择省份，保存基础信息后再查看默认参数。</div>'
      };
    }

    const currentProvinceKey = provinceKeys.has(project.province) ? project.province : "";
    const currentProvinceName = getProvinceName(currentProvinceKey);
    const currentRegionKey = getRegionKey(currentProvinceKey);
    const contextKey = `${project.id || ""}:${currentProvinceKey || ""}`;
    let selectedKey = selectedProvinceDefaultContextKey !== contextKey
      ? currentProvinceKey
      : selectedProvinceDefaultKey;

    if (!provinceKeys.has(selectedKey)) {
      selectedKey = currentProvinceKey || provinces[0]?.key || "";
    }
    const selectedProvince = provinces.find((province) => province.key === selectedKey)
      || provinces.find((province) => province.key === currentProvinceKey)
      || provinces[0]
      || null;
    selectedKey = selectedProvince?.key || "";

    const selectorOptions = sortProvinceOptions(provinces, currentProvinceKey, currentRegionKey, getRegionKey);
    const selectedProvinceName = getProvinceName(selectedKey);
    const nextMessage = currentProvinceName && shouldRefreshProvinceDefaultMessage(currentMessage)
      ? message(
        selectedKey === currentProvinceKey
          ? `当前项目已选省份：${currentProvinceName}。后续场景默认以该省口径为基础，可直接带入当前场景后再微调。`
          : `当前正在查看：${selectedProvinceName}默认参数。可调用该省参数带入当前场景，项目省份仍为${currentProvinceName}。`,
        "#9ab7e5",
        "#eff5ff"
      )
      : null;

    const expandedKeySet = new Set(expandedKeys);
    const bodyHtml = selectedProvince
      ? buildProvinceDefaultItem({
        province: selectedProvince,
        defaults: getProvinceDefaults(selectedProvince.key),
        isCurrentProvince: selectedProvince.key === currentProvinceKey,
        isExpanded: expandedKeySet.has(selectedProvince.key),
        hasProject: true,
        hasStorage: Boolean(project.hasStorage)
      })
      : '<div class="empty-box compact">当前项目尚未选择省份，保存基础信息后再查看默认参数。</div>';

    return {
      selectedKey,
      contextKey,
      selector: {
        disabled: !selectorOptions.length,
        value: selectedKey,
        html: buildSelectorHtml(selectorOptions, currentProvinceKey)
      },
      message: nextMessage,
      bodyHtml
    };
  }

  function bindProvinceDefaultActions(input = {}) {
    const {
      root = null,
      handlers = {}
    } = input;
    if (!root || typeof root.querySelectorAll !== "function") return;
    root.querySelectorAll("[data-toggle-province-details]").forEach((button) => {
      button.addEventListener("click", () => {
        handlers.toggleProvinceDefaultDetails?.(button.dataset.toggleProvinceDetails);
      });
    });
    root.querySelectorAll("[data-apply-province]").forEach((button) => {
      button.addEventListener("click", () => {
        handlers.applyProvinceDefaultsToProject?.(button.dataset.applyProvince);
      });
    });
  }

  function applyProvinceDefaultsView(input = {}) {
    const {
      refs = {},
      model = null,
      root = null,
      handlers = {}
    } = input;
    if (!model) return false;
    if (refs.provinceDefaultSelector && model.selector) {
      refs.provinceDefaultSelector.disabled = model.selector.disabled;
      refs.provinceDefaultSelector.innerHTML = model.selector.html;
      refs.provinceDefaultSelector.value = model.selector.value;
    }
    applyMessageToElement(refs.provinceApplyMessage, model.message);
    if (refs.provinceParamBody) {
      refs.provinceParamBody.innerHTML = model.bodyHtml;
    }
    bindProvinceDefaultActions({ root, handlers });
    return true;
  }

  function applyProvinceDefaultsToProjectFlow(input = {}) {
    const {
      provinceKey = "",
      project: inputProject = null,
      scenario: inputScenario = null,
      refs = {},
      scenarioModel = null,
      provinceDefaults = {},
      nowIso = () => new Date().toISOString(),
      getProvinceName = (key) => key || "",
      actions = {}
    } = input;
    const project = inputProject || actions.getActiveProject?.() || null;
    if (!project) {
      applyMessageToElement(
        refs.provinceApplyMessage,
        message("请先创建或选择项目，再带入省份默认参数。", "#d39191", "#fff2f2")
      );
      return { ok: false, reason: "missing_project" };
    }

    actions.ensureScenarioMetadata?.(project);
    const scenario = inputScenario || actions.getActiveScenario?.(project) || null;
    if (!scenario) return { ok: false, reason: "missing_scenario" };
    if (scenario.locked) {
      applyMessageToElement(
        refs.provinceApplyMessage,
        message("当前场景已锁定，请先切换到可编辑场景。", "#d39191", "#fff2f2")
      );
      return { ok: false, reason: "locked_scenario" };
    }

    scenarioModel?.applyProvinceDefaultsToScenario?.(project, scenario, { provinceDefaults, nowIso });
    if (!project.statuses || typeof project.statuses !== "object") project.statuses = {};
    project.statuses["scenario-page"] = "completed";
    actions.markDownstreamStale?.(project, "scenario-page");

    const sourceProvinceName = getProvinceName(provinceKey);
    const projectProvinceName = getProvinceName(project.province);
    applyMessageToElement(
      refs.provinceApplyMessage,
      message(
        provinceKey === project.province
          ? `已带入 ${sourceProvinceName} 默认参数，并应用到当前场景“${scenario.name}”。`
          : `已调用 ${sourceProvinceName} 默认参数，并应用到当前场景“${scenario.name}”。项目省份仍为 ${projectProvinceName}。`,
        "#8fb48d",
        "#f1fbf1"
      )
    );
    applyMessageToElement(
      refs.scenarioMessage,
      message(`场景“${scenario.name}”已按 ${sourceProvinceName} 参数更新。`, "#8fb48d", "#f1fbf1")
    );
    actions.renderAll?.();
    actions.schedulePersistAppData?.();
    return { ok: true, reason: "applied", project, scenario, sourceProvinceName };
  }

  return Object.freeze({
    applyProvinceDefaultsView,
    applyProvinceDefaultsToProjectFlow,
    bindProvinceDefaultActions,
    buildProvinceDefaultsViewModel,
    shouldRefreshProvinceDefaultMessage
  });
});
