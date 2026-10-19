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
