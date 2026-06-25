"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_APP_PERSISTENCE = api;
  if (root.window && root.window !== root) {
    root.window.NE_APP_PERSISTENCE = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function buildStorageRiskMessage(reason) {
    return reason === "indexeddb_unsupported"
      ? "浏览器不支持大容量本地存储，当前改动可能在刷新后丢失。"
      : "本地存储不可用，当前改动可能在刷新后丢失。";
  }

  function persistAppDataSnapshot(input = {}) {
    const {
      appStorage = {},
      store,
      snapshot,
      hasLocalStorage = false,
      storageMode = "",
      forceLocal = false,
      nowMs = Date.now(),
      lastLocalWriteAt = 0,
      intervalMs = 0,
      sequence = 0,
      isLatestSequence = () => true,
      getStorageWarningShown = () => false,
      setStorageWarningShown = () => {},
      setTopMeta = () => {},
      consoleRef = console
    } = input;
    const result = appStorage.persistSnapshotWithFallback?.({
      store,
      snapshot,
      hasLocalStorage,
      storageMode,
      forceLocal,
      nowMs,
      lastLocalWriteAt,
      intervalMs,
      sequence,
      isLatestSequence,
      onLocalWriteError: (error) => {
        consoleRef.warn?.("localStorage容量不足，已切换IndexedDB持久化。", error);
      },
      onDbWriteError: (error) => {
        consoleRef.warn?.("写入IndexedDB业务快照失败。", error);
      },
      onStorageAvailable: () => {
        setStorageWarningShown(false);
      },
      onStorageRisk: (reason) => {
        if (getStorageWarningShown()) return;
        setStorageWarningShown(true);
        setTopMeta(buildStorageRiskMessage(reason));
      }
    }) || { storageMode, lastLocalWriteAt };
    return {
      storageMode: result.storageMode,
      lastLocalWriteAt: result.lastLocalWriteAt
    };
  }

  return Object.freeze({
    buildStorageRiskMessage,
    persistAppDataSnapshot
  });
});
