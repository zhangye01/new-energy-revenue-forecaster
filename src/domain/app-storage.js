"use strict";

(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_APP_STORAGE = api;
  if (root.window && root.window !== root) {
    root.window.NE_APP_STORAGE = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (root) {
  function resolveGlobalValue(name) {
    try {
      return typeof root[name] !== "undefined" ? root[name] : null;
    } catch {
      return null;
    }
  }

  function readRawFromStorage(storage, key, options = {}) {
    if (!storage || typeof storage.getItem !== "function") {
      return "";
    }
    try {
      return storage.getItem(key) || "";
    } catch (error) {
      if (typeof options.onError === "function") options.onError(error);
      return "";
    }
  }

  function writeRawToStorage(storage, key, raw, options = {}) {
    if (!storage || typeof storage.setItem !== "function") {
      return false;
    }
    try {
      storage.setItem(key, raw);
      return true;
    } catch (error) {
      if (typeof options.onError === "function") options.onError(error);
      return false;
    }
  }

  function readJsonFromStorage(storage, key, options = {}) {
    const raw = readRawFromStorage(storage, key, { onError: options.onReadError });
    if (!raw) {
      return { found: false, value: null };
    }
    try {
      return { found: true, value: JSON.parse(raw) };
    } catch (error) {
      if (typeof options.onParseError === "function") options.onParseError(error, raw);
      return { found: false, value: null, error };
    }
  }

  function writeJsonToStorage(storage, key, value, options = {}) {
    let raw = "";
    try {
      raw = JSON.stringify(value);
    } catch (error) {
      if (typeof options.onError === "function") options.onError(error);
      return false;
    }
    return writeRawToStorage(storage, key, raw, options);
  }

  function readJsonFromFirstStorage(key, storages, options = {}) {
    const storageList = Array.isArray(storages) ? storages : [];
    for (const storage of storageList) {
      const result = readJsonFromStorage(storage, key, options);
      if (result.found) return result;
    }
    return { found: false, value: null };
  }

  function writeJsonToStorages(key, value, storages, options = {}) {
    const storageList = Array.isArray(storages) ? storages : [];
    return storageList.map((storage) => ({
      storage,
      ok: writeJsonToStorage(storage, key, value, options)
    }));
  }

  function snapshotTime(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return 0;
    const time = Date.parse(snapshot.savedAt || "");
    return Number.isFinite(time) ? time : 0;
  }

  function selectLatestSnapshot(localSnapshot, dbSnapshot) {
    return snapshotTime(dbSnapshot) > snapshotTime(localSnapshot) ? dbSnapshot : localSnapshot;
  }

  function createIndexedDbSnapshotStore(options = {}) {
    const indexedDb = Object.prototype.hasOwnProperty.call(options, "indexedDB")
      ? options.indexedDB
      : resolveGlobalValue("indexedDB");
    const dbName = options.dbName;
    const dbVersion = options.dbVersion || 1;
    const storeName = options.storeName;
    const dbKey = options.dbKey;
    let dbPromise = null;

    function supportsIndexedDb() {
      return Boolean(indexedDb && typeof indexedDb.open === "function" && dbName && storeName && dbKey);
    }

    function openDb() {
      if (!supportsIndexedDb()) {
        return Promise.resolve(null);
      }
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDb.open(dbName, dbVersion);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("打开IndexedDB失败"));
      }).catch((error) => {
        dbPromise = null;
        throw error;
      });
      return dbPromise;
    }

    async function readSnapshot() {
      const db = await openDb();
      if (!db) return null;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const request = store.get(dbKey);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("读取IndexedDB快照失败"));
      });
    }

    async function writeSnapshot(snapshot) {
      const db = await openDb();
      if (!db) return false;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error("写入IndexedDB快照失败"));
        tx.objectStore(storeName).put(snapshot, dbKey);
      });
    }

    return {
      supportsIndexedDb,
      readSnapshot,
      writeSnapshot
    };
  }

  function createAppDataSnapshotStore(options = {}) {
    const storageKey = options.storageKey;
    const localStorageRef = Object.prototype.hasOwnProperty.call(options, "localStorage")
      ? options.localStorage
      : resolveGlobalValue("localStorage");
    const indexedDbStore = createIndexedDbSnapshotStore(options);

    function supportsIndexedDb() {
      return indexedDbStore.supportsIndexedDb();
    }

    function readLocalSnapshot(callbacks = {}) {
      return readJsonFromStorage(localStorageRef, storageKey, {
        onReadError: callbacks.onLocalReadError,
        onParseError: callbacks.onLocalParseError
      }).value;
    }

    async function readLatestSnapshot(callbacks = {}) {
      const localSnapshot = readLocalSnapshot(callbacks);
      let dbSnapshot = null;
      try {
        dbSnapshot = await indexedDbStore.readSnapshot();
      } catch (error) {
        if (typeof callbacks.onDbReadError === "function") callbacks.onDbReadError(error);
      }
      return selectLatestSnapshot(localSnapshot, dbSnapshot);
    }

    function writeLocalSnapshot(snapshot, callbacks = {}) {
      return writeJsonToStorage(localStorageRef, storageKey, snapshot, {
        onError: callbacks.onLocalWriteError
      });
    }

    function writeDbSnapshot(snapshot) {
      return indexedDbStore.writeSnapshot(snapshot);
    }

    return {
      supportsIndexedDb,
      readLocalSnapshot,
      readLatestSnapshot,
      writeLocalSnapshot,
      writeDbSnapshot
    };
  }

  return {
    readRawFromStorage,
    writeRawToStorage,
    readJsonFromStorage,
    writeJsonToStorage,
    readJsonFromFirstStorage,
    writeJsonToStorages,
    snapshotTime,
    selectLatestSnapshot,
    createIndexedDbSnapshotStore,
    createAppDataSnapshotStore
  };
});
