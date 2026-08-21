import test from "node:test";
import assert from "node:assert/strict";
import { parseStructuredTimeExpression } from "../src/shared/parser.js";
import { buildExtractionPrompt, getModelListEndpoint, listAvailableModels, parseJsonObject, requestOpenAICompatibleExtraction } from "../src/shared/llm.js";

test("从 markdown 包裹的 JSON 中提取结构化结果", () => {
  assert.deepEqual(parseJsonObject('```json\n{"relation":"before"}\n```'), {
    relation: "before",
  });
});

test("在线模型结构化结果仍由本地时区逻辑换算", () => {
  const result = parseStructuredTimeExpression(
    {
      date_expression: "today",
      start_time: "15:00",
      end_time: "",
      relation: "before",
      source_time_zone: "Europe/London",
      needs_clarification: false,
      assumptions: [],
    },
    {
      reference: new Date("2026-08-20T10:00:00.000Z"),
      defaultSourceTimeZone: "Europe/London",
      targetTimeZone: "Asia/Shanghai",
      rawText: "today before 3 pm UK",
    },
  );

  assert.equal(result.displayText, "2026/08/20（周四）22:00 前");
});

test("Gmail 上下文会告诉模型 today 相对邮件时间解析", () => {
  const prompt = buildExtractionPrompt(
    "today 12:00 UK",
    new Date("2026-08-20T23:30:00.000Z"),
    "Europe/London",
    { kind: "gmail_message", referenceInstant: "2026-08-20T23:30:00.000Z" },
  );

  assert.match(prompt, /selected Gmail message timestamp/);
  assert.match(prompt, /not the current time/);
  assert.match(prompt, /Reference instant: 2026-08-20T23:30:00\.000Z/);
});

test("模型提示词要求省略日期时使用参考日期，并处理 close of business", () => {
  const prompt = buildExtractionPrompt(
    "between 2 and 4 pm Pacific time",
    new Date("2026-08-20T23:30:00.000Z"),
    "Europe/London",
    { kind: "gmail_message", referenceInstant: "2026-08-20T23:30:00.000Z" },
  );

  assert.match(prompt, /omitted calendar date/);
  assert.match(prompt, /close of business/);
});

