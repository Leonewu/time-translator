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

test("内容脚本支持按网页域名屏蔽自动检测", () => {
  assert.match(contentSource, /isBlockedSite, normalizeBlockedSites/);
  assert.match(contentSource, /let blockedSites = \[\]/);
  assert.match(contentSource, /function isBlockedPage\(\)/);
  assert.match(contentSource, /blockedSites = normalizeBlockedSites\(settings\.blockedSites\)/);
  assert.match(contentSource, /!force && \(isBlockedPage\(\) \|\| !autoConvert/);
  assert.match(contentSource, /message\.type === "SHOW_CURRENT_SELECTION" && autoConvert && !isBlockedPage\(\)/);
});

test("内容脚本自动候选包含 close of business 这类命名时间", () => {
  assert.match(contentSource, /close\\s\+of\\s\+business/);
  assert.match(contentSource, /weekdayWithTimeZone/);
});

test("自动解析只在释放鼠标后调度，拖选期间的 selectionchange 不得发请求", () => {
  assert.match(contentSource, /function scheduleSelectionParse\(\)/);
  assert.match(contentSource, /document\.addEventListener\("pointerup", handleSelectionRelease, true\)/);
  const selectionChangeBlock = contentSource.match(/document\.addEventListener\("selectionchange", \(\) => \{[\s\S]*?\n\}\);/)?.[0] || "";
  assert.doesNotMatch(selectionChangeBlock, /scheduleSelectionParse\(\)/);
});

test("自动转换只接受真实拖选，并跳过编辑器内的选区", () => {
  assert.match(contentSource, /document\.addEventListener\("pointerdown", handlePointerDown, true\)/);
  assert.match(contentSource, /document\.addEventListener\("pointermove", handlePointerMove, true\)/);
  assert.match(contentSource, /POINTER_MOVE_THRESHOLD/);
  assert.match(contentSource, /isSameSelection/);
  assert.match(contentSource, /isEditable/);
  assert.match(contentSource, /if \(info\.isEditable\) return/);
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

test("转换结果日期保持单行完整显示，并提示 Gmail 参考日期", () => {
  assert.match(contentSource, /\.flow \{[^}]*align-items: start[^}]*grid-template-columns: minmax\(0, 1fr\) auto max-content/);
  assert.match(contentSource, /\.target-side \{[^}]*display: flex[^}]*flex-direction: column/);
  assert.match(contentSource, /<div class="side target-side">[\s\S]*\$\{referenceNote\}/);
  assert.doesNotMatch(contentSource, /\.source \{[^}]*overflow-wrap: anywhere/);
  assert.match(contentSource, /\.result \{[^}]*white-space: nowrap/);
  assert.match(contentSource, /按邮件日期计算/);
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
  assert.match(contentSource, /renderAndParse\(\{ text: retryText, rect: retryRect, referenceContext: currentReferenceContext \}, true\)/);
});

test("失败 Tooltip 也提供接案順心!按钮和彩纸层", () => {
  assert.match(contentSource, /if \(!result\?\.ok\) \{[\s\S]*<div class="celebration-layer" aria-hidden="true"><\/div>[\s\S]*\$\{celebrateAction\}[\s\S]*data-action="refresh"/);
  assert.match(contentSource, /if \(!result\?\.ok\) \{[\s\S]*placeHost\(rect\);[\s\S]*bindCelebrationButton\(host\);[\s\S]*return;/);
  assert.match(contentSource, /function bindCelebrationButton/);
});

test("成功转换后的 Tooltip 提供接案順心!按钮和 Canvas 蓄力彩纸效果", () => {
  assert.match(contentSource, /import \{ getAnonymousInstallId, getInstallId \} from "\.\/shared\/install-id\.js"/);
  assert.match(contentSource, /getAnonymousInstallId\(\)/);
  assert.match(contentSource, /const celebrateAction = `<button/);
  assert.match(contentSource, /data-action="celebrate"/);
  assert.match(contentSource, /<span>接案順心!<\/span>/);
  assert.match(contentSource, /<div class="card">[\s\S]*<div class="celebration-layer" aria-hidden="true"><\/div>[\s\S]*data-action="celebrate"/);
  assert.match(contentSource, /function triggerCelebration/);
  assert.match(contentSource, /function getCelebrationProfile/);
  assert.match(contentSource, /canvas-confetti/);
  assert.match(contentSource, /confetti\.create/);
  assert.match(contentSource, /celebration-canvas/);
  assert.match(contentSource, /time-translator-celebration-canvas/);
  assert.match(contentSource, /position: "fixed"/);
  assert.match(contentSource, /resize: true/);
  assert.match(contentSource, /document\.documentElement\.append\(canvas\)/);
  assert.match(contentSource, /globalThis\.innerWidth/);
  assert.match(contentSource, /particleCount/);
  assert.match(contentSource, /shapes: \["square", "circle", "star"\]/);
  assert.match(contentSource, /flightDuration/);
  assert.match(contentSource, /celebration-layer/);
  assert.doesNotMatch(contentSource, /celebration-ray|celebration-ring|celebration-flash/);
  assert.doesNotMatch(contentSource, /celebration-burst|celebration-piece/);
  assert.doesNotMatch(contentSource, /layer\.replaceChildren\(\)/);
  assert.match(contentSource, /celebrateButton\.addEventListener\("click"/);
  assert.match(contentSource, /celebrateButton\.addEventListener\("pointerdown"/);
  assert.match(contentSource, /celebrateButton\.addEventListener\("pointerup"/);
  assert.match(contentSource, /celebrateButton\.addEventListener\("pointercancel"/);
  assert.match(contentSource, /is-charging/);
  assert.match(contentSource, /pendingHoldDuration/);
  assert.match(contentSource, /function isEventInsideTooltip/);
  assert.match(contentSource, /event\.composedPath\?\.\(\)/);
  assert.match(contentSource, /function getTooltipButton/);
  assert.doesNotMatch(contentSource, /lastCelebrateAt|celebratedAt|celebrationDebug|TT-celebrate/);
  assert.match(contentSource, /action === "celebrate"/);
  assert.doesNotMatch(contentSource, /vipEnabled|isVipInstallId/);
});

test("VIP 彩蛋支持十秒十次点击，长按复用普通蓄力彩带", () => {
  assert.match(contentSource, /const CELEBRATION_CLICK_LIMIT = 10/);
  assert.match(contentSource, /const CELEBRATION_CLICK_WINDOW_MS = 10_000/);
  assert.match(contentSource, /const CELEBRATION_COMBO_IDLE_MS = 3_000/);
  assert.doesNotMatch(contentSource, /CELEBRATION_HOLD_EASTER_EGG_MS/);
  assert.match(contentSource, /function triggerComboCelebration/);
  assert.match(contentSource, /const COMBO_CELEBRATION_THEMES = \[[\s\S]*colors: \["#4b2e83", "#6d4aff", "#a78bfa", "#f2b134", "#ffd166", "#fff0b3"\][\s\S]*customShape: "rounded-diamond"[\s\S]*supportingShapes: \["star", "star"\][\s\S]*colors: \["#3b1e8a", "#7c3aed", "#c084fc", "#f59e0b", "#fde68a"\][\s\S]*customShape: "four-point-sparkle"[\s\S]*supportingShapes: \["square", "square"\]/);
  assert.match(contentSource, /const comboShapes = new Map\(\)/);
  assert.match(contentSource, /function getComboShape/);
  assert.match(contentSource, /confetti\.shapeFromPath\(\{\s*path: paths\[name\], matrix: matrices\[name\]\s*\}\)/);
  assert.match(contentSource, /"four-point-sparkle": \[0\.68, 0, 0, 0\.68, -3\.4, -3\.4\]/);
  assert.match(contentSource, /let comboThemeIndex = 0/);
  assert.match(contentSource, /function getNextComboTheme/);
  assert.match(contentSource, /comboThemeIndex = \(comboThemeIndex \+ 1\) % COMBO_CELEBRATION_THEMES\.length/);
  assert.match(contentSource, /const \{ colors, shapes \} = getNextComboTheme\(\)/);
  assert.doesNotMatch(contentSource, /♥|getHeartShape|heartShapes|shapeFromText|triggerHeartCelebration|HEART_CELEBRATION_COLORS|COMBO_CELEBRATION_COLORS/);
  assert.match(contentSource, /color = "#ef5b8b"/);
  assert.doesNotMatch(contentSource, /#ff79a8|celebration-heart-pop/);
  assert.match(contentSource, /const CLICK_EASTER_EGG_MESSAGES = \[[\s\S]*"🧩 \{name\}~"[\s\S]*"希望看到这里的时候，你今天心情不错。🎉"[\s\S]*"希望你正在过一个普通但舒服的下午。"[\s\S]*"希望你今天能看到好看的夕阳🌇和月亮🌙"[\s\S]*"随时 feedback 我，if needs"[\s\S]*\]/);
  assert.doesNotMatch(contentSource, /真的很抱歉/);
  assert.match(contentSource, /function getCelebrationName/);
  assert.match(contentSource, /return String\(magicCode \|\| ""\)\.trim\(\)/);
  assert.doesNotMatch(contentSource, /DEFAULT_CELEBRATION_NAME/);
  assert.match(contentSource, /function formatCelebrationMessage/);
  assert.match(contentSource, /replaceAll\("\{name\}", getCelebrationName\(\)\)/);
  assert.match(contentSource, /let clickEasterEggMessageIndex = 0/);
  assert.match(contentSource, /message\.textContent = text/);
  assert.match(contentSource, /function consumeClickEasterEggMessage/);
  assert.match(contentSource, /clickEasterEggMessageIndex = \(clickEasterEggMessageIndex \+ 1\) % CLICK_EASTER_EGG_MESSAGES\.length/);
  assert.match(contentSource, /triggerComboCelebration\(button, \{ messageText: consumeClickEasterEggMessage\(\) \}\)/);
  assert.match(contentSource, /const comboTransparencyTimers = new WeakMap\(\)/);
  assert.match(contentSource, /function activateComboTransparency/);
  assert.match(contentSource, /card\.classList\.add\("is-combo-celebrating"\)/);
  assert.match(contentSource, /\.card\.is-combo-celebrating \{[^}]*background: rgba\(255, 255, 255, \.58\)/);
  assert.match(contentSource, /\.card\.is-combo-celebrating > \.toolbar > :not\(\.celebrate\) \{ opacity: \.44/);
  assert.match(contentSource, /\.card\.is-combo-celebrating \.celebrate \{ opacity: 1/);
  assert.match(contentSource, /const previousClickAt = clickTimes\.at\(-1\) \|\| 0/);
  assert.match(contentSource, /if \(previousClickAt && now - previousClickAt <= CELEBRATION_COMBO_IDLE_MS\) activateComboTransparency\(button\)/);
  assert.match(contentSource, /function recordCelebrationClick/);
  assert.match(contentSource, /const celebrationClickStates = new WeakMap\(\)/);
  assert.match(contentSource, /const clickTimes = \(celebrationClickStates\.get\(button\) \|\| \[\]\)/);
  assert.match(contentSource, /clickTimes\.length < CELEBRATION_CLICK_LIMIT/);
  assert.match(contentSource, /celebrationClickStates\.delete\(button\)/);
  assert.doesNotMatch(contentSource, /holdTimer|holdThresholdReached|holdEasterEggPending|markHoldThreshold/);
  assert.match(contentSource, /const holdDuration = pendingHoldDuration \|\| 0/);
  assert.match(contentSource, /triggerCelebration\(celebrateButton, holdDuration\)/);
  assert.match(contentSource, /celebration-message/);
});

test("长按超过 1 秒先倾斜颤抖，松手后恢复普通蓄力彩带并显示接案顺心文案", () => {
  assert.match(contentSource, /const CELEBRATION_SHAKE_THRESHOLD_MS = 1_000/);
  assert.match(contentSource, /shakeTimer = setTimeout\(\(\) => \{/);
  assert.match(contentSource, /celebrateButton\.classList\.add\("is-charging"\)/);
  assert.match(contentSource, /celebrateButton\.classList\.add\("is-charging-shake"\)/);
  assert.match(contentSource, /celebrateButton\.classList\.remove\("is-charging-shake"\)/);
  assert.match(contentSource, /\.celebrate\.is-charging-shake \{ animation: celebrate-charge-wiggle \.4s/);
  assert.match(contentSource, /@keyframes celebrate-charge-wiggle/);
  assert.match(contentSource, /const holdDuration = pendingHoldDuration \|\| 0/);
  assert.match(contentSource, /const isLongPress = holdDuration >= CELEBRATION_SHAKE_THRESHOLD_MS/);
  assert.match(contentSource, /if \(isLongPress\) \{[\s\S]*triggerCelebration\(celebrateButton, holdDuration\);[\s\S]*showEasterEggMessage\(celebrateButton, \{ color: "#7c5cfc", shadowColor: "rgba\(124, 92, 252, \.36\)", text: `🧩 \$\{getCelebrationName\(\)\}~ 接案順心！` \}\);[\s\S]*return;/);
  assert.match(contentSource, /if \(!isClickEasterEgg\) triggerCelebration\(celebrateButton, holdDuration\)/);
  assert.doesNotMatch(contentSource, /LONG_HOLD_HEART_COLORS|fallingMessage|getFallingMessageShape|isLongPressEasterEgg|pendingLongPress|longPressReady/);
  const startShakeTimerBlock = contentSource.match(/const startShakeTimer = \(\) => \{[\s\S]*?\n    \};/)?.[0] || "";
  assert.doesNotMatch(startShakeTimerBlock, /triggerComboCelebration/);
});

test("Tooltip 提供抱怨按钮，并只通过后台上报当前 case", () => {
  assert.match(contentSource, /report: '<span[^>]*>💢<\/span>'/);
  assert.match(contentSource, /data-action="report"/);
  assert.match(contentSource, /type: "REPORT_CASE"/);
  assert.match(contentSource, /抱怨一下/);
  assert.match(contentSource, /已抱怨/);
});
