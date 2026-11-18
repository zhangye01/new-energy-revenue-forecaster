# 现货预测供需输入配置（2026-11-18）

## 范围与业务口径

在原电价预测工作台前置配置六个独立输入：省内负荷load、联络线负荷tieLine、风电wind、光伏solar、水电hydro、非市场化nonMarket。周期自动读取项目startYear/forecastYears，不重复填年限。非市场化仅是自由配置元素，不拆成分。联络线正送出、负受入。

首年总量MWh直接作为首年电量；后续年度=上年×(1+当年增长率/100)。增长率必须逐年明确填写，允许-100%归零，低于-100%拒绝。首年不再应用增长率。普通元素非负；联络线单向净额模式允许首年负值，增长不改变方向。同年双向时仍为一个联络线元素，分别配置正的送出量和受入量及各自增长/曲线，输出逐小时送出减受入，净年电量为0时不能抹去时段流动。

每个要素配置一套默认典型年。新配置采用占比，分月12个值合计为1，每个有电量月份的典型日24小时占比也分别合计为1。月电量=年度电量×当月占比。典型小时电量=月电量÷月天数×当小时占比。各年默认继承典型年。单年可覆盖整套分月占比、任意一个或多个分时月份，按向量独立继承。无电量要素须显式填0，该要素曲线可留空。旧版按原相对权重归一化，修改时可以把等价比例带进新版草稿。

沿用现系统365天/8760小时模型年，月份天数31/28/31/30/31/30/31/31/30/31/30/31，不自动切换真实闰年；界面说明该边界。每年288个典型小时记录带representedDays，展开8760小时供算法读取。校验Σ月电量=年度电量，Σ典型小时×该月天数=年度电量，Σ8760小时=年度电量。MW为相应1小时MWh除以1h，不混用总量单位。

剩余需求=load+tieLine-wind-solar-hydro-nonMarket，仅作为派生特征，不能替代六条原序列，不截断负剩余需求。

## 紧凑配置契约（前后端模块共用）

project.supplyDemand={version:1,draft?:Config,config?:Config,generatedAt?:ISO,inputFingerprint?:string}。仅保存紧凑配置及元数据，不将全周期8760数组反复写入localStorage。Config={version:1|2,startYear,forecastYears,elements:{load:Series,tieLine:SeriesWithMode,wind:Series,solar:Series,hydro:Series,nonMarket:Series}}。配置版本1为历史的相对权重版，版本2为占比版。
Series={baseEnergyMwh:number|null,growthRatesByYear:{[year]:number|null},monthlyWeights:(number|null)[12],hourlyWeightsByMonth:{[month1to12]:(number|null)[24]}}。配置版本2的Series可带`curveOverridesByYear`。年份条目内的`monthlyWeights`覆盖该年12个月占比，`hourlyWeightsByMonth[month]`仅覆盖该年月24小时占比。未指定的向量各自继承默认典型年。
SeriesWithMode在单向时{mode:'net',...Series}；双向时{mode:'bidirectional',export:Series,import:Series}。保留不活动分支数据，切换不静默清空。config.startYear/forecastYears表示填写时的周期；项目周期变化须显式核对，不能把旧首年量默认为新首年量。

领域模块NE_SUPPLY_DEMAND提供：
- ELEMENTS（key/label）、MONTH_DAYS、createConfig(project)、validateConfig(project,config)返回字符串错误数组。
- buildAnnualSummary(project,config)返回{ok,errors,annualRows}，仅计算年度摘要，供已保存预测来源核验使用，不展开典型日或8760数组。
- fingerprint(project,config)只读稳定指纹，覆盖省份/项目ID/起始年/年限及完整配置。
- buildDataset(project,config)返回{ok,errors,fingerprint,annualRows,typicalRows,hourlyByYear,source}。annualRows每年{year,load,tieLine,wind,solar,hydro,nonMarket,residualDemand,tieLineExport,tieLineImport}。typicalRows每年每月每小时{year,month,hour,representedDays,...六元素及residualDemand}，hour为0..23。hourlyByYear[year]包含各要素的8760小时序列。source记录模型日历和单位，`curveReuse`对新版占比使用`default_with_year_overrides`，历史相对权重继续使用原标识。
- csvRows(dataset,kind)返回表头+数据行，kind=annual/typical/hourly，导出必须带year/month/hour与单位（8760另含day/hourIndex）。
无效配置返回错误，不变更输入或历史快照，不返回伪造全零有效数据。

## 界面与曲线模板

界面直接填写首年电量、逐年增长率和联络线方式。曲线工作簿按选中的默认典型年或一个测算年份下载，带出当前草稿的有效分月和分时占比。页面也可修改分月占比，查看选择年月的分月电量与典型日分时曲线。导入会核对工作簿结构、周期、曲线范围与各向量合计。空白单元格保留原值，填写0按零更新。导入失败保留已保存的数据及上一份有效草稿。用户确认保存后生成年度、典型小时和逐小时数据，供预测使用。可恢复指定年的默认曲线。

项目起始年变动时，首年电量须重新填写。默认典型年曲线和重叠年份的调整可带入核对，重叠的后续年份可带入已有增长率。界面和工作簿共同编辑一份待保存的配置。旧的已保存配置及预测版本保留生成时输入。

`NE_SUPPLY_DEMAND_TEMPLATE`负责工作簿生成和导入校验。`NE_SUPPLY_DEMAND_WORKSPACE.createController({root,getProject,onCommit,downloadCsv,onDraftChange})`返回`{render,hasUnsavedChanges}`。主控在保存时校验目标项目及供需配置，并在输入版本变化时更新预测生效状态。根节点`#supply-demand-root`位于预测表单之前。已生成结果仍可通过`downloadCsv(filename,rows)`导出。

## 预测集成与历史保护

新增预测之前必须保存有效供需配置，未保存编辑不允许生成。每个新run保存紧凑供需配置快照、来源指纹/周期/单位和年度摘要；接口接收所生成的小时数据。现有模拟算法不宣称已训练/已消费供需特征，明显标注“供需输入已留存，当前演示价格模型尚未使用供需定价”。不自行虚构价格弹性或物理出清公式。

供需配置数值变化或项目范围变化后，旧run和既有收入结果保留历史内容，不能继续冒充当前有效预测；需重新生成预测并测算。相同配置重复保存不造成无意义失效。保存草稿不替换已生效输入；有未保存草稿须明确提示。既有没有供需输入的历史项目仍可查看原预测/结果，首次生成新版预测须补配置。粗算快照、收入配置及历史年表不回写。

已保存run来源须校验版本、项目/周期、365天日历、8760小时、MWh/MW单位、1小时间隔、模型使用标记、配置快照和完整年度摘要。损坏或不兼容来源不得继续生效，但保留原run及历史结果供核对；只有完全没有供需来源字段的旧run才适用历史兼容。算法输入的年度/典型日数组须逐项存在，不接受稀疏数组绕过校验。

## 验证

覆盖界面与曲线模板合并、默认继承、指定年分月和分时分别覆盖、恢复默认、占比校验、导入预览及显式保存、相同配置回传、年度复利、月/典型小时/8760总量守恒、送出/受入符号、双向净0但小时非0、零元素、周期变更复核、历史配置与快照保真、CSV单位和时间顺序。正式价格模型接入按算法对接规格执行。
