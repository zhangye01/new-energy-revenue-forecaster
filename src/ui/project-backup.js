"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_PROJECT_BACKUP = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const FORMAT = "new-energy-project-backup";
  const formBaselines = new WeakMap();
  const selectedScenarios = new WeakMap();
  const FORM_SELECTORS = ["#create-project-form", "#scenario-form", "#forecast-run-form", "#scenario-quick-name"];
  const NAVIGATION_CONTROLS = ["[data-page]", "[data-jump]", "[data-open-project]", "#create-to-energy-button",
    "#energy-to-history-button", "#account-profile-button", "#account-password-button", "#logout-button", "#settings-logout-button",
    "#duplicate-scenario-button", "#delete-scenario-button", "#toggle-baseline-lock-button", "#apply-batch-button", "#rename-scenario-button"].join(", ");

  function formSignature(form) {
    const fields = form && "value" in form && form.id === "scenario-quick-name" ? [form] : Array.from(form?.querySelectorAll?.("input, select, textarea") || []);
    return JSON.stringify(fields
      .filter((field) => !["file", "password", "submit", "button", "hidden"].includes(field.type) && !field.readOnly)
      .map((field, index) => [field.id || field.name || index,
        ["checkbox", "radio"].includes(field.type) ? Boolean(field.checked) :
          field.type === "number" && field.value !== "" && Number.isFinite(Number(field.value)) ? Number(field.value) : String(field.value ?? "")]));
  }

  function captureFormState(documentRef, selectors = FORM_SELECTORS.filter((selector) => selector !== "#forecast-run-form")) {
    if (!formBaselines.has(documentRef)) formBaselines.set(documentRef, new Map());
    const baselines = formBaselines.get(documentRef);
    const scenarioSelector = documentRef.querySelector("#scenario-selector");
    if (scenarioSelector) selectedScenarios.set(documentRef, scenarioSelector.value);
    FORM_SELECTORS.forEach((selector) => {
      const form = documentRef.querySelector(selector);
      if (form && (!baselines.has(selector) || selectors.includes(selector))) baselines.set(selector, formSignature(form));
    });
  }

  function hasUnsubmittedFormChanges(documentRef, selectors = FORM_SELECTORS) {
    const baselines = formBaselines.get(documentRef);
    return Boolean(baselines && selectors.some((selector) => {
      const form = documentRef.querySelector(selector);
      return form && baselines.has(selector) && baselines.get(selector) !== formSignature(form);
    }));
  }

  function ownedProjects(snapshot, account) {
    const key = String(account).trim().toLowerCase();
    return (snapshot?.payload?.projects || []).filter((project) => String(project.ownerAccount || "").trim().toLowerCase() === key);
  }

  function buildBackup(snapshot, account, now = new Date().toISOString(), recoverySnapshots = []) {
    if (!account) throw new Error("请先登录后下载项目备份。");
    const projects = ownedProjects(snapshot, account);
    const seen = new Set([JSON.stringify(projects)]);
    const recoveryBranches = recoverySnapshots.flatMap((entry) => {
      const branchProjects = ownedProjects(entry?.snapshot, account), identity = JSON.stringify(branchProjects);
      if (!branchProjects.length || seen.has(identity)) return [];
      seen.add(identity);
      return [{ label: String(entry.label || "其他已保存分支"), projects: branchProjects }];
    });
    return JSON.stringify({ format: FORMAT, version: 1, exportedAt: now, projects,
      ...(recoveryBranches.length ? { recoveryBranches } : {}) });
  }

  function prepareRestore(text, existingProjects, account, makeId) {
    if (!account) throw new Error("请先登录后恢复项目。");
    let data;
    try { data = JSON.parse(text); } catch { throw new Error("备份文件不是有效的 JSON。"); }
    if (data?.format !== FORMAT || data.version !== 1 || !Array.isArray(data.projects)) {
      throw new Error("请选择包含项目的本工具备份文件（版本 1）。");
    }
    const branches = data.recoveryBranches === undefined ? [] : data.recoveryBranches;
    if (!Array.isArray(branches) || branches.some((branch) => !Array.isArray(branch?.projects) || typeof branch.label !== "string")) {
      throw new Error("备份恢复分支结构无效，未恢复任何项目。");
    }
    const allProjects = [...data.projects, ...branches.flatMap((branch) => branch.projects)];
    if (!allProjects.length) throw new Error("请选择包含项目的本工具备份文件（版本 1）。");
    const ids = new Set(existingProjects.map((project) => project.id));
    let copies = 0;
    const projects = allProjects.map((project) => {
      const draft = project?.workspaceBucket === "new";
      const validPeriod = (draft && project.startYear == null && project.forecastYears == null) ||
        (Number.isInteger(project?.startYear) && Number.isInteger(project?.forecastYears) && project.forecastYears >= 1 && project.forecastYears <= 30);
      const validCapacity = (draft && project.capacityMw == null) || (Number.isFinite(project?.capacityMw) && project.capacityMw > 0);
      if (!project || typeof project.id !== "string" || !project.id || typeof project.name !== "string" ||
          !validPeriod || !validCapacity || !Array.isArray(project.scenarios) || (!draft && !project.scenarios.length)) {
        throw new Error("备份项目结构不完整，未恢复任何项目。");
      }
      const restored = { ...project, ownerAccount: account };
      if (ids.has(restored.id)) {
        restored.restoredFromProjectIds = Array.from(new Set([
          project.id, project.restoredFromProjectId,
          ...(Array.isArray(project.restoredFromProjectIds) ? project.restoredFromProjectIds : [])
        ].filter((id) => typeof id === "string" && id.trim())));
        restored.restoredFromProjectId = typeof project.restoredFromProjectId === "string" && project.restoredFromProjectId.trim()
          ? project.restoredFromProjectId : project.id;
        restored.id = makeId("restored");
        if (!restored.id || ids.has(restored.id)) throw new Error("无法生成唯一副本编号，请重试。");
        restored.name = `${restored.name}（恢复副本）`;
        copies += 1;
      }
      ids.add(restored.id);
      return restored;
    });
    return { projects, copies, ...(branches.length ? { recoveryBranches: branches.length } : {}) };
  }

  function downloadBackup(input) {
    if (input.hasUnsubmittedChanges?.()) throw new Error("页面还有未提交的输入，请先点击对应页面的保存或生成按钮，再下载备份；不会自动确认参数。");
    const text = buildBackup(input.getSnapshot(), input.getAccount(), new Date().toISOString(), input.getRecoverySnapshots?.() || []);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = input.documentRef.createElement("a");
    anchor.href = url;
    anchor.download = `新能源项目备份-${new Date().toISOString().slice(0, 10)}.json`;
    input.documentRef.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const branches = JSON.parse(text).recoveryBranches?.length || 0;
    input.notify(`已发起备份下载，包含参数、确认记录、预测版本和粗算快照。${branches ? `另保留 ${branches} 组冲突恢复分支，恢复时会分别生成副本。` : ""}`);
  }

  function bind(input) {
    const doc = input.documentRef;
    doc.addEventListener?.("click", (event) => {
      const navigation = event.target?.closest?.(NAVIGATION_CONTROLS);
      if (!navigation || !input.hasUnsubmittedChanges?.()) return;
      if (navigation.id === "rename-scenario-button" && !hasUnsubmittedFormChanges(doc, FORM_SELECTORS.filter((selector) => selector !== "#scenario-quick-name"))) return;
      event.preventDefault?.(); event.stopImmediatePropagation?.();
      input.notify("页面还有未提交的输入，请先保存或生成结果，再切换页面或方案；不会自动确认参数。");
    }, true);
    doc.addEventListener?.("change", (event) => {
      if (event.target?.id !== "scenario-selector" || !input.hasUnsubmittedChanges?.()) return;
      event.target.value = selectedScenarios.get(doc) ?? event.target.value;
      event.preventDefault?.(); event.stopImmediatePropagation?.();
      input.notify("当前方案还有未提交的输入，请先保存，再切换方案。");
    }, true);
    const download = () => { try { downloadBackup(input); } catch (error) { input.notify(error.message); } };
    doc.querySelector("#backup-export")?.addEventListener("click", download);
    doc.querySelector("#storage-backup")?.addEventListener("click", download);
    doc.querySelector("#storage-reload")?.addEventListener("click", () => input.reload());
    const fileInput = doc.querySelector("#backup-import-file");
    doc.querySelector("#backup-import")?.addEventListener("click", () => {
      if (input.hasUnsubmittedChanges?.()) { input.notify("请先保存当前页面输入，再恢复项目备份。"); return; }
      fileInput?.click();
    });
    fileInput?.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        if (input.hasUnsubmittedChanges?.()) throw new Error("请先保存当前页面输入，再恢复项目备份。");
        const text = await file.text();
        if (input.hasUnsubmittedChanges?.()) throw new Error("请先保存当前页面输入，再恢复项目备份。");
        const restored = prepareRestore(text, input.getSnapshot().payload.projects, input.getAccount(), input.makeId);
        input.restore(restored.projects);
        input.notify(`已恢复 ${restored.projects.length} 个项目${restored.copies ? `，其中 ${restored.copies} 个恢复为副本，原粗算保留，副本基准结果需重新生成` : ""}${restored.recoveryBranches ? `；已分别保留 ${restored.recoveryBranches} 组恢复分支` : ""}。`);
      } catch (error) { input.notify(error.message); }
      fileInput.value = "";
    });
  }

  function renderStorageState(documentRef, state = {}) {
    const banner = documentRef.querySelector("#storage-status-banner");
    const message = documentRef.querySelector("#storage-status-message");
    const badge = documentRef.querySelector("#settings-storage-state");
    const scenarioMessage = documentRef.querySelector("#scenario-message");
    const failed = ["conflict", "error"].includes(state.state);
    if (banner && state.state !== "pending") banner.hidden = !failed;
    if (message) message.textContent = state.state === "conflict"
      ? "另一页面已保存新版本，本页已暂停保存。请先下载本页备份，再载入最新数据。"
      : "当前改动未能保存。请下载本页备份，检查浏览器存储后再继续。";
    if (badge) badge.textContent = ({ saved: "已保存", pending: "保存中", conflict: "存在冲突", error: "未保存" })[state.state] || "待保存";
    if (failed && scenarioMessage?.textContent.includes("已保存")) {
      scenarioMessage.textContent = "本页参数已确认，但尚未保存；请处理上方保存提示。";
    }
  }

  return Object.freeze({ buildBackup, prepareRestore, bind, renderStorageState, captureFormState, hasUnsubmittedFormChanges });
});
