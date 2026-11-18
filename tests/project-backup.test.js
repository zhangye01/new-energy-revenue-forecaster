"use strict";
const assert = require("node:assert/strict");
const backup = require("../src/ui/project-backup");
const project = { id: "p", name: "测试", ownerAccount: "demo1", startYear: 2026, forecastYears: 3, capacityMw: 100, scenarios: [{ id: "s", config: { otherFee: 14.75 }, confirmedFields: { otherFee: true } }], roughPrice: { snapshots: [{ id: "rough-original", value: 409.42 }] }, priceRuns: [{ id: "r", prices: [0, -5, 300] }] };
const snapshot = { payload: { projects: [project, { ...project, ownerAccount: "demo2" }], auth: { password: "never-export" } } };
const text = backup.buildBackup(snapshot, "demo1", "2026-10-19T00:00:00Z");
assert.equal(JSON.parse(text).projects.length, 1);
assert(!text.includes("never-export"));
const restored = backup.prepareRestore(text, [], "demo1", () => "new");
assert.deepEqual(restored.projects[0], project);
const copy = backup.prepareRestore(text, [project], "demo1", () => "new");
assert.equal(copy.copies, 1);
assert.equal(copy.projects[0].id, "new");
assert.deepEqual(copy.projects[0].roughPrice, project.roughPrice);
assert.deepEqual(copy.projects[0].scenarios, project.scenarios);
assert.deepEqual(copy.projects[0].priceRuns, project.priceRuns);
assert.equal(project.id, "p");
assert.throws(() => backup.prepareRestore('{"format":"new-energy-project-backup","version":1,"projects":[{}]}', [], "demo1", () => "new"), /结构不完整/);
assert.throws(() => backup.prepareRestore('{"format":"new-energy-project-backup","version":2,"projects":[]}', [], "demo1", () => "new"), /备份文件/);
assert.throws(() => backup.buildBackup(snapshot, ""), /登录/);
console.log("project backup tests passed");
const draft = { ...project, id: 'draft', name: '', workspaceBucket: 'new', startYear: null, forecastYears: null, capacityMw: null, scenarios: [] };
const draftText = backup.buildBackup({ payload: { projects: [project, draft] } }, 'demo1');
assert.deepEqual(backup.prepareRestore(draftText, [], 'demo1', () => 'x').projects, [project, draft]);
const nodes = Object.fromEntries(['storage-status-banner', 'storage-status-message', 'settings-storage-state', 'scenario-message'].map(id => [`#${id}`, { hidden: true, textContent: '' }]));
const doc = { querySelector: id => nodes[id] };
nodes['#scenario-message'].textContent = '场景“基准”已保存。';
backup.renderStorageState(doc, { state: 'conflict' });
assert.equal(nodes['#storage-status-banner'].hidden, false);
assert.match(nodes['#scenario-message'].textContent, /尚未保存/);
backup.renderStorageState(doc, { state: 'pending' });
assert.equal(nodes['#storage-status-banner'].hidden, false);
backup.renderStorageState(doc, { state: 'saved' });
assert.equal(nodes['#storage-status-banner'].hidden, true);

