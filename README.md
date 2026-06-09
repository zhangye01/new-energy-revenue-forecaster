# 新能源全口径收入预测工作台

一个可直接在浏览器中运行的静态 Web 工具，用于新能源项目的电量配置、电价预测、全口径收入测算、基准结果总览和多方案对比分析。

## 在线使用

如果本仓库已开启 GitHub Pages，可通过发布后的 Pages 地址访问：

```text
https://zhangye01.github.io/new-energy-revenue-forecaster/
```

## 本地使用

下载本仓库后，直接用浏览器打开 `index.html` 即可。

也可以在项目目录启动一个本地静态服务：

```bash
python3 -m http.server 8000
```

然后访问：

```text
http://127.0.0.1:8000/index.html
```

## 演示登录

工具内置的是前端演示登录，用于区分浏览器本地的不同演示用户，不是生产级账号体系。

```text
账号：demo1、demo2、demo3、demo4、demo5
密码：demo123
```

## 开发检查

修改核心计算或页面脚本后，建议先运行：

```bash
npm run check
```

该命令会执行 JavaScript 语法检查，并运行全口径收入测算黄金样例，覆盖机制结算、交易策略损益、环境价值兑现、综合费用、配储补充收益和缺失曲线提示。

## 项目文档

业务口径、模型说明、验收用例和烟测清单已整理到 [docs/](./docs/README.md)。继续开发前建议先阅读业务交接包和验收用例，避免页面迭代偏离既定口径。

## 主要功能

- 项目创建：配置省份、风/光类型、陆上/海上、装机容量、配储和测算周期。
- 结算电量配置：支持逐年总量模板、典型年8760曲线和省份典型曲线。
- 历史电价分析：查看现货电价历史统计和分布。
- 电价预测工作台：生成 LSTM、XGBoost、Ensemble 三类模拟电价曲线。
- 全口径收入配置：配置差价机制、交易策略损益、环境价值兑现、综合费用和配储补充收益。
- 基准结果总览：形成基准场景简报、图表、年度明细和导出结果。
- 多方案对比分析：支持方案对标和基准方案敏感性分析。

## 数据说明

工具默认在浏览器本地保存项目数据。直接访问网页不会上传本地测算数据，也不会共享个人浏览器中的项目结果。

## 发布说明

本项目是静态页面应用，GitHub Pages 可直接从仓库根目录发布。运行所需核心文件包括：

```text
index.html
app.js
styles.css
runtime.js
config.js
map-data.js
assets/
vendor/
src/
```

工程化与交接文件包括：

```text
package.json
tests/
docs/
.github/workflows/
```

以下本地文件不需要发布或提交：

```text
.playwright-cli/
ui-demos/
node_modules/
*.log
tmp/
temp/
```
