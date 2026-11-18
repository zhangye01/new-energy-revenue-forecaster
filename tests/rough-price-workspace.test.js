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
    endPrice: new Element(),
    sharedPrice: new Element({ sharedKey: "mechanismPrice" }), form: new Element(),
    save: new Element(), message: new Element(), dirty: new Element(), add: new Element(),
    threshold: new Element(), comparisonSummary: new Element(), snapshot: new Element()
  };
  controls.settlement = Object.fromEntries(Object.keys(compactInputs).map((key) => [key, new Element({ roughSettlement: key })]));
  rough.selectors = {
    "[data-rough-capture]": controls.capture, "[data-rough-source]": controls.source,
    "[data-rough-end-price]": controls.endPrice,
    "#rough-price-form": controls.form, "[data-rough-save-shared]": controls.save,
    "[data-rough-message]": controls.message, "[data-rough-dirty]": controls.dirty,
    "[data-rough-add]": controls.add
  };
  rough.groups = { "[data-rough-node]": [controls.node], "[data-shared-key]": [controls.sharedPrice],
    "[data-rough-settlement]": Object.values(controls.settlement) };
  compare.selectors = { "[data-rough-threshold]": controls.threshold, "[data-rough-comparison-summary]": controls.comparisonSummary };
  compare.groups = { "[data-rough-snapshot]": [controls.snapshot] };
  return { documentRef, rough, compare, ids, buttons, controls };
}

const compactInputs = { ltYear1Pnl: 8, ltTargetPnl: 2, ltConvergeSpeed: 2, environmentPrice: 11, feesNetPrice: -15, storagePrice: 4 };

function fillSettlement(fixture, values = compactInputs) {
  for (const [key, value] of Object.entries(values)) {
    const field = fixture.controls.settlement[key];
    field.value = value === null ? "" : String(value);
    field.oninput();
  }
}

function projectFixture() {
  const project = { id: "project-1", name: '<风电 "项目">', province: "shandong", assetType: "wind",
    siteType: "onshore", capacityMw: 100, hasStorage: true, storagePowerMw: 20, storageDurationH: 2, startYear: 2027, forecastYears: 2,
    activeRunId: "run-1", priceRuns: [{ id: "run-1", status: "publishable", pricesByYear: {
      2027: Array(8760).fill(300), 2028: Array(8760).fill(310)
    } }], energyData: { hourlyByYear: { 2027: Array(8760).fill(0.2), 2028: Array(8760).fill(0.2) },
      annualSummary: { 2027: { energyMwh: 175200 }, 2028: { energyMwh: 175200 } } }
  };
  const scenario = { id: "scenario-1", name: '现有<方案>', locked: false, config: defaultScenarioConfig(project) };
  project.scenarios = [scenario]; project.activeScenarioId = scenario.id;
  return { project, scenario };
}

const priceFixture = documentFixture();
const priceData = projectFixture();
priceData.project.forecastYears = 4;
const priceDraft = { spotNodes: [
  { year: 2027, value: 200 }, { year: 2030, value: 800 }, { year: 2029, value: 350 }
], captureRate: 95, sourceNote: "" };
priceData.project.roughPrice = { draftsByScenario: { [priceData.scenario.id]: priceDraft }, snapshots: [] };
const latePrice = new Element({ roughNode: "2", nodeField: "value" });
priceFixture.rough.groups["[data-rough-node]"].push(latePrice);
let priceChanges = 0;
const priceOptions = { ...priceData, documentRef: priceFixture.documentRef, domain, onPersist() { priceChanges += 1; } };
const savedPriceDraft = JSON.stringify(priceDraft);
workspace.renderWorkspace(priceOptions);
assert.match(priceFixture.rough.innerHTML, /data-rough-end-year value="2030" readonly/);
assert.match(priceFixture.rough.innerHTML, /data-rough-end-price value="800" placeholder="350"/);
assert.match(priceFixture.rough.innerHTML, /相邻节点间按年份线性插值/);
assert.match(priceFixture.rough.innerHTML, /data-rough-remove="0"[^>]* disabled/,
  "the required start node stays protected when the draft also has an explicit terminal price");
