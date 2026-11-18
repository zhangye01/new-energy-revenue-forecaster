"use strict";

const assert = require("node:assert/strict");
const workspace = require("../src/ui/supply-demand-workspace");
const domain = require("../src/domain/supply-demand");
const clone = (value) => JSON.parse(JSON.stringify(value));
const keys = domain.ELEMENTS.map((element) => element.key);

class Root {
  constructor() { this.innerHTML = ""; this.events = {}; this.state = {}; }
  addEventListener(name, listener) { this.events[name] = listener; }
  contains(target) { return !target.detached; }
  querySelector(selector) { return this.state[selector] || null; }
  fire(name, dataset, value, extra = {}) {
    const target = { dataset, value, ...extra, closest() { return this.dataset.sdAction ? this : null; } };
    this.events[name]?.({ target, preventDefault() {} });
    return target;
  }
}

function project(id = "p1") {
  return { id, name: '供需<测试>', province: "shandong", startYear: 2027, forecastYears: 2,
    roughPrice: { snapshots: [{ id: "frozen-rough", value: 327 }] }, scenarios: [{ id: "s1", config: { managementFee: 12.5 } }] };
}
function completeConfig(p) {
  const config = domain.createConfig(p);
  for (const key of keys) {
    const series = config.elements[key];
    series.baseEnergyMwh = key === "load" ? 120000 : 0;
    Object.keys(series.growthRatesByYear).forEach((year) => { series.growthRatesByYear[year] = 0; });
    if (key === "load") {
      series.monthlyWeights = Array(12).fill(1);
      series.hourlyWeightsByMonth = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [index + 1, Array(24).fill(1)]));
    }
  }
  return config;
}
function fixture(p = project(), behavior = {}) {
  const root = new Root(), commits = [], exports = [];
  let active = p, controller;
  controller = workspace.createController({ root, getProject: () => active, domain,
    now: () => "2026-11-13T12:00:00.000Z",
    onCommit(target, next, flags) {
      if (behavior.fail) return false;
      if (behavior.throw) throw new Error("模拟保存失败");
      assert.equal(target, active);
      assert.equal(controller.hasUnsavedChanges(target), false, "dirty is cleared before synchronous adapter render");
      target.supplyDemand = next; commits.push({ next: clone(next), flags });
      controller.render();
      return true;
    },
    downloadCsv(filename, rows) { exports.push({ filename, rows }); }
  });
  controller.render();
  return { root, controller, commits, exports, setActive(value) { active = value; },
    input(field, value, extra) { return root.fire("input", { sdField: field, ...extra }, String(value)); },
    select(field, value) { return root.fire("change", { sdSelect: field }, String(value)); },
    click(action, extra) { return root.fire("click", { sdAction: action, ...extra }); }
  };
}

// Parsing accepts spreadsheet/CSV weights, rejects ambiguous blanks and commits atomically.
const matrix = Array.from({ length: 12 }, (_, month) => Array.from({ length: 24 }, (_, hour) => month + hour + 1).join("\t")).join("\n");
assert.equal(workspace.parseCurveMatrix(matrix).ok, true);
assert.deepEqual(workspace.parseCurveMatrix(matrix).rows[11].slice(-2), [34, 35]);
assert.equal(workspace.parseCurveMatrix(matrix.replace("1\t2", "1\t")).ok, false);
assert.equal(workspace.parseCurveMatrix(matrix.replace("1\t2", "-1\t2")).ok, false);
assert.equal(workspace.parseCurveMatrix(matrix.split("\n").slice(1).join("\n")).ok, false);
assert.equal(workspace.parseCurveMatrix(Array(12).fill(Array(24).fill(0).join(",")).join("\n")).ok, true, "zero rows are valid for months without energy; domain validation checks active months");
assert.equal(workspace.parseCurveMatrix("").ok, false);

const previewProject = { startYear: 2027, forecastYears: 3 };
assert.deepEqual(workspace.annualPreview({ baseEnergyMwh: 100, growthRatesByYear: { 2028: 10, 2029: -10 } }, previewProject).map((row) => row.energyMwh), [100, 110.00000000000001, 99.00000000000001]);
assert.deepEqual(workspace.annualPreview({ baseEnergyMwh: "", growthRatesByYear: { 2028: 0, 2029: 0 } }, previewProject).map((row) => row.energyMwh), [null, null, null]);
assert.deepEqual(workspace.annualPreview({ baseEnergyMwh: -100, growthRatesByYear: { 2028: -100, 2029: 0 } }, previewProject).map((row) => row.energyMwh), [-100, -0, -0]);
assert.equal(workspace.annualPreview({ baseEnergyMwh: 100, growthRatesByYear: { 2028: -101 } }, previewProject)[1].energyMwh, null);

