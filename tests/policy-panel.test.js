"use strict";

const assert = require("node:assert/strict");
const {
  buildPolicyCardHtml,
  buildPolicyPanelViewModel
} = require("../src/ui/policy-panel");

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

console.log("policy panel tests passed");
