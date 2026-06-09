"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const ROOT_JS_FILES = ["config.js", "runtime.js", "map-data.js", "app.js"];
const SCAN_DIRS = ["src/domain", "src/ui", "scripts"];

function listJsFiles(relativeDir) {
  const dir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => `${relativeDir}/${file}`)
    .sort();
}

function syntaxFiles() {
  return [
    ...ROOT_JS_FILES,
    ...SCAN_DIRS.flatMap((dir) => listJsFiles(dir))
  ];
}

function run() {
  const files = syntaxFiles();
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
      cwd: ROOT,
      stdio: "inherit"
    });
    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
  }
  console.log(`syntax checks passed (${files.length} files)`);
}

run();
