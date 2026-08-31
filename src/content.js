import confetti from "canvas-confetti";
import { getAnonymousInstallId, getInstallId, isVipInstallId } from "./shared/install-id.js";

let tooltipHost = null;
let requestSequence = 0;
let currentAnchorRect = null;
let currentResult = null;
let currentText = "";
let detailsOpen = false;
let dismissedSelection = null;
let autoConvert = true;
let customTimeKeywords = [];
let selectionTimer = null;
let currentReferenceContext = null;
let reportCaseKey = "";
let reportState = "idle";
let reportError = "";
let pointerGesture = null;
let pendingSelectionSnapshot = null;
let vipEnabled = false;
let anonymousInstallId = "";
let magicCode = "";

const POINTER_MOVE_THRESHOLD = 4;
const CELEBRATION_COLORS = ["#7c5cfc", "#a97cff", "#d48bff", "#4d427f", "#ffbd32"];
const HEART_CELEBRATION_COLORS = ["#ef5b8b", "#ff79a8", "#d48bff", "#a97cff", "#ffbd32"];
const CELEBRATION_CLICK_LIMIT = 10;
const CELEBRATION_CLICK_WINDOW_MS = 10_000;
const CELEBRATION_SHAKE_THRESHOLD_MS = 1_000;
let confettiCanvas = null;
let confettiInstance = null;
const heartShapes = new Map();
const celebrationClickStates = new WeakMap();

const explicitTwelveHourTime = /\b(?:0?[1-9]|1[0-2])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\b/i;
const explicitTwentyFourHourTime = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/;
const namedTime = /\b(?:noon|midnight|close\s+of\s+business)\b/i;
const weekdayWithTimeZone = /\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b[\s\S]{0,32}\b(?:uk|british\s+time|london(?:\s+time)?|bst|gmt|eastern\s+time|eastern|et|new\s+york|est|edt|pacific\s+time|pacific|pt|los\s+angeles|pst|pdt|japan(?:\s+time)?|jst|tokyo(?:\s+time)?|singapore(?:\s+time)?|sgt|india(?:\s+time)?|ist|mumbai|central\s+european\s+time|cet|paris(?:\s+time)?|berlin(?:\s+time)?|china(?:\s+time)?|beijing(?:\s+time)?|cst|utc|zulu)\b/i;
const standardDateTime = /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}[T\s]+(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\s*(?:Z|UTC|GMT|UTC[+-]\d{1,2}(?::?\d{2})?|GMT[+-]\d{1,2}(?::?\d{2})?|[+-]\d{2}:?\d{2}))?/i;

function isTimeCandidate(text) {
  const value = String(text || "").trim();
  if (!value || value.length > 240 || /https?:\/\//i.test(value)) return false;
  if (explicitTwelveHourTime.test(value) || explicitTwentyFourHourTime.test(value) || namedTime.test(value) || weekdayWithTimeZone.test(value) || standardDateTime.test(value)) return true;
  return matchesCustomKeyword(value);
}

function normalizeCustomKeywords(value) {
  const list = (Array.isArray(value) ? value : [value]).flatMap((item) => String(item ?? "").split(/[\n,;]+/));
  return list
    .map((item) => item.trim().toLocaleLowerCase())
    .filter(Boolean);
}

function matchesCustomKeyword(value) {
  const lowerValue = String(value || "").toLocaleLowerCase();
  return customTimeKeywords.some((keyword) => lowerValue.includes(keyword));
}

chrome.storage.local.get("settings", (result) => {
  const settings = result.settings || {};
  autoConvert = settings.autoConvert !== false && settings.enabled !== false;
  customTimeKeywords = normalizeCustomKeywords(settings.customKeywords);
});

void getInstallId().then((installId) => {
  magicCode = installId;
  vipEnabled = isVipInstallId(installId);
}).catch(() => {
  magicCode = "";
  vipEnabled = false;
});

void getAnonymousInstallId().then((installId) => {
  anonymousInstallId = installId;
}).catch(() => {
  // The anonymous ID is only used for optional feedback metadata.
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.installId) {
    magicCode = String(changes.installId.newValue || "").trim();
    vipEnabled = isVipInstallId(magicCode);
    requestSequence += 1;
    hideTooltip();
  }
  if (areaName === "local" && changes.settings) {
    const settings = changes.settings.newValue || {};
    autoConvert = settings.autoConvert !== false && settings.enabled !== false;
    customTimeKeywords = normalizeCustomKeywords(settings.customKeywords);
    if (!autoConvert) {
      requestSequence += 1;
      hideTooltip();
    }
  }
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isExtensionContextValid() {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function hideTooltip() {
  if (tooltipHost) tooltipHost.style.display = "none";
}

function isEventInsideTooltip(event) {
  if (!tooltipHost) return false;
  const path = event.composedPath?.() || [];
  return path.includes(tooltipHost) || event.target === tooltipHost || tooltipHost.contains(event.target);
}

function sendRuntimeMessage(message, callback) {
  if (!isExtensionContextValid()) {
    hideTooltip();
    return false;
  }

  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (!isExtensionContextValid()) {
        hideTooltip();
        return;
      }
      callback(response, chrome.runtime.lastError || null);
    });
    return true;
  } catch (error) {
    const messageText = String(error?.message || error);
    if (/extension context invalidated/i.test(messageText) || !isExtensionContextValid()) {
      hideTooltip();
      return false;
    }
    callback(null, { message: messageText });
    return false;
  }
}

