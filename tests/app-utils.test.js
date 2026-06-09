"use strict";

const assert = require("node:assert/strict");
const {
  makeId,
  cloneData,
  clamp,
  asMoney,
  asCompactMoney,
  asNum,
  asPercent,
  escapeHtml,
  isPlainObject,
  hasNonEmptyObject,
  isIsoDateString,
  makeIsoDate,
  compareIsoDate,
  clampIsoDate,
  noLeapDayOfYear
} = require("../src/domain/app-utils");

assert.match(makeId("proj"), /^proj-[a-z0-9]{7}$/);

const cloned = cloneData({ nested: { value: 1 } });
cloned.nested.value = 2;
assert.deepEqual(cloned, { nested: { value: 2 } });
assert.deepEqual(cloneData({ nested: { value: 1 } }), { nested: { value: 1 } });

assert.equal(clamp(12, 1, 10), 10);
assert.equal(clamp(-1, 1, 10), 1);
assert.equal(clamp(5, 1, 10), 5);

assert.equal(asMoney(1234), "¥1,234");
assert.equal(asCompactMoney(123456789), "1.23 亿元");
assert.equal(asCompactMoney(12345), "1.2 万元");
assert.equal(asNum(1.234, 2), "1.23");
assert.equal(asPercent(0.1234), "12.3%");
assert.equal(escapeHtml("<a&b>"), "&lt;a&amp;b&gt;");

assert.equal(isPlainObject({ a: 1 }), true);
assert.equal(isPlainObject([]), false);
assert.equal(hasNonEmptyObject({ a: "", b: null }), false);
assert.equal(hasNonEmptyObject({ a: " x " }), true);
assert.equal(hasNonEmptyObject({ a: { b: 1 } }), true);

assert.equal(isIsoDateString("2026-01-02"), true);
assert.equal(isIsoDateString("2026-1-2"), false);
assert.equal(makeIsoDate(2026, 3, 4), "2026-03-04");
assert.equal(compareIsoDate("2026-01-02", "2026-01-03") < 0, true);
assert.equal(clampIsoDate("2025-12-31", "2026-01-01", "2026-12-31"), "2026-01-01");
assert.equal(clampIsoDate("2027-01-01", "2026-01-01", "2026-12-31"), "2026-12-31");
assert.equal(clampIsoDate("bad", "2026-01-01", "2026-12-31"), "");
assert.equal(noLeapDayOfYear("2026-01-01"), 1);
assert.equal(noLeapDayOfYear("2026-03-01"), 60);
assert.equal(noLeapDayOfYear("bad"), 1);

console.log("app utils tests passed");
