"use strict";

const assert = require("node:assert/strict");
const {
  buildProvinceDefaultsViewModel,
  shouldRefreshProvinceDefaultMessage
} = require("../src/ui/province-defaults");

const provinces = [
  { key: "jiangsu", name: "江苏" },
  { key: "shanghai", name: "上海" },
  { key: "guangdong", name: "广东<script>" }
];

const defaultsByProvince = {
  jiangsu: {
    mechanismEnabled: true,
    mechanismRatio: 0.36,
    mechanismPrice: 365,
    marketOpFee: 6,
    gridAssessFee: 7,
    ancillaryFee: 14,
    otherFee: 3,
    greenCertPrice: 22,
    greenPremiumPrice: 12,
    storageArbitragePrice: 18,
    storageCapacityCompPrice: 7,
    storageAncillaryRevenuePrice: 10,
    storageOtherRevenuePrice: 3
  },
  shanghai: {
    mechanismEnabled: false,
    mechanismRatio: 0,
    mechanismPrice: 0,
    marketOpFee: 1,
    gridAssessFee: 2,
    ancillaryFee: 3,
    otherFee: 4,
    greenCertPrice: 5,
    greenPremiumPrice: 6
  },
  guangdong: {
    mechanismEnabled: true,
    mechanismRatio: 0.2,
    mechanismPrice: 320,
    marketOpFee: 8,
    gridAssessFee: 9,
    ancillaryFee: 10,
    otherFee: 11,
    greenCertPrice: 12,
    greenPremiumPrice: 13,
    storageArbitragePrice: 14,
    storageCapacityCompPrice: 15,
    storageAncillaryRevenuePrice: 16,
    storageOtherRevenuePrice: 17
  }
};

function getProvinceDefaults(key) {
  return defaultsByProvince[key] || {};
}

function getProvinceName(key) {
  return provinces.find((province) => province.key === key)?.name || key;
}

function getRegionKey(key) {
  return key === "guangdong" ? "south" : "east";
}

assert.equal(shouldRefreshProvinceDefaultMessage("已带入江苏默认参数"), false);
assert.equal(shouldRefreshProvinceDefaultMessage("当前项目已选省份：江苏。"), true);

const empty = buildProvinceDefaultsViewModel({ provinces });
assert.equal(empty.selector.disabled, true);
assert.equal(empty.selector.value, "");
assert.match(empty.bodyHtml, /当前项目尚未选择省份/);
assert.match(empty.message.text, /请选择项目后/);

const switched = buildProvinceDefaultsViewModel({
  project: { id: "p1", province: "jiangsu", hasStorage: false },
  provinces,
  selectedProvinceDefaultKey: "guangdong",
  selectedProvinceDefaultContextKey: "p0:shanghai",
  getProvinceDefaults,
  getProvinceName,
  getRegionKey
});
assert.equal(switched.selectedKey, "jiangsu");
assert.equal(switched.contextKey, "p1:jiangsu");
assert.match(switched.bodyHtml, /当前项目/);

const selectedOther = buildProvinceDefaultsViewModel({
  project: { id: "p1", province: "jiangsu", hasStorage: true },
  provinces,
  selectedProvinceDefaultKey: "guangdong",
  selectedProvinceDefaultContextKey: "p1:jiangsu",
  expandedKeys: ["guangdong"],
  currentMessage: "当前项目已选省份：江苏。",
  getProvinceDefaults,
  getProvinceName,
  getRegionKey
});
assert.equal(selectedOther.selectedKey, "guangdong");
assert.equal(selectedOther.selector.value, "guangdong");
assert.ok(selectedOther.selector.html.indexOf('value="jiangsu"') < selectedOther.selector.html.indexOf('value="shanghai"'));
assert.ok(selectedOther.selector.html.indexOf('value="shanghai"') < selectedOther.selector.html.indexOf('value="guangdong"'));
assert.match(selectedOther.message.text, /广东<script>默认参数/);
assert.match(selectedOther.bodyHtml, /广东&lt;script&gt;/);
assert.match(selectedOther.bodyHtml, /配储辅助服务收益/);
assert.match(selectedOther.bodyHtml, /aria-expanded="true"/);

const preservedMessage = buildProvinceDefaultsViewModel({
  project: { id: "p1", province: "jiangsu", hasStorage: false },
  provinces,
  currentMessage: "已带入 江苏 默认参数，并应用到当前场景。",
  getProvinceDefaults,
  getProvinceName,
  getRegionKey
});
assert.equal(preservedMessage.message, null);

console.log("province defaults tests passed");
