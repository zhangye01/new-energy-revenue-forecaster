"use strict";

const assert = require("node:assert/strict");
const { buildView } = require("../src/ui/forecast-results-view");

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
assert.doesNotMatch(empty, /演示|data-forecast-annual|<button|<input|<select/);

const result = buildView({ ...state, task });
assert.match(result, /年度现货均价（元\/MWh）/);
assert.match(result, /<th scope="row">2026<\/th><td>0\.00<\/td><td>150\.00<\/td><td class="forecast-result-missing">待返回<\/td>/);
assert.match(result, /<th scope="row">2027<\/th><td>-15\.20<\/td><td class="forecast-result-missing">待返回<\/td>/);
assert.match(result, /<th scope="row">2028<\/th>(<td class="forecast-result-missing">待返回<\/td>){3}/);
assert.doesNotMatch(result, /回测|MAPE/);
assert.match(result, /测算采用/);
assert.match(result, /&lt;img src=x/);
assert.doesNotMatch(result, /<img|2025|2029|345\.00|999\.00|演示|<button|<input|<select/);
assert.doesNotMatch(buildView({ ...state, project: { ...project, activeRunId: "other-run" }, task }), /测算采用/);
assert.doesNotMatch(buildView({ ...state, task, current: false }), /data-forecast-annual|已返回/);
assert.doesNotMatch(buildView({ ...state, task, serviceReady: false }), /data-forecast-annual|已返回/);
assert.doesNotMatch(buildView({ ...state, task: { ...task, status: "running" } }), /data-forecast-annual|已返回/);

const duplicates = { ...task, results: [task.results[0], { modelCode: "LSTM", annualPrices: { 2026: 75 } }] };
assert.doesNotMatch(buildView({ ...state, task: duplicates }), /data-forecast-annual|已返回/);
const sparseHourly = { ...task, results: [{ modelCode: "LSTM", pricesByYear: { 2026: Array(8760) } }] };
assert.doesNotMatch(buildView({ ...state, task: sparseHourly }), /data-forecast-annual|已返回/);

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
assert.doesNotMatch(history, />run-lstm</);
assert.equal(JSON.stringify(historyProject), before);

console.log("Forecast result view tests passed.");
