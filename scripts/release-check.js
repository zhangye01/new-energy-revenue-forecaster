"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const FAILURES = [];
const REQUIRED_GITIGNORE_ENTRIES = [
  ".DS_Store",
  ".Rhistory",
  ".playwright-cli/",
  "ui-demos/",
  "node_modules/",
  "dist/",
  "build/",
  "*.log"
];
const FORBIDDEN_TRACKED_PATTERNS = [
  /^\.env(?:\.|$)/,
  /^\.DS_Store$/,
  /^\.Rhistory$/,
  /^\.playwright-cli\//,
  /^\.codex\//,
  /^\.agents\//,
  /^ui-demos\//,
  /^node_modules\//,
  /^dist\//,
  /^build\//,
  /^tmp\//,
  /^temp\//,
  /\.log$/i
];
const TEXT_FILE_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".md",
  ".svg",
  ".txt",
  ".yml",
  ".yaml"
]);
const SECRET_PATTERNS = [
  { name: "OpenAI-style API key", pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: "GitHub token", pattern: /ghp_[A-Za-z0-9]{20,}/ },
  { name: "GitHub fine-grained token", pattern: /github_pat_[A-Za-z0-9_]{20,}/ },
  { name: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "Google API key", pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "Slack token", pattern: /xox[baprs]-[0-9A-Za-z-]{20,}/ },
  { name: "Private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ }
];
const PERSONAL_PATH_PATTERN = /\/Users\/[^/\s"'`]+/;
const GENERATED_DATA_PATTERNS = [
  /^map-data\.js$/,
  /^vendor\//
];

function fail(message) {
  FAILURES.push(message);
  console.error(`release-check failed: ${message}`);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function listTrackedFiles() {
  const output = execFileSync("git", ["ls-files"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  return output.split(/\r?\n/).filter(Boolean).sort();
}

function assertGitignoreEntries() {
  const gitignore = readText(".gitignore")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const entries = new Set(gitignore);
  REQUIRED_GITIGNORE_ENTRIES.forEach((entry) => {
    if (!entries.has(entry)) {
      fail(`.gitignore is missing required entry: ${entry}`);
    }
  });
}

function assertNoForbiddenTrackedFiles(files) {
  files.forEach((file) => {
    if (FORBIDDEN_TRACKED_PATTERNS.some((pattern) => pattern.test(file))) {
      fail(`forbidden file is tracked: ${file}`);
    }
  });
}

function isTextFile(file) {
  return TEXT_FILE_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function shouldScanForSecrets(file) {
  return !GENERATED_DATA_PATTERNS.some((pattern) => pattern.test(file));
}

function assertNoSensitiveText(files) {
  files.filter(isTextFile).forEach((file) => {
    const content = readText(file);
    if (PERSONAL_PATH_PATTERN.test(content)) {
      fail(`${file} contains an absolute personal filesystem path`);
    }
    if (!shouldScanForSecrets(file)) return;
    SECRET_PATTERNS.forEach(({ name, pattern }) => {
      if (pattern.test(content)) {
        fail(`${file} contains a possible ${name}`);
      }
    });
  });
}

function run() {
  assertGitignoreEntries();
  const trackedFiles = listTrackedFiles();
  assertNoForbiddenTrackedFiles(trackedFiles);
  assertNoSensitiveText(trackedFiles);
  if (FAILURES.length) process.exit(1);
  console.log(`release checks passed (${trackedFiles.length} tracked files)`);
}

run();
