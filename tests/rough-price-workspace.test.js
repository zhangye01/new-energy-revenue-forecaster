"use strict";

const assert = require("node:assert/strict");
const workspace = require("../src/ui/rough-price-workspace");
const domain = require("../src/domain/rough-price");
const inputState = require("../src/domain/scenario-model");
const { defaultScenarioConfig } = inputState;
const { calculateScenarioResult } = require("../src/domain/revenue-calculator");

class Element {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.attributes = {};
    this.classList = { toggle() {} };
    this.innerHTML = "";
    this.value = "";
    this.type = "number";
    this.selectors = {};
    this.groups = {};
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  querySelector(selector) { return this.selectors[selector] || null; }
  querySelectorAll(selector) { return this.groups[selector] || []; }
  focus() { this.focused = true; }
}

function documentFixture() {
  const rough = new Element();
  const compare = new Element();
  const buttons = ["rough", "fine", "compare"].map((key) => new Element({ forecastTab: key }));
  const ids = {
    "rough-price-root": rough, "rough-compare-root": compare,
    "forecast-rough-panel": new Element(), "forecast-fine-panel": new Element(), "forecast-compare-panel": new Element()
  };
  const documentRef = {
    getElementById: (id) => ids[id] || null,
    querySelectorAll: (selector) => selector === "[data-forecast-tab]" ? buttons : []
  };
  const controls = {
    capture: new Element(), source: new Element(), node: new Element({ roughNode: "0", nodeField: "value" }),
    sharedPrice: new Element({ sharedKey: "mechanismPrice" }), form: new Element(),
    save: new Element(), message: new Element(), dirty: new Element(), add: new Element(),
    threshold: new Element(), comparisonSummary: new Element(), snapshot: new Element()
  };
  rough.selectors = {
    "[data-rough-capture]": controls.capture, "[data-rough-source]": controls.source,
    "#rough-price-form": controls.form, "[data-rough-save-shared]": controls.save,
    "[data-rough-message]": controls.message, "[data-rough-dirty]": controls.dirty,
    "[data-rough-add]": controls.add
  };
  rough.groups = { "[data-rough-node]": [controls.node], "[data-shared-key]": [controls.sharedPrice] };
  compare.selectors = { "[data-rough-threshold]": controls.threshold, "[data-rough-comparison-summary]": controls.comparisonSummary };
  compare.groups = { "[data-rough-snapshot]": [controls.snapshot] };
  return { documentRef, rough, compare, ids, buttons, controls };
}

function projectFixture() {
  const project = { id: "project-1", name: '<风电 "项目">', province: "shandong", assetType: "wind",
    siteType: "onshore", capacityMw: 100, hasStorage: true, startYear: 2027, forecastYears: 2,
    activeRunId: "run-1", priceRuns: [{ id: "run-1", status: "publishable", pricesByYear: {
      2027: Array(8760).fill(300), 2028: Array(8760).fill(310)
    } }], energyData: { hourlyByYear: { 2027: Array(8760).fill(0.2), 2028: Array(8760).fill(0.2) },
      annualSummary: { 2027: { energyMwh: 175200 }, 2028: { energyMwh: 175200 } } }
  };
  const scenario = { id: "scenario-1", name: '现有<方案>', locked: false, config: defaultScenarioConfig(project) };
  project.scenarios = [scenario]; project.activeScenarioId = scenario.id;
  return { project, scenario };
}

const empty = documentFixture();
workspace.renderWorkspace({ documentRef: empty.documentRef });
assert.match(empty.rough.innerHTML, /请先创建或选择项目/);
assert.equal(empty.compare.innerHTML, "", "rough page does not render the result-stage page");
assert.equal(empty.buttons[0].onclick, undefined, "legacy fine/rough tabs have no behavior");
workspace.renderWorkspace({ documentRef: empty.documentRef, mode: "compare" });
assert.match(empty.compare.innerHTML, /请先创建或选择项目/);

