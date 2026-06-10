"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.NE_POLICY_PANEL = api;
  if (root.window && root.window !== root) {
    root.window.NE_POLICY_PANEL = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function escapeHtml(text) {
    return String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function optionHtml(value, label) {
    return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  }

  function bindBenchmarkRangeDrag(input = {}) {
    const {
      refs = {},
      windowRef = null,
      handlers = {}
    } = input;
    const slider = refs.benchmarkRangeSlider;
    if (!slider) return false;

    const onPointerMove = (event) => {
      handlers.updateDrag?.(event.clientY, false);
    };

    const onPointerUp = (event) => {
      if (handlers.isDragActive?.()) {
        handlers.updateDrag?.(event.clientY, true);
      }
      handlers.stopDrag?.();
      windowRef?.removeEventListener?.("pointermove", onPointerMove);
      windowRef?.removeEventListener?.("pointerup", onPointerUp);
    };

    const beginDrag = (handleType, event) => {
      event.preventDefault?.();
      handlers.startDrag?.(handleType, event.clientY);
      windowRef?.addEventListener?.("pointermove", onPointerMove);
      windowRef?.addEventListener?.("pointerup", onPointerUp);
    };

    refs.benchmarkRangeHandleMax?.addEventListener("pointerdown", (event) => {
      beginDrag("max", event);
    });

    refs.benchmarkRangeHandleMin?.addEventListener("pointerdown", (event) => {
      beginDrag("min", event);
    });

    slider.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (target === refs.benchmarkRangeHandleMax || target === refs.benchmarkRangeHandleMin) return;
      const value = handlers.valueFromClientY?.(event.clientY);
      if (!Number.isFinite(value)) return;
      const rangeState = handlers.getRangeState?.() || {};
      const bounds = rangeState.bounds || {};
      const currentMin = Number.isFinite(rangeState.rangeMin) ? rangeState.rangeMin : bounds.min;
      const currentMax = Number.isFinite(rangeState.rangeMax) ? rangeState.rangeMax : bounds.max;
      const handleType = Math.abs(value - currentMax) <= Math.abs(value - currentMin) ? "max" : "min";
      beginDrag(handleType, event);
    });
    return true;
  }

  function buildPolicyCardHtml(card, provinceName) {
    return `
    <article class="policy-card">
      <div class="label">${escapeHtml(card.regionName)} · 地区政策</div>
      <div class="title">${escapeHtml(card.title)}</div>
      <div class="desc">围绕省级市场建设进程、规则口径与价格运行进行统一盘点。</div>
      <div class="policy-meta-grid">
        <div class="meta-item">
          <span class="meta-key">省份</span>
          <span class="meta-value">${escapeHtml(provinceName)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-key">区域</span>
          <span class="meta-value">${escapeHtml(card.regionName)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-key">更新时间</span>
          <span class="meta-value">${escapeHtml(card.updatedAt)}</span>
        </div>
      </div>
      <div class="policy-section-grid">
        <div class="meta-item">
          <span class="meta-key">电力市场建设里程碑盘点</span>
          <span class="meta-value policy-section-value">${escapeHtml(card.milestoneReview)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-key">最新规则体系解读</span>
          <span class="meta-value policy-section-value">${escapeHtml(card.ruleSystemReview)}</span>
        </div>
        <div class="meta-item full">
          <span class="meta-key">供需及电价情况简述</span>
          <span class="meta-value policy-section-value">${escapeHtml(card.supplyPriceBrief)}</span>
        </div>
      </div>
    </article>
  `;
  }

  function buildPolicyPanelViewModel(input = {}) {
    const {
      filters = {},
      provinceKeySet = new Set(),
      regionKeySet = new Set(),
      regions = [],
      provinces = [],
      cards = []
    } = input;
    const provinceNames = new Map(provinces.map((province) => [province.key, province.name]));
    const normalized = {
      provinceKey: provinceKeySet.has(filters.provinceKey) || filters.provinceKey === "all" ? filters.provinceKey : "all",
      regionKey: regionKeySet.has(filters.regionKey) || filters.regionKey === "all" ? filters.regionKey : "all"
    };
    if (normalized.regionKey === "all" && normalized.provinceKey === "all") {
      normalized.regionKey = "east";
      normalized.provinceKey = "shanghai";
    }

    const regionOptions = [
      optionHtml("all", "全部区域"),
      ...regions.map((region) => optionHtml(region.key, region.name))
    ];
    const targetRegion = normalized.regionKey;
    const availableProvinceKeySet = new Set(
      cards
        .filter((card) => targetRegion === "all" || card.regionKey === targetRegion)
        .map((card) => card.provinceKey)
    );
    const provinceOptions = [
      optionHtml("all", "全部省份"),
      ...provinces
        .filter((province) => availableProvinceKeySet.has(province.key))
        .map((province) => optionHtml(province.key, province.name))
    ];
    if (!provinceOptions.some((option) => option.includes(`value="${escapeHtml(normalized.provinceKey)}"`))) {
      normalized.provinceKey = "all";
    }

    const targetProvince = normalized.provinceKey;
    const filteredCards = cards.filter((card) => {
      const byRegion = targetRegion === "all" || card.regionKey === targetRegion;
      const byProvince = targetProvince === "all" || card.provinceKey === targetProvince;
      return byProvince && byRegion;
    });
    const cardListHtml = filteredCards.length
      ? filteredCards
        .map((card) => buildPolicyCardHtml(card, provinceNames.get(card.provinceKey) || card.provinceKey))
        .join("")
      : `<div class="info-box">未检索到匹配地区政策，请调整省份或区域筛选。</div>`;

    return {
      cardListHtml,
      filters: normalized,
      provinceOptionsHtml: provinceOptions.join(""),
      regionOptionsHtml: regionOptions.join("")
    };
  }

  return Object.freeze({
    bindBenchmarkRangeDrag,
    buildPolicyCardHtml,
    buildPolicyPanelViewModel
  });
});
