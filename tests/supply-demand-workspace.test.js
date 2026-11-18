"use strict";

const assert = require("node:assert/strict");
const workspace = require("../src/ui/supply-demand-workspace");
const domain = require("../src/domain/supply-demand");
const clone = (value) => JSON.parse(JSON.stringify(value));
const keys = domain.ELEMENTS.map((element) => element.key);
const generatedAt = "2026-11-13T12:00:00.000Z";

class Root {
  constructor() { this.innerHTML = ""; this.events = {}; }
  addEventListener(name, listener) { this.events[name] = listener; }
  contains(target) { return !target.detached; }
  fire(name, dataset, extra = {}) {
    const target = { dataset, closest() { return this.dataset.sdAction ? this : null; }, ...extra };
    return this.events[name]?.({ target, preventDefault() {} });
  }
}

function project(id = "p1") {
  return { id, name: "供需测试", province: "shandong", startYear: 2027, forecastYears: 2,
    roughPrice: { snapshots: [{ id: "frozen-rough", value: 327 }] },
    forecastSettlement: { history: [{ year: 2027, price: 329 }] },
    scenarios: [{ id: "s1", config: { managementFee: 12.5 } }] };
}

function completeConfig(p, load = 120000) {
  const config = domain.createConfig(p);
  for (const key of keys) {
    const series = config.elements[key];
    series.baseEnergyMwh = key === "load" ? load : key === "tieLine" ? -600 : 0;
    Object.keys(series.growthRatesByYear).forEach((year) => { series.growthRatesByYear[year] = key === "load" ? 5 : 0; });
    if (series.baseEnergyMwh) {
      series.monthlyWeights = Array(12).fill(1);
      series.hourlyWeightsByMonth = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [index + 1, Array(24).fill(1)]));
    }
  }
  return config;
}