// Navigation controls are created after shell startup and replaced on every render.
// Derive this fixture's buttons from the rendered markup so missing or wrong targets fail.
const navigationFixture = documentFixture();
const navigationData = projectFixture();
const navigationCalls = [];
let navigationButtons = [];
const queryNavigationGroups = navigationFixture.compare.querySelectorAll.bind(navigationFixture.compare);
navigationFixture.compare.querySelectorAll = (selector) => {
  if (selector !== "[data-jump]") return queryNavigationGroups(selector);
  navigationButtons = Array.from(navigationFixture.compare.innerHTML.matchAll(/<button\b[^>]*data-jump="([^"]+)"/g),
    (match) => new Element({ jump: match[1] }));
  return navigationButtons;
};
const navigationOptions = { documentRef: navigationFixture.documentRef, ...navigationData, domain, mode: "compare",
  onNavigate(page) { navigationCalls.push(page); } };
workspace.renderWorkspace(navigationOptions);
assert.deepEqual(navigationButtons.map((button) => button.dataset.jump), ["rough-page"]);
navigationButtons[0].onclick();
assert.deepEqual(navigationCalls, ["rough-page"], "missing rough result links to the independent rough page");
const navigationSnapshot = domain.calculateRough(navigationData.project, navigationData.scenario, {
  spotNodes: [{ year: 2027, value: 300 }], captureRate: 95, sourceNote: "导航回归"
}).snapshot;
navigationData.project.roughPrice.snapshots.push(navigationSnapshot);
workspace.renderWorkspace(navigationOptions);
assert.deepEqual(navigationButtons.map((button) => button.dataset.jump), ["scenario-page"]);
navigationButtons[0].onclick();
assert.equal(navigationCalls.at(-1), "scenario-page", "missing baseline links to the income configuration");
navigationData.project.resultsByScenario = { [navigationData.scenario.id]: domain.stampBaselineResult(
  navigationData.project, navigationData.scenario, navigationData.project.priceRuns[0],
  calculateScenarioResult(navigationData.project, navigationData.scenario, navigationData.project.priceRuns[0])) };
workspace.renderWorkspace(navigationOptions);
assert.deepEqual(navigationButtons.map((button) => button.dataset.jump), ["results-page"]);
navigationButtons[0].onclick();
assert.equal(navigationCalls.at(-1), "results-page", "saved result links to the same baseline overview");
const previousNavigationButton = navigationButtons[0];
workspace.renderWorkspace(navigationOptions);
assert.notEqual(navigationButtons[0], previousNavigationButton);
navigationButtons[0].onclick();
assert.deepEqual(navigationCalls, ["rough-page", "scenario-page", "results-page", "results-page"],
  "replacement controls retain navigation without accumulating callbacks");
navigationData.project.activeRunId = "new-active-run";
workspace.renderWorkspace(navigationOptions);
assert.match(navigationFixture.compare.innerHTML, /生效现货预测已变化/);
assert.match(navigationFixture.compare.innerHTML, /同一份已保存结果对照/);
assert.match(navigationFixture.compare.innerHTML, /年度综合结算电价/, "预测切换仅提示旧结果，不暗中重算对照");

const fixture = documentFixture();
const { project, scenario } = projectFixture();
let changes = 0, persistence = 0, comparisons = 0;
const changesMetadata = [];
const options = {
  documentRef: fixture.documentRef, project, scenario, inputState, mode: "rough",
  getProvinceName: (key) => key === "shandong" ? "山东" : key,
  domain: { ...domain,
    compareSnapshot() { throw new Error("must never recompute a run for comparison"); },
    compareBaselineResult(...args) { comparisons += 1; return domain.compareBaselineResult(...args); } },
  makeId: () => `rough-${changes + 1}`, nowIso: () => "2026-10-19T03:00:00.000Z",
  onPersist() { persistence += 1; },
  onChange(metadata) { changes += 1; changesMetadata.push(metadata); workspace.renderWorkspace(options); }
};
workspace.renderWorkspace(options);
assert.match(fixture.rough.innerHTML, /&lt;风电 &quot;项目&quot;&gt;/);
assert.match(fixture.rough.innerHTML, /现有&lt;方案&gt;/);
assert.match(fixture.rough.innerHTML, /山东 · 风电/);
assert.doesNotMatch(fixture.rough.innerHTML, /shandong/);
assert.match(fixture.rough.innerHTML, /机制电价/);
assert.match(fixture.rough.innerHTML, /data-shared-key="mechanismPrice"[^>]* min="0"/);
assert.match(fixture.rough.innerHTML, /未确认参数保留填写/);
assert.match(fixture.rough.innerHTML, /data-rough-group="mechanism" open/);
assert.match(fixture.rough.innerHTML, /data-rough-group="environment" open/);
assert.doesNotMatch(fixture.rough.innerHTML, /data-shared-key="carbon(?:Enabled|Price|RealizeRatio)"/,
  "onshore projects do not show inapplicable carbon fields as pending input");
