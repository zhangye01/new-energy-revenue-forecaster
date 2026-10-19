"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_CONTEXT_HELP = api;
  if (root.window && root.window !== root) root.window.NE_CONTEXT_HELP = api;
  const documentRef = root.document;
  if (!documentRef) return;
  const start = () => api.bindContextHelp(documentRef);
  if (documentRef.readyState === "loading") documentRef.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const HELP_SELECTOR = "[data-context-help]";
  const BUTTON_SELECTOR = "[data-context-help-button]";
  const CARD_SELECTOR = ".context-help-card";
  const HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6,legend,strong";
  const boundDocuments = new WeakSet();
  const closeTimers = new WeakMap();
  let nextHelpId = 0;

  function getContextHelpButton(container) {
    return container?.querySelector?.(BUTTON_SELECTOR) || null;
  }

  function isOpen(container) {
    return ["open", "focus-open", "hover-open"].some((name) => container.classList?.contains(name));
  }

  function calculateContextHelpShift(anchorLeft, cardWidth, viewportWidth, margin = 12) {
    if (![anchorLeft, cardWidth, viewportWidth].every(Number.isFinite)) return 0;
    const maximumLeft = Math.max(margin, viewportWidth - margin - cardWidth);
    return Math.min(Math.max(anchorLeft, margin), maximumLeft) - anchorLeft;
  }

  function calculateContextHelpPosition(anchor, card, viewport, margin = 12) {
    const left = anchor.left + calculateContextHelpShift(anchor.left, card.width, viewport.width, margin);
    const below = anchor.bottom + 6;
    const above = anchor.top - card.height - 6;
    const preferred = below + card.height <= viewport.height - margin ? below : above;
    const top = Math.max(margin, Math.min(preferred, viewport.height - margin - card.height));
    return { left: Math.round(left), top: Math.round(top) };
  }

  function positionContextHelpCard(container, documentRef) {
    const card = container?.querySelector?.(CARD_SELECTOR);
    const anchor = getContextHelpButton(container)?.getBoundingClientRect?.();
    const size = card?.getBoundingClientRect?.();
    const viewport = { width: documentRef?.defaultView?.innerWidth, height: documentRef?.defaultView?.innerHeight };
    if (!card?.style || !anchor || !size || !viewport.width || !viewport.height) return null;
    const position = calculateContextHelpPosition(anchor, size, viewport);
    card.style.left = `${position.left}px`;
    card.style.top = `${position.top}px`;
    return position;
  }

  function syncVisibility(container) {
    const expanded = isOpen(container);
    const card = container?.querySelector?.(CARD_SELECTOR);
    getContextHelpButton(container)?.setAttribute?.("aria-expanded", String(expanded));
    if (card?.showPopover && card.isConnected) {
      if (expanded && !card.matches(":popover-open")) card.showPopover();
      if (!expanded && card.matches(":popover-open")) card.hidePopover();
    }
    if (expanded) positionContextHelpCard(container, container.ownerDocument);
  }

  function setContextHelpOpen(container, open) {
    if (!container?.classList) return false;
    if (open) container.classList.remove("dismissed");
    container.classList.toggle("open", Boolean(open));
    container.classList.remove("focus-open");
    container.classList.remove("hover-open");
    syncVisibility(container);
    return Boolean(open);
  }

  function setContextHelpFocus(container, focused) {
    if (!container?.classList) return false;
    container.classList.toggle("focus-open", Boolean(focused));
    syncVisibility(container);
    return Boolean(focused);
  }

  function closeContextHelps(documentRef, exceptContainer = null) {
    let closedCount = 0;
    documentRef?.querySelectorAll?.(HELP_SELECTOR).forEach((container) => {
      if (container === exceptContainer) return;
      if (isOpen(container)) closedCount += 1;
      clearTimeout(closeTimers.get(container));
      setContextHelpOpen(container, false);
    });
    return closedCount;
  }

  function enterHelp(container, documentRef) {
    clearTimeout(closeTimers.get(container));
    if (container.classList.contains("dismissed")) return;
    closeContextHelps(documentRef, container);
    container.classList.add("hover-open");
    syncVisibility(container);
  }

  function leaveHelp(container, event) {
    if (event?.relatedTarget && container.contains?.(event.relatedTarget)) return;
    container.classList.remove("dismissed");
    clearTimeout(closeTimers.get(container));
    closeTimers.set(container, setTimeout(() => {
      container.classList.remove("hover-open");
      syncVisibility(container);
    }, 140));
  }

  function bindContextHelpContainer(container, documentRef) {
    if (!container || container.dataset?.contextHelpBound === "true") return false;
    const button = getContextHelpButton(container);
    if (!button?.addEventListener) return false;
    const card = container.querySelector(CARD_SELECTOR);
    container.dataset.contextHelpBound = "true";
    if (card?.showPopover) card.setAttribute("popover", "manual");
    button.addEventListener("click", (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const opening = !container.classList.contains("open");
      closeContextHelps(documentRef, container);
      setContextHelpOpen(container, opening);
      container.classList.toggle("dismissed", !opening);
    });
    button.addEventListener("focus", () => {
      if (container.classList.contains("dismissed") || container.classList.contains("open")) return;
      closeContextHelps(documentRef, container);
      setContextHelpFocus(container, true);
    });
    container.addEventListener?.("focusout", (event) => {
      if (event?.relatedTarget && container.contains?.(event.relatedTarget)) return;
      container.classList.remove("dismissed");
      setContextHelpFocus(container, false);
    });
    container.addEventListener?.("pointerleave", (event) => leaveHelp(container, event));
    container.addEventListener?.("mouseenter", () => enterHelp(container, documentRef));
    button.addEventListener("mouseenter", () => enterHelp(container, documentRef));
    card?.addEventListener?.("click", (event) => {
      event?.stopPropagation?.();
      if (container.closest?.("label,summary")) event?.preventDefault?.();
    });
    card?.addEventListener?.("mouseenter", () => enterHelp(container, documentRef));
    card?.addEventListener?.("pointerleave", (event) => leaveHelp(container, event));
    return true;
  }

  function findHelpAnchor(source, documentRef) {
    const selector = source.dataset.helpAnchor;
    if (selector) {
      const scope = source.closest("section,fieldset,article,.policy-card,.rough-card") || source.parentElement;
      const explicit = scope?.querySelector(selector) || documentRef.querySelector(selector);
      if (explicit && explicit !== source && !source.contains(explicit)) return explicit;
    }
    const previous = source.previousElementSibling;
    if (previous?.matches(HEADING_SELECTOR)) return previous;
    const parent = source.parentElement;
    const heading = Array.from(parent?.children || []).find((child) => child.matches(HEADING_SELECTOR));
    return heading || null;
  }

  function preserveFieldName(anchor) {
    const label = anchor?.closest("label");
    if (!label) return;
    const control = label.querySelector("input,select,textarea");
    if (!control || control.hasAttribute("aria-label") || control.hasAttribute("aria-labelledby")) return;
    const copy = label.cloneNode(true);
    copy.querySelectorAll("input,select,textarea,button,[data-help],[data-context-help]").forEach((node) => node.remove());
    const name = copy.textContent.replace(/\s+/g, " ").trim();
    if (name) control.setAttribute("aria-label", name);
  }

  function createHelp(topic, documentRef) {
    let id;
    do { id = `context-help-auto-${++nextHelpId}`; } while (documentRef.getElementById(id));
    const container = documentRef.createElement("span");
    container.className = "context-help context-help-auto";
    container.setAttribute("data-context-help", "");
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = "context-help-button";
    button.setAttribute("data-context-help-button", "");
    button.setAttribute("aria-label", `${topic}说明`);
    button.setAttribute("aria-controls", id);
    button.setAttribute("aria-describedby", id);
    button.setAttribute("aria-expanded", "false");
    const glyph = documentRef.createElement("span");
    glyph.className = "context-help-glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = "?";
    button.append(glyph);
    const card = documentRef.createElement("span");
    card.id = id;
    card.className = "context-help-card";
    card.setAttribute("role", "tooltip");
    container.append(button, card);
    return container;
  }

  function enhanceDescription(source, documentRef) {
    if (!source.dataset || source.dataset.helpEnhanced || source.closest(CARD_SELECTOR)) return false;
    if (!source.textContent.trim()) return false;
    source.dataset.helpEnhanced = "true";
    let anchor = findHelpAnchor(source, documentRef);
    const outerControl = (anchor || source).closest("button,a,input,select,textarea");
    if (outerControl) anchor = null;
    preserveFieldName(anchor || source);
    const existing = anchor && Array.from(anchor.children).find((child) => child.matches(".context-help-auto"));
    const container = existing || createHelp(source.dataset.help || "相关", documentRef);
    if (!existing) {
      if (anchor) anchor.append(container);
      else (outerControl || source).before(container);
    }
    const card = container.querySelector(CARD_SELECTOR);
    const heading = documentRef.createElement("strong");
    heading.textContent = source.dataset.help || "说明";
    source.classList.add("context-help-copy");
    card.append(heading, source);
    return true;
  }

  function enhanceHelpDescriptions(documentRef) {
    if (!documentRef?.createElement) return 0;
    let count = 0;
    documentRef.querySelectorAll("[data-help]:not([data-help-enhanced])").forEach((source) => {
      if (enhanceDescription(source, documentRef)) count += 1;
    });
    return count;
  }

  function bindDynamicHelp(documentRef) {
    const Observer = documentRef.defaultView?.MutationObserver;
    if (!Observer || !documentRef.body) return;
    const selector = "[data-help]:not([data-help-enhanced]),[data-context-help]:not([data-context-help-bound])";
    const observer = new Observer((records) => {
      const relevant = records.some((record) => record.target?.closest?.("[data-help]:not([data-help-enhanced])")
        || Array.from(record.addedNodes).some((node) => node.matches?.(selector) || node.querySelector?.(selector)));
      if (relevant) bindContextHelp(documentRef);
    });
    observer.observe(documentRef.body, { childList: true, subtree: true });
  }

  function bindDocumentDismissal(documentRef) {
    if (!documentRef?.addEventListener || boundDocuments.has(documentRef)) return;
    boundDocuments.add(documentRef);
    documentRef.addEventListener("click", (event) => {
      if (event?.target?.closest?.(HELP_SELECTOR)) return;
      closeContextHelps(documentRef);
    });
    documentRef.addEventListener("keydown", (event) => {
      if (event?.key !== "Escape") return;
      const active = Array.from(documentRef.querySelectorAll?.(HELP_SELECTOR) || []).find(isOpen);
      if (!active) return;
      const wasFocused = active.contains?.(documentRef.activeElement);
      closeContextHelps(documentRef);
      active.classList.add("dismissed");
      if (wasFocused) getContextHelpButton(active)?.focus?.();
    });
    documentRef.addEventListener("scroll", (event) => {
      if (event.target?.closest?.(CARD_SELECTOR)) return;
      documentRef.querySelectorAll(HELP_SELECTOR).forEach((container) => {
        if (!isOpen(container)) return;
        const rect = getContextHelpButton(container)?.getBoundingClientRect?.();
        const viewport = documentRef.defaultView;
        if (!rect?.width || rect.bottom <= 0 || rect.top >= viewport.innerHeight || rect.right <= 0 || rect.left >= viewport.innerWidth) {
          setContextHelpOpen(container, false);
        } else positionContextHelpCard(container, documentRef);
      });
    }, true);
    documentRef.defaultView?.addEventListener("resize", () => closeContextHelps(documentRef));
    bindDynamicHelp(documentRef);
  }

  function bindContextHelp(documentRef) {
    enhanceHelpDescriptions(documentRef);
    let boundCount = 0;
    documentRef?.querySelectorAll?.(HELP_SELECTOR).forEach((container) => {
      if (bindContextHelpContainer(container, documentRef)) boundCount += 1;
    });
    bindDocumentDismissal(documentRef);
    return boundCount;
  }

  return Object.freeze({
    bindContextHelp, bindContextHelpContainer, calculateContextHelpShift,
    calculateContextHelpPosition, closeContextHelps, enhanceHelpDescriptions,
    positionContextHelpCard, setContextHelpFocus, setContextHelpOpen
  });
});