function getSelectionInfo() {
  const selection = window.getSelection();
  const text = selection?.toString().trim() || "";
  if (!text || !selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const selectionSnapshot = getSelectionSnapshot(selection);
  const rect = range.getBoundingClientRect();
  const gmail = globalThis.TimeTranslatorGmail;
  const onGmail = gmail?.isGmailWebPage?.() === true;
  const referenceContext = gmail?.extractMessageContext(range.startContainer) || (onGmail
    ? { kind: "gmail_message_unresolved", source: "gmail_page" }
    : null);
  const isEditable = isEditableNode(range.startContainer) || isEditableNode(range.endContainer);
  return { text, rect, referenceContext, selection: selectionSnapshot, isEditable };
}

function getSelectionSnapshot(selection = window.getSelection()) {
  if (!selection) return null;
  return {
    anchorNode: selection.anchorNode,
    anchorOffset: selection.anchorOffset,
    focusNode: selection.focusNode,
    focusOffset: selection.focusOffset,
  };
}

function isSameSelection(left, right) {
  return Boolean(left && right)
    && left.anchorNode === right.anchorNode
    && left.anchorOffset === right.anchorOffset
    && left.focusNode === right.focusNode
    && left.focusOffset === right.focusOffset;
}

function isEditableNode(node) {
  let element = node?.nodeType === 1 ? node : node?.parentElement;
  while (element) {
    const tagName = String(element.tagName || "").toUpperCase();
    if (tagName === "INPUT" || tagName === "TEXTAREA") return true;
    if (element.hasAttribute?.("contenteditable")) {
      return element.getAttribute("contenteditable")?.toLowerCase() !== "false";
    }
    element = element.parentElement;
  }
  return false;
}

function scheduleSelectionParse() {
  clearTimeout(selectionTimer);
  selectionTimer = setTimeout(() => {
    selectionTimer = null;
    const expectedSelection = pendingSelectionSnapshot;
    pendingSelectionSnapshot = null;
    const info = getSelectionInfo();
    if (!info) return;
    if (info.isEditable) return;
    if (expectedSelection && !isSameSelection(info.selection, expectedSelection)) return;
    if (!isTimeCandidate(info.text) || (currentText === info.text && tooltipHost?.style.display !== "none")) return;
    renderAndParse(info);
  }, 90);
}

function handlePointerDown(event) {
  if (event.button !== 0 || isEventInsideTooltip(event)) {
    pointerGesture = null;
    return;
  }
  pointerGesture = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    moved: false,
    selection: getSelectionSnapshot(),
  };
}

function handlePointerMove(event) {
  if (!pointerGesture || pointerGesture.pointerId !== event.pointerId || !(event.buttons & 1)) return;
  const distance = Math.hypot(event.clientX - pointerGesture.x, event.clientY - pointerGesture.y);
  if (distance >= POINTER_MOVE_THRESHOLD) pointerGesture.moved = true;
}

function handleSelectionRelease(event) {
  if (isEventInsideTooltip(event)) {
    pointerGesture = null;
    pendingSelectionSnapshot = null;
    return;
  }
  if (event.type === "mouseup" && pointerGesture) return;
  const gesture = pointerGesture;
  pointerGesture = null;
  if (!gesture?.moved) return;
  const info = getSelectionInfo();
  if (!info || info.isEditable || isSameSelection(info.selection, gesture.selection)) return;
  pendingSelectionSnapshot = info.selection;
  scheduleSelectionParse();
}

function ensureHost() {
  if (tooltipHost) return tooltipHost;
  tooltipHost = document.createElement("div");
  tooltipHost.id = "time-plain-tooltip-host";
  tooltipHost.style.position = "fixed";
  tooltipHost.style.zIndex = "2147483647";
  tooltipHost.style.display = "none";
  tooltipHost.style.width = "fit-content";
  tooltipHost.style.minWidth = "190px";
  tooltipHost.style.maxWidth = "min(290px, calc(100vw - 20px))";
  tooltipHost.style.pointerEvents = "auto";
  document.documentElement.appendChild(tooltipHost);
  tooltipHost.attachShadow({ mode: "open" });
  tooltipHost.shadowRoot.addEventListener("click", handleTooltipClick);
  return tooltipHost;
}

