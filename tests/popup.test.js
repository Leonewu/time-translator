import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const popupHtml = await readFile(new URL("../src/popup.html", import.meta.url), "utf8");
const popupJs = await readFile(new URL("../src/popup.js", import.meta.url), "utf8");
const popupCss = await readFile(new URL("../src/popup.css", import.meta.url), "utf8");
const i18nSource = await readFile(new URL("../src/shared/i18n.js", import.meta.url), "utf8");
const manifest = await readFile(new URL("../manifest.json", import.meta.url), "utf8");

test("Popup 提供插件总开关，不再提供独立保存按钮或自动弹出配置", () => {
  assert.match(popupHtml, /id="autoConvert"/);
  assert.match(popupHtml, /id="pluginState"/);
  assert.match(popupHtml, /data-i18n-title="autoConvertTitle"/);
  assert.doesNotMatch(popupHtml, /showAutomatically|选中明确时间后自动弹出/);
  assert.doesNotMatch(popupHtml, /保存配置/);
});

test("Popup 在窄容器下保持可用宽度，避免中文逐字换行", () => {
  assert.match(popupCss, /body \{[^}]*min-width:\s*390px/);
  assert.doesNotMatch(popupCss, /@media \(max-width: 390px\)[\s\S]*body \{ width: 100vw; \}/);
});

