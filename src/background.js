import { loadSettings } from "./shared/config.js";
import { parseStructuredTimeExpression } from "./shared/parser.js";
import { isTimeCandidate } from "./shared/candidate.js";
import { requestOpenAICompatibleExtraction } from "./shared/llm.js";

function normalizeReferenceContext(value) {
  if (!value || value.kind !== "gmail_message") return null;
  const reference = new Date(value.referenceInstant);
  if (!Number.isFinite(reference.getTime())) return null;
  return {
    kind: "gmail_message",
    referenceInstant: reference.toISOString(),
    messageId: String(value.messageId || "").slice(0, 200),
    source: "gmail_message_header",
  };
}

async function resolveText(text, settings, { includeNormalization = false, referenceContext = null } = {}) {
  const context = normalizeReferenceContext(referenceContext);
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
    const result = {
      ...resolved,
      ...(context ? { referenceContext: context } : {}),
      engine: `在线模型 · ${settings.llm.provider}`,
    };
    if (context && result.ok) {
      result.assumptions = [...(result.assumptions || []), "相对日期按 Gmail 邮件时间计算"];
    }
    return includeNormalization ? { ...result, llmNormalization: extraction } : result;
  } catch (error) {
    return {
      ok: false,
      rawText: text,
      engine: `在线模型 · ${settings.llm.provider}`,
      error: error.message,
      reason: `在线模型解析失败：${error.message}`,
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
