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
