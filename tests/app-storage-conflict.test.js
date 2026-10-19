"use strict";
const assert = require("node:assert/strict");
const storageApi = require("../src/domain/app-storage");

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}
function memoryLocks() {
  let tail = Promise.resolve();
  return { request(_name, callback) { const job = tail.then(callback); tail = job.catch(() => {}); return job; } };
}
function memoryIndexedDb() {
  const records = new Map();
  let transactions = Promise.resolve();
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      let active = false, pending = 0, done = false, release;
      const queued = [], writes = new Map(), tx = {};
      const finish = () => setImmediate(() => {
        if (!active || pending || done) return;
        done = true;
        for (const [key, value] of writes) records.set(key, value);
        tx.oncomplete?.(); release();
      });
      function operation(callback) {
        pending += 1;
        const run = () => setImmediate(() => { callback(); pending -= 1; finish(); });
        if (active) run(); else queued.push(run);
      }
      tx.objectStore = () => ({
        get(key) {
          const request = {};
          operation(() => { request.result = structuredClone(writes.get(key) || records.get(key)); request.onsuccess?.(); });
          return request;
        },
        put(value, key) { operation(() => writes.set(key, structuredClone(value))); }
      });
      transactions = transactions.then(() => new Promise((resolve) => {
        release = resolve; active = true; queued.forEach((run) => run()); finish();
      }));
      return tx;
    }
  };
  return { records, open() { const request = {}; setImmediate(() => { request.result = db; request.onsuccess?.(); }); return request; } };
}
function snapshot(fee, ids = ["original-rough"]) {
  return { version: 1, savedAt: "2026-10-19T01:00:00.000Z", payload: {
    activePage: "scenario-page", projects: [{ id: "p1", config: { otherFee: fee },
      roughPrice: { snapshots: ids.map((id) => ({ id, rows: [{ year: 2027, price: 409.125 }] })) } }]
  } };
}
function storeFor(localStorage, indexedDB, locks = memoryLocks()) {
  return storageApi.createAppDataSnapshotStore({ storageKey: "app", dbName: "test", storeName: "snapshots", dbKey: "data", localStorage, indexedDB, locks });
}