test("标准化 LLM 结果只提供完整当地时间，插件负责时区换算", () => {
  const result = parseStructuredTimeExpression(
    {
      status: "ok",
      start_local: "2026-08-20T15:00:00",
      end_local: null,
      source_time_zone: "europe/london",
      relation: "before",
      confidence: "high",
      reason: "",
      assumptions: [],
    },
    {
      reference: new Date("2026-08-20T10:00:00.000Z"),
      defaultSourceTimeZone: "Europe/London",
      targetTimeZone: "Asia/Shanghai",
      rawText: "today before 3 pm UK",
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.sourceTimeZone, "Europe/London");
  assert.equal(result.sourceTimeZoneName, "BST");
  assert.equal(result.displayText, "2026/08/20（周四）22:00 前");
});

test("标准化结果使用固定 UTC 偏移量时不引入 IANA 夏令时规则", () => {
  const result = parseStructuredTimeExpression(
    {
      status: "ok",
      start_local: "2026-08-20T15:00:00",
      end_local: null,
      source_time_zone: "",
      relation: "at",
      confidence: "high",
      reason: "",
      assumptions: [],
    },
    { targetTimeZone: "Asia/Shanghai", rawText: "2026-08-20T15:00:00-07:00" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.sourceTimeZone, "UTC-07:00");
  assert.equal(result.sourceOffsetMinutes, -420);
  assert.equal(result.displayText, "2026/08/21（周五）06:00");
});

test("标准化 LLM 结果只说 today 时不会擅自当成当前时刻", () => {
  const result = parseStructuredTimeExpression(
    {
      status: "not_time",
      start_local: null,
      end_local: null,
      source_time_zone: "",
      relation: null,
      confidence: "high",
      reason: "no concrete clock time",
      assumptions: [],
    },
    { rawText: "today" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "这段文字不是具体时间表达");
});

test("原文有固定偏移时拒绝模型返回 IANA 时区", () => {
  const result = parseStructuredTimeExpression(
    {
      status: "ok",
      start_local: "2026-08-20T15:00:00",
      end_local: null,
      source_time_zone: "Europe/London",
      relation: "at",
      confidence: "high",
      reason: "",
      assumptions: [],
    },
    { rawText: "2026-08-20T15:00:00-07:00" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "原文包含固定 UTC 偏移量时不能返回 IANA 时区");
});

test("标准化结果出现未约定字段时拒绝继续换算", () => {
  const result = parseStructuredTimeExpression(
    {
      status: "ok",
      start_local: "2026-08-20T15:00:00",
      end_local: null,
      source_time_zone: "Europe/London",
      relation: "at",
      confidence: "high",
      reason: "",
      assumptions: [],
      timezone_name: "BST",
    },
    { rawText: "unexpected model field" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "在线模型返回的标准时间结构无效");
});

test("between 的标准化结果需要开始和结束两个时间", () => {
  const result = parseStructuredTimeExpression(
    {
      status: "ok",
      start_local: "2026-08-20T23:00:00",
      end_local: "2026-08-21T01:00:00",
      source_time_zone: "Europe/London",
      relation: "between",
      confidence: "high",
      reason: "",
      assumptions: [],
    },
    { targetTimeZone: "Asia/Shanghai", rawText: "between 11 pm and 1 am UK" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.displayText, "2026/08/21（周五）06:00–08:00");
});

test("between 只返回一个时间时拒绝按单点时间转换", () => {
  const result = parseStructuredTimeExpression(
    {
      status: "ok",
      start_local: "2026-08-20T15:00:00",
      end_local: null,
      source_time_zone: "Europe/London",
      relation: "between",
      confidence: "medium",
      reason: "",
      assumptions: [],
    },
    { rawText: "between 3 pm" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "时间范围缺少结束时间");
});

test("旧结构的 between 只返回一个时间时同样拒绝换算", () => {
  const result = parseStructuredTimeExpression(
    {
      date_expression: "today",
      start_time: "15:00",
      end_time: "",
      relation: "between",
      source_time_zone: "Europe/London",
      needs_clarification: false,
    },
    { rawText: "between 3 pm" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "时间范围缺少结束时间");
});

test("标准 ISO/RFC3339 的固定 UTC 偏移量可以进入本地换算", () => {
  const result = parseStructuredTimeExpression(
    {
      is_time_expression: true,
      confidence: "high",
      date_expression: "2026-08-20",
      start_time: "15:00",
      end_time: "",
      relation: "at",
      source_time_zone: "",
      source_offset_minutes: -420,
      needs_clarification: false,
      assumptions: [],
    },
    {
      reference: new Date("2026-08-20T10:00:00.000Z"),
      defaultSourceTimeZone: "Europe/London",
      targetTimeZone: "Asia/Shanghai",
      rawText: "2026-08-20T15:00:00-07:00",
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.sourceTimeZone, "UTC-07:00");
  assert.equal(result.displayText, "2026/08/21（周五）06:00");
});

test("模型明确判定为普通文本时不进行时间换算", () => {
  const result = parseStructuredTimeExpression(
    {
      is_time_expression: false,
      confidence: "high",
      needs_clarification: false,
    },
    { rawText: "before the meeting, please review version 3" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "这段文字不是具体时间表达");
});

test("模型返回无效 IANA 时区时拒绝静默换算", () => {
  const result = parseStructuredTimeExpression(
    {
      is_time_expression: true,
      date_expression: "today",
      start_time: "15:00",
      end_time: "",
      relation: "at",
      source_time_zone: "Not/ARealZone",
      needs_clarification: false,
    },
    { rawText: "today at 3 pm" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "在线模型返回了无法识别的源时区");
});

test("模型返回超出日期语义范围的值时拒绝静默按今天计算", () => {
  const result = parseStructuredTimeExpression(
    {
      is_time_expression: true,
      date_expression: "next week",
      start_time: "15:00",
      end_time: "",
      relation: "at",
      source_time_zone: "UTC",
      needs_clarification: false,
    },
    { rawText: "next week at 3 pm UTC" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "在线模型返回了不支持的日期表达");
});

test("OpenAI-compatible provider 可以解析 JSON response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.model, "test-model");
    assert.equal(body.response_format.type, "json_object");
    assert.deepEqual(body.thinking, undefined);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '{"status":"ok","start_local":"2026-08-20T15:00:00","end_local":null,"source_time_zone":"Europe/London","relation":"before","confidence":"high","reason":"","assumptions":[]}',
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const result = await requestOpenAICompatibleExtraction({
      config: {
        endpoint: "https://example.test/chat/completions",
        model: "test-model",
        apiKey: "test-key",
      },
      text: "today before 3 pm UK",
    });

    assert.equal(result.start_local, "2026-08-20T15:00:00");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini 输出被 length 截断时自动重试并降低思考级别", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    const content = requests.length === 1
      ? '{"status":"ok","start_local":"202'
      : '{"status":"ok","start_local":"2026-08-20T15:00:00","end_local":null,"source_time_zone":"Europe/London","relation":"before","confidence":"high","reason":"","assumptions":[]}';
    return new Response(JSON.stringify({
      choices: [{ finish_reason: requests.length === 1 ? "length" : "stop", message: { content } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await requestOpenAICompatibleExtraction({
      config: {
        provider: "gemini",
        endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        model: "gemini-3.7-flash",
        apiKey: "gemini-key",
      },
      text: "today at 3 pm UK",
    });
    assert.equal(result.start_local, "2026-08-20T15:00:00");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].reasoning_effort, "low");
    assert.equal(requests[0].max_tokens, 512);
    assert.equal(requests[1].max_tokens, 1024);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini 连续被 length 截断时返回明确错误", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "length", message: { content: '{"status":"ok","start_local":"202' } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    await assert.rejects(
      requestOpenAICompatibleExtraction({
        config: {
          provider: "gemini",
          endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          model: "gemini-3.7-flash",
          apiKey: "gemini-key",
        },
        text: "today at 3 pm UK",
      }),
      /输出被截断/,
    );
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("在线模型 Endpoint 必须使用 HTTPS", async () => {
  await assert.rejects(
    requestOpenAICompatibleExtraction({
      config: { endpoint: "http://example.test/chat/completions", model: "test-model", apiKey: "test-key" },
      text: "today at 3 pm UK",
    }),
    /必须使用 HTTPS/,
  );
});

test("动态模型列表会从 Chat Completions Endpoint 推导 /models", () => {
  assert.equal(getModelListEndpoint("https://api.deepseek.com/chat/completions"), "https://api.deepseek.com/models");
  assert.equal(getModelListEndpoint("https://api.xiaomimimo.com/v1/chat/completions"), "https://api.xiaomimimo.com/v1/models");
  assert.equal(getModelListEndpoint("https://example.test/v1/models?cached=true"), "https://example.test/v1/models");
});

test("动态模型列表读取 data.id，并按服务商使用对应 API Key 请求头", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, headers: init.headers };
    return new Response(JSON.stringify({ data: [{ id: "mimo-v2.5" }, { id: "mimo-v2.5" }, { id: "mimo-lite" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const models = await listAvailableModels({
      config: { provider: "mimo", endpoint: "https://api.xiaomimimo.com/v1/chat/completions", apiKey: "mimo-key" },
    });
    assert.deepEqual(models, ["mimo-v2.5", "mimo-lite"]);
    assert.equal(request.url, "https://api.xiaomimimo.com/v1/models");
    assert.equal(request.headers["api-key"], "mimo-key");
    assert.equal(request.headers.Authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter 动态模型列表使用 Bearer API Key", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, headers: init.headers };
    return new Response(JSON.stringify({ data: [{ id: "google/gemini-2.5-flash" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const models = await listAvailableModels({
      config: { provider: "openrouter", endpoint: "https://openrouter.ai/api/v1/chat/completions", apiKey: "or-key" },
    });
    assert.deepEqual(models, ["google/gemini-2.5-flash"]);
    assert.equal(request.url, "https://openrouter.ai/api/v1/models");
    assert.equal(request.headers.Authorization, "Bearer or-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DeepSeek 关闭思考模式，MiMo 使用 api-key 请求头", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    requests.push({ headers: init.headers, body: JSON.parse(init.body) });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"is_time_expression":true,"start_time":"15:00"}' } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    await requestOpenAICompatibleExtraction({
      config: {
        provider: "deepseek",
        endpoint: "https://example.test/deepseek",
        model: "deepseek-v4-flash",
        apiKey: "deepseek-key",
      },
      text: "today at 3 pm UK",
    });
    await requestOpenAICompatibleExtraction({
      config: {
        provider: "mimo",
        endpoint: "https://example.test/mimo",
        model: "mimo-v2.5",
        apiKey: "mimo-key",
      },
      text: "today at 3 pm UK",
    });

    assert.deepEqual(requests[0].body.thinking, { type: "disabled" });
    assert.equal(requests[0].headers.Authorization, "Bearer deepseek-key");
    assert.deepEqual(requests[1].body.thinking, { type: "disabled" });
    assert.equal(requests[1].headers["api-key"], "mimo-key");
    assert.equal(requests[1].headers.Authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("服务商不接受 JSON mode 时会自动退回普通请求", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async (_url, init) => {
    requestCount += 1;
    const body = JSON.parse(init.body);
    if (body.response_format) {
      return new Response(JSON.stringify({ error: { message: "response_format unsupported" } }), { status: 400 });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"start_time":"15:00"}' } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const result = await requestOpenAICompatibleExtraction({
      config: { endpoint: "https://example.test/chat/completions", model: "test", apiKey: "key" },
      text: "today at 3 pm UK",
    });
    assert.equal(result.start_time, "15:00");
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