assert.doesNotMatch(priceFixture.rough.innerHTML, /data-rough-remove="1"/);
assert.equal(JSON.stringify(priceDraft), savedPriceDraft, "opening a legacy endpoint preserves saved nodes");
const endPrice = priceFixture.controls.endPrice;
endPrice.value = "";
endPrice.oninput();
endPrice.onchange();
assert.deepEqual(priceDraft.spotNodes.map((node) => node.year), [2027, 2029]);
latePrice.value = "360";
latePrice.oninput();
latePrice.onchange();
assert.equal(endPrice.placeholder, "360", "default tracks the latest entered price without rerendering");
assert.equal(priceDraft.spotNodes[1].value, 360, "clearing a legacy endpoint keeps the other field bindings");
for (const value of ["0", "-42.5"]) {
  endPrice.value = value;
  endPrice.oninput();
  endPrice.onchange();
  assert.deepEqual(priceDraft.spotNodes.filter((node) => node.year === 2030), [{ year: 2030, value: Number(value) }]);
}
priceFixture.controls.add.onclick();
assert.equal(priceChanges, 5);
assert.deepEqual(priceDraft.spotNodes.map((node) => node.year), [2027, 2029, 2030, 2028]);
assert.deepEqual(Array.from(priceFixture.rough.innerHTML.matchAll(/data-node-field="year" value="(\d+)"/g),
  (match) => Number(match[1])), [2027, 2028, 2029], "the rendered order follows the years without reordering saved nodes");
assert.equal(priceFixture.controls.add.disabled, true, "only years before the fixed endpoint can be added");
assert.match(priceFixture.rough.innerHTML, /data-rough-end-price value="-42.5" placeholder="360"/);

const intermediateYear = new Element({ roughNode: "3", nodeField: "year" });
const duplicateStart = { year: 2027, value: 210 };
const duplicateEnd = { year: 2030, value: 10 };
priceDraft.spotNodes.push(duplicateStart, duplicateEnd);
priceFixture.rough.groups["[data-rough-node]"].push(intermediateYear);
priceFixture.rough.groups['[data-rough-node][data-node-field="year"]'] = [intermediateYear];
workspace.renderWorkspace(priceOptions);
assert.match(priceFixture.rough.innerHTML, /data-rough-remove="4" aria-label="删除第 2 个价格节点">删除/);
assert.match(priceFixture.rough.innerHTML, /data-rough-remove="5" aria-label="删除第 5 个价格节点">删除/);
intermediateYear.value = "2030";
intermediateYear.oninput();
priceFixture.controls.form.onsubmit({ preventDefault() {} });
assert.match(priceFixture.controls.message.textContent, /末年价格请填写在自动生成的末年节点/);
assert.equal(priceData.project.roughPrice.snapshots.length, 0);

const oneYearFixture = documentFixture();
const oneYearData = projectFixture();
oneYearData.project.forecastYears = 1;
workspace.renderWorkspace({ ...oneYearData, documentRef: oneYearFixture.documentRef, domain });
const oneYearDraft = oneYearData.project.roughPrice.draftsByScenario[oneYearData.scenario.id];
assert.match(oneYearFixture.rough.innerHTML, /起止年份<input type="number" data-rough-end-year value="2027" readonly/);
assert.doesNotMatch(oneYearFixture.rough.innerHTML, /data-rough-node=/, "a one-year project has only one price field");
assert.equal(oneYearFixture.controls.add.disabled, true);
oneYearFixture.controls.endPrice.value = "205";
oneYearFixture.controls.endPrice.oninput();
assert.deepEqual(oneYearDraft.spotNodes, [{ year: 2027, value: 205 }]);

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
assert.match(navigationFixture.compare.innerHTML, /历史对照/);
assert.match(navigationFixture.compare.innerHTML, /导出历史对照 CSV/);
assert.match(navigationFixture.compare.innerHTML, /年度综合结算电价/, "预测切换仅提示旧结果，不暗中重算对照");

