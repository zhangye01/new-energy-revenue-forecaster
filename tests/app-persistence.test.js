"use strict";

const assert = require("node:assert/strict");
const {
  buildStorageRiskMessage,
  persistAppDataSnapshot,
  applyStorageStatus
} = require("../src/ui/app-persistence");

assert.equal(
  buildStorageRiskMessage("indexeddb_unsupported"),
  "浏览器不支持大容量本地存储，当前改动可能在刷新后丢失。"
);
assert.equal(
  buildStorageRiskMessage("db_write_failed"),
  "本地存储不可用，当前改动可能在刷新后丢失。"
);

let capturedInput = null;
const warnings = [];
let warningShown = false;
const topMessages = [];
const result = persistAppDataSnapshot({
  appStorage: {
    persistSnapshotWithFallback(input) {
      capturedInput = input;
      return { storageMode: "idb_only", lastLocalWriteAt: 12000 };
    }
  },
  store: { id: "store" },
  snapshot: { payload: { id: "p1" } },
  hasLocalStorage: true,
  storageMode: "hybrid",
  forceLocal: true,
  nowMs: 12000,
  lastLocalWriteAt: 8000,
  intervalMs: 4000,
  sequence: 2,
  isLatestSequence: (seq) => seq === 2,
  getStorageWarningShown: () => warningShown,
  setStorageWarningShown: (value) => {
    warningShown = value;
  },
  setTopMeta: (message) => topMessages.push(message),
  consoleRef: {
    warn: (...args) => warnings.push(args)
  }
});

assert.equal(result.storageMode, "idb_only");
assert.equal(result.lastLocalWriteAt, 12000);
assert.equal(capturedInput.store.id, "store");
assert.deepEqual(capturedInput.snapshot, { payload: { id: "p1" } });
assert.equal(capturedInput.hasLocalStorage, true);
assert.equal(capturedInput.storageMode, "hybrid");
assert.equal(capturedInput.forceLocal, true);
assert.equal(capturedInput.nowMs, 12000);
assert.equal(capturedInput.lastLocalWriteAt, 8000);
assert.equal(capturedInput.intervalMs, 4000);
assert.equal(capturedInput.sequence, 2);
assert.equal(capturedInput.isLatestSequence(2), true);

capturedInput.onLocalWriteError(new Error("quota"));
capturedInput.onDbWriteError(new Error("idb failed"));
assert.equal(warnings.length, 2);
assert.equal(warnings[0][0], "localStorage容量不足，已切换IndexedDB持久化。");
assert.equal(warnings[1][0], "写入IndexedDB业务快照失败。");

capturedInput.onStorageRisk("indexeddb_unsupported");
capturedInput.onStorageRisk("db_write_failed");
assert.equal(warningShown, true);
assert.deepEqual(topMessages, ["浏览器不支持大容量本地存储，当前改动可能在刷新后丢失。"]);

capturedInput.onStorageAvailable();
assert.equal(warningShown, false);
capturedInput.onStorageRisk("db_write_failed");
assert.deepEqual(topMessages, [
  "浏览器不支持大容量本地存储，当前改动可能在刷新后丢失。",
  "本地存储不可用，当前改动可能在刷新后丢失。"
]);

assert.deepEqual(
  persistAppDataSnapshot({
    storageMode: "hybrid",
    lastLocalWriteAt: 4000
  }),
  { storageMode: "hybrid", lastLocalWriteAt: 4000 }
);

assert.match(buildStorageRiskMessage("conflict"), /自动保存已暂停/);
assert.match(buildStorageRiskMessage("not_initialized"), /尚未读取完成/);
assert.match(buildStorageRiskMessage("safe_storage_unavailable"), /下载本页备份/);
const noticeRefs = { notice: { hidden: true, dataset: {} }, message: {}, reloadButton: {}, backupButton: {} };
applyStorageStatus({ refs: noticeRefs, status: { state: "conflict", reason: "conflict" } });
assert.equal(noticeRefs.notice.hidden, false);
assert.equal(noticeRefs.reloadButton.hidden, false);
assert.equal(noticeRefs.backupButton.hidden, false);
const conflictText = noticeRefs.message.textContent;
applyStorageStatus({ refs: noticeRefs, status: { state: "pending" } });
assert.equal(noticeRefs.notice.hidden, false, "retrying does not hide the persistent conflict warning");
assert.equal(noticeRefs.message.textContent, conflictText);
applyStorageStatus({ refs: noticeRefs, status: { state: "saved" } });
assert.equal(noticeRefs.notice.hidden, true);
console.log("app persistence tests passed");
