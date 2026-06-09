# 字段字典 V1（业务层）

## 1. 项目基础信息

| 字段 | 英文字段名 | 类型 | 单位 | 必填 | 约束/取值 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 项目ID | id | string | - | 是 | 系统生成，唯一 | 一个项目对应一个场站 |
| 项目名称 | name | string | - | 是 | 非空，建议唯一 | 展示名 |
| 省份 | province | enum | - | 是 | 全国省级枚举 | 用于省份参数和规则映射 |
| 项目类型 | assetType | enum | - | 是 | `wind`/`photovoltaic` | 风电/光伏 |
| 场站类型 | siteType | enum | - | 是 | `onshore`/`offshore` | 陆上/海上 |
| 是否配储 | hasStorage | boolean | - | 是 | true/false | 当前只做标签维度 |
| 装机容量 | capacityMw | number | MW | 是 | >0 | 参与小时电量换算 |
| 开始年份 | startYear | integer | 年 | 是 | >=2026 | 预测起始年 |
| 预测周期 | forecastYears | integer | 年 | 是 | 1-30 | 默认 30 |
| 电量输入模式 | energyMode | enum | - | 是 | `hourly_8760`/`annual_hours` | 输入口径 |
| 备注 | note | string | - | 否 | 文本 | 业务补充说明 |

## 2. 电量输入字段

## 2.1 8760 模板

| 字段 | 英文字段名 | 类型 | 单位 | 必填 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 年份 | year | integer | 年 | 是 | 在预测周期内 | 与项目周期一致 |
| 小时索引 | hour_index | integer | - | 是 | 1-8760 | 每年必须完整 8760 点 |
| 等效小时数 | equivalent_hours_h | number | h | 是 | >=0 | 与容量相乘得到小时电量 |

## 2.2 逐年小时模板

| 字段 | 英文字段名 | 类型 | 单位 | 必填 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 年份 | year | integer | 年 | 是 | 在预测周期内 | 唯一 |
| 年总小时数 | annual_hours_h | number | h | 是 | >0 | 系统拆解为 8760 |

## 3. 电价预测版本字段

| 字段 | 英文字段名 | 类型 | 单位 | 必填 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 运行ID | run_id | string | - | 是 | 系统生成 | 版本主键 |
| 算法类型 | algorithmFamily | enum | - | 是 | `lstm`/`xgboost`/`ensemble` | 算法族 |
| 算法版本 | algorithmVersion | string | - | 是 | 非空 | 业务可读版本 |
| 特征版本 | featureVersion | string | - | 是 | 非空 | 特征集版本 |
| 数据快照ID | dataSnapshotId | string | - | 是 | 非空 | 训练数据快照标识 |
| 训练窗口起始 | trainStart | integer | 年 | 是 | <= trainEnd | |
| 训练窗口结束 | trainEnd | integer | 年 | 是 | >= trainStart | |
| MAPE | mape | number | - | 是 | 0-1 | 质量指标 |
| sMAPE | smape | number | - | 是 | 0-1 | 质量指标 |
| MAE | mae | number | 元/MWh | 是 | >=0 | 质量指标 |
| RMSE | rmse | number | 元/MWh | 是 | >=0 | 质量指标 |
| 状态 | status | enum | - | 是 | validated/publishable/publishable_warn/publishable_forced | 可生效规则依赖状态 |
| 生效标记 | activeRunId | string | - | 否 | run_id | 当前生效版本 |

## 4. 场景配置字段

