"use strict";

(function () {
const PAGE_TITLES = {
  "home-page": "首页",
  "projects-page": "我的项目",
  "create-page": "项目创建",
  "energy-page": "结算电量配置",
  "history-page": "历史电价分析",
  "forecast-page": "电价预测工作台",
  "scenario-page": "全口径收入配置",
  "results-page": "基准结果总览",
  "compare-page": "多方案对比分析",
  "help-page": "帮助文档",
  "settings-page": "系统设置"
};

const PAGE_GROUPS = {
  "home-page": "平台概览",
  "projects-page": "平台概览",
  "create-page": "分析流程",
  "energy-page": "分析流程",
  "history-page": "分析流程",
  "forecast-page": "分析流程",
  "scenario-page": "分析流程",
  "results-page": "结果输出",
  "compare-page": "结果输出",
  "help-page": "支持中心",
  "settings-page": "支持中心"
};

const PAGE_HELP_TEXTS = {
  "home-page": {
    purpose: "用于快速校准地区政策与省份对标输入，明确测算边界。",
    meaning: "先看规则变化再建项目，可减少后续反复改参数。",
    guide: "先筛选区域和省份，再看电价对标，最后进入“我的项目”。"
  },
  "projects-page": {
    purpose: "用于集中管理场站项目清单。",
    meaning: "一个项目对应一个场站，是后续测算流程入口。",
    guide: "上方先进入新建项目工作区，下方查看当前账号历史项目；复制仅用于历史项目。"
  },
  "create-page": {
    purpose: "用于填写项目基础信息和预测区间。",
    meaning: "这里定义测算对象和未来周期范围。",
    guide: "先填名称、省份、类型、容量，再确认开始年份和预测周期。"
  },
  "energy-page": {
    purpose: "用于完成项目结算电量配置。",
    meaning: "先确定各年度总小时数，再确定典型曲线来源，系统据此生成测算周期内各年结算电量。",
    guide: "先导入逐年总量，再在“典型年8760模板”和“省份典型曲线”中二选一，完成后进入历史电价分析。"
  },
  "history-page": {
    purpose: "用于查看当前项目省份的历史现货电价展示与筛选结果。",
    meaning: "帮助判断所选日期区间内的价格水平、波动区间与日内特征，为后续电价预测提供参考。",
    guide: "本页会按项目省份自动展示15分钟历史现货样本，可通过“筛选日期”按日调整开始日期和结束日期。"
  },
  "forecast-page": {
    purpose: "用于管理电价算法版本与生效曲线。",
    meaning: "结果测算只使用生效版本，版本质量直接影响结果可信度。",
    guide: "先生成版本并看误差指标，再将目标版本设为生效，随后进入全口径收入配置。"
  },
  "scenario-page": {
    purpose: "用于配置全口径收入参数，并带入省份默认口径。",
    meaning: "同一项目可创建多套收入配置，用于敏感性和策略对比；省份参数库在本页内完成带入和微调。",
    guide: "先带入目标省份默认参数，再保存基准配置，最后复制配置做差异参数调整。"
  },
  "results-page": {
    purpose: "用于输出全口径收入测算结果。",
    meaning: "统一查看分项收入、年度结果和首年小时明细。",
    guide: "确保已导入电量且有生效电价版本，再点击“发起测算”。"
  },
  "compare-page": {
    purpose: "用于多场景结果横向对比。",
    meaning: "快速识别相对基准的核心收益驱动。",
    guide: "先在结果页完成各场景测算，再在本页比较差额与驱动项。"
  },
  "help-page": {
    purpose: "用于查看系统使用说明、模板口径、状态规则和常见问题。",
    meaning: "帮助业务人员和演示对象快速理解当前原型能做什么、该怎么用、出现拦截时应先检查什么。",
    guide: "建议先阅读推荐工作流，再按页面说明准备数据；遇到导入、状态或结果问题时优先查看本页FAQ。"
  },
  "settings-page": {
    purpose: "用于账号安全与界面偏好设置。",
    meaning: "保持账号可用和阅读体验稳定。",
    guide: "可在此修改密码、切换主题，并确认持久化状态。"
  }
};

const WORKFLOW_PAGES = [
  "create-page",
  "energy-page",
  "history-page",
  "forecast-page",
  "scenario-page",
  "results-page",
  "compare-page"
];

const REQUIRES_PROJECT = new Set([
  "energy-page",
  "history-page",
  "forecast-page",
  "scenario-page",
  "results-page",
  "compare-page"
]);

const REQUIRES_LOGIN = new Set([
  "projects-page",
  "create-page",
  "energy-page",
  "history-page",
  "forecast-page",
  "scenario-page",
  "results-page",
  "compare-page"
]);

const AUTH_STORAGE_KEY = "ne_auth_session_v1";
const SIDEBAR_GROUP_STORAGE_KEY_GUEST = "ne_sidebar_groups_guest_v1";
const SIDEBAR_GROUP_STORAGE_KEY_AUTH = "ne_sidebar_groups_auth_v1";
const THEME_SEQUENCE = ["light", "dark", "eye"];
const THEME_LABELS = {
  light: "浅色",
  dark: "深色",
  eye: "护眼"
};

const PROVINCES = [
  { key: "beijing", name: "北京" },
  { key: "tianjin", name: "天津" },
  { key: "hebei", name: "河北" },
  { key: "shanxi", name: "山西" },
  { key: "inner_mongolia", name: "内蒙古" },
  { key: "liaoning", name: "辽宁" },
  { key: "jilin", name: "吉林" },
  { key: "heilongjiang", name: "黑龙江" },
  { key: "shanghai", name: "上海" },
  { key: "jiangsu", name: "江苏" },
  { key: "zhejiang", name: "浙江" },
  { key: "anhui", name: "安徽" },
  { key: "fujian", name: "福建" },
  { key: "jiangxi", name: "江西" },
  { key: "shandong", name: "山东" },
  { key: "henan", name: "河南" },
  { key: "hubei", name: "湖北" },
  { key: "hunan", name: "湖南" },
  { key: "guangdong", name: "广东" },
  { key: "guangxi", name: "广西" },
  { key: "hainan", name: "海南" },
  { key: "chongqing", name: "重庆" },
  { key: "sichuan", name: "四川" },
  { key: "guizhou", name: "贵州" },
  { key: "yunnan", name: "云南" },
  { key: "tibet", name: "西藏" },
  { key: "shaanxi", name: "陕西" },
  { key: "gansu", name: "甘肃" },
  { key: "qinghai", name: "青海" },
  { key: "ningxia", name: "宁夏" },
  { key: "xinjiang", name: "新疆" }
];

const POLICY_REGIONS = [
  { key: "east", name: "华东" },
  { key: "north", name: "华北" },
  { key: "central", name: "华中" },
  { key: "south", name: "华南" },
  { key: "southwest", name: "西南" },
  { key: "northwest", name: "西北" },
  { key: "northeast", name: "东北" }
];

const PROVINCE_POLICY_REGION_MAP = {
  beijing: "north",
  tianjin: "north",
  hebei: "north",
  shanxi: "north",
  inner_mongolia: "north",
  liaoning: "northeast",
  jilin: "northeast",
  heilongjiang: "northeast",
  shanghai: "east",
  jiangsu: "east",
  zhejiang: "east",
  anhui: "east",
  fujian: "east",
  jiangxi: "east",
  shandong: "east",
  henan: "central",
  hubei: "central",
  hunan: "central",
  guangdong: "south",
  guangxi: "south",
  hainan: "south",
  chongqing: "southwest",
  sichuan: "southwest",
  guizhou: "southwest",
  yunnan: "southwest",
  tibet: "southwest",
  shaanxi: "northwest",
  gansu: "northwest",
  qinghai: "northwest",
  ningxia: "northwest",
  xinjiang: "northwest"
};

const PROVINCE_BENCHMARKS = {
  shandong: { historyPrice: 382, capturePrice: 356, mechanismState: "部分纳入", ancillaryFee: 18 },
  jiangsu: { historyPrice: 426, capturePrice: 397, mechanismState: "动态调整", ancillaryFee: 14 },
  guangdong: { historyPrice: 468, capturePrice: 433, mechanismState: "试点推进", ancillaryFee: 13 },
  inner_mongolia: { historyPrice: 318, capturePrice: 287, mechanismState: "高比例纳入", ancillaryFee: 22 },
  sichuan: { historyPrice: 356, capturePrice: 334, mechanismState: "阶段执行", ancillaryFee: 17 },
  xinjiang: { historyPrice: 288, capturePrice: 254, mechanismState: "逐步退出", ancillaryFee: 24 }
};

function getPolicyRegionName(regionKey) {
  return POLICY_REGIONS.find((region) => region.key === regionKey)?.name || "华东";
}

function resolvePolicyBenchmark(provinceKey) {
  const fallback = {
    historyPrice: 360,
    capturePrice: 332,
    mechanismState: "持续优化",
    ancillaryFee: 16
  };
  const source = PROVINCE_BENCHMARKS[provinceKey];
  if (!source) return fallback;
  return {
    historyPrice: Number.isFinite(Number(source.historyPrice)) ? Number(source.historyPrice) : fallback.historyPrice,
    capturePrice: Number.isFinite(Number(source.capturePrice)) ? Number(source.capturePrice) : fallback.capturePrice,
    mechanismState: source.mechanismState ? String(source.mechanismState) : fallback.mechanismState,
    ancillaryFee: Number.isFinite(Number(source.ancillaryFee)) ? Number(source.ancillaryFee) : fallback.ancillaryFee
  };
}

const POLICY_CARDS = PROVINCES.map((province, index) => {
  const regionKey = PROVINCE_POLICY_REGION_MAP[province.key] || "east";
  const regionName = getPolicyRegionName(regionKey);
  const bench = resolvePolicyBenchmark(province.key);
  const monthSeed = String((index % 9) + 1).padStart(2, "0");
  const daySeed = String((index % 27) + 1).padStart(2, "0");
  return {
    provinceKey: province.key,
    regionKey,
    regionName,
    title: `${province.name}地区政策与市场概览`,
    updatedAt: `2026-${monthSeed}-${daySeed}`,
    milestoneReview: `${province.name}电力市场已形成“中长期交易 + 现货结算 + 辅助服务”协同框架，当前建设阶段为${bench.mechanismState}。`,
    ruleSystemReview: `省内执行规则以交易组织、结算口径和并网考核三类细则为主，新能源项目按统一颗粒度进行月度校核与年度复盘。`,
    supplyPriceBrief: `供需总体平衡偏紧时段与新能源出力波动并存；历史均价约${bench.historyPrice.toFixed(1)}元/MWh，捕获均价约${bench.capturePrice.toFixed(1)}元/MWh，辅助服务折算约${bench.ancillaryFee.toFixed(1)}元/MWh。`
  };
});

const QUALITY_GATE = {
  hard: {
    mape: 0.15,
    smape: 0.18,
    missingPoints: 0
  },
  soft: {
    mae: 55,
    rmse: 80
  }
};

const PROVINCE_DEFAULT_PARAMS = {
  shandong: { mechanismEnabled: true, mechanismRatio: 0.42, mechanismPrice: 346, marketOpFee: 7, gridAssessFee: 8, ancillaryFee: 18, otherFee: 3, greenCertPrice: 20, greenPremiumPrice: 11, storageArbitragePrice: 16, storageCapacityCompPrice: 8, storageAncillaryRevenuePrice: 11, storageOtherRevenuePrice: 3 },
  jiangsu: { mechanismEnabled: true, mechanismRatio: 0.36, mechanismPrice: 365, marketOpFee: 6, gridAssessFee: 7, ancillaryFee: 14, otherFee: 3, greenCertPrice: 22, greenPremiumPrice: 12, storageArbitragePrice: 18, storageCapacityCompPrice: 7, storageAncillaryRevenuePrice: 10, storageOtherRevenuePrice: 3 },
  guangdong: { mechanismEnabled: true, mechanismRatio: 0.28, mechanismPrice: 388, marketOpFee: 6, gridAssessFee: 6, ancillaryFee: 13, otherFee: 2, greenCertPrice: 19, greenPremiumPrice: 14, storageArbitragePrice: 22, storageCapacityCompPrice: 9, storageAncillaryRevenuePrice: 13, storageOtherRevenuePrice: 4 },
  inner_mongolia: { mechanismEnabled: true, mechanismRatio: 0.53, mechanismPrice: 312, marketOpFee: 8, gridAssessFee: 9, ancillaryFee: 22, otherFee: 4, greenCertPrice: 15, greenPremiumPrice: 8, storageArbitragePrice: 12, storageCapacityCompPrice: 10, storageAncillaryRevenuePrice: 14, storageOtherRevenuePrice: 4 },
  sichuan: { mechanismEnabled: true, mechanismRatio: 0.34, mechanismPrice: 332, marketOpFee: 6, gridAssessFee: 8, ancillaryFee: 17, otherFee: 3, greenCertPrice: 18, greenPremiumPrice: 10, storageArbitragePrice: 15, storageCapacityCompPrice: 8, storageAncillaryRevenuePrice: 12, storageOtherRevenuePrice: 3 },
  xinjiang: { mechanismEnabled: false, mechanismRatio: 0.12, mechanismPrice: 282, marketOpFee: 9, gridAssessFee: 10, ancillaryFee: 24, otherFee: 4, greenCertPrice: 13, greenPremiumPrice: 7, storageArbitragePrice: 10, storageCapacityCompPrice: 11, storageAncillaryRevenuePrice: 15, storageOtherRevenuePrice: 5 }
};

const BATCH_PARAM_SPECS = {
  mechanismRatio: { label: "机制电量占比(%)", type: "percent", min: 0, max: 100 },
  mechanismPrice: { label: "机制电价(元/MWh)", type: "number", min: 0, max: 2000 },
  ltYear1Pnl: { label: "交易策略首年损益(元/MWh)", type: "number", min: -1000, max: 1000 },
  ltTargetPnl: { label: "交易策略收敛目标(元/MWh)", type: "number", min: -1000, max: 1000 },
  ltConvergeSpeed: { label: "年收敛步长(元/MWh/年)", type: "number", min: 0, max: 2000 },
  greenCertPrice: { label: "绿证价格(元/MWh)", type: "number", min: 0, max: 2000 },
  greenCertRealizeRatio: { label: "绿证兑现空间占比(%)", type: "percent", min: 0, max: 100 },
  greenPremiumPrice: { label: "绿电溢价(元/MWh)", type: "number", min: 0, max: 2000 },
  greenPremiumRealizeRatio: { label: "绿电溢价兑现空间占比(%)", type: "percent", min: 0, max: 100 },
  carbonPrice: { label: "碳收益(元/MWh)", type: "number", min: 0, max: 2000 },
  carbonRealizeRatio: { label: "碳收益兑现空间占比(%)", type: "percent", min: 0, max: 100 },
  marketOpFee: { label: "市场运营费(元/MWh)", type: "number", min: 0, max: 2000 },
  gridAssessFee: { label: "并网考核费(元/MWh)", type: "number", min: 0, max: 2000 },
  ancillaryFee: { label: "辅助服务费(元/MWh)", type: "number", min: 0, max: 2000 },
  otherFee: { label: "其他费用(元/MWh)", type: "number", min: 0, max: 2000 },
  otherIncome: { label: "其他收入(元/MWh)", type: "number", min: 0, max: 2000 },
  storageArbitragePrice: { label: "现货价差套利(元/MWh)", type: "number", min: 0, max: 2000 },
  storageCapacityCompPrice: { label: "容量补偿收益(元/MWh)", type: "number", min: 0, max: 2000 },
  storageAncillaryRevenuePrice: { label: "配储辅助服务收益(元/MWh)", type: "number", min: 0, max: 2000 },
  storageOtherRevenuePrice: { label: "其他配储收益(元/MWh)", type: "number", min: 0, max: 2000 }
};

window.NE_CONFIG = {
  PAGE_TITLES,
  PAGE_GROUPS,
  PAGE_HELP_TEXTS,
  WORKFLOW_PAGES,
  REQUIRES_PROJECT,
  REQUIRES_LOGIN,
  AUTH_STORAGE_KEY,
  SIDEBAR_GROUP_STORAGE_KEY_GUEST,
  SIDEBAR_GROUP_STORAGE_KEY_AUTH,
  THEME_SEQUENCE,
  THEME_LABELS,
  PROVINCES,
  POLICY_REGIONS,
  PROVINCE_BENCHMARKS,
  POLICY_CARDS,
  QUALITY_GATE,
  PROVINCE_DEFAULT_PARAMS,
  BATCH_PARAM_SPECS
};
})();
