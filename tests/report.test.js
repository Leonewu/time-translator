import test from "node:test";
import assert from "node:assert/strict";
import { buildReportPayload, buildFeishuText, postCaseReport } from "../src/shared/report.js";

test("反馈上报 payload 保留当前 case 及转换详情，不包含敏感配置", () => {
  const payload = buildReportPayload({
    rawText: "today before 3 pm UK",
    result: {
      ok: true,
      displayText: "2026/08/21（周五）22:00 前",
      sourceTimeZone: "Europe/London",
      targetTimeZone: "Asia/Shanghai",
      relation: "before",
      engine: "在线模型 · gemini",
      sourceTimeZoneName: "BST",
      dateExpression: "today",
      timeExpression: "15:00",
      localDateTime: { year: 2026, month: 8, day: 21, hour: 15, minute: 0, second: 0 },
      instant: "2026-08-21T14:00:00.000Z",
      endInstant: null,
      sourceOffsetMinutes: null,
      assumptions: ["before 按“该时间之前”显示"],
      confidence: "high",
      apiKey: "should-not-be-sent",
      pageText: "should-not-be-sent",
    },
    referenceContext: { kind: "gmail_message", relative: true, dateText: "2026/08/21" },
    extensionVersion: "0.1.7",
    anonymousInstallId: "11111111-1111-4111-8111-111111111111",
    magicCode: "emma",
  });

  assert.deepEqual(payload, {
    schema: "time-translator/report/v1",
    rawText: "today before 3 pm UK",
    anonymousInstallId: "11111111-1111-4111-8111-111111111111",
    magicCode: "emma",
    ok: true,
    displayText: "2026/08/21（周五）22:00 前",
    reason: "",
    sourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
    relation: "before",
    engine: "在线模型 · gemini",
    referenceDate: "2026/08/21",
    details: {
      sourceTimeZoneName: "BST",
      sourceTimeZone: "Europe/London",
      targetTimeZone: "Asia/Shanghai",
      relation: "before",
      relationLabel: "不晚于",
      engine: "在线模型 · gemini",
      dateExpression: "today",
      timeExpression: "15:00",
      localDateTime: { year: 2026, month: 8, day: 21, hour: 15, minute: 0, second: 0 },
      localDateTimeText: "2026/08/21 15:00:00",
      instant: "2026-08-21T14:00:00.000Z",
      endInstant: "",
      sourceOffsetMinutes: null,
      referenceDate: "2026/08/21",
      assumptions: ["before 按“该时间之前”显示"],
      confidence: "high",
      error: "",
    },
    extensionVersion: "0.1.7",
  });
  const feishuText = buildFeishuText(payload);
  assert.match(feishuText, /ID：11111111-1111-4111-8111-111111111111/);
  assert.match(feishuText, /Magic Code：emma/);
  assert.match(feishuText, /源时区名称：BST/);
  assert.match(feishuText, /语义：不晚于/);
  assert.match(feishuText, /源时区本地时间：2026\/08\/21 15:00:00/);
  assert.match(feishuText, /计算假设：before 按/);
  assert.doesNotMatch(JSON.stringify(payload), /should-not-be-sent/);
});

test("反馈上报没有身份信息时仍然保留明确占位文案", () => {
  const text = buildFeishuText({ rawText: "today at noon", ok: false, reason: "无法确定" });
  assert.match(text, /ID：\（未生成\）/);
  assert.match(text, /Magic Code：\（未填写\）/);
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
