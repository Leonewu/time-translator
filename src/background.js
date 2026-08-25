import { loadSettings } from "./shared/config.js";
import { parseStructuredTimeExpression } from "./shared/parser.js";
import { isTimeCandidate } from "./shared/candidate.js";
import { requestOpenAICompatibleExtraction } from "./shared/llm.js";
import { needsReferenceDate } from "./shared/reference.js";
import { buildReportPayload, postCaseReport } from "./shared/report.js";
import { getMessage } from "./shared/i18n.js";

function normalizeReferenceContext(value) {
  if (!value || !["gmail_message", "gmail_message_unresolved"].includes(value.kind)) return null;
  if (value.kind === "gmail_message_unresolved") {
    return { kind: value.kind, source: "gmail_page" };
  }
  const reference = new Date(value.referenceInstant);
  if (!Number.isFinite(reference.getTime())) return null;
  return {
    kind: "gmail_message",
    referenceInstant: reference.toISOString(),
    messageId: String(value.messageId || "").slice(0, 200),
    source: "gmail_message_header",
  };
}

function formatReferenceDate(reference, sourceTimeZone, sourceOffsetMinutes) {
  const offset = Number.isInteger(sourceOffsetMinutes) ? sourceOffsetMinutes : null;
  if (offset !== null) {
    const shifted = new Date(reference.getTime() + offset * 60 * 1000);
    return `${shifted.getUTCFullYear()}/${String(shifted.getUTCMonth() + 1).padStart(2, "0")}/${String(shifted.getUTCDate()).padStart(2, "0")}`;
  }

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: sourceTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(reference);
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    if (values.year && values.month && values.day) return `${values.year}/${values.month}/${values.day}`;
  } catch {
    // Fall through to a neutral label if an unexpected zone reaches the UI.
  }
  return "";
}

async function resolveText(text, settings, { includeNormalization = false, referenceContext = null } = {}) {
  const context = normalizeReferenceContext(referenceContext);
  if (context?.kind === "gmail_message_unresolved" && needsReferenceDate(text)) {
    return {
      ok: false,
      rawText: text,
      engine: "Gmail 邮件上下文未读取",
      reason: "无法读取当前 Gmail 邮件日期，暂不按当前日期换算；请展开邮件详情后重试",
      referenceContext: context,
    };
  }
  const reference = context ? new Date(context.referenceInstant) : new Date();
  if (!settings.llm.apiKey) {
    return {
      ok: false,
      rawText: text,
      engine: "在线模型未调用",
      reason: "请先在插件弹窗中填写 API Key",
      ...(context ? { referenceContext: context } : {}),
    };
  }

  try {
    const extraction = await requestOpenAICompatibleExtraction({
      config: settings.llm,
      text,
      reference,
      defaultSourceTimeZone: settings.defaultSourceTimeZone,
      referenceContext: context,
    });
    const resolved = parseStructuredTimeExpression(extraction, {
      reference,
      defaultSourceTimeZone: settings.defaultSourceTimeZone,
      targetTimeZone: settings.targetTimeZone,
      rawText: text,
    });
    const relativeReference = context?.kind === "gmail_message" && needsReferenceDate(text);
    const resultContext = context
      ? {
          ...context,
          relative: relativeReference,
          ...(relativeReference && resolved.ok
            ? { dateText: formatReferenceDate(reference, resolved.sourceTimeZone, resolved.sourceOffsetMinutes) }
            : {}),
        }
      : null;
    const result = {
      ...resolved,
      ...(resultContext ? { referenceContext: resultContext } : {}),
      engine: `在线模型 · ${settings.llm.provider}`,
    };
    if (relativeReference && result.ok) {
      result.assumptions = [...(result.assumptions || []), "相对日期按 Gmail 邮件时间计算"];
    }
    return includeNormalization ? { ...result, llmNormalization: extraction } : result;
  } catch (error) {
    const reason = error.code === "region_restricted"
      ? getMessage("regionRestricted")
      : `在线模型解析失败：${error.message}`;
    return {
      ok: false,
      rawText: text,
      engine: `在线模型 · ${settings.llm.provider}`,
      error: error.message,
      reason,
      ...(error.code ? { errorCode: error.code } : {}),
      ...(context ? { referenceContext: context } : {}),
    };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "convert-selection",
    title: "检测并转换时间",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "convert-selection" || !tab?.id || !info.selectionText) return;
  chrome.tabs.sendMessage(tab.id, {
    type: "SHOW_CONVERSION",
    text: info.selectionText,
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "convert-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "SHOW_CURRENT_SELECTION" });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "REPORT_CASE") {
    (async () => {
      const payload = buildReportPayload({
        rawText: message.rawText,
        result: message.result,
        referenceContext: message.referenceContext,
        extensionVersion: chrome.runtime.getManifest().version,
      });
      sendResponse(await postCaseReport({ payload }));
    })().catch((error) => sendResponse({ ok: false, reason: error.message }));
    return true;
  }

  if (message.type === "PARSE_TEXT" || message.type === "TEST_LLM") {
    (async () => {
      const settings = message.settings || (await loadSettings());
      const text = String(message.text || "").trim();
      if (!text || (!isTimeCandidate(text, { customKeywords: settings.customKeywords }) && message.type !== "TEST_LLM")) {
        sendResponse({ ok: false, reason: "这段文字看起来不包含具体时间" });
        return;
      }
      sendResponse(
        await resolveText(text, settings, {
          includeNormalization: message.type === "TEST_LLM",
          referenceContext: message.referenceContext,
        }),
      );
    })().catch((error) => sendResponse({ ok: false, reason: error.message }));
    return true;
  }

  return false;
});
