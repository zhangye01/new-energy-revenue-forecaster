"use strict";

const assert = require("node:assert/strict");
const { enhanceHelpDescriptions } = require("../src/ui/context-help");

// A small DOM fixture checks actual reparenting and node preservation. Browser
// regression covers geometry; no layout or event behavior is simulated here.
function fixture() {
  class Node {
    constructor(tag = "", text = "") {
      this.tagName = tag; this.nodeType = tag ? 1 : 3; this.text = text;
      this.childNodes = []; this.attributes = {}; this.dataset = {}; this.className = "";
      this.classList = { add: (name) => { this.className += ` ${name}`; } };
    }
    get children() { return this.childNodes.filter((node) => node.nodeType === 1); }
    get textContent() { return this.text + this.childNodes.map((node) => node.textContent).join(""); }
    set textContent(value) { this.text = value; this.childNodes = []; }
    get previousElementSibling() { const nodes = this.parentElement?.children || []; return nodes[nodes.indexOf(this) - 1] || null; }
    setAttribute(key, value) {
      this.attributes[key] = value;
      if (key.startsWith("data-")) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      if (key === "id") this.id = value;
    }
    hasAttribute(key) { return Object.hasOwn(this.attributes, key); }
    append(...nodes) { nodes.forEach((node) => { node.remove(); node.parentElement = this; this.childNodes.push(node); }); }
    before(node) {
      node.remove(); const parent = this.parentElement;
      parent.childNodes.splice(parent.childNodes.indexOf(this), 0, node); node.parentElement = parent;
    }
    remove() {
      if (this.parentElement) this.parentElement.childNodes.splice(this.parentElement.childNodes.indexOf(this), 1);
      this.parentElement = null;
    }
    contains(node) { return this === node || this.childNodes.some((child) => child.contains(node)); }
    matches(selector) {
      return selector.split(",").some((part) => {
        const [positive, negative] = part.split(":not(");
        if (negative && this.matches(negative.slice(0, -1))) return false;
        if (positive.startsWith("#")) return this.id === positive.slice(1);
        if (positive.startsWith(".")) return this.className.split(/\s+/).includes(positive.slice(1));
        if (positive.startsWith("[")) {
          const key = positive.slice(1, -1);
          return key.startsWith("data-") ? Object.hasOwn(this.dataset, key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())) : this.hasAttribute(key);
        }
        return this.tagName === positive;
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { if (selector === "[") throw new SyntaxError("Invalid selector"); return this.querySelectorAll(selector)[0] || null; }
    cloneNode() {
      const copy = new Node(this.tagName, this.text); copy.className = this.className;
      Object.entries(this.attributes).forEach(([key, value]) => copy.setAttribute(key, value));
      this.childNodes.forEach((node) => copy.append(node.cloneNode())); return copy;
    }
  }
  const document = new Node("document");
  document.createElement = (tag) => new Node(tag);
  document.getElementById = (id) => document.querySelector(`#${id}`);
  const el = (tag, attributes = {}, ...children) => {
    const node = new Node(tag); Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    node.append(...children.map((child) => typeof child === "string" ? new Node("", child) : child)); return node;
  };
  return { document, el };
}

// Historical plain-text labels acquire an inline name anchor, not an extra
// question-mark row underneath the input. IDs, values and descriptions survive.
{
  const { document, el } = fixture();
  const input = el("input", { id: "arbitrage", value: "9", readonly: "", "aria-describedby": "arbitrage-note" });
  const status = el("span", { "data-refinement-field": "storageArbitragePrice" }, "待确认");
  const note = el("span", { id: "arbitrage-note", "data-help": "原手工套利假设" }, "保留原值供粗算使用；基准不叠加本项。");
  const label = el("label", {}, "原手工套利假设 元/MWh\n", input, status, note);
  document.append(label);
  assert.equal(enhanceHelpDescriptions(document), 1);
  const anchor = label.children[0], help = anchor.querySelector("[data-context-help]");
  assert.equal(anchor.hasAttribute("data-help-label"), true);
  assert.ok(help);
  assert.equal(label.children[1], input);
  assert.equal(label.children[2], status);
  assert.equal(input.attributes["aria-label"], "原手工套利假设 元/MWh");
  assert.equal(label.attributes.for, "arbitrage", "field-name click still targets the input, not the preceding help button");
  assert.equal(input.attributes.value, "9");
  assert.equal(input.hasAttribute("readonly"), true);
  assert.equal(document.getElementById("arbitrage-note"), note);
  assert.equal(note.textContent, "保留原值供粗算使用；基准不叠加本项。");
  assert.equal(help.querySelector(".context-help-card").contains(note), true);
  assert.equal(enhanceHelpDescriptions(document), 0, "repeated renders do not duplicate help");
  const second = el("span", { "data-help": "适用范围" }, "第二条说明保持完整。");
  label.append(second); enhanceHelpDescriptions(document);
  assert.equal(anchor.querySelectorAll("[data-context-help]").length, 1, "one icon groups the same field's explanations");
  assert.equal(help.querySelector(".context-help-card").contains(second), true);
}

// Dynamic fields without IDs retain explicit label association after the help
// button is inserted before the input, including across repeated enhancement.
{
  const { document, el } = fixture();
  const input = el("input", { value: "95" });
  const note = el("span", { "data-help": "捕获率" }, "请结合项目确认。");
  const label = el("label", {}, "捕获率 %", input, note); document.append(label);
  enhanceHelpDescriptions(document);
  assert.match(input.id, /^context-help-field-/);
  assert.equal(label.attributes.for, input.id);
  assert.equal(document.getElementById(input.id), input);
  const originalId = input.id;
  assert.equal(enhanceHelpDescriptions(document), 0);
  assert.equal(input.id, originalId);
}

// Explicit field labels work with help outside the label and preserve an
// existing accessible name; a bad optional selector cannot stop enhancement.
{
  const { document, el } = fixture();
  const name = el("span", { "data-help-label": "" }, "捕获率 %");
  const label = el("label", { for: "capture" }, name);
  const input = el("input", { id: "capture", "aria-label": "预期捕获率", value: "95" });
  input.labels = [label]; label.control = input;
  const note = el("p", { "data-help": "捕获率", "data-help-for": "capture", "data-help-anchor": "[" }, "捕获电价＝现货均价×捕获率。");
  document.append(label, input, note);
  assert.equal(enhanceHelpDescriptions(document), 1);
  assert.ok(name.querySelector("[data-context-help]"));
  assert.equal(label.children[0], name);
  assert.equal(input.attributes["aria-label"], "预期捕获率");
  assert.equal(note.textContent, "捕获电价＝现货均价×捕获率。");
}

// Section help retains its existing heading anchor rather than guessing at a
// nearby input. Missing optional field IDs keep the full explanation available.
{
  const { document, el } = fixture();
  const heading = el("h3", { id: "section-heading" }, "环境价值");
  const note = el("p", { "data-help": "环境价值", "data-help-for": "missing-control" }, "三条路径兑现比例合计不超过100%。");
  const section = el("section", {}, heading, note); document.append(section);
  assert.equal(enhanceHelpDescriptions(document), 1);
  assert.ok(heading.querySelector("[data-context-help]"));
  assert.equal(note.textContent, "三条路径兑现比例合计不超过100%。");
}

console.log("context help placement tests passed");