function placeHost(rect) {
  const host = ensureHost();
  host.style.display = "block";

  // First render at a neutral position so the browser can measure the real card height.
  host.style.left = "0px";
  host.style.top = "0px";
  const measured = host.getBoundingClientRect();
  const margin = 12;
  const gap = 10;
  const width = Math.min(measured.width || 340, window.innerWidth - margin * 2);
  const height = measured.height || 64;
  const anchor = {
    left: Number.isFinite(rect?.left) ? rect.left : window.innerWidth / 2,
    top: Number.isFinite(rect?.top) ? rect.top : (rect?.bottom || window.innerHeight / 2) - 24,
    bottom: Number.isFinite(rect?.bottom) ? rect.bottom : (rect?.top || window.innerHeight / 2) + 4,
    width: Number.isFinite(rect?.width) ? rect.width : 0,
  };

  const anchorCenter = anchor.left + anchor.width / 2;
  const left = Math.min(
    Math.max(margin, anchorCenter - width / 2),
    Math.max(margin, window.innerWidth - width - margin),
  );
  const spaceAbove = anchor.top - margin - gap;
  const spaceBelow = window.innerHeight - anchor.bottom - margin - gap;
  let top;
  let placement;

  if (spaceAbove >= height) {
    top = anchor.top - height - gap;
    placement = "top";
  } else if (spaceBelow >= height) {
    top = anchor.bottom + gap;
    placement = "bottom";
  } else if (spaceAbove >= spaceBelow) {
    top = Math.max(margin, anchor.top - height - gap);
    placement = "top";
  } else {
    top = Math.min(window.innerHeight - height - margin, anchor.bottom + gap);
    placement = "bottom";
  }

  host.style.left = `${Math.round(left)}px`;
  host.style.top = `${Math.round(Math.max(margin, top))}px`;
  host.dataset.placement = placement;
}

