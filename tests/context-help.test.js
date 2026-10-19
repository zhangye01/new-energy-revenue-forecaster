"use strict";

const assert = require("node:assert/strict");
const contextHelp = require("../src/ui/context-help");

assert.equal(contextHelp.calculateContextHelpShift(276, 320, 390), -218);
assert.equal(contextHelp.calculateContextHelpShift(4, 320, 390), 8);
assert.equal(contextHelp.calculateContextHelpShift(100, 200, 390), 0);

function createClassList() {
  const values = new Set();
  return {
    add(name) {
      values.add(name);
    },
    contains(name) {
      return values.has(name);
    },
    remove(name) {
      values.delete(name);
    },
    toggle(name, force) {
      if (force === true) values.add(name);
      else if (force === false) values.delete(name);
      else if (values.has(name)) values.delete(name);
      else values.add(name);
      return values.has(name);
    }
  };
}

function createHelpFixture() {
  const buttonListeners = {};
  const containerListeners = {};
  const attributes = {};
  const cardListeners = {};
  const card = { addEventListener(name, handler) { cardListeners[name] = handler; } };
  const button = {
    addEventListener(name, handler) {
      buttonListeners[name] = handler;
    },
    focus() {
      this.focused = true;
    },
    setAttribute(name, value) {
      attributes[name] = value;
    }
  };
  const container = {
    classList: createClassList(),
    dataset: {},
    addEventListener(name, handler) {
      containerListeners[name] = handler;
    },
    contains(target) {
      return target === button;
    },
    querySelector(selector) {
      return selector === ".context-help-card" ? card : button;
    }
  };
  return { attributes, button, buttonListeners, card, cardListeners, container, containerListeners };
}

const first = createHelpFixture();
const second = createHelpFixture();
const documentListeners = {};
const documentRef = {
  addEventListener(name, handler) {
    documentListeners[name] = handler;
  },
  querySelectorAll() {
    return [first.container, second.container];
  }
};

assert.equal(contextHelp.bindContextHelp(documentRef), 2);
assert.equal(contextHelp.bindContextHelp(documentRef), 0);

first.buttonListeners.focus();
assert.equal(first.container.classList.contains("focus-open"), true);
assert.equal(first.attributes["aria-expanded"], "true");

first.buttonListeners.click({ stopPropagation() {} });
assert.equal(first.container.classList.contains("open"), true);
assert.equal(first.container.classList.contains("focus-open"), false);
assert.equal(first.attributes["aria-expanded"], "true");

second.buttonListeners.click({ stopPropagation() {} });
assert.equal(first.container.classList.contains("open"), false);
assert.equal(second.container.classList.contains("open"), true);

documentListeners.click({ target: { closest: () => null } });
assert.equal(second.container.classList.contains("open"), false);
assert.equal(second.attributes["aria-expanded"], "false");

contextHelp.setContextHelpOpen(first.container, true);
documentRef.activeElement = first.button;
documentListeners.keydown({ key: "Escape" });
assert.equal(first.container.classList.contains("open"), false);
assert.equal(first.container.classList.contains("dismissed"), true);
assert.equal(first.button.focused, true);
first.buttonListeners.focus();
assert.equal(first.container.classList.contains("focus-open"), false);

first.containerListeners.pointerleave();
assert.equal(first.container.classList.contains("dismissed"), false);

// Hover is a managed state: Escape dismisses it without stealing an input's focus.
first.button.focused = false;
documentRef.activeElement = {};
first.containerListeners.mouseenter();
assert.equal(first.container.classList.contains("hover-open"), true);
assert.equal(first.attributes["aria-expanded"], "true");
documentListeners.keydown({ key: "Escape" });
assert.equal(first.attributes["aria-expanded"], "false");
assert.equal(first.button.focused, false);
first.containerListeners.mouseenter();
assert.equal(first.container.classList.contains("hover-open"), false);
first.containerListeners.pointerleave();

// Tooltips stay onscreen at bottom/right edges and flip above their anchor.
assert.deepEqual(contextHelp.calculateContextHelpPosition(
  { left: 350, top: 700, bottom: 726 }, { width: 320, height: 150 }, { width: 390, height: 800 }
), { left: 58, top: 544 });
assert.deepEqual(contextHelp.calculateContextHelpPosition(
  { left: 4, top: 10, bottom: 36 }, { width: 320, height: 150 }, { width: 390, height: 800 }
), { left: 12, top: 42 });
assert.deepEqual(contextHelp.calculateContextHelpPosition(
  { left: 100, top: 60, bottom: 86 }, { width: 320, height: 170 }, { width: 390, height: 200 }
), { left: 58, top: 12 });

// Reading help inside a disclosure or form label must not activate its parent.
let prevented = false;
let stopped = false;
first.container.closest = () => ({});
first.cardListeners.click({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
assert.equal(prevented, true);
assert.equal(stopped, true);
// Moving between the popup and its trigger must cancel the delayed hover close.
(async () => {
  first.containerListeners.mouseenter();
  first.cardListeners.pointerleave({ relatedTarget: first.button });
  await new Promise((resolve) => setTimeout(resolve, 170));
  assert.equal(first.attributes["aria-expanded"], "true");
  first.cardListeners.pointerleave();
  first.buttonListeners.mouseenter();
  await new Promise((resolve) => setTimeout(resolve, 170));
  assert.equal(first.attributes["aria-expanded"], "true");
  first.containerListeners.pointerleave();
  await new Promise((resolve) => setTimeout(resolve, 170));
  assert.equal(first.attributes["aria-expanded"], "false");
  console.log("context help tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
