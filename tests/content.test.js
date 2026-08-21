import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");

test("自动启用时，内容脚本保留选区监听并触发解析入口", () => {
  assert.match(contentSource, /document\.addEventListener\("mouseup", handleSelectionRelease, true\)/);
  assert.match(contentSource, /scheduleSelectionParse\(\)/);
});

test("内容脚本包含插件开关状态并允许右键强制转换", () => {
  assert.match(contentSource, /autoConvert/);
  assert.match(contentSource, /renderAndParse\(\{ \.\.\.info, text: message\.text \|\| info\.text \}, true\)/);
});

test("关闭自动转换时，快捷键不再绕过设置，只保留右键菜单入口", () => {
  assert.match(contentSource, /message\.type === "SHOW_CURRENT_SELECTION" && autoConvert/);
  assert.match(contentSource, /message\.type === "SHOW_CONVERSION"/);
});

test("内容脚本从设置读取自定义关键词并参与候选匹配", () => {
  assert.match(contentSource, /customTimeKeywords/);
  assert.match(contentSource, /customKeywords/);
  assert.match(contentSource, /matchesCustomKeyword/);
  assert.match(contentSource, /\.split\(\/\[\\n,;\]\+\//);
});

test("自动解析只在释放鼠标后调度，拖选期间的 selectionchange 不得发请求", () => {
  assert.match(contentSource, /function scheduleSelectionParse\(\)/);
  assert.match(contentSource, /document\.addEventListener\("pointerup", handleSelectionRelease, true\)/);
  const selectionChangeBlock = contentSource.match(/document\.addEventListener\("selectionchange", \(\) => \{[\s\S]*?\n\}\);/)?.[0] || "";
  assert.doesNotMatch(selectionChangeBlock, /scheduleSelectionParse\(\)/);
});

test("成功 Tooltip 两侧显示各自时区，主文本使用轻量字重", () => {
  assert.match(contentSource, /class="zone"/);
  assert.match(contentSource, /formatSourceZone\(result\)/);
  assert.match(contentSource, /formatTargetZone\(result\)/);
  assert.match(contentSource, /\.source \{[^}]*font-weight: 400/);
  assert.match(contentSource, /\.result \{[^}]*font-weight: 400/);
  assert.match(contentSource, /details-label">目标<\/span><span class="details-value">\$\{escapeHtml\(targetZone\)\}/);
});

test("Tooltip 尺寸和操作 icon 保持紧凑", () => {
  assert.match(contentSource, /tooltipHost\.style\.minWidth = "190px"/);
  assert.match(contentSource, /\.source \{[^}]*font-size: 11px/);
  assert.match(contentSource, /\.result \{[^}]*font-size: 12px/);
  assert.match(contentSource, /width="12" height="12"/);
});

test("复制成功只切换为勾选 icon，不渲染大号文字", () => {
  assert.match(contentSource, /check: '<svg/);
  assert.match(contentSource, /button\.innerHTML = icon\("check"\)/);
  assert.doesNotMatch(contentSource, /button\.textContent = "已复制"/);
});

test("成功和失败 Tooltip 都提供手动重新解析按钮", () => {
  assert.match(contentSource, /data-action="refresh"/);
  assert.match(contentSource, /refresh: '<svg/);
  assert.match(contentSource, /action === "refresh"/);
  assert.match(contentSource, /renderAndParse\(\{ text: retryText, rect: retryRect \}, true\)/);
});