function tooltipStyles() {
  return `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .card {
      position: relative;
      color: #17191f;
      background: #ffffff;
      border: 0;
      border-radius: 13px;
      padding: 8px 11px 7px;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 8px 22px rgba(26, 32, 44, .18), 0 2px 4px rgba(26, 32, 44, .08);
    }
    .card::after {
      content: "";
      position: absolute;
      left: 50%;
      width: 18px;
      height: 10px;
      background: #ffffff;
      filter: drop-shadow(0 4px 3px rgba(26, 32, 44, .12));
      clip-path: polygon(0 0, 100% 0, 50% 100%);
    }
    :host([data-placement="top"]) .card::after { bottom: -8px; }
    :host([data-placement="bottom"]) .card::after { top: -8px; transform: translateX(-50%) rotate(180deg); }
    .flow { align-items: start; display: grid; gap: 6px; grid-template-columns: minmax(0, 1fr) auto max-content; }
    .side { align-self: start; min-width: 0; }
    .target-side { align-items: flex-end; display: flex; flex-direction: column; }
    .source { color: #17191f; font-size: 11px; font-weight: 400; line-height: 1.25; max-width: none; overflow-wrap: break-word; white-space: normal; }
    .zone { color: #8d96a3; font-size: 8px; font-weight: 400; letter-spacing: 0; line-height: 1.2; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .target-side .zone { text-align: right; }
    .arrow { align-self: center; color: #2d5cff; font-size: 15px; font-weight: 400; line-height: 1; }
    .result { color: #2d5cff; font-size: 12px; font-weight: 400; letter-spacing: -.01em; line-height: 1.2; text-align: right; white-space: nowrap; }
    .result.loading { color: #2d5cff; font-size: 10px; font-weight: 400; }
    .result.failed { color: #d94b3f; font-size: 10px; font-weight: 400; }
    .toolbar { align-items: center; display: flex; gap: 1px; justify-content: flex-end; margin-top: 1px; }
    button { align-items: center; background: transparent; border: 0; border-radius: 5px; color: #7c8490; cursor: pointer; display: inline-flex; font: inherit; justify-content: center; min-height: 18px; min-width: 18px; padding: 2px; transition: background .15s ease, color .15s ease, transform .15s ease; }
    button:hover, button:focus-visible { background: #eef2ff; color: #2d5cff; outline: none; }
    button:active { transform: translateY(1px); }
    .copy { color: #2d5cff; }
    .copy:hover, .copy:focus-visible { color: #2148d7; }
    .refresh { color: #687180; }
    .refresh:hover, .refresh:focus-visible { color: #2d5cff; }
    .report { color: #d8834f; }
    .report:hover, .report:focus-visible { color: #c76537; }
    .report.reported { color: #5f9d7e; }
    .report.failed { color: #d94b3f; }
    .report-emoji { display: inline-block; font-size: 11px; line-height: 1; }
    .celebrate { color: #9a6a00; font-size: 9px; font-weight: 700; gap: 2px; letter-spacing: .01em; padding: 2px 4px; white-space: nowrap; }
    .celebrate:hover, .celebrate:focus-visible { background: #fff5d9; color: #7d5300; }
    .celebrate.is-charging { background: #fff5d9; box-shadow: 0 0 0 2px rgba(255, 189, 50, .14); color: #7d5300; transform: scale(1.04) rotate(-1.4deg); }
    .celebrate.is-charging-shake { animation: celebrate-charge-wiggle .4s ease-in-out infinite; }
    .celebrate-icon { height: 10px; width: 10px; }
    .celebrate.is-celebrated { animation: celebrate-pop .48s cubic-bezier(.2, .9, .25, 1.25); background: #fff5d9; box-shadow: 0 0 0 2px rgba(255, 189, 50, .18); color: #7d5300; }
    .celebration-layer { inset: -22px; overflow: visible; pointer-events: none; position: absolute; z-index: 3; }
    .celebration-canvas { display: block; height: 100%; left: 0; pointer-events: none; position: absolute; top: 0; width: 100%; }
    @keyframes celebrate-pop { 0%, 100% { transform: scale(1); } 45% { transform: scale(1.08) rotate(-2deg); } 72% { transform: scale(.98) rotate(1deg); } }
    .celebration-message { animation: celebration-heart-pop 1.9s cubic-bezier(.2, .82, .25, 1) forwards; color: #ef5b8b; font-size: 13px; font-weight: 800; left: 50%; line-height: 1; position: absolute; text-shadow: 0 2px 8px rgba(239, 91, 139, .24); top: 42%; transform: translate(-50%, -50%); white-space: nowrap; }
    @keyframes celebrate-charge-wiggle { 0%, 18% { transform: scale(1.04) rotate(-1.4deg); } 36% { transform: scale(1.04) translateX(-1.5px) rotate(-.7deg); } 54% { transform: scale(1.04) translateX(1.5px) rotate(.8deg); } 72% { transform: scale(1.04) translateX(-1px) rotate(-.5deg); } 100% { transform: scale(1.04) translateX(1px) rotate(.4deg); } }
    @keyframes celebration-heart-pop { 0% { opacity: 0; transform: translate(-50%, -20%) scale(.72) rotate(-5deg); } 18% { opacity: 1; transform: translate(-50%, -50%) scale(1.08) rotate(2deg); } 70% { opacity: 1; transform: translate(-50%, -105%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -155%) scale(.92); } }
    @media (prefers-reduced-motion: reduce) {
      .celebrate.is-celebrated { animation: none; }
      .celebrate.is-charging-shake { animation: none; }
      .celebration-message { animation: none; opacity: 1; }
    }
    .info.active { background: #eef2ff; color: #2d5cff; }
    .close { margin-left: 1px; }
    .details { color: #687180; font-size: 9px; line-height: 1.4; margin-top: 6px; padding-top: 1px; }
    .details-row { display: flex; gap: 6px; justify-content: space-between; }
    .details-row + .details-row { margin-top: 4px; }
    .details-label { color: #9aa2af; flex: 0 0 auto; }
    .details-value { color: #303641; text-align: right; word-break: break-word; }
    .reference-note { color: #8d96a3; font-size: 8px; line-height: 1.2; margin-top: 4px; text-align: right; }
    .assumption { color: #8a6500; margin-top: 7px; }
    .error { color: #d94b3f; font-size: 10px; line-height: 1.35; margin-top: 6px; }
    .error-actions { display: flex; gap: 3px; justify-content: flex-end; margin-top: 3px; }
  `;
}

function icon(name) {
  const icons = {
    copy: '<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12"><rect x="5" y="5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 5V3.7A1.7 1.7 0 0 0 8.8 2H4.7A1.7 1.7 0 0 0 3 3.7v4.1a1.7 1.7 0 0 0 1.7 1.7H5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    info: '<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.1v4M8 4.7v.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"/></svg>',
    close: '<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12"><path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4"/></svg>',
    check: '<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12"><path d="m3.4 8.4 3 3.1 6.2-6.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>',
    refresh: '<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12"><path d="M13 5.7A5.2 5.2 0 0 0 3.5 5M3.5 5V2.8M3.5 5h2.2M3 10.3A5.2 5.2 0 0 0 12.5 11M12.5 11v2.2M12.5 11h-2.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4"/></svg>',
    spark: '<svg class="celebrate-icon" aria-hidden="true" viewBox="0 0 16 16" width="10" height="10"><path d="m8 1.5 1 4.1 3.5 1.4L9 8.4 8 12.5 7 8.4 3.5 7 7 5.6 8 1.5ZM12.5 10.2l.4 1.7 1.6.6-1.6.7-.4 1.7-.4-1.7-1.6-.7 1.6-.6.4-1.7Z" fill="currentColor"/></svg>',
    report: '<span class="report-emoji" aria-hidden="true">💢</span>',
  };
  return icons[name] || "";
}