assert.match(fixture.rough.innerHTML, /data-rough-group="storage" open/);
assert.doesNotMatch(fixture.rough.innerHTML, /is-confirmed/);
assert.equal(comparisons, 0);
assert.equal(project.roughPrice.draftsByScenario[scenario.id].spotNodes[0].value, null);

fixture.controls.node.value = "300";
fixture.controls.node.oninput();
fixture.controls.node.onchange();
fixture.controls.capture.value = "90";
fixture.controls.capture.oninput();
fixture.controls.capture.onchange();
fixture.controls.source.value = '历史参考, "来源" <script>alert(1)</script>';
fixture.controls.source.oninput();
fixture.controls.source.onchange();
assert.equal(persistence, 3);
assert.equal(changes, 0, "draft changes persist without replacing focused controls");
assert.equal(project.roughPrice.draftsByScenario[scenario.id].captureRate, 90);

const originalPrice = scenario.config.mechanismPrice;
fixture.controls.sharedPrice.value = "400";
fixture.controls.sharedPrice.oninput();
assert.equal(scenario.config.mechanismPrice, originalPrice, "shared parameters are not written before save");
assert.equal(workspace.hasUnsubmittedChanges(fixture.documentRef, [project]), true,
  "uncommitted rough shared fields participate in the browser unload guard");
workspace.renderWorkspace(options);
assert.match(fixture.rough.innerHTML, /data-shared-key="mechanismPrice"[^>]*value="400"/,
  "uncommitted shared edits survive rerenders");