| 字段 | 英文字段名 | 类型 | 单位 | 必填 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 场景ID | id | string | - | 是 | 系统生成 | 场景主键 |
| 场景名称 | name | string | - | 是 | 同项目内唯一 | |
| 是否基准场景 | isBaseline | boolean | - | 是 | 唯一 true | |
| 是否锁定 | locked | boolean | - | 是 | true/false | 锁定后禁改 |
| 纳入机制 | mechanismEnabled | boolean | - | 是 | true/false | |
| 机制电量占比 | mechanismRatio | number | % | 是 | 0-100 | 年有效占比按月折算 |
| 机制电价 | mechanismPrice | number | 元/MWh | 是 | >=0 | |
| 机制执行起始年月 | mechanismStartYm | string | YYYY-MM | 条件必填 | 起<=止 | 机制开启时必填 |
| 机制执行结束年月 | mechanismEndYm | string | YYYY-MM | 条件必填 | 终>=起 | |
| 交易策略首年损益 | ltYear1Pnl | number | 元/MWh | 是 | 可负值 | |
| 交易策略目标损益 | ltTargetPnl | number | 元/MWh | 是 | 可负值 | |
| 年收敛步长 | ltConvergeSpeed | number | 元/MWh/年 | 是 | >=0 | 按固定步长逐年向目标值收敛 |
| 环境价值配置方式 | envValueMode | enum | - | 是 | global/manual | 全周期统一或逐年导入 |
| 逐年环境价值配置 | envManualValuesByYear | object | - | 条件必填 | 按测算年份完整 | 手工导入时使用 |
| 绿证价格 | greenCertPrice | number | 元/MWh | 是 | >=0 | |
| 绿证兑现空间占比 | greenCertRealizeRatio | number | % | 是 | 0-100 | 占市场化交易电量空间 |
| 绿电溢价 | greenPremiumPrice | number | 元/MWh | 是 | >=0 | |
| 绿电溢价兑现空间占比 | greenPremiumRealizeRatio | number | % | 是 | 0-100 | 占市场化交易电量空间 |
| 碳收益启用 | carbonEnabled | boolean | - | 是 | 海上可 true | 陆上固定 false |
| 碳收益价格 | carbonPrice | number | 元/MWh | 条件必填 | >=0 | 海上且启用时生效 |
| 碳收益兑现空间占比 | carbonRealizeRatio | number | % | 条件必填 | 0-100 | 海上且启用时生效，三条路径合计<=100 |
| 扣费收益配置方式 | feeConfigMode | enum | - | 是 | global/manual | 全周期统一或逐年导入 |
| 逐年扣费收益配置 | feeManualValuesByYear | object | - | 条件必填 | 按测算年份完整 | 手工导入时使用 |
| 市场运营费 | marketOpFee | number | 元/MWh | 是 | >=0 | |
| 并网考核费 | gridAssessFee | number | 元/MWh | 是 | >=0 | |
| 辅助服务费 | ancillaryFee | number | 元/MWh | 是 | >=0 | 固定度电费用 |
| 其他费用 | otherFee | number | 元/MWh | 是 | >=0 | V1 为聚合字段 |
| 其他收入 | otherIncome | number | 元/MWh | 是 | >=0 | |

## 5. 年度结果字段

| 字段 | 英文字段名 | 类型 | 单位 | 说明 |
| --- | --- | --- | --- | --- |
| 年份 | year | integer | 年 | |
| 年利用小时 | annualHours | number | h | |
| 上网电量 | energyMwh | number | MWh | |
| 现货均价 | spotAvgPrice | number | 元/MWh | |
| 捕获电价 | capturePrice | number | 元/MWh | |
| 捕获价差 | captureSpread | number | 元/MWh | 捕获电价-现货均价 |
| 现货收入 | spotRevenue | number | 元 | |
| 机制占比(有效) | mechanismRatio | number | % | 已按月折算 |
| 差价机制收入 | mechanismRevenue | number | 元 | |
| 非机制电量 | nonMechanismEnergy | number | MWh | |
| 交易策略度电损益 | ltPnlPrice | number | 元/MWh | |
| 交易策略损益 | ltPnlRevenue | number | 元 | |
| 环境价值收入 | envRevenue | number | 元 | 按非机制电量和三条路径兑现占比计算 |
| 综合费用 | comprehensiveFee | number | 元 | 汇总费用 |
| 其他收入 | otherIncome | number | 元 | |
| 全口径收入 | fullRevenue | number | 元 | |
| 度电净价 | fullRevenuePrice | number | 元/MWh | 全口径收入/上网电量 |

## 6. 首年小时结果字段

| 字段 | 英文字段名 | 类型 | 单位 | 说明 |
| --- | --- | --- | --- | --- |
| 时间 | time | string | YYYY-MM-DD HH:00 | |
| 等效小时数 | equivalentHours | number | h | |
| 小时上网电量 | energyMwh | number | MWh | |
| 现货价 | spotPrice | number | 元/MWh | |
| 小时现货收入 | spotRevenue | number | 元 | |
| 小时全口径收入 | fullRevenue | number | 元 | |
