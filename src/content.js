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

const explicitTwelveHourTime = /\b(?:0?[1-9]|1[0-2])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\b/i;
const explicitTwentyFourHourTime = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/;
const namedTime = /\b(?:noon|midnight)\b/i;
const standardDateTime = /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}[T\s]+(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\s*(?:Z|UTC|GMT|UTC[+-]\d{1,2}(?::?\d{2})?|GMT[+-]\d{1,2}(?::?\d{2})?|[+-]\d{2}:?\d{2}))?/i;

function isTimeCandidate(text) {
  const value = String(text || "").trim();
  if (!value || value.length > 240 || /https?:\/\//i.test(value)) return false;
  if (explicitTwelveHourTime.test(value) || explicitTwentyFourHourTime.test(value) || namedTime.test(value) || standardDateTime.test(value)) return true;
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

chrome.storage.onChanged.addListener((changes, areaName) => {
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
  const rect = range.getBoundingClientRect();
  const gmail = globalThis.TimeTranslatorGmail;
  const onGmail = gmail?.isGmailWebPage?.() === true;
  const referenceContext = gmail?.extractMessageContext(range.startContainer) || (onGmail
    ? { kind: "gmail_message_unresolved", source: "gmail_page" }
    : null);
  return { text, rect, referenceContext };
}

function scheduleSelectionParse() {
  clearTimeout(selectionTimer);
  selectionTimer = setTimeout(() => {
    selectionTimer = null;
    const info = getSelectionInfo();
    if (!info) return;
    if (!isTimeCandidate(info.text) || (currentText === info.text && tooltipHost?.style.display !== "none")) return;
    renderAndParse(info);
  }, 90);
}

function handleSelectionRelease(event) {
  if (tooltipHost && event.composedPath().includes(tooltipHost)) return;
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
    .flow { align-items: center; display: grid; gap: 6px; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1.35fr); }
    .side { min-width: 0; }
    .source { color: #17191f; font-size: 11px; font-weight: 400; line-height: 1.25; max-width: 145px; overflow-wrap: anywhere; white-space: normal; }
    .zone { color: #8d96a3; font-size: 8px; font-weight: 400; letter-spacing: 0; line-height: 1.2; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .target-side .zone { text-align: right; }
    .arrow { color: #2d5cff; font-size: 15px; font-weight: 400; line-height: 1; }
    .result { color: #2d5cff; font-size: 12px; font-weight: 400; letter-spacing: -.01em; line-height: 1.2; text-align: right; }
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
  };
  return icons[name] || "";
}

function renderLoading(text, rect) {
  const host = ensureHost();
  currentAnchorRect = rect;
  currentText = text;
  host.shadowRoot.innerHTML = `<style>${tooltipStyles()}</style>
    <div class="card">
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
          <button class="close" aria-label="关闭" title="关闭" data-action="close">${icon("close")}</button>
        </div>
      </div>`;
    placeHost(rect);
    return;
  }

  const sourceZone = formatSourceZone(result);
  const targetZone = formatTargetZone(result);
  const source = escapeHtml(sourceZone);
  const relationLabels = { before: "不晚于", by: "截止", after: "之后", at: "时间点", between: "时间范围", from: "时间范围" };
  const assumptions = (result.assumptions || []).map((item) => `<div>· ${escapeHtml(item)}</div>`).join("");
  const referenceNote = result.referenceContext?.kind === "gmail_message" && result.referenceContext.relative
    ? `<div class="reference-note">参考邮件日期${result.referenceContext.dateText ? `：${escapeHtml(result.referenceContext.dateText)}` : ""}</div>`
    : "";
  const details = detailsOpen ? `<div class="details">
      <div class="details-row"><span class="details-label">源时区</span><span class="details-value">${source}</span></div>
      <div class="details-row"><span class="details-label">语义</span><span class="details-value">${escapeHtml(relationLabels[result.relation] || result.relation || "时间转换")}</span></div>
      <div class="details-row"><span class="details-label">解析</span><span class="details-value">${escapeHtml(result.engine || "在线模型")}</span></div>
      <div class="details-row"><span class="details-label">目标</span><span class="details-value">${escapeHtml(targetZone)}</span></div>
      ${result.referenceContext?.kind === "gmail_message" && result.referenceContext.relative ? `<div class="details-row"><span class="details-label">参考</span><span class="details-value">邮件日期${result.referenceContext.dateText ? ` · ${escapeHtml(result.referenceContext.dateText)}` : ""}</span></div>` : ""}
      ${assumptions ? `<div class="assumption">${assumptions}</div>` : ""}
      ${result.error ? `<div class="error">${escapeHtml(result.error)}</div>` : ""}
    </div>` : "";
  host.shadowRoot.innerHTML = `<style>${tooltipStyles()}</style>
    <div class="card">
      <div class="flow">
        <div class="side">
          <div class="source" title="${escapeHtml(text)}">${escapeHtml(text)}</div>
          <div class="zone">${escapeHtml(sourceZone)}</div>
        </div>
        <div class="arrow">→</div>
        <div class="side target-side">
          <div class="result">${escapeHtml(result.displayText)}</div>
          <div class="zone">${escapeHtml(targetZone)}</div>
        </div>
      </div>
      ${referenceNote}
      <div class="toolbar">
        <button class="copy" aria-label="复制北京时间" title="复制北京时间" data-action="copy" data-copy="${escapeHtml(result.displayText)}">${icon("copy")}</button>
        <button class="refresh" aria-label="重新解析" title="重新解析" data-action="refresh">${icon("refresh")}</button>
        <button class="info${detailsOpen ? " active" : ""}" aria-label="查看转换详情" title="查看转换详情" data-action="info">${icon("info")}</button>
        <button class="close" aria-label="关闭" title="关闭" data-action="close">${icon("close")}</button>
      </div>
      ${details}
    </div>`;
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
  if (!info || (!force && (!autoConvert || !isTimeCandidate(info.text)))) return;
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

document.addEventListener("pointerup", handleSelectionRelease, true);
document.addEventListener("mouseup", handleSelectionRelease, true);

document.addEventListener("keyup", (event) => {
  if (event.key === "Shift" || event.key === "Alt" || event.key === "Control") {
    scheduleSelectionParse();
  }
});

function handleTooltipClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
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
  } else if (action === "info") {
    detailsOpen = !detailsOpen;
    renderResult(currentResult, currentText, currentAnchorRect);
  }
}

function repositionTooltip() {
  if (!tooltipHost || tooltipHost.style.display === "none") return;
  const selection = getSelectionInfo();
  const rect = selection?.text === currentText ? selection.rect : currentAnchorRect;
  if (rect) placeHost(rect);
}

document.addEventListener("mousedown", (event) => {
  if (tooltipHost && !event.composedPath().includes(tooltipHost)) {
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
