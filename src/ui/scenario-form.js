"use strict";

(function (root, factory) {
  const getScenarioModel = () => typeof module !== "undefined" && module.exports
    ? require("../domain/scenario-model") : root.NE_SCENARIO_MODEL;
  const getScenarioConfig = () => typeof module !== "undefined" && module.exports
    ? require("../domain/scenario-config") : root.NE_SCENARIO_CONFIG;
  const getRevenueRules = () => typeof module !== "undefined" && module.exports
    ? require("../domain/revenue-rules") : root.NE_REVENUE_RULES;
  const api = factory(getScenarioModel, getScenarioConfig, getRevenueRules);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_SCENARIO_FORM = api;
  if (root.window && root.window !== root) {
    root.window.NE_SCENARIO_FORM = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (getScenarioModel, getScenarioConfig, getRevenueRules) {
  const loadedRatios = new WeakMap();
  const loadedInputs = new WeakMap();
  const refinementForms = new WeakMap();
  const validationMessages = new WeakMap();
  const messageContexts = new WeakMap();
  const actionMessages = new WeakMap();
  const manualImports = new WeakMap();
  const manualImportEpochs = new WeakMap();
  const MANUAL_GROUPS = Object.freeze({
    lt: ["ltPricingMode", "ltManualPricesByYear", "交易策略损益"],
    env: ["envValueMode", "envManualValuesByYear", "环境价值"],
    fee: ["feeConfigMode", "feeManualValuesByYear", "费用与其他净收入"]
  });
  const FEE_FIELDS = ["marketOpFee", "gridAssessFee", "ancillaryFee", "otherNetIncome"];
  let storageState = "saved";
  const REFINEMENT_FIELDS = Object.freeze({
    mechanismEnabled: "mechanism-enabled", mechanismRatio: "mechanism-ratio", mechanismPrice: "mechanism-price",
    mechanismStartYm: "mechanism-start-ym", mechanismEndYm: "mechanism-duration-months",
    mechanismReferenceMode: "mechanism-reference-mode", sameTypeSpread: "same-type-spread",
    ltPricingMode: "lt-pricing-mode", ltYear1Pnl: "lt-year1-pnl", ltTargetPnl: "lt-target-pnl", ltConvergeSpeed: "lt-converge-speed",
    envValueMode: "env-value-mode", greenCertPrice: "green-cert-price", greenCertRealizeRatio: "green-cert-realize-ratio",
    greenPremiumPrice: "green-premium-price", greenPremiumRealizeRatio: "green-premium-realize-ratio",
    feeConfigMode: "fee-config-mode", marketOpFee: "market-op-fee", gridAssessFee: "grid-assess-fee",
    ancillaryFee: "ancillary-fee", otherNetIncome: "other-net-income",
    storageRoundTripEfficiency: "storage-round-trip-efficiency", storageCapacityCompPrice: "storage-capacity-comp-price",
    storageAncillaryRevenuePrice: "storage-ancillary-revenue-price", storageOtherRevenuePrice: "storage-other-revenue-price"
  });

  function manualSource(project, scenario) {
    return JSON.stringify([project.id, scenario.id, project.startYear, project.forecastYears,
      project.siteType, project.hasStorage, scenario.config]);
  }

  function pendingImports(project, scenario) {
    const pending = scenario && manualImports.get(scenario);
    return pending?.project === project ? pending : null;
  }

  function sameValue(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
  }

  function fieldValue(config, key) {
    return key === "otherNetIncome" ? getScenarioConfig().getOtherNetIncome(config) : config?.[key];
  }

  function sameFeeRow(before, after) {
    return Boolean(before && after) && FEE_FIELDS.every((key) => sameValue(fieldValue(before, key), fieldValue(after, key)));
  }

  function getScenarioConfigForForm(project, scenario) {
    const config = { ...scenario?.config };
    Object.entries(pendingImports(project, scenario)?.groups || {}).forEach(([kind, item]) => {
      const [modeKey, valuesKey] = MANUAL_GROUPS[kind];
      config[modeKey] = "manual";
      config[valuesKey] = item.values;
    });
    return config;
  }

  function hasPendingManualImports(projects = []) {
    return projects.some((project) => (project.scenarios || []).some((scenario) => Boolean(pendingImports(project, scenario))));
  }

  function getManualImportEpoch(scenario) {
    return manualImportEpochs.get(scenario) || 0;
  }

  function clearManualImports(scenario) {
    manualImports.delete(scenario);
    manualImportEpochs.set(scenario, getManualImportEpoch(scenario) + 1);
  }

  function discardPendingManualImports(projects = []) {
    let count = 0;
    projects.forEach((project) => (project.scenarios || []).forEach((scenario) => {
      if (pendingImports(project, scenario)) { clearManualImports(scenario); count += 1; }
    }));
    return count;
  }

  function renderManualImportStatus({ project, scenario, kind, node } = {}) {
    const item = pendingImports(project, scenario)?.groups[kind];
    if (!item) return false;
    if (node) node.textContent = `待确认保存：${Object.keys(item.values).length} 年 · ${item.changedYears} 年数值变化。`;
    return true;
  }

  function stageManualImport({ project, scenario, kind, values, refs = {}, querySelector } = {}) {
    if (!project || !scenario || scenario.locked || !MANUAL_GROUPS[kind]) return invalid("当前方案不可接收导入草稿。");
    const source = manualSource(project, scenario);
    let pending = pendingImports(project, scenario);
    if (pending && pending.source !== source) return invalid("已保存参数或项目边界发生变化，请先放弃本次导入，再重新核对文件。");
    if (!pending) pending = { project, source, groups: {}, revision: 0 };
    const [modeKey, valuesKey] = MANUAL_GROUPS[kind];
    const field = getField(querySelector, `#${REFINEMENT_FIELDS[modeKey]}`) || refs[modeKey];
    const previous = scenario.config?.[valuesKey];
    let imported = JSON.parse(JSON.stringify(values));
    if (kind === "env") imported = getScenarioConfig().preserveLegacyEnvFields(previous, imported);
    if (kind === "fee") {
      imported = getScenarioConfig().preserveLegacyFeeFields(previous, imported);
      for (const year of Object.keys(imported)) {
        if (sameFeeRow(previous?.[year], imported[year])) imported[year] = JSON.parse(JSON.stringify(previous[year]));
      }
    }
    pending.groups[kind] = { values: imported,
      previousMode: pending.groups[kind]?.previousMode ?? field?.value ?? scenario.config?.[modeKey],
      changedYears: Object.keys(imported).filter((year) => !sameValue(imported[year], previous?.[year])).length };
    pending.revision += 1;
    manualImports.set(scenario, pending);
    if (field) field.value = "manual";
    refreshRefinementState({ project, scenario, refs, querySelector, openDrafts: true });
    return { ok: true };
  }

  function buildRefinementState({ project = {}, scenario = {}, config = scenario.config || {} } = {}) {
    const groups = {
      mechanism: ["mechanismEnabled"],
      trade: ["ltPricingMode"],
      environment: ["envValueMode"],
      fees: ["feeConfigMode"],
      storage: project.hasStorage ? ["storageRoundTripEfficiency", "storageCapacityCompPrice", "storageAncillaryRevenuePrice", "storageOtherRevenuePrice"] : []
    };
    if (config.mechanismEnabled) {
      groups.mechanism.push("mechanismRatio", "mechanismPrice", "mechanismStartYm", "mechanismEndYm", "mechanismReferenceMode");
      if (config.mechanismReferenceMode === "same_type") groups.mechanism.push("sameTypeSpread");
    }
    groups.trade.push(...(config.ltPricingMode === "manual" ? ["ltManualPricesByYear"] : ["ltYear1Pnl", "ltTargetPnl", "ltConvergeSpeed"]));
    groups.environment.push(...(config.envValueMode === "manual" ? ["envManualValuesByYear"] : ["greenCertPrice", "greenCertRealizeRatio", "greenPremiumPrice", "greenPremiumRealizeRatio"]));
    groups.fees.push(...(config.feeConfigMode === "manual" ? ["feeManualValuesByYear"] : FEE_FIELDS));
    const empty = (value) => value === undefined || value === null || (typeof value === "string" && !value.trim());
    const numeric = (value) => !empty(value) && Number.isFinite(Number(value));
    const annualComplete = (key) => {
      const startYear = Number(project.startYear), years = Number(project.forecastYears);
      if (!Number.isInteger(startYear) || !Number.isInteger(years) || years <= 0) return false;
      return Array.from({ length: years }, (_, i) => config[key]?.[startYear + i]).every((entry) => {
        if (key === "ltManualPricesByYear") return numeric(entry);
        const keys = key === "feeManualValuesByYear" ? FEE_FIELDS
          : ["greenCertPrice", "greenCertRealizeRatio", "greenPremiumPrice", "greenPremiumRealizeRatio"];
        return keys.every((name) => numeric(fieldValue(entry, name)));
      });
    };
    const fields = {};
    const states = Object.entries(groups).map(([id, keys]) => {
      keys.forEach((key) => {
        const suggestedEfficiency = key === "storageRoundTripEfficiency" && !Object.hasOwn(config, key);
        const value = fieldValue(config, key);
        const missing = key.endsWith("ByYear") ? !annualComplete(key) : !suggestedEfficiency && empty(value);
        const changedDuration = key === "mechanismEndYm" && getRevenueRules().mechanismDurationMonths(config.mechanismStartYm, value)
          !== getRevenueRules().mechanismDurationMonths(scenario.config?.mechanismStartYm, scenario.config?.mechanismEndYm);
        fields[key] = missing ? "missing" : !suggestedEfficiency && !changedDuration && getScenarioModel().isConfigConfirmed(scenario, key, value) ? "confirmed" : "pending";
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
      if (key === "mechanismEndYm") return;
      const field = getField(querySelector, `#${id}`);
      if (!field || field.value === undefined) return;
      const raw = field.value;
      config[key] = raw === "" ? "" : key.endsWith("Enabled") ? raw === "yes"
        : key.endsWith("Mode") || key.endsWith("Ym") ? raw
          : key.endsWith("Ratio") || key === "storageRoundTripEfficiency" ? readRatioValue(querySelector, `#${id}`, Number(raw) / 100) : Number(raw);
    });
    if (getField(querySelector, "#mechanism-duration-months")) config.mechanismEndYm = syncMechanismEndMonth(querySelector);
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
    const pending = pendingImports(project, scenario);
    const previewConfig = { ...config };
    Object.entries(pending?.groups || {}).forEach(([kind, item]) => { previewConfig[MANUAL_GROUPS[kind][1]] = item.values; });
    refreshAnnualPreviews({ project, config: previewConfig, savedConfig: scenario.config, pending, querySelector, resetOpen, openDrafts: input.openDrafts });
    const discard = getField(querySelector, "#discard-manual-imports-button");
    if (discard) discard.hidden = !pending;
    renderScenarioStatus(input, state);
    return state;
  }

  function scenarioKey(input = {}) {
    return input.scenario?.id ? `${input.project?.id || ""}/${input.scenario.id}` : input.scenario;
  }

  function paintScenarioMessage(node, text, tone = "info") {
    if (!node) return;
    node.textContent = text;
    node.hidden = !text;
    if (node.dataset) node.dataset.tone = tone;
    if (!node.style) return;
    const color = { success: "--green", error: "--red", warning: "--orange" }[tone];
    node.style.borderColor = color ? `var(${color})` : "";
    node.style.background = color ? `color-mix(in srgb, var(${color}) 10%, var(--panel))` : "";
    node.style.color = color ? "var(--ink)" : "";
  }

  function setScenarioMessage(input = {}) {
    const node = input.refs?.scenarioMessage;
    if (!node) return;
    const context = input.scenario ? input : messageContexts.get(node);
    actionMessages.set(node, { key: scenarioKey(context), text: input.text || "", tone: input.tone || "error" });
    paintScenarioMessage(node, input.text || "", input.tone || "error");
    if (["error", "conflict"].includes(storageState)) renderScenarioStatus(messageContexts.get(node) || input);
  }

  function renderScenarioStatus(input = {}, refinementState) {
    const { refs = {}, scenario, querySelector } = input;
    const node = refs.scenarioMessage;
    if (!node || !scenario?.config) return;
    messageContexts.set(node, input);
    const state = refinementState || buildRefinementState(input);
    const keys = ["scenarioName", ...Object.keys(state.fields)];
    const editing = keys.some((key) => {
      const field = getField(querySelector, key === "scenarioName" ? "#scenario-name" : `#${REFINEMENT_FIELDS[key]}`) || refs[key];
      const loaded = field && loadedInputs.get(field);
      return loaded && String(field.value) !== loaded.display;
    });
    let notice = actionMessages.get(node);
    if (notice?.key !== scenarioKey(input) || input.clearNotice) {
      actionMessages.delete(node);
      notice = null;
    }
    if (["error", "conflict"].includes(storageState)) {
      paintScenarioMessage(node, "本页修改尚未保存到本机，请处理上方保存提示。", "warning");
    } else if (notice?.tone === "error") {
      paintScenarioMessage(node, notice.text, notice.tone);
    } else if (pendingImports(input.project, scenario)) {
      const count = Object.keys(pendingImports(input.project, scenario).groups).length;
      paintScenarioMessage(node, `已暂存 ${count} 类逐年表，请核对导入预览后确认并保存。`, "warning");
    } else if (editing) {
      paintScenarioMessage(node, "参数已修改，请确认并保存。", "warning");
    } else if (storageState === "pending" && state.confirmed === state.total) {
      paintScenarioMessage(node, "参数已确认，正在保存到本机。", "info");
    } else if (notice) {
      paintScenarioMessage(node, notice.text, notice.tone);
    } else if (state.confirmed === state.total) {
      paintScenarioMessage(node, "当前方案参数已确认并保存。", "success");
    } else {
      const missing = state.groups.reduce((sum, group) => sum + group.missing, 0);
      const pending = state.total - state.confirmed - missing;
      paintScenarioMessage(node, [missing ? `待补充 ${missing} 项` : "", pending ? `待确认 ${pending} 项` : ""].filter(Boolean).join(" · ") + "，完成后确认并保存。");
    }
  }

  function updateScenarioStorageStatus({ refs = {}, status = {} } = {}) {
    // A retry must not hide a known failed write before it actually succeeds.
    if (status.state !== "pending" || !["error", "conflict"].includes(storageState)) storageState = status.state || storageState;
    const context = refs.scenarioMessage && messageContexts.get(refs.scenarioMessage);
    if (context) refreshRefinementState({ ...context, clearNotice: false, resetOpen: false });
  }

  function refreshAnnualPreviews({ project, config, savedConfig = config, pending, querySelector, resetOpen, openDrafts }) {
    const startYear = Number(project.startYear), count = Number(project.forecastYears);
    const years = Number.isInteger(startYear) && Number.isInteger(count) && count > 0 && count <= 100
      ? Array.from({ length: count }, (_, i) => startYear + i) : [];
    const specifications = [
      ["lt", "ltManualPricesByYear", "交易策略逐年损益", [[null, "策略损益 元/MWh"]]],
      ["env", "envManualValuesByYear", "逐年环境价值兑现", [
        ["greenCertPrice", "绿证价格 元/MWh"], ["greenCertRealizeRatio", "绿证兑现空间 %"],
        ["greenPremiumPrice", "绿电溢价 元/MWh"], ["greenPremiumRealizeRatio", "绿电兑现空间 %"]
      ]],
      ["fee", "feeManualValuesByYear", "逐年扣费与其他收益", [
        ["marketOpFee", "市场运营费用 元/MWh"], ["gridAssessFee", "并网考核费用 元/MWh"],
        ["ancillaryFee", "辅助服务费用 元/MWh"], ["otherNetIncome", "其他净收入 元/MWh"]
      ]]
    ];
    const display = (value, key) => {
      if (value === undefined || value === null || (typeof value === "string" && !value.trim()) || !Number.isFinite(Number(value))) return "未填写";
      return String(key?.endsWith("Ratio") ? Number((Number(value) * 100).toPrecision(15)) : Number(value));
    };
    specifications.forEach(([id, key, title, columns]) => {
      const staged = pending?.groups[id];
      const preview = getField(querySelector, `#${id}-annual-preview`);
      const summary = getField(querySelector, `#${id}-annual-preview-summary`);
      const content = getField(querySelector, `#${id}-annual-preview-content`);
      if (preview && (resetOpen || (staged && openDrafts))) preview.open = Boolean(staged);
      if (summary) summary.textContent = staged
        ? `导入预览（${years.length} 年 · ${staged.changedYears} 年变化 · 待保存）`
        : `查看逐年数值（${years.length} 年）`;
      if (!content) return;
      content.innerHTML = `<table aria-label="${title}"><thead><tr><th scope="col">年份</th>${columns.map(([, label]) => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${years.map((year) => {
        const row = config[key]?.[year];
        const oldRow = savedConfig[key]?.[year];
        return `<tr><td>${year}</td>${columns.map(([field]) => {
          const value = field === null ? row : fieldValue(row, field), before = field === null ? oldRow : fieldValue(oldRow, field);
          return staged && !sameValue(value, before)
            ? `<td data-import-changed="true"><span title="原年表值">${display(before, field)}</span> → <strong>${display(value, field)}</strong></td>`
            : `<td>${display(value, field)}</td>`;
        }).join("")}</tr>`;
      }).join("")}</tbody></table>`;
    });
  }

  function bindRefinementState(input) {
    const form = getField(input.querySelector, "#scenario-form");
    if (!form?.addEventListener) { refreshRefinementState({ ...input, resetOpen: true }); return; }
    if (!refinementForms.has(form)) {
      const refresh = () => refreshRefinementState({ ...refinementForms.get(form), clearNotice: true });
      form.addEventListener("input", refresh);
      form.addEventListener("change", refresh);
      getField(input.querySelector, "#discard-manual-imports-button")?.addEventListener?.("click", () => {
        const current = refinementForms.get(form), pending = pendingImports(current.project, current.scenario);
        if (!pending) return;
        Object.entries(pending.groups).forEach(([kind, item]) => {
          const modeKey = MANUAL_GROUPS[kind][0];
          const field = getField(current.querySelector, `#${REFINEMENT_FIELDS[modeKey]}`) || current.refs?.[modeKey];
          if (field?.value === "manual") field.value = item.previousMode;
        });
        clearManualImports(current.scenario);
        setScenarioMessage({ ...current, text: "本次导入已放弃，原年表未改动。", tone: "info" });
        current.onManualDraftDiscard?.();
        refreshRefinementState(current);
      });
    }
    refinementForms.set(form, input);
    refreshRefinementState({ ...input, resetOpen: true });
  }

  function getField(querySelector, selector) {
    return typeof querySelector === "function" ? querySelector(selector) : null;
  }

  function setValue(querySelector, selector, value) {
    const field = getField(querySelector, selector);
    if (field) field.value = value ?? "";
  }

  function setRatioValue(querySelector, selector, value) {
    const field = getField(querySelector, selector);
    if (!field) return;
    const ratio = Number(value);
    const display = value === null || value === undefined || value === "" ? "" : String(Number((ratio * 100).toPrecision(15)));
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

  function readMechanismTerm(querySelector) {
    const mechanismStartYm = selectValue(querySelector, "#mechanism-start-ym");
    const months = numberValue(querySelector, "#mechanism-duration-months");
    return { mechanismStartYm, mechanismEndYm: getRevenueRules().mechanismEndMonth(mechanismStartYm, months) };
  }

  function syncMechanismEndMonth(querySelector) {
    const { mechanismEndYm } = readMechanismTerm(querySelector);
    setValue(querySelector, "#mechanism-end-ym", mechanismEndYm);
    return mechanismEndYm;
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

  function bindScenarioEvents(input = {}) {
    const {
      refs = {},
      handlers = {}
    } = input;
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
      "#mechanism-duration-months"
    ].forEach((selector) => {
      const field = querySelector(selector);
      if (!field) return;
      const update = () => {
        if (selector !== "#mechanism-ratio") syncMechanismEndMonth(querySelector);
        handlers.updateMarketTradeEnergyDisplay?.();
      };
      field.addEventListener("input", update);
      field.addEventListener("change", update);
    });
    [
      "#green-cert-realize-ratio",
      "#green-premium-realize-ratio"
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
        ancillaryFee: 0
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
      const feeSource = scenario.config.feeConfigMode === "manual"
        ? scenario.config.feeManualValuesByYear?.[project.startYear] : scenario.config;
      const otherNetIncome = getScenarioConfig().getOtherNetIncome(feeSource);
      const storagePart = project.hasStorage
        ? scenario.config.storageCapacityCompPrice
          + scenario.config.storageAncillaryRevenuePrice
          + scenario.config.storageOtherRevenuePrice
        : null;
      const primaryFees = feeConfig.marketOpFee + feeConfig.gridAssessFee + feeConfig.ancillaryFee;
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
        <td>${asNum(primaryFees, 1)}</td>
        <td>${otherNetIncome === null ? "—" : asNum(otherNetIncome, 1)}</td>
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
      toggleBaselineText: baselineScenario?.locked ? "解锁基准方案" : "锁定基准方案",
      lockHint: baselineScenario?.locked
        ? "基准方案已锁定。切换到其他方案可继续编辑。"
        : "基准方案未锁定。"
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
      actionMessages.delete(message);
    }
    if (message) validationMessages.delete(message);
    const config = getScenarioConfigForForm(input.project, scenario);
    const storedMode = (key, allowed, fallback) => {
      const value = Object.prototype.hasOwnProperty.call(config, key) ? config[key] : modes[key] || fallback;
      return allowed.includes(value) ? value : "";
    };
    setValue(querySelector, "#scenario-name", scenario.name);
    const nameField = getField(querySelector, "#scenario-name");
    if (nameField) loadedInputs.set(nameField, { display: String(nameField.value), original: scenario.name });
    setValue(querySelector, "#mechanism-enabled", typeof config.mechanismEnabled === "boolean" ? config.mechanismEnabled ? "yes" : "no" : "");
    setRatioValue(querySelector, "#mechanism-ratio", config.mechanismRatio);
    setValue(querySelector, "#mechanism-price", config.mechanismPrice);
    setValue(querySelector, "#mechanism-start-ym", config.mechanismStartYm);
    setValue(querySelector, "#mechanism-duration-months", getRevenueRules().mechanismDurationMonths(config.mechanismStartYm, config.mechanismEndYm));
    syncMechanismEndMonth(querySelector);
    setValue(querySelector, "#mechanism-reference-mode", ["project_capture", "same_type"].includes(config.mechanismReferenceMode) ? config.mechanismReferenceMode : "");
    setValue(querySelector, "#same-type-spread", config.sameTypeSpread);
    if (refs.ltPricingMode) refs.ltPricingMode.value = storedMode("ltPricingMode", ["auto", "manual"], "auto");
    setValue(querySelector, "#lt-year1-pnl", config.ltYear1Pnl);
    setValue(querySelector, "#lt-target-pnl", config.ltTargetPnl);
    setValue(querySelector, "#lt-converge-speed", config.ltConvergeSpeed);
    const stepLabel = getField(querySelector, "#lt-converge-speed-label");
    if (stepLabel) stepLabel.textContent = config.ltConvergeSpeedUnit === "legacy_ratio"
      ? "历史收敛比例（小数，保留原值）" : "年收敛步长 元/MWh/年";
    setValue(querySelector, "#green-cert-price", config.greenCertPrice);
    setRatioValue(querySelector, "#green-cert-realize-ratio", config.greenCertRealizeRatio);
    setValue(querySelector, "#green-premium-price", config.greenPremiumPrice);
    setRatioValue(querySelector, "#green-premium-realize-ratio", config.greenPremiumRealizeRatio);
    if (refs.envValueMode) refs.envValueMode.value = storedMode("envValueMode", ["global", "manual"], "global");
    setValue(querySelector, "#market-op-fee", config.marketOpFee);
    setValue(querySelector, "#grid-assess-fee", config.gridAssessFee);
    setValue(querySelector, "#ancillary-fee", config.ancillaryFee);
    setValue(querySelector, "#other-net-income", fieldValue(config, "otherNetIncome"));
    if (refs.feeConfigMode) refs.feeConfigMode.value = storedMode("feeConfigMode", ["global", "manual"], "global");
    if (refs.storageArbitragePrice) refs.storageArbitragePrice.value = config.storageArbitragePrice ?? "";
    setRatioValue(querySelector, "#storage-round-trip-efficiency",
      Object.hasOwn(config, "storageRoundTripEfficiency") ? config.storageRoundTripEfficiency : 0.9);
    if (refs.storageCapacityCompPrice) refs.storageCapacityCompPrice.value = config.storageCapacityCompPrice ?? "";
    if (refs.storageAncillaryRevenuePrice) refs.storageAncillaryRevenuePrice.value = config.storageAncillaryRevenuePrice ?? "";
    if (refs.storageOtherRevenuePrice) refs.storageOtherRevenuePrice.value = config.storageOtherRevenuePrice ?? "";
    Object.entries(REFINEMENT_FIELDS).forEach(([key, id]) => {
      const field = getField(querySelector, `#${id}`) || refs[key];
      if (field) loadedInputs.set(field, { display: String(field.value), original: fieldValue(config, key) });
    });
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
      "#mechanism-duration-months",
      "#mechanism-end-ym"
    ].forEach((selector) => {
      const target = getField(querySelector, selector);
      if (target) target.disabled = locked || !mechanismEnabled;
    });
    const endLabel = getField(querySelector, "#mechanism-end-ym")?.closest?.("label");
    if (endLabel) endLabel.hidden = !mechanismEnabled;

    [
      getField(querySelector, "#storage-round-trip-efficiency"),
      refs.storageCapacityCompPrice,
      refs.storageAncillaryRevenuePrice,
      refs.storageOtherRevenuePrice
    ].forEach((field) => {
      if (!field) return;
      field.disabled = locked || !canUseStorageRevenue;
    });
    if (refs.storageArbitragePrice) {
      refs.storageArbitragePrice.readOnly = true;
      refs.storageArbitragePrice.disabled = locked || !canUseStorageRevenue;
    }
    if (refs.scenarioLockHint) {
      refs.scenarioLockHint.textContent = locked
        ? "当前方案已锁定，请切换方案或解锁。"
        : "当前方案可编辑。";
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
    if (refs.envValueSpaceRatio) refs.envValueSpaceRatio.disabled = true;
    if (refs.envValueUsedRatio) refs.envValueUsedRatio.disabled = true;
    if (refs.exportEnvTemplateButton) refs.exportEnvTemplateButton.disabled = locked || !project;
    if (refs.envManualFileInput) refs.envManualFileInput.disabled = locked || !project || !isManual;
    if (refs.importEnvTemplateButton) refs.importEnvTemplateButton.disabled = locked || !project || !isManual;

    return {
      mode,
      isManual,
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
    return {
      mechanismEnabled: selectValue(querySelector, "#mechanism-enabled") === "yes",
      mechanismRatio: readRatioValue(querySelector, "#mechanism-ratio", clamp(numberValue(querySelector, "#mechanism-ratio") / 100, 0, 1)),
      mechanismPrice: numberValue(querySelector, "#mechanism-price"),
      ...readMechanismTerm(querySelector),
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
      feeConfigMode,
      feeManualValuesByYear,
      marketOpFee: numberValue(querySelector, "#market-op-fee"),
      gridAssessFee: numberValue(querySelector, "#grid-assess-fee"),
      ancillaryFee: numberValue(querySelector, "#ancillary-fee"),
      otherNetIncome: numberValue(querySelector, "#other-net-income"),
      ...(project.hasStorage ? { storageRoundTripEfficiency: readRatioValue(querySelector,
        "#storage-round-trip-efficiency", numberValue(querySelector, "#storage-round-trip-efficiency") / 100) } : {}),
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
    }
    if (feeConfigMode !== "manual") {
      [["#market-op-fee", "市场运营费"], ["#grid-assess-fee", "电网考核费"], ["#ancillary-fee", "辅助服务费"]]
        .forEach(([selector, label]) => add(selector, label));
      add("#other-net-income", "其他净收入", -Infinity);
    }
    if (project.hasStorage) {
      const efficiency = getField(querySelector, "#storage-round-trip-efficiency")?.value;
      if (efficiency === null || efficiency === undefined || String(efficiency).trim() === ""
          || !Number.isFinite(Number(efficiency)) || Number(efficiency) <= 0 || Number(efficiency) > 100) {
        return "储能往返效率须大于0且不超过100%。";
      }
      [["storageCapacityCompPrice", "配储容量补偿"],
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

  function preserveStoredConfig(input, candidate) {
    const { scenario = {}, project = {}, querySelector, refs = {}, scenarioConfig = {} } = input;
    const stored = scenario.config || {};
    const applicable = new Set(scenarioConfig.applicableConfigKeys?.(project, candidate) || Object.keys(candidate));
    const config = { ...stored, ...candidate };
    const stagedKeys = new Set(Object.keys(pendingImports(project, scenario)?.groups || {}).map((kind) => MANUAL_GROUPS[kind][1]));
    Object.keys(stored).forEach((key) => {
      const field = getField(querySelector, `#${REFINEMENT_FIELDS[key]}`) || refs[key];
      const loaded = field && loadedInputs.get(field);
      const unchanged = key !== "mechanismEndYm" && loaded && String(field.value) === loaded.display
        && JSON.stringify(loaded.original) === JSON.stringify(stored[key]);
      if (!applicable.has(key) || (key.endsWith("ByYear") && !stagedKeys.has(key)) || unchanged) config[key] = stored[key];
    });
    if (!Object.hasOwn(stored, "otherNetIncome") && (!applicable.has("otherNetIncome") ||
        candidate.otherNetIncome === fieldValue(stored, "otherNetIncome"))) delete config.otherNetIncome;
    // This value remains the original rough-price assumption. Refinement neither
    // edits it nor invents one for old scenarios that never saved the field.
    if (Object.hasOwn(stored, "storageArbitragePrice")) config.storageArbitragePrice = stored.storageArbitragePrice;
    else delete config.storageArbitragePrice;
    if (stored.ltConvergeSpeedUnit === "legacy_ratio") {
      config.ltConvergeSpeedUnit = "legacy_ratio";
    }
    return config;
  }

  function validateScenarioSaveDraft(input = {}) {
    const {
      project = {},
      scenario = {},
      refs = {},
      querySelector,
      clamp = (value) => value,
      scenarioConfig = {},
      readEnvValueAllocationDraft = () => ({})
    } = input;
    if (scenario.locked) {
      return invalid("当前方案已锁定，不能保存修改。");
    }
    const pending = pendingImports(project, scenario);
    if (pending && pending.source !== manualSource(project, scenario)) {
      return invalid("已保存参数或项目边界发生变化，请先放弃本次导入，再重新核对文件。");
    }
    for (const kind of Object.keys(pending?.groups || {})) {
      if (refs[MANUAL_GROUPS[kind][0]]?.value !== "manual") return invalid(`暂存的${MANUAL_GROUPS[kind][2]}需在逐年模式下保存，或先放弃本次导入。`);
    }
    const manualConfig = getScenarioConfigForForm(project, scenario);

    const scenarioName = textValue(querySelector, "#scenario-name") || "基准方案";
    const duplicatedName = (project.scenarios || []).find((item) => (
      item.id !== scenario.id && item.name === scenarioName
    ));
    if (duplicatedName) {
      return invalid("方案名称重复，请修改后再保存。");
    }

    const choices = [
      [selectValue(querySelector, "#mechanism-enabled"), ["yes", "no"], "机制电价是否适用"],
      [refs.ltPricingMode?.value, ["auto", "manual"], "中长期交易策略模式"],
      [refs.envValueMode?.value, ["global", "manual"], "环境价值配置模式"],
      [refs.feeConfigMode?.value, ["global", "manual"], "扣费收益配置模式"]
    ];
    if (selectValue(querySelector, "#mechanism-enabled") === "yes") {
      choices.push([selectValue(querySelector, "#mechanism-reference-mode"), ["project_capture", "same_type"], "机制补差参照口径"]);
    }
    for (const [value, allowed, label] of choices) {
      if (!allowed.includes(value)) return invalid(`${label}无效或未填写，请明确选择后再保存。`);
    }

    if (selectValue(querySelector, "#mechanism-enabled") === "yes") {
      const { mechanismStartYm, mechanismEndYm } = readMechanismTerm(querySelector);
      if (!getRevenueRules().mechanismEndMonth(mechanismStartYm, 1)) return invalid("请填写有效的机制开始年月。");
      if (!mechanismEndYm) return invalid("机制执行周期须填写正整数月，且结束年月须在有效范围内。");
    }

    const ltPricingMode = scenarioConfig.getLtPricingMode
      ? scenarioConfig.getLtPricingMode({ ltPricingMode: refs.ltPricingMode?.value })
      : "auto";
    const ltManualPricesByYear = manualConfig.ltManualPricesByYear || {};
    if (ltPricingMode === "manual") {
      const completeness = scenarioConfig.getLtManualCompleteness?.(project, { ltManualPricesByYear }) || { complete: 0, total: 0 };
      if (completeness.complete !== completeness.total) {
        return invalid(`逐年损益值不完整，当前 ${completeness.complete}/${completeness.total} 年。请导入完整测算周期后再保存。`);
      }
    }

    const envValueMode = scenarioConfig.getEnvValueMode
      ? scenarioConfig.getEnvValueMode({ envValueMode: refs.envValueMode?.value })
      : "global";
    const envManualValuesByYear = manualConfig.envManualValuesByYear || {};
    const envAllocationDraft = readEnvValueAllocationDraft(project);
    if (envValueMode === "manual") {
      const completeness = scenarioConfig.getEnvManualCompleteness?.(project, { envManualValuesByYear }) || { complete: 0, total: 0 };
      if (completeness.complete !== completeness.total) {
        return invalid(`逐年环境价值兑现配置不完整，当前 ${completeness.complete}/${completeness.total} 年。请导入完整测算周期后再保存。`);
      }
    } else if (
      envAllocationDraft.greenCertRatio < 0
      || envAllocationDraft.greenPremiumRatio < 0
      || envAllocationDraft.totalRatio > 1 + 0.000001
    ) {
      return invalid(`绿证和绿电溢价的兑现比例合计为 ${asPercent(envAllocationDraft.totalRatio)}，须在 0% 至 100% 内。`);
    }

    const feeConfigMode = scenarioConfig.getFeeConfigMode
      ? scenarioConfig.getFeeConfigMode({ feeConfigMode: refs.feeConfigMode?.value })
      : "global";
    const feeManualValuesByYear = manualConfig.feeManualValuesByYear || {};
    if (feeConfigMode === "manual") {
      const completeness = scenarioConfig.getFeeManualCompleteness?.(project, { feeManualValuesByYear }) || { complete: 0, total: 0 };
      if (completeness.complete !== completeness.total) {
        return invalid(`逐年扣费收益配置不完整，当前 ${completeness.complete}/${completeness.total} 年。请导入完整测算周期后再保存。`);
      }
    }

    const numericError = validateActiveNumericFields({ project, refs, querySelector, ltPricingMode, envValueMode, feeConfigMode });
    if (numericError) return invalid(numericError);
    if (ltPricingMode !== "manual" && scenario.config?.ltConvergeSpeedUnit === "legacy_ratio"
        && Number(getField(querySelector, "#lt-converge-speed")?.value) > 1) {
      return invalid("历史收敛比例应在0至1之间；原值保留，不会自动改为固定步长。");
    }

    return {
      ok: true,
      scenarioName,
      ...(pending ? { manualImportRevision: pending.revision } : {}),
      config: preserveStoredConfig(input, buildScenarioConfigFromForm({
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
      }))
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
      return invalid(draft?.message || "方案保存失败。");
    }
    if (scenario.locked) return invalid("当前方案已锁定，不能保存修改。");
    const pending = pendingImports(project, scenario);
    if (pending && (pending.source !== manualSource(project, scenario) || draft.manualImportRevision !== pending.revision)) {
      return invalid("导入草稿或已保存参数已变化，请重新核对后保存。");
    }
    scenario.name = draft.scenarioName;
    getScenarioModel().invalidateInactiveConfirmations?.(project, scenario);
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
    else confirmedKeys.push("greenCertPrice", "greenCertRealizeRatio", "greenPremiumPrice", "greenPremiumRealizeRatio");
    confirmedKeys.push(...(config.feeConfigMode === "manual" ? ["feeManualValuesByYear"] : FEE_FIELDS));
    if (project.hasStorage) confirmedKeys.push("storageRoundTripEfficiency", "storageCapacityCompPrice", "storageAncillaryRevenuePrice", "storageOtherRevenuePrice");
    getScenarioModel().confirmConfig(scenario, confirmedKeys, { project });
    scenario.updatedAt = nowIso();
    project.statuses = project.statuses || {};
    project.statuses["scenario-page"] = "completed";
    clearManualImports(scenario);
    return {
      ok: true,
      message: `方案“${scenario.name}”已保存。`
    };
  }

  return Object.freeze({
    applyEnvValueControlState,
    applyScenarioManagerView,
    applyScenarioFieldLocks,
    applyScenarioSaveDraft,
    bindScenarioEvents,
    bindScenarioDerivedFieldEvents,
    buildScenarioManagerView,
    buildScenarioSaveDraft,
    buildScenarioConfigFromForm,
    buildRefinementState,
    stageManualImport,
    getScenarioConfigForForm,
    hasPendingManualImports,
    getManualImportEpoch,
    discardPendingManualImports,
    renderManualImportStatus,
    refreshRefinementState,
    setScenarioMessage,
    updateScenarioStorageStatus,
    loadScenarioToForm
  });
});
