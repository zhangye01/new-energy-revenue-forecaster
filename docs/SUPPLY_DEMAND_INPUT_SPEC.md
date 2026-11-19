# 现货预测供需输入配置（2026-11-19）

## 范围与业务口径

在原电价预测工作台前置配置六个独立输入：省内负荷load、联络线负荷tieLine、风电wind、光伏solar、水电hydro、非市场化nonMarket。周期自动读取项目startYear/forecastYears，不重复填年限。非市场化仅是自由配置元素，不拆成分。联络线正送出、负受入。

省内负荷、联络线和非市场化出力按电量配置。首年填写电量（MWh），后续年度电量为上年电量乘以 `1 + 当年电量增速/100`。普通元素非负。联络线净额模式允许首年负值，增长率沿原方向滚动。双向模式分别填写非负的送出量、受入量及各自增速和曲线，逐小时净额为送出减去受入。年净额为零时仍分别保留时段送出和受入。

新建供需配置时，风电、光伏和水电默认采用装机与利用小时口径。首年有效装机填写当年平均在运容量，单位为 MW。后续各年有效装机为上年装机乘以 `1 + 当年装机增速/100`。当年发电量等于有效装机乘以当年的等效利用小时，单位为 MWh。有效装机非负。等效利用小时可填 0 至 8,760 h，后续各年默认沿用首年值，可按年覆盖，清空某年的覆盖值即恢复首年值。显式覆盖为 0 只使对应年度出力归零。

两种口径均从第二年起逐年明确填写增速。允许 −100% 归零，归零后的电量或装机按百分比滚动仍为零。风电、光伏和水电可各自在「电量与增速」和「装机与利用小时」之间切换。各方式分别保留首年参数和逐年增速，装机方式另保留年度利用小时覆盖。两种方式共用曲线。打开历史项目时，初始选择沿用已保存的方式。

每个要素配置一套默认典型年。新版使用占比，分月 12 个值合计为 1，每个有电量月份的典型日 24 小时占比也各自合计为 1。月电量等于年度电量乘以当月占比。典型小时电量等于月电量除以月天数，再乘以该小时占比。各年默认继承典型年。指定年份可覆盖整套分月占比和任意一个或多个分时月份，其余向量独立继承。各年电量均为零的要素可留空曲线。首年出力为零但后续有出力时，仍需配齐适用曲线。旧版按原相对权重归一化，编辑时可将等价占比带入草稿。

沿用现系统365天/8760小时模型年，月份天数31/28/31/30/31/30/31/31/30/31/30/31，不自动切换真实闰年；界面说明该边界。每年288个典型小时记录带representedDays，展开8760小时供算法读取。校验Σ月电量=年度电量，Σ典型小时×该月天数=年度电量，Σ8760小时=年度电量。MW为相应1小时MWh除以1h，不混用总量单位。

剩余需求=load+tieLine-wind-solar-hydro-nonMarket，仅作为派生特征，不能替代六条原序列，不截断负剩余需求。

## 紧凑配置契约（前后端模块共用）

项目保存紧凑的供需配置、生成时间及输入指纹。

```text
project.supplyDemand = { version: 1, draft?: Config, config?: Config, generatedAt?: ISO, inputFingerprint?: string }
Config = { version: 1 | 2, startYear, forecastYears, elements: { load, tieLine, wind, solar, hydro, nonMarket } }
Series = {
  baseEnergyMwh: number | null,
  growthRatesByYear: { [year]: number | null },
  monthlyWeights: (number | null)[12],
  hourlyWeightsByMonth: { [month]: (number | null)[24] },
  curveOverridesByYear?: { [year]: { monthlyWeights?: number[12], hourlyWeightsByMonth?: { [month]: number[24] } } },
  capacityHours?: {
    baseCapacityMw: number | null,
    baseUtilizationHours: number | null,
    utilizationHoursByYear: { [year]: number }
  },
  alternateGeneration?: { mode: 'energy' | 'capacity_hours', growthRatesByYear, capacityHours? }
}
```

配置版本 1 使用历史相对权重和电量基数。配置版本 2 使用占比，可保存 `curveOverridesByYear`。年份条目内的分月占比覆盖该年 12 个月，分时占比只覆盖指定年月的 24 小时，未指定的向量继承默认典型年。

`capacityHours` 仅用于版本 2 的风电、光伏和水电。要素当前采用装机方式时，该字段存放生效的装机与小时参数，`growthRatesByYear` 表示装机增速。当前采用电量方式时，`baseEnergyMwh` 和 `growthRatesByYear` 分别表示首年电量和电量增速。`baseEnergyMwh` 在切换方式时保留，另一种方式的增速及装机参数随 `alternateGeneration` 保存。当前方式参与生成和校验，完全空白的备用参数省略。
联络线沿用 `{mode:'net', ...Series}` 或 `{mode:'bidirectional', export:Series, import:Series}`，切换保留各分支原数据。配置中的起始年和年数为填写时的项目周期。

