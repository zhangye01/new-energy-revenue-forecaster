# 项目文档索引

这些文档用于约束业务口径、验收标准和开发交接，避免后续功能迭代时只靠页面现象判断。

## 推荐阅读顺序

1. [业务交接包 V1](./BUSINESS_HANDOFF_V1.md)：冻结 V1 范围、核心对象、公式和流程状态规则。
2. [开发交接 SOP](./DEVELOPER_HANDOFF.md)：说明本地启动、测试、发布和改动同步规则。
3. [模块地图](./ARCHITECTURE.md)：说明当前代码分层、业务模块责任和后续拆分方向。
4. [工程化准入基线](./ENGINEERING_BASELINE.md)：定义进入后续开发维护前必须满足的门槛。
5. [中短期工程化路线](./ENGINEERING_ROADMAP.md)：拆分后续工程化批次、交付物和验收标准。
6. [工程风险台账](./RISK_REGISTER.md)：记录当前残余风险、影响和处理计划。
7. [模型说明](./MODEL_SPEC.md)：说明全口径收入预测模型边界、收入分项和字段建议。
8. [业务数据字典 V1](./BUSINESS_DATA_DICTIONARY_V1.md)：约定项目、场景、结果等核心字段。
9. [验收用例 V1](./BUSINESS_ACCEPTANCE_CASES_V1.md)：定义 P0/P1/P2 业务验收用例。
10. [最小回归检查清单](./SMOKE_CHECKLIST.md)：用于每次 UI 或逻辑改动后的 3-5 分钟人工烟测。

## 工程约定

- 业务公式变更时，先更新业务交接包和验收用例，再改代码。
- 核心测算逻辑变更后，必须运行 `npm run check`。
- 若新增 P0 验收用例，应同步补充自动化黄金样例或烟测步骤。
- 新增 `src/domain/` 或 `src/ui/` 模块时，必须同步补测试，并确保 `npm run check:architecture` 通过。