const fixture = documentFixture();
const { project, scenario } = projectFixture();
let changes = 0, persistence = 0, comparisons = 0;
const changesMetadata = [];
const options = {
  documentRef: fixture.documentRef, project, scenario, inputState, mode: "rough",
  domain: { ...domain,
    compareSnapshot() { throw new Error("must never recompute a run for comparison"); },
    compareBaselineResult(...args) { comparisons += 1; return domain.compareBaselineResult(...args); } },
  makeId: () => `rough-${changes + 1}`, nowIso: () => "2026-10-19T03:00:00.000Z",
  onPersist() { persistence += 1; },
  onChange(metadata) { changes += 1; changesMetadata.push(metadata); workspace.renderWorkspace(options); }
};
workspace.renderWorkspace(options);
assert.doesNotMatch(fixture.rough.innerHTML, /粗算.*当前项目|class="rough-context"/,
  "project identity is presented once in the shared workflow context");
assert.match(fixture.rough.innerHTML, /机制电价/);
assert.match(fixture.rough.innerHTML, /data-shared-key="mechanismPrice"[^>]* min="0"/);
assert.match(fixture.rough.innerHTML, /data-rough-group="mechanism" open/);
assert.deepEqual(Array.from(fixture.rough.innerHTML.matchAll(/data-rough-settlement="([^"]+)"/g), (match) => match[1]), Object.keys(compactInputs));
assert.match(fixture.rough.innerHTML, /每年收敛步长（元\/MWh\/年）/);
assert.match(fixture.rough.innerHTML, /data-rough-settlement="environmentPrice" value="" min="0"/);
assert.match(fixture.rough.innerHTML, /data-rough-settlement="feesNetPrice" value="">/);
assert.match(fixture.rough.innerHTML, /data-rough-settlement="storagePrice" value="">/);
assert.doesNotMatch(fixture.rough.innerHTML, /逐年分项|配置方式|绿证|绿电|碳收益|市场运营费|配储套利/);
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
fillSettlement(fixture);
fixture.controls.settlement.feesNetPrice.onchange();
assert.equal(persistence, 4);
assert.deepEqual(project.roughPrice.draftsByScenario[scenario.id].settlement, compactInputs);

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
assert.equal(snapshot.settlementMethod, "compact-v1");
assert.deepEqual(snapshot.draft.settlement, compactInputs);
assert.equal(snapshot.rows[0].capturePrice, 270);
assert.equal(comparisons, 0, "rough calculations do not run full precision comparisons");
assert.match(fixture.rough.innerHTML, /年度粗算结果/);
assert.match(fixture.rough.innerHTML, /导出粗算 CSV/);
assert.match(fixture.rough.innerHTML, /年度粗算电价趋势/);
assert.doesNotMatch(fixture.rough.innerHTML, /年度价格及结算贡献|<table|下方年度明细/);
assert.ok(inputState.isConfigConfirmed(scenario, "mechanismPrice"));
assert.match(fixture.rough.innerHTML, /data-rough-group="mechanism" open/,
  "only the edited mechanism price is confirmed; unchanged defaults remain visible");
for (const key of ["storageArbitragePrice", "storageCapacityCompPrice", "storageAncillaryRevenuePrice", "storageOtherRevenuePrice"]) {
  assert.equal(inputState.isConfigConfirmed(scenario, key), false, `${key} is not confirmed merely by generating rough results`);
}

const refinementState = require("../src/ui/scenario-form").buildRefinementState({ project, scenario });
assert.equal(refinementState.fields.mechanismPrice, "confirmed");
assert.equal(refinementState.fields.mechanismRatio, "pending");
assert.equal(refinementState.fields.otherNetIncome, "pending");
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
assert.match(defaultsFixture.controls.message.textContent, /首年交易策略损益/);
assert.equal(defaultsFixture.controls.settlement.ltYear1Pnl.focused, true);
assert.equal(defaultsData.project.roughPrice.snapshots.length, 0, "blank rough inputs do not silently become zero");
const originalScenario = JSON.stringify(defaultsData.scenario);
fillSettlement(defaultsFixture, Object.fromEntries(Object.keys(compactInputs).map((key) => [key, 0])));
defaultsFixture.controls.form.onsubmit({ preventDefault() {} });
assert.equal(defaultsData.project.roughPrice.snapshots.length, 1, "explicit zeros are valid rough assumptions");
assert.equal(JSON.stringify(defaultsData.scenario), originalScenario, "editing compact assumptions does not change formal values or confirmations");
workspace.renderWorkspace(defaultsOptions);
defaultsFixture.controls.form.onsubmit({ preventDefault() {} });
assert.equal(require("../src/ui/scenario-form").buildRefinementState(defaultsData).confirmed, 0);
const snapshotBeforeConfirmation = JSON.stringify(defaultsData.project.roughPrice.snapshots);
defaultsFixture.controls.save.onclick();
assert.ok(inputState.isConfigConfirmed(defaultsData.scenario, "mechanismPrice"), "explicit mechanism confirmation accepts unchanged mechanism defaults");
assert.equal(inputState.isConfigConfirmed(defaultsData.scenario, "otherNetIncome"), false, "mechanism confirmation never approves formal adjustments");
assert.equal(JSON.stringify(defaultsData.project.roughPrice.snapshots), snapshotBeforeConfirmation, "confirmation never rewrites existing rough snapshots");
const restoredDefaults = inputState.sanitizeScenario(defaultsData.project, defaultsData.scenario);
assert.ok(inputState.isConfigConfirmed(restoredDefaults, "mechanismPrice"), "explicit mechanism confirmation survives hydration");
workspace.renderWorkspace(defaultsOptions);
defaultsFixture.controls.form.onsubmit({ preventDefault() {} });
assert.ok(inputState.isConfigConfirmed(defaultsData.scenario, "mechanismPrice"), "subsequent generation preserves prior confirmation");

const thresholdFixture = documentFixture();
const thresholdData = projectFixture();
thresholdData.project.hasStorage = false;
Object.assign(thresholdData.scenario.config, {
  mechanismEnabled: false, ltYear1Pnl: 0, ltTargetPnl: 0,
  greenCertPrice: 0, greenPremiumPrice: 0,
  marketOpFee: 0, gridAssessFee: 0, ancillaryFee: 0, otherNetIncome: 0
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
assert.doesNotMatch(lockedFixture.rough.innerHTML, /data-rough-settlement="[^"]+"[^>]* disabled/);
fillSettlement(lockedFixture);
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
fillSettlement(lockTransitionFixture);
lockTransitionFixture.controls.form.onsubmit({ preventDefault() {} });
assert.equal(lockTransitionData.project.roughPrice.snapshots[0].config.mechanismPrice, savedMechanismPrice,
  "the generated locked snapshot matches the read-only parameter value");
lockTransitionData.scenario.locked = false;
workspace.renderWorkspace(lockTransitionOptions);
lockTransitionFixture.controls.save.onclick();
assert.equal(lockTransitionData.scenario.config.mechanismPrice, savedMechanismPrice,
  "unlocking does not revive discarded shared edits");

const manualData = projectFixture();
Object.assign(manualData.scenario.config, {
  envValueMode: "manual", feeConfigMode: "manual", ltPricingMode: "manual",
  ltManualPricesByYear: { 2027: 11, 2028: 8 },
  envManualValuesByYear: {
    2027: { greenCertPrice: 20, greenCertRealizeRatio: 0.6, greenPremiumPrice: 12, greenPremiumRealizeRatio: 0.3,
      carbonEnabled: true, carbonPrice: 8, carbonRealizeRatio: 0.1 },
    2028: { greenCertPrice: 23, greenCertRealizeRatio: 0.7, greenPremiumPrice: 13, greenPremiumRealizeRatio: 0.2 }
  },
  feeManualValuesByYear: {
    2027: { marketOpFee: 1, gridAssessFee: 2, ancillaryFee: 3, otherFee: 4, otherIncome: 5 },
    2028: { marketOpFee: 2, gridAssessFee: 3, ancillaryFee: 4, otherFee: 5, otherIncome: 6 }
  }
});
inputState.confirmConfig(manualData.scenario, ["ltManualPricesByYear", "envManualValuesByYear", "feeManualValuesByYear"]);
const manualFixture = documentFixture();
const manualBefore = JSON.stringify(manualData.scenario);
const manualOptions = { documentRef: manualFixture.documentRef, ...manualData, domain, inputState };
workspace.renderWorkspace(manualOptions);
assert.deepEqual(Array.from(manualFixture.rough.innerHTML.matchAll(/data-rough-settlement="([^"]+)"/g), (match) => match[1]), Object.keys(compactInputs));
assert.match(manualFixture.rough.innerHTML, /data-rough-settlement="ltYear1Pnl" value=""/);
assert.match(manualFixture.rough.innerHTML, /data-rough-settlement="environmentPrice" value=""/);
assert.match(manualFixture.rough.innerHTML, /data-rough-settlement="feesNetPrice" value=""/);
assert.doesNotMatch(manualFixture.rough.innerHTML, /data-shared-year=|年度分项|绿证|绿电|碳收益|市场运营费|容量补偿/);
manualFixture.controls.node.value = "300";
manualFixture.controls.node.oninput();
fillSettlement(manualFixture, { ...compactInputs, environmentPrice: -1 });
manualFixture.controls.form.onsubmit({ preventDefault() {} });
assert.match(manualFixture.controls.message.textContent, /环境价值/);
assert.equal(manualData.project.roughPrice.snapshots.length, 0);
fillSettlement(manualFixture, { environmentPrice: 12 });
manualFixture.controls.form.onsubmit({ preventDefault() {} });
assert.equal(manualData.project.roughPrice.snapshots.length, 1);
assert.equal(JSON.stringify(manualData.scenario), manualBefore, "compact values leave manual plan details and confirmation metadata untouched");

const legacyFixture = documentFixture();
const legacyData = projectFixture();
const legacyConfig = legacyData.scenario.config;
delete legacyConfig.otherNetIncome;
Object.assign(legacyConfig, {
  marketOpFee: 7, gridAssessFee: 8, ancillaryFee: 18, otherFee: 7.25, otherIncome: 3.25,
  carbonEnabled: true, carbonPrice: 8, carbonRealizeRatio: 0.1
});
const legacySnapshot = domain.calculateRough(legacyData.project, legacyData.scenario, {
  spotNodes: [{ year: 2027, value: 300 }], captureRate: 95
}).snapshot;
assert.ok(legacySnapshot);
legacyData.project.roughPrice = domain.sanitizeWorkspace({ snapshots: [legacySnapshot] }, legacyData.project);
const expectedLegacy = JSON.stringify(legacySnapshot);
const legacyCsv = workspace.buildRoughCsv(legacySnapshot);
assert.match(legacyCsv, /"三项费用\(元\/MWh\)","其他净收入\(元\/MWh\)"/);
for (const row of legacySnapshot.rows) {
  assert.equal(row.fee - row.otherIncome, 37);
  assert.ok(legacyCsv.includes('"33","-4","' + row.fullRevenuePrice + '","' + row.energyMwh + '"'));
}
workspace.renderWorkspace({ documentRef: legacyFixture.documentRef, ...legacyData, domain, inputState });
assert.match(legacyFixture.rough.innerHTML, /年度粗算电价趋势/);
assert.doesNotMatch(legacyFixture.rough.innerHTML, /年度价格及结算贡献|<table/);
assert.equal(JSON.stringify(legacyData.project.roughPrice.snapshots[0]), expectedLegacy);
assert.equal(workspace.buildRoughCsv(legacyData.project.roughPrice.snapshots[0]), legacyCsv, "legacy export retains its original fields and values");

const conditionalFixture = documentFixture();
const conditionalData = projectFixture();
conditionalData.project.hasStorage = false;
Object.assign(conditionalData.scenario.config, {
  mechanismEnabled: false, ltYear1Pnl: 10, ltTargetPnl: 4, ltConvergeSpeed: 3, ltConvergeSpeedUnit: "fixed_step",
  greenCertPrice: 20, greenCertRealizeRatio: 0.5, greenPremiumPrice: 0, greenPremiumRealizeRatio: 0,
  marketOpFee: 7, gridAssessFee: 8, ancillaryFee: 18, otherNetIncome: 3
});
inputState.confirmConfig(conditionalData.scenario, [
  "mechanismEnabled", "ltYear1Pnl", "ltTargetPnl", "ltConvergeSpeed", "envValueMode", "greenCertPrice",
  "greenCertRealizeRatio", "greenPremiumPrice", "greenPremiumRealizeRatio", "marketOpFee", "gridAssessFee", "ancillaryFee", "otherNetIncome"
]);
const conditionalOptions = { documentRef: conditionalFixture.documentRef, ...conditionalData, domain, inputState };
workspace.renderWorkspace(conditionalOptions);
assert.doesNotMatch(conditionalFixture.rough.innerHTML, /data-rough-group="mechanism" open/);
assert.doesNotMatch(conditionalFixture.rough.innerHTML, /data-rough-settlement="storagePrice"/);
assert.match(conditionalFixture.rough.innerHTML, /data-rough-settlement="ltYear1Pnl" value="10"/);
assert.match(conditionalFixture.rough.innerHTML, /data-rough-settlement="environmentPrice" value="10"/);
assert.match(conditionalFixture.rough.innerHTML, /data-rough-settlement="feesNetPrice" value="-30"/);
assert.equal(conditionalData.project.roughPrice.draftsByScenario[conditionalData.scenario.id].settlement, undefined,
  "rendering confirmed values leaves the historical draft alone");
conditionalFixture.controls.node.value = "300";
conditionalFixture.controls.node.oninput();
conditionalFixture.controls.form.onsubmit({ preventDefault() {} });
assert.equal(conditionalData.project.roughPrice.snapshots.length, 1, "a non-storage project can calculate with the confirmed inputs");
fillSettlement(conditionalFixture, { feesNetPrice: null });
workspace.renderWorkspace(conditionalOptions);
assert.match(conditionalFixture.rough.innerHTML, /data-rough-settlement="feesNetPrice" value=""/, "clearing an assumption stays blank after render");
conditionalFixture.controls.form.onsubmit({ preventDefault() {} });
assert.equal(conditionalData.project.roughPrice.snapshots.length, 1);
conditionalData.project.hasStorage = true;
workspace.renderWorkspace(conditionalOptions);
assert.match(conditionalFixture.rough.innerHTML, /data-rough-settlement="storagePrice" value=""/,
  "newly applicable storage is a single blank assumption");
fillSettlement(conditionalFixture, { feesNetPrice: 0, storagePrice: -5 });
conditionalFixture.controls.form.onsubmit({ preventDefault() {} });
assert.equal(conditionalData.project.roughPrice.snapshots[0].rows[0].storageSupplement, -5,
  "a storage correction can carry a signed net amount");

const csv = workspace.buildRoughCsv(snapshot);
assert.match(csv, /^\ufeff/);
assert.match(csv, /"历史参考, ""来源"" <script>alert\(1\)<\/script>"/);
assert.match(csv, /策略贡献/);
assert.match(csv, /"费用及其他净收入\(元\/MWh\)"/);
assert.doesNotMatch(csv, /"(?:三项费用|其他净收入|综合扣费|其他费用|其他收入)\(元\/MWh\)"/);
for (const row of snapshot.rows) {
  assert.ok(csv.includes('"' + compactInputs.feesNetPrice + '","' + row.fullRevenuePrice + '","' + row.energyMwh + '"'));
}

const compareCsv = workspace.buildComparisonCsv(snapshot, { runId: 'run,"quoted"', generatedAt: "2026-10-19T03:00:00Z" }, {
  rows: [{ year: 2027, roughSpot: 300, fineSpot: 301, roughCapture: 270, fineCapture: 271,
    roughSettlement: 350, fineSettlement: 351, delta: 1, relativeDelta: 1 / 350, fineCaptureRate: 90 }]
});
assert.match(compareCsv, /"run,""quoted"""/);
assert.match(compareCsv, /综合价差异率/);
assert.match(compareCsv, /基准结果生成时间/);
assert.match(compareCsv, /与当前基准结果对照/);
const historicCsv = workspace.buildComparisonCsv(snapshot, { runId: "old-run" }, {
  rows: [], baselineState: { current: false, message: "生效现货预测已变化。" },
  resultTrace: { versionId: "result-traced", priceSourceLabel: "演示现货曲线", priceContentFingerprint: "price-v1-0011223344556677" }
});
assert.match(historicCsv, /"基准结果状态","历史版。生效现货预测已变化。"/);
assert.match(historicCsv, /"测算版本","result-traced"/);
assert.match(historicCsv, /"价格来源","演示现货曲线"/);
console.log("rough price workspace tests passed");
