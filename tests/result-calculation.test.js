"use strict";

const assert = require("node:assert/strict");
const {
  validateCalculationReadiness,
  validateManualCompleteness
} = require("../src/domain/result-calculation");

function makeScenarioConfig(overrides = {}) {
  return {
    getLtPricingMode: (config) => config.ltPricingMode || "auto",
    getEnvValueMode: (config) => config.envValueMode || "global",
    getFeeConfigMode: (config) => config.feeConfigMode || "global",
    getLtManualCompleteness: () => ({ complete: 1, total: 2 }),
    getEnvManualCompleteness: () => ({ complete: 2, total: 2 }),
    getFeeManualCompleteness: () => ({ complete: 2, total: 2 }),
    ...overrides
  };
}

assert.deepEqual(
  validateCalculationReadiness(),
  { ok: false, message: "请先选择项目后再发起测算。" }
);
assert.deepEqual(
  validateCalculationReadiness({ project: {} }),
  { ok: false, message: "请先在全口径收入配置页保存至少一个配置方案。" }
);
assert.deepEqual(
  validateCalculationReadiness({ project: {}, scenario: { config: {} } }),
  { ok: false, message: "请先在电价预测工作台生成并生效一个电价版本。" }
);
assert.deepEqual(
  validateCalculationReadiness({
    project: {},
    scenario: { config: {} },
    run: {}
  }),
  { ok: true, message: "" }
);

assert.deepEqual(
  validateManualCompleteness({
    project: {},
    config: { ltPricingMode: "manual" },
    scenarioConfig: makeScenarioConfig()
  }),
  { ok: false, message: "请先导入完整的逐年交易策略损益值（当前 1/2 年）。" }
);
assert.deepEqual(
  validateManualCompleteness({
    project: {},
    config: { envValueMode: "manual" },
    scenarioConfig: makeScenarioConfig({
      getEnvManualCompleteness: () => ({ complete: 3, total: 4 })
    })
  }),
  { ok: false, message: "请先导入完整的逐年环境价值兑现配置（当前 3/4 年）。" }
);
assert.deepEqual(
  validateManualCompleteness({
    project: {},
    config: { feeConfigMode: "manual" },
    scenarioConfig: makeScenarioConfig({
      getFeeManualCompleteness: () => ({ complete: 0, total: 4 })
    })
  }),
  { ok: false, message: "请先导入完整的逐年扣费收益配置（当前 0/4 年）。" }
);
assert.deepEqual(
  validateManualCompleteness({
    project: {},
    config: {
      ltPricingMode: "manual",
      envValueMode: "manual",
      feeConfigMode: "manual"
    },
    scenarioConfig: makeScenarioConfig({
      getLtManualCompleteness: () => ({ complete: 2, total: 2 })
    })
  }),
  { ok: true, message: "" }
);

console.log("result calculation tests passed");
