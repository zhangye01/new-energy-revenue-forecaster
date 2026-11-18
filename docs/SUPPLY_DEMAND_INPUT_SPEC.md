# 现货预测供需输入配置 V1（2026-11-13）

## 范围与业务口径

在原电价预测工作台前置配置六个独立输入：省内负荷load、联络线负荷tieLine、风电wind、光伏solar、水电hydro、非市场化nonMarket。周期自动读取项目startYear/forecastYears，不重复填年限。非市场化仅是自由配置元素，不拆成分。联络线正送出、负受入。

首年总量MWh直接作为首年电量；后续年度=上年×(1+当年增长率/100)。增长率必须逐年明确填写，允许-100%归零，低于-100%拒绝。首年不再应用增长率。普通元素非负；联络线单向净额模式允许首年负值，增长不改变方向。同年双向时仍为一个联络线元素，分别配置正的送出量和受入量及各自增长/曲线，输出逐小时送出减受入，净年电量为0时不能抹去时段流动。

每个元素配置12个月非负相对权重，以及12条24小时非负相对权重。有效权重自动归一化，值不必合计100；月电量=年度电量×月权重/全年月权重和，典型小时电量=月电量/月天数×小时权重/本月24小时权重和。曲线默认跨年复用；本轮不新增逐年曲线覆盖。无电量元素必须显式填写0，可以不填写无用曲线；正总量月必须具备合法且和大于0的小时曲线。缺项不默认为0。曲线提供显式均分、复制和矩阵粘贴便利操作，不冒充真实市场曲线。

沿用现系统365天/8760小时模型年，月份天数31/28/31/30/31/30/31/31/30/31/30/31，不自动切换真实闰年；界面说明该边界。每年288个典型小时记录带representedDays，展开8760小时供算法读取。校验Σ月电量=年度电量，Σ典型小时×该月天数=年度电量，Σ8760小时=年度电量。MW为相应1小时MWh除以1h，不混用总量单位。

剩余需求=load+tieLine-wind-solar-hydro-nonMarket，仅作为派生特征，不能替代六条原序列，不截断负剩余需求。

## 紧凑配置契约（前后端模块共用）

project.supplyDemand={version:1,draft?:Config,config?:Config,generatedAt?:ISO,inputFingerprint?:string}。仅保存紧凑配置及元数据，不将全周期8760数组反复写入localStorage。Config={version:1,startYear,forecastYears,elements:{load:Series,tieLine:SeriesWithMode,wind:Series,solar:Series,hydro:Series,nonMarket:Series}}。
Series={baseEnergyMwh:number|null,growthRatesByYear:{[year]:number|null},monthlyWeights:(number|null)[12],hourlyWeightsByMonth:{[month1to12]:(number|null)[24]}}。
SeriesWithMode在单向时{mode:'net',...Series}；双向时{mode:'bidirectional',export:Series,import:Series}。保留不活动分支数据，切换不静默清空。config.startYear/forecastYears表示填写时的周期；项目周期变化须显式核对，不能把旧首年量默认为新首年量。

领域模块NE_SUPPLY_DEMAND提供：
- ELEMENTS（key/label）、MONTH_DAYS、createConfig(project)、validateConfig(project,config)返回字符串错误数组。
- buildAnnualSummary(project,config)返回{ok,errors,annualRows}，仅计算年度摘要，供已保存预测来源核验使用，不展开典型日或8760数组。
- fingerprint(project,config)只读稳定指纹，覆盖省份/项目ID/起始年/年限及完整配置。
- buildDataset(project,config)返回{ok,errors,fingerprint,annualRows,typicalRows,hourlyByYear,source}。annualRows每年{year,load,tieLine,wind,solar,hydro,nonMarket,residualDemand,tieLineExport,tieLineImport}；typicalRows每年每月每小时{year,month,hour,representedDays,...六元素及residualDemand}，hour为0..23；hourlyByYear[year]={load:8760[],tieLine:...,wind:...,solar:...,hydro:...,nonMarket:...,residualDemand:...}。source包含365天模型和小时/电量单位定义。
- csvRows(dataset,kind)返回表头+数据行，kind=annual/typical/hourly，导出必须带year/month/hour与单位（8760另含day/hourIndex）。
无效配置返回错误，不变更输入或历史快照，不返回伪造全零有效数据。

批量曲线粘贴只校验12行×24列及非负有限数字；零电量月份允许全零小时行，有电量月份在生成时仍要求小时权重合计大于0。未点“应用”的矩阵和批量增长率属于未提交输入，阻止保存、生成预测及会丢失归属的元素/方向切换；必须明确应用或清除。恢复已生成配置会同时清除未应用的辅助输入。

UI模块NE_SUPPLY_DEMAND_WORKSPACE.createController({root,getProject,onCommit,downloadCsv})返回{render,hasUnsavedChanges}，首次render绑定委托事件，onCommit(project,nextSupplyDemand,{changed,generated})由主控检查目标身份、保存并置脏预测。主控负责项目水合时保留raw supplyDemand。生成完整数据使用当前已保存config，草稿与用于算法的配置分开。下载通过downloadCsv(filename,rows)，根节点#supply-demand-root位于现预测表单之前。

## 预测集成与历史保护

新增预测之前必须保存有效供需配置，未保存编辑不允许生成。每个新run保存紧凑供需配置快照、来源指纹/周期/单位和年度摘要；接口接收所生成的小时数据。现有模拟算法不宣称已训练/已消费供需特征，明显标注“供需输入已留存，当前演示价格模型尚未使用供需定价”。不自行虚构价格弹性或物理出清公式。

供需配置数值变化或项目范围变化后，旧run和既有收入结果保留历史内容，不能继续冒充当前有效预测；需重新生成预测并测算。相同配置重复保存不造成无意义失效。保存草稿不替换已生效输入；有未保存草稿须明确提示。既有没有供需输入的历史项目仍可查看原预测/结果，首次生成新版预测须补配置。粗算快照、收入配置及历史年表不回写。

已保存run来源须校验版本、项目/周期、365天日历、8760小时、MWh/MW单位、1小时间隔、模型使用标记、配置快照和完整年度摘要。损坏或不兼容来源不得继续生效，但保留原run及历史结果供核对；只有完全没有供需来源字段的旧run才适用历史兼容。算法输入的年度/典型日数组须逐项存在，不接受稀疏数组绕过校验。

## 验证

覆盖年度复利、月/典型小时/8760总量守恒、送出/受入符号、双向净0但小时非0、零元素、缺值/负权重/非法增长拒绝、周期变更需复核、原对象不变、配置/草稿/输入快照持久化、旧项目兼容、旧run失效与切换拒绝、CSV单位和时间顺序。真实浏览器核验新建或合成副本、填写/保存/刷新/预览/导出/生成模拟预测、输入变化后失效、旧粗算不变。正式价格模型接入不属于本轮已实现范围。