function getCelebrationProfile(holdDuration = 0) {
  const duration = Math.min(Math.max(Number(holdDuration) || 0, 0), 1800);
  const charge = duration / 1800;
  return {
    charge,
    particleCount: Math.round(28 + charge * 72),
    spread: Math.round(62 + charge * 108),
    startVelocity: Math.round(28 + charge * 22),
    decay: Number((0.92 - charge * 0.03).toFixed(2)),
    gravity: Number((0.82 - charge * 0.3).toFixed(2)),
    ticks: Math.round(125 + charge * 95),
    scalar: Number((0.68 + charge * 0.3).toFixed(2)),
    flightDuration: Math.round(1050 + charge * 400),
  };
}

function getConfettiInstance() {
  if (confettiCanvas && confettiInstance) return confettiInstance;

  const existingCanvas = document.getElementById("time-translator-celebration-canvas");
  const canvas = existingCanvas instanceof HTMLCanvasElement ? existingCanvas : document.createElement("canvas");
  canvas.id = "time-translator-celebration-canvas";
  canvas.className = "celebration-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = Math.max(1, Math.round(globalThis.innerWidth || 1));
  canvas.height = Math.max(1, Math.round(globalThis.innerHeight || 1));
  Object.assign(canvas.style, {
    height: "100vh",
    left: "0",
    pointerEvents: "none",
    position: "fixed",
    top: "0",
    width: "100vw",
    zIndex: "2147483646",
  });
  if (!canvas.isConnected) document.documentElement.append(canvas);
  confettiCanvas = canvas;
  confettiInstance = confetti.create(canvas, {
    disableForReducedMotion: true,
    resize: true,
    useWorker: false,
  });
  return confettiInstance;
}

function getHeartShape(color = "#ef5b8b") {
  if (heartShapes.has(color) || typeof confetti.shapeFromText !== "function") return heartShapes.get(color) || null;
  try {
    const shape = confetti.shapeFromText({ text: "♥", scalar: 1.35, color });
    heartShapes.set(color, shape);
  } catch {
    // Fall back to built-in shapes if this browser cannot rasterize text shapes.
  }
  return heartShapes.get(color) || null;
}

function getCelebrationOrigin(button) {
  const buttonRect = button.getBoundingClientRect();
  const viewportWidth = Math.max(1, globalThis.innerWidth || 1);
  const viewportHeight = Math.max(1, globalThis.innerHeight || 1);
  return {
    x: Math.min(1, Math.max(0, (buttonRect.left + buttonRect.width / 2) / viewportWidth)),
    y: Math.min(1, Math.max(0, (buttonRect.top + buttonRect.height / 2) / viewportHeight)),
  };
}

function showEasterEggMessage(button, { color = "#ef5b8b", shadowColor = "rgba(239, 91, 139, .24)" } = {}) {
  const card = button.closest(".card") || button.getRootNode?.().querySelector?.(".card");
  const layer = card?.querySelector(".celebration-layer");
  if (!card || !layer) return;
  const message = document.createElement("span");
  message.className = "celebration-message";
  message.textContent = "♥ emma~";
  message.style.color = color;
  message.style.textShadow = `0 2px 8px ${shadowColor}`;
  message.setAttribute("aria-hidden", "true");
  layer.append(message);
  setTimeout(() => message.remove(), 1900);
}

function triggerHeartCelebration(button, { colors = HEART_CELEBRATION_COLORS, heartColor = "#ef5b8b" } = {}) {
  const origin = getCelebrationOrigin(button);
  const shoot = getConfettiInstance();
  const heart = getHeartShape(heartColor);
  const shapes = heart ? [heart, heart, "circle", "star"] : ["circle", "circle", "star"];
  shoot({
    angle: 90,
    colors,
    decay: 0.91,
    drift: 0,
    flat: false,
    gravity: 0.68,
    origin,
    particleCount: 54,
    scalar: 1.05,
    shapes,
    spread: 86,
    startVelocity: 38,
    ticks: 190,
  });
  showEasterEggMessage(button);
}

function recordCelebrationClick(button) {
  const now = Date.now();
  const clickTimes = (celebrationClickStates.get(button) || [])
    .filter((timestamp) => now - timestamp < CELEBRATION_CLICK_WINDOW_MS);
  clickTimes.push(now);
  if (clickTimes.length < CELEBRATION_CLICK_LIMIT) {
    celebrationClickStates.set(button, clickTimes);
    return false;
  }
  celebrationClickStates.delete(button);
  triggerHeartCelebration(button);
  return true;
}

