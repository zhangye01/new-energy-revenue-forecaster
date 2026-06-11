"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  collectScriptSourcesFromHtml,
  collectWindowGlobalExportsFromText
} = require("./architecture-check");

const ROOT = path.resolve(__dirname, "..");
const EXCLUDED_SCRIPTS = new Set(["app.js"]);
const EXCLUDED_PREFIXES = ["vendor/"];
const EXECUTION_TIMEOUT_MS = 2000;

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      const normalizedKey = String(key);
      return values.has(normalizedKey) ? values.get(normalizedKey) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    },
    clear() {
      values.clear();
    }
  };
}

function createFakeStyleDeclaration() {
  const values = {};
  return {
    setProperty(name, value) {
      values[name] = String(value);
    },
    removeProperty(name) {
      delete values[name];
    }
  };
}

function createFakeElement(selector = "") {
  const attributes = {};
  const element = {
    selector,
    attributes,
    children: [],
    classList: {
      add() {},
      remove() {},
      toggle() {
        return false;
      },
      contains() {
        return false;
      }
    },
    dataset: {},
    style: createFakeStyleDeclaration(),
    value: "",
    checked: false,
    disabled: false,
    hidden: false,
    innerHTML: "",
    textContent: "",
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {},
    focus() {},
    reset() {},
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete attributes[name];
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    querySelector(childSelector) {
      return createFakeElement(childSelector);
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    }
  };
  return element;
}

function createFakeDocument() {
  const body = createFakeElement("body");
  const documentElement = createFakeElement("html");
  return {
    body,
    documentElement,
    addEventListener() {},
    removeEventListener() {},
    createElement(tagName) {
      return createFakeElement(tagName);
    },
    querySelector(selector) {
      return createFakeElement(selector);
    },
    querySelectorAll() {
      return [];
    }
  };
}

function createBrowserSandbox() {
  const sandbox = {
    console,
    document: createFakeDocument(),
    navigator: { userAgent: "module-load-smoke" },
    location: {
      href: "http://127.0.0.1/index.html",
      origin: "http://127.0.0.1",
      pathname: "/index.html"
    },
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
    indexedDB: null,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame(callback) {
      return setTimeout(() => callback(Date.now()), 0);
    },
    cancelAnimationFrame(timerId) {
      clearTimeout(timerId);
    },
    URL,
    Blob: typeof Blob === "undefined" ? undefined : Blob,
    btoa(value) {
      return Buffer.from(String(value), "binary").toString("base64");
    },
    atob(value) {
      return Buffer.from(String(value), "base64").toString("binary");
    }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function isBrowserModuleScript(scriptPath) {
  if (!scriptPath || EXCLUDED_SCRIPTS.has(scriptPath)) return false;
  return !EXCLUDED_PREFIXES.some((prefix) => scriptPath.startsWith(prefix));
}

function collectBrowserModuleScripts(html) {
  return collectScriptSourcesFromHtml(html).filter(isBrowserModuleScript);
}

function toScriptSource(scriptPath) {
  return {
    scriptPath,
    sourceText: readText(scriptPath)
  };
}

function collectExpectedGlobalsFromSources(scriptSources) {
  const globals = new Set();
  scriptSources.forEach(({ sourceText }) => {
    collectWindowGlobalExportsFromText(sourceText).forEach((globalName) => {
      globals.add(globalName);
    });
  });
  return Array.from(globals).sort();
}

function executeBrowserModuleSources(scriptSources, sandbox = createBrowserSandbox()) {
  const context = vm.createContext(sandbox);
  const loaded = [];
  scriptSources.forEach(({ scriptPath, sourceText }) => {
    vm.runInContext(sourceText, context, {
      filename: scriptPath,
      timeout: EXECUTION_TIMEOUT_MS
    });
    loaded.push(scriptPath);
  });
  return { sandbox, loaded };
}

function executeBrowserModuleScripts(scriptPaths, sandbox = createBrowserSandbox()) {
  return executeBrowserModuleSources(scriptPaths.map(toScriptSource), sandbox);
}

function collectMissingGlobals(sandbox, expectedGlobals) {
  return expectedGlobals.filter((globalName) => typeof sandbox[globalName] === "undefined");
}

function run() {
  const scriptPaths = collectBrowserModuleScripts(readText("index.html"));
  const scriptSources = scriptPaths.map(toScriptSource);
  const expectedGlobals = collectExpectedGlobalsFromSources(scriptSources);
  try {
    const { sandbox } = executeBrowserModuleSources(scriptSources);
    const missingGlobals = collectMissingGlobals(sandbox, expectedGlobals);
    if (missingGlobals.length) {
      console.error(`module-load-smoke failed: browser modules did not publish globals: ${missingGlobals.join(", ")}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`module-load-smoke failed: ${error.message}`);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
  console.log(`module load smoke passed (${scriptPaths.length} scripts, ${expectedGlobals.length} globals)`);
}

if (require.main === module) {
  run();
}

module.exports = {
  collectBrowserModuleScripts,
  collectExpectedGlobalsFromSources,
  collectMissingGlobals,
  createBrowserSandbox,
  createFakeDocument,
  createFakeElement,
  createMemoryStorage,
  createFakeStyleDeclaration,
  executeBrowserModuleScripts,
  executeBrowserModuleSources,
  isBrowserModuleScript
};
