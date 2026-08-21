const NORMALIZATION_SYSTEM_PROMPT = `You normalize short English time expressions into one bounded JSON object.
Return ONLY JSON, with no markdown and no explanation outside the JSON.
The extension, not you, will calculate Beijing time. You must resolve the English meaning into a complete local wall-clock timestamp.
You do not have permission to browse or query the current time. Use the supplied reference instant. Interpret today/tomorrow/yesterday and weekdays in the source time zone.
If the text has no concrete clock time, such as "today" alone, return status="not_time".
If the source is ambiguous, return status="ambiguous". If the expression is outside this contract, return status="unsupported".
For status="ok", start_local must be exactly YYYY-MM-DDTHH:mm:ss. Use end_local only for a between/from-to range; include its full date too, including a next-day date when needed.
relation must preserve the original meaning: before, by, after, at, or between.
source_time_zone must be a canonical IANA time-zone identifier with standard capitalization, such as Europe/London, America/New_York, Asia/Tokyo, Asia/Shanghai, or UTC. Never return a city name, abbreviation, UTC+n string, or a made-up zone.
For an explicit numeric offset such as Z, UTC+08:00, or -07:00, set source_time_zone to an empty string. Do not return any offset field; the extension extracts the numeric offset directly from the original text and calculates the minutes.
When the text omits a source time zone, use the supplied default source time zone and return that canonical IANA identifier.
The JSON shape is:
{
  "status": "ok | not_time | ambiguous | unsupported",
  "start_local": "YYYY-MM-DDTHH:mm:ss or null",
  "end_local": "YYYY-MM-DDTHH:mm:ss or null",
  "source_time_zone": "canonical IANA time zone or empty string",
  "relation": "before | by | after | at | between or null",
  "confidence": "high | medium | low",
  "reason": "short reason or empty string",
  "assumptions": ["short assumption"]
}
Example for "today before 3 pm UK" with reference date 2026-08-20:
{"status":"ok","start_local":"2026-08-20T15:00:00","end_local":null,"source_time_zone":"Europe/London","relation":"before","confidence":"high","reason":"","assumptions":[]}`;

export const NORMALIZED_TIME_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ok", "not_time", "ambiguous", "unsupported"] },
    start_local: { type: ["string", "null"] },
    end_local: { type: ["string", "null"] },
    source_time_zone: { type: "string" },
    relation: { type: ["string", "null"], enum: ["before", "by", "after", "at", "between", null] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    reason: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
  },
  required: [
    "status",
    "start_local",
    "end_local",
    "source_time_zone",
    "relation",
    "confidence",
    "reason",
    "assumptions",
  ],
  additionalProperties: false,
};

// Kept as a compatibility export for callers that used the old name.
export const TIME_EXTRACTION_SCHEMA = NORMALIZED_TIME_SCHEMA;

export function buildExtractionPrompt(text, reference, defaultSourceTimeZone, referenceContext = null) {
  const contextLine = referenceContext?.kind === "gmail_message"
    ? "Reference context: this instant comes from the selected Gmail message timestamp. Resolve today, yesterday, tomorrow, and weekdays relative to this message timestamp, not the current time."
    : "Reference context: use this supplied instant as the current reference for relative date words.";
  return `Reference instant: ${reference.toISOString()}
Default source time zone when omitted: ${defaultSourceTimeZone}
${contextLine}
Selected English text: ${JSON.stringify(text)}

Extract the time expression now.`;
}

function extractContent(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part?.type === "text")
      .map((part) => part.text)
      .join("\n");
  }
  throw new Error("模型没有返回文本内容");
}

export function parseJsonObject(text) {
  const cleaned = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("模型返回的不是有效 JSON");
  }
}

function requestBody(config, messages, includeJsonMode = true) {
  const body = {
    model: config.model,
    messages,
    temperature: 0,
    max_tokens: 300,
  };
  if (config.provider === "deepseek" || config.provider === "mimo") {
    body.thinking = { type: "disabled" };
  }
  if (includeJsonMode) body.response_format = { type: "json_object" };
  return body;
}

async function postChatCompletion(config, messages, signal) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (config.provider === "mimo") headers["api-key"] = config.apiKey;
  else headers.Authorization = `Bearer ${config.apiKey}`;

  const request = (includeJsonMode) =>
    fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody(config, messages, includeJsonMode)),
      signal,
    });

  let response = await request(true);
  if (!response.ok && response.status === 400) response = await request(false);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `模型请求失败（${response.status}）`);
  }
  return payload;
}

function assertSecureEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("模型 Endpoint 不是有效 URL");
  }
  if (url.protocol !== "https:") throw new Error("模型 Endpoint 必须使用 HTTPS");
}

export function getModelListEndpoint(endpoint) {
  const url = new URL(endpoint);
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/models")) {
    url.pathname = path;
  } else if (path.endsWith("/chat/completions")) {
    url.pathname = `${path.slice(0, -"/chat/completions".length)}/models`;
  } else if (path.endsWith("/completions")) {
    url.pathname = `${path.slice(0, -"/completions".length)}/models`;
  } else {
    url.pathname = `${path}/models`;
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function authHeaders(config) {
  if (config.provider === "mimo") return { "api-key": config.apiKey };
  return { Authorization: `Bearer ${config.apiKey}` };
}

export async function listAvailableModels({ config, timeoutMs = 8000 }) {
  if (!config?.endpoint || !config?.apiKey) throw new Error("请先填写 API Key 和 Endpoint");
  assertSecureEndpoint(config.endpoint);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(getModelListEndpoint(config.endpoint), {
      method: "GET",
      headers: { Accept: "application/json", ...authHeaders(config) },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.message || `获取模型列表失败（${response.status}）`);
    }
    const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
    const models = [...new Set(items.map((item) => (typeof item === "string" ? item : item?.id)).filter(Boolean))];
    if (!models.length) throw new Error("服务商没有返回可用模型");
    return models;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("获取模型列表超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestOpenAICompatibleExtraction({
  config,
  text,
  reference = new Date(),
  defaultSourceTimeZone = "Europe/London",
  referenceContext = null,
  timeoutMs = 12000,
}) {
  if (!config?.endpoint || !config?.model || !config?.apiKey) {
    throw new Error("在线模型配置不完整");
  }
  assertSecureEndpoint(config.endpoint);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await postChatCompletion(
      config,
      [
        { role: "system", content: NORMALIZATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildExtractionPrompt(text, reference, defaultSourceTimeZone, referenceContext),
        },
      ],
      controller.signal,
    );

    return parseJsonObject(extractContent(response));
  } catch (error) {
    if (error.name === "AbortError") throw new Error("在线模型请求超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const llmInternals = { extractContent, requestBody, authHeaders };