assert.match(fixture.rough.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
workspace.renderWorkspace({ ...options, mode: "compare" });
assert.match(fixture.compare.innerHTML, /请先保存项目电价粗算/);
workspace.renderWorkspace(options);
assert.equal(project.roughPrice.draftsByScenario[scenario.id].spotNodes[0].value, 300);

fixture.controls.form.onsubmit({ preventDefault() {} });
assert.equal(changes, 1);
assert.deepEqual(changesMetadata[0], { sharedChanged: true });
assert.equal(scenario.config.mechanismPrice, 400);
assert.equal(workspace.hasUnsubmittedChanges(fixture.documentRef, [project]), false,
  "successful rough confirmation clears the unsubmitted guard");
assert.equal(project.roughPrice.snapshots.length, 1);
const snapshot = project.roughPrice.snapshots[0];
assert.equal(snapshot.config.mechanismPrice, 400);
assert.equal(snapshot.draft.captureRate, 90);
assert.equal(snapshot.rows[0].capturePrice, 270);
assert.equal(comparisons, 0, "rough calculations do not run full precision comparisons");
assert.match(fixture.rough.innerHTML, /年度粗算结果/);
assert.match(fixture.rough.innerHTML, /导出粗算 CSV/);
assert.ok(inputState.isConfigConfirmed(scenario, "mechanismPrice"));
assert.match(fixture.rough.innerHTML, /data-rough-group="mechanism" open/,
  "only the edited mechanism price is confirmed; unchanged defaults remain visible");
assert.match(fixture.rough.innerHTML, /data-rough-group="environment" open/,
  "generating rough results does not confirm untouched environmental defaults");
assert.match(fixture.rough.innerHTML, /data-rough-group="storage" open/,
  "storage defaults remain pending until explicitly confirmed");
for (const key of ["storageArbitragePrice", "storageCapacityCompPrice", "storageAncillaryRevenuePrice", "storageOtherRevenuePrice"]) {
  assert.equal(inputState.isConfigConfirmed(scenario, key), false, `${key} is not confirmed merely by generating rough results`);
}

const refinementState = require("../src/ui/scenario-form").buildRefinementState({ project, scenario });
assert.equal(refinementState.fields.mechanismPrice, "confirmed");
assert.equal(refinementState.fields.mechanismRatio, "pending");
assert.equal(refinementState.fields.otherFee, "pending");
assert.equal(refinementState.confirmed, 1, "the refinement page confirms only the single actual rough edit");

const rawResult = calculateScenarioResult(project, scenario, project.priceRuns[0]);
project.resultsByScenario = { [scenario.id]: domain.stampBaselineResult(project, scenario, project.priceRuns[0], rawResult) };

const activeBefore = project.activeRunId;
const scenarioBefore = JSON.stringify(scenario);
options.mode = "compare";
workspace.renderWorkspace(options);
assert.equal(comparisons, 1);
assert.equal(project.activeRunId, activeBefore);
assert.equal(JSON.stringify(scenario), scenarioBefore);
assert.match(fixture.compare.innerHTML, /年度现货均价/);
assert.match(fixture.compare.innerHTML, /项目捕获电价/);
assert.match(fixture.compare.innerHTML, /年度综合结算电价/);
assert.match(fixture.compare.innerHTML, /<details class="rough-breakdown"><summary>查看现货均价与捕获电价/);
assert.doesNotMatch(fixture.compare.innerHTML, /模型精算版本|data-rough-run|逐年差额与结算分项/);
assert.match(fixture.compare.innerHTML, /导出对照 CSV/);
assert.match(fixture.compare.innerHTML, /明显偏差|与预期接近/);
workspace.renderWorkspace(options);
assert.equal(comparisons, 2, "the stored annual result is read without hourly recalculation");
workspace.renderWorkspace({ ...options, isActive: false });
assert.equal(comparisons, 2, "other workspaces never run comparisons");

scenario.config.mechanismPrice += 1;
workspace.renderWorkspace(options);
assert.match(fixture.compare.innerHTML, /重新发起基准测算/);
assert.doesNotMatch(fixture.compare.innerHTML, /请更新项目电价粗算/);
assert.match(fixture.compare.innerHTML, /data-jump="results-page">更新基准结果/);
workspace.renderWorkspace({ ...options, mode: "rough" });
assert.match(fixture.rough.innerHTML, /已保留原粗算 · 收益参数已细化/);
const originalSnapshot = JSON.stringify(snapshot);
project.resultsByScenario[scenario.id] = domain.stampBaselineResult(project, scenario, project.priceRuns[0],
  calculateScenarioResult(project, scenario, project.priceRuns[0]));
workspace.renderWorkspace(options);
assert.match(fixture.compare.innerHTML, /原粗算预期 × 细化后基准/);
assert.match(fixture.compare.innerHTML, /年度综合结算电价/);
assert.equal(JSON.stringify(snapshot), originalSnapshot, "refinement does not replace or rewrite the rough snapshot");
assert.equal(project.roughPrice.snapshots[0].config.mechanismPrice, 400, "historic snapshots remain immutable");

// Price assumptions alone must not approve shared defaults, including after another generation.
const defaultsFixture = documentFixture();
const defaultsData = projectFixture();
const defaultsOptions = { documentRef: defaultsFixture.documentRef, ...defaultsData, domain, inputState };
workspace.renderWorkspace(defaultsOptions);
defaultsFixture.controls.node.value = "320";
defaultsFixture.controls.node.oninput();
defaultsFixture.controls.form.onsubmit({ preventDefault() {} });
assert.deepEqual(defaultsData.scenario.confirmedConfig, {});
workspace.renderWorkspace(defaultsOptions);
defaultsFixture.controls.form.onsubmit({ preventDefault() {} });
assert.equal(require("../src/ui/scenario-form").buildRefinementState(defaultsData).confirmed, 0);
const snapshotBeforeConfirmation = JSON.stringify(defaultsData.project.roughPrice.snapshots);
defaultsFixture.controls.save.onclick();
assert.ok(inputState.isConfigConfirmed(defaultsData.scenario, "otherFee"), "explicit whole-page confirmation accepts even unchanged defaults");
assert.equal(JSON.stringify(defaultsData.project.roughPrice.snapshots), snapshotBeforeConfirmation, "confirmation never rewrites existing rough snapshots");
const restoredDefaults = inputState.sanitizeScenario(defaultsData.project, defaultsData.scenario);
assert.ok(inputState.isConfigConfirmed(restoredDefaults, "otherFee"), "explicit default confirmation survives hydration");
workspace.renderWorkspace(defaultsOptions);
defaultsFixture.controls.form.onsubmit({ preventDefault() {} });
assert.ok(inputState.isConfigConfirmed(defaultsData.scenario, "otherFee"), "subsequent generation preserves prior confirmation");

// Switching to yearly inputs auto-fills suggested values; one annual edit cannot approve all years.
const annualFixture = documentFixture();
const annualData = projectFixture();
const annualMode = new Element({ sharedKey: "ltPricingMode" }); annualMode.type = "select-one";
const annualValue = new Element({ sharedKey: "value", sharedGroup: "ltManualPricesByYear", sharedYear: "2027" });
annualFixture.rough.groups["[data-shared-key]"].push(annualMode, annualValue);
const annualOptions = { documentRef: annualFixture.documentRef, ...annualData, domain, inputState };
workspace.renderWorkspace(annualOptions);
annualMode.value = "manual"; annualMode.onchange();
annualFixture.controls.node.value = "320"; annualFixture.controls.node.oninput();
annualValue.value = "12"; annualValue.oninput();
annualFixture.controls.form.onsubmit({ preventDefault() {} });
assert.ok(inputState.isConfigConfirmed(annualData.scenario, "ltPricingMode"));
assert.equal(inputState.isConfigConfirmed(annualData.scenario, "ltManualPricesByYear"), false);
assert.equal(require("../src/ui/scenario-form").buildRefinementState(annualData).fields.ltManualPricesByYear, "pending");

const thresholdFixture = documentFixture();
const thresholdData = projectFixture();
thresholdData.project.hasStorage = false;
Object.assign(thresholdData.scenario.config, {
  mechanismEnabled: false, ltYear1Pnl: 0, ltTargetPnl: 0,
  greenCertPrice: 0, greenPremiumPrice: 0,
  marketOpFee: 0, gridAssessFee: 0, ancillaryFee: 0, otherFee: 0, otherIncome: 0
});
const thresholdSnapshot = domain.calculateRough(thresholdData.project, thresholdData.scenario, {
  spotNodes: [{ year: 2027, value: 270 }], captureRate: 100, sourceNote: "阈值回归"
}).snapshot;
thresholdData.project.roughPrice = { draftsByScenario: {}, snapshots: [thresholdSnapshot] };
const thresholdResult = domain.stampBaselineResult(thresholdData.project, thresholdData.scenario, thresholdData.project.priceRuns[0],
  calculateScenarioResult(thresholdData.project, thresholdData.scenario, thresholdData.project.priceRuns[0]));
thresholdData.project.resultsByScenario = { [thresholdData.scenario.id]: thresholdResult };
const thresholdOptions = { documentRef: thresholdFixture.documentRef, ...thresholdData, domain, mode: "compare" };
workspace.renderWorkspace(thresholdOptions);
assert.match(thresholdFixture.compare.innerHTML, /class="rough-review"/);
const thresholdComparison = domain.compareBaselineResult(thresholdData.project, thresholdData.scenario,
  thresholdSnapshot, thresholdResult);
const reviewCells = thresholdComparison.rows.map((row) => new Element({ roughReviewDelta: String(row.relativeDelta) }));
const zeroBasisCell = new Element({ roughReviewDelta: "" });
thresholdFixture.compare.groups["[data-rough-review-delta]"] = [...reviewCells, zeroBasisCell];
thresholdFixture.controls.threshold.value = "20";
thresholdFixture.controls.threshold.oninput();
assert.ok(reviewCells.every((cell) => cell.innerHTML === "与预期接近"), "input immediately updates 11%-15% review labels at a 20% threshold");
assert.equal(zeroBasisCell.innerHTML, "参考绝对差额", "a zero comparison basis never gets a relative threshold verdict");
assert.match(thresholdFixture.controls.comparisonSummary.innerHTML, /整体与粗算预期接近/);
assert.doesNotMatch(thresholdFixture.controls.comparisonSummary.innerHTML, /存在明显偏差/);
thresholdFixture.controls.snapshot.value = thresholdSnapshot.id;
thresholdFixture.controls.snapshot.onchange();
assert.match(thresholdFixture.compare.innerHTML, /data-rough-threshold[^>]*value="20"/,
  "switching rough versions preserves an input-only threshold edit");
assert.doesNotMatch(thresholdFixture.compare.innerHTML, /class="rough-review"/);
assert.equal(thresholdData.project.activeRunId, "run-1", "comparison is read-only");
for (const invalid of ["", "0", "1001", "bad"]) {
  thresholdFixture.controls.threshold.value = invalid;
  thresholdFixture.controls.threshold.oninput();
  thresholdFixture.controls.threshold.onchange();
  assert.equal(String(thresholdFixture.controls.threshold.value), "20", "invalid edits restore the last valid threshold");
}
thresholdFixture.controls.threshold.value = "10";
thresholdFixture.controls.threshold.oninput();
assert.ok(reviewCells.every((cell) => cell.innerHTML.includes("明显偏差")), "lowering the threshold refreshes all annual review labels");
assert.match(thresholdFixture.controls.comparisonSummary.innerHTML, /整体存在明显偏差/);

const lockedFixture = documentFixture();
const lockedData = projectFixture();
lockedData.scenario.locked = true;
const lockedOptions = { documentRef: lockedFixture.documentRef, ...lockedData, domain,
  onChange() {}, onPersist() {}, makeId: () => "rough-locked" };
workspace.renderWorkspace(lockedOptions);
assert.match(lockedFixture.rough.innerHTML, /方案已锁定，只读/);
assert.match(lockedFixture.rough.innerHTML, /data-shared-key="mechanismPrice"[^>]* disabled/);
lockedFixture.controls.sharedPrice.value = "999";
lockedFixture.controls.sharedPrice.oninput();
assert.notEqual(lockedData.scenario.config.mechanismPrice, 999);
lockedFixture.controls.save.onclick();
assert.match(lockedFixture.controls.message.textContent, /已锁定/);
lockedFixture.controls.node.value = "320";
lockedFixture.controls.node.oninput();
lockedFixture.controls.form.onsubmit({ preventDefault() {} });
assert.equal(lockedData.project.roughPrice.snapshots.length, 1, "locked scenarios still allow independent rough assumptions");

const lockTransitionFixture = documentFixture();
const lockTransitionData = projectFixture();
const savedMechanismPrice = lockTransitionData.scenario.config.mechanismPrice;
const lockTransitionOptions = { documentRef: lockTransitionFixture.documentRef, ...lockTransitionData, domain,
  makeId: () => "rough-after-lock", onChange() { workspace.renderWorkspace(lockTransitionOptions); } };
workspace.renderWorkspace(lockTransitionOptions);
lockTransitionFixture.controls.sharedPrice.value = "400";
lockTransitionFixture.controls.sharedPrice.oninput();
lockTransitionData.scenario.locked = true;
workspace.renderWorkspace(lockTransitionOptions);
assert.match(lockTransitionFixture.rough.innerHTML,
  new RegExp(`data-shared-key="mechanismPrice"[^>]*value="${savedMechanismPrice}"[^>]* disabled`),
  "locking shows saved shared parameters rather than an unsaved edit");
assert.match(lockTransitionFixture.rough.innerHTML, /未保存的共用参数调整已撤销/);
lockTransitionFixture.controls.node.value = "300";
lockTransitionFixture.controls.node.oninput();
lockTransitionFixture.controls.form.onsubmit({ preventDefault() {} });
assert.equal(lockTransitionData.project.roughPrice.snapshots[0].config.mechanismPrice, savedMechanismPrice,
  "the generated locked snapshot matches the read-only parameter value");
lockTransitionData.scenario.locked = false;
workspace.renderWorkspace(lockTransitionOptions);
lockTransitionFixture.controls.save.onclick();
assert.equal(lockTransitionData.scenario.config.mechanismPrice, savedMechanismPrice,
  "unlocking does not revive discarded shared edits");

const manualData = projectFixture();
Object.assign(manualData.scenario.config, { envValueMode: "manual", feeConfigMode: "manual", ltPricingMode: "manual",
  ltManualPricesByYear: { 2027: 11, 2028: 8 }, envManualValuesByYear: {
    2027: { greenCertPrice: 20, greenCertRealizeRatio: 0.6, greenPremiumPrice: 12, greenPremiumRealizeRatio: 0.3, carbonEnabled: false, carbonPrice: 0, carbonRealizeRatio: 0 },
    2028: { greenCertPrice: 23, greenCertRealizeRatio: 0.7, greenPremiumPrice: 13, greenPremiumRealizeRatio: 0.2, carbonEnabled: false, carbonPrice: 0, carbonRealizeRatio: 0 }
  }, feeManualValuesByYear: { 2027: { marketOpFee: 1, gridAssessFee: 2, ancillaryFee: 3, otherFee: 4, otherIncome: 5 },
    2028: { marketOpFee: 2, gridAssessFee: 3, ancillaryFee: 4, otherFee: 5, otherIncome: 6 } } });
const manualFixture = documentFixture();
const manualBefore = JSON.stringify(manualData.scenario.config);
workspace.renderWorkspace({ documentRef: manualFixture.documentRef, ...manualData, domain });
assert.match(manualFixture.rough.innerHTML, /data-shared-group="envManualValuesByYear"/);
assert.match(manualFixture.rough.innerHTML, /data-shared-key="greenCertRealizeRatio"[^>]*value="60"/);
assert.match(manualFixture.rough.innerHTML, /data-shared-group="feeManualValuesByYear"/);
assert.doesNotMatch(manualFixture.rough.innerHTML, /data-shared-key="carbon(?:Enabled|Price|RealizeRatio)"/,
  "manual onshore years also omit inapplicable carbon fields");
assert.equal(JSON.stringify(manualData.scenario.config), manualBefore, "rendering preserves independent manual components");
assert.deepEqual(workspace.validateShared(manualData.project, manualData.scenario, manualData.scenario.config, domain), []);
manualData.scenario.config.envManualValuesByYear[2027].greenPremiumRealizeRatio = 0.8;
assert.match(workspace.validateShared(manualData.project, manualData.scenario, manualData.scenario.config, domain).join(" "), /比例合计不能超过100%|配置不完整/);

for (const mode of ["global", "manual"]) {
  const offshoreFixture = documentFixture();
  const offshoreData = projectFixture();
  offshoreData.project.siteType = "offshore";
  offshoreData.scenario.config.envValueMode = mode;
  workspace.renderWorkspace({ documentRef: offshoreFixture.documentRef, ...offshoreData, domain });
  for (const key of ["carbonEnabled", "carbonPrice", "carbonRealizeRatio"]) {
    assert.match(offshoreFixture.rough.innerHTML, new RegExp(`data-shared-key="${key}"`),
      `offshore ${mode} mode retains applicable ${key} input`);
  }
}

// Switching presentation modes must not silently turn a missing assumption into a zero.
for (const [modeKey, missingKey, manualField] of [
  ["envValueMode", "greenCertPrice", "greenCertPrice"],
  ["feeConfigMode", "otherFee", "otherFee"],
  ["ltPricingMode", "ltYear1Pnl", "value"]
]) {
  const missingFixture = documentFixture();
  const missingData = projectFixture();
  missingData.scenario.config[missingKey] = null;
  const modeControl = new Element({ sharedKey: modeKey });
  modeControl.type = "select-one";
  missingFixture.rough.groups["[data-shared-key]"].push(modeControl);
  workspace.renderWorkspace({ documentRef: missingFixture.documentRef, ...missingData, domain, inputState });
  modeControl.value = "manual";
  modeControl.onchange();
  assert.match(missingFixture.rough.innerHTML,
    new RegExp(`data-shared-key="${manualField}"[^>]*data-shared-year="2027"[^>]*value=""`),
    `${modeKey} keeps an unfilled field visible rather than replacing it with zero`);
  missingFixture.controls.node.value = "300";
  missingFixture.controls.node.oninput();
  missingFixture.controls.form.onsubmit({ preventDefault() {} });
  assert.equal(missingData.project.roughPrice.snapshots.length, 0, "incomplete assumptions prevent generation");
  assert.equal(inputState.isConfigConfirmed(missingData.scenario, missingKey), false,
    "failed generation does not confirm incomplete assumptions");
}

for (const storageKey of ["storageArbitragePrice", "storageCapacityCompPrice", "storageAncillaryRevenuePrice", "storageOtherRevenuePrice"]) {
  const storageData = projectFixture();
  storageData.scenario.config[storageKey] = null;
  assert.ok(workspace.validateShared(storageData.project, storageData.scenario, storageData.scenario.config, domain).length,
    `${storageKey} cannot be omitted for a storage project`);
  storageData.project.hasStorage = false;
  assert.deepEqual(workspace.validateShared(storageData.project, storageData.scenario, storageData.scenario.config, domain), [],
    "a project without storage does not require storage assumptions");
}

const csv = workspace.buildRoughCsv(snapshot);
assert.match(csv, /^\ufeff/);
assert.match(csv, /"历史参考, ""来源"" <script>alert\(1\)<\/script>"/);
assert.match(csv, /策略贡献/);
// Export helper accepts already computed data and performs proper CSV quoting.
const conditionalFixture = documentFixture();
const conditionalData = projectFixture();
conditionalData.project.siteType = "offshore";
conditionalData.project.hasStorage = false;
conditionalData.scenario.config.mechanismEnabled = false;
conditionalData.scenario.config.carbonEnabled = false;
inputState.confirmConfig(conditionalData.scenario, ["mechanismEnabled", "envValueMode", "greenCertPrice",
  "greenCertRealizeRatio", "greenPremiumPrice", "greenPremiumRealizeRatio", "carbonEnabled"]);
const conditionalOptions = { documentRef: conditionalFixture.documentRef, ...conditionalData, domain, inputState };
workspace.renderWorkspace(conditionalOptions);
assert.doesNotMatch(conditionalFixture.rough.innerHTML, /data-rough-group="mechanism" open/,
  "disabled mechanism parameters do not force duplicate confirmation");
assert.doesNotMatch(conditionalFixture.rough.innerHTML, /data-rough-group="environment" open/,
  "disabled carbon values do not force duplicate confirmation");
assert.doesNotMatch(conditionalFixture.rough.innerHTML, /data-rough-group="storage"/);
conditionalData.project.hasStorage = true;
workspace.renderWorkspace(conditionalOptions);
assert.match(conditionalFixture.rough.innerHTML, /data-rough-group="storage" open/,
  "newly applicable storage parameters remain visible until explicitly confirmed");
conditionalData.scenario.config.ltPricingMode = "manual";
conditionalData.scenario.config.ltManualPricesByYear = { 2027: 8, 2028: 6 };
inputState.confirmConfig(conditionalData.scenario, ["ltPricingMode", "ltManualPricesByYear"]);
const manualGroup = new Element({ roughGroup: "strategy" });
manualGroup.open = false;
conditionalFixture.rough.groups["[data-rough-group]"] = [manualGroup];
workspace.renderWorkspace(conditionalOptions);
manualGroup.ontoggle();
require("../src/domain/project-model").applyCreateProjectInput(conditionalData.project, { ...conditionalData.project, forecastYears: 3 });
workspace.renderWorkspace(conditionalOptions);
assert.match(conditionalFixture.rough.innerHTML, /data-rough-group="strategy" open/,
  "expanding the period reveals missing annual inputs even if the group was previously collapsed");
assert.match(conditionalFixture.rough.innerHTML, /data-shared-year="2029"[^>]*value=""/);

const compareCsv = workspace.buildComparisonCsv(snapshot, { runId: 'run,"quoted"', generatedAt: "2026-10-19T03:00:00Z" }, {
  rows: [{ year: 2027, roughSpot: 300, fineSpot: 301, roughCapture: 270, fineCapture: 271,
    roughSettlement: 350, fineSettlement: 351, delta: 1, relativeDelta: 1 / 350, fineCaptureRate: 90 }]
});
assert.match(compareCsv, /"run,""quoted"""/);
assert.match(compareCsv, /综合价差异率/);
assert.match(compareCsv, /基准结果生成时间/);
console.log("rough price workspace tests passed");
