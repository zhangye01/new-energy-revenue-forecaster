"use strict";

const assert = require("node:assert/strict");
const { loadScriptResourceOnce } = require("../src/ui/script-loader");

class FakeScriptElement {
  constructor() {
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.async = false;
    this.src = "";
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  dispatch(type) {
    this.listeners[type]?.();
  }
}

class FakeDocument {
  constructor(matches = {}) {
    this.matches = matches;
    this.createdScripts = [];
    this.appendedScripts = [];
    this.head = {
      appendChild: (script) => {
        this.appendedScripts.push(script);
        return script;
      }
    };
  }

  querySelector(selector) {
    return this.matches[selector] || null;
  }

  createElement(tagName) {
    assert.equal(tagName, "script");
    const script = new FakeScriptElement();
    this.createdScripts.push(script);
    return script;
  }
}

(async () => {
  await assert.rejects(
    () => loadScriptResourceOnce("./demo.js", "demo", { document: null }),
    /当前环境不支持动态加载脚本/
  );

  const loadedDocument = new FakeDocument({
    "script[data-loaded-demo=\"1\"]": new FakeScriptElement()
  });
  await loadScriptResourceOnce("./demo.js", "demo", { document: loadedDocument });
  assert.equal(loadedDocument.createdScripts.length, 0);

  const existingLoading = new FakeScriptElement();
  const loadingDocument = new FakeDocument({
    "script[data-loading-key=\"demo\"]": existingLoading
  });
  const loadingPromise = loadScriptResourceOnce("./demo.js", "demo", { document: loadingDocument });
  existingLoading.dispatch("load");
  await loadingPromise;
  assert.equal(loadingDocument.createdScripts.length, 0);

  const failedLoading = new FakeScriptElement();
  const failedDocument = new FakeDocument({
    "script[data-loading-key=\"failed\"]": failedLoading
  });
  const failedPromise = loadScriptResourceOnce("./failed.js", "failed", { document: failedDocument });
  failedLoading.dispatch("error");
  await assert.rejects(() => failedPromise, /脚本加载失败：\.\/failed\.js/);

  const freshDocument = new FakeDocument();
  const freshPromise = loadScriptResourceOnce("./fresh.js", "fresh", { document: freshDocument });
  assert.equal(freshDocument.createdScripts.length, 1);
  const freshScript = freshDocument.createdScripts[0];
  assert.equal(freshScript.async, true);
  assert.equal(freshScript.src, "./fresh.js");
  assert.equal(freshScript.dataset.loadingKey, "fresh");
  assert.equal(freshDocument.appendedScripts[0], freshScript);
  freshScript.dispatch("load");
  await freshPromise;
  assert.equal(freshScript.attributes["data-loaded-fresh"], "1");

  const errorDocument = new FakeDocument();
  const errorPromise = loadScriptResourceOnce("./broken.js", "broken", { document: errorDocument });
  errorDocument.createdScripts[0].dispatch("error");
  await assert.rejects(() => errorPromise, /脚本加载失败：\.\/broken\.js/);

  console.log("script loader tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