function savedState(p, config = completeConfig(p)) {
  return { version: 1, config, inputFingerprint: domain.fingerprint(p, config), generatedAt: "2026-11-01T00:00:00.000Z" };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(p = project(), behavior = {}) {
  const root = new Root(), commits = [], exports = [], downloads = [], reads = [], statuses = [];
  let active = p;
  const xlsx = {};
  const template = {
    download(target, config, options) { downloads.push({ target, config, options }); },
    readFile(target, file, options) {
      reads.push({ target, file, options });
      return file.result;
    }
  };
  const controller = workspace.createController({ root, getProject: () => active, domain, template, xlsx,
    now: () => generatedAt,
    onCommit(target, next, flags) {
      if (behavior.fail) return false;
      if (behavior.throw) throw new Error("模拟保存失败");
      assert.equal(target, active);
      assert.equal(controller.hasUnsavedChanges(target), false, "draft clears before the synchronous workflow render");
      target.supplyDemand = next;
      commits.push({ next: clone(next), flags });
      controller.render();
      return true;
    },
    onDraftChange() {
      statuses.push(controller.hasUnsavedChanges());
      controller.render();
    },
    downloadCsv(filename, rows) { exports.push({ filename, rows }); }
  });
  controller.render();
  return { root, controller, commits, exports, downloads, reads, statuses, xlsx,
    setActive(value) { active = value; controller.render(); },
    upload(name, result) { return root.fire("change", { sdTemplateFile: "" }, { files: [{ name, result }] }); },
    click(action) { return root.fire("click", { sdAction: action }); },
    select(key, value) { return root.fire("change", { sdSelect: key }, { value: String(value) }); },
    openSavedPreview() {
      const markup = [];
      root.fire("toggle", {}, {
        open: true, hasAttribute: () => true, querySelector: () => null,
        insertAdjacentHTML(_position, html) { markup.push(html); }
      });
      return markup.join("");
    }
  };
}

async function main() {
  const fresh = project(), initial = fixture(fresh), original = clone(fresh);
  assert.equal(initial.controller.hasUnsavedChanges(), false);
  assert.match(initial.root.innerHTML, /2027—2028年/);
  assert.match(initial.root.innerHTML, /data-sd-action="download-template"/);
  assert.match(initial.root.innerHTML, /<input type="file" data-sd-template-file accept="\.xlsx/);
  assert.doesNotMatch(initial.root.innerHTML, /data-sd-field|data-sd-action="generate"|<textarea/);
  initial.click("download-template");
  assert.deepEqual(initial.downloads[0], { target: fresh, config: undefined, options: { xlsx: initial.xlsx } });

  const pending = deferred();
  const valid = completeConfig(fresh);
  const firstUpload = initial.upload("假设<&>.xlsx", pending.promise);
  assert.equal(initial.controller.hasUnsavedChanges(), true);
  assert.match(initial.root.innerHTML, /读取模板中/);
  assert.doesNotMatch(initial.root.innerHTML, /data-sd-import-preview/);
  assert.deepEqual(fresh, original);
  pending.resolve({ ok: true, config: valid });
  await firstUpload;
  assert.equal(initial.controller.hasUnsavedChanges(), true);
  assert.deepEqual(initial.statuses, [true, true]);
  assert.match(initial.root.innerHTML, /data-sd-import-preview/);
  assert.match(initial.root.innerHTML, /假设&lt;&amp;&gt;\.xlsx/);
  assert.match(initial.root.innerHTML, /126,000\.00/);
  assert.match(initial.root.innerHTML, /-600\.00/);
  assert.doesNotMatch(initial.root.innerHTML, /联络线送出|联络线受入/, "net-mode review stays compact");
  assert.deepEqual(fresh, original, "validation and preview leave the project untouched");

  await initial.upload("坏模板.xlsx", { ok: false, errors: ["年度总量单元格 E2 缺失"] });
  assert.match(initial.root.innerHTML, /年度总量单元格 E2 缺失/);
  assert.match(initial.root.innerHTML, /126,000\.00/, "invalid replacement keeps the prior staged preview");
  assert.deepEqual(initial.reads.at(-1).options.baseConfig, valid);
  assert.notEqual(initial.reads.at(-1).options.baseConfig, valid, "the codec receives an isolated basis");
  assert.equal(initial.controller.hasUnsavedChanges(), true);
  assert.deepEqual(fresh, original);

  initial.click("generate");
  assert.equal(initial.controller.hasUnsavedChanges(), false);
  assert.deepEqual(initial.commits[0].flags, { changed: true, generated: true });
  assert.equal(fresh.supplyDemand.generatedAt, generatedAt);
  assert.equal(fresh.supplyDemand.inputFingerprint, domain.fingerprint(fresh, valid));
  assert.deepEqual(fresh.supplyDemand.config, valid);
  assert.notEqual(fresh.supplyDemand.config, valid);
  const { supplyDemand, ...projectWithoutSupply } = fresh;
  assert.deepEqual(projectWithoutSupply, original, "rough, history and other scenario input stay intact");
  assert.match(initial.openSavedPreview(), /典型日24小时/);
  initial.select("previewYear", 2028);
  initial.select("previewMonth", 2);
  assert.match(initial.root.innerHTML, /<option value="2028" selected/);
  assert.match(initial.root.innerHTML, /<option value="2" selected/);

  await initial.upload("替换.xlsx", { ok: true, config: completeConfig(fresh, 90000) });
  initial.click("export-annual"); initial.click("export-typical"); initial.click("export-hourly");
  assert.equal(initial.exports.length, 3);
  assert.equal(initial.exports[0].rows[1][1], 120000, "exports use the committed config during a new preview");
  assert.equal(initial.exports[1].rows.length, 2 * 288 + 1);
  assert.equal(initial.exports[2].rows.length, 2 * 8760 + 1);
  assert.match(initial.exports[2].filename, /8760小时_2027-2028\.csv$/);
  initial.click("discard");
  assert.equal(initial.controller.hasUnsavedChanges(), false);
  assert.equal(fresh.supplyDemand, supplyDemand);
  assert.equal(initial.commits.length, 1);

  const history = project("history");
  history.supplyDemand = savedState(history);
  history.activeRunId = "original-backend-run";
  const historyBefore = JSON.stringify(history), historical = fixture(history);
  await historical.upload("原配置.xlsx", { ok: true, config: clone(history.supplyDemand.config) });
  assert.equal(historical.controller.hasUnsavedChanges(), true, "equal reimports still require explicit review");
  assert.match(historical.root.innerHTML, /配置与已保存版本一致/);
  historical.click("generate");
  assert.deepEqual(historical.statuses, [true, true, false]);
  assert.equal(historical.commits.length, 0, "exact no-op save skips persistence and forecast invalidation");
  assert.equal(JSON.stringify(history), historyBefore);

  const directional = project("directions"), directions = fixture(directional);
  const directionalConfig = completeConfig(directional);
  const tieLine = directionalConfig.elements.tieLine, netSeries = clone(tieLine);
  const { growthRatesByYear, monthlyWeights, hourlyWeightsByMonth } = netSeries;
  tieLine.mode = "bidirectional";
  tieLine.export = { baseEnergyMwh: 800, growthRatesByYear, monthlyWeights, hourlyWeightsByMonth };
  tieLine.import = { baseEnergyMwh: 1200, growthRatesByYear, monthlyWeights, hourlyWeightsByMonth };
  await directions.upload("双向.xlsx", { ok: true, config: directionalConfig });
  assert.match(directions.root.innerHTML, /联络线净电量.*联络线送出.*联络线受入/);
  assert.match(directions.root.innerHTML, /<td>-400\.00<\/td><td>800\.00<\/td><td>1,200\.00<\/td>/);
  directions.click("generate");
  const savedDirections = directions.openSavedPreview();
  assert.equal((savedDirections.match(/联络线送出/g) || []).length, 2, "both annual and typical saved views show direction");
  assert.match(savedDirections, /<td>-400\.00<\/td><td>800\.00<\/td><td>1,200\.00<\/td>/);

  const legacy = project("legacy");
  legacy.supplyDemand = { ...savedState(legacy), draft: completeConfig(legacy, 350000) };
  const legacyBefore = JSON.stringify(legacy), old = fixture(legacy);
  assert.match(old.root.innerHTML, /已保存草稿预览/);
  assert.match(old.root.innerHTML, /350,000\.00/);
  assert.equal(JSON.stringify(legacy), legacyBefore, "opening preserves pre-existing drafts");
  old.click("download-template");
  assert.equal(old.downloads.at(-1).config, legacy.supplyDemand.draft);
  await old.upload("新的.xlsx", { ok: true, config: completeConfig(legacy, 15000) });
  old.click("discard");
  assert.equal(JSON.stringify(legacy), legacyBefore, "discarding a preview preserves previous saved draft");
  old.click("generate");
  assert.equal(legacy.supplyDemand.draft, undefined);
  assert.equal(legacy.supplyDemand.config.elements.load.baseEnergyMwh, 350000);

  legacy.supplyDemand.draft = clone(legacy.supplyDemand.config);
  const legacySavedAt = legacy.supplyDemand.generatedAt;
  old.controller.render();
  old.click("generate");
  assert.deepEqual(old.commits.at(-1).flags, { changed: false, generated: false });
  assert.equal(legacy.supplyDemand.generatedAt, legacySavedAt);
  assert.equal(legacy.supplyDemand.draft, undefined);

  const conflictProject = project("conflict");
  conflictProject.supplyDemand = { ...savedState(conflictProject), draft: { startYear: 2025, forecastYears: 1 } };
  const conflict = fixture(conflictProject);
  assert.match(conflict.root.innerHTML, /草稿待核对/);
  assert.match(conflict.root.innerHTML, /data-sd-action="generate" disabled/);
  conflict.click("generate");
  assert.equal(conflict.commits.length, 0);
  conflict.click("discard");
  assert.deepEqual(conflictProject.supplyDemand, savedState(conflictProject));

  await conflict.upload("待保存.xlsx", { ok: true, config: completeConfig(conflictProject, 9000) });
  conflictProject.supplyDemand = savedState(conflictProject, completeConfig(conflictProject, 30000));
  conflict.controller.render();
  assert.match(conflict.root.innerHTML, /已保存供需配置已更新/);
  conflict.click("generate");
  assert.equal(conflictProject.supplyDemand.config.elements.load.baseEnergyMwh, 30000);
  conflict.click("discard");
  conflict.click("download-template");
  assert.equal(conflict.downloads.at(-1).config.elements.load.baseEnergyMwh, 30000);
  conflictProject.startYear += 1;
  conflict.controller.render();
  assert.match(conflict.root.innerHTML, /data-sd-dirty>待核对/);

  const a = project("a"), b = project("b"), races = fixture(a);
  const oldPromise = deferred(), newPromise = deferred();
  const oldUpload = races.upload("旧.xlsx", oldPromise.promise);
  const newUpload = races.upload("新.xlsx", newPromise.promise);
  newPromise.resolve({ ok: true, config: completeConfig(a, 7000) });
  await newUpload;
  oldPromise.resolve({ ok: true, config: completeConfig(a, 3000) });
  await oldUpload;
  assert.match(races.root.innerHTML, /7,000\.00/);
  assert.doesNotMatch(races.root.innerHTML, /旧\.xlsx/);
  races.click("discard");

  const wrongType = deferred();
  const superseded = races.upload("待处理.xlsx", wrongType.promise);
  await races.upload("非模板.csv", null);
  assert.match(races.root.innerHTML, /请选择 \.xlsx/);
  assert.equal(races.controller.hasUnsavedChanges(), false);
  wrongType.resolve({ ok: true, config: completeConfig(a) });
  await superseded;
  assert.doesNotMatch(races.root.innerHTML, /data-sd-import-preview/);

  const projectSwap = deferred();
  const swapped = races.upload("属于原项目.xlsx", projectSwap.promise);
  races.setActive(b);
  races.setActive(a);
  projectSwap.resolve({ ok: true, config: completeConfig(a) });
  await swapped;
  assert.equal(races.controller.hasUnsavedChanges(), false);
  assert.doesNotMatch(races.root.innerHTML, /data-sd-import-preview/);

  const periodSwap = deferred();
  const changed = races.upload("上一周期.xlsx", periodSwap.promise);
  a.startYear += 1;
  periodSwap.resolve({ ok: true, config: completeConfig(a) });
  await changed;
  assert.match(races.root.innerHTML, /2028—2029年/);
  assert.equal(races.controller.hasUnsavedChanges(), false);

  const cancelRead = deferred();
  const cancelled = races.upload("正读取.xlsx", cancelRead.promise);
  races.click("discard");
  cancelRead.resolve({ ok: true, config: completeConfig(a) });
  await cancelled;
  assert.equal(races.controller.hasUnsavedChanges(), false);
  assert.doesNotMatch(races.root.innerHTML, /data-sd-import-preview/);
  assert.equal(races.commits.length, 0);

  const failure = project("failed"), behavior = { fail: true }, failed = fixture(failure, behavior);
  await failed.upload("有效.xlsx", { ok: true, config: completeConfig(failure) });
  failed.click("generate");
  assert.match(failed.root.innerHTML, /供需配置保存失败/);
  assert.equal(failure.supplyDemand, undefined);
  assert.equal(failed.controller.hasUnsavedChanges(), true);
  behavior.fail = false;
  behavior.throw = true;
  failed.click("generate");
  assert.match(failed.root.innerHTML, /模拟保存失败/);
  assert.equal(failed.controller.hasUnsavedChanges(), true);
  behavior.throw = false;
  failed.click("generate");
  assert.equal(failed.controller.hasUnsavedChanges(), false);
  assert.equal(failure.supplyDemand.config.elements.load.baseEnergyMwh, 120000);

  console.log("supply-demand-workspace: ok");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
