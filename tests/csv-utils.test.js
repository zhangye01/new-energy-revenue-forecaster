"use strict";

const assert = require("node:assert/strict");
const {
  normalizeCsvHeaderToken,
  normalizeCsvHeaderRow,
  parseCsvRows,
  toCsvLine,
  sanitizeExportFilenamePart
} = require("../src/domain/csv-utils");

assert.equal(normalizeCsvHeaderToken("\uFEFF Year "), "year");
assert.equal(normalizeCsvHeaderRow([" Year ", "PRICE "]), "year,price");

assert.deepEqual(parseCsvRows("year,price\n2026,8"), [
  ["year", "price"],
  ["2026", "8"]
]);
assert.deepEqual(parseCsvRows("year\tprice\n2026\t8"), [
  ["year", "price"],
  ["2026", "8"]
]);
assert.deepEqual(parseCsvRows("year，price\n\"2026\",\"A\"\"B\""), [
  ["year", "price"],
  ["2026", "A\"B"]
]);

assert.equal(toCsvLine(["A\"B", 2026, ""]), "\"A\"\"B\",\"2026\",\"\"");
assert.equal(sanitizeExportFilenamePart(" 江苏 / 海上 项目 "), "江苏-海上项目");
assert.equal(sanitizeExportFilenamePart(""), "-");

console.log("csv utils tests passed");
