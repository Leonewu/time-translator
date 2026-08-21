import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

await import(new URL("../src/shared/gmail.js", import.meta.url));
const gmail = globalThis.TimeTranslatorGmail;
const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");
const backgroundSource = await readFile(new URL("../src/background.js", import.meta.url), "utf8");
const manifest = await readFile(new URL("../manifest.json", import.meta.url), "utf8");

test("Gmail 只在 mail.google.com 页面启用邮件上下文", () => {
  assert.equal(gmail.isGmailWebPage({ hostname: "mail.google.com" }), true);
  assert.equal(gmail.isGmailWebPage({ hostname: "inbox.google.com" }), false);
  assert.equal(gmail.isGmailWebPage({ hostname: "example.com" }), false);
});

test("Gmail 时间提取支持 ISO、英文和中文完整日期", () => {
  assert.equal(gmail.parseGmailDateValue("2026-08-20T15:30:00+01:00").toISOString(), "2026-08-20T14:30:00.000Z");
  assert.equal(gmail.parseGmailDateValue("Thu, 20 Aug 2026 15:30:00 GMT").toISOString(), "2026-08-20T15:30:00.000Z");
  assert.equal(gmail.parseGmailDateValue("2026年8月20日 下午3:30").toISOString(), "2026-08-20T07:30:00.000Z");
  assert.equal(gmail.parseGmailDateValue("not a date"), null);
});

test("Gmail 上下文优先取选中文字所在消息的完整时间", () => {
  const timestamp = {
    textContent: "Aug 20, 2026",
    getAttribute(name) {
      return name === "title" ? "Thu, 20 Aug 2026 15:30:00 GMT" : null;
    },
  };
  const root = {
    getAttribute(name) {
      return name === "data-legacy-message-id" ? "message-123" : null;
    },
    querySelectorAll(selector) {
      return selector === ".g3[title]" ? [timestamp] : [];
    },
  };
  const textNode = {
    nodeType: 3,
    parentElement: {
      closest() {
        return root;
      },
    },
  };

  assert.deepEqual(gmail.extractMessageContext(textNode, { hostname: "mail.google.com" }), {
    kind: "gmail_message",
    referenceInstant: "2026-08-20T15:30:00.000Z",
    messageId: "message-123",
    source: "gmail_message_header",
  });
});

test("内容脚本把选中文字所属 Gmail 邮件的时间作为参考上下文", () => {
  assert.match(contentSource, /gmail\?\.extractMessageContext\(range\.startContainer\)/);
  assert.match(contentSource, /gmail_message_unresolved/);
  assert.match(contentSource, /class="reference-note"/);
  assert.match(contentSource, /referenceContext: currentReferenceContext/);
  assert.match(backgroundSource, /const reference = context \? new Date\(context\.referenceInstant\) : new Date\(\)/);
  assert.match(backgroundSource, /无法读取当前 Gmail 邮件日期/);
  assert.match(backgroundSource, /formatReferenceDate/);
  assert.match(backgroundSource, /相对日期按 Gmail 邮件时间计算/);
  assert.match(manifest, /"src\/shared\/gmail\.js", "src\/content\.js"/);
});
