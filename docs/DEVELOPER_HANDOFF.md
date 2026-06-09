# 开发交接 SOP

本文面向接手维护本工具的开发人员。目标是让新人能快速定位业务口径、运行检查、发布页面，并知道哪些改动需要同步补测试和文档。

## 1. 本地启动

项目是静态 Web 应用，不依赖后端服务。

```bash
python3 -m http.server 8000
```

访问：

```text
http://127.0.0.1:8000/index.html
```

演示登录：

```text
账号：demo1、demo2、demo3、demo4、demo5
密码：demo123
```

## 2. 每次改动前先看什么

1. 业务边界：先读 [业务交接包 V1](./BUSINESS_HANDOFF_V1.md)。
2. 字段含义：再读 [业务数据字典 V1](./BUSINESS_DATA_DICTIONARY_V1.md)。
3. 代码入口：查 [模块地图](./ARCHITECTURE.md)。
4. 验收口径：对照 [验收用例 V1](./BUSINESS_ACCEPTANCE_CASES_V1.md)。
5. 工程门槛：确认 [工程化准入基线](./ENGINEERING_BASELINE.md) 和 [工程风险台账](./RISK_REGISTER.md)。

## 3. 改动类型与必须同步项

| 改动类型 | 必须同步 |
| --- | --- |
| 业务公式、收益分项、校核规则 | `docs/BUSINESS_HANDOFF_V1.md`、相关 `src/domain/*.js` 测试 |
| 项目、场景、结果字段 | `docs/BUSINESS_DATA_DICTIONARY_V1.md`、迁移/清洗逻辑、测试 |
| 页面流程、按钮、导入导出 | `docs/SMOKE_CHECKLIST.md`、相关自动测试 |
| 发布方式或运行方式 | `README.md`、本文档 |
| 图表或报表口径 | `docs/MODEL_SPEC.md`、结果页/对比页测试 |

## 4. 代码修改原则

- 优先把纯业务逻辑放进 `src/domain/`，让它能在 Node 测试里直接运行。
- `app.js` 只保留页面状态、DOM 绑定、图表渲染、调用业务模块的胶水代码。
- 新增字段时，必须经过“默认值 -> 清洗/迁移 -> 表单读写 -> 计算使用 -> 导出/展示”的完整链路。
- 不要在图表渲染函数里写业务公式；图表函数只消费已经计算好的结果。
- 不要让一个页面直接修改另一个页面的 DOM 状态；跨页面状态统一通过 `appState.projects`、`project.statuses` 和持久化快照流转。

## 5. 自动检查

每次提交前运行：

```bash
npm run check
```

这个命令会做两件事：

1. `node --check`：检查静态脚本语法。
2. `npm test`：运行核心业务模块测试和黄金样例测试。
3. `npm run check:architecture`：检查模块测试、脚本加载和 `app.js` 规模是否越界。

如果只改文案或 README，也建议至少跑一次 `npm run check`，避免脚本顺序或全局变量引用被意外破坏。

GitHub Actions 已配置同一套检查。推送到 `main` 或提交 PR 时，CI 必须通过后再合并或发布。

## 6. 发布到 GitHub Pages

1. 确认 `main` 分支已推送到 GitHub。
2. GitHub 仓库进入 `Settings -> Pages`。
3. `Source` 选择 `Deploy from a branch`。
4. `Branch` 选择 `main`，目录选择 `/ (root)`。
5. 保存后等待部署完成。

当前发布地址：

```text
https://zhangye01.github.io/new-energy-revenue-forecaster/
```

## 7. 常见风险

- `app.js` 仍然较大，新增页面逻辑前应优先考虑拆模块。
- 当前电价预测、历史价格、省级典型曲线包含模拟逻辑；接入真实数据前，不应对外宣称为正式预测模型。
- 浏览器本地保存数据，清缓存或换浏览器会影响项目数据可见性。
- 演示登录不是生产鉴权，不应承载敏感数据或真实账号权限。

完整风险列表维护在 [工程风险台账](./RISK_REGISTER.md)。风险状态变化时必须同步更新。