// Unsubmitted browser-only form values are guarded, without treating equivalent numbers as edits.
const controls = {
  create: [{ id: 'create-capacity', type: 'number', value: '100' }],
  scenario: [{ id: 'other-fee', type: 'number', value: '14.75' }, { id: 'derived', readOnly: true, value: '20' }],
  forecast: [{ id: 'algo-seed', type: 'number', value: '2027' }]
};
const forms = {
  '#create-project-form': { querySelectorAll: () => controls.create },
  '#scenario-form': { querySelectorAll: () => controls.scenario },
  '#forecast-run-form': { querySelectorAll: () => controls.forecast }
};
const formDoc = { querySelector: (selector) => forms[selector] };
backup.captureFormState(formDoc);
assert.equal(backup.hasUnsubmittedFormChanges(formDoc), false);
controls.scenario[0].value = '88';
assert.equal(backup.hasUnsubmittedFormChanges(formDoc), true, 'changing a DOM fee is unsaved before confirmation');
controls.scenario[0].value = '14.7500'; controls.scenario[1].value = '40';
assert.equal(backup.hasUnsubmittedFormChanges(formDoc), false, 'formatting and read-only derived fields do not cause permanent dirty warnings');
controls.create[0].value = '';
assert.equal(backup.hasUnsubmittedFormChanges(formDoc), true, 'blank invalid input is still an unsaved edit');
controls.create[0].value = '100'; controls.forecast[0].value = '123';
backup.captureFormState(formDoc);
assert.equal(backup.hasUnsubmittedFormChanges(formDoc), true, 'unrelated renders do not approve unsubmitted forecast settings');
backup.captureFormState(formDoc, ['#forecast-run-form']);
assert.equal(backup.hasUnsubmittedFormChanges(formDoc), false, 'generating a forecast establishes a clean form state');

const notifications = [], handlers = {};
const bindingDoc = {
  addEventListener: (event, handler) => { handlers[`document:${event}`] = handler; },
  querySelector: (selector) => ({ addEventListener: (event, handler) => { handlers[`${selector}:${event}`] = handler; } })
};
let readSnapshot = 0, reloaded = 0;
backup.bind({ documentRef: bindingDoc, getSnapshot: () => { readSnapshot += 1; return snapshot; }, getAccount: () => 'demo1',
  hasUnsubmittedChanges: () => true, notify: (message) => notifications.push(message), reload: () => { reloaded += 1; } });
handlers['#storage-backup:click']();
assert.match(notifications[0], /未提交.*先点击/);
assert.equal(readSnapshot, 0, 'backup cannot silently claim it contains unsubmitted form values');
handlers['#storage-reload:click']();
assert.equal(reloaded, 1, 'the explicit discard-and-reload button remains bound');
let navigationBlocked = false;
handlers['document:click']({ target: { closest: () => ({}) }, preventDefault() {}, stopImmediatePropagation() { navigationBlocked = true; } });
assert.equal(navigationBlocked, true, 'sidebar navigation must not silently discard a DOM-only edit');
assert.match(notifications.at(-1), /先保存.*切换页面/);
const scenarioSelect = { id: 'scenario-selector', value: 'original-scenario' };
const priorBindingQuery = bindingDoc.querySelector;
bindingDoc.querySelector = (selector) => selector === '#scenario-selector' ? scenarioSelect : priorBindingQuery(selector);
backup.captureFormState(bindingDoc);
scenarioSelect.value = 'other-scenario';
let switchBlocked = false;
handlers['document:change']({ target: scenarioSelect, preventDefault() {}, stopImmediatePropagation() { switchBlocked = true; } });
assert.equal(switchBlocked, true);
assert.equal(scenarioSelect.value, 'original-scenario', 'a blocked scenario switch restores its visible selection');

