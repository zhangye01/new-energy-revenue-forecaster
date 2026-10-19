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
    if (reason === "conflict") return "其他页面已保存更新。本页自动保存已暂停；可先下载本页备份，再重新载入已保存版本。";
    if (reason === "not_initialized") return "项目数据尚未读取完成，当前改动暂未保存。";
    if (reason === "safe_storage_unavailable") return "浏览器无法安全保存多页面数据。请先下载本页备份，再使用支持本地存储的浏览器打开。";
    if (reason === "db_read_failed") return "尚未成功读取已保存数据，已暂停写入以保护原项目。请先下载本页备份后重试。";
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
      onStorageStateChange = () => {},
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
      onStorageStateChange,
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
      lastLocalWriteAt: result.lastLocalWriteAt,
      ...(result.completion ? { completion: result.completion } : {})
    };
  }

  function applyStorageStatus(input = {}) {
    const { refs = {}, status = {} } = input;
    // Keep a warning visible while a retry is pending; unrelated topbar messages cannot hide it.
    if (!refs.notice || status.state === "pending") return;
    refs.notice.hidden = status.state === "saved";
    if (refs.message) refs.message.textContent = status.state === "saved" ? "" : buildStorageRiskMessage(status.reason);
    if (refs.notice.dataset) refs.notice.dataset.state = status.state;
    if (refs.reloadButton) refs.reloadButton.hidden = status.state !== "conflict" && status.reason !== "db_read_failed";
    if (refs.backupButton) refs.backupButton.hidden = status.state === "saved";
  }

  return Object.freeze({
    buildStorageRiskMessage,
    persistAppDataSnapshot,
    applyStorageStatus
  });
});
