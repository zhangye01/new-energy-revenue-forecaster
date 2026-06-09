"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TEST_DIR = path.join(ROOT, "tests");

function listTestFiles() {
  return fs.readdirSync(TEST_DIR)
    .filter((file) => file.endsWith(".test.js"))
    .map((file) => `tests/${file}`)
    .sort();
}

function run() {
  const files = listTestFiles();
  for (const file of files) {
    const result = spawnSync(process.execPath, [file], {
      cwd: ROOT,
      stdio: "inherit"
    });
    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
  }
  console.log(`test suite passed (${files.length} files)`);
}

run();
