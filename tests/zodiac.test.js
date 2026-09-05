import test from "node:test";
import assert from "node:assert/strict";
import { getCuteZodiacEmoji } from "../src/shared/zodiac.js";

test("十二生肖使用可爱的 Emoji，并按年份循环", () => {
  const expected = ["🐭", "🐮", "🐯", "🐰", "🐲", "🐍", "🐴", "🐐", "🐵", "🐔", "🐶", "🐷"];
  assert.deepEqual(expected.map((_, index) => getCuteZodiacEmoji(2020 + index)), expected);
  assert.equal(getCuteZodiacEmoji(2032), "🐭");
  assert.equal(getCuteZodiacEmoji(2019), "🐷");
});

test("无效年份不会生成生肖", () => {
  assert.equal(getCuteZodiacEmoji(""), "");
  assert.equal(getCuteZodiacEmoji("not-a-year"), "");
});
