# 模块地图

本文说明当前代码边界和后续拆分方向，用于降低交接开发成本。

## 1. 当前文件分层

| 层级 | 文件/目录 | 责任 |
| --- | --- | --- |
| 页面结构 | `index.html` | 静态 DOM、页面容器、脚本加载顺序、登录兜底脚本 |
| 页面样式 | `styles/theme.css`、`styles/base.css`、`styles/components/*.css`、`styles/pages/*.css`、`styles/responsive.css`、`styles.css` | 主题令牌、基础布局、公共组件、页面样式、响应式兜底、最终兜底 |
| 运行时引用 | `runtime.js` | DOM 引用集中表、共享 `appState` |
| 基础配置 | `config.js`、`map-data.js` | 页面标题、流程规则、省份默认参数、地图数据 |
| 页面主控 | `app.js` | 导航、表单、图表渲染、状态持久化、导入导出、业务模块调度 |
| 业务模块 | `src/domain/` | 可测试的纯业务逻辑、模型规则、CSV 解析与导出数据构造 |
| UI 配置模块 | `src/ui/` | 可测试的图表 option、页面展示配置，不直接操作 DOM |
| 自动测试 | `tests/` | Node 侧业务测试、黄金样例和回归测试 |
| 工程脚本 | `scripts/` | 自动语法检查、测试发现、架构守护、静态资源完整性检查、浏览器模块加载和应用启动 smoke、发布仓库卫生检查 |
| 交接文档 | `docs/` | 业务口径、数据字典、验收用例、开发 SOP |

## 2. `src/domain/` 模块责任

| 模块 | 责任 |
| --- | --- |
| `csv-utils.js` | CSV 解析、表头标准化、导出字段转义、文件名清洗 |
| `export-builders.js` | CSV 导出文件名、年度结果和小时明细导出行构造 |
| `energy-profiles.js` | 年总小时拆分、典型曲线归一化、逐年电量扩展 |
| `energy-data.js` | 电量导入模板校验、模式识别、电量状态重建、完整年份和逐年输入辅助判断 |
| `energy-import-flow.js` | 结算电量导入后的状态更新、提示文案和下游置脏流程 |
| `app-utils.js` | 页面主控共用的格式化、转义、日期裁剪、对象判断和基础工具函数 |
| `price-forecast.js` | 三模型模拟现货电价、预测质量校核 |
| `revenue-rules.js` | 机制月份、交易策略收敛、环境价值、综合费用规则 |
| `revenue-calculator.js` | 场景全口径收入主计算 |
| `result-report.js` | 基准结果总览的数据摘要和图表数据 |
| `compare-analysis.js` | 多方案对比、敏感性分析数据、对比页 frame 状态和选择态回写 |
| `history-analysis.js` | 历史电价模拟样本、日期范围切片、统计、典型日、热力图、分布和导出数据 |
| `workflow-status.js` | 流程状态和缺失项判断 |
| `scenario-config.js` | 场景配置清洗、逐年 CSV 模板和导入校验 |
| `scenario-model.js` | 场景默认值、复制、重命名、基准锁定规则 |
| `project-settings.js` | 项目默认设置、配置清洗 |
| `project-model.js` | 项目创建、项目清洗、基础字段默认值、历史示例项目 seed 决策 |
| `project-display.js` | 项目省份、风光类型、陆海类型、周期和导出时间等展示辅助 |
| `app-storage.js` | 业务快照的 localStorage / IndexedDB 读写、最新快照选择 |

## 3. `src/ui/` 模块责任

