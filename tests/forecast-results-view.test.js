"use strict";

const assert = require("node:assert/strict");
const forecastView = require("../src/ui/forecast-results-view");
const buildView = (state) => forecastView.buildView(state).html;

function legendCodes(html) {
  return Array.from(html.matchAll(/data-forecast-legend="([a-z]+)"/g), ([, code]) => code);
}

const project = Object.freeze({ id: "forecast-test", startYear: 2026, forecastYears: 3, activeRunId: "run-lstm" });
const state = { project, current: true, serviceReady: true };
const task = {
  status: "succeeded",
  results: [
    { modelCode: "lstm", runId: "run-lstm", algorithmVersion: '<img src=x onerror="alert(1)">',
      annualPrices: { 2025: 888, 2026: 0, 2027: -15.2, 2028: "", 2029: 999 }, metrics: { mape: 0.1234 } },
    { algorithmFamily: "XGBoost", pricesByYear: { 2026: Array(8760).fill(150), 2027: Array(8759).fill(345), 2028: Array(8760).fill(null) } },
    { modelCode: "unsupported", annualPrices: { 2026: 999 } },
    { modelCode: "ensemble", executionKind: "demo_model", annualPrices: { 2026: 999 } }
  ]
};

const empty = buildView(state);
assert.deepEqual(Array.from(empty.matchAll(/data-forecast-model="([a-z]+)"/g), ([, code]) => code), ["lstm", "xgboost", "ensemble"]);
assert.equal((empty.match(/待返回/g) || []).length, 3);
assert.doesNotMatch(empty, /演示|data-forecast-annual|data-forecast-chart|<button|<input|<select/);
assert.equal(forecastView.buildView(state).chart, null);

const result = buildView({ ...state, task });
assert.match(result, /年度现货均价（元\/MWh）/);
assert.match(result, /<th scope="row">2026<\/th><td>0\.00<\/td><td>150\.00<\/td><td class="forecast-result-missing">待返回<\/td>/);
assert.match(result, /<th scope="row">2027<\/th><td>-15\.20<\/td><td class="forecast-result-missing">待返回<\/td>/);
assert.match(result, /<th scope="row">2028<\/th>(<td class="forecast-result-missing">待返回<\/td>){3}/);
assert.doesNotMatch(result, /回测|MAPE/);
assert.doesNotMatch(result, /测算采用/, "unpublished returns never claim a selected price");
assert.match(result, /&lt;img src=x/);
assert.doesNotMatch(result, /<img|2025|2029|345\.00|999\.00|演示|<input|<select/);
assert.match(result, /data-forecast-chart[\s\S]+data-forecast-annual/);
assert.deepEqual(legendCodes(result), ["lstm", "xgboost"]);
assert.deepEqual(forecastView.buildView({ ...state, task }).chart, { years: [2026, 2027, 2028], series: [
  { code: "lstm", label: "LSTM", prices: [0, -15.2, null] },
  { code: "xgboost", label: "XGBoost", prices: [150, null, null] }
] });
assert.doesNotMatch(buildView({ ...state, project: { ...project, activeRunId: "other-run" }, task }), /测算采用/);
assert.doesNotMatch(buildView({ ...state, task, current: false }), /data-forecast-annual|结果可查看/);
assert.doesNotMatch(buildView({ ...state, task, serviceReady: false }), /data-forecast-annual|结果可查看/);
assert.doesNotMatch(buildView({ ...state, task: { ...task, status: "running" } }), /data-forecast-annual|结果可查看/);

const duplicates = { ...task, results: [task.results[0], { modelCode: "LSTM", annualPrices: { 2026: 75 } }] };
assert.doesNotMatch(buildView({ ...state, task: duplicates }), /data-forecast-annual|结果可查看/);
const sparseHourly = { ...task, results: [{ modelCode: "LSTM", pricesByYear: { 2026: Array(8760) } }] };
assert.doesNotMatch(buildView({ ...state, task: sparseHourly }), /data-forecast-annual|结果可查看/);

const runs = Object.freeze([
  Object.freeze({ id: "legacy<&>", algorithmFamily: "LSTM", supplyDemandInput: Object.freeze({ featureConsumption: "not_used_by_demo_model" }) }),
  Object.freeze({ id: "real-run", algorithmFamily: "xgboost", executionKind: "real_model" }),
  Object.freeze({ id: "unverified", algorithmName: "其他模型" }),
  Object.freeze({ id: "run-lstm", algorithmFamily: "lstm", executionKind: "real_model" })
]);
const historyProject = Object.freeze({ ...project, priceRuns: runs });
const before = JSON.stringify(historyProject);
const history = buildView({ ...state, project: historyProject, task });
assert.match(history, /<details class="forecast-result-history" data-forecast-history>\s*<summary>历史预测记录/);
assert.match(history, /<th scope="row">LSTM<\/th><td>历史模拟曲线<\/td>.*legacy&lt;&amp;&gt;/);
assert.match(history, /<th scope="row">XGBoost<\/th><td>后台算法<\/td>/);
assert.match(history, /<th scope="row">其他模型<\/th><td>来源待核对<\/td>/);
assert.match(history, />run-lstm</, "unpublished returns cannot hide a stored record that shares its ID");
assert.equal(JSON.stringify(historyProject), before);

