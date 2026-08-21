const MAX_TEXT_LENGTH = 400;
const FEISHU_REPORT_ENDPOINT = "https://open.feishu.cn/open-apis/bot/v2/hook/59f53319-f0fd-4364-84f9-04eb497c29e3";

function limit(value, max = MAX_TEXT_LENGTH) {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function buildReportPayload({ rawText, result = {}, referenceContext = null, extensionVersion = "" } = {}) {
  return {
    schema: "time-translator/report/v1",
    rawText: limit(rawText),
    ok: result.ok === true,
    displayText: limit(result.displayText),
    reason: limit(result.reason || result.error),
    sourceTimeZone: limit(result.sourceTimeZone, 120),
    targetTimeZone: limit(result.targetTimeZone, 120),
    relation: limit(result.relation, 40),
    engine: limit(result.engine, 120),
    referenceDate: referenceContext?.relative ? limit(referenceContext.dateText, 40) : "",
    extensionVersion: limit(extensionVersion, 40),
  };
}

export function buildFeishuText(payload = {}) {
  const resultLine = payload.ok
    ? `结果：${payload.displayText || "（无结果）"}`
    : `解析失败：${payload.reason || "未知原因"}`;
  const lines = [
    "Time Translator · 转换反馈",
    `原文：${payload.rawText || "（空）"}`,
    resultLine,
    payload.sourceTimeZone ? `源时区：${payload.sourceTimeZone}` : "",
    payload.targetTimeZone ? `目标时区：${payload.targetTimeZone}` : "",
    payload.relation ? `关系：${payload.relation}` : "",
    payload.referenceDate ? `参考邮件日期：${payload.referenceDate}` : "",
    payload.engine ? `引擎：${payload.engine}` : "",
    payload.extensionVersion ? `版本：${payload.extensionVersion}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function assertReportEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("反馈上报地址不是有效 URL");
  }
  const localDevelopment = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) {
    throw new Error("反馈上报地址必须使用 HTTPS");
  }
}

export async function postCaseReport({ endpoint = FEISHU_REPORT_ENDPOINT, payload, timeoutMs = 8000 } = {}) {
  const target = String(endpoint || "").trim();
  if (!target) throw new Error("尚未配置反馈上报地址");
  assertReportEndpoint(target);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text: buildFeishuText(payload) },
      }),
      signal: controller.signal,
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok || (Number.isInteger(responseBody?.code) && responseBody.code !== 0)) {
      throw new Error(responseBody?.msg || responseBody?.message || `反馈上报失败（${response.status}）`);
    }
    return { ok: true };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("反馈上报超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