function triggerCelebration(button, holdDuration = 0) {
  const card = button.closest(".card") || button.getRootNode?.().querySelector?.(".card");
  const layer = card?.querySelector(".celebration-layer");
  if (!card || !layer) return;
  const profile = getCelebrationProfile(holdDuration);

  const origin = getCelebrationOrigin(button);
  const shoot = getConfettiInstance();
  shoot({
    angle: 90,
    colors: CELEBRATION_COLORS,
    decay: profile.decay,
    drift: (Math.random() - 0.5) * (0.35 + profile.charge * 0.35),
    flat: false,
    gravity: profile.gravity,
    origin,
    particleCount: profile.particleCount,
    scalar: profile.scalar,
    shapes: ["square", "circle", "star"],
    spread: profile.spread,
    startVelocity: profile.startVelocity,
    ticks: profile.ticks,
  });

  button.classList.remove("is-celebrated");
  void button.offsetWidth;
  button.classList.add("is-celebrated");
  setTimeout(() => {
    button.classList.remove("is-celebrated");
  }, profile.flightDuration);
}

function renderLoading(text, rect) {
  const host = ensureHost();
  currentAnchorRect = rect;
  currentText = text;
  host.shadowRoot.innerHTML = `<style>${tooltipStyles()}</style>
    <div class="card">
      <div class="celebration-layer" aria-hidden="true"></div>
      <div class="flow">
        <div class="side"><div class="source" title="${escapeHtml(text)}">${escapeHtml(text)}</div></div>
        <div class="arrow">→</div>
        <div class="side target-side"><div class="result loading">正在换算…</div></div>
      </div>
    </div>`;
  placeHost(rect);
}