// No generated defaults, no mutation of revenue inputs or the original rough snapshot.
const fresh = project(), original = JSON.stringify(fresh), initial = fixture(fresh);
assert.equal(JSON.stringify(fresh), original);
assert.match(initial.root.innerHTML, /2027—2028年/);
assert.match(initial.root.innerHTML, /data-sd-field="base" value=""/);
assert.match(initial.root.innerHTML, /data-sd-field="growth"[^>]*value=""/);
assert.match(initial.root.innerHTML, /data-help="供需输入口径"/);
assert.match(initial.root.innerHTML, /data-sd-action="discard"/);
assert.equal((initial.root.innerHTML.match(/<small[^>]*>待补齐<\/small>/g) || []).length, 6);
assert.equal(initial.controller.hasUnsavedChanges(), false);
initial.click("generate");
assert.equal(initial.commits.length, 0);
assert.match(initial.root.innerHTML, /首年电量须填写/);
assert.equal(JSON.stringify(fresh), original);

initial.input("base", 1000);
assert.equal(initial.controller.hasUnsavedChanges(), true);
assert.equal(fresh.supplyDemand, undefined);
const beforeBlur = initial.root.innerHTML;
initial.root.fire("change", { sdField: "base" }, "1000");
assert.equal(initial.root.innerHTML, beforeBlur, "numeric blur never removes a save button before its click");
initial.input("batchGrowth", 5);
initial.click("growth-fill");
initial.click("monthly-equal");
initial.click("hourly-equal");
initial.click("hourly-copy");
initial.click("save-draft");
assert.equal(initial.controller.hasUnsavedChanges(), false);
assert.equal(fresh.supplyDemand.config, undefined);
assert.equal(fresh.supplyDemand.draft.elements.load.baseEnergyMwh, 1000);
assert.equal(fresh.supplyDemand.draft.elements.load.growthRatesByYear[2028], 5);
assert.deepEqual(fresh.supplyDemand.draft.elements.load.monthlyWeights, Array(12).fill(1));
assert.deepEqual(fresh.supplyDemand.draft.elements.load.hourlyWeightsByMonth[12], Array(24).fill(1));
assert.notEqual(fresh.supplyDemand.draft.elements.load.hourlyWeightsByMonth[1], fresh.supplyDemand.draft.elements.load.hourlyWeightsByMonth[2]);
assert.deepEqual(initial.commits.at(-1).flags, { changed: false, generated: false });
assert.deepEqual(fresh.roughPrice, JSON.parse(original).roughPrice);
assert.deepEqual(fresh.scenarios, JSON.parse(original).scenarios);
initial.input("base", 9000);
assert.equal(fresh.supplyDemand.draft.elements.load.baseEnergyMwh, 1000, "unsaved edits remain isolated from saved draft");
initial.click("discard");
assert.equal(fresh.supplyDemand.draft, undefined);
assert.equal(initial.controller.hasUnsavedChanges(), false);
assert.match(initial.root.innerHTML, /data-sd-field="base" value=""/);

// Two-way tie-line editing keeps both branches and the original net series.
const two = fixture(project("two"));
two.click("element", { sdElement: "tieLine" });
two.input("base", -200);
two.select("mode", "bidirectional");
two.input("base", 300);
two.select("branch", "import");
two.input("base", 500);
two.select("mode", "net");
assert.match(two.root.innerHTML, /data-sd-field="base" value="-200"/);
two.select("mode", "bidirectional");
assert.match(two.root.innerHTML, /data-sd-field="base" value="500"/);
two.click("save-draft");
const tie = two.commits.at(-1).next.draft.elements.tieLine;
assert.equal(tie.baseEnergyMwh, -200);
assert.equal(tie.export.baseEnergyMwh, 300);
assert.equal(tie.import.baseEnergyMwh, 500);
assert.equal(tie.mode, "bidirectional");
assert.match(two.root.innerHTML, /联络线负荷<small[^>]*>待补齐/);

