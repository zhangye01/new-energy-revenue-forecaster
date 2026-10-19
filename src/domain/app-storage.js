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

    async function compareAndWrite(snapshot, expected, beforeWrite) {
      const db = await openDb();
      if (!db) return { ok: false, reason: "indexeddb_unsupported" };
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const entries = Object.entries(expected);
        const found = {};
        let result = { ok: false, reason: "conflict" };
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error("写入IndexedDB快照失败"));
        function check(index) {
          if (index < entries.length) {
            const [key, identity] = entries[index];
            const request = store.get(key);
            request.onsuccess = () => {
              found[key] = request.result || null;
              if (snapshotIdentity(found[key]) !== identity) {
                result = { ok: false, reason: "conflict", latest: found[key] };
              } else check(index + 1);
            };
            return;
          }
          const conflict = beforeWrite?.();
          if (conflict) { result = { ok: false, reason: "conflict", latest: conflict }; return; }
          store.put(snapshot, dbKey);
          result = { ok: true, snapshot };
        }
        check(0);
      });
    }

    return {
      supportsIndexedDb,
      readSnapshot,
      writeSnapshot,
      compareAndWrite
    };
  }

  function snapshotIdentity(snapshot) {
    if (!snapshot) return "";
    if (snapshot.storageRevision?.id) return `revision:${snapshot.storageRevision.id}`;
    // Legacy records have no revision. Compare their complete content, never just savedAt.
    return JSON.stringify(snapshot);
  }

  function snapshotDataSignature(snapshot) {
    const payload = snapshot?.payload;
    // Navigation, account display and filters do not change stored project data.
    return JSON.stringify(Array.isArray(payload?.projects) ? payload.projects : payload);
  }

  function createAppDataSnapshotStore(options = {}) {
    const storageKey = options.storageKey;
    const protectedKey = `${storageKey}:revisioned`;
    const protectedDbKey = `${options.dbKey}:revisioned`;
    const localStorageRef = Object.prototype.hasOwnProperty.call(options, "localStorage")
      ? options.localStorage : resolveGlobalValue("localStorage");
    const locks = Object.prototype.hasOwnProperty.call(options, "locks")
      ? options.locks : resolveGlobalValue("navigator")?.locks;
    const indexedDbStore = createIndexedDbSnapshotStore(options);
    const protectedDbStore = createIndexedDbSnapshotStore({ ...options, dbKey: protectedDbKey });
    let ready = false, dbReadable = false, conflictState = null, pendingSnapshot = null;
    let baseline = null, expectedLocal = "", expectedLegacyLocal = "";
    let expectedDb = "", expectedLegacyDb = "", lastDataSignature;
    let writeQueue = Promise.resolve(), serial = 0, writing = false;
    const queuedSignatures = new Map();

    function supportsIndexedDb() { return indexedDbStore.supportsIndexedDb(); }

    function readLocal(key, callbacks = {}) {
      return readJsonFromStorage(localStorageRef, key, {
        onReadError: callbacks.onLocalReadError, onParseError: callbacks.onLocalParseError
      }).value;
    }

    function readLocalSnapshot(callbacks = {}) { return readLocal(storageKey, callbacks); }

    async function readLatestSnapshot(callbacks = {}) {
      await writeQueue;
      ready = false;
      const local = readLocal(protectedKey, callbacks), legacyLocal = readLocalSnapshot(callbacks);
      let db = null, legacyDb = null;
      dbReadable = !supportsIndexedDb();
      try {
        if (supportsIndexedDb()) {
          db = await protectedDbStore.readSnapshot();
          if (!db) legacyDb = await indexedDbStore.readSnapshot();
          dbReadable = true;
        }
      } catch (error) { callbacks.onDbReadError?.(error); }
      // Compare ancestry, not wall clocks: local-only commits may be newer when IDB returns.
      const localId = local?.storageRevision?.id, dbId = db?.storageRevision?.id;
      const localDescends = localId && dbId && local.storageRevision.ancestors?.includes(dbId);
      const dbDescends = localId && dbId && db.storageRevision.ancestors?.includes(localId);
      const diverged = local && db && snapshotIdentity(local) !== snapshotIdentity(db) && !localDescends && !dbDescends;
      baseline = localDescends ? local : db || local || selectLatestSnapshot(legacyLocal, legacyDb);
      expectedLocal = snapshotIdentity(local); expectedLegacyLocal = snapshotIdentity(legacyLocal);
      expectedDb = snapshotIdentity(db); expectedLegacyDb = snapshotIdentity(legacyDb);
      lastDataSignature = snapshotDataSignature(baseline);
      conflictState = diverged ? { latest: db, alternate: local } : null;
      pendingSnapshot = diverged ? JSON.parse(JSON.stringify(local)) : null;
      ready = true;
      return baseline;
    }

    function writeLocalSnapshot(snapshot, callbacks = {}) {
      return writeJsonToStorage(localStorageRef, storageKey, snapshot, { onError: callbacks.onLocalWriteError });
    }
    function writeDbSnapshot(snapshot) { return indexedDbStore.writeSnapshot(snapshot); }

    function localConflict() {
      const current = readLocal(protectedKey);
      if (snapshotIdentity(current) !== expectedLocal) return current || { missing: true };
      if (!expectedLocal && snapshotIdentity(readLocalSnapshot()) !== expectedLegacyLocal) {
        return readLocalSnapshot() || { missing: true };
      }
      return null;
    }

    function nextRevision(snapshot) {
      const random = resolveGlobalValue("crypto")?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      return { ...snapshot, storageRevision: {
        id: random, parentId: baseline?.storageRevision?.id || "", version: 1,
        ancestors: [baseline?.storageRevision?.id, ...(baseline?.storageRevision?.ancestors || [])].filter(Boolean).slice(0, 64)
      } };
    }

    function accept(snapshot, localWritten, requestSerial) {
      baseline = snapshot;
      lastDataSignature = snapshotDataSignature(snapshot);
      if (localWritten) expectedLocal = snapshotIdentity(snapshot);
      if (requestSerial === serial) pendingSnapshot = null;
      return { ok: true, snapshot, localWritten };
    }

    async function commitPrepared(snapshot, requestSerial) {
      if (!ready) return { ok: false, reason: "not_initialized" };
      if (conflictState) return { ok: false, reason: "conflict", latest: conflictState.latest };
      if (supportsIndexedDb() && !dbReadable) return { ok: false, reason: "db_read_failed" };
      if (baseline && snapshotDataSignature(snapshot) === lastDataSignature) {
        if (requestSerial === serial) pendingSnapshot = null;
        return { ok: true, unchanged: true, snapshot: baseline };
      }
      const next = nextRevision(snapshot);
      let result;
      if (supportsIndexedDb()) {
        const expected = { [protectedDbKey]: expectedDb };
        if (!expectedDb) expected[options.dbKey] = expectedLegacyDb;
        result = await protectedDbStore.compareAndWrite(next, expected, localConflict);
        if (result.ok) {
          expectedDb = snapshotIdentity(next);
          const localWritten = writeJsonToStorage(localStorageRef, protectedKey, next);
          return accept(next, localWritten, requestSerial);
        }
      } else if (locks?.request) {
        result = await locks.request(`ne-snapshot:${storageKey}`, async () => {
          const latest = localConflict();
          if (latest) return { ok: false, reason: "conflict", latest };
          return writeJsonToStorage(localStorageRef, protectedKey, next)
            ? accept(next, true, requestSerial) : { ok: false, reason: "local_write_failed" };
        });
      } else result = { ok: false, reason: "safe_storage_unavailable" };
      if (result.reason === "conflict") conflictState = { latest: result.latest || null };
      return result;
    }

    function commitSnapshot(snapshot) {
      // Capture now: IndexedDB opening/queuing must not observe later in-memory mutations.
      let captured;
      try { captured = JSON.parse(JSON.stringify(snapshot)); }
      catch (error) { return Promise.resolve({ ok: false, reason: "snapshot_invalid", error }); }
      const signature = snapshotDataSignature(captured);
      if (!conflictState?.alternate || signature !== lastDataSignature) pendingSnapshot = captured;
      const requestSerial = ++serial;
      queuedSignatures.set(requestSerial, signature);
      const task = writeQueue.then(async () => {
        writing = ready && !conflictState && signature !== lastDataSignature;
        try { return await commitPrepared(captured, requestSerial); }
        catch (error) { return { ok: false, reason: "db_write_failed", error }; }
        finally { writing = false; queuedSignatures.delete(requestSerial); }
      });
      writeQueue = task.then(() => undefined);
      return task;
    }

    return {
      supportsIndexedDb, readLocalSnapshot, readLatestSnapshot, writeLocalSnapshot, writeDbSnapshot,
      commitSnapshot,
      getPendingSnapshot: () => pendingSnapshot,
      getConflictState: () => conflictState,
      isReady: () => ready,
      isWriting: () => writing,
      hasUnpersistedChanges: (snapshot) => snapshotDataSignature(snapshot) !== lastDataSignature
        || Array.from(queuedSignatures.values()).some((signature) => signature !== lastDataSignature)
    };
  }

  function writeLocalSnapshotIfDue(input = {}) {
    const {
      store,
      snapshot,
      hasLocalStorage = false,
      storageMode = "",
      forceLocal = false,
      nowMs = Date.now(),
      lastLocalWriteAt = 0,
      intervalMs = 0,
      onLocalWriteError
    } = input;
    const shouldAttempt = Boolean(hasLocalStorage)
      && storageMode !== "idb_only"
      && (forceLocal || nowMs - lastLocalWriteAt >= intervalMs);
    if (!shouldAttempt) {
      return {
        attempted: false,
        succeeded: false,
        storageMode,
        lastLocalWriteAt
      };
    }
    let nextStorageMode = storageMode;
    const succeeded = Boolean(store?.writeLocalSnapshot?.(snapshot, {
      onLocalWriteError: (error) => {
        nextStorageMode = "idb_only";
        if (typeof onLocalWriteError === "function") onLocalWriteError(error);
      }
    }));
    return {
      attempted: true,
      succeeded,
      storageMode: nextStorageMode,
      lastLocalWriteAt: succeeded ? nowMs : lastLocalWriteAt
    };
  }

  function persistSnapshotWithFallback(input = {}) {
    if (typeof input.store?.commitSnapshot === "function") {
      input.onStorageStateChange?.({ state: "pending" });
      const completion = input.store.commitSnapshot(input.snapshot).then((result) => {
        if (input.isLatestSequence && !input.isLatestSequence(input.sequence)) return result;
        if (result.ok) {
          input.onStorageAvailable?.();
          input.onStorageStateChange?.({ state: "saved", unchanged: Boolean(result.unchanged) });
        } else {
          if (result.error) input.onDbWriteError?.(result.error);
          input.onStorageRisk?.(result.reason);
          input.onStorageStateChange?.({ state: result.reason === "conflict" ? "conflict" : "error", reason: result.reason });
        }
        return result;
      });
      return { storageMode: input.storageMode, lastLocalWriteAt: input.lastLocalWriteAt, completion };
    }
    const {
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
      onLocalWriteError,
      onDbWriteError,
      onStorageAvailable,
      onStorageRisk
    } = input;
    const localWrite = writeLocalSnapshotIfDue({
      store,
      snapshot,
      hasLocalStorage,
      storageMode,
      forceLocal,
      nowMs,
      lastLocalWriteAt,
      intervalMs,
      onLocalWriteError
    });

    void Promise.resolve(store?.writeDbSnapshot?.(snapshot) || false)
      .then((written) => {
        if (!isLatestSequence(sequence)) return;
        if (written === true) onStorageAvailable?.();
        else if (!localWrite.succeeded && store?.supportsIndexedDb?.()) onStorageRisk?.("db_write_failed");
      })
      .catch((error) => {
        if (!isLatestSequence(sequence)) return;
        onDbWriteError?.(error);
        if (!localWrite.succeeded) onStorageRisk?.("db_write_failed");
      });

    if (localWrite.succeeded) {
      onStorageAvailable?.();
    } else if (!store?.supportsIndexedDb?.()) {
      onStorageRisk?.("indexeddb_unsupported");
    }

    return {
      localWrite,
      storageMode: localWrite.storageMode,
      lastLocalWriteAt: localWrite.lastLocalWriteAt
    };
  }

  return {
    resolveBrowserStorage: resolveGlobalValue,
    readRawFromStorage,
    writeRawToStorage,
    readJsonFromStorage,
    writeJsonToStorage,
    readJsonFromFirstStorage,
    writeJsonToStorages,
    snapshotTime,
    selectLatestSnapshot,
    createIndexedDbSnapshotStore,
    createAppDataSnapshotStore,
    persistSnapshotWithFallback,
    writeLocalSnapshotIfDue
  };
});