function renderResult(result, text, rect) {
  const host = ensureHost();
  currentResult = result;
  currentText = text;
  currentAnchorRect = rect;
  const nextReportCaseKey = `${text}\u0000${result?.ok ? result.displayText || "" : result?.reason || result?.error || ""}`;
  if (reportCaseKey !== nextReportCaseKey) {
    reportCaseKey = nextReportCaseKey;
    reportState = "idle";
    reportError = "";
  }

  const reportButton = () => {
    const reported = reportState === "sent";
    const failed = reportState === "failed";
    const sending = reportState === "sending";
    const label = reported ? "已抱怨" : failed ? "抱怨失败，点击重试" : "抱怨一下";
    const buttonClass = `report${reported ? " reported" : failed ? " failed" : ""}`;
    return `<button class="${buttonClass}" aria-label="${label}" title="${label}" data-action="report"${sending ? " disabled aria-busy=\"true\"" : ""}>${icon(reported ? "check" : "report")}</button>`;
  };
  if (!result?.ok) {
    host.shadowRoot.innerHTML = `<style>${tooltipStyles()}</style>
      <div class="card">
        <div class="flow">
          <div class="side"><div class="source" title="${escapeHtml(text)}">${escapeHtml(text)}</div></div>
          <div class="arrow">→</div>
          <div class="side target-side"><div class="result failed">无法确定</div></div>
        </div>
        <div class="error">${escapeHtml(result?.reason || result?.error || "请补充日期、时间或时区")}</div>
        <div class="error-actions">
          <button class="refresh" aria-label="重新解析" title="重新解析" data-action="refresh">${icon("refresh")}</button>
          ${reportButton()}
          <button class="close" aria-label="关闭" title="关闭" data-action="close">${icon("close")}</button>
        </div>
      </div>`;
    placeHost(rect);
    return;
  }

  const sourceZone = formatSourceZone(result);
  const targetZone = formatTargetZone(result);
  const celebrateAction = vipEnabled
    ? `<button type="button" class="celebrate" aria-label="接案順心!" title="接案順心!" data-action="celebrate">${icon("spark")}<span>接案順心!</span></button>`
    : "";
  const source = escapeHtml(sourceZone);
  const relationLabels = { before: "不晚于", by: "截止", after: "之后", at: "时间点", between: "时间范围", from: "时间范围" };
  const assumptions = (result.assumptions || []).map((item) => `<div>· ${escapeHtml(item)}</div>`).join("");
  const referenceNote = result.referenceContext?.kind === "gmail_message" && result.referenceContext.relative
    ? `<div class="reference-note">按邮件日期计算${result.referenceContext.dateText ? `：${escapeHtml(result.referenceContext.dateText)}` : ""}</div>`
    : "";
  const details = detailsOpen ? `<div class="details">
      <div class="details-row"><span class="details-label">源时区</span><span class="details-value">${source}</span></div>
      <div class="details-row"><span class="details-label">语义</span><span class="details-value">${escapeHtml(relationLabels[result.relation] || result.relation || "时间转换")}</span></div>
      <div class="details-row"><span class="details-label">解析</span><span class="details-value">${escapeHtml(result.engine || "在线模型")}</span></div>
      <div class="details-row"><span class="details-label">目标</span><span class="details-value">${escapeHtml(targetZone)}</span></div>
      ${result.referenceContext?.kind === "gmail_message" && result.referenceContext.relative ? `<div class="details-row"><span class="details-label">参考</span><span class="details-value">按邮件日期计算${result.referenceContext.dateText ? ` · ${escapeHtml(result.referenceContext.dateText)}` : ""}</span></div>` : ""}
      ${assumptions ? `<div class="assumption">${assumptions}</div>` : ""}
      ${result.error ? `<div class="error">${escapeHtml(result.error)}</div>` : ""}
    </div>` : "";
  host.shadowRoot.innerHTML = `<style>${tooltipStyles()}</style>
    <div class="card">
      <div class="celebration-layer" aria-hidden="true"></div>
      <div class="flow">
        <div class="side">
          <div class="source" title="${escapeHtml(text)}">${escapeHtml(text)}</div>
          <div class="zone">${escapeHtml(sourceZone)}</div>
        </div>
        <div class="arrow">→</div>
        <div class="side target-side">
          <div class="result">${escapeHtml(result.displayText)}</div>
          <div class="zone">${escapeHtml(targetZone)}</div>
          ${referenceNote}
        </div>
      </div>
      <div class="toolbar">
        ${celebrateAction}
        <button class="copy" aria-label="复制北京时间" title="复制北京时间" data-action="copy" data-copy="${escapeHtml(result.displayText)}">${icon("copy")}</button>
        <button class="refresh" aria-label="重新解析" title="重新解析" data-action="refresh">${icon("refresh")}</button>
        ${reportButton()}
        <button class="info${detailsOpen ? " active" : ""}" aria-label="查看转换详情" title="查看转换详情" data-action="info">${icon("info")}</button>
        <button class="close" aria-label="关闭" title="关闭" data-action="close">${icon("close")}</button>
      </div>
      ${details}
    </div>`;
  const celebrateButton = host.shadowRoot.querySelector('[data-action="celebrate"]');
  if (celebrateButton) {
    let pressStartedAt = 0;
    let pressPointerId = null;
    let pendingHoldDuration = null;
    let shakeTimer = null;
    const clearShakeTimer = () => {
      if (shakeTimer) clearTimeout(shakeTimer);
      shakeTimer = null;
    };
    const startShakeTimer = () => {
      clearShakeTimer();
      shakeTimer = setTimeout(() => {
        if (!pressStartedAt) return;
        celebrateButton.classList.add("is-charging");
        celebrateButton.classList.add("is-charging-shake");
      }, CELEBRATION_SHAKE_THRESHOLD_MS);
    };
    const finishPress = (event) => {
      if (!pressStartedAt || (pressPointerId !== null && event.pointerId !== pressPointerId)) return;
      pendingHoldDuration = Date.now() - pressStartedAt;
      clearShakeTimer();
      pressStartedAt = 0;
      pressPointerId = null;
      celebrateButton.classList.remove("is-charging");
      celebrateButton.classList.remove("is-charging-shake");
      try {
        celebrateButton.releasePointerCapture?.(event.pointerId);
      } catch {
        // The pointer may already have been released by the browser.
      }
    };
    celebrateButton.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pressStartedAt = Date.now();
      pressPointerId = event.pointerId;
      pendingHoldDuration = null;
      startShakeTimer();
      try {
        celebrateButton.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is optional; the click event remains the fallback.
      }
    });
    celebrateButton.addEventListener("pointerup", finishPress);
    celebrateButton.addEventListener("pointercancel", (event) => {
      if (pressPointerId !== null && event.pointerId !== pressPointerId) return;
      pressStartedAt = 0;
      pressPointerId = null;
      pendingHoldDuration = null;
      clearShakeTimer();
      celebrateButton.classList.remove("is-charging");
      celebrateButton.classList.remove("is-charging-shake");
    });
    const celebrate = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const holdDuration = pendingHoldDuration || 0;
      pendingHoldDuration = null;
      const isClickEasterEgg = recordCelebrationClick(celebrateButton);
      if (!isClickEasterEgg) triggerCelebration(celebrateButton, holdDuration);
    };
    celebrateButton.addEventListener("click", celebrate);
  }
  placeHost(rect);
}

function formatSourceZone(result) {
  const name = String(result?.sourceTimeZoneName || "").trim();
  const zone = String(result?.sourceTimeZone || "").trim();
  if (name && zone && name !== zone) return `${name} · ${zone}`;
  return name || zone || "源时区";
}

function formatTargetZone(result) {
  const zone = String(result?.targetTimeZone || "").trim();
  if (zone === "Asia/Shanghai") return "北京时间 · UTC+8";
  if (zone === "UTC") return "UTC · UTC+0";
  return zone || "目标时区";
}