// Invalid bulk paste never replaces any of the old monthly curves.
const pasteProject = project("paste");
pasteProject.supplyDemand = { version: 1, draft: completeConfig(pasteProject) };
const paste = fixture(pasteProject), oldCurves = clone(pasteProject.supplyDemand.draft.elements.load.hourlyWeightsByMonth);
paste.input("matrix", matrix.replace("1\t2", "bad\t2"));
paste.click("matrix-apply");
assert.match(paste.root.innerHTML, /第1行需要24个非负有效数字/);
paste.click("save-draft");
assert.deepEqual(pasteProject.supplyDemand.draft.elements.load.hourlyWeightsByMonth, oldCurves);
paste.input("matrix", matrix);
paste.click("matrix-apply");
paste.click("save-draft");
assert.equal(pasteProject.supplyDemand.draft.elements.load.hourlyWeightsByMonth[12][23], 35);

// Unapplied helpers are editing state, never a silent save of the old assumptions.
const helperProject = project("helpers");
helperProject.supplyDemand = { version: 1, config: completeConfig(helperProject) };
const helpers = fixture(helperProject), beforeHelpers = JSON.stringify(helperProject);
helpers.input("matrix", matrix);
assert.equal(helpers.controller.hasUnsavedChanges(), true, "pending paste participates in navigation/forecast guards");
helpers.click("generate"); helpers.click("save-draft");
assert.equal(helpers.commits.length, 0, "save/generate cannot claim success while ignoring a pending matrix");
assert.equal(JSON.stringify(helperProject), beforeHelpers);
helpers.click("element", { sdElement: "wind" });
helpers.select("month", 2);
assert.ok(helpers.root.innerHTML.includes(matrix), "context switches must not clear a user's unapplied paste");
assert.match(helpers.root.innerHTML, /省内负荷<\/h4>/);
helpers.click("clear-bulk");
assert.equal(helpers.controller.hasUnsavedChanges(), false);
assert.equal(JSON.stringify(helperProject), beforeHelpers, "clearing unapplied input leaves saved configuration untouched");
helpers.click("element", { sdElement: "wind" });
helpers.input("batchGrowth", 25);
assert.equal(helpers.controller.hasUnsavedChanges(), true);
helpers.click("save-draft"); helpers.click("generate");
assert.equal(helpers.commits.length, 0);
helpers.click("element", { sdElement: "tieLine" });
assert.match(helpers.root.innerHTML, /风电出力<\/h4>/, "unapplied growth cannot silently follow another element");
helpers.click("growth-fill"); helpers.click("save-draft");
assert.equal(helperProject.supplyDemand.draft.elements.wind.growthRatesByYear[2028], 25);
assert.equal(helperProject.supplyDemand.draft.elements.load.growthRatesByYear[2028], 0);
assert.equal(helpers.controller.hasUnsavedChanges(), false);
helpers.click("element", { sdElement: "tieLine" });
helpers.input("matrix", matrix);
helpers.select("mode", "bidirectional");
assert.match(helpers.root.innerHTML, /option value="net" selected/, "mode switch is guarded before clearing a pending paste");
helpers.click("discard");
assert.equal(helpers.controller.hasUnsavedChanges(), false);
assert.equal(JSON.stringify(helperProject), beforeHelpers, "discard restores the saved source and clears helpers together");
assert.ok(!helpers.root.innerHTML.includes(matrix));
helpers.select("mode", "bidirectional");
helpers.input("matrix", matrix);
helpers.select("branch", "import");
assert.match(helpers.root.innerHTML, /option value="export" selected/, "pending paste stays with its original tie-line direction");
helpers.click("clear-bulk"); helpers.select("branch", "import");
assert.match(helpers.root.innerHTML, /option value="import" selected/);

// A failed explicit discard keeps unapplied input available for retry.
const pendingFailureProject = project("pending-failure");
pendingFailureProject.supplyDemand = { version: 1, config: completeConfig(pendingFailureProject) };
const pendingFailure = fixture(pendingFailureProject, { fail: true });
pendingFailure.input("matrix", matrix); pendingFailure.input("batchGrowth", 12);
pendingFailure.click("discard");
assert.equal(pendingFailure.controller.hasUnsavedChanges(), true);
assert.ok(pendingFailure.root.innerHTML.includes(matrix));
assert.match(pendingFailure.root.innerHTML, /data-sd-field="batchGrowth" value="12"/);