function makeCaseRun(algorithmFamily, price) {
  const pricesByYear = Object.fromEntries([2026, 2027, 2028].map((year) =>
    [year, Object.freeze(Array(8760).fill(price))]));
  return Object.freeze({
    id: `case-${algorithmFamily}`,
    algorithmFamily,
    executionKind: "demo_simulation",
    algorithmVersion: "synthetic-case",
    pricesByYear: Object.freeze(pricesByYear)
  });
}

function modelCards(html) {
  return Array.from(html.matchAll(/<article[^>]*data-forecast-model="([a-z]+)"[^>]*>([\s\S]*?)<\/article>/g),
    ([, code, contents]) => [code, contents]);
}

const caseRuns = Object.freeze([
  makeCaseRun("lstm", -8.5), makeCaseRun("xgboost", 0), makeCaseRun("ensemble", 272.25)
]);
const caseProject = Object.freeze({
  ...project, activeRunId: "case-ensemble", priceRuns: Object.freeze([...runs, ...caseRuns])
});
const caseState = { project: caseProject, current: false, serviceReady: false, caseRuns };
const caseView = buildView(caseState);
const caseCards = modelCards(caseView);
assert.deepEqual(caseCards.map(([code]) => code), ["lstm", "xgboost", "ensemble"]);
for (const [code, contents] of caseCards) {
  assert.match(contents, /案例价源/, `${code} is explicitly labelled as a case price source`);
  assert.doesNotMatch(contents, /结果可查看/, `${code} is not a backend response`);
  assert.equal(contents.includes("测算采用"), code === "ensemble");
}
assert.match(caseView, /<table\b[^>]*data-forecast-annual/);
assert.match(caseView, /<th scope="row">2026<\/th><td>-8\.50<\/td><td>0\.00<\/td><td>272\.25<\/td>/);
assert.match(caseView, /<th scope="row">2028<\/th><td>-8\.50<\/td><td>0\.00<\/td><td>272\.25<\/td>/);
assert.match(caseView, /data-forecast-history[\s\S]*legacy&lt;&amp;&gt;/);
assert.doesNotMatch(caseView, />case-(lstm|xgboost|ensemble)</, "shown case prices should not be repeated in archive rows");
assert.deepEqual(legendCodes(caseView), ["lstm", "xgboost", "ensemble"]);
assert.doesNotMatch(caseView, /<input|<select/);

const incompleteCaseRun = { ...caseRuns[2], pricesByYear: { 2026: Array(8759).fill(272.25) } };
const partialCase = buildView({ ...caseState, caseRuns: [caseRuns[0], incompleteCaseRun] });
assert.match(partialCase, /<th scope="row">2026<\/th><td>-8\.50<\/td>/);
assert.deepEqual(modelCards(partialCase).filter(([, contents]) => contents.includes("案例价源")).map(([code]) => code),
  ["lstm"], "only an available case model gets the label");
assert.doesNotMatch(partialCase, /测算采用/);
assert.match(partialCase, />case-ensemble</, "saved case models that are not displayed remain in the archive");
assert.deepEqual(legendCodes(partialCase), ["lstm"]);

const liveOverCase = buildView({ ...state, project: caseProject, caseRuns, task });
assert.match(liveOverCase, /结果可查看/);
assert.doesNotMatch(liveOverCase, /案例价源|272\.25|-8\.50/);
assert.match(liveOverCase, /<th scope="row">2026<\/th><td>0\.00<\/td><td>150\.00<\/td><td class="forecast-result-missing">待返回<\/td>/);

const publishedRuns = [{ ...runs[3], backendTaskId: "task-published", pricesByYear: { 2026: Array(8760).fill(-11) },
  annualPrices: { 2026: 777 } }];
const restoredView = buildView({ ...state, serviceReady: false, phase: "unavailable", project: historyProject, publishedRuns });
assert.match(restoredView, /forecast-result-annual" tabindex="0" aria-label="年度现货均价"/);
assert.match(restoredView, /-11\.00/);
assert.doesNotMatch(restoredView, /777\.00|>run-lstm</);
assert.match(restoredView, /测算采用/);
const sameTaskView = buildView({ ...state, project: historyProject, publishedRuns, task: { ...task, id: "task-published" } });
assert.match(sameTaskView, /-11\.00|测算采用/);
assert.doesNotMatch(sameTaskView, /150\.00/);
const laterTaskView = buildView({ ...state, project: historyProject, publishedRuns, task: { ...task, id: "task-later" } });
assert.match(laterTaskView, /150\.00/);
assert.doesNotMatch(laterTaskView, /-11\.00|测算采用/);

const inconsistent = { ...task, results: [{ modelCode: "lstm", runId: "bad-native", priceUnit: "CNY/kWh",
  pricesByYear: { 2026: Array(8760).fill(450) }, annualPrices: { 2026: 999 } }] };
assert.doesNotMatch(buildView({ ...state, task: inconsistent }), /data-forecast-annual|结果可查看/);
const invalidNative = { ...inconsistent.results[0], priceUnit: "CNY/MWh", pricesByYear: { 2026: Array(8759).fill(450) } };
assert.doesNotMatch(buildView({ ...state, task: { ...task, results: [invalidNative] } }), /data-forecast-annual|结果可查看/);
for (const [phase, label] of [["ready", "待提交"], ["input-required", "待提交"], ["pending", "待返回"], ["failed", "未返回"], ["completed", "未返回"]]) {
  assert.equal(modelCards(buildView({ project, phase })).filter(([, content]) => content.includes(label)).length, 3);
}

console.log("Forecast result view tests passed.");
