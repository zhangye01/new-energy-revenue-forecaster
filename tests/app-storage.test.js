"use strict";

const assert = require("node:assert/strict");
const appStorage = require("../src/domain/app-storage");

assert.equal(appStorage.resolveBrowserStorage("localStorage"), null);

function createMemoryStorage(options = {}) {
  const map = new Map();
  return {
    getItem(key) {
      if (options.throwOnGet) throw new Error("get failed");
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      if (options.throwOnSet) throw new Error("set failed");
      map.set(key, String(value));
    },
    raw(key) {
      return map.get(key);
    }
  };
}

function flushAsyncStorageCallbacks() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

{
  const storage = createMemoryStorage();
  const ok = appStorage.writeJsonToStorage(storage, "demo", { a: 1 });
  assert.equal(ok, true);
  assert.equal(storage.raw("demo"), "{\"a\":1}");
  assert.deepEqual(appStorage.readJsonFromStorage(storage, "demo"), { found: true, value: { a: 1 } });
}

{
  const storage = createMemoryStorage();
  storage.setItem("bad", "{");
  let parseFailed = false;
  const result = appStorage.readJsonFromStorage(storage, "bad", {
    onParseError: () => {
      parseFailed = true;
    }
  });
  assert.equal(result.found, false);
  assert.equal(parseFailed, true);
}

{
  const broken = createMemoryStorage({ throwOnGet: true });
  const fallback = createMemoryStorage();
  appStorage.writeJsonToStorage(fallback, "auth", { loggedIn: true });
  let readFailed = false;
  const result = appStorage.readJsonFromFirstStorage("auth", [broken, fallback], {
    onReadError: () => {
      readFailed = true;
    }
  });
  assert.equal(readFailed, true);
  assert.deepEqual(result.value, { loggedIn: true });
}

{
  const oldSnapshot = { savedAt: "2026-01-01T00:00:00.000Z", payload: { id: "old" } };
  const nextSnapshot = { savedAt: "2026-01-02T00:00:00.000Z", payload: { id: "next" } };
  assert.equal(appStorage.snapshotTime(oldSnapshot), Date.parse(oldSnapshot.savedAt));
  assert.equal(appStorage.selectLatestSnapshot(oldSnapshot, nextSnapshot), nextSnapshot);
  assert.equal(appStorage.selectLatestSnapshot(nextSnapshot, oldSnapshot), nextSnapshot);
  assert.equal(appStorage.selectLatestSnapshot(null, oldSnapshot), oldSnapshot);
}

{
  let writeCount = 0;
  const store = {
    writeLocalSnapshot() {
      writeCount += 1;
      return true;
    }
  };
  const skipped = appStorage.writeLocalSnapshotIfDue({
    store,
    snapshot: { payload: {} },
    hasLocalStorage: true,
    storageMode: "",
    forceLocal: false,
    nowMs: 5000,
    lastLocalWriteAt: 4000,
    intervalMs: 4000
  });
  assert.deepEqual(skipped, {
    attempted: false,
    succeeded: false,
    storageMode: "",
    lastLocalWriteAt: 4000
  });
  assert.equal(writeCount, 0);

  const written = appStorage.writeLocalSnapshotIfDue({
    store,
    snapshot: { payload: {} },
    hasLocalStorage: true,
    storageMode: "",
    forceLocal: true,
    nowMs: 6000,
    lastLocalWriteAt: 4000,
    intervalMs: 4000
  });
  assert.deepEqual(written, {
    attempted: true,
    succeeded: true,
    storageMode: "",
    lastLocalWriteAt: 6000
  });
  assert.equal(writeCount, 1);
}

{
  let capturedError = "";
  const store = {
    writeLocalSnapshot(snapshot, callbacks = {}) {
      callbacks.onLocalWriteError?.(new Error("quota"));
      return false;
    }
  };
  const result = appStorage.writeLocalSnapshotIfDue({
    store,
    snapshot: { payload: {} },
    hasLocalStorage: true,
    storageMode: "",
    nowMs: 9000,
    lastLocalWriteAt: 8000,
    intervalMs: 500,
    onLocalWriteError: (error) => {
      capturedError = error.message;
    }
  });
  assert.deepEqual(result, {
    attempted: true,
    succeeded: false,
    storageMode: "idb_only",
    lastLocalWriteAt: 8000
  });
  assert.equal(capturedError, "quota");
}