const otherBranch = JSON.parse(JSON.stringify(project));
otherBranch.scenarios[0].config.otherFee = 88;
otherBranch.roughPrice.snapshots.push({ id: 'other-branch-rough', value: 377.125 });
const branchSnapshot = { payload: { projects: [otherBranch], auth: { password: 'must-not-export' } } };
const branchBackup = backup.buildBackup(snapshot, 'demo1', '2026-10-19T00:00:00Z', [
  { label: '另一恢复分支', snapshot: branchSnapshot }, { label: '重复待保存分支', snapshot: branchSnapshot },
  { label: '重复当前分支', snapshot }
]);
const branchData = JSON.parse(branchBackup);
assert.equal(branchData.recoveryBranches.length, 1, 'keep every distinct branch but avoid exact duplicates');
assert.deepEqual(branchData.projects[0], project);
assert.deepEqual(branchData.recoveryBranches[0].projects[0], otherBranch);
assert(!branchBackup.includes('must-not-export'));
let restoredId = 0;
const originalBytes = JSON.stringify(project);
const restoredBranches = backup.prepareRestore(branchBackup, [project], 'demo1', () => `restored-${++restoredId}`);
assert.equal(restoredBranches.projects.length, 2);
assert.equal(new Set(restoredBranches.projects.map((p) => p.id)).size, 2);
assert.deepEqual(restoredBranches.projects.map((p) => p.scenarios[0].config.otherFee), [14.75, 88]);
assert.deepEqual(restoredBranches.projects[1].roughPrice, otherBranch.roughPrice);
assert.equal(JSON.stringify(project), originalBytes, 'restoring both branches never changes the existing project');
assert.equal(JSON.parse(backup.buildBackup(snapshot, 'Demo1')).projects.length, 1, 'backup matches the same normalized account visibility rule as the project list');

// Validate the whole file before creating any restore copies. Never normalize unsafe data.
const securityBefore = JSON.stringify(project);
function assertAtomicRejection(data, expected) {
  let generatedIds = 0;
  assert.throws(() => backup.prepareRestore(typeof data === 'string' ? data : JSON.stringify(data), [project], 'demo1',
    () => { generatedIds++; return `copy-${generatedIds}`; }), expected);
  assert.equal(generatedIds, 0, 'validate all projects/branches before constructing a restore copy');
  assert.equal(JSON.stringify(project), securityBefore, 'rejected restore cannot change an existing project');
  assert.equal(Object.prototype.polluted, undefined);
}
const envelope = (projects, recoveryBranches) => ({ format: 'new-energy-project-backup', version: 1, projects,
  ...(recoveryBranches ? { recoveryBranches } : {}) });
const archivedProject = { ...project, resultHistoryByScenario: { s: [{ annualRows: [{ year: 2026, fullRevenue: 102.375 }] }] } };
const archivedBackup = backup.buildBackup({ payload: { projects: [archivedProject] } }, "demo1");
const archivedCopy = backup.prepareRestore(archivedBackup, [archivedProject], "demo1", () => "archive-copy").projects[0];
assert.deepEqual(archivedCopy.resultHistoryByScenario, archivedProject.resultHistoryByScenario);
assertAtomicRejection(envelope([project, { ...archivedProject, resultHistoryByScenario: { s: [{}] } }]), /测算历史结构无效/);
for (const key of ['__proto__', 'constructor', 'prototype']) {
  const maliciousProject = JSON.parse(JSON.stringify(project));
  maliciousProject.scenarios[0].config = JSON.parse(`{"otherFee":14.75,"nested":{"${key}":{"polluted":true}}}`);
  assertAtomicRejection(envelope([project, maliciousProject]), /不安全字段/);
  assertAtomicRejection(envelope([project], [{ label: '不安全分支', projects: [maliciousProject] }]), /不安全字段/);
}
for (const unsafeId of ['__proto__', 'constructor', 'prototype']) {
  assertAtomicRejection(envelope([project, { ...project, id: unsafeId }]), /不安全标识/);
}
let deeplyNested = { ordinary: 1 };
for (let i = 0; i < 70; i++) deeplyNested = { child: deeplyNested };
assertAtomicRejection(envelope([project, { ...project, extension: deeplyNested }]), /64层结构安全上限/);
assertAtomicRejection(JSON.stringify(envelope([project, { ...project, extension: 'FINITE_MARKER' }])).replace('"FINITE_MARKER"', '1e999'), /非有限数字/);
assertAtomicRejection(envelope([project, { ...project, scenarios: [null] }]), /方案结构/);
assertAtomicRejection(envelope([project, { ...project, scenarios: [{ id: 's', config: [] }] }]), /config应为对象/);
assertAtomicRejection(envelope([project, { ...project, roughPrice: { snapshots: {} } }]), /snapshots应为数组/);
assertAtomicRejection(envelope([project], [{ label: '后一个项目不完整', projects: [{}] }]), /结构不完整/);