// Matrix structure validation does not reject zero-energy months, while generation
// still requires a positive hourly shape for every month that carries energy.
const zeroJanuary = [Array(24).fill(0), ...Array.from({ length: 11 }, () => Array(24).fill(1))].map((row) => row.join("\t")).join("\n");
for (const januaryWeight of [0, 1]) {
  const zeroMonthProject = project(`zero-month-${januaryWeight}`), zeroMonthConfig = completeConfig(zeroMonthProject);
  zeroMonthConfig.elements.load.monthlyWeights[0] = januaryWeight;
  zeroMonthProject.supplyDemand = { version: 1, config: zeroMonthConfig };
  const zeroMonth = fixture(zeroMonthProject);
  zeroMonth.input("matrix", zeroJanuary); zeroMonth.click("matrix-apply"); zeroMonth.click("generate");
  assert.equal(zeroMonth.commits.length, januaryWeight === 0 ? 1 : 0);
  if (januaryWeight === 0) assert.deepEqual(zeroMonthProject.supplyDemand.config.elements.load.hourlyWeightsByMonth[1], Array(24).fill(0));
  else assert.match(zeroMonth.root.innerHTML, /1月24小时权重合计必须大于0/);
}

// Generate, inspect and export saved input, preserving independent project fields.
const generatedProject = project("generated"), protectedOriginal = clone(generatedProject);
generatedProject.supplyDemand = { version: 1, draft: completeConfig(generatedProject) };
const generated = fixture(generatedProject);
generated.click("generate");
assert.equal(generated.commits.length, 1);
assert.deepEqual(generated.commits[0].flags, { changed: true, generated: true });
assert.equal(generatedProject.supplyDemand.draft, undefined);
assert.equal(generatedProject.supplyDemand.generatedAt, "2026-11-13T12:00:00.000Z");
assert.equal(generatedProject.supplyDemand.inputFingerprint, domain.fingerprint(generatedProject, generatedProject.supplyDemand.config));
assert.deepEqual(generatedProject.roughPrice, protectedOriginal.roughPrice);
assert.deepEqual(generatedProject.scenarios, protectedOriginal.scenarios);
assert.match(generated.root.innerHTML, /每年288个典型小时 \/ 8760小时/);
assert.match(generated.root.innerHTML, /data-sd-action="export-hourly"/);
assert.match(generated.root.innerHTML, /查看已保存数据（MWh）/);
generated.click("generate");
assert.deepEqual(generated.commits.at(-1).flags, { changed: false, generated: true });
const savedBeforeEditing = JSON.stringify(generatedProject.supplyDemand.config);
generated.input("base", 999999);
generated.click("export-annual");
assert.equal(generated.exports[0].rows[1][1], 120000, "export uses saved config even when local edits exist");
assert.match(generated.exports[0].filename, /供需年度_2027-2028\.csv$/);
assert.equal(JSON.stringify(generatedProject.supplyDemand.config), savedBeforeEditing);
generated.click("save-draft");
assert.equal(generatedProject.supplyDemand.draft.elements.load.baseEnergyMwh, 999999);
assert.equal(generatedProject.supplyDemand.config.elements.load.baseEnergyMwh, 120000);
generated.click("discard");
assert.equal(generatedProject.supplyDemand.draft, undefined);
assert.equal(JSON.stringify(generatedProject.supplyDemand.config), savedBeforeEditing);
assert.match(generated.root.innerHTML, /data-sd-field="base" value="120000"/);

// A changed project period must be explicitly reviewed; old saved config stays frozen.
generatedProject.startYear = 2028;
generatedProject.forecastYears = 3;
generated.controller.render();
assert.match(generated.root.innerHTML, /项目周期已变化/);
assert.match(generated.root.innerHTML, /data-sd-action="generate" disabled/);
const countBeforeMismatch = generated.commits.length;
generated.click("generate");
assert.equal(generated.commits.length, countBeforeMismatch);
generated.click("rebase");
generated.click("save-draft");
assert.equal(generatedProject.supplyDemand.draft.startYear, 2028);
assert.equal(generatedProject.supplyDemand.draft.elements.load.baseEnergyMwh, 120000);
assert.equal(generatedProject.supplyDemand.draft.elements.load.growthRatesByYear[2030], undefined, "new years are not silently assigned growth assumptions");
assert.equal(JSON.stringify(generatedProject.supplyDemand.config), savedBeforeEditing);
generated.click("reset-period");
generated.click("save-draft");
assert.equal(generatedProject.supplyDemand.draft.elements.load.baseEnergyMwh, null);
assert.equal(JSON.stringify(generatedProject.supplyDemand.config), savedBeforeEditing);