(async () => {
  const calls = [];
  let localWrites = 0;
  const store = {
    supportsIndexedDb: () => true,
    writeLocalSnapshot() {
      localWrites += 1;
      return true;
    },
    writeDbSnapshot: () => Promise.resolve(true)
  };
  const result = appStorage.persistSnapshotWithFallback({
    store,
    snapshot: { payload: { id: "ok" } },
    hasLocalStorage: true,
    forceLocal: true,
    nowMs: 12000,
    lastLocalWriteAt: 10000,
    intervalMs: 4000,
    sequence: 2,
    isLatestSequence: (seq) => seq === 2,
    onStorageAvailable: () => calls.push("available")
  });
  assert.equal(localWrites, 1);
  assert.equal(result.storageMode, "");
  assert.equal(result.lastLocalWriteAt, 12000);
  assert.equal(calls.length, 1);
  await flushAsyncStorageCallbacks();
  assert.deepEqual(calls, ["available", "available"]);
})();

(async () => {
  const calls = [];
  const store = {
    supportsIndexedDb: () => true,
    writeLocalSnapshot(_snapshot, callbacks = {}) {
      callbacks.onLocalWriteError?.(new Error("quota"));
      return false;
    },
    writeDbSnapshot: () => Promise.reject(new Error("idb failed"))
  };
  const result = appStorage.persistSnapshotWithFallback({
    store,
    snapshot: { payload: { id: "risk" } },
    hasLocalStorage: true,
    nowMs: 13000,
    lastLocalWriteAt: 10000,
    intervalMs: 100,
    sequence: 3,
    isLatestSequence: (seq) => seq === 3,
    onLocalWriteError: (error) => calls.push(`local:${error.message}`),
    onDbWriteError: (error) => calls.push(`db:${error.message}`),
    onStorageRisk: (reason) => calls.push(`risk:${reason}`)
  });
  assert.equal(result.storageMode, "idb_only");
  assert.equal(result.lastLocalWriteAt, 10000);
  await flushAsyncStorageCallbacks();
  assert.deepEqual(calls, ["local:quota", "db:idb failed", "risk:db_write_failed"]);
})();

(async () => {
  const calls = [];
  const store = {
    supportsIndexedDb: () => false,
    writeLocalSnapshot() {
      return false;
    },
    writeDbSnapshot: () => Promise.resolve(false)
  };
  appStorage.persistSnapshotWithFallback({
    store,
    snapshot: { payload: { id: "unsupported" } },
    hasLocalStorage: true,
    nowMs: 14000,
    lastLocalWriteAt: 10000,
    intervalMs: 100,
    sequence: 4,
    isLatestSequence: (seq) => seq === 4,
    onStorageAvailable: () => calls.push("available"),
    onStorageRisk: (reason) => calls.push(`risk:${reason}`)
  });
  assert.deepEqual(calls, ["risk:indexeddb_unsupported"]);
  await flushAsyncStorageCallbacks();
  assert.deepEqual(calls, ["risk:indexeddb_unsupported", "available"]);
})();

(async () => {
  const storage = createMemoryStorage();
  const store = appStorage.createAppDataSnapshotStore({
    storageKey: "app",
    localStorage: storage,
    indexedDB: null,
    dbName: "demo",
    storeName: "snapshots",
    dbKey: "app_data"
  });
  assert.equal(store.supportsIndexedDb(), false);
  assert.equal(store.writeLocalSnapshot({ savedAt: "2026-01-01T00:00:00.000Z", payload: { a: 1 } }), true);
  assert.deepEqual(store.readLocalSnapshot(), { savedAt: "2026-01-01T00:00:00.000Z", payload: { a: 1 } });
  assert.deepEqual(await store.readLatestSnapshot(), { savedAt: "2026-01-01T00:00:00.000Z", payload: { a: 1 } });
  assert.equal(await store.writeDbSnapshot({ payload: {} }), false);
  console.log("app storage tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
