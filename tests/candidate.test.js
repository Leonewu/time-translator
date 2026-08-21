import test from "node:test";
import assert from "node:assert/strict";
import { isTimeCandidate } from "../src/shared/candidate.js";

test("自动识别接受明确的英文时间格式", () => {
  for (const text of [
    "today before 3 pm UK",
    "tomorrow by 9:30 am Tokyo time",
    "next Monday at 17:00 New York",
    "between 2 and 4 pm Pacific time",
    "midnight GMT",
    "sometime before close of business next Thursday London time",
    "next Thursday London time",
  ]) {
    assert.equal(isTimeCandidate(text), true, text);
  }
});

test("自动识别拒绝普通句子、裸数字和网址", () => {
  for (const text of [
    "before the meeting",
    "version 3 is ready",
    "The total is 12 items",
    "UK market update",
    "https://example.com/3",
    "next Monday",
  ]) {
    assert.equal(isTimeCandidate(text), false, text);
  }
});

test("自动识别 ISO 8601 / RFC3339 日期时间", () => {
  assert.equal(isTimeCandidate("2026-08-20T15:00:00-07:00"), true);
  assert.equal(isTimeCandidate("2026-08-20 15:00 UTC"), true);
  assert.equal(isTimeCandidate("2026-08-20T15:00:00Z"), true);
});

test("支持设置自定义关键词或短语作为自动候选触发条件", () => {
  assert.equal(isTimeCandidate("EOD Friday", { customKeywords: ["EOD"] }), true);
  assert.equal(isTimeCandidate("please confirm the release window", { customKeywords: ["release window"] }), true);
  assert.equal(isTimeCandidate("today before 3 pm UK", { customKeywords: ["today before"] }), true);
  assert.equal(isTimeCandidate("Select a phrase", { customKeywords: " select " }), true);
  assert.equal(isTimeCandidate("EOD Friday"), false);
  assert.equal(isTimeCandidate("https://example.com/EOD", { customKeywords: ["EOD"] }), false);
});
