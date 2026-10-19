"use strict";

(function () {
const PAGE_TITLES = {
  "home-page": "首页",
  "projects-page": "我的项目",
  "create-page": "项目创建",
  "energy-page": "结算电量配置",
  "rough-page": "项目电价粗算",
  "history-page": "历史电价分析",
  "forecast-page": "电价预测工作台",
  "scenario-page": "收益参数补充与细化",
  "results-page": "基准结果总览",
  "validation-page": "交叉验证",
  "compare-page": "多方案对比分析",
  "help-page": "帮助文档",
  "settings-page": "系统设置"
};

const PAGE_GROUPS = {
  "home-page": "平台概览",
  "projects-page": "平台概览",
  "create-page": "分析流程",
  "energy-page": "分析流程",
  "rough-page": "分析流程",
  "history-page": "分析流程",
  "forecast-page": "分析流程",
  "scenario-page": "分析流程",
  "results-page": "结果输出",
  "validation-page": "结果输出",
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
    guide: "先导入逐年总量，再在“典型年8760模板”和“省份典型曲线”中二选一，完成后进入项目电价粗算。"
  },
  "rough-page": {
    purpose: "用于保存项目电价的初步预期。",
    meaning: "自动沿用前面已录入的项目与电量信息；已确认结算参数直接带入，未确认参数在本页补充。",
    guide: "填写年度现货均价预期、捕获率及待确认参数，保存粗算版本，再继续历史电价分析与电价预测。"
  },
  "history-page": {
    purpose: "用于查看当前项目省份的历史现货电价展示与筛选结果。",
    meaning: "帮助判断所选日期区间内的价格水平、波动区间与日内特征，为后续电价预测提供参考。",
    guide: "本页会按项目省份自动展示15分钟历史现货样本，可通过“筛选日期”按日调整开始日期和结束日期。"
  },
  "forecast-page": {
    purpose: "用于生成与管理现货电价预测曲线。",
    meaning: "现货电价预测与收益参数补充与细化共同构成精算，最终结果在基准结果总览中展示。",
    guide: "生成预测版本、检查质量指标并选择生效曲线，再进入收益参数补充与细化。"
  },
  "scenario-page": {
    purpose: "用于补充粗算中的默认值、未填项，并细化初步收益参数。",
    meaning: "已确认参数自动带入并收起；补充与细化后的参数参与基准测算，原粗算快照保留。",
    guide: "优先处理待补充、待确认项，必要时展开已确认项细化，保存后重新生成基准结果。"
  },
  "results-page": {
    purpose: "用于输出全口径收入测算结果。",
    meaning: "统一查看分项收入、年度结果和首年小时明细。",
    guide: "确保已导入电量且有生效电价版本，再点击“发起测算”。"
  },
  "validation-page": {
    purpose: "用于比较先前的粗算预期与基准结果。",
    meaning: "查看整体及逐年的电价偏差，识别明显差异；偏差提示表示与预期的一致程度。",
    guide: "选择原粗算版本，对照细化后保存的基准结果；收益参数变化只需重算基准，项目、测算期或电量变化时需更新粗算。"
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
    purpose: "用于查看演示账号、界面偏好和本地备份。",
    meaning: "查看保存状态并备份项目输入与计算快照。",
    guide: "可在此切换主题、下载或恢复项目备份；演示账号不支持修改密码。"
  }
};

const WORKFLOW_PAGES = [
  "create-page",
  "energy-page",
  "rough-page",
  "history-page",
  "forecast-page",
  "scenario-page",
  "results-page",
  "validation-page",
  "compare-page"
];

const REQUIRES_PROJECT = new Set([
  "energy-page",
  "rough-page",
  "history-page",
  "forecast-page",
  "scenario-page",
  "results-page",
  "validation-page",
  "compare-page"
]);

const REQUIRES_LOGIN = new Set([
  "projects-page",
  "create-page",
  "energy-page",
  "rough-page",
  "history-page",
  "forecast-page",
  "scenario-page",
  "results-page",
  "validation-page",
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

const POLICY_CARDS = PROVINCES.map((province) => {
  const regionKey = PROVINCE_POLICY_REGION_MAP[province.key] || "east";
  const regionName = getPolicyRegionName(regionKey);
  const bench = resolvePolicyBenchmark(province.key);
  return {
    provinceKey: province.key,
    regionKey,
    regionName,
    title: `${province.name}地区政策与市场概览`,
    updatedAt: "演示样例 · 未核验",
    milestoneReview: "待补充官方市场建设进程与实施日期。",
    ruleSystemReview: "待补充省级规则原文、适用范围与核验日期。",
    supplyPriceBrief: `演示假设：均价约${bench.historyPrice.toFixed(1)}元/MWh，捕获均价约${bench.capturePrice.toFixed(1)}元/MWh，辅助服务折算约${bench.ancillaryFee.toFixed(1)}元/MWh。`
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

const OVERVIEW_POLICY_DETAILS = [
  {
    title: "政策卡1：新一轮电改顶层设计",
    policyName: "关于进一步深化电力体制改革的若干意见",
    docNo: "中发〔2015〕9号",
    position: "新一轮电力市场化改革总纲领、根本遵循。",
    highlights: [
      "确立“管住中间、放开两头”总体思路。",
      "放开竞争性环节电价、放开发用电计划。",
      "推进配售电业务放开、交易机构独立规范运行。",
      "还原电力商品属性，构建有效竞争市场结构。"
    ],
    meaning: "打破统购统销模式，开启电力市场化全新时代。"
  },
  {
    title: "政策卡2：全国统一电力市场体系建设",
    policyName: "关于加快建设全国统一电力市场体系的指导意见",
    docNo: "发改体改〔2022〕118号",
    position: "从分散试点走向全国一体化的里程碑文件。",
    highlights: [
      "构建国家—区域—省三级电力市场体系。",
      "破除省间壁垒，推进跨省跨区优化配置。",
      "统一交易规则、计量标准、技术支撑。",
      "明确2025/2030年市场化电量占比目标。"
    ],
    meaning: "实现大范围资源优化，支撑新能源跨省消纳。"
  },
  {
    title: "政策卡3：电力现货市场顶层规则",
    policyName: "电力现货市场基本规则（试行）",
    docNo: "发改能源规〔2023〕1217号",
    position: "电力市场价格发现与实时平衡核心制度。",
    highlights: [
      "统一全国现货市场模式、出清与结算机制。",
      "规范中长期与现货衔接、新能源入市方式。",
      "明确储能、虚拟电厂等主体参与规则。",
      "推动2025年底前现货市场全覆盖连续运行。"
    ],
    meaning: "实现分时电价、精准供需匹配，市场进入精细化运行。"
  },
  {
    title: "政策卡4：新型电力系统调节保障",
    policyName: "电力辅助服务市场基本规则",
    docNo: "发改能源规〔2025〕411号",
    position: "高比例新能源下电网安全稳定的市场化支撑。",
    highlights: [
      "规范调峰、调频、备用、爬坡等有功辅助服务品种。",
      "落实“谁受益、谁承担，谁提供、谁获利”。",
      "支持储能、负荷聚合商、虚拟电厂广泛参与。",
      "推动电能量与辅助服务联合优化出清。"
    ],
    meaning: "激活灵活性资源，保障新型电力系统安全运行。"
  },
  {
    title: "政策卡5：绿色转型与市场深化实施",
    policyName: "关于完善全国统一电力市场体系的实施意见",
    docNo: "国办发〔2026〕4号",
    position: "面向新型电力系统的市场机制升级版施工图。",
    highlights: [
      "明确2030年基本建成、2035年全面建成统一市场。",
      "完善容量成本回收、用户侧响应机制。",
      "强化跨省互济、新能源全额保障消纳。",
      "统筹能源安全、绿色转型与市场化改革。"
    ],
    meaning: "适配高比例新能源格局，完善市场化长效机制。"
  }
];

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
  OVERVIEW_POLICY_DETAILS,
  QUALITY_GATE,
  PROVINCE_DEFAULT_PARAMS,
  BATCH_PARAM_SPECS
};
})();
