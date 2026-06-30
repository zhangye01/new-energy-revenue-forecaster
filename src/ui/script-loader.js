"use strict";

(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_SCRIPT_LOADER = api;
  if (root.window && root.window !== root) {
    root.window.NE_SCRIPT_LOADER = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (root) {
  function waitForLoadingScriptResource(existingLoading, src) {
    return new Promise((resolve, reject) => {
      existingLoading.addEventListener("load", () => resolve(), { once: true });
      existingLoading.addEventListener("error", () => reject(new Error(`脚本加载失败：${src}`)), { once: true });
    });
  }

  function createScriptResourceLoadPromise(documentRef, src, key, loadedTag) {
    return new Promise((resolve, reject) => {
      const script = documentRef.createElement("script");
      script.async = true;
      script.src = src;
      script.dataset.loadingKey = key;
      script.addEventListener("load", () => {
        script.setAttribute(loadedTag, "1");
        resolve();
      }, { once: true });
      script.addEventListener("error", () => {
        reject(new Error(`脚本加载失败：${src}`));
      }, { once: true });
      documentRef.head.appendChild(script);
    });
  }

  function loadScriptResourceOnce(src, key, deps = {}) {
    const documentRef = deps.document || root.document;
    if (!documentRef) {
      return Promise.reject(new Error("当前环境不支持动态加载脚本"));
    }
    const loadedTag = `data-loaded-${key}`;
    const existingLoaded = documentRef.querySelector(`script[${loadedTag}="1"]`);
    if (existingLoaded) {
      return Promise.resolve();
    }
    const existingLoading = documentRef.querySelector(`script[data-loading-key="${key}"]`);
    if (existingLoading) {
      return waitForLoadingScriptResource(existingLoading, src);
    }
    return createScriptResourceLoadPromise(documentRef, src, key, loadedTag);
  }

  return Object.freeze({
    loadScriptResourceOnce
  });
});