test("Provider 和 Model 分成上下两行，并移除 Endpoint 下方的长说明", () => {
  assert.match(popupHtml, /class="field-stack"/);
  assert.match(popupCss, /\.field-stack \{/);
  assert.doesNotMatch(popupHtml, /id="providerHint"/);
  assert.doesNotMatch(popupHtml, /class="privacy-note"/);
  assert.doesNotMatch(popupJs, /providerHint/);
});

test("下拉框使用留出右侧间距的统一箭头", () => {
  assert.match(popupCss, /select \{[^}]*appearance:\s*none/);
  assert.match(popupCss, /select \{[^}]*background-position:\s*right 12px center/);
  assert.match(popupCss, /select \{[^}]*padding-right:\s*36px/);
});

test("转换偏好的两列标签使用统一高度，避免英文长标签造成控件错位", () => {
  assert.match(popupCss, /\.compact-block \.field-grid \.field-label \{[^}]*min-height:\s*2\.4em/);
});

test("自动检测开关的圆点不会越过轨道边界", () => {
  assert.match(popupCss, /\.switch-track \{[^}]*overflow:\s*hidden/);
  assert.match(popupCss, /\.master-switch input:checked \+ \.switch-track span \{[^}]*transform:\s*translateX\(10px\)/);
});

test("Popup 不再显示服务商连接状态文案", () => {
  assert.doesNotMatch(popupHtml, /id="configState"/);
  assert.doesNotMatch(popupJs, /updateConfigState/);
});

test("主滚动条使用与日夜主题一致的轻量样式", () => {
  assert.match(popupCss, /scrollbar-color:\s*var\(--scroll-thumb\)/);
  assert.match(popupCss, /body::-webkit-scrollbar-thumb/);
  assert.match(popupCss, /:root\[data-theme="dark"\][\s\S]*--scroll-thumb:/);
});

test("API Key 失焦时立即落盘，避免 Popup 测试成功但选区转换读取旧配置", () => {
  assert.match(popupJs, /field\.addEventListener\("blur", \(\) => \{[\s\S]*scheduleSave\(0\)/);
  assert.match(popupJs, /if \(delay === 0\) \{[\s\S]*void persistForm\(\)/);
});

test("API Key 提供眼睛按钮切换显示和隐藏", () => {
  assert.match(popupHtml, /id="apiKey" type="password"/);
  assert.match(popupHtml, /id="toggleApiKey"[^>]+data-i18n-aria-label="showApiKey"/);
  assert.match(popupJs, /const toggleApiKey = document\.querySelector\("#toggleApiKey"\)/);
  assert.match(popupJs, /apiKey\.type === "password" \? "text" : "password"/);
  assert.match(popupJs, /t\("hideApiKey"\)/);
  assert.match(popupJs, /toggleApiKey\.addEventListener\("click"/);
});

test("Popup 提供可持久化的日间/夜间模式切换", () => {
  assert.match(popupHtml, /data-theme="system"/);
  assert.match(popupHtml, /id="themeToggle"/);
  assert.match(popupJs, /t\("themeToDark"\)/);
  assert.match(popupJs, /matchMedia\?\.\("\(prefers-color-scheme: dark\)"\)/);
  assert.match(popupJs, /themeToSystem/);
  assert.match(popupJs, /systemTheme\?\.addEventListener/);
  assert.match(popupJs, /document\.documentElement\.dataset\.theme/);
  assert.match(popupJs, /themeToggle\.addEventListener\("click"/);
  assert.match(popupCss, /:root\[data-theme="dark"\]/);
  assert.match(popupCss, /:root\[data-theme="system"\]/);
});

test("模型名支持动态候选列表并提供刷新入口", () => {
  assert.match(popupHtml, /id="model"/);
  assert.match(popupHtml, /id="modelLabel"/);
  assert.match(popupHtml, /id="modelMenu"/);
  assert.match(popupHtml, /id="modelMenuToggle"/);
  assert.match(popupHtml, /id="refreshModels"/);
  assert.match(popupJs, /listAvailableModels/);
  assert.match(popupJs, /refreshModels\.addEventListener\("click"/);
  assert.match(popupJs, /provider\.addEventListener\("change",[\s\S]*refreshModelOptions/);
  assert.match(popupJs, /const modelCatalogCache = new Map\(\)/);
  assert.match(popupJs, /const modelCatalogRequests = new Map\(\)/);
  assert.match(popupJs, /void refreshModelOptions\(\{ silent: true \}\)/);
  assert.match(popupJs, /function modelCatalogKey/);
  assert.match(popupJs, /function matchesModelQuery/);
  assert.match(popupJs, /normalizeModelSearchText/);
  assert.match(popupJs, /modelMenuLoading \? t\("modelLoading"\)/);
  assert.match(popupJs, /model\.addEventListener\("click",[\s\S]*openModelMenu/);
  assert.match(popupJs, /function openModelMenu/);
});

test("Popup 提供 Gemini 服务商预置配置", () => {
  assert.match(i18nSource, /provider_gemini/);
  assert.match(popupHtml, /id="modelMenu"/);
});

test("Popup 提供 OpenRouter 服务商预置配置", () => {
  assert.match(i18nSource, /provider_openrouter/);
  assert.match(popupHtml, /id="modelMenu"/);
});

test("切换服务商会保存各自配置并在切回时恢复", () => {
  assert.match(popupJs, /providerProfiles/);
  assert.match(popupJs, /const previousProvider = activeProvider/);
  assert.match(popupJs, /settings\.providerProfiles = \{/);
  assert.match(popupJs, /fillProviderFields\(\)/);
  assert.match(popupJs, /const profile = settings\?\.providerProfiles\?\.\[provider\.value\]/);
});

test("Popup 提供自定义关键词输入框", () => {
  assert.match(popupHtml, /id="customKeywords"/);
  assert.match(popupHtml, /data-i18n="customKeywords"/);
  assert.match(popupHtml, /data-i18n="customKeywordsNote"/);
  assert.doesNotMatch(popupHtml, /触发词只决定是否发起检测/);
  assert.match(popupJs, /customKeywords/);
  assert.match(popupJs, /customKeywords\.addEventListener\("input", \(\) => scheduleSave\(0\)\)/);
  assert.match(popupJs, /createSettingsSaver/);
});

test("Popup 提供反馈邮件入口和当前版本号", () => {
  assert.match(popupHtml, /mailto:reon\.hypr@gmail\.com\?subject=Time%20Translator%20Feedback/);
  assert.match(popupHtml, /data-i18n="feedback"/);
  assert.match(popupHtml, /<footer>\s*<span>v0\.1\.13<\/span>\s*<a class="feedback-link"/);
  assert.match(popupHtml, />v0\.1\.13<\/span>/);
  assert.match(popupCss, /\.feedback-link \{[^}]*margin-left:\s*auto/);
  assert.match(manifest, /"version": "0\.1\.13"/);
});

test("Popup 不显示自动保存提示和 API Key 浏览器存储提示", () => {
  assert.doesNotMatch(popupHtml, /Changes save automatically/);
  assert.doesNotMatch(popupHtml, /API key stays in this browser/);
  assert.doesNotMatch(popupHtml, /data-i18n="footerKey"/);
  assert.match(popupHtml, /<div class="form-actions" hidden>/);
});

test("Popup 显示可编辑 Magic Code 和 VIP 标识，但不提供复制按钮", () => {
  assert.match(popupHtml, /data-i18n="magicCodeLabel">Magic Code<\/span>/);
  assert.match(i18nSource, /magicCodeLabel: "Magic Code"/);
  assert.match(i18nSource, /magicCodeLabel: "魔法代码"/);
  assert.match(i18nSource, /magicCodePlaceholder: "Enter Magic Code"/);
  assert.match(i18nSource, /magicCodePlaceholder: "输入魔法代码"/);
  assert.match(popupHtml, /id="installIdValue"[^>]+type="text"/);
  assert.match(popupHtml, /id="vipBadge"/);
  assert.match(popupHtml, /aria-label="emma"/);
  assert.match(popupHtml, /class="vip-badge-star"[^>]*><svg/);
  assert.match(i18nSource, /vipBadge: "emma"/);
  assert.doesNotMatch(popupHtml, /id="copyInstallId"/);
  assert.match(popupJs, /getAnonymousInstallId/);
  assert.match(popupJs, /getInstallId/);
  assert.match(popupJs, /setInstallId/);
  assert.match(popupJs, /isVipInstallId/);
  assert.match(popupJs, /let installIdInputDirty = false/);
  assert.match(popupJs, /if \(installIdInputDirty\) return;/);
  assert.match(popupJs, /installIdInputDirty = true/);
  assert.match(popupJs, /if \(!value\) \{[\s\S]*await setInstallId\(""\)/);
  assert.match(popupCss, /\.install-id-row/);
  assert.match(popupCss, /\.vip-badge/);
  assert.match(popupCss, /font-family: "Baloo 2"/);
  assert.match(popupCss, /font-weight: 500/);
  assert.match(popupCss, /\.install-id-label \{[^}]*font-family: "Baloo 2"/);
  assert.match(popupCss, /\.install-id-value \{[^}]*font-family: "Baloo 2"/);
  assert.match(popupCss, /\.vip-badge-star \{[^}]*align-items: center[^}]*display: inline-flex/);
  assert.match(popupCss, /\.vip-badge-star svg \{[^}]*display: block/);
  assert.match(popupCss, /\.vip-badge\[hidden\] \{[^}]*display:\s*none/);
  assert.match(popupCss, /--vip-fill:\s*#eee9ff/);
  assert.match(popupCss, /--vip-star:\s*#6d51e8/);
  assert.match(popupCss, /--vip-fill:\s*rgba\(169, 124, 255/);
  assert.match(popupCss, /animation: vip-breathe 2\.8s ease-in-out infinite/);
  assert.match(popupCss, /@keyframes vip-breathe/);
  assert.match(popupCss, /prefers-reduced-motion: reduce/);
});

test("Popup 不承载搞定晒按钮和彩纸效果", () => {
  assert.doesNotMatch(popupHtml, /id="doneButton"|id="confettiLayer"/);
  assert.doesNotMatch(popupJs, /celebrateFinish|confettiLayer/);
  assert.doesNotMatch(popupCss, /\.done-button|\.confetti-layer|@keyframes confetti-fly/);
});

test("Popup 不再显示 Endpoint 下方的长隐私说明", () => {
  assert.doesNotMatch(popupHtml, /class="privacy-note"|data-i18n="privacyNote"/);
});

test("Popup 和扩展 manifest 使用时区小云朵 logo", () => {
  assert.match(popupHtml, /class="brand-logo"[^>]+src="\.\/assets\/time-cloud\.png"/);
  assert.match(popupHtml, /data-default-src="\.\/assets\/time-cloud\.png"/);
  assert.match(popupHtml, /data-vip-src="\.\/assets\/vip-a2-128\.png"/);
  assert.match(popupJs, /const brandLogo = document\.querySelector\("\.brand-logo"\)/);
  assert.match(popupJs, /brandLogo\.src = vip \? brandLogo\.dataset\.vipSrc : brandLogo\.dataset\.defaultSrc/);
  assert.match(manifest, /src\/assets\/icon-128\.png/);
  assert.match(popupCss, /popup-shell::after[\s\S]*url\("\.\/assets\/time-cloud\.png"\)/);
});

test("产品名称统一为 Time Translator", () => {
  assert.match(popupHtml, /<title data-i18n="popupTitle">Time Translator<\/title>/);
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

test("Popup 支持按浏览器语言切换中英文，未知语言回退英文", () => {
  const i18n = popupJs.replace(/\s+/g, " ");
  assert.match(popupHtml, /data-i18n="customKeywordsNote"/);
  assert.match(popupHtml, /<html lang="en"/);
  assert.match(i18n, /applyI18n\(\)/);
  assert.match(i18n, /getMessage as t/);
});

test("品牌文案包含元气 100% 标识", () => {
  assert.match(i18nSource, /energyLine: "元气100%/);
  assert.match(manifest, /元气100%的时区转换工具/);
});
