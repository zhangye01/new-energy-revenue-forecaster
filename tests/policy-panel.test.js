"use strict";

const assert = require("node:assert/strict");
const {
  bindBenchmarkRangeDrag,
  buildPolicyCardHtml,
  buildPolicyPanelViewModel
} = require("../src/ui/policy-panel");

class FakeTarget {
  constructor() {
    this.listeners = {};
  }

  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }

  dispatch(name, event = {}) {
    const nextEvent = {
      target: this,
      clientY: 0,
      prevented: false,
      preventDefault() {
        nextEvent.prevented = true;
      },
      ...event
    };
    this.listeners[name]?.(nextEvent);
    return nextEvent;
  }
}

class FakeWindow extends FakeTarget {
  removeEventListener(name, handler) {
    if (this.listeners[name] === handler) {
      delete this.listeners[name];
    }
  }
}

const regions = [{ key: "east", name: "华东" }];
const provinces = [
  { key: "shanghai", name: "上海" },
  { key: "jiangsu", name: "江苏" }
];
const cards = [
  {
    provinceKey: "shanghai",
    regionKey: "east",
    regionName: "华东",
    title: "上海<市场>",
    updatedAt: "2026-01-01",
    milestoneReview: "里程碑",
    ruleSystemReview: "规则",
    supplyPriceBrief: "价格"
  }
];

const cardHtml = buildPolicyCardHtml(cards[0], "上海");
assert.match(cardHtml, /上海&lt;市场&gt;/);
assert.match(cardHtml, /电力市场建设里程碑盘点/);

const view = buildPolicyPanelViewModel({
  filters: { provinceKey: "all", regionKey: "all" },
  provinceKeySet: new Set(["shanghai", "jiangsu"]),
  regionKeySet: new Set(["east"]),
  regions,
  provinces,
  cards
});
assert.equal(view.filters.regionKey, "east");
assert.equal(view.filters.provinceKey, "shanghai");
assert.match(view.regionOptionsHtml, /全部区域/);
assert.match(view.provinceOptionsHtml, /上海/);
assert.match(view.cardListHtml, /上海&lt;市场&gt;/);

const invalidProvince = buildPolicyPanelViewModel({
  filters: { provinceKey: "jiangsu", regionKey: "east" },
  provinceKeySet: new Set(["shanghai", "jiangsu"]),
  regionKeySet: new Set(["east"]),
  regions,
  provinces,
  cards
});
assert.equal(invalidProvince.filters.provinceKey, "all");
assert.match(invalidProvince.cardListHtml, /上海&lt;市场&gt;/);

const emptyView = buildPolicyPanelViewModel({
  filters: { provinceKey: "shanghai", regionKey: "east" },
  provinceKeySet: new Set(["shanghai"]),
  regionKeySet: new Set(["east"]),
  regions,
  provinces,
  cards: []
});
assert.match(emptyView.cardListHtml, /未检索到匹配地区政策/);

const dragCalls = [];
let activeHandle = "";
const refs = {
  benchmarkRangeSlider: new FakeTarget(),
  benchmarkRangeHandleMax: new FakeTarget(),
  benchmarkRangeHandleMin: new FakeTarget()
};
const windowRef = new FakeWindow();
assert.equal(bindBenchmarkRangeDrag({
  refs,
  windowRef,
  handlers: {
    startDrag: (handleType, clientY) => {
      activeHandle = handleType;
      dragCalls.push(`start:${handleType}:${clientY}`);
    },
    updateDrag: (clientY, persist) => {
      dragCalls.push(`update:${clientY}:${persist}`);
    },
    stopDrag: () => {
      dragCalls.push("stop");
      activeHandle = "";
    },
    valueFromClientY: (clientY) => clientY,
    isDragActive: () => Boolean(activeHandle),
    getRangeState: () => ({
      rangeMin: 20,
      rangeMax: 80,
      bounds: { min: 0, max: 100 }
    })
  }
}), true);

const maxEvent = refs.benchmarkRangeHandleMax.dispatch("pointerdown", { clientY: 70 });
assert.equal(maxEvent.prevented, true);
windowRef.dispatch("pointermove", { clientY: 72 });
windowRef.dispatch("pointerup", { clientY: 74 });
refs.benchmarkRangeSlider.dispatch("pointerdown", { clientY: 18 });
refs.benchmarkRangeSlider.dispatch("pointerdown", { target: refs.benchmarkRangeHandleMin, clientY: 10 });
assert.deepEqual(dragCalls, [
  "start:max:70",
  "update:72:false",
  "update:74:true",
  "stop",
  "start:min:18"
]);
assert.equal(bindBenchmarkRangeDrag(), false);

console.log("policy panel tests passed");