(async () => {
  const local = memoryStorage(), idb = memoryIndexedDb();
  const original = snapshot(4.75);
  local.setItem("app", JSON.stringify(original)); idb.records.set("data", structuredClone(original));
  const a = storeFor(local, idb), b = storeFor(local, idb);
  assert.equal((await a.commitSnapshot(snapshot(1))).reason, "not_initialized");
  assert.equal(idb.records.has("data:revisioned"), false, "initialization must finish before writing");
  await Promise.all([a.readLatestSnapshot(), b.readLatestSnapshot()]);
  const changed = snapshot(14.75, ["original-rough", "new-rough"]);
  assert.equal(a.hasUnpersistedChanges(original), false);
  assert.equal(a.hasUnpersistedChanges(changed), true);
  const firstCommit = a.commitSnapshot(changed);
  assert.equal(a.hasUnpersistedChanges(changed), true, "queued final edits must trigger the unload guard");
  assert.equal((await firstCommit).ok, true);
  assert.equal(a.hasUnpersistedChanges(changed), false);
  assert.deepEqual(idb.records.get("data:revisioned").payload, changed.payload);
  const readonly = structuredClone(original); readonly.payload.activePage = "home-page";
  assert.equal(b.hasUnpersistedChanges(readonly), false, "an unchanged old tab must not show an unload warning");
  assert.equal((await b.commitSnapshot(readonly)).unchanged, true, "closing an unchanged old tab does not save stale data");
  assert.deepEqual(idb.records.get("data:revisioned").payload, changed.payload);
  const losingDraft = snapshot(99);
  assert.equal((await b.commitSnapshot(losingDraft)).reason, "conflict");
  assert.deepEqual(b.getPendingSnapshot(), losingDraft, "conflicting edits remain available for backup");
  assert.ok(b.getConflictState());
  assert.deepEqual(idb.records.get("data:revisioned").payload, changed.payload, "new values and every rough snapshot survive");
  const reloaded = await b.readLatestSnapshot();
  assert.deepEqual(reloaded.payload, changed.payload); assert.equal(b.getConflictState(), null);
  reloaded.payload.projects[0].config.otherFee = 15.25;
  assert.equal((await b.commitSnapshot(reloaded)).ok, true, "explicit reload permits subsequent edits against the latest version");

  const c = storeFor(local, idb), d = storeFor(local, idb);
  await Promise.all([c.readLatestSnapshot(), d.readLatestSnapshot()]);
  const results = await Promise.all([c.commitSnapshot(snapshot(30)), d.commitSnapshot(snapshot(40))]);
  assert.equal(results.filter((result) => result.ok).length, 1, "IDB transaction comparison admits exactly one concurrent writer");
  assert.equal(results.filter((result) => result.reason === "conflict").length, 1);
  const protectedValue = structuredClone(idb.records.get("data:revisioned"));
  local.setItem("app", JSON.stringify(snapshot(0))); idb.records.set("data", snapshot(0));
  const upgraded = storeFor(local, idb);
  assert.deepEqual((await upgraded.readLatestSnapshot()).payload, protectedValue.payload,
    "an old deployed app writing legacy keys cannot erase migrated projects");

  const legacyLocal = memoryStorage(), legacyIdb = memoryIndexedDb();
  legacyLocal.setItem("app", JSON.stringify(original)); legacyIdb.records.set("data", original);
  const legacy = storeFor(legacyLocal, legacyIdb); await legacy.readLatestSnapshot();
  legacyIdb.records.set("data", snapshot(7));
  assert.equal((await legacy.commitSnapshot(snapshot(8))).reason, "conflict",
    "changed legacy content with an identical savedAt still conflicts");

  const small = memoryStorage(), locks = memoryLocks();
  const e = storeFor(small, null, locks), f = storeFor(small, null, locks);
  await Promise.all([e.readLatestSnapshot(), f.readLatestSnapshot()]);
  const fallback = await Promise.all([e.commitSnapshot(snapshot(10)), f.commitSnapshot(snapshot(20))]);
  assert.equal(fallback.filter((result) => result.ok).length, 1);
  assert.equal(fallback.filter((result) => result.reason === "conflict").length, 1,
    "localStorage-only writes require cross-tab Web Locks and compare their revisions");

  const unavailable = storeFor(null, null, null); await unavailable.readLatestSnapshot();
  const notifications = [];
  const result = storageApi.persistSnapshotWithFallback({ store: unavailable, snapshot: original,
    onStorageAvailable: () => notifications.push("available"), onStorageRisk: (reason) => notifications.push(reason) });
  await result.completion;
  assert.deepEqual(notifications, ["safe_storage_unavailable"], "no successful write means no saved notification");

  const quota = { getItem: () => null, setItem() { throw new Error("quota"); } }, largeIdb = memoryIndexedDb();
  const large = storeFor(quota, largeIdb); await large.readLatestSnapshot();
  const written = await large.commitSnapshot(changed);
  assert.equal(written.ok, true); assert.equal(written.localWritten, false);
  assert.deepEqual((await storeFor(quota, largeIdb).readLatestSnapshot()).payload, changed.payload,
    "a failed local cache write does not lose the committed IDB version");
  assert.equal((await large.commitSnapshot(snapshot(19))).ok, true);

  const restoredLocal = memoryStorage(), restoredIdb = memoryIndexedDb();
  const online = storeFor(restoredLocal, restoredIdb); await online.readLatestSnapshot();
  await online.commitSnapshot(snapshot(50));
  const localOnly = storeFor(restoredLocal, null); await localOnly.readLatestSnapshot();
  await localOnly.commitSnapshot(snapshot(51)); await localOnly.commitSnapshot(snapshot(52));
  const returnedDb = storeFor(restoredLocal, restoredIdb);
  assert.equal((await returnedDb.readLatestSnapshot()).payload.projects[0].config.otherFee, 52,
    "a local-only descendant remains authoritative after IndexedDB becomes available again");
  assert.equal((await returnedDb.commitSnapshot(snapshot(53))).ok, true);
  assert.equal(restoredIdb.records.get("data:revisioned").payload.projects[0].config.otherFee, 53);

  const splitLocal = memoryStorage(), splitIdb = memoryIndexedDb();
  const localBranch = { ...snapshot(61), storageRevision: { id: "local-branch", ancestors: [] } };
  const dbBranch = { ...snapshot(62), storageRevision: { id: "db-branch", ancestors: [] } };
  splitLocal.setItem("app:revisioned", JSON.stringify(localBranch)); splitIdb.records.set("data:revisioned", dbBranch);
  const split = storeFor(splitLocal, splitIdb); const shown = await split.readLatestSnapshot();
  assert.ok(split.getConflictState()); assert.deepEqual(split.getPendingSnapshot(), localBranch);
  assert.equal((await split.commitSnapshot(shown)).reason, "conflict");
  assert.deepEqual(split.getPendingSnapshot(), localBranch, "background renders must preserve the alternative recovery branch");
  assert.deepEqual(splitIdb.records.get("data:revisioned"), dbBranch);
  assert.equal(splitLocal.getItem("app:revisioned"), JSON.stringify(localBranch));

  const failingDb = { open() { const request = {}; setImmediate(() => { request.error = new Error("read denied"); request.onerror?.(); }); return request; } };
  const readFailure = storeFor(restoredLocal, failingDb);
  const fallbackShown = await readFailure.readLatestSnapshot();
  assert.equal((await readFailure.commitSnapshot(fallbackShown)).reason, "db_read_failed",
    "a cached view must not permit writes or claim persistence when the authoritative store cannot be read");

  const delayedIdb = memoryIndexedDb(), delayed = storeFor(memoryStorage(), delayedIdb);
  await delayed.readLatestSnapshot();
  const mutable = snapshot(41), captured = delayed.commitSnapshot(mutable);
  mutable.payload.projects[0].config.otherFee = 88;
  await captured;
  assert.equal(delayedIdb.records.get("data:revisioned").payload.projects[0].config.otherFee, 41,
    "queued saves capture the requested values rather than later mutable state");
  console.log("app storage conflict tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
