"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FAILURES = [];

function fail(message) {
  FAILURES.push(message);
  console.error(`serve-smoke failed: ${message}`);
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
  const normalized = path.posix.normalize(path.posix.join(baseDir, stripped.replace(/^\.\//, "")));
  if (normalized === "." || normalized.startsWith("../") || normalized === ".." || normalized.startsWith("/")) {
    return null;
  }
  return normalized;
}

function collectHtmlReferences(html) {
  const references = [];
  const attrPattern = /\b(?:src|href)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(attrPattern)) {
    const reference = normalizeReference(match[1]);
    if (reference) references.push(reference);
  }

  const inlineFallbackPattern = /\bthis\.src\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(inlineFallbackPattern)) {
    const reference = normalizeReference(match[1]);
    if (reference) references.push(reference);
  }

  return Array.from(new Set(references)).sort();
}

function collectCssReferences(css, baseDir = ".") {
  const references = [];
  const urlPattern = /url\(([^)]+)\)/gi;
  for (const match of css.matchAll(urlPattern)) {
    const reference = normalizeReference(match[1], baseDir);
    if (reference) references.push(reference);
  }
  return Array.from(new Set(references)).sort();
}

function normalizeServePath(rawUrl = "/") {
  const urlPath = String(rawUrl || "/").split("#")[0].split("?")[0] || "/";
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decodedPath.includes("\0")) return null;
  const withoutLeadingSlash = decodedPath.replace(/^\/+/, "") || "index.html";
  const normalized = path.posix.normalize(withoutLeadingSlash);
  if (normalized === "." || normalized === "") return "index.html";
  if (normalized.startsWith("../") || normalized === ".." || normalized.startsWith("/")) return null;
  return normalized;
}

function contentTypeForPath(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

function createStaticServer(rootDir = ROOT) {
  const root = path.resolve(rootDir);
  return http.createServer((req, res) => {
    const relativePath = normalizeServePath(req.url);
    if (!relativePath) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    const absolutePath = path.resolve(root, relativePath);
    if (!absolutePath.startsWith(`${root}${path.sep}`) && absolutePath !== root) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "content-type": contentTypeForPath(relativePath) });
    fs.createReadStream(absolutePath).pipe(res);
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode,
          contentType: response.headers["content-type"] || "",
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    }).on("error", reject);
  });
}

function buildUrl(baseUrl, relativePath) {
  return `${baseUrl}/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

async function assertServedOk(baseUrl, relativePath) {
  const response = await requestText(buildUrl(baseUrl, relativePath));
  if (response.statusCode !== 200) {
    fail(`${relativePath} returned HTTP ${response.statusCode}`);
  }
  if (!response.body.length) {
    fail(`${relativePath} returned an empty response`);
  }
  return response;
}

async function runServeSmoke(options = {}) {
  const rootDir = options.rootDir || ROOT;
  const server = createStaticServer(rootDir);
  const address = await listen(server);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const indexResponse = await assertServedOk(baseUrl, "index.html");
    if (!indexResponse.contentType.startsWith("text/html")) {
      fail(`index.html returned unexpected content-type: ${indexResponse.contentType}`);
    }

    const references = new Set(collectHtmlReferences(indexResponse.body));
    for (const reference of Array.from(references)) {
      const response = await assertServedOk(baseUrl, reference);
      if (reference.endsWith(".css")) {
        collectCssReferences(response.body, path.posix.dirname(reference)).forEach((cssReference) => {
          references.add(cssReference);
        });
      }
    }

    return {
      baseUrl,
      referenceCount: references.size
    };
  } finally {
    await close(server);
  }
}

async function run() {
  try {
    const result = await runServeSmoke();
    if (FAILURES.length) process.exit(1);
    console.log(`serve smoke passed (${result.referenceCount} served references)`);
  } catch (error) {
    fail(error?.message || String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  void run();
}

module.exports = {
  collectCssReferences,
  collectHtmlReferences,
  contentTypeForPath,
  createStaticServer,
  normalizeReference,
  normalizeServePath,
  runServeSmoke
};
