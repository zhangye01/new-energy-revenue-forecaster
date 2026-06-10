"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FAILURES = [];

function fail(message) {
  FAILURES.push(message);
  console.error(`static-check failed: ${message}`);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function stripReference(rawValue) {
  return String(rawValue || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .split("#")[0]
    .split("?")[0];
}

function isLocalReference(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value || value.startsWith("#")) return false;
  return !/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(value);
}

function normalizeReference(rawValue, baseDir = ".") {
  const stripped = stripReference(rawValue);
  if (!isLocalReference(stripped)) return null;
  const normalized = path.normalize(path.join(baseDir, stripped));
  if (normalized.startsWith("..")) {
    fail(`reference escapes project root: ${rawValue}`);
    return null;
  }
  return normalized.split(path.sep).join("/");
}

function assertExists(reference, source) {
  if (!fs.existsSync(path.join(ROOT, reference))) {
    fail(`${source} references missing file: ${reference}`);
  }
}

function collectHtmlReferences(html) {
  const references = [];
  const attrPattern = /\b(?:src|href)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(attrPattern)) {
    const reference = normalizeReference(match[1]);
    if (reference) references.push({ reference, source: "index.html" });
  }

  const inlineFallbackPattern = /\bthis\.src\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(inlineFallbackPattern)) {
    const reference = normalizeReference(match[1]);
    if (reference) references.push({ reference, source: "index.html inline fallback" });
  }

  return references;
}

function collectCssReferences(relativePath) {
  if (!fs.existsSync(path.join(ROOT, relativePath))) return [];
  const css = readText(relativePath);
  const baseDir = path.dirname(relativePath);
  const references = [];
  const urlPattern = /url\(([^)]+)\)/gi;
  for (const match of css.matchAll(urlPattern)) {
    const reference = normalizeReference(match[1], baseDir);
    if (reference) references.push({ reference, source: relativePath });
  }
  return references;
}

function assertUniqueIds(html) {
  const counts = new Map();
  const idPattern = /\bid=["']([^"']+)["']/gi;
  for (const match of html.matchAll(idPattern)) {
    const id = match[1];
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  for (const [id, count] of counts.entries()) {
    if (count > 1) {
      fail(`index.html has duplicate id "${id}" (${count} times)`);
    }
  }
  return counts.size;
}

function assertSingleTitle(html) {
  const titleMatches = html.match(/<title\b[^>]*>/gi) || [];
  if (titleMatches.length !== 1) {
    fail(`index.html must contain exactly one <title>, found ${titleMatches.length}`);
  }
}

function run() {
  const html = readText("index.html");
  assertSingleTitle(html);
  const idCount = assertUniqueIds(html);
  const references = [
    ...collectHtmlReferences(html),
    ...collectCssReferences("styles.css")
  ];
  const uniqueReferences = new Map();
  for (const item of references) {
    uniqueReferences.set(`${item.source}:${item.reference}`, item);
  }
  for (const { reference, source } of uniqueReferences.values()) {
    assertExists(reference, source);
  }
  if (FAILURES.length) process.exit(1);
  console.log(`static checks passed (${idCount} ids, ${uniqueReferences.size} references)`);
}

if (require.main === module) {
  run();
}

module.exports = {
  collectHtmlReferences,
  isLocalReference,
  normalizeReference,
  stripReference
};
