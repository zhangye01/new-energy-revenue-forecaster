"use strict";
const assert = require("node:assert/strict");
const { prepareAppBootstrapSandbox, runAppBootstrapSmoke } = require("../scripts/app-bootstrap-smoke");
const { createBrowserSandbox } = require("../scripts/module-load-smoke");
const model = require("../src/domain/scenario-model");
const rough = require("../src/domain/rough-price");
const calculator = require("../src/domain/revenue-calculator");
(async () => {
  const sandbox = prepareAppBootstrapSandbox(createBrowserSandbox()); await runAppBootstrapSmoke({ sandbox });
  const p = { id: 'export-qa', name: '导出验收', ownerAccount: 'demo1', province: 'shandong', assetType: 'wind', siteType: 'onshore', capacityMw: 100, hasStorage: false, startYear: 2026, forecastYears: 1, activeRunId: 'run', energyData: { hourlyByYear: { 2026: Array(8760).fill(0.2) } }, resultsByScenario: {} };
  const sc = model.createBaselineScenario(p); p.scenarios = [sc]; p.activeScenarioId = sc.id;
  const run = { id: 'run', pricesByYear: { 2026: Array(8760).fill(300) } }; p.priceRuns = [run];
  const current = () => { p.resultsByScenario[sc.id] = rough.stampBaselineResult(p, sc, run, calculator.calculateScenarioResult(p, sc, run)); };
  current(); const state = sandbox.NE_RUNTIME.appState; state.auth = { loggedIn: true, account: 'demo1' }; state.projects = [p]; state.activeProjectId = p.id;
  const downloads = []; sandbox.downloadCsv = (name, rows) => downloads.push({ name, rows });
  sandbox.exportAnnualCsv(); sandbox.exportHourlyCsv(); assert.equal(downloads.length, 2);
  assert(downloads.every(({ rows }) => rows[0].includes('input_fingerprint')));
  for (const invalidate of [() => { sc.config.otherFee += 10; }, () => { p.activeRunId = 'another'; }, () => { delete p.resultsByScenario[sc.id].sourceContext; }, () => { p.resultsByScenario[sc.id].annualRows = []; }]) {
    sc.config.otherFee = 3; p.activeRunId = 'run'; current(); invalidate();
    sandbox.exportAnnualCsv(); sandbox.exportHourlyCsv(); sandbox.printScenarioReport();
    assert.equal(downloads.length, 2, 'stale/incomplete results must never export');
  }
  p.activeRunId = 'run'; current(); p.resultsByScenario[sc.id].hourlyPreview.pop(); sandbox.exportHourlyCsv();
  assert.equal(downloads.length, 2, 'incomplete hourly details must never export');
  console.log('result export integration tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
