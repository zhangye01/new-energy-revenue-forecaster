"use strict";

(function (root, factory) {
  const getScenarioModel = () => typeof module !== "undefined" && module.exports
    ? require("../domain/scenario-model") : root.NE_SCENARIO_MODEL;
  const api = factory(getScenarioModel);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_SCENARIO_FORM = api;
  if (root.window && root.window !== root) {
    root.window.NE_SCENARIO_FORM = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (getScenarioModel) {
  const loadedRatios = new WeakMap();
  const refinementForms = new WeakMap();
  const validationMessages = new WeakMap();
  const REFINEMENT_FIELDS = Object.freeze({
    mechanismEnabled: "mechanism-enabled", mechanismRatio: "mechanism-ratio", mechanismPrice: "mechanism-price",
    mechanismStartYm: "mechanism-start-ym", mechanismEndYm: "mechanism-end-ym",
    mechanismReferenceMode: "mechanism-reference-mode", sameTypeSpread: "same-type-spread",
    ltPricingMode: "lt-pricing-mode", ltYear1Pnl: "lt-year1-pnl", ltTargetPnl: "lt-target-pnl", ltConvergeSpeed: "lt-converge-speed",
    envValueMode: "env-value-mode", greenCertPrice: "green-cert-price", greenCertRealizeRatio: "green-cert-realize-ratio",
    greenPremiumPrice: "green-premium-price", greenPremiumRealizeRatio: "green-premium-realize-ratio",
    carbonEnabled: "carbon-enabled", carbonPrice: "carbon-price", carbonRealizeRatio: "carbon-realize-ratio",
    feeConfigMode: "fee-config-mode", marketOpFee: "market-op-fee", gridAssessFee: "grid-assess-fee",
    ancillaryFee: "ancillary-fee", otherFee: "other-fee", otherIncome: "other-income",
    storageArbitragePrice: "storage-arbitrage-price", storageCapacityCompPrice: "storage-capacity-comp-price",
    storageAncillaryRevenuePrice: "storage-ancillary-revenue-price", storageOtherRevenuePrice: "storage-other-revenue-price"
  });

  function buildRefinementState({ project = {}, scenario = {}, config = scenario.config || {} } = {}) {
    const groups = {
      mechanism: ["mechanismEnabled"],
      trade: ["ltPricingMode"],
      environment: ["envValueMode"],
      fees: ["feeConfigMode"],
      storage: project.hasStorage ? ["storageArbitragePrice", "storageCapacityCompPrice", "storageAncillaryRevenuePrice", "storageOtherRevenuePrice"] : []
    };
    if (config.mechanismEnabled) {
      groups.mechanism.push("mechanismRatio", "mechanismPrice", "mechanismStartYm", "mechanismEndYm", "mechanismReferenceMode");
      if (config.mechanismReferenceMode === "same_type") groups.mechanism.push("sameTypeSpread");
    }
    groups.trade.push(...(config.ltPricingMode === "manual" ? ["ltManualPricesByYear"] : ["ltYear1Pnl", "ltTargetPnl", "ltConvergeSpeed"]));
    groups.environment.push(...(config.envValueMode === "manual" ? ["envManualValuesByYear"] : ["greenCertPrice", "greenCertRealizeRatio", "greenPremiumPrice", "greenPremiumRealizeRatio"]));
    if (config.envValueMode !== "manual" && project.siteType === "offshore") {
      groups.environment.push("carbonEnabled");
      if (config.carbonEnabled) groups.environment.push("carbonPrice", "carbonRealizeRatio");
    }
    groups.fees.push(...(config.feeConfigMode === "manual" ? ["feeManualValuesByYear"] : ["marketOpFee", "gridAssessFee", "ancillaryFee", "otherFee", "otherIncome"]));
    const empty = (value) => value === undefined || value === null || (typeof value === "string" && !value.trim());
    const numeric = (value) => !empty(value) && Number.isFinite(Number(value));
    const annualComplete = (key) => {
      const startYear = Number(project.startYear), years = Number(project.forecastYears);
      if (!Number.isInteger(startYear) || !Number.isInteger(years) || years <= 0) return false;
      return Array.from({ length: years }, (_, i) => config[key]?.[startYear + i]).every((entry) => {
        if (key === "ltManualPricesByYear") return numeric(entry);
        const keys = key === "feeManualValuesByYear" ? ["marketOpFee", "gridAssessFee", "ancillaryFee", "otherFee", "otherIncome"]
          : ["greenCertPrice", "greenCertRealizeRatio", "greenPremiumPrice", "greenPremiumRealizeRatio"];
        if (key === "envManualValuesByYear" && project.siteType === "offshore") {
          if (typeof entry?.carbonEnabled !== "boolean") return false;
          if (entry.carbonEnabled) keys.push("carbonPrice", "carbonRealizeRatio");
        }
        return keys.every((name) => numeric(entry?.[name]));
      });
    };
    const fields = {};
    const states = Object.entries(groups).map(([id, keys]) => {
      keys.forEach((key) => {
        const missing = key.endsWith("ByYear") ? !annualComplete(key) : empty(config[key]);
        fields[key] = missing ? "missing" : getScenarioModel().isConfigConfirmed(scenario, key, config[key]) ? "confirmed" : "pending";
      });
      const missing = keys.filter((key) => fields[key] === "missing").length;
      const pending = keys.filter((key) => fields[key] === "pending").length;
      return { id, keys, missing, pending, confirmed: keys.length - missing - pending, complete: missing + pending === 0 };
    });
    return { groups: states, fields, total: Object.keys(fields).length, confirmed: Object.values(fields).filter((state) => state === "confirmed").length };
  }

  function refreshRefinementState(input = {}) {
    const { querySelector = () => null, scenario = {}, project = {}, resetOpen = false } = input;
    const config = { ...scenario.config };
    Object.entries(REFINEMENT_FIELDS).forEach(([key, id]) => {
      const field = getField(querySelector, `#${id}`);
      if (!field || field.value === undefined) return;
      const raw = field.value;
      config[key] = raw === "" ? "" : key.endsWith("Enabled") ? raw === "yes"
        : key.endsWith("Mode") || key.endsWith("Ym") ? raw
          : key.endsWith("Ratio") ? readRatioValue(querySelector, `#${id}`, Number(raw) / 100) : Number(raw);
    });
    const state = buildRefinementState({ project, scenario, config });
    state.groups.forEach((group) => {
      const section = getField(querySelector, `[data-refinement-group="${group.id}"]`);
      const status = getField(querySelector, `[data-refinement-status="${group.id}"]`);
      if (section) {
        section.hidden = !group.keys.length;
        const previous = section.dataset?.refinementState;
        const next = group.complete ? "confirmed" : group.missing ? "missing" : "pending";
        if (resetOpen || (previous !== next && next !== "confirmed")) section.open = !group.complete;
        if (section.dataset) section.dataset.refinementState = next;
      }
      if (status) status.textContent = group.complete ? "已确认，可展开细化"
        : [group.missing ? `待补充 ${group.missing} 项` : "", group.pending ? `待确认 ${group.pending} 项` : ""].filter(Boolean).join(" · ");
    });
    [...Object.keys(REFINEMENT_FIELDS), "ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"].forEach((key) => {
      const badge = getField(querySelector, `[data-refinement-field="${key}"]`);
      if (!badge) return;
      const status = state.fields[key];
      badge.hidden = !status;
      badge.textContent = status === "confirmed" ? "已确认" : status === "missing" ? "待补充" : status ? "待确认" : "";
      if (badge.dataset) badge.dataset.state = status || "inactive";
      const label = REFINEMENT_FIELDS[key] && getField(querySelector, `#${REFINEMENT_FIELDS[key]}`)?.closest?.("label");
      if (label) label.hidden = !status;
    });
    const progress = getField(querySelector, "#scenario-refinement-progress");
    if (progress) progress.textContent = `已确认 ${state.confirmed} / ${state.total} 项`;
    refreshAnnualPreviews({ project, config, querySelector, resetOpen });
    return state;
  }

  function refreshAnnualPreviews({ project, config, querySelector, resetOpen }) {
    const startYear = Number(project.startYear), count = Number(project.forecastYears);
    const years = Number.isInteger(startYear) && Number.isInteger(count) && count > 0 && count <= 100
      ? Array.from({ length: count }, (_, i) => startYear + i) : [];
    const specifications = [
      ["lt", "ltManualPricesByYear", "交易策略逐年损益", [[null, "策略损益 元/MWh"]]],
      ["env", "envManualValuesByYear", "逐年环境价值兑现", [
        ["greenCertPrice", "绿证价格 元/MWh"], ["greenCertRealizeRatio", "绿证兑现空间 %"],
        ["greenPremiumPrice", "绿电溢价 元/MWh"], ["greenPremiumRealizeRatio", "绿电兑现空间 %"],
        ...(project.siteType === "offshore" ? [["carbonEnabled", "碳收益"], ["carbonPrice", "碳收益 元/MWh"], ["carbonRealizeRatio", "碳兑现空间 %"]] : [])
      ]],
      ["fee", "feeManualValuesByYear", "逐年扣费与其他收益", [
        ["marketOpFee", "市场运营费用 元/MWh"], ["gridAssessFee", "并网考核费用 元/MWh"],
        ["ancillaryFee", "辅助服务费用 元/MWh"], ["otherFee", "其他费用 元/MWh"], ["otherIncome", "其他收入 元/MWh"]
      ]]
    ];
    const display = (value, key) => {
      if (key === "carbonEnabled") return typeof value === "boolean" ? value ? "是" : "否" : "未填写";
      if (value === undefined || value === null || (typeof value === "string" && !value.trim()) || !Number.isFinite(Number(value))) return "未填写";
      return String(key?.endsWith("Ratio") ? Number((Number(value) * 100).toPrecision(15)) : Number(value));
    };
    specifications.forEach(([id, key, title, columns]) => {
      const preview = getField(querySelector, `#${id}-annual-preview`);
      const summary = getField(querySelector, `#${id}-annual-preview-summary`);
      const content = getField(querySelector, `#${id}-annual-preview-content`);
      if (preview && resetOpen) preview.open = false;
      if (summary) summary.textContent = `查看逐年数值（${years.length} 年）`;
      if (!content) return;
      content.innerHTML = `<table aria-label="${title}"><thead><tr><th scope="col">年份</th>${columns.map(([, label]) => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${years.map((year) => {
        const row = config[key]?.[year];
        return `<tr><td>${year}</td>${columns.map(([field]) => `<td>${display(field === null ? row : row?.[field], field)}</td>`).join("")}</tr>`;
      }).join("")}</tbody></table>`;
    });
  }

  function bindRefinementState(input) {
    const form = getField(input.querySelector, "#scenario-form");
    if (!form?.addEventListener) return;
    if (!refinementForms.has(form)) {
      const refresh = () => refreshRefinementState(refinementForms.get(form));
      form.addEventListener("input", refresh);
      form.addEventListener("change", refresh);
    }
    refinementForms.set(form, input);
    refreshRefinementState({ ...input, resetOpen: true });
  }

  function getField(querySelector, selector) {
    return typeof querySelector === "function" ? querySelector(selector) : null;
  }

  function setValue(querySelector, selector, value) {
    const field = getField(querySelector, selector);
    if (field) field.value = value;
  }

  function setRatioValue(querySelector, selector, value) {
    const field = getField(querySelector, selector);
    if (!field) return;
    const ratio = Number(value || 0);
    const display = String(Number((ratio * 100).toPrecision(15)));
    field.value = display;
    loadedRatios.set(field, { ratio, display });
  }

  function readRatioValue(querySelector, selector, fallback) {
    const field = getField(querySelector, selector);
    const loaded = field && loadedRatios.get(field);
    // A display-to-percentage round trip must not alter an unchanged saved input.
    return loaded && String(field.value) === loaded.display ? loaded.ratio : fallback;
  }

  function numberValue(querySelector, selector) {
    return Number(getField(querySelector, selector)?.value);
  }

  function selectValue(querySelector, selector) {
    return getField(querySelector, selector)?.value || "";
  }

  function textValue(querySelector, selector) {
    return String(getField(querySelector, selector)?.value || "").trim();
  }

  function ratioValue(clamp, value) {
    const numeric = Number(value);
    return clamp(Number.isFinite(numeric) ? numeric : 0, 0, 1);
  }

  function asPercent(value) {
    return `${(Number(value) * 100).toFixed(1)}%`;
  }

  function invalid(message) {
    return { ok: false, message };
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function bindForecastScenarioEvents(input = {}) {
    const {
      refs = {},
      handlers = {}
    } = input;
    refs.forecastRunForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      handlers.generateForecastRun?.();
    });
    refs.scenarioForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      handlers.saveScenarioFromForm?.();
    });
    refs.scenarioSelector?.addEventListener("change", () => {
      handlers.switchActiveScenario?.(refs.scenarioSelector.value);
    });
    refs.scenarioQuickName?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      handlers.renameActiveScenario?.();
    });
    refs.duplicateScenarioButton?.addEventListener("click", () => handlers.duplicateActiveScenario?.());
    refs.renameScenarioButton?.addEventListener("click", () => handlers.renameActiveScenario?.());
    refs.deleteScenarioButton?.addEventListener("click", () => handlers.deleteActiveScenario?.());
    refs.toggleBaselineLockButton?.addEventListener("click", () => handlers.toggleBaselineLock?.());
    refs.applyBatchButton?.addEventListener("click", () => handlers.applyBatchParameter?.());
    [
      refs.ltPricingMode,
      refs.envValueMode,
      refs.feeConfigMode
    ].forEach((control) => {
      control?.addEventListener("change", () => {
        handlers.syncScenarioFieldLocks?.();
      });
    });
    [
      ["exportLtTemplateButton", "lt", "exportManualScenarioTemplate"],
      ["importLtTemplateButton", "lt", "importManualScenarioTemplate"],
      ["exportEnvTemplateButton", "env", "exportManualScenarioTemplate"],
      ["importEnvTemplateButton", "env", "importManualScenarioTemplate"],
      ["exportFeeTemplateButton", "fee", "exportManualScenarioTemplate"],
      ["importFeeTemplateButton", "fee", "importManualScenarioTemplate"]
    ].forEach(([refKey, templateType, handlerName]) => {
      refs[refKey]?.addEventListener("click", () => {
        handlers[handlerName]?.(templateType);
      });
    });
    refs.provinceDefaultSelector?.addEventListener("change", () => {
      handlers.changeProvinceDefault?.(refs.provinceDefaultSelector.value);
    });
  }

  function bindScenarioDerivedFieldEvents(input = {}) {
    const {
      querySelector = () => null,
      handlers = {}
    } = input;
    querySelector("#mechanism-enabled")?.addEventListener("change", () => {
      handlers.syncScenarioFieldLocks?.();
    });
    [
      "#mechanism-ratio",
      "#mechanism-start-ym",
      "#mechanism-end-ym"
    ].forEach((selector) => {
      const field = querySelector(selector);
      if (!field) return;
      field.addEventListener("input", () => handlers.updateMarketTradeEnergyDisplay?.());
      field.addEventListener("change", () => handlers.updateMarketTradeEnergyDisplay?.());
    });
    querySelector("#carbon-enabled")?.addEventListener("change", () => {
      handlers.syncScenarioFieldLocks?.();
    });
    [
      "#green-cert-realize-ratio",
      "#green-premium-realize-ratio",
      "#carbon-realize-ratio"
    ].forEach((selector) => {
      const field = querySelector(selector);
      if (!field) return;
      field.addEventListener("input", () => handlers.updateEnvValueSpaceDisplay?.());
      field.addEventListener("change", () => handlers.updateEnvValueSpaceDisplay?.());
    });
  }

  function buildScenarioManagerView(input = {}) {
    const {
      project = null,
      activeScenario = null,
      baselineScenario = null,
      getEnvValueAllocation = () => ({ unitValuePerMarketMwh: 0 }),
      getFeeConfigForYear = () => ({
        marketOpFee: 0,
        gridAssessFee: 0,
        ancillaryFee: 0,
        otherFee: 0
      }),
      asPercent = (value) => String(value),
      asNum = (value) => String(value),
      formatDate = (value) => String(value || "")
    } = input;

    if (!project) {
      return {
        selectorHtml: "",
        selectorValue: "",
        quickName: "",
        quickNameDisabled: true,
        listHtml: "",
        lockHint: "请先创建项目。",
        duplicateDisabled: true,
        renameDisabled: true,
        deleteDisabled: true,
        toggleBaselineDisabled: true,
        applyBatchDisabled: true,
        toggleBaselineText: ""
      };
    }

    const scenarios = Array.isArray(project.scenarios) ? project.scenarios : [];
    const selectorHtml = scenarios.map((scenario) => `
    <option value="${escapeHtml(scenario.id)}">
      ${escapeHtml(scenario.name)}${scenario.isBaseline ? "（基准）" : ""}${scenario.locked ? " [已锁定]" : ""}
    </option>
  `).join("");
    const listHtml = scenarios.map((scenario) => {
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
        <td>${formatDate(scenario.updatedAt)}</td>
      </tr>
    `;
    }).join("");

    return {
      selectorHtml,
      selectorValue: activeScenario?.id || "",
      quickName: activeScenario?.name || "",
      quickNameDisabled: !activeScenario || activeScenario.locked,
      listHtml,
      deleteDisabled: !activeScenario || activeScenario.isBaseline || activeScenario.locked || scenarios.length <= 1,
      duplicateDisabled: !activeScenario,
      renameDisabled: !activeScenario || activeScenario.locked,
      toggleBaselineDisabled: !baselineScenario,
      applyBatchDisabled: !scenarios.length,
      toggleBaselineText: baselineScenario?.locked ? "解锁基准场景" : "锁定基准场景",
      lockHint: baselineScenario?.locked
        ? "基准场景已锁定。切换到其他场景可继续编辑。"
        : "基准场景未锁定。"
    };
  }

  function applyScenarioManagerView(refs = {}, view = {}) {
    if (refs.scenarioSelector) {
      refs.scenarioSelector.innerHTML = view.selectorHtml || "";
      refs.scenarioSelector.value = view.selectorValue || "";
    }
    if (refs.scenarioQuickName) {
      refs.scenarioQuickName.value = view.quickName || "";
      refs.scenarioQuickName.disabled = Boolean(view.quickNameDisabled);
    }
    if (refs.scenarioListBody) refs.scenarioListBody.innerHTML = view.listHtml || "";
    if (refs.scenarioLockHint) refs.scenarioLockHint.textContent = view.lockHint || "";
    if (refs.duplicateScenarioButton) refs.duplicateScenarioButton.disabled = Boolean(view.duplicateDisabled);
    if (refs.renameScenarioButton) refs.renameScenarioButton.disabled = Boolean(view.renameDisabled);
    if (refs.deleteScenarioButton) refs.deleteScenarioButton.disabled = Boolean(view.deleteDisabled);
    if (refs.toggleBaselineLockButton) {
      refs.toggleBaselineLockButton.disabled = Boolean(view.toggleBaselineDisabled);
      if (view.toggleBaselineText) refs.toggleBaselineLockButton.textContent = view.toggleBaselineText;
    }
    if (refs.applyBatchButton) refs.applyBatchButton.disabled = Boolean(view.applyBatchDisabled);
  }

  function loadScenarioToForm(input = {}) {
    const {
      scenario,
      refs = {},
      querySelector,
      asNum = (value, digits = 1) => Number(value || 0).toFixed(digits),
      modes = {}
    } = input;
    if (!scenario?.config) return;
    const message = refs.scenarioMessage;
    const staleError = message && validationMessages.get(message);
    if (staleError && message.textContent === staleError) {
      message.textContent = "已带入当前方案参数。";
      if (message.style) { message.style.borderColor = ""; message.style.background = ""; }
    }
    if (message) validationMessages.delete(message);
    const config = scenario.config;
    setValue(querySelector, "#scenario-name", scenario.name);
    setValue(querySelector, "#mechanism-enabled", config.mechanismEnabled ? "yes" : "no");
    setRatioValue(querySelector, "#mechanism-ratio", config.mechanismRatio);
    setValue(querySelector, "#mechanism-price", config.mechanismPrice);
    setValue(querySelector, "#mechanism-start-ym", config.mechanismStartYm);
    setValue(querySelector, "#mechanism-end-ym", config.mechanismEndYm);
    setValue(querySelector, "#mechanism-reference-mode", config.mechanismReferenceMode || "project_capture");
    setValue(querySelector, "#same-type-spread", config.sameTypeSpread || 0);
    if (refs.ltPricingMode) refs.ltPricingMode.value = modes.ltPricingMode || "auto";
    setValue(querySelector, "#lt-year1-pnl", config.ltYear1Pnl);
    setValue(querySelector, "#lt-target-pnl", config.ltTargetPnl);
    setValue(querySelector, "#lt-converge-speed", Number.isFinite(Number(config.ltConvergeSpeed)) ? String(Number(config.ltConvergeSpeed)) : "0");
    setValue(querySelector, "#green-cert-price", config.greenCertPrice);
    setRatioValue(querySelector, "#green-cert-realize-ratio", config.greenCertRealizeRatio);
    setValue(querySelector, "#green-premium-price", config.greenPremiumPrice);
    setRatioValue(querySelector, "#green-premium-realize-ratio", config.greenPremiumRealizeRatio);
    if (refs.envValueMode) refs.envValueMode.value = modes.envValueMode || "global";
    setValue(querySelector, "#carbon-enabled", config.carbonEnabled ? "yes" : "no");
    setValue(querySelector, "#carbon-price", config.carbonPrice);
    setRatioValue(querySelector, "#carbon-realize-ratio", config.carbonRealizeRatio);
    setValue(querySelector, "#market-op-fee", config.marketOpFee);
    setValue(querySelector, "#grid-assess-fee", config.gridAssessFee);
    setValue(querySelector, "#ancillary-fee", config.ancillaryFee);
    setValue(querySelector, "#other-fee", config.otherFee);
    setValue(querySelector, "#other-income", config.otherIncome);
    if (refs.feeConfigMode) refs.feeConfigMode.value = modes.feeConfigMode || "global";
    if (refs.storageArbitragePrice) refs.storageArbitragePrice.value = config.storageArbitragePrice || 0;
    if (refs.storageCapacityCompPrice) refs.storageCapacityCompPrice.value = config.storageCapacityCompPrice || 0;
    if (refs.storageAncillaryRevenuePrice) refs.storageAncillaryRevenuePrice.value = config.storageAncillaryRevenuePrice || 0;
    if (refs.storageOtherRevenuePrice) refs.storageOtherRevenuePrice.value = config.storageOtherRevenuePrice || 0;
    bindRefinementState(input);
  }

  function applyScenarioFieldLocks(input = {}) {
    const {
      refs = {},
      querySelector = () => null,
      locked = false,
      canUseStorageRevenue = false
    } = input;
    if (refs.scenarioStorageRevenueSection) {
      refs.scenarioStorageRevenueSection.hidden = !canUseStorageRevenue;
    }

    const mechanismEnabled = selectValue(querySelector, "#mechanism-enabled") === "yes";
    [
      "#mechanism-ratio",
      "#mechanism-price",
      "#mechanism-reference-mode",
      "#same-type-spread",
      "#mechanism-start-ym",
      "#mechanism-end-ym"
    ].forEach((selector) => {
      const target = getField(querySelector, selector);
      if (target) target.disabled = locked || !mechanismEnabled;
    });

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
    if (refs.scenarioLockHint) {
      refs.scenarioLockHint.textContent = locked
        ? "当前场景已锁定，请切换场景或解锁。"
        : "当前场景可编辑。";
    }
  }

  function applyEnvValueControlState(input = {}) {
    const {
      refs = {},
      querySelector = () => null,
      project = null,
      scenario = null,
      locked = false,
      envValueMode = "global"
    } = input;
    const mode = refs.envValueMode?.value || envValueMode || "global";
    const isManual = mode === "manual";
    const canUseCarbon = project?.siteType === "offshore";
    const carbonEnabledField = getField(querySelector, "#carbon-enabled");
    const carbonPriceField = getField(querySelector, "#carbon-price");
    const carbonRatioField = getField(querySelector, "#carbon-realize-ratio");
    const carbonEnabled = carbonEnabledField?.value === "yes";

    if (refs.envManualPanel) refs.envManualPanel.hidden = !isManual;
    if (refs.envValueMode) refs.envValueMode.disabled = locked;
    [
      "#green-cert-price",
      "#green-cert-realize-ratio",
      "#green-premium-price",
      "#green-premium-realize-ratio"
    ].forEach((selector) => {
      const field = getField(querySelector, selector);
      if (field) field.disabled = locked || isManual;
    });
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

    return {
      mode,
      isManual,
      canUseCarbon,
      carbonEnabled,
      hasScenario: Boolean(project && scenario)
    };
  }

  function buildScenarioConfigFromForm(input = {}) {
    const {
      project = {},
      refs = {},
      querySelector,
      clamp = (value) => value,
      ltPricingMode = "auto",
      ltManualPricesByYear = {},
      envValueMode = "global",
      envManualValuesByYear = {},
      envAllocationDraft = {},
      feeConfigMode = "global",
      feeManualValuesByYear = {}
    } = input;
    const offshore = project.siteType === "offshore";
    const carbonEnabled = offshore && selectValue(querySelector, "#carbon-enabled") === "yes";
    return {
      mechanismEnabled: selectValue(querySelector, "#mechanism-enabled") === "yes",
      mechanismRatio: readRatioValue(querySelector, "#mechanism-ratio", clamp(numberValue(querySelector, "#mechanism-ratio") / 100, 0, 1)),
      mechanismPrice: numberValue(querySelector, "#mechanism-price"),
      mechanismStartYm: selectValue(querySelector, "#mechanism-start-ym"),
      mechanismEndYm: selectValue(querySelector, "#mechanism-end-ym"),
      mechanismReferenceMode: selectValue(querySelector, "#mechanism-reference-mode") === "same_type" ? "same_type" : "project_capture",
      sameTypeSpread: numberValue(querySelector, "#same-type-spread"),
      ltPricingMode,
      ltManualPricesByYear,
      ltYear1Pnl: numberValue(querySelector, "#lt-year1-pnl"),
      ltTargetPnl: numberValue(querySelector, "#lt-target-pnl"),
      ltConvergeSpeedUnit: "fixed_step",
      ltConvergeSpeed: clamp(numberValue(querySelector, "#lt-converge-speed"), 0, 2000),
      envValueMode,
      envManualValuesByYear,
      greenCertPrice: numberValue(querySelector, "#green-cert-price"),
      greenCertRealizeRatio: readRatioValue(querySelector, "#green-cert-realize-ratio", ratioValue(clamp, envAllocationDraft.greenCertRatio)),
      greenPremiumPrice: numberValue(querySelector, "#green-premium-price"),
      greenPremiumRealizeRatio: readRatioValue(querySelector, "#green-premium-realize-ratio", ratioValue(clamp, envAllocationDraft.greenPremiumRatio)),
      carbonEnabled,
      carbonPrice: offshore ? numberValue(querySelector, "#carbon-price") : 0,
      carbonRealizeRatio: carbonEnabled ? readRatioValue(querySelector, "#carbon-realize-ratio", ratioValue(clamp, envAllocationDraft.carbonRatio)) : 0,
      feeConfigMode,
      feeManualValuesByYear,
      marketOpFee: numberValue(querySelector, "#market-op-fee"),
      gridAssessFee: numberValue(querySelector, "#grid-assess-fee"),
      ancillaryFee: numberValue(querySelector, "#ancillary-fee"),
      otherFee: numberValue(querySelector, "#other-fee"),
      otherIncome: numberValue(querySelector, "#other-income"),
      storageArbitragePrice: project.hasStorage ? Number(refs.storageArbitragePrice?.value || 0) : 0,
      storageCapacityCompPrice: project.hasStorage ? Number(refs.storageCapacityCompPrice?.value || 0) : 0,
      storageAncillaryRevenuePrice: project.hasStorage ? Number(refs.storageAncillaryRevenuePrice?.value || 0) : 0,
      storageOtherRevenuePrice: project.hasStorage ? Number(refs.storageOtherRevenuePrice?.value || 0) : 0
    };
  }

  function validateActiveNumericFields({ project, refs, querySelector, ltPricingMode, envValueMode, feeConfigMode }) {
    const fields = [];
    const add = (selector, label, min = 0, max = Infinity) => fields.push([getField(querySelector, selector)?.value, label, min, max]);
    if (selectValue(querySelector, "#mechanism-enabled") === "yes") {
      add("#mechanism-price", "机制电价");
      add("#mechanism-ratio", "机制电量占比", 0, 100);
      if (selectValue(querySelector, "#mechanism-reference-mode") === "same_type") add("#same-type-spread", "同类型机组价差", -Infinity);
    }
    if (ltPricingMode !== "manual") {
      add("#lt-year1-pnl", "首年策略损益", -Infinity);
      add("#lt-target-pnl", "目标策略损益", -Infinity);
      add("#lt-converge-speed", "每年收敛步长", 0, 2000);
    }
    if (envValueMode !== "manual") {
      add("#green-cert-price", "绿证价格");
      add("#green-cert-realize-ratio", "绿证兑现比例", 0, 100);
      add("#green-premium-price", "绿电溢价");
      add("#green-premium-realize-ratio", "绿电兑现比例", 0, 100);
      if (project.siteType === "offshore" && selectValue(querySelector, "#carbon-enabled") === "yes") {
        add("#carbon-price", "碳收益");
        add("#carbon-realize-ratio", "碳收益兑现比例", 0, 100);
      }
    }
    if (feeConfigMode !== "manual") {
      [["#market-op-fee", "市场运营费"], ["#grid-assess-fee", "电网考核费"], ["#ancillary-fee", "辅助服务费"],
        ["#other-fee", "其他费用"], ["#other-income", "其他收入"]].forEach(([selector, label]) => add(selector, label));
    }
    if (project.hasStorage) {
      [["storageArbitragePrice", "配储套利收益"], ["storageCapacityCompPrice", "配储容量补偿"],
        ["storageAncillaryRevenuePrice", "配储辅助服务收益"], ["storageOtherRevenuePrice", "配储其他收益"]]
        .forEach(([key, label]) => fields.push([refs[key]?.value, label, 0, Infinity]));
    }
    for (const [value, label, min, max] of fields) {
      if (value === null || value === undefined || String(value).trim() === "" || !Number.isFinite(Number(value))) {
        return `${label}不能为空，请填写有效数字；无该项时请明确填写 0。`;
      }
      if (Number(value) < min || Number(value) > max) return `${label}超出允许范围，请检查填写值。`;
    }
    return "";
  }

  function buildScenarioSaveDraft(input = {}) {
    const draft = validateScenarioSaveDraft(input);
    const message = input.refs?.scenarioMessage;
    if (message) {
      if (draft.ok) validationMessages.delete(message);
      else validationMessages.set(message, draft.message);
    }
    return draft;
  }

  function validateScenarioSaveDraft(input = {}) {
    const {
      project = {},
      scenario = {},
      refs = {},
      querySelector,
      clamp = (value) => value,
      monthSerial = () => null,
      scenarioConfig = {},
      readEnvValueAllocationDraft = () => ({})
    } = input;
    if (scenario.locked) {
      return invalid("当前场景已锁定，不能保存修改。");
    }

    const scenarioName = textValue(querySelector, "#scenario-name") || "基准场景";
    const duplicatedName = (project.scenarios || []).find((item) => (
      item.id !== scenario.id && item.name === scenarioName
    ));
    if (duplicatedName) {
      return invalid("场景名称重复，请修改后再保存。");
    }

    const mechanismEnabled = selectValue(querySelector, "#mechanism-enabled") === "yes";
    const mechanismStartYm = selectValue(querySelector, "#mechanism-start-ym");
    const mechanismEndYm = selectValue(querySelector, "#mechanism-end-ym");
    if (mechanismEnabled) {
      const startSerial = monthSerial(mechanismStartYm);
      const endSerial = monthSerial(mechanismEndYm);
      if (startSerial === null || endSerial === null || endSerial < startSerial) {
        return invalid("机制执行年月无效，请检查起止区间。");
      }
    }

    const ltPricingMode = scenarioConfig.getLtPricingMode
      ? scenarioConfig.getLtPricingMode({ ltPricingMode: refs.ltPricingMode?.value })
      : "auto";
    const ltManualPricesByYear = scenarioConfig.sanitizeLtManualPricesByYear
      ? scenarioConfig.sanitizeLtManualPricesByYear(scenario.config?.ltManualPricesByYear || {}, project)
      : {};
    if (ltPricingMode === "manual") {
      const completeness = scenarioConfig.getLtManualCompleteness?.(project, { ltManualPricesByYear }) || { complete: 0, total: 0 };
      if (completeness.complete !== completeness.total) {
        return invalid(`逐年损益值不完整，当前 ${completeness.complete}/${completeness.total} 年。请导入完整测算周期后再保存。`);
      }
    }

    const envValueMode = scenarioConfig.getEnvValueMode
      ? scenarioConfig.getEnvValueMode({ envValueMode: refs.envValueMode?.value })
      : "global";
    const envManualValuesByYear = scenarioConfig.sanitizeEnvManualValuesByYear
      ? scenarioConfig.sanitizeEnvManualValuesByYear(scenario.config?.envManualValuesByYear || {}, project)
      : {};
    const envAllocationDraft = readEnvValueAllocationDraft(project);
    if (envValueMode === "manual") {
      const completeness = scenarioConfig.getEnvManualCompleteness?.(project, { envManualValuesByYear }) || { complete: 0, total: 0 };
      if (completeness.complete !== completeness.total) {
        return invalid(`逐年环境价值兑现配置不完整，当前 ${completeness.complete}/${completeness.total} 年。请导入完整测算周期后再保存。`);
      }
    } else if (
      envAllocationDraft.greenCertRatio < 0
      || envAllocationDraft.greenPremiumRatio < 0
      || envAllocationDraft.carbonRatio < 0
      || envAllocationDraft.totalRatio > 1 + 0.000001
    ) {
      return invalid(`环境价值兑现空间分配无效：绿证、绿电溢价、碳收益合计为 ${asPercent(envAllocationDraft.totalRatio)}，不能超过 100.0%。`);
    }

    const feeConfigMode = scenarioConfig.getFeeConfigMode
      ? scenarioConfig.getFeeConfigMode({ feeConfigMode: refs.feeConfigMode?.value })
      : "global";
    const feeManualValuesByYear = scenarioConfig.sanitizeFeeManualValuesByYear
      ? scenarioConfig.sanitizeFeeManualValuesByYear(scenario.config?.feeManualValuesByYear || {}, project)
      : {};
    if (feeConfigMode === "manual") {
      const completeness = scenarioConfig.getFeeManualCompleteness?.(project, { feeManualValuesByYear }) || { complete: 0, total: 0 };
      if (completeness.complete !== completeness.total) {
        return invalid(`逐年扣费收益配置不完整，当前 ${completeness.complete}/${completeness.total} 年。请导入完整测算周期后再保存。`);
      }
    }

    const numericError = validateActiveNumericFields({ project, refs, querySelector, ltPricingMode, envValueMode, feeConfigMode });
    if (numericError) return invalid(numericError);

    return {
      ok: true,
      scenarioName,
      config: buildScenarioConfigFromForm({
        project,
        refs,
        querySelector,
        clamp,
        ltPricingMode,
        ltManualPricesByYear,
        envValueMode,
        envManualValuesByYear,
        envAllocationDraft,
        feeConfigMode,
        feeManualValuesByYear
      })
    };
  }

  function applyScenarioSaveDraft(input = {}) {
    const {
      project = null,
      scenario = null,
      draft = null,
      nowIso = () => new Date().toISOString()
    } = input;
    if (!project || !scenario || !draft?.ok) {
      return invalid(draft?.message || "场景保存失败。");
    }
    if (scenario.locked) return invalid("当前场景已锁定，不能保存修改。");
    scenario.name = draft.scenarioName;
    scenario.config = draft.config;
    const config = scenario.config;
    const confirmedKeys = ["mechanismEnabled", "ltPricingMode", "envValueMode", "feeConfigMode"];
    if (config.mechanismEnabled) {
      confirmedKeys.push("mechanismPrice", "mechanismRatio", "mechanismStartYm", "mechanismEndYm", "mechanismReferenceMode");
      if (config.mechanismReferenceMode === "same_type") confirmedKeys.push("sameTypeSpread");
    }
    confirmedKeys.push(...(config.ltPricingMode === "manual" ? ["ltManualPricesByYear"]
      : ["ltYear1Pnl", "ltTargetPnl", "ltConvergeSpeed", "ltConvergeSpeedUnit"]));
    if (config.envValueMode === "manual") confirmedKeys.push("envManualValuesByYear");
    else {
      confirmedKeys.push("greenCertPrice", "greenCertRealizeRatio", "greenPremiumPrice", "greenPremiumRealizeRatio");
      if (project.siteType === "offshore") {
        confirmedKeys.push("carbonEnabled");
        if (config.carbonEnabled) confirmedKeys.push("carbonPrice", "carbonRealizeRatio");
      }
    }
    confirmedKeys.push(...(config.feeConfigMode === "manual" ? ["feeManualValuesByYear"]
      : ["marketOpFee", "gridAssessFee", "ancillaryFee", "otherFee", "otherIncome"]));
    if (project.hasStorage) confirmedKeys.push("storageArbitragePrice", "storageCapacityCompPrice", "storageAncillaryRevenuePrice", "storageOtherRevenuePrice");
    getScenarioModel().confirmConfig(scenario, confirmedKeys);
    scenario.updatedAt = nowIso();
    project.statuses = project.statuses || {};
    project.statuses["scenario-page"] = "completed";
    return {
      ok: true,
      message: `场景“${scenario.name}”已保存。`
    };
  }

  return Object.freeze({
    applyEnvValueControlState,
    applyScenarioManagerView,
    applyScenarioFieldLocks,
    applyScenarioSaveDraft,
    bindForecastScenarioEvents,
    bindScenarioDerivedFieldEvents,
    buildScenarioManagerView,
    buildScenarioSaveDraft,
    buildScenarioConfigFromForm,
    buildRefinementState,
    refreshRefinementState,
    loadScenarioToForm
  });
});