// Switching projects, even to a replacement object with the same ID, cannot cross-write edits.
const one = project("same"), other = project("same"), switching = fixture(one);
switching.input("base", 111);
switching.setActive(other);
switching.click("save-draft");
assert.equal(switching.commits.length, 0);
assert.equal(other.supplyDemand, undefined);
switching.input("base", 222);
switching.click("save-draft");
assert.equal(other.supplyDemand.draft.elements.load.baseEnergyMwh, 222);
assert.equal(one.supplyDemand, undefined);
switching.setActive(one);
switching.controller.render();
assert.match(switching.root.innerHTML, /data-sd-field="base" value="111"/);
switching.click("save-draft");
assert.equal(one.supplyDemand.draft.elements.load.baseEnergyMwh, 111);

// External saved-state changes are never overwritten by a stale editing session.
const conflictProject = project("conflict"), conflict = fixture(conflictProject);
conflict.input("base", 123);
conflictProject.supplyDemand = { version: 1, draft: completeConfig(conflictProject) };
conflict.controller.render();
assert.match(conflict.root.innerHTML, /当前未保存编辑不能覆盖最新数据/);
conflict.click("save-draft");
assert.equal(conflict.commits.length, 0);
conflict.click("load-latest");
assert.equal(conflict.controller.hasUnsavedChanges(), false);
assert.match(conflict.root.innerHTML, /data-sd-field="base" value="120000"/);

// Storage rejections and exceptions retain unsaved user edits for retry.
for (const behavior of [{ fail: true }, { throw: true }]) {
  const failedProject = project("failed"), failed = fixture(failedProject, behavior);
  failed.input("base", 456);
  failed.click("save-draft");
  assert.equal(failed.controller.hasUnsavedChanges(), true);
  assert.equal(failedProject.supplyDemand, undefined);
  assert.match(failed.root.innerHTML, /data-sd-field="base" value="456"/);
  assert.match(failed.root.innerHTML, /保存/);
}

const absent = fixture(null);
assert.match(absent.root.innerHTML, /请先完成项目创建/);
assert.equal(absent.controller.hasUnsavedChanges(), false);
absent.setActive(project("later"));
absent.controller.render();
absent.click("zero");
absent.click("save-draft");
assert.equal(absent.commits[0].next.draft.elements.load.baseEnergyMwh, 0);
assert.equal(absent.commits[0].next.draft.elements.load.growthRatesByYear[2028], 0);
assert.equal(absent.commits[0].next.draft.elements.load.monthlyWeights[0], null);

// Malformed imported draft is recoverable without rewriting the raw saved record.
const malformedProject = project("malformed");
malformedProject.supplyDemand = { version: 1, draft: { version: 1, startYear: 2027, forecastYears: 2 } };
const malformedBefore = JSON.stringify(malformedProject.supplyDemand), malformed = fixture(malformedProject);
assert.match(malformed.root.innerHTML, /输入结构不完整/);
assert.equal(JSON.stringify(malformedProject.supplyDemand), malformedBefore);
malformed.click("reset-period");
assert.equal(JSON.stringify(malformedProject.supplyDemand), malformedBefore);
malformed.click("save-draft");
assert.equal(malformedProject.supplyDemand.draft.elements.load.baseEnergyMwh, null);

// Large but finite relative weights remain readable after stable normalization.
const largeProject = project("large"), largeConfig = completeConfig(largeProject);
largeConfig.elements.load.monthlyWeights = Array(12).fill(1e308);
largeProject.supplyDemand = { version: 1, draft: largeConfig };
const large = fixture(largeProject);
assert.match(large.root.innerHTML, /最高 8\.3%/);
assert.doesNotMatch(large.root.innerHTML, /NaN|Infinity/);

console.log("Supply-demand workspace tests passed");
