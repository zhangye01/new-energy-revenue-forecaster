"use strict";

const assert = require("node:assert/strict");
const workspace = require("../src/ui/rough-price-workspace");
const domain = require("../src/domain/rough-price");
const { defaultScenarioConfig } = require("../src/domain/scenario-model");

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
    threshold: new Element(), run: new Element()
  };
  rough.selectors = {
    "[data-rough-capture]": controls.capture, "[data-rough-source]": controls.source,
    "#rough-price-form": controls.form, "[data-rough-save-shared]": controls.save,
    "[data-rough-message]": controls.message, "[data-rough-dirty]": controls.dirty,
    "[data-rough-add]": controls.add
  };
  rough.groups = { "[data-rough-node]": [controls.node], "[data-shared-key]": [controls.sharedPrice] };
  compare.selectors = { "[data-rough-threshold]": controls.threshold, "[data-rough-run]": controls.run };
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
assert.equal(empty.ids["forecast-rough-panel"].hidden, false);
assert.equal(empty.ids["forecast-fine-panel"].hidden, true);
assert.equal(empty.buttons[0].attributes["aria-selected"], "true");
empty.buttons[1].onclick();
assert.equal(empty.ids["forecast-fine-panel"].hidden, false);
assert.equal(empty.ids["forecast-rough-panel"].hidden, true);
empty.buttons[1].onkeydown({ key: "Home", preventDefault() {} });
assert.equal(empty.ids["forecast-rough-panel"].hidden, false);
assert.equal(empty.buttons[0].focused, true);

