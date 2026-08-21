import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const popupHtml = await readFile(new URL("../src/popup.html", import.meta.url), "utf8");
const popupJs = await readFile(new URL("../src/popup.js", import.meta.url), "utf8");
const popupCss = await readFile(new URL("../src/popup.css", import.meta.url), "utf8");
const manifest = await readFile(new URL("../manifest.json", import.meta.url), "utf8");

test("Popup 提供插件总开关，不再提供独立保存按钮或自动弹出配置", () => {
  assert.match(popupHtml, /id="autoConvert"/);
  assert.match(popupHtml, /选中后自动检测并转换/);
  assert.doesNotMatch(popupHtml, /showAutomatically|选中明确时间后自动弹出/);
  assert.doesNotMatch(popupHtml, /保存配置/);
});

test("API Key 失焦时立即落盘，避免 Popup 测试成功但选区转换读取旧配置", () => {
  assert.match(popupJs, /field\.addEventListener\("blur", \(\) => scheduleSave\(0\)\)/);
  assert.match(popupJs, /if \(delay === 0\) \{[\s\S]*void persistForm\(\)/);
});

test("Popup 提供自定义关键词输入框", () => {
  assert.match(popupHtml, /id="customKeywords"/);
  assert.match(popupHtml, /自定义触发词/);
  assert.match(popupJs, /customKeywords/);
  assert.match(popupJs, /customKeywords\.addEventListener\("input", \(\) => scheduleSave\(0\)\)/);
  assert.match(popupJs, /createSettingsSaver/);
});

test("Popup 明确在线模型只接收选中文本", () => {
  assert.match(popupHtml, /选中的文本会直接发送到你选择的模型服务商/);
  assert.match(popupHtml, /不会发送整页内容/);
});

test("Popup 和扩展 manifest 使用时区小云朵 logo", () => {
  assert.match(popupHtml, /class="brand-logo"[^>]+src="\.\/assets\/time-cloud\.png"/);
  assert.match(manifest, /src\/assets\/icon-128\.png/);
});

test("产品名称统一为 Time Translator", () => {
  assert.match(popupHtml, /<title>Time Translator · 元气100%<\/title>/);
  assert.match(popupHtml, /TIME TRANSLATOR/);
  assert.match(popupHtml, /<h1 class="brand-title">Time Translator<\/h1>/);
  assert.doesNotMatch(popupHtml, /class="energy-mark"/);
  assert.match(manifest, /"name": "Time Translator"/);
});

test("在线测试嵌入模型连接区", () => {
  assert.match(popupHtml, /<section class="section-block">[\s\S]*class="test-block inline-test"[\s\S]*<\/section>/);
  assert.doesNotMatch(popupHtml, /<section class="test-block">/);
  assert.match(popupCss, /\.test-heading/);
});

test("品牌文案包含元气 100% 标识", () => {
  assert.match(popupHtml, /元气100%/);
  assert.match(manifest, /元气100%的时区转换工具/);
});