function renderAndParse(info, force = false) {
  if (!info || (!force && (!autoConvert || info.isEditable || !isTimeCandidate(info.text)))) return;
  if (dismissedSelection && info.text === dismissedSelection.text && Date.now() - dismissedSelection.at < 1200) return;
  if (!dismissedSelection || info.text !== dismissedSelection.text || force) dismissedSelection = null;
  if (!isExtensionContextValid()) {
    hideTooltip();
    return;
  }
  const requestId = ++requestSequence;
  detailsOpen = false;
  currentReferenceContext = info.referenceContext || null;
  renderLoading(info.text, info.rect);
  sendRuntimeMessage({ type: "PARSE_TEXT", text: info.text, referenceContext: currentReferenceContext }, (result, runtimeError) => {
    if (requestId !== requestSequence) return;
    if (runtimeError || !result?.ok) {
      renderResult(
        {
          ok: false,
          reason: runtimeError?.message || result?.reason || result?.error || "这段文字还缺少具体时间",
        },
        info.text,
        info.rect,
      );
      return;
    }
    renderResult(result, info.text, info.rect);
  });
}

document.addEventListener("pointerdown", handlePointerDown, true);
document.addEventListener("pointermove", handlePointerMove, true);
document.addEventListener("pointerup", handleSelectionRelease, true);
document.addEventListener("mouseup", handleSelectionRelease, true);

document.addEventListener("keyup", (event) => {
  if (event.key === "Shift" || event.key === "Alt" || event.key === "Control") {
    pendingSelectionSnapshot = null;
    scheduleSelectionParse();
  }
});

function handleTooltipClick(event) {
  const button = getTooltipButton(event);
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const action = button.dataset.action;
  if (action === "close") {
    dismissedSelection = { text: currentText, at: Date.now() };
    requestSequence += 1;
    hideTooltip();
  } else if (action === "copy") {
    navigator.clipboard?.writeText(button.dataset.copy || "");
    button.innerHTML = icon("check");
    button.setAttribute("aria-label", "已复制");
    button.setAttribute("title", "已复制");
    setTimeout(() => {
      if (button.isConnected) {
        button.innerHTML = icon("copy");
        button.setAttribute("aria-label", "复制北京时间");
        button.setAttribute("title", "复制北京时间");
      }
    }, 1200);
  } else if (action === "refresh") {
    const retryText = currentText;
    const retryRect = currentAnchorRect;
    if (retryText) renderAndParse({ text: retryText, rect: retryRect, referenceContext: currentReferenceContext }, true);
  } else if (action === "celebrate") {
    if (!vipEnabled) return;
    triggerCelebration(button);
  } else if (action === "report") {
    if (!currentText || reportState === "sending" || reportState === "sent") return;
    const caseKey = reportCaseKey;
    reportState = "sending";
    reportError = "";
    renderResult(currentResult, currentText, currentAnchorRect);
    const sent = sendRuntimeMessage(
      {
        type: "REPORT_CASE",
        rawText: currentText,
        result: currentResult,
        referenceContext: currentReferenceContext,
        anonymousInstallId,
        magicCode,
      },
      (response, runtimeError) => {
        if (caseKey !== reportCaseKey) return;
        reportState = response?.ok ? "sent" : "failed";
        reportError = runtimeError?.message || response?.reason || "反馈上报失败";
        renderResult(currentResult, currentText, currentAnchorRect);
      },
    );
    if (!sent && caseKey === reportCaseKey) {
      reportState = "failed";
      reportError = "反馈上报失败";
      renderResult(currentResult, currentText, currentAnchorRect);
    }
  } else if (action === "info") {
    detailsOpen = !detailsOpen;
    renderResult(currentResult, currentText, currentAnchorRect);
  }
}

function getTooltipButton(event) {
  return event.composedPath?.().find((node) => node?.nodeType === 1 && node.tagName === "BUTTON")
    || event.target?.closest?.("button");
}

function repositionTooltip() {
  if (!tooltipHost || tooltipHost.style.display === "none") return;
  const selection = getSelectionInfo();
  const rect = selection?.text === currentText ? selection.rect : currentAnchorRect;
  if (rect) placeHost(rect);
}

document.addEventListener("mousedown", (event) => {
  if (tooltipHost && !isEventInsideTooltip(event)) {
    if (currentText) dismissedSelection = { text: currentText, at: Date.now() };
    requestSequence += 1;
    hideTooltip();
  }
});

document.addEventListener("selectionchange", () => {
  const text = window.getSelection()?.toString().trim() || "";
  if (dismissedSelection && text !== dismissedSelection.text) dismissedSelection = null;
});

window.addEventListener("resize", repositionTooltip);
window.addEventListener("scroll", repositionTooltip, true);

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SHOW_CONVERSION") {
    const info = getSelectionInfo() || { text: message.text, rect: { left: window.innerWidth / 2 - 120, bottom: 60 } };
    renderAndParse({ ...info, text: message.text || info.text }, true);
  }
  if (message.type === "SHOW_CURRENT_SELECTION" && autoConvert) renderAndParse(getSelectionInfo(), true);
});
