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
  fire(name, dataset, extra = {}, eventFields = {}) {
    const target = { dataset, closest() { return this.dataset.sdAction ? this : null; }, ...extra };
    return this.events[name]?.({ target, preventDefault() {}, ...eventFields });
  }
}

function project(id = "p1", forecastYears = 2) {
  return { id, name: "供需测试", province: "shandong", startYear: 2027, forecastYears,
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
  const growthDownloads = [], growthReads = [];
  let active = p;
  const xlsx = {};
  const template = {
    downloadCurves(target, config, options) { downloads.push({ target, config, options }); },
    readCurveFile(target, file, options) {
      reads.push({ target, file, options });
      return file.result;
    },
    downloadGrowth(target, config, options) { growthDownloads.push({ target, config, options }); },
    readGrowthFile(target, file, options) {
      growthReads.push({ target, file, options });
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
      if (flags.generated) {
        next.generatedProvince = target.province ?? null;
        delete next.requiresProvinceReview;
      }
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
  return { root, controller, commits, exports, downloads, reads, growthDownloads, growthReads, statuses, xlsx,
    setActive(value) { active = value; controller.render(); },
    upload(name, result) { return root.fire("change", { sdTemplateFile: "" }, { files: [{ name, result }] }); },
    uploadGrowth(name, result) { return root.fire("change", { sdGrowthFile: "" }, { files: [{ name, result }] }); },
    openGrowth(series) {
      const button = (root.innerHTML.match(/<button\b[^>]*data-sd-action="growth-open"[^>]*>/g) || [])
        .find((tag) => tag.includes(`data-sd-series="${series}"`));
      assert.ok(button, `${series} has a growth disclosure`);
      if (!button.includes('aria-expanded="true"')) root.fire("click", { sdAction: "growth-open", sdSeries: series });
    },
    click(action, dataset = {}) { return root.fire("click", { sdAction: action, ...dataset }); },
    chooseElement(element) { return root.fire("click", { sdAction: "select-element", sdElement: element }); },
    edit(input, value, dataset = {}) { return root.fire("input", { sdInput: input, ...dataset }, { value: String(value) }); },
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

async function uploadMonthlyOverride(x, p, key, year, weights) {
  x.click("download-template");
  assert.equal(x.downloads.at(-1).options.year, year);
  const config = domain.prepareShareConfig(p, x.downloads.at(-1).config);
  const series = config.elements[key];
  series.curveOverridesByYear ||= {};
  series.curveOverridesByYear[year] = { ...series.curveOverridesByYear[year], monthlyWeights: weights };
  await x.upload(`${year}-${key}-分月.xlsx`, { ok: true, config, changedRows: 1, changes: [{ label: key }] });
}

function assertNoElementPreviews(html) {
  assert.doesNotMatch(html, /data-sd-monthly-preview|data-sd-curve-preview|sd-curve-bars|sd-month-total|data-sd-growth-total|data-sd-select="curveMonth"/,
    "element editors contain inputs and template controls without generated previews");
}

async function testGrowthWorkbook() {
  const untouched = project("growth-no-op", 3);
  untouched.supplyDemand = savedState(untouched);
  const untouchedBefore = JSON.stringify(untouched), unchanged = fixture(untouched);
  assert.doesNotMatch(unchanged.root.innerHTML, /data-sd-action="download-growth-template"|data-sd-growth-file/);
  unchanged.openGrowth("load");
  assert.match(unchanged.root.innerHTML, /data-sd-action="download-growth-template"/);
  assert.match(unchanged.root.innerHTML, /<input\b[^>]*type="file"[^>]*data-sd-growth-file[^>]*accept="\.xlsx/);
  unchanged.click("download-growth-template");
  assert.deepEqual(unchanged.growthDownloads[0], {
    target: untouched, config: untouched.supplyDemand.config, options: { xlsx: unchanged.xlsx, seriesKey: "load" }
  });
  await unchanged.uploadGrowth("空白增速.xlsx", { ok: true, config: clone(untouched.supplyDemand.config), changedRows: 0, changes: [] });
  assert.deepEqual(unchanged.growthReads[0].options, {
    xlsx: unchanged.xlsx, seriesKey: "load", baseConfig: untouched.supplyDemand.config
  });
  assert.notEqual(unchanged.growthReads[0].options.baseConfig, untouched.supplyDemand.config, "growth parsing receives an isolated basis");
  assert.equal(JSON.stringify(untouched), untouchedBefore, "blank workbook preview preserves every saved value");
  unchanged.click("generate");
  assert.equal(unchanged.commits.length, 0, "no-op growth import must not rewrite legacy config or invalidate forecast");
  assert.equal(unchanged.controller.hasUnsavedChanges(), false);
  assert.equal(JSON.stringify(untouched), untouchedBefore);

  const p = project("growth-shared-draft", 3), config = completeConfig(p);
  config.elements.wind = { ...clone(config.elements.load), baseEnergyMwh: 12000 };
  p.supplyDemand = savedState(p, config);
  const before = JSON.stringify(p), x = fixture(p);
  x.edit("base", 130000, { sdSeries: "load" });
  x.select("curveYear", 2029);
  await uploadMonthlyOverride(x, p, "load", 2029, [0, 1 / 6, ...Array(10).fill(1 / 12)]);
  x.chooseElement("wind");
  x.edit("base", 20000, { sdSeries: "wind" });
  x.chooseElement("load");
  x.openGrowth("load");
  x.click("download-growth-template");
  const originalDraft = clone(x.growthDownloads.at(-1).config);
  const changed = clone(originalDraft);
  changed.elements.load.growthRatesByYear = { 2028: 0, 2029: 8 };
  const pending = deferred(), importing = x.uploadGrowth("负荷增速<&>.xlsx", pending.promise);
  assert.equal(x.growthReads.at(-1).options.seriesKey, "load");
  assert.deepEqual(x.growthReads.at(-1).options.baseConfig, originalDraft, "growth import starts from all current staged edits");
  assert.match(x.root.innerHTML, /读取模板中/);
  x.chooseElement("wind");
  pending.resolve({ ok: true, config: changed, changedRows: 2, changes: [{ year: 2028, value: 0 }, { year: 2029, value: 8 }] });
  await importing;
  assert.equal(JSON.stringify(p), before, "import only stages changes, including after switching the active element");
  assert.match(x.root.innerHTML, /value="20000" data-sd-series="wind"/);
  const review = x.root.innerHTML.match(/<section\b[^>]*data-sd-import-preview[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(review, "successful growth imports have concise read feedback");
  assert.match(review, /负荷增速&lt;&amp;&gt;\.xlsx/);
  assert.match(review, /省内负荷/);
  assert.match(review, /2\s*(?:年|行|项)/);
  assert.doesNotMatch(review, /<ul\b|<li\b|<table\b|2028[\s\S]*0\s*%|2029[\s\S]*8\s*%/);
  assert.doesNotMatch(review, /月典型日分时|分月占比/, "growth review cannot masquerade as a curve import");
  assertNoElementPreviews(x.root.innerHTML);
  x.click("download-template");
  assert.deepEqual(x.downloads.at(-1).config, changed);
  assert.equal(changed.elements.wind.baseEnergyMwh, 20000);
  assert.deepEqual(changed.elements.wind.growthRatesByYear, { 2028: 5, 2029: 5 });
  assert.equal(changed.elements.load.baseEnergyMwh, 130000);
  assert.equal(changed.elements.load.curveOverridesByYear[2029].monthlyWeights[0], 0);
  x.chooseElement("load");
  x.openGrowth("load");
  assert.match(x.root.innerHTML, /value="0"[^>]*data-sd-series="load"[^>]*data-sd-year="2028"/);
  assert.match(x.root.innerHTML, /value="8"[^>]*data-sd-series="load"[^>]*data-sd-year="2029"/);
  await x.uploadGrowth("错误增速.xlsx", { ok: false, errors: ["增长率年份超出项目周期"] });
  assert.match(x.root.innerHTML, /增长率年份超出项目周期/);
  x.click("download-template");
  assert.deepEqual(x.downloads.at(-1).config, changed, "invalid replacement keeps the complete staged draft");
  x.click("generate");
  assert.equal(x.commits.length, 1, "growth plus prior edits require only one explicit commit");
  assert.deepEqual(p.supplyDemand.config, changed);
  const { supplyDemand, ...otherState } = p;
  const { supplyDemand: oldSupplyDemand, ...originalOtherState } = JSON.parse(before);
  assert.deepEqual(otherState, originalOtherState, "growth import leaves rough snapshots and revenue state untouched");

  const cancellable = project("growth-cancel", 3);
  cancellable.supplyDemand = savedState(cancellable);
  const cancelBefore = JSON.stringify(cancellable), cancelled = fixture(cancellable);
  cancelled.edit("base", 150000, { sdSeries: "load" });
  cancelled.openGrowth("load");
  const delayed = deferred(), cancelledRead = cancelled.uploadGrowth("取消.xlsx", delayed.promise);
  cancelled.click("discard");
  delayed.resolve({ ok: true, config: completeConfig(cancellable, 9000), changedRows: 1, changes: [{ year: 2028, value: 9 }] });
  await cancelledRead;
  assert.match(cancelled.root.innerHTML, /value="150000" data-sd-series="load"/);
  assert.doesNotMatch(cancelled.root.innerHTML, /取消\.xlsx/);
  assert.equal(cancelled.controller.hasUnsavedChanges(), true, "cancelling a read preserves edits made before the import");
  cancelled.click("discard");
  assert.equal(cancelled.controller.hasUnsavedChanges(), false);
  assert.equal(JSON.stringify(cancellable), cancelBefore);
  assert.equal(cancelled.commits.length, 0);
}

function testCapacityHoursEditor() {
  const fresh = project("capacity-hours-new", 3), freshBefore = JSON.stringify(fresh), x = fixture(fresh);
  x.click("download-template");
  const seeded = x.downloads.at(-1).config;
  for (const key of ["wind", "solar", "hydro"]) {
    assert.ok(seeded.elements[key].capacityHours, `${key} has a capacity-hours basis in a new template`);
    x.chooseElement(key);
    assert.match(x.root.innerHTML, new RegExp(`data-sd-input="base-capacity"[^>]*data-sd-series="${key}"`));
    assert.match(x.root.innerHTML, new RegExp(`data-sd-input="base-utilization"[^>]*data-sd-series="${key}"`));
    assert.doesNotMatch(x.root.innerHTML, /data-sd-input="base"|data-sd-action="use-capacity-hours"/);
    assert.match(x.root.innerHTML, /data-sd-select="generationMode"/);
    assert.match(x.root.innerHTML, /<option value="capacity_hours" selected/);
    x.openGrowth(key);
    assert.match(x.root.innerHTML, /装机(?:增速|增长率)/);
    assert.match(x.root.innerHTML, /data-sd-select="utilizationYear"/);
    assertNoElementPreviews(x.root.innerHTML);
  }
  assert.equal(x.controller.hasUnsavedChanges(), false, "viewing a fresh capacity-hours basis does not save it");
  assert.equal(JSON.stringify(fresh), freshBefore);

  x.chooseElement("wind");
  x.edit("base-capacity", 100, { sdSeries: "wind" });
  x.edit("base-utilization", 2400, { sdSeries: "wind" });
  x.openGrowth("wind");
  x.edit("growth-rate", 10, { sdSeries: "wind", sdYear: "2028" });
  x.edit("growth-rate", 5, { sdSeries: "wind", sdYear: "2029" });
  x.select("utilizationYear", 2029);
  assert.match(x.root.innerHTML, /data-sd-input="utilization-override"[^>]*placeholder="[^"]*2400/);
  x.edit("utilization-override", 2100, { sdSeries: "wind", sdYear: "2029" });
  x.click("download-growth-template");
  assert.equal(x.growthDownloads.at(-1).options.seriesKey, "wind");
  const withOverride = clone(x.growthDownloads.at(-1).config);
  assert.deepEqual(withOverride.elements.wind.capacityHours, {
    baseCapacityMw: 100, baseUtilizationHours: 2400, utilizationHoursByYear: { 2029: 2100 }
  });
  assert.deepEqual(withOverride.elements.wind.growthRatesByYear, { 2028: 10, 2029: 5 });
  x.chooseElement("solar");
  x.edit("base-capacity", 200, { sdSeries: "solar" });
  x.edit("base-utilization", 1500, { sdSeries: "solar" });
  x.openGrowth("solar");
  x.select("utilizationYear", 2028);
  x.edit("utilization-override", 0, { sdSeries: "solar", sdYear: "2028" });
  x.chooseElement("wind");
  x.openGrowth("wind");
  x.select("utilizationYear", 2029);
  assert.match(x.root.innerHTML, /data-sd-input="utilization-override"[^>]*value="2100"[^>]*data-sd-year="2029"/);
  x.edit("utilization-override", "", { sdSeries: "wind", sdYear: "2029" });
  x.click("download-template");
  const cleared = x.downloads.at(-1).config;
  assert.deepEqual(cleared.elements.wind.capacityHours, {
    baseCapacityMw: 100, baseUtilizationHours: 2400, utilizationHoursByYear: {}
  }, "blank annual hours restore inheritance without altering first-year assumptions");
  assert.deepEqual(cleared.elements.solar.capacityHours, {
    baseCapacityMw: 200, baseUtilizationHours: 1500, utilizationHoursByYear: { 2028: 0 }
  }, "a zero-hour override is explicit and stays scoped to its generator and year");
  assert.equal(JSON.stringify(fresh), freshBefore);
  x.click("discard");
  assert.equal(x.controller.hasUnsavedChanges(), false);
  assert.equal(JSON.stringify(fresh), freshBefore);

  const history = project("capacity-hours-legacy", 3);
  const legacy = domain.prepareShareConfig(history, completeConfig(history));
  legacy.elements.wind = { ...clone(legacy.elements.load), baseEnergyMwh: 50000,
    growthRatesByYear: { 2028: 3, 2029: 4 },
    curveOverridesByYear: { 2029: { monthlyWeights: [0, 1 / 6, ...Array(10).fill(1 / 12)] } } };
  history.supplyDemand = savedState(history, legacy);
  const historyBefore = JSON.stringify(history), old = fixture(history);
  old.edit("base", 130000, { sdSeries: "load" });
  old.chooseElement("wind");
  assert.match(old.root.innerHTML, /value="50000" data-sd-series="wind"/);
  assert.doesNotMatch(old.root.innerHTML, /data-sd-input="base-capacity"|data-sd-input="base-utilization"/);
  assert.match(old.root.innerHTML, /data-sd-select="generationMode"/);
  assert.match(old.root.innerHTML, /<option value="energy" selected/);
  old.select("generationMode", "capacity_hours");
  old.click("download-template");
  const converted = old.downloads.at(-1).config;
  assert.ok(converted.elements.wind.capacityHours);
  assert.ok(Object.values(converted.elements.wind.growthRatesByYear).every((rate) => rate === null),
    "legacy energy growth rates need explicit new capacity-growth input");
  assert.deepEqual(converted.elements.wind.alternateGeneration, { mode: "energy", growthRatesByYear: { 2028: 3, 2029: 4 } },
    "the inactive energy growth assumptions are retained for a return switch");
  assert.deepEqual(converted.elements.wind.monthlyWeights, legacy.elements.wind.monthlyWeights);
  assert.deepEqual(converted.elements.wind.hourlyWeightsByMonth, legacy.elements.wind.hourlyWeightsByMonth);
  assert.deepEqual(converted.elements.wind.curveOverridesByYear, legacy.elements.wind.curveOverridesByYear);
  assert.equal(converted.elements.load.baseEnergyMwh, 130000, "conversion preserves other staged edits");
  assert.deepEqual(converted.elements.load.growthRatesByYear, legacy.elements.load.growthRatesByYear);
  assert.equal(converted.elements.solar.capacityHours, undefined, "conversion remains scoped to the chosen legacy generator");
  assert.equal(converted.elements.hydro.capacityHours, undefined);
  assert.equal(JSON.stringify(history), historyBefore, "conversion never rewrites saved inputs or rough snapshots before generation");
  old.click("discard");
  assert.equal(old.controller.hasUnsavedChanges(), false);
  assert.equal(old.commits.length, 0);
  assert.equal(JSON.stringify(history), historyBefore);
  assert.match(old.root.innerHTML, /value="50000" data-sd-series="wind"/);
  assert.match(old.root.innerHTML, /data-sd-select="generationMode"/);
  assert.match(old.root.innerHTML, /<option value="energy" selected/);
  assert.doesNotMatch(old.root.innerHTML, /data-sd-input="base-capacity"|data-sd-input="base-utilization"/);
}

function testGenerationModeRoundTrip() {
  const p = project("generation-mode-roundtrip", 3);
  const config = domain.prepareShareConfig(p, completeConfig(p));
  config.elements.wind = { ...clone(config.elements.load), baseEnergyMwh: 50000,
    growthRatesByYear: { 2028: 3, 2029: 4 },
    curveOverridesByYear: { 2029: { monthlyWeights: [0, 1 / 6, ...Array(10).fill(1 / 12)] } } };
  p.supplyDemand = savedState(p, config);
  const before = JSON.stringify(p), noop = fixture(p);
  noop.chooseElement("wind");
  noop.select("generationMode", "energy");
  assert.equal(noop.controller.hasUnsavedChanges(), false, "reselecting the current generation mode is inert");
  noop.select("generationMode", "capacity_hours");
  noop.select("generationMode", "energy");
  noop.click("generate");
  assert.equal(noop.commits.length, 0, "an untouched roundtrip must not rewrite saved input or invalidate results");
  assert.equal(noop.controller.hasUnsavedChanges(), false);
  assert.equal(JSON.stringify(p), before);

  const readDraft = (x) => { x.click("download-template"); return clone(x.downloads.at(-1).config); };
  const x = fixture(p);
  x.chooseElement("wind");
  x.edit("base", 60000, { sdSeries: "wind" });
  x.openGrowth("wind");
  x.edit("growth-rate", 5, { sdSeries: "wind", sdYear: "2028" });
  x.edit("growth-rate", 6, { sdSeries: "wind", sdYear: "2029" });
  x.click("download-growth-template");
  assert.equal(x.growthDownloads.at(-1).options.seriesKey, "wind");
  assert.equal(x.growthDownloads.at(-1).config.elements.wind.capacityHours, undefined);
  assert.deepEqual(x.growthDownloads.at(-1).config.elements.wind.growthRatesByYear, { 2028: 5, 2029: 6 });
  x.select("generationMode", "capacity_hours");
  x.edit("base-capacity", 100, { sdSeries: "wind" });
  x.edit("base-utilization", 2000, { sdSeries: "wind" });
  x.openGrowth("wind");
  x.edit("growth-rate", 10, { sdSeries: "wind", sdYear: "2028" });
  x.edit("growth-rate", 0, { sdSeries: "wind", sdYear: "2029" });
  x.select("utilizationYear", 2029);
  x.edit("utilization-override", 1800, { sdSeries: "wind", sdYear: "2029" });
  x.click("download-growth-template");
  const capacityTemplate = clone(x.growthDownloads.at(-1).config);
  assert.equal(x.growthDownloads.at(-1).options.seriesKey, "wind");
  assert.deepEqual(capacityTemplate.elements.wind.growthRatesByYear, { 2028: 10, 2029: 0 });
  assert.deepEqual(capacityTemplate.elements.wind.alternateGeneration, { mode: "energy", growthRatesByYear: { 2028: 5, 2029: 6 } });
  x.select("generationMode", "energy");
  assert.match(x.root.innerHTML, /value="60000" data-sd-series="wind"/);
  assert.doesNotMatch(x.root.innerHTML, /data-sd-input="base-capacity"|data-sd-input="utilization-override"/);
  const energyDraft = readDraft(x);
  assert.deepEqual(energyDraft.elements.wind.growthRatesByYear, { 2028: 5, 2029: 6 });
  assert.deepEqual(energyDraft.elements.wind.alternateGeneration, { mode: "capacity_hours",
    growthRatesByYear: { 2028: 10, 2029: 0 }, capacityHours: {
      baseCapacityMw: 100, baseUtilizationHours: 2000, utilizationHoursByYear: { 2029: 1800 }
    } });
  x.edit("base", 62000, { sdSeries: "wind" });
  x.select("generationMode", "capacity_hours");
  const capacityDraft = readDraft(x);
  assert.equal(capacityDraft.elements.wind.baseEnergyMwh, 62000, "the alternate energy base remains available across switches");
  assert.deepEqual(capacityDraft.elements.wind.capacityHours, energyDraft.elements.wind.alternateGeneration.capacityHours);
  assert.deepEqual(capacityDraft.elements.wind.growthRatesByYear, { 2028: 10, 2029: 0 });
  for (const key of keys.filter((key) => key !== "wind")) assert.deepEqual(capacityDraft.elements[key], config.elements[key]);
  for (const key of ["monthlyWeights", "hourlyWeightsByMonth", "curveOverridesByYear"]) {
    assert.deepEqual(capacityDraft.elements.wind[key], config.elements.wind[key], "mode changes retain the shared curves");
  }
  assert.equal(JSON.stringify(p), before, "both mode drafts remain isolated before generation");
  x.click("generate");
  assert.equal(x.commits.length, 1);
  assert.deepEqual(p.supplyDemand.config, capacityDraft);
  const savedCapacity = JSON.stringify(p), reopened = fixture(p);
  reopened.chooseElement("wind");
  assert.match(reopened.root.innerHTML, /<option value="capacity_hours" selected/);
  reopened.select("generationMode", "energy");
  assert.match(reopened.root.innerHTML, /value="62000" data-sd-series="wind"/);
  assert.deepEqual(readDraft(reopened).elements.wind.growthRatesByYear, { 2028: 5, 2029: 6 });
  assert.equal(JSON.stringify(p), savedCapacity);
  reopened.click("generate");
  assert.equal(reopened.commits.length, 1);
  assert.equal(p.supplyDemand.config.elements.wind.capacityHours, undefined);
  assert.deepEqual(p.supplyDemand.config.elements.wind.alternateGeneration.capacityHours, capacityDraft.elements.wind.capacityHours);

  const savedEnergy = JSON.stringify(p), again = fixture(p);
  again.chooseElement("wind");
  assert.match(again.root.innerHTML, /<option value="energy" selected/);
  again.select("generationMode", "capacity_hours");
  assert.match(again.root.innerHTML, /data-sd-input="base-capacity"[^>]*value="100"/);
  again.edit("base-capacity", 150, { sdSeries: "wind" });
  again.select("generationMode", "energy");
  again.edit("base", 63000, { sdSeries: "wind" });
  again.click("discard");
  assert.equal(again.controller.hasUnsavedChanges(), false);
  assert.equal(JSON.stringify(p), savedEnergy);
  assert.match(again.root.innerHTML, /value="62000" data-sd-series="wind"/);
  again.select("generationMode", "capacity_hours");
  assert.match(again.root.innerHTML, /data-sd-input="base-capacity"[^>]*value="100"/,
    "discard restores the inactive capacity assumptions as well as active energy inputs");
  again.select("generationMode", "energy");
  again.click("generate");
  assert.equal(again.commits.length, 0, "roundtrips with two saved parameter sets are also no-ops");
  assert.equal(JSON.stringify(p), savedEnergy);

  const inactiveEdit = fixture(p);
  inactiveEdit.chooseElement("wind");
  inactiveEdit.select("generationMode", "capacity_hours");
  inactiveEdit.edit("base-capacity", 120, { sdSeries: "wind" });
  inactiveEdit.select("generationMode", "energy");
  inactiveEdit.click("generate");
  assert.equal(p.supplyDemand.config.elements.wind.capacityHours, undefined);
  assert.equal(p.supplyDemand.config.elements.wind.baseEnergyMwh, 62000);
  assert.equal(p.supplyDemand.config.elements.wind.alternateGeneration.capacityHours.baseCapacityMw, 120,
    "editing the alternate mode is saved even when returning to the original active mode before generation");
  const inactiveReopened = fixture(p);
  inactiveReopened.chooseElement("wind");
  inactiveReopened.select("generationMode", "capacity_hours");
  assert.match(inactiveReopened.root.innerHTML, /data-sd-input="base-capacity"[^>]*value="120"/);
  inactiveReopened.click("discard");
}

function testBoundaryReview() {
  const shortened = project("shorter-period");
  shortened.supplyDemand = savedState(shortened);
  const previous = clone(shortened.supplyDemand), roughBefore = JSON.stringify(shortened.roughPrice);
  const short = fixture(shortened);
  shortened.forecastYears = 1;
  short.controller.render();
  assert.match(short.root.innerHTML, /data-sd-generation-hint>原参数已带入/);
  assert.doesNotMatch(short.root.innerHTML, /data-sd-action="generate" disabled|data-sd-saved-preview/);
  assert.deepEqual(shortened.supplyDemand, previous, "opening a changed period never rewrites the saved source");
  short.edit("base", 120000, { sdSeries: "load" });
  assert.equal(short.controller.hasUnsavedChanges(), false, "re-entering a carried value need not invent a draft");
  short.click("generate");
  assert.equal(short.commits.length, 1, "the migrated period can be explicitly confirmed without changing a value");
  assert.deepEqual(short.commits[0].flags, { changed: true, generated: true });
  assert.equal(shortened.supplyDemand.config.forecastYears, 1);
  assert.equal(shortened.supplyDemand.config.elements.load.baseEnergyMwh, 120000);
  assert.equal(shortened.supplyDemand.generatedAt, generatedAt);
  assert.match(short.root.innerHTML, /data-sd-saved-preview/);
  assert.equal(JSON.stringify(shortened.roughPrice), roughBefore);

  const moved = project("different-province", 1);
  const sameConfig = domain.prepareShareConfig(moved, completeConfig(moved));
  moved.supplyDemand = { ...savedState(moved, sameConfig), generatedProvince: moved.province, requiresProvinceReview: true };
  const movedSource = clone(moved.supplyDemand), behavior = { fail: true };
  moved.province = "hebei";
  const other = fixture(moved, behavior);
  assert.match(other.root.innerHTML, /核对当前省份和测算周期后重新生成/);
  assert.doesNotMatch(other.root.innerHTML, /data-sd-action="generate" disabled|data-sd-saved-preview/);
  other.click("export-annual");
  assert.equal(other.exports.length, 0, "a stale saved source cannot be exported under the new province");
  other.click("generate");
  assert.deepEqual(moved.supplyDemand, movedSource, "failed reconfirmation preserves the old config and source markers");
  assert.match(other.root.innerHTML, /供需配置保存失败/);
  assert.doesNotMatch(other.root.innerHTML, /data-sd-saved-preview/);
  behavior.fail = false;
  other.setActive(project("another-project", 1));
  other.click("generate");
  assert.equal(other.commits.length, 0, "switching projects cannot confirm the previous project's source");
  other.setActive(moved);
  other.click("generate");
  assert.equal(other.commits.length, 1, "equal values still need a real generation for a changed province");
  assert.deepEqual(other.commits[0].flags, { changed: true, generated: true });
  assert.deepEqual(moved.supplyDemand.config, sameConfig);
  assert.equal(moved.supplyDemand.generatedProvince, "hebei");
  assert.equal(moved.supplyDemand.requiresProvinceReview, undefined);
  assert.notEqual(moved.supplyDemand.inputFingerprint, movedSource.inputFingerprint);
  assert.deepEqual(domain.savedBoundaryErrors(moved), []);
  assert.match(other.root.innerHTML, /data-sd-saved-preview/);
  assert.match(other.root.innerHTML, /data-sd-generation-hint>配置未变，无需重新生成/);

  const extended = project("longer-period", 1);
  extended.supplyDemand = savedState(extended);
  extended.forecastYears = 2;
  const extendedBefore = clone(extended.supplyDemand), longer = fixture(extended);
  longer.click("generate");
  assert.equal(longer.commits.length, 0, "explicit reconfirmation does not bypass missing new-year values");
  assert.match(longer.root.innerHTML, /供需数据生成失败，请核对以下参数/);
  assert.match(longer.root.innerHTML, /2028年增长率须明确填写/);
  assert.deepEqual(extended.supplyDemand, extendedBefore);

  const invalid = project("same-invalid", 3);
  const invalidConfig = domain.prepareShareConfig(invalid, completeConfig(invalid));
  for (const key of keys) {
    for (const year of Object.keys(invalidConfig.elements[key].growthRatesByYear)) invalidConfig.elements[key].growthRatesByYear[year] = null;
  }
  invalid.supplyDemand = savedState(invalid, invalidConfig);
  const invalidBefore = clone(invalid.supplyDemand), unchanged = fixture(invalid);
  assert.match(unchanged.root.innerHTML, /data-sd-generation-hint>请修正已保存配置中的无效参数后重新生成/);
  unchanged.edit("base", 120001, { sdSeries: "load" });
  unchanged.edit("base", 120000, { sdSeries: "load" });
  unchanged.click("generate");
  assert.equal(unchanged.commits.length, 0);
  assert.match(unchanged.root.innerHTML, /data-sd-message>供需数据生成失败，请核对以下参数/);
  assert.match(unchanged.root.innerHTML, /另有 \d+ 项，请补充或修正后重试/);
  assert.doesNotMatch(unchanged.root.innerHTML, /请核对后重新导入/);
  assert.deepEqual(invalid.supplyDemand, invalidBefore);
}

async function main() {
  testBoundaryReview();
  const fresh = project(), initial = fixture(fresh), original = clone(fresh);
  assert.equal(initial.controller.hasUnsavedChanges(), false);
  assert.match(initial.root.innerHTML, /2027—2028年/);
  assert.match(initial.root.innerHTML, /data-sd-action="download-template"/);
  assert.match(initial.root.innerHTML, /<input type="file" data-sd-template-file accept="\.xlsx/);
  assert.equal((initial.root.innerHTML.match(/data-sd-input="base"/g) || []).length, 1);
  const tabs = initial.root.innerHTML.match(/<button\b[^>]*data-sd-action="select-element"[^>]*>/g) || [];
  assert.equal(tabs.length, 6);
  for (const key of keys) {
    const tab = tabs.find((tag) => tag.includes(`data-sd-element="${key}"`));
    assert.ok(tab, `${key} has an element tab`);
    assert.match(tab, /role="tab"/);
    assert.match(tab, new RegExp(`aria-selected="${key === "load"}"`));
  }
  assert.doesNotMatch(initial.root.innerHTML, /data-sd-select="curveSeries"|data-sd-select="tieMode"/);
  assert.doesNotMatch(initial.root.innerHTML, /data-sd-input="month-share"/);
  assertNoElementPreviews(initial.root.innerHTML);
  assert.doesNotMatch(initial.root.innerHTML, /data-sd-saved-preview|供需数据预览/);
  initial.edit("month-share", 100, { sdMonth: "1" });
  assert.equal(initial.controller.hasUnsavedChanges(), false, "obsolete monthly edit events cannot create a draft");
  assert.deepEqual(fresh, original);
  assert.match(initial.root.innerHTML, /data-sd-action="generate" disabled/);
  assert.match(initial.root.innerHTML, /aria-describedby="sd-generation-hint"/);
  assert.match(initial.root.innerHTML, /data-sd-generation-hint>填写参数或导入模板后可生成/);
  assert.doesNotMatch(initial.root.innerHTML, /data-sd-growth-panel|sd-curve-bars|<textarea/);
  assert.doesNotMatch(initial.root.innerHTML, /data-sd-supply-chart/, "chart appears after successful generation");
  initial.click("download-template");
  assert.deepEqual(initial.downloads[0], { target: fresh, config: domain.createCapacityHoursConfig(fresh), options: { xlsx: initial.xlsx, year: null } });

  const pending = deferred();
  const valid = completeConfig(fresh);
  const firstUpload = initial.upload("假设<&>.xlsx", pending.promise);
  assert.equal(initial.controller.hasUnsavedChanges(), true);
  assert.match(initial.root.innerHTML, /读取模板中/);
  assert.doesNotMatch(initial.root.innerHTML, /data-sd-import-preview/);
  assert.deepEqual(fresh, original);
  pending.resolve({ ok: true, config: valid, changedRows: 1, changes: [{ label: "省内负荷", month: 1 }] });
  await firstUpload;
  assert.equal(initial.controller.hasUnsavedChanges(), true);
  assert.deepEqual(initial.statuses, [true, true]);
  assert.match(initial.root.innerHTML, /data-sd-import-preview/);
  assert.match(initial.root.innerHTML, /假设&lt;&amp;&gt;\.xlsx/);
  const curveReadFeedback = initial.root.innerHTML.match(/<section\b[^>]*data-sd-import-preview[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(curveReadFeedback);
  assert.match(curveReadFeedback, /默认典型年/);
  assert.match(curveReadFeedback, /1\s*(?:行|项)/);
  assert.doesNotMatch(curveReadFeedback, /<ul\b|<li\b|<table\b|省内负荷 · 1月典型日分时/);
  assertNoElementPreviews(initial.root.innerHTML);
  assert.doesNotMatch(initial.root.innerHTML, /data-sd-saved-preview|供需数据预览/, "valid imported drafts are not generated output");
  assert.doesNotMatch(initial.root.innerHTML, /data-sd-input="base"[^>]*data-sd-series="tieLine"/);
  initial.chooseElement("tieLine");
  assert.match(initial.root.innerHTML, /value="-600" data-sd-series="tieLine"/);
  assert.match(initial.root.innerHTML, /data-sd-select="tieMode"/);
  assert.doesNotMatch(initial.root.innerHTML, /联络线送出|联络线受入/, "net-mode review stays compact");
  initial.chooseElement("load");
  assert.deepEqual(fresh, original, "validation and preview leave the project untouched");

  await initial.upload("坏模板.xlsx", { ok: false, errors: ["分月占比单元格 E2 缺失"] });
  assert.match(initial.root.innerHTML, /分月占比单元格 E2 缺失/);
  assert.match(initial.root.innerHTML, /假设&lt;&amp;&gt;\.xlsx/, "invalid replacement keeps the prior staged preview");
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
  assert.equal((initial.root.innerHTML.match(/data-sd-saved-preview/g) || []).length, 1);
  assert.match(initial.root.innerHTML, /data-sd-saved-preview[\s\S]*供需数据预览[\s\S]*data-sd-supply-chart/);
  assert.ok(initial.root.innerHTML.indexOf("data-sd-saved-preview") > initial.root.innerHTML.indexOf('data-sd-action="generate"'),
    "generated previews sit below the unified generate action");
  assertNoElementPreviews(initial.root.innerHTML);
  assert.match(initial.root.innerHTML, /供需堆积面积图[\s\S]*data-sd-supply-chart/);
  assert.match(initial.root.innerHTML, /<option value="monthly" selected>分月/);
  const { supplyDemand, ...projectWithoutSupply } = fresh;
  assert.deepEqual(projectWithoutSupply, original, "rough, history and other scenario input stay intact");
  assert.match(initial.openSavedPreview(), /典型日24小时/);
  initial.select("previewYear", 2028);
  initial.select("previewMonth", 2);
  assert.match(initial.root.innerHTML, /<option value="2028" selected/);
  assert.match(initial.root.innerHTML, /<option value="2" selected/);
  assert.match(initial.root.innerHTML, /2028 年 2 月典型日24小时/);

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
  assert.match(historical.root.innerHTML, /模板与当前曲线一致/);
  historical.click("generate");
  assert.deepEqual(historical.statuses, [true, true, false]);
  assert.equal(historical.commits.length, 0, "exact no-op save skips persistence and forecast invalidation");
  assert.equal(JSON.stringify(history), historyBefore);

  const chartProject = project("display-chart");
  const chartRoot = new Root(), drawn = [], chartEvents = {};
  const monthLabel = { hidden: true }, fallback = { hidden: true };
  const plot = { clientWidth: 680, hidden: false, ownerDocument: { defaultView: {
    getComputedStyle() { return { getPropertyValue: (key) => key === "--ink" ? "#444444" : "" }; }
  } } };
  chartRoot.querySelector = (selector) => ({
    "[data-sd-supply-chart]": chartRoot.innerHTML.includes("data-sd-supply-chart") ? plot : null,
    "[data-sd-chart-month]": monthLabel,
    "[data-sd-chart-fallback]": fallback
  })[selector] || null;
  let chartCount = 0, disposed = 0, summaries = 0;
  const chartController = workspace.createController({ root: chartRoot, getProject: () => chartProject,
    domain: { ...domain, buildDataset() { assert.fail("chart must not expand 8760-hour dataset"); },
      buildTypicalSummary(...args) { summaries += 1; return domain.buildTypicalSummary(...args); } },
    echarts: { init(target, _theme, options) {
      assert.equal(target, plot);
      assert.equal(options.renderer, "canvas");
      chartCount += 1;
      return { setOption(value) { drawn.push(value); }, on(name, listener) { chartEvents[name] = listener; },
        resize() {}, dispose() { disposed += 1; } };
    } },
    supplyChart: { buildOption(dataset, settings) { return { load: dataset.annualRows[0].load, ...settings }; } }
  });
  chartController.render();
  assert.equal(chartCount, 0);
  chartProject.supplyDemand = savedState(chartProject);
  const chartBefore = JSON.stringify(chartProject);
  chartController.render();
  assert.deepEqual(drawn.at(-1), { load: 120000, year: 2027, month: 1, granularity: "monthly", legendSelection: {}, tokens: { ink: "#444444" }, width: 680 });
  assert.equal(typeof chartEvents.legendselectchanged, "function");
  const legendSelection = { "风电出力": false, "光伏出力": true };
  chartEvents.legendselectchanged({ selected: legendSelection });
  assert.equal(chartController.hasUnsavedChanges(), false, "legend visibility does not create an input draft");
  assert.equal(JSON.stringify(chartProject), chartBefore, "legend toggles never change saved data");
  chartRoot.fire("input", { sdInput: "base", sdSeries: "load" }, { value: "180000" });
  assert.equal(drawn.length, 1, "typing into the draft does not repaint the saved chart");
  chartRoot.fire("change", { sdSelect: "previewYear" }, { value: "2028" });
  chartRoot.fire("change", { sdSelect: "previewGranularity" }, { value: "typical" });
  assert.equal(monthLabel.hidden, false);
  chartRoot.fire("change", { sdSelect: "previewMonth" }, { value: "7" });
  assert.deepEqual(drawn.at(-1), { load: 120000, year: 2028, month: 7, granularity: "typical", legendSelection, tokens: { ink: "#444444" }, width: 680 });
  assert.equal(chartCount, 1, "filters update the current instance");
  assert.equal(summaries, 1);
  assert.equal(JSON.stringify(chartProject), chartBefore, "chart filters show saved data and never commit project changes");
  chartController.disposeChart();
  assert.equal(disposed, 1);
  assert.equal(chartController.hasUnsavedChanges(), true, "disposing the chart preserves edits");
  chartController.render();
  assert.equal(chartCount, 2);
  assert.deepEqual(drawn.at(-1).legendSelection, legendSelection, "legend visibility survives filter changes and chart remounts");
  assert.equal(summaries, 1, "reopening the page uses its cached typical summary");
  chartProject.startYear += 1;
  chartController.render();
  assert.doesNotMatch(chartRoot.innerHTML, /data-sd-supply-chart/);
  assert.doesNotMatch(chartRoot.innerHTML, /data-sd-saved-preview/, "invalid saved periods cannot present generated preview as current");
  assert.equal(disposed, 2);

  const hybrid = project("hybrid", 3);
  hybrid.supplyDemand = savedState(hybrid);
  const hybridBefore = JSON.stringify(hybrid);
  const hybridFixture = fixture(hybrid);
  hybridFixture.edit("base", 130000, { sdSeries: "load" });
  hybridFixture.click("growth-open", { sdSeries: "load" });
  assert.match(hybridFixture.root.innerHTML, /省内负荷 · 逐年增长率/);
  hybridFixture.edit("growth-rate", "", { sdSeries: "load", sdYear: "2029" });
  hybridFixture.edit("growth-fill", 8);
  hybridFixture.click("growth-fill");
  assert.match(hybridFixture.root.innerHTML, /已填入 1 个空白年份/);
  hybridFixture.select("curveYear", 2029);
  assert.match(hybridFixture.root.innerHTML, /沿用默认/);
  assertNoElementPreviews(hybridFixture.root.innerHTML);
  await uploadMonthlyOverride(hybridFixture, hybrid, "load", 2029, [0, 1 / 6, ...Array(10).fill(1 / 12)]);
  assert.match(hybridFixture.root.innerHTML, /本年已调整 · 分月已调整/);
  hybridFixture.click("download-template");
  const combined = clone(hybridFixture.downloads.at(-1).config);
  assert.equal(hybridFixture.downloads.at(-1).options.year, 2029);
  assert.deepEqual(combined.elements.load.growthRatesByYear, { 2028: 5, 2029: 8 }, "batch fills blank years and preserves existing rates");
  assert.equal(combined.elements.load.baseEnergyMwh, 130000);
  assert.equal(combined.elements.load.monthlyWeights[0], 1 / 12);
  assert.equal(combined.elements.load.curveOverridesByYear[2029].monthlyWeights[0], 0);
  combined.elements.load.curveOverridesByYear[2029].hourlyWeightsByMonth = { 7: [1, ...Array(23).fill(0)] };
  await hybridFixture.upload("2029年分时.xlsx", { ok: true, config: combined, changedRows: 1, changes: [{ label: "省内负荷", month: 7 }] });
  assert.equal(hybridFixture.reads.at(-1).options.year, 2029);
  assert.equal(hybridFixture.reads.at(-1).options.baseConfig.elements.load.baseEnergyMwh, 130000);
  assertNoElementPreviews(hybridFixture.root.innerHTML);
  assert.equal(JSON.stringify(hybrid), hybridBefore, "annual and curve edits share an isolated draft until save");
  hybridFixture.click("generate");
  assert.deepEqual(hybrid.supplyDemand.config, combined);
  assert.equal(hybrid.supplyDemand.config.version, 2);
  hybridFixture.select("curveYear", 2028);
  assert.match(hybridFixture.root.innerHTML, /data-sd-curve-origin>沿用默认/);
  hybridFixture.select("curveYear", 2029);
  hybridFixture.click("restore-curve");
  assert.match(hybridFixture.root.innerHTML, /2029 年该要素已恢复默认曲线/);
  hybridFixture.click("generate");
  assert.equal(hybrid.supplyDemand.config.elements.load.curveOverridesByYear, undefined);
  assert.equal(hybrid.supplyDemand.config.elements.load.baseEnergyMwh, 130000);
  assert.equal(hybrid.supplyDemand.config.elements.load.growthRatesByYear[2029], 8);

  const noOpEdit = project("no-op-edit");
  noOpEdit.supplyDemand = savedState(noOpEdit);
  const exactLegacy = JSON.stringify(noOpEdit), noOpFixture = fixture(noOpEdit);
  noOpFixture.edit("base", 130000, { sdSeries: "load" });
  noOpFixture.edit("base", 120000, { sdSeries: "load" });
  noOpFixture.click("generate");
  assert.equal(noOpFixture.commits.length, 0, "reversing a UI edit keeps the recorded v1 configuration and fingerprint");
  assert.equal(JSON.stringify(noOpEdit), exactLegacy);

  const single = fixture(project("single", 1));
  assert.doesNotMatch(single.root.innerHTML, /data-sd-action="growth-open"/);
  assert.doesNotMatch(single.root.innerHTML, /data-sd-action="download-growth-template"|data-sd-growth-file/);
  await testGrowthWorkbook();
  testCapacityHoursEditor();
  testGenerationModeRoundTrip();

  const keyboardProject = project("keyboard-tabs"), keyboardBefore = JSON.stringify(keyboardProject);
  const keyboard = fixture(keyboardProject), focusedTabs = [];
  keyboard.root.querySelector = (selector) => {
    const match = selector.match(/data-sd-element="([^"]+)"/);
    return match ? { focus() { focusedTabs.push(match[1]); } } : null;
  };
  for (const [current, key, expected] of [
    ["load", "ArrowRight", "tieLine"], ["tieLine", "ArrowLeft", "load"],
    ["load", "ArrowLeft", "nonMarket"], ["nonMarket", "ArrowRight", "load"],
    ["load", "End", "nonMarket"], ["nonMarket", "Home", "load"]
  ]) {
    let prevented = false;
    keyboard.root.fire("keydown", { sdAction: "select-element", sdElement: current }, {}, {
      key, preventDefault() { prevented = true; }
    });
    assert.equal(prevented, true, `${key} is handled as tab navigation`);
    const tab = (keyboard.root.innerHTML.match(/<button\b[^>]*data-sd-action="select-element"[^>]*>/g) || [])
      .find((tag) => tag.includes(`data-sd-element="${expected}"`));
    assert.match(tab, /aria-selected="true"/);
    assert.equal(focusedTabs.at(-1), expected, "keyboard navigation restores focus after rendering");
  }
  assert.equal(keyboard.controller.hasUnsavedChanges(), false);
  assert.equal(JSON.stringify(keyboardProject), keyboardBefore);

  const byElement = project("element-drafts", 3), elementConfig = completeConfig(byElement);
  elementConfig.elements.wind = { ...clone(elementConfig.elements.load), baseEnergyMwh: 12000 };
  byElement.supplyDemand = savedState(byElement, elementConfig);
  const elementBefore = JSON.stringify(byElement), elementFixture = fixture(byElement);
  for (const key of keys) {
    elementFixture.chooseElement(key);
    const html = elementFixture.root.innerHTML;
    assert.equal((html.match(/data-sd-input="base"/g) || []).length, 1, "each tab shows only its own base input");
    assert.doesNotMatch(html, /data-sd-input="month-share"/);
    assertNoElementPreviews(html);
    assert.match(html, new RegExp(`data-sd-input="base"[^>]*data-sd-series="${key}"`));
    const selected = (html.match(/<button\b[^>]*data-sd-action="select-element"[^>]*>/g) || []).filter((tag) => tag.includes('aria-selected="true"'));
    assert.equal(selected.length, 1);
    assert.match(selected[0], new RegExp(`data-sd-element="${key}"`));
  }
  assert.equal(elementFixture.controller.hasUnsavedChanges(), false, "tab navigation alone does not create a draft");
  elementFixture.chooseElement("load");
  elementFixture.edit("base", 130000, { sdSeries: "load" });
  elementFixture.click("growth-open", { sdSeries: "load" });
  elementFixture.edit("growth-rate", 6, { sdSeries: "load", sdYear: "2028" });
  elementFixture.edit("growth-rate", 7, { sdSeries: "load", sdYear: "2029" });
  assertNoElementPreviews(elementFixture.root.innerHTML);
  elementFixture.select("curveYear", 2029);
  await uploadMonthlyOverride(elementFixture, byElement, "load", 2029, [0, 1 / 6, ...Array(10).fill(1 / 12)]);
  elementFixture.chooseElement("wind");
  assert.match(elementFixture.root.innerHTML, /value="12000" data-sd-series="wind"/);
  assert.match(elementFixture.root.innerHTML, /<option value="2029" selected/);
  assert.match(elementFixture.root.innerHTML, /data-sd-curve-origin>沿用默认/);
  elementFixture.edit("base", 20000, { sdSeries: "wind" });
  elementFixture.click("growth-open", { sdSeries: "wind" });
  elementFixture.edit("growth-rate", 3, { sdSeries: "wind", sdYear: "2028" });
  elementFixture.edit("growth-rate", 4, { sdSeries: "wind", sdYear: "2029" });
  await uploadMonthlyOverride(elementFixture, byElement, "wind", 2029, [1 / 6, 0, ...Array(10).fill(1 / 12)]);
  elementFixture.chooseElement("solar");
  elementFixture.chooseElement("load");
  assert.match(elementFixture.root.innerHTML, /value="130000" data-sd-series="load"/);
  assertNoElementPreviews(elementFixture.root.innerHTML);
  assert.match(elementFixture.root.innerHTML, /本年已调整 · 分月已调整/);
  elementFixture.click("growth-open", { sdSeries: "load" });
  assert.match(elementFixture.root.innerHTML, /value="6"[^>]*data-sd-series="load"[^>]*data-sd-year="2028"/);
  assert.match(elementFixture.root.innerHTML, /value="7"[^>]*data-sd-series="load"[^>]*data-sd-year="2029"/);
  elementFixture.click("download-template");
  const elementDraft = clone(elementFixture.downloads.at(-1).config);
  assert.equal(elementFixture.downloads.at(-1).options.year, 2029);
  assert.equal(elementDraft.elements.load.baseEnergyMwh, 130000);
  assert.equal(elementDraft.elements.wind.baseEnergyMwh, 20000);
  assert.deepEqual(elementDraft.elements.load.growthRatesByYear, { 2028: 6, 2029: 7 });
  assert.deepEqual(elementDraft.elements.wind.growthRatesByYear, { 2028: 3, 2029: 4 });
  assert.equal(elementDraft.elements.load.curveOverridesByYear[2029].monthlyWeights[0], 0);
  assert.equal(elementDraft.elements.wind.curveOverridesByYear[2029].monthlyWeights[1], 0);
  assert.equal(elementDraft.elements.load.monthlyWeights[0], 1 / 12, "annual overrides retain the default curve");
  assert.equal(JSON.stringify(byElement), elementBefore, "switching elements keeps all edits isolated until explicit generation");
  elementFixture.chooseElement("wind");
  assert.match(elementFixture.root.innerHTML, /value="20000" data-sd-series="wind"/);
  assertNoElementPreviews(elementFixture.root.innerHTML);
  elementFixture.click("generate");
  assert.deepEqual(byElement.supplyDemand.config, elementDraft, "a single commit saves both element drafts");
  assert.match(elementFixture.openSavedPreview(), /<th scope="row">2029<\/th><td>147,446\.00<\/td>/,
    "generated annual output compounds edited growth rates correctly");
  for (const key of keys) {
    elementFixture.chooseElement(key);
    assertNoElementPreviews(elementFixture.root.innerHTML);
    assert.equal((elementFixture.root.innerHTML.match(/data-sd-saved-preview/g) || []).length, 1,
      "all tabs share one saved-data preview after generation");
  }

  const liveTotalsProject = project("live-totals", 3);
  liveTotalsProject.supplyDemand = savedState(liveTotalsProject);
  const liveTotalsBefore = JSON.stringify(liveTotalsProject), live = fixture(liveTotalsProject);
  live.openGrowth("load");
  live.edit("base", 200000, { sdSeries: "load" });
  live.edit("growth-rate", 10, { sdSeries: "load", sdYear: "2028" });
  assertNoElementPreviews(live.root.innerHTML);
  assert.match(live.openSavedPreview(), /<th scope="row">2029<\/th><td>132,300\.00<\/td>/,
    "pending edits do not replace the saved annual preview");
  assert.equal(JSON.stringify(liveTotalsProject), liveTotalsBefore);
  assert.equal(live.controller.hasUnsavedChanges(), true);
  live.click("generate");
  assert.equal(live.commits.length, 1);
  assert.match(live.root.innerHTML, /<th scope="row">2028<\/th><td>220,000\.00<\/td>/);
  assert.match(live.root.innerHTML, /<th scope="row">2029<\/th><td>231,000\.00<\/td>/,
    "saved annual preview updates only after generation");
  assertNoElementPreviews(live.root.innerHTML);

  const directional = project("directions"), directions = fixture(directional);
  const directionalConfig = completeConfig(directional);
  const tieLine = directionalConfig.elements.tieLine, netSeries = clone(tieLine);
  const { growthRatesByYear, monthlyWeights, hourlyWeightsByMonth } = netSeries;
  tieLine.mode = "bidirectional";
  tieLine.export = { baseEnergyMwh: 800, growthRatesByYear, monthlyWeights, hourlyWeightsByMonth };
  tieLine.import = { baseEnergyMwh: 1200, growthRatesByYear, monthlyWeights, hourlyWeightsByMonth };
  await directions.upload("双向.xlsx", { ok: true, config: directionalConfig });
  directions.chooseElement("tieLine");
  assert.match(directions.root.innerHTML, /<option value="tieLineExport"[^>]*>送出<\/option><option value="tieLineImport"[^>]*>受入<\/option>/);
  assert.equal((directions.root.innerHTML.match(/data-sd-input="base"/g) || []).length, 1);
  assert.match(directions.root.innerHTML, /data-sd-select="tieDirection"/);
  directions.select("tieDirection", "tieLineExport");
  assert.match(directions.root.innerHTML, /value="800" data-sd-series="tieLineExport"/);
  directions.select("tieDirection", "tieLineImport");
  assert.match(directions.root.innerHTML, /value="1200" data-sd-series="tieLineImport"/);
  directions.chooseElement("load");
  directions.chooseElement("tieLine");
  assert.match(directions.root.innerHTML, /value="1200" data-sd-series="tieLineImport"/);
  directions.click("generate");
  const savedDirections = directions.openSavedPreview();
  assert.equal((savedDirections.match(/联络线送出/g) || []).length, 2, "both annual and typical saved views show direction");
  assert.match(savedDirections, /<td>-400\.00<\/td><td>800\.00<\/td><td>1,200\.00<\/td>/);

  const legacy = project("legacy");
  legacy.supplyDemand = { ...savedState(legacy), draft: completeConfig(legacy, 350000) };
  const legacyBefore = JSON.stringify(legacy), old = fixture(legacy);
  assert.match(old.root.innerHTML, /草稿待生成/);
  assert.match(old.root.innerHTML, /value="350000" data-sd-series="load"/);
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
  assert.match(conflict.root.innerHTML, /草稿待生成/);
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
  assert.match(races.root.innerHTML, /value="7000" data-sd-series="load"/);
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