const fixture = documentFixture();
const { project, scenario } = projectFixture();
let changes = 0, persistence = 0, comparisons = 0;
const changesMetadata = [];
const options = {
  documentRef: fixture.documentRef, project, scenario,
  getProvinceName: (key) => key === "shandong" ? "山东" : key,
  domain: { ...domain, compareSnapshot(...args) { comparisons += 1; return domain.compareSnapshot(...args); } },
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
assert.match(fixture.rough.innerHTML, /沿用已有配置/);
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
workspace.renderWorkspace(options);
assert.match(fixture.rough.innerHTML, /data-shared-key="mechanismPrice"[^>]*value="400"/,
  "uncommitted shared edits survive rerenders");
assert.match(fixture.rough.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
fixture.buttons[1].onclick();
assert.equal(fixture.ids["forecast-fine-panel"].hidden, false);
fixture.buttons[0].onclick();
assert.equal(project.roughPrice.draftsByScenario[scenario.id].spotNodes[0].value, 300);

fixture.controls.form.onsubmit({ preventDefault() {} });
assert.equal(changes, 1);
assert.deepEqual(changesMetadata[0], { sharedChanged: true });
assert.equal(scenario.config.mechanismPrice, 400);
assert.equal(project.roughPrice.snapshots.length, 1);
const snapshot = project.roughPrice.snapshots[0];
assert.equal(snapshot.config.mechanismPrice, 400);
assert.equal(snapshot.draft.captureRate, 90);
assert.equal(snapshot.rows[0].capturePrice, 270);
assert.equal(comparisons, 0, "rough calculations do not run full precision comparisons");
assert.match(fixture.rough.innerHTML, /年度粗算结果/);
assert.match(fixture.rough.innerHTML, /导出粗算 CSV/);

const activeBefore = project.activeRunId;
const scenarioBefore = JSON.stringify(scenario);
fixture.buttons[2].onclick();
assert.equal(comparisons, 1);
assert.equal(project.activeRunId, activeBefore);
assert.equal(JSON.stringify(scenario), scenarioBefore);
assert.match(fixture.compare.innerHTML, /① 年度现货均价/);
assert.match(fixture.compare.innerHTML, /② 项目捕获电价/);
assert.match(fixture.compare.innerHTML, /③ 综合结算电价/);
assert.match(fixture.compare.innerHTML, /导出对照 CSV/);
assert.match(fixture.compare.innerHTML, /建议复核|阈值以内/);
workspace.renderWorkspace(options);
assert.equal(comparisons, 1, "unchanged comparisons are cached");
workspace.renderWorkspace({ ...options, isActive: false });
assert.equal(comparisons, 1, "other workspaces never run comparisons");

scenario.config.mechanismPrice += 1;
workspace.renderWorkspace(options);
assert.match(fixture.compare.innerHTML, /生成新版粗算/);
assert.equal(project.roughPrice.snapshots[0].config.mechanismPrice, 400, "historic snapshots remain immutable");

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
thresholdData.project.priceRuns.push({ ...thresholdData.project.priceRuns[0], id: "run-2", status: "validated" });
const thresholdOptions = { documentRef: thresholdFixture.documentRef, ...thresholdData, domain };
workspace.renderWorkspace(thresholdOptions);
thresholdFixture.buttons[2].onclick();
assert.match(thresholdFixture.compare.innerHTML, /class="rough-review"/);
const thresholdComparison = domain.compareSnapshot(thresholdData.project, thresholdData.scenario,
  thresholdSnapshot, thresholdData.project.priceRuns[0]);
const reviewCells = thresholdComparison.rows.map((row) => new Element({ roughReviewDelta: String(row.relativeDelta) }));
const zeroBasisCell = new Element({ roughReviewDelta: "" });
thresholdFixture.compare.groups["[data-rough-review-delta]"] = [...reviewCells, zeroBasisCell];
thresholdFixture.controls.threshold.value = "20";
thresholdFixture.controls.threshold.oninput();
assert.ok(reviewCells.every((cell) => cell.innerHTML === "阈值以内"), "input immediately updates 11%-15% review labels at a 20% threshold");
assert.equal(zeroBasisCell.innerHTML, "参考绝对差额", "a zero comparison basis never gets a relative threshold verdict");
thresholdFixture.controls.run.value = "run-2";
thresholdFixture.controls.run.onchange();
assert.match(thresholdFixture.compare.innerHTML, /data-rough-threshold[^>]*value="20"/,
  "switching precision versions preserves an input-only threshold edit");
assert.doesNotMatch(thresholdFixture.compare.innerHTML, /class="rough-review"/);
assert.equal(thresholdData.project.activeRunId, "run-1", "reviewing an unactivated version remains read-only");
for (const invalid of ["", "0", "1001", "bad"]) {
  thresholdFixture.controls.threshold.value = invalid;
  thresholdFixture.controls.threshold.oninput();
  thresholdFixture.controls.threshold.onchange();
  assert.equal(String(thresholdFixture.controls.threshold.value), "20", "invalid edits restore the last valid threshold");
}
thresholdFixture.controls.threshold.value = "10";
thresholdFixture.controls.threshold.oninput();
assert.ok(reviewCells.every((cell) => cell.innerHTML.includes("建议复核")), "lowering the threshold refreshes all annual review labels");

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
assert.equal(JSON.stringify(manualData.scenario.config), manualBefore, "rendering preserves independent manual components");
assert.deepEqual(workspace.validateShared(manualData.project, manualData.scenario, manualData.scenario.config, domain), []);
manualData.scenario.config.envManualValuesByYear[2027].greenPremiumRealizeRatio = 0.8;
assert.match(workspace.validateShared(manualData.project, manualData.scenario, manualData.scenario.config, domain).join(" "), /比例合计不能超过100%|配置不完整/);

const csv = workspace.buildRoughCsv(snapshot);
assert.match(csv, /^\ufeff/);
assert.match(csv, /"历史参考, ""来源"" <script>alert\(1\)<\/script>"/);
assert.match(csv, /策略贡献/);
const result = domain.compareSnapshot(projectFixture().project, { ...scenario, config: snapshot.config }, snapshot,
  project.priceRuns[0]);
// Export helper accepts already computed data and performs proper CSV quoting.
const compareCsv = workspace.buildComparisonCsv(snapshot, { id: 'run,"quoted"', status: "draft" }, {
  rows: [{ year: 2027, roughSpot: 300, fineSpot: 301, roughCapture: 270, fineCapture: 271,
    roughSettlement: 350, fineSettlement: 351, delta: 1, relativeDelta: 1 / 350, fineCaptureRate: 90 }]
});
assert.match(compareCsv, /"run,""quoted"""/);
assert.match(compareCsv, /综合价差异率/);
assert.ok(result && typeof result.ok === "boolean");
console.log("rough price workspace tests passed");
