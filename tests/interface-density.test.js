"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const themeCss = read("styles/theme.css");
const baseCss = read("styles/base.css");
const buttonsCss = read("styles/components/buttons.css");
const formsCss = read("styles/components/forms.css");
const responsiveCss = read("styles/responsive.css");
const helpCss = read("styles/components/context-help.css");
const html = read("index.html");

for (const token of [
  "--shell-sidebar-width",
  "--shell-topbar-height",
  "--page-gutter",
  "--panel-padding",
  "--component-gap",
  "--control-height",
  "--control-height-prominent"
]) {
  assert.match(themeCss, new RegExp(`${token}\\s*:`), `missing density token ${token}`);
}

assert.match(baseCss, /grid-template-columns:\s*var\(--shell-sidebar-width\)/);
assert.match(baseCss, /min-height:\s*var\(--shell-topbar-height\)/);
assert.match(baseCss, /padding:\s*0 var\(--page-gutter\)/);
assert.match(baseCss, /padding:\s*var\(--panel-padding\)/);
assert.match(buttonsCss, /min-height:\s*var\(--control-height\)/);
assert.match(formsCss, /min-height:\s*var\(--control-height-prominent\)/);
assert.match(html, /id="page-help"\s+data-context-help/);
assert.match(html, /class="context-help-card" id="page-help-card"/);
assert.match(helpCss, /\.context-help-card\s*\{[^}]*position:\s*fixed;/s);
assert.match(helpCss, /width:\s*min\(360px, calc\(100vw - 24px\)\)/);
assert.doesNotMatch(responsiveCss, /\.page-help-card\s*\{/);
assert.doesNotMatch(responsiveCss, /\.context-help-card\s*\{/);

console.log("interface density tests passed");
