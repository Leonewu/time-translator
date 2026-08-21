import test from "node:test";
import assert from "node:assert/strict";
import { parseEnglishTimeExpression } from "../src/shared/parser.js";

const reference = new Date("2026-08-20T10:00:00.000Z");

test("解析 today before 3 pm UK", () => {
  const result = parseEnglishTimeExpression("today before 3 pm UK", {
    reference,
    defaultSourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
  });

  assert.equal(result.ok, true);
  assert.equal(result.relation, "before");
  assert.equal(result.sourceTimeZone, "Europe/London");
  assert.equal(result.localDateTime.hour, 15);
  assert.equal(result.displayText, "2026/08/20（周四）22:00 前");
});

test("Gmail 邮件时间作为 reference 时，today 使用邮件当地日期", () => {
  const result = parseEnglishTimeExpression("today 12:00 UK", {
    reference: new Date("2026-08-20T23:30:00.000Z"),
    defaultSourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
  });

  assert.equal(result.dateExpression, "today");
  assert.equal(result.localDateTime.day, 21);
  assert.equal(result.displayText, "2026/08/21（周五）19:00");
});

test("解析 ISO 8601 固定偏移量", () => {
  const result = parseEnglishTimeExpression("2026-08-20T15:00:00-07:00", {
    reference,
    defaultSourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceTimeZone, "UTC-07:00");
  assert.equal(result.dateExpression, "2026-08-20");
  assert.equal(result.displayText, "2026/08/21（周五）06:00");
});

test("解析带 IANA 时区的标准日期时间", () => {
  const result = parseEnglishTimeExpression("2026-08-20 15:00 Europe/London", {
    reference,
    defaultSourceTimeZone: "UTC",
    targetTimeZone: "Asia/Shanghai",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceTimeZone, "Europe/London");
  assert.equal(result.displayText, "2026/08/20（周四）22:00");
});

test("解析 tomorrow by 9:30 am Tokyo time", () => {
  const result = parseEnglishTimeExpression("tomorrow by 9:30 am Tokyo time", {
    reference,
    defaultSourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
  });

  assert.equal(result.ok, true);
  assert.equal(result.relation, "by");
  assert.equal(result.sourceTimeZone, "Asia/Tokyo");
  assert.equal(result.displayText, "2026/08/21（周五）08:30 前");
});

test("解析 between 两个时间并正确处理 PST 冬令时", () => {
  const result = parseEnglishTimeExpression("between 2 and 4 pm Pacific time", {
    reference: new Date("2026-01-20T12:00:00.000Z"),
    defaultSourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
  });

  assert.equal(result.ok, true);
  assert.equal(result.relation, "between");
  assert.equal(result.displayText, "2026/01/21（周三）06:00–08:00");
});

test("没有写时区时使用设置中的默认源时区，并显示假设", () => {
  const result = parseEnglishTimeExpression("today at noon", {
    reference,
    defaultSourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceTimeZone, "Europe/London");
  assert.match(result.assumptions.join(" "), /默认源时区/);
});

test("解析 next Monday 5:00 pm New York", () => {
  const result = parseEnglishTimeExpression("next Monday 5:00 pm New York", {
    reference,
    defaultSourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
  });

  assert.equal(result.ok, true);
  assert.equal(result.localDateTime.year, 2026);
  assert.equal(result.localDateTime.month, 8);
  assert.equal(result.localDateTime.day, 24);
  assert.equal(result.displayText, "2026/08/25（周二）05:00");
});

test("12 am 和 12 pm 按普通人的习惯解析", () => {
  const midnight = parseEnglishTimeExpression("today at 12 am UK", {
    reference,
    defaultSourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
  });
  const noon = parseEnglishTimeExpression("today at 12 pm UK", {
    reference,
    defaultSourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
  });

  assert.equal(midnight.displayText, "2026/08/20（周四）07:00");
  assert.equal(noon.displayText, "2026/08/20（周四）19:00");
});

test("明确日期和 after 关系可以转换", () => {
  const result = parseEnglishTimeExpression("after August 21 at 3 pm UK", {
    reference,
    defaultSourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
  });

  assert.equal(result.displayText, "2026/08/21（周五）22:00 之后");
});

test("跨午夜区间显示完整的北京时间起止日期", () => {
  const result = parseEnglishTimeExpression("between 11 pm and 1 am UK", {
    reference,
    defaultSourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
  });

  assert.equal(result.displayText, "2026/08/21（周五）06:00–08:00");
});

test("无法确定时间时返回可解释的失败结果", () => {
  const result = parseEnglishTimeExpression("sometime soon", {
    reference,
    defaultSourceTimeZone: "Europe/London",
    targetTimeZone: "Asia/Shanghai",
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "无法从文本中确定具体时间");
});