| 模块 | 责任 |
| --- | --- |
| `project-list.js` | 我的项目列表、工作区、项目卡片 HTML 构造和 frame 上下文装配 |
| `file-import-utils.js` | 浏览器侧 CSV/TXT/Excel 文件读取与 Excel 转 CSV 适配 |
| `script-loader.js` | ECharts 与地图等外部脚本的按需加载、复用和失败提示 |
| `policy-panel.js` | 首页地区政策筛选 view model 和政策卡片 HTML 构造 |
| `province-defaults.js` | 省份默认参数展示 view model、选择器排序、消息文案、参数卡片 HTML 构造和 DOM 写回 |
| `energy-workspace.js` | 结算电量配置页工作台 view model、创建项目表单读写/清空、状态文案、按钮禁用和模板状态计算 |
| `create-project-flow.js` | 创建项目表单保存流程编排，处理新建/更新项目分支和页面跳转副作用 |
| `energy-template-flow.js` | 结算电量模板导出、文件导入、示例模板和省份典型曲线调用流程 |
| `chart-lifecycle.js` | ECharts 实例存活判断、批量 resize、窗口 resize 绑定和双帧延迟刷新 |
| `energy-charts.js` | 结算电量配置页年度小时数和典型日曲线图的 option、空态和说明文案构造 |
| `forecast-page.js` | 电价预测版本列表、质量门槛和激活日志 HTML 构造 |
| `forecast-run-flow.js` | 电价预测运行生成、自动激活、手动切换和强制发布流程 |
| `result-page.js` | 基准结果总览报告文案、指标卡、假设说明、明细表 HTML 和渲染状态构造 |
| `result-print.js` | 基准结果总览打印前展开、图表刷新和打印后恢复控制 |
| `result-charts.js` | 基准结果总览四张 ECharts 图的 option 构造和图表 token 扩展 |
| `scenario-charts.js` | 全口径收入配置页参数可视化三张 ECharts 图的 option 和主题 token 构造 |
| `scenario-form.js` | 全口径收入配置页表单读写和场景配置构造 |
| `scenario-visual-data.js` | 全口径收入配置页参数可视化年度行数据构造 |
| `manual-scenario-flow.js` | 交易策略、环境价值、综合费用三类逐年手工模板的导出、导入和状态回写流程 |
| `compare-charts.js` | 多方案对比和敏感性分析图表 option、对比页主题 token 构造 |
| `compare-page.js` | 多方案对比页变量列表、方案焦点列表和对比表格 HTML 构造 |
| `history-page.js` | 历史电价展示页导出计划、KPI 和洞察文案构造 |
| `history-renderer.js` | 历史电价展示页渲染控制、空态处理、图表和状态回写 |
| `history-charts.js` | 历史电价展示五张 ECharts 图的 option 和主题 token 构造 |
| `theme-controller.js` | 主题偏好读取、切换、DOM data-theme 和设置页文案同步 |
| `shell-events.js` | 全局壳层、弹窗、导航和窗口级事件绑定 |
| `app-event-bindings.js` | 应用级事件绑定编排，把页面主控回调接入壳层、历史、对比、电量、场景和结果页事件模块 |

## 4. 主要数据流

```text
项目创建
  -> project-model / project-settings
  -> appState.projects

结算电量配置
  -> energy-data / energy-profiles
  -> project.energyData.hourlyByYear

电价预测
  -> price-forecast
  -> project.priceRuns / project.activeRunId

全口径收入配置
  -> scenario-model / scenario-config
  -> scenario.config

基准测算
  -> revenue-calculator
  -> project.resultsByScenario[scenarioId]

结果展示与对比
  -> result-report / compare-analysis / history-analysis
  -> app.js 渲染 ECharts 与表格
```

## 5. 后续拆分优先级

### P0：继续缩小 `app.js`

优先拆出以下模块：

```text
src/ui/result-page.js
src/ui/compare-page.js
src/ui/scenario-page.js
src/ui/chart-theme.js
src/storage/app-storage.js
```

拆分原则：先移动纯数据构造和无 DOM 逻辑，再移动渲染函数，最后移动事件绑定。

### P1：整理样式边界

当前已拆出 `styles/theme.css` 放置 `:root` 与主题变量，`styles/base.css` 放置 reset、壳层、导航、顶栏、页面和面板基础样式，`styles/components/data-display.css` 放置面板辅助、指标卡和表格样式，`styles/components/forms.css` 放置表单字段与表单栅格样式，`styles/components/buttons.css` 放置按钮变体与行内操作样式，`styles/components/workflow.css` 放置跨流程跳转条样式，`styles/components/auth.css` 放置登录与账号设置辅助样式，`styles/pages/home.css` 放置首页政策轮播、标杆地图和政策卡片样式，`styles/pages/projects.css` 放置项目列表页样式，`styles/pages/create.css` 放置创建项目页样式，`styles/pages/help.css` 放置帮助文档页样式，`styles/pages/energy.css` 放置结算电量配置页样式，`styles/pages/scenario.css` 放置全口径收入配置页样式，`styles/pages/results.css` 放置基准结果总览与打印报告样式，`styles/pages/compare.css` 放置多方案对比页样式，`styles/pages/history.css` 放置历史电价页样式，`styles/responsive.css` 放置跨页面响应式兜底，并由架构检查确保它们先于 `styles.css` 加载。`styles.css` 只保留最终覆盖入口，不应继续承载业务样式。

在没有构建工具前，可以继续用多个 `<link rel="stylesheet">` 按顺序加载；新增主题令牌必须进入 `styles/theme.css`，新增壳层基础样式必须进入 `styles/base.css`，新增通用组件样式必须进入 `styles/components/`，新增页面样式必须进入 `styles/pages/`，新增跨页面移动端兜底必须进入 `styles/responsive.css`。

### P2：评估构建工具

当前 GitHub Pages 可直接发布静态文件。只有当模块继续增多、需要类型检查或打包优化时，再考虑 Vite/TypeScript。不要为了“看起来工程化”提前引入构建复杂度。