const preserved = JSON.parse(JSON.stringify(project));
preserved.scenarios[0].config = { otherFee: 14.750000000003, missingValue: null,
  envManualValuesByYear: { 2026: { carbonEnabled: false, carbonPrice: 4, carbonRealizeRatio: 0.25 } } };
preserved.roughPrice.snapshots[0].original = { negative: -5.123456789, zero: 0, missing: null };
preserved.note = 'constructor / prototype / __proto__ are ordinary text; <script> is also text';
preserved.priceRuns[0].prices = Array(35040).fill(-5.123456789);
const preservedBytes = JSON.stringify(preserved);
const safeRestore = backup.prepareRestore(JSON.stringify(envelope([preserved])), [], 'demo1', () => 'unused');
assert.equal(JSON.stringify(safeRestore.projects[0]), preservedBytes, 'safe validation preserves every original value and snapshot without cleaning or truncating arrays');
console.log('project backup safety and atomicity tests passed');

// Supply inputs, saved drafts and run provenance are losslessly included in the
// same backup; restoring a copy must retain evidence tied to its original ID.
const supplyDomain = require('../src/domain/supply-demand');
const forecastDomain = require('../src/domain/price-forecast');
const supplyFlow = require('../src/ui/supply-demand-flow');
const suppliedProject = JSON.parse(JSON.stringify(preserved));
suppliedProject.province = 'hebei';
const suppliedConfig = supplyDomain.createConfig(suppliedProject);
for (const { key } of supplyDomain.ELEMENTS) {
  const element = suppliedConfig.elements[key];
  element.baseEnergyMwh = key === 'load' ? 8760.123456789 : key === 'tieLine' ? -220.123456789 : 0;
  element.growthRatesByYear = { 2027: key === 'load' ? 2.125 : 0, 2028: -1.75 };
  element.monthlyWeights = [...supplyDomain.MONTH_DAYS];
  Object.values(element.hourlyWeightsByMonth).forEach((weights) => weights.fill(1));
}
const suppliedDataset = supplyDomain.buildDataset(suppliedProject, suppliedConfig);
assert.equal(suppliedDataset.ok, true);
suppliedProject.supplyDemand = {
  version: 1, config: suppliedConfig, draft: JSON.parse(JSON.stringify(suppliedConfig)),
  generatedAt: '2026-11-13T01:02:03.000Z', inputFingerprint: suppliedDataset.fingerprint
};
suppliedProject.supplyDemand.draft.elements.nonMarket.baseEnergyMwh = null;
suppliedProject.priceRuns.push({ id: 'bound-supply', status: 'publishable',
  supplyDemandInput: forecastDomain.snapshotSupplyDemandInput(suppliedProject, { config: suppliedConfig, dataset: suppliedDataset }),
  pricesByYear: { 2026: [0, -5.123456789, 300.75] } });
