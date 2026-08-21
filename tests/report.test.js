import test from "node:test";
import assert from "node:assert/strict";
import { buildReportPayload, buildFeishuText, postCaseReport } from "../src/shared/report.js";

test("反馈上报 payload 只保留当前 case 的必要字段", () => {
  const payload = buildReportPayload({
    rawText: "today before 3 pm UK",
    result: {
      ok: true,
      displayText: "2026/08/21（周五）22:00 前",
      sourceTimeZone: "Europe/London",
      targetTimeZone: "Asia/Shanghai",
      relation: "before",
      engine: "在线模型 · gemini",
      apiKey: "should-not-be-sent",
      pageText: "should-not-be-sent",
    },
    referenceContext: { kind: "gmail_message", relative: true, dateText: "2026/08/21" },
    extensionVersion: "0.1.7",
  });

  assert.deepEqual(payload, {
    schema: "time-translator/report/v1",
    rawText: "today before 3 pm UK",
    ok: true,
    displayText: "2026/08/21（周五）22:00 前",
    reason: "",
    sourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
    relation: "before",
    engine: "在线模型 · gemini",
    referenceDate: "2026/08/21",
    extensionVersion: "0.1.7",
  });
  assert.doesNotMatch(buildFeishuText(payload), /should-not-be-sent/);
});

test("反馈上报拒绝不安全地址并发送飞书文本消息", async () => {
  await assert.rejects(
    postCaseReport({ endpoint: "http://example.com/hook", payload: { rawText: "x" } }),
    /HTTPS/,
  );

  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ code: 0, msg: "success" }), { status: 200 });
  };
  try {
    const result = await postCaseReport({
      endpoint: "https://relay.example/report",
      payload: { rawText: "today at noon", ok: false, reason: "无法确定" },
    });
    assert.equal(result.ok, true);
    assert.equal(request.url, "https://relay.example/report");
    assert.equal(request.init.method, "POST");
    assert.equal(request.body.msg_type, "text");
    assert.match(request.body.content.text, /today at noon/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
