# 工程化准入基线

本文定义进入后续功能开发和长期维护前必须满足的工程化门槛。后续所有功能开发都应先满足这些要求，再讨论页面体验或业务扩展。

## 1. 准入结论

当前项目允许继续做工程化治理，但进入新功能密集开发前必须满足：

| 门槛 | 当前要求 |
| --- | --- |
| 自动检查 | `npm run check` 必须通过 |
| CI | GitHub Actions 必须运行 `npm run check` |
| 主控文件规模 | `app.js` 不允许超过 6040 行 |
| 主控函数规模 | `app.js` 单个顶层函数不允许超过 120 行 |
| 样式文件规模 | `styles.css` 不允许超过 5500 行，超过前必须先分区或拆分 |
| 新模块测试 | `src/domain/*.js` 和 `src/ui/*.js` 新增模块必须有对应 `tests/*.test.js` |
| 检查脚本 | 语法检查和测试必须自动发现文件，不允许在 `package.json` 手写长串 |
| 静态完整性 | `index.html` 引用的本地脚本、样式、图片和 CSS 资源必须存在，DOM id 不允许重复 |
| 页面骨架 | 核心页面、关键 DOM 节点和脚本顺序必须通过 smoke 契约检查 |
| CI 入口 | `.github/workflows/` 保持一个检查 workflow，避免重复跑同一套门禁 |
| 业务公式 | 公式变更必须同步业务交接包、模型说明和自动测试 |
| 页面流程 | 流程变更必须同步烟测清单 |
| 发布风险 | `scripts/release-check.js` 必须拦截本地运行痕迹、个人文件、疑似密钥或临时输出 |

## 2. 分层规则

### `src/domain/`

只放可测试的业务规则、字段清洗、计算、导入导出行构造和状态判断。这里的函数不直接访问 DOM，也不直接读写浏览器存储。

### `src/ui/`

只放可测试的展示配置，例如 ECharts option、图表主题 token、纯展示数据结构。这里的函数不直接操作 DOM。

### `app.js`

只保留页面主控职责：DOM 绑定、页面状态切换、调用业务模块、调用图表模块、持久化调度。新增功能时不得继续扩大 `app.js`，应优先拆到 `src/domain/` 或 `src/ui/`。

### `runtime.js`

只集中 DOM 引用和初始 `appState`。不得放业务计算。

### `config.js`

只放常量配置、默认参数和静态枚举。不得放页面流程实现。

## 3. 提交前检查

每次提交前运行：

```bash
npm run check
```

检查包含：

1. JavaScript 语法检查：`scripts/check-syntax.js` 自动扫描根脚本、`src/domain/`、`src/ui/` 和 `scripts/`。
2. 业务模块和图表模块单元测试：`scripts/run-tests.js` 自动扫描 `tests/*.test.js`。
3. 架构守护检查：`scripts/architecture-check.js` 检查分层、脚本顺序、`app.js` 行数和函数规模、`styles.css` 行数。
4. 静态页面完整性检查：`scripts/static-check.js` 检查 `index.html` / `styles.css` 的本地资源引用、重复 id 和标题结构。
5. 页面 smoke 契约检查：`scripts/smoke-check.js` 检查核心页面、关键 DOM 节点和启动脚本顺序。
6. 发布仓库卫生检查：`scripts/release-check.js` 检查被 Git 追踪的本地缓存、个人绝对路径和高置信度密钥格式。

如果改动涉及页面交互，还需要按 [最小回归检查清单](./SMOKE_CHECKLIST.md) 做人工烟测或浏览器烟测。

## 4. 新功能开发顺序

新增功能必须按以下顺序推进：

1. 明确业务口径和字段。
2. 更新业务文档或验收用例。
3. 在 `src/domain/` 补纯逻辑。
4. 添加或更新测试。
5. 在 `app.js` 接入页面流程。
6. 更新烟测清单。
7. 运行 `npm run check`。

## 5. 继续治理优先级

1. 拆 `scenario-page` / 全口径收入配置页控制逻辑。
2. 拆事件绑定，把页面事件按模块组织。
3. 继续迁出 `app.js` 中的图表 option 和报表展示数据。
4. 把静态 smoke 契约继续扩展为真实浏览器关键路径 smoke。
5. 当模块数量继续增长时，再评估 Vite/TypeScript，不提前引入复杂构建。