suppliedProject.activeRunId = 'bound-supply';
const suppliedBytes = JSON.stringify(suppliedProject);
const suppliedBackup = backup.buildBackup({ payload: { projects: [suppliedProject] } }, 'demo1');
const supplyRestore = backup.prepareRestore(suppliedBackup, [], 'demo1', () => 'unused').projects[0];
assert.equal(JSON.stringify(supplyRestore), suppliedBytes, '供需原件、未完成草稿、预测来源和既有费用/粗算均按原值恢复');
const supplyCopy = backup.prepareRestore(suppliedBackup, [suppliedProject], 'demo1', () => 'supply-restored-copy').projects[0];
assert.deepEqual(supplyCopy.supplyDemand, suppliedProject.supplyDemand);
assert.deepEqual(supplyCopy.priceRuns, suppliedProject.priceRuns);
assert.deepEqual(supplyCopy.scenarios, suppliedProject.scenarios);
assert.deepEqual(supplyCopy.roughPrice, suppliedProject.roughPrice);
assert.equal(JSON.stringify(suppliedProject), suppliedBytes, '恢复副本不改原项目');
let supplyInvalidations = 0;
const hydrateSupply = supplyFlow.create({ onInvalidate: () => { supplyInvalidations++; } });
hydrateSupply.hydrate(supplyRestore, supplyRestore);
assert.equal(supplyRestore.activeRunId, 'bound-supply', '同项目恢复保留仍匹配的供需预测来源');
hydrateSupply.hydrate(supplyCopy, supplyCopy);
assert.equal(supplyCopy.activeRunId, null, '恢复副本项目ID改变，应保留历史记录但取消旧来源生效');
assert.equal(supplyInvalidations, 1);
assert.deepEqual(supplyCopy.priceRuns, suppliedProject.priceRuns, '失效只改当前引用，不改原价格数组或来源快照');
assert.deepEqual(supplyCopy.scenarios, suppliedProject.scenarios);
assert.deepEqual(supplyCopy.roughPrice, suppliedProject.roughPrice);

const uiSupplyCopy = { ...JSON.parse(suppliedBytes), id: 'ui-supply-copy',
  duplicationTargetProjectId: 'ui-supply-copy', duplicatedFromProjectIds: [suppliedProject.id] };
assert.equal(forecastDomain.validateSupplyDemandRun(uiSupplyCopy, uiSupplyCopy.priceRuns.at(-1)).ok, true);
const uiSupplyBackup = backup.buildBackup({ payload: { projects: [uiSupplyCopy] } }, 'demo1');
const collidedUiCopy = backup.prepareRestore(uiSupplyBackup, [uiSupplyCopy], 'demo1', () => 'collision-ui-copy').projects[0];
assert.deepEqual(collidedUiCopy.restoredFromProjectIds, [uiSupplyCopy.id, suppliedProject.id]);
assert.equal(forecastDomain.validateSupplyDemandRun(collidedUiCopy, collidedUiCopy.priceRuns.at(-1)).ok, false,
  '复制来源用于粗算恢复，不允许备份碰撞后的旧供需价格来源继续生效');
const historicalRunsBytes = JSON.stringify(collidedUiCopy.priceRuns);
supplyFlow.create({}).hydrate(collidedUiCopy, collidedUiCopy);
assert.equal(collidedUiCopy.activeRunId, null);
assert.equal(JSON.stringify(collidedUiCopy.priceRuns), historicalRunsBytes);

// Structurally readable backups may still contain a mismatched run source.
// Import the record losslessly, then quarantine that run during hydration.
const supplySourceMutations = [
  (source) => { source.version = 2; },
  (source) => { source.calendar = 'actual_366_days'; },
  (source) => { source.hoursPerYear = 8784; },
  (source) => { source.units.energy = 'kWh'; },
  (source) => { source.units.intervalHours = 0.25; },
  (source) => { source.featureConsumption = 'used_by_model'; },
  (source) => { source.annualSummary[0].load += 100; },
  (source) => { source.annualSummary[1].year += 10; }
];
for (const mutateSource of supplySourceMutations) {
  const damagedSourceProject = JSON.parse(suppliedBytes);
  mutateSource(damagedSourceProject.priceRuns[1].supplyDemandInput);
  const damagedBytes = JSON.stringify(damagedSourceProject);
  const file = backup.buildBackup({ payload: { projects: [damagedSourceProject] } }, 'demo1');
  const recoveredSourceProject = backup.prepareRestore(file, [], 'demo1', () => 'unused').projects[0];
  assert.equal(JSON.stringify(recoveredSourceProject), damagedBytes, '可读但来源不匹配的备份应原样保留记录，不静默修复数值');
  hydrateSupply.hydrate(recoveredSourceProject, recoveredSourceProject);
  assert.equal(recoveredSourceProject.activeRunId, null, '恢复后的损坏来源必须取消生效');
  assert.deepEqual(recoveredSourceProject.priceRuns, damagedSourceProject.priceRuns, '隔离来源不得改写价格数组及原来源摘要');
  assert.deepEqual(recoveredSourceProject.roughPrice, damagedSourceProject.roughPrice, '原粗算快照保留');
  assert.deepEqual(recoveredSourceProject.scenarios, damagedSourceProject.scenarios, '原费用与确认记录保留');
  assert.deepEqual(recoveredSourceProject.supplyDemand, damagedSourceProject.supplyDemand, '有效配置及未完成草稿均保留');
  assert.equal(JSON.stringify(damagedSourceProject), damagedBytes, '输入备份对象始终只读');
}