领域模块NE_SUPPLY_DEMAND提供：
- `ELEMENTS`（key/label）、`GENERATOR_KEYS`、`MONTH_DAYS` 定义要素及日历。`createConfig(project)` 创建历史兼容结构，`createCapacityHoursConfig(project)` 创建新版草稿，`validateConfig(project,config)` 返回字符串错误数组。
- buildAnnualSummary(project,config)返回{ok,errors,annualRows}，仅计算年度摘要，供已保存预测来源核验使用，不展开典型日或8760数组。
- buildTypicalSummary(project,config)返回年度与典型日数据，供页面预览。不展开逐小时数组。
- fingerprint(project,config)只读稳定指纹，覆盖省份/项目ID/起始年/年限及完整配置。
- buildDataset(project,config)返回{ok,errors,fingerprint,annualRows,typicalRows,hourlyByYear,source}。annualRows每年{year,load,tieLine,wind,solar,hydro,nonMarket,residualDemand,tieLineExport,tieLineImport}。typicalRows每年每月每小时{year,month,hour,representedDays,...六元素及residualDemand}，hour为0..23。hourlyByYear[year]包含各要素的8760小时序列。source记录模型日历和单位，`curveReuse`对新版占比使用`default_with_year_overrides`，历史相对权重继续使用原标识。
- `csvRows(dataset, kind)` 返回表头和数据行。年度 CSV 使用 `year`，典型小时 CSV 使用 `year/month/hour/represented_days`，逐小时 CSV 使用 `year/month/day/hour/hour_index`，电量字段均以 `_mwh` 结尾。
无效配置返回错误，不变更输入或历史快照，不返回伪造全零有效数据。

## 界面与 Excel 模板

按要素页签填写该要素的首年参数，展开编辑逐年增速。风电、光伏和水电可通过「构建方式」切换输入，在装机口径下也可设定某一年的利用小时。联络线页签内选择净额或双向送受，双向模式按方向编辑。

- **逐年增速工作簿**按当前要素或联络线方向下载，覆盖首年之后的测算年份。新版模板标注 `增速口径`，导入校验项目周期、要素或方向、增速口径及年份。标注为年度电量和装机容量的文件分别用于对应口径。旧模板如果在填写说明中明确写有「用于装机容量增速」或「用于年度电量增速」，沿用文字标明的口径。更早的未标注模板沿用年度电量口径，在装机口径中导入时提示下载对应模板。
- **曲线工作簿**按默认典型年或一个指定年份下载，包含该范围全部要素的有效分月和分时占比。通过 Excel 导入后校验工作簿结构、周期、范围及各向量合计。可将指定年份的当前要素恢复为默认曲线。

两类工作簿均以空白保留原值，填 0 更新为零。导入结果先进入草稿，失败时保留上一份有效草稿及已保存配置。点击「校验并生成供需数据」后生成年度、典型小时和逐小时数据。

项目周期或省份变更后，先核对带入的输入并重新生成，生成成功后供需预览、导出和预测提交才使用新配置。起始年变动时须重新填写首年电量或首年装机与利用小时。默认曲线、重叠年份覆盖和仍属后续年份的增速可带入。缩短周期且已有参数适用时，可直接校验并生成。旧的已保存配置及预测版本保留其生成时输入。

生成后的图表、数据明细和 CSV 统一放在「供需数据预览」。堆积面积图的分月视图将典型小时电量按代表天数计入月合计，典型日视图展示所选月份的 24 小时。供给面积由风电、光伏、水电、非市场化出力和联络线受入构成，总需求线为省内负荷加联络线送出。点击图例可隐藏或恢复对应曲线，悬停的合计与剩余需求使用完整数据。

`NE_SUPPLY_DEMAND_TEMPLATE`负责工作簿生成和导入校验。`NE_SUPPLY_DEMAND_WORKSPACE.createController({root,getProject,onCommit,downloadCsv,onDraftChange})`返回`{render,hasUnsavedChanges,disposeChart}`。主控在保存时校验目标项目及供需配置，并在输入版本变化时更新预测生效状态。根节点`#supply-demand-root`位于预测任务面板之前。已生成结果仍可通过`downloadCsv(filename,rows)`导出。

## 预测集成与历史保护

提交预测前须保存有效供需配置，未保存的编辑须先确认。请求包含小时数据、供需配置和来源指纹。页面在供需生成前显示待生成状态，供需就绪后显示待提交。提交后展示排队、计算、校验、结果返回或失败状态。运行中自动更新，用户也可手动刷新。失败后可重试。服务不可用时保留现有配置和历史结果。

LSTM、XGBoost、Ensemble 的年度均价展示在任务区域下方。任务的 `activeRunId` 标识后台选中的结果 `runId`，价格通过当前项目、供需版本、单位、日历和完整覆盖校验后可用于收益测算。下一步按钮旁显示当前可用性。历史模拟运行保留原数值和来源标识。

生效的供需输入或项目边界变化后，须取得适用当前输入的预测价源才能重算收益。风电、光伏和水电的备用口径参数单独保存。新版配置若只改备用参数且参与计算的数据保持一致，可继续采用已生效的预测，原预测来源快照和完整指纹仍可回查。相同配置重复保存保留原指纹。普通草稿待确认时可查看已生成输入。既有无供需输入的历史项目仍可查看原预测和结果，首次生成新版预测须补供需配置。粗算快照、收入配置及历史年表保留原记录。

已保存run来源须校验版本、项目/周期、365天日历、8760小时、MWh/MW单位、1小时间隔、模型使用标记、配置快照和完整年度摘要。损坏或不兼容来源不得继续生效，但保留原run及历史结果供核对；只有完全没有供需来源字段的旧run才适用历史兼容。算法输入的年度/典型日数组须逐项存在，不接受稀疏数组绕过校验。

同一项目备份重复恢复时，对备份中已通过发布状态、电价完整性和供需来源校验的当前价源，恢复副本按新项目编号建立专属关联。原预测运行和供需快照保留，供需版本变化后仍须重新校验价源。旧基准结果按历史保留，副本重新测算基准后可继续与原粗算交叉验证。

## 验证

验证覆盖增速模板口径校验、装机复利、利用小时默认继承和单年覆盖、首年无出力及后续有出力、曲线分月及分时独立覆盖、恢复默认、占比校验、导入草稿及显式生成、月与小时电量守恒、联络线符号、年度净额为零但时段送受并存、周期变更、历史预测及快照保真、CSV 单位与时间顺序。正式价格模型接入按算法对接规格执行。
