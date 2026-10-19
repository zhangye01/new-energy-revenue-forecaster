"use strict";

const assert = require("node:assert/strict");
const {
  collectAppBootstrapScripts,
  createEchartsStub,
  prepareAppBootstrapSandbox,
  runAppBootstrapSmoke
} = require("../scripts/app-bootstrap-smoke");
const { createBrowserSandbox } = require("../scripts/module-load-smoke");

const html = [
  "<script src=\"./vendor/xlsx.full.min.js?v=1\" defer></script>",
  "<script src=\"./config.js?v=1\" defer></script>",
  "<script src=\"./runtime.js?v=1\" defer></script>",
  "<script src=\"./app.js?v=1\" defer></script>"
].join("\n");

assert.deepEqual(collectAppBootstrapScripts(html), [
  "config.js",
  "runtime.js",
  "app.js"
]);

const echarts = createEchartsStub();
const chart = echarts.init();
chart.setOption({});
chart.resize();
chart.clear();
chart.on("click", () => {});
chart.off("click");
assert.equal(chart.isDisposed(), false);
chart.dispose();
assert.equal(chart.isDisposed(), true);
assert.equal(echarts.getMap("china"), null);
echarts.registerMap("china", { type: "FeatureCollection", features: [] });
assert.deepEqual(echarts.getMap("china"), {
  geoJson: { type: "FeatureCollection", features: [] }
});

const sandbox = prepareAppBootstrapSandbox(createBrowserSandbox());
assert.equal(sandbox.confirm(), true);
assert.equal(sandbox.prompt(), "");

(async () => {
  const result = await runAppBootstrapSmoke();
  assert.equal(result.scriptCount, 58);
  assert.equal(result.activePage, "home-page");
  console.log("app bootstrap smoke tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
