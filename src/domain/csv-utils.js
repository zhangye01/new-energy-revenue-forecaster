"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_CSV_UTILS = api;
  if (root.window && root.window !== root) {
    root.window.NE_CSV_UTILS = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function normalizeCsvHeaderToken(value) {
    return String(value || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase();
  }

  function normalizeCsvHeaderRow(row) {
    if (!Array.isArray(row)) return "";
    return row.map((cell) => normalizeCsvHeaderToken(cell)).join(",");
  }

  function parseCsvRows(text) {
    const parseCell = (cell) => {
      const trimmed = String(cell || "").trim();
      if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
        return trimmed.slice(1, -1).replaceAll("\"\"", "\"").trim();
      }
      return trimmed;
    };
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const normalized = line.replaceAll("，", ",");
        const separator = normalized.includes(",") ? "," : "\t";
        return normalized.split(separator).map((value) => parseCell(value));
      });
  }

  function toCsvLine(values) {
    return values
      .map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`)
      .join(",");
  }

  function sanitizeExportFilenamePart(value) {
    return String(value || "-")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "");
  }

  return Object.freeze({
    normalizeCsvHeaderToken,
    normalizeCsvHeaderRow,
    parseCsvRows,
    toCsvLine,
    sanitizeExportFilenamePart
  });
});
