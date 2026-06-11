"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { collectScriptSourcesFromHtml } = require("./architecture-check");
const {
  createBrowserSandbox,
  executeBrowserModuleScripts
} = require("./module-load-smoke");

const ROOT = path.resolve(__dirname, "..");
const ASYNC_FLUSH_ROUNDS = 4;

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function collectAppBootstrapScripts(html) {
  return collectScriptSourcesFromHtml(html)
    .filter((scriptPath) => !scriptPath.startsWith("vendor/"));
}

function createEchartsStub() {
  const maps = new Map();
  return {
    init() {
      let disposed = false;
      return {
        clear() {},
        setOption() {},
        resize() {},
        on() {},
        off() {},
        dispose() {
          disposed = true;
        },
        isDisposed() {
          return disposed;
        }
      };
    },
    getMap(name) {
      return maps.get(name) || null;
    },
    registerMap(name, geoJson) {
      maps.set(name, { geoJson });
    }
  };
}

function prepareAppBootstrapSandbox(sandbox = createBrowserSandbox()) {
  sandbox.setTimeout = (callback) => {
    const timerId = setImmediate(() => {
      if (typeof callback === "function") callback();
    });
    return timerId;
  };
  sandbox.clearTimeout = (timerId) => {
    clearImmediate(timerId);
  };
  sandbox.setInterval = () => 0;
  sandbox.clearInterval = () => {};
  sandbox.requestAnimationFrame = (callback) => {
    const timerId = setImmediate(() => {
      if (typeof callback === "function") callback(Date.now());
    });
    return timerId;
  };
  sandbox.cancelAnimationFrame = (timerId) => {
    clearImmediate(timerId);
  };
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = () => true;
  sandbox.confirm = () => true;
  sandbox.prompt = () => "";
  sandbox.echarts = createEchartsStub();
  return sandbox;
}

function waitForAsyncBootstrap(rounds = ASYNC_FLUSH_ROUNDS) {
  let promise = Promise.resolve();
  for (let index = 0; index < rounds; index += 1) {
    promise = promise.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return promise;
}

async function runAppBootstrapSmoke(options = {}) {
  const html = options.html || readText("index.html");
  const scriptPaths = options.scriptPaths || collectAppBootstrapScripts(html);
  const sandbox = prepareAppBootstrapSandbox(options.sandbox);
  const failures = [];

  function captureFailure(error) {
    failures.push(error);
  }

  process.on("unhandledRejection", captureFailure);
  process.on("uncaughtException", captureFailure);
  try {
    executeBrowserModuleScripts(scriptPaths, sandbox);
    await waitForAsyncBootstrap(options.asyncFlushRounds);
  } finally {
    process.off("unhandledRejection", captureFailure);
    process.off("uncaughtException", captureFailure);
  }

  if (failures.length) {
    const firstFailure = failures[0];
    throw firstFailure instanceof Error ? firstFailure : new Error(String(firstFailure));
  }

  return {
    scriptCount: scriptPaths.length,
    activePage: sandbox.NE_RUNTIME?.appState?.activePage || ""
  };
}

async function run() {
  try {
    const result = await runAppBootstrapSmoke();
    console.log(`app bootstrap smoke passed (${result.scriptCount} scripts, active page: ${result.activePage})`);
  } catch (error) {
    console.error(`app-bootstrap-smoke failed: ${error.message}`);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  void run();
}

module.exports = {
  collectAppBootstrapScripts,
  createEchartsStub,
  prepareAppBootstrapSandbox,
  runAppBootstrapSmoke,
  waitForAsyncBootstrap
};
