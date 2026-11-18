"use strict";

const assert = require("node:assert/strict");
const {
  buildMissingCurveMessage,
  formatYearListCompact,
  validateSavedEnergy,
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
  { ok: false, message: "请先在收益参数补充与细化页保存至少一个配置方案。" }
);
assert.deepEqual(
  validateCalculationReadiness({ project: {}, scenario: { config: {} } }),
  { ok: false, message: "请先在电价预测工作台生成并生效一个电价版本。" }
);
const savedProject = { startYear: 2026, forecastYears: 2,
  energyData: { hourlyByYear: { 2026: Array(8760).fill(0.2), 2027: Array(8760).fill(0.19) } } };
const readyInput = { project: savedProject, scenario: { config: {} }, run: {}, scenarioConfirmed: true };
assert.deepEqual(validateCalculationReadiness(readyInput), { ok: true, message: "" });
assert.deepEqual(validateSavedEnergy(savedProject), { ok: true, message: "" },
  "旧版直接导入的完整8760数据不依赖典型曲线元数据");
for (const scenarioConfirmed of [undefined, false, 1, "true"]) {
  const result = validateCalculationReadiness({ ...readyInput, scenarioConfirmed });
  assert.equal(result.ok, false, "正式测算必须明确确认全部适用参数");
  assert.match(result.message, /确认并保存全部适用参数/);
}
for (const corrupt of [
  (project) => { delete project.energyData.hourlyByYear[2027]; },
  (project) => { project.energyData.hourlyByYear[2027].pop(); },
  (project) => { delete project.energyData.hourlyByYear[2027][17]; },
  (project) => { project.energyData.hourlyByYear[2027][17] = -1; },
  (project) => { project.energyData.hourlyByYear[2027][17] = NaN; },
  (project) => { project.energyData.hourlyByYear[2027][17] = "0.2"; }
]) {
  const project = structuredClone(savedProject);
  corrupt(project);
  const before = structuredClone(project);
  const result = validateCalculationReadiness({ ...readyInput, project });
  assert.equal(result.ok, false);
  assert.match(result.message, /当前 1\/2 年/);
  assert.deepEqual(project, before, "前置校验不得填补、归一化或修复电量输入");
}
const onlyAnnualInput = { startYear: 2026, forecastYears: 2,
  energyData: { annualInputByYear: { 2026: 1700, 2027: 1650 }, typicalCurveProfile: Array(8760).fill(1 / 8760) } };
assert.match(validateCalculationReadiness({ ...readyInput, project: onlyAnnualInput }).message, /当前 0\/2 年/,
  "年度数值和典型曲线须先在电量页保存为完整逐年曲线");

const scenarioModel = require("../src/domain/scenario-model");
const scenarioForm = require("../src/ui/scenario-form");
const confirmationProject = { ...savedProject, province: "jiangsu", assetType: "wind", siteType: "onshore", hasStorage: true };
const confirmationScenario = scenarioModel.createBaselineScenario(confirmationProject);
const confirmation = () => {
  const state = scenarioForm.buildRefinementState({ project: confirmationProject, scenario: confirmationScenario });
  return state.total > 0 && state.confirmed === state.total;
};
assert.equal(validateCalculationReadiness({ ...readyInput, project: confirmationProject,
  scenario: confirmationScenario, scenarioConfirmed: confirmation() }).ok, false, "预填参数不等于确认");
confirmationScenario.config.storageRoundTripEfficiency = 0.9;
scenarioModel.confirmConfig(confirmationScenario);
delete confirmationScenario.confirmedConfig.storageArbitragePrice;
assert.equal(validateCalculationReadiness({ ...readyInput, project: confirmationProject,
  scenario: confirmationScenario, scenarioConfirmed: confirmation() }).ok, true, "只读历史储能套利值无需确认");
confirmationScenario.config.otherFee += 1;
assert.equal(validateCalculationReadiness({ ...readyInput, project: confirmationProject,
  scenario: confirmationScenario, scenarioConfirmed: confirmation() }).ok, false, "修改已确认参数后需要重新保存确认");

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

assert.equal(formatYearListCompact([2026, 2027, 2029, 2031, 2032]), "2026-2027、2029、2031-2032");
assert.equal(
  buildMissingCurveMessage({
    missingYears: [2026, 2027, 2028],
    missingEnergyYears: [2026, 2027],
    missingPriceYears: [2028]
  }),
  "测算失败：缺失上网电量曲线：2026-2027；缺失生效电价曲线：2028"
);
assert.equal(
  buildMissingCurveMessage({ missingYears: [2030, 2031], missingEnergyYears: [], missingPriceYears: [] }),
  "测算失败：缺失年份：2030-2031"
);
assert.equal(buildMissingCurveMessage({ missingYears: [] }), "");

console.log("result calculation tests passed");
