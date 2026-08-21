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

test("Popup 在窄容器下保持可用宽度，避免中文逐字换行", () => {
  assert.match(popupCss, /body \{[^}]*min-width:\s*390px/);
  assert.doesNotMatch(popupCss, /@media \(max-width: 390px\)[\s\S]*body \{ width: 100vw; \}/);
});

test("API Key 失焦时立即落盘，避免 Popup 测试成功但选区转换读取旧配置", () => {
  assert.match(popupJs, /field\.addEventListener\("blur", \(\) => scheduleSave\(0\)\)/);
  assert.match(popupJs, /if \(delay === 0\) \{[\s\S]*void persistForm\(\)/);
});

test("API Key 提供眼睛按钮切换显示和隐藏", () => {
  assert.match(popupHtml, /id="apiKey" type="password"/);
  assert.match(popupHtml, /id="toggleApiKey"[^>]+aria-label="显示 API Key"/);
  assert.match(popupJs, /const toggleApiKey = document\.querySelector\("#toggleApiKey"\)/);
  assert.match(popupJs, /apiKey\.type === "password" \? "text" : "password"/);
  assert.match(popupJs, /toggleApiKey\.addEventListener\("click"/);
});

test("Popup 提供可持久化的日间/夜间模式切换", () => {
  assert.match(popupHtml, /data-theme="light"/);
  assert.match(popupHtml, /id="themeToggle"/);
  assert.match(popupHtml, /切换到夜间模式/);
  assert.match(popupJs, /document\.documentElement\.dataset\.theme/);
  assert.match(popupJs, /themeToggle\.addEventListener\("click"/);
  assert.match(popupCss, /:root\[data-theme="dark"\]/);
});

test("模型名支持动态候选列表并提供刷新入口", () => {
  assert.match(popupHtml, /id="model" list="modelOptions"/);
  assert.match(popupHtml, /id="modelOptions"/);
  assert.match(popupHtml, /id="refreshModels"/);
  assert.match(popupJs, /listAvailableModels/);
  assert.match(popupJs, /refreshModels\.addEventListener\("click"/);
  assert.match(popupJs, /provider\.addEventListener\("change",[\s\S]*refreshModelOptions/);
});

test("切换服务商会自动同步对应的 Endpoint 和模型名", () => {
  assert.match(popupJs, /provider\.addEventListener\("change", \(\) => \{[\s\S]*fillProviderFields\(true\)[\s\S]*scheduleSave\(\)/);
  assert.match(popupJs, /if \(usePreset \|\| !endpoint\.value\) endpoint\.value = preset\.endpoint/);
  assert.match(popupJs, /if \(usePreset \|\| !model\.value\) model\.value = preset\.model/);
});

test("Popup 提供自定义关键词输入框", () => {
  assert.match(popupHtml, /id="customKeywords"/);
  assert.match(popupHtml, /自定义触发词/);
  assert.match(popupHtml, /触发词只决定是否发起检测，不会补全时间/);
  assert.match(popupJs, /customKeywords/);
  assert.match(popupJs, /customKeywords\.addEventListener\("input", \(\) => scheduleSave\(0\)\)/);
  assert.match(popupJs, /createSettingsSaver/);
});

test("Popup 提供反馈邮件入口和当前版本号", () => {
  assert.match(popupHtml, /mailto:reon\.hypr@gmail\.com\?subject=Time%20Translator%20Feedback/);
  assert.match(popupHtml, />反馈<\/a>/);
  assert.match(popupHtml, />v0\.1\.4<\/span>/);
  assert.match(manifest, /"version": "0\.1\.4"/);
});

test("Popup 明确在线模型只接收选中文本", () => {
  assert.match(popupHtml, /发起转换或刷新模型列表时，必要的请求会发送到你选择的模型服务商/);
  assert.match(popupHtml, /不会发送整页内容/);
});

test("Popup 和扩展 manifest 使用时区小云朵 logo", () => {
  assert.match(popupHtml, /class="brand-logo"[^>]+src="\.\/assets\/time-cloud\.png"/);
  assert.match(manifest, /src\/assets\/icon-128\.png/);
  assert.match(popupCss, /popup-shell::after[\s\S]*url\("\.\/assets\/time-cloud\.png"\)/);
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