const supplyMutations = [
  (p) => { p.supplyDemand = []; },
  (p) => { p.supplyDemand.config = []; },
  (p) => { p.supplyDemand.draft = 'invalid'; },
  (p) => { p.supplyDemand.config.elements = []; },
  (p) => { p.supplyDemand.config.elements.load = []; },
  (p) => { p.supplyDemand.config.elements.load.growthRatesByYear = []; },
  (p) => { p.supplyDemand.config.elements.load.monthlyWeights = {}; },
  (p) => { p.supplyDemand.config.elements.load.hourlyWeightsByMonth = []; },
  (p) => { p.supplyDemand.config.elements.load.hourlyWeightsByMonth[1] = {}; },
  (p) => { p.supplyDemand.draft.elements.tieLine.export = []; },
  (p) => { p.priceRuns[1].supplyDemandInput = 'invalid'; },
  (p) => { p.priceRuns[1].supplyDemandInput.configSnapshot = []; },
  (p) => { p.priceRuns[1].supplyDemandInput.configSnapshot.elements.wind.monthlyWeights = {}; },
  (p) => { p.priceRuns[1].supplyDemandInput.period = []; },
  (p) => { p.priceRuns[1].supplyDemandInput.units = []; },
  (p) => { p.priceRuns[1].supplyDemandInput.annualSummary = {}; },
  (p) => { p.priceRuns[1].supplyDemandInput.annualSummary[0] = null; }
];
for (const mutate of supplyMutations) {
  const malformed = JSON.parse(suppliedBytes);
  mutate(malformed);
  assertAtomicRejection(envelope([project, malformed]), /备份结构无效/);
  assertAtomicRejection(envelope([project], [{ label: '供需结构损坏分支', projects: [malformed] }]), /备份结构无效/);
}
assert.equal(JSON.stringify(suppliedProject), suppliedBytes);
console.log('project backup supply-demand preservation and structural checks passed');

(async () => {
  const importHandlers = {}, importMessages = [];
  const unsafeText = JSON.stringify(envelope([project])).replace('"confirmedFields"', '"__proto__"');
  const input = { files: [{ text: async () => unsafeText }], value: 'chosen',
    addEventListener(event, handler) { importHandlers[event] = handler; } };
  const importDoc = { addEventListener() {}, querySelector: (selector) => selector === '#backup-import-file' ? input : null };
  let restoreCalls = 0;
  backup.bind({ documentRef: importDoc, hasUnsubmittedChanges: () => false,
    getSnapshot: () => ({ payload: { projects: [project] } }), getAccount: () => 'demo1',
    makeId: () => 'unused', restore: () => { restoreCalls++; }, notify: (message) => importMessages.push(message) });
  await importHandlers.change();
  assert.equal(restoreCalls, 0, 'file-import UI must never call restore after preflight rejects a backup');
  assert.match(importMessages[0], /不安全字段/);
  assert.equal(input.value, '');
  assert.equal(JSON.stringify(project), securityBefore);
  console.log('project backup unsafe file UI rejection passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
