import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const testPageSource = await readFile(new URL("../test-page.html", import.meta.url), "utf8");
const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");

test("模式切换器由未打包扩展注入到 8788 的所有测试页面，而不是绑定单个页面", () => {
  assert.doesNotMatch(testPageSource, /id="confetti-mode"/);
  assert.match(contentSource, /function ensureHolidayPreviewControl\(\)/);
  assert.match(contentSource, /time-translator-holiday-preview-control/);
  assert.match(contentSource, /const STORE_EXTENSION_ID = "iifmlolneppjniafidlbdffpmjbnlgoe"/);
  assert.match(contentSource, /chrome\.runtime\.id !== STORE_EXTENSION_ID/);
  for (const mode of ["normal", "new-year", "halloween", "christmas", "mid-autumn", "spring-festival"]) {
    assert.match(contentSource, new RegExp(`<option value="${mode}">`));
  }
});

test("模式切换器只允许出现在 8788 本地测试站点", () => {
  assert.match(contentSource, /const HOLIDAY_PREVIEW_ORIGINS = new Set\(\["http:\/\/localhost:8788", "http:\/\/127\.0\.0\.1:8788"\]\)/);
  assert.match(contentSource, /HOLIDAY_PREVIEW_ORIGINS\.has\(location\.origin\)/);
});

test("全局模式切换器会同步 URL 并刷新当前测试页", () => {
  assert.match(contentSource, /getHolidayPreviewKey\(\) \|\| "normal"/);
  assert.match(contentSource, /nextUrl\.searchParams\.delete\("tt-holiday"\)/);
  assert.match(contentSource, /nextUrl\.searchParams\.set\("tt-holiday", modeSelect\.value\)/);
  assert.match(contentSource, /location\.assign\(nextUrl\.href\)/);
});
