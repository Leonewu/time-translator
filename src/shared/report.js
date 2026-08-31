const MAX_TEXT_LENGTH = 400;
const FEISHU_REPORT_ENDPOINT = "https://open.feishu.cn/open-apis/bot/v2/hook/59f53319-f0fd-4364-84f9-04eb497c29e3";
const RELATION_LABELS = {
  before: "不晚于",
  by: "截止",
  after: "之后",
  at: "时间点",
  between: "时间范围",
  from: "时间范围",
};

function limit(value, max = MAX_TEXT_LENGTH) {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeLocalDateTime(value) {
  if (!value || typeof value !== "object") return null;
  const fields = ["year", "month", "day", "hour", "minute", "second"];
  const normalized = Object.fromEntries(fields.map((field) => [field, Number(value[field])]));
  return fields.every((field) => Number.isInteger(normalized[field])) ? normalized : null;
}

function formatLocalDateTime(value) {
  const local = normalizeLocalDateTime(value);
  if (!local) return "";
  return `${local.year}/${String(local.month).padStart(2, "0")}/${String(local.day).padStart(2, "0")} ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}:${String(local.second).padStart(2, "0")}`;
}

function normalizeAssumptions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => limit(item, 240)).filter(Boolean).slice(0, 12);
}

export function buildReportPayload({ rawText, result = {}, referenceContext = null, extensionVersion = "", anonymousInstallId = "", magicCode = "" } = {}) {
  const referenceDate = referenceContext?.relative ? limit(referenceContext.dateText, 40) : "";
  const assumptions = normalizeAssumptions(result.assumptions);
  const details = {
    sourceTimeZoneName: limit(result.sourceTimeZoneName, 120),
    sourceTimeZone: limit(result.sourceTimeZone, 120),
    targetTimeZone: limit(result.targetTimeZone, 120),
    relation: limit(result.relation, 40),
    relationLabel: limit(RELATION_LABELS[result.relation] || result.relation, 40),
    engine: limit(result.engine, 120),
    dateExpression: limit(result.dateExpression, 120),
    timeExpression: limit(result.timeExpression, 120),
    localDateTime: normalizeLocalDateTime(result.localDateTime),
    localDateTimeText: formatLocalDateTime(result.localDateTime),
    instant: limit(result.instant, 40),
    endInstant: limit(result.endInstant, 40),
    sourceOffsetMinutes: Number.isInteger(result.sourceOffsetMinutes) ? result.sourceOffsetMinutes : null,
    referenceDate,
    assumptions,
    confidence: limit(result.confidence, 40),
    error: limit(result.error, 400),
  };
  return {
    schema: "time-translator/report/v1",
    rawText: limit(rawText),
    anonymousInstallId: limit(anonymousInstallId, 120),
    magicCode: limit(magicCode, 120),
    ok: result.ok === true,
    displayText: limit(result.displayText),
    reason: limit(result.reason || result.error),
    sourceTimeZone: limit(result.sourceTimeZone, 120),
    targetTimeZone: limit(result.targetTimeZone, 120),
    relation: limit(result.relation, 40),
    engine: limit(result.engine, 120),
    referenceDate,
    details,
    extensionVersion: limit(extensionVersion, 40),
  };
}

export function buildFeishuText(payload = {}) {
  const resultLine = payload.ok
    ? `结果：${payload.displayText || "（无结果）"}`
    : `解析失败：${payload.reason || "未知原因"}`;
  const lines = [
    "Time Translator · 转换反馈",
    `ID：${payload.anonymousInstallId || "（未生成）"}`,
    `Magic Code：${payload.magicCode || "（未填写）"}`,
    `原文：${payload.rawText || "（空）"}`,
    resultLine,
    payload.sourceTimeZone ? `源时区：${payload.sourceTimeZone}` : "",
    payload.details?.sourceTimeZoneName && payload.details.sourceTimeZoneName !== payload.sourceTimeZone
      ? `源时区名称：${payload.details.sourceTimeZoneName}`
      : "",
    payload.targetTimeZone ? `目标时区：${payload.targetTimeZone}` : "",
    payload.details?.relationLabel ? `语义：${payload.details.relationLabel}` : payload.relation ? `关系：${payload.relation}` : "",
    payload.details?.dateExpression ? `日期表达：${payload.details.dateExpression}` : "",
    payload.details?.timeExpression ? `时间表达：${payload.details.timeExpression}` : "",
    payload.details?.localDateTimeText ? `源时区本地时间：${payload.details.localDateTimeText}` : "",
    payload.referenceDate ? `参考邮件日期：${payload.referenceDate}` : "",
    payload.engine ? `引擎：${payload.engine}` : "",
    payload.details?.assumptions?.length ? `计算假设：${payload.details.assumptions.join("；")}` : "",
    payload.details?.confidence ? `置信度：${payload.details.confidence}` : "",
    payload.details?.error ? `错误：${payload.details.error}` : "",
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
