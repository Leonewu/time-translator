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
  assert.match(contentSource, /const FREEZE_DRY_COLORS = \["#f1d29a", "#d9ae73", "#a8794c"\]/);
  assert.match(contentSource, /"freeze-dried": "M1\.4 1\.8C2\.1 \.8 3\.3 \.4 4\.3 \.8L8\.2 1\.7C9\.3 2 9\.8 3 9\.3 4\.1L8 8C7\.7 9\.1 6\.6 9\.6 5\.6 9\.2L1\.8 8\.1C\.8 7\.8 \.3 6\.8 \.6 5\.8Z"/);
  assert.match(contentSource, /function triggerFreezeDriedParticles/);
  assert.match(contentSource, /triggerFreezeDriedParticles\(shoot, origin/);
  assert.match(contentSource, /const HOLIDAY_THEMES = \{/);
  assert.match(contentSource, /"new-year"/);
  assert.match(contentSource, /halloween/);
  assert.match(contentSource, /christmas/);
  assert.match(contentSource, /"mid-autumn"/);
  assert.match(contentSource, /"spring-festival"/);
  assert.match(contentSource, /emoji: \["✨", "✨", "✨", "✨"\]/);
  assert.match(contentSource, /uprightEmoji: \["🌕", "🌕", "🐇", "🐇", "🐇", "🐇", "🥮", "🥮", "🏮", "🏮", "🌙", "🌙"\]/);
  assert.match(contentSource, /featuredUprightEmoji: \["⭐", "⭐"\]/);
  assert.match(contentSource, /featuredEmojiScalar: 1\.58/);
  assert.match(contentSource, /message: "🌕 中秋快乐！要开心哦"/);
  assert.match(contentSource, /comboMessages: \[[\s\S]*?"🐇 花好月圆！",[\s\S]*?"🌕 今晚月亮很圆，希望你的心情也是圆满",[\s\S]*?"🐇 希望你抬头看月亮时，能想起一些开心的事",[\s\S]*?\]/);
  assert.match(contentSource, /function getHolidayPreviewKey/);
  assert.match(contentSource, /tt-holiday/);
  assert.match(contentSource, /function getChineseCalendarDate/);
  assert.match(contentSource, /en-u-ca-chinese-nu-latn/);
  assert.match(contentSource, /function triggerHolidayCelebration/);
  assert.match(contentSource, /function getHolidayEmojiShapes/);
  assert.match(contentSource, /confetti\.shapeFromText\(\{/);
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

test("普通模式和节日模式使用互斥的彩带与文案", () => {
  const normalCelebrationSource = contentSource.slice(
    contentSource.indexOf("function triggerNormalCelebration"),
    contentSource.indexOf("function triggerCelebration"),
  );
  const celebrationRouterSource = contentSource.slice(
    contentSource.indexOf("function triggerCelebration"),
    contentSource.indexOf("function renderLoading"),
  );
  const comboCelebrationSource = contentSource.slice(
    contentSource.indexOf("function triggerComboCelebration"),
    contentSource.indexOf("function consumeClickEasterEggMessage"),
  );

  assert.match(normalCelebrationSource, /colors: CELEBRATION_COLORS/);
  assert.match(normalCelebrationSource, /triggerFreezeDriedParticles\(shoot, origin/);
  assert.doesNotMatch(normalCelebrationSource, /Holiday|getHoliday|triggerHoliday/);
  assert.match(celebrationRouterSource, /const holidayTheme = getHolidayTheme\(\)/);
  assert.match(celebrationRouterSource, /if \(holidayTheme\) \{[\s\S]*?triggerHolidayCelebration[\s\S]*?\} else \{[\s\S]*?triggerNormalCelebration/);
  assert.match(comboCelebrationSource, /if \(holidayTheme\) \{[\s\S]*?triggerHolidayCelebration[\s\S]*?return;[\s\S]*?\}[\s\S]*?getNextComboTheme\(\)/);
});

test("节日模式使用可辨认的 Emoji、专属配色和专属文案", () => {
  const holidayThemesSource = contentSource.slice(
    contentSource.indexOf("const HOLIDAY_THEMES = {"),
    contentSource.indexOf("const HOLIDAY_THEME_KEYS"),
  );

  assert.match(contentSource, /function triggerHolidayCelebration\(shoot, origin, button, theme/);
  assert.match(contentSource, /emoji: \["🦇", "🍬", "🍭"\]/);
  assert.match(contentSource, /uprightEmoji: \["🎃", "🎃", "👻", "🧙‍♀️", "🧛"\]/);
  assert.match(contentSource, /emoji: \["❄️", "❄️", "❄️", "❄️", "🎁", "🍭", "☃️", "🍬"\]/);
  assert.match(contentSource, /uprightEmoji: \["🎄", "🎄", "🍎", "🔔", "🦌"\]/);
  assert.match(contentSource, /emoji: \["✨", "✨", "✨", "✨"\]/);
  assert.match(contentSource, /uprightEmoji: \["🌕", "🌕", "🐇", "🐇", "🐇", "🐇", "🥮", "🥮", "🏮", "🏮", "🌙", "🌙"\]/);
  assert.match(contentSource, /featuredUprightEmoji: \["⭐", "⭐"\]/);
  assert.match(contentSource, /emoji: createHolidayEmojiPool\(\[\["🎊", 4\], \["✨", 4\]\]\)/);
  assert.match(contentSource, /uprightEmoji: createHolidayEmojiPool\(\[\["🧧", 4\], \["🏮", 5\], \["🧨", 3\], \["🥟", 3\], \["🍊", 4\]\]\)/);
  assert.match(contentSource, /const decorativeShapes = emojiShapes\.length \? emojiShapes : getHolidayShapes\(theme\.fallbackEmojiShapes\)/);
  assert.match(contentSource, /const emojiParticleCount = Math\.min\(36, Math\.max\(8, Math\.round\(totalParticleCount \* theme\.emojiRatio\)\)\)/);
  assert.match(contentSource, /emojiRatio: 0\.5/);
  assert.match(contentSource, /colors: \["#c84d59", "#e7b652", "#f8ead2", "#d6eaf0"\]/);
  assert.match(contentSource, /shapes: \["circle", "square"\]/);
  assert.doesNotMatch(holidayThemesSource, /accentShapes|accentColors|accentScalar/);
  assert.match(contentSource, /message: "🔔 Merry Christmas!"/);
  assert.match(contentSource, /comboMessages: \[[\s\S]*?"🎄 Merry Christmas!",[\s\S]*?"☃️ 冬天有点冷，希望你的圣诞节是暖暖的",[\s\S]*?"🍎 希望平安、温暖和快乐，都随着圣诞节来到你身边",[\s\S]*?\]/);
  assert.doesNotMatch(holidayThemesSource, /shapes: \[[^\]]*"star"[^\]]*\]/);
  assert.match(contentSource, /function consumeHolidayComboMessage\(theme\)/);
  assert.match(contentSource, /"🎆✨🧩\{name\}～✨🎊"/);
  assert.match(contentSource, /"🎃✨🧩\{name\}～✨👻"/);
  assert.match(contentSource, /"🎄✨🧩\{name\}～✨🔔"/);
  assert.match(contentSource, /"🐇✨🧩\{name\}～✨🌕"/);
  assert.match(contentSource, /"🏮✨🧩\{name\}～✨🧧"/);
  assert.match(contentSource, /const messageKey = theme\.comboMessageKey \|\| messages/);
  assert.match(contentSource, /holidayComboMessageIndices\.set\(messageKey, \(index \+ 1\) % messages\.length\)/);
  assert.match(contentSource, /return formatCelebrationMessage\(messages\[index\]\)/);
  assert.match(contentSource, /text: combo \? consumeHolidayComboMessage\(theme\) : theme\.message/);
});

test("圣诞仅使用 Emoji 雪花，不再绘制 SVG 雪花轮廓", () => {
  const holidayCelebrationSource = contentSource.slice(
    contentSource.indexOf("function triggerHolidayCelebration"),
    contentSource.indexOf("function triggerFreezeDriedParticles"),
  );

  assert.doesNotMatch(contentSource, /snowflake: "M/);
  assert.doesNotMatch(holidayCelebrationSource, /accentParticleCount|accentShapes|accentColors|accentScalar/);
});

test("圣诞 Emoji 单独延长淡出时间，不影响普通彩纸", () => {
  const holidayCelebrationSource = contentSource.slice(
    contentSource.indexOf("function triggerHolidayCelebration"),
    contentSource.indexOf("function triggerFreezeDriedParticles"),
  );

  assert.match(contentSource, /emojiTicksMultiplier: 1\.75/);
  assert.equal((contentSource.match(/emojiTicksMultiplier:/g) || []).length, 1);
  assert.match(holidayCelebrationSource, /const emojiTicks = Math\.round\(profile\.ticks \* \(theme\.emojiTicksMultiplier \|\| 1\)\)/);
  assert.match(holidayCelebrationSource, /particleCount: confettiParticleCount,[\s\S]*ticks: profile\.ticks/);
  assert.match(holidayCelebrationSource, /particleCount: movingEmojiParticleCount,[\s\S]*ticks: emojiTicks/);
});

test("所有节日 Emoji 使用两倍栅格分辨率但保持原显示尺寸", () => {
  const holidayThemesSource = contentSource.slice(
    contentSource.indexOf("const HOLIDAY_THEMES = {"),
    contentSource.indexOf("const HOLIDAY_THEME_KEYS"),
  );
  const emojiShapeSource = contentSource.slice(
    contentSource.indexOf("function getHolidayEmojiShapes"),
    contentSource.indexOf("function triggerHolidayCelebration"),
  );

  assert.match(holidayThemesSource, /emojiRasterScale: 2/);
  assert.equal((holidayThemesSource.match(/emojiRasterScale:/g) || []).length, 5);
  assert.match(emojiShapeSource, /const rasterScalar = displayScalar \* \(theme\.emojiRasterScale \|\| 1\)/);
  assert.match(emojiShapeSource, /const cacheKey = `\$\{text\}:\$\{rasterScalar\}:\$\{displayColor \|\| "native"\}:\$\{fontFamily \|\| "native"\}`/);
  assert.match(emojiShapeSource, /\.\.\.\(displayColor \? \{ color: displayColor \} : \{\}\)/);
  assert.match(emojiShapeSource, /\.\.\.\(fontFamily \? \{ fontFamily \} : \{\}\)/);
  assert.match(contentSource, /scalar: emojiShapes\.length \? theme\.emojiScalar : profile\.scalar/);
  assert.match(contentSource, /scalar: theme\.emojiScalar/);
});

test("节日主体 Emoji 保持正向下落，只关闭自身旋转且不增加粒子总量", () => {
  const holidayThemesSource = contentSource.slice(
    contentSource.indexOf("const HOLIDAY_THEMES = {"),
    contentSource.indexOf("const HOLIDAY_THEME_KEYS"),
  );
  const holidayCelebrationSource = contentSource.slice(
    contentSource.indexOf("function triggerHolidayCelebration"),
    contentSource.indexOf("function triggerFreezeDriedParticles"),
  );

  assert.equal((holidayThemesSource.match(/uprightEmoji:/g) || []).length, 5);
  assert.match(contentSource, /function getHolidayEmojiShapes\([\s\S]*?displayFontFamily = "",[\s\S]*?\) \{/);
  assert.match(holidayCelebrationSource, /const uprightEmojiShapes = getHolidayEmojiShapes\(theme, theme\.uprightEmoji \|\| \[\]\)/);
  assert.match(holidayCelebrationSource, /const featuredUprightEmojiShapes = getHolidayEmojiShapes\([\s\S]*?featuredEmojiColor,[\s\S]*?featuredEmojiFontFamily,[\s\S]*?\)/);
  assert.match(holidayCelebrationSource, /const uprightEmojiParticleCount = emojiShapeWeight > 0[\s\S]*?emojiParticleCount - featuredUprightParticleCount - movingEmojiParticleCount/);
  const uprightLaunchSource = holidayCelebrationSource.match(/if \(uprightEmojiShapes\.length[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(uprightLaunchSource, /flat: true/);
  assert.match(uprightLaunchSource, /gravity: profile\.gravity/);
  assert.match(uprightLaunchSource, /particleCount: uprightEmojiParticleCount/);
  assert.match(uprightLaunchSource, /spread: profile\.spread/);
  assert.match(uprightLaunchSource, /startVelocity: profile\.startVelocity/);
  assert.match(uprightLaunchSource, /ticks: emojiTicks/);
  const featuredLaunchSource = holidayCelebrationSource.match(/if \(featuredUprightEmojiShapes\.length[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(featuredLaunchSource, /flat: true/);
  assert.match(featuredLaunchSource, /scalar: featuredEmojiScalar/);
  assert.match(featuredLaunchSource, /particleCount: featuredUprightParticleCount/);
});

test("元旦和春节按年份加入不旋转的可爱生肖主体", () => {
  assert.match(contentSource, /import \{ getCuteZodiacEmoji \} from "\.\/shared\/zodiac\.js"/);
  assert.match(contentSource, /function createHolidayEmojiPool\(weightedEmoji\)/);
  assert.match(contentSource, /zodiacWeight: 6/);
  assert.match(contentSource, /emoji: createHolidayEmojiPool\(\[\["🎉", 10\], \["🎊", 10\], \["✨", 6\]\]\)/);
  assert.match(contentSource, /uprightEmoji: createHolidayEmojiPool\(\[\["🥳", 6\], \["🎆", 3\], \["🎇", 3\], \["🥂", 10\]\]\)/);
  assert.match(contentSource, /yearLabelWeight: 6/);
  assert.match(contentSource, /emoji: createHolidayEmojiPool\(\[\["🎊", 4\], \["✨", 4\]\]\)/);
  assert.match(contentSource, /uprightEmoji: createHolidayEmojiPool\(\[\["🧧", 4\], \["🏮", 5\], \["🧨", 3\], \["🥟", 3\], \["🍊", 4\]\]\)/);
  assert.match(contentSource, /zodiacYearLabelWeight: 3/);
  assert.match(contentSource, /message: "🧧 新年快乐"/);
  assert.match(contentSource, /comboMessages: \[[\s\S]*?"🧧 新年快乐",[\s\S]*?"🧨 希望新的一年闲有所趣",[\s\S]*?"🧧 新岁胜旧岁，开心多一点，烦恼少一点",[\s\S]*?\]/);
  assert.match(contentSource, /comboMessageTemplates: \[[\s\S]*?"✨ Happy new year！",[\s\S]*?"🌅 希望你\{year\}心情也是靓靓的！",[\s\S]*?"🥂 希望今年的你，也是自由快乐的",[\s\S]*?"🥳 希望新的一年，你的 Se 也有进步",[\s\S]*?\]/);
  assert.match(contentSource, /function withHolidayZodiac\(theme, date\)/);
  assert.doesNotMatch(contentSource, /function toKeycapNumber\(value\)/);
  assert.match(contentSource, /const year = date\.getFullYear\(\)/);
  assert.match(contentSource, /const zodiacEmoji = getCuteZodiacEmoji\(year\)/);
  assert.match(contentSource, /Array\.from\(\{ length: theme\.zodiacWeight \|\| 0 \}, \(\) => zodiacEmoji\)/);
  assert.match(contentSource, /Array\.from\(\{ length: theme\.yearLabelWeight \|\| 0 \}, \(\) => `✨\$\{year\}✨`\)/);
  assert.match(contentSource, /Array\.from\(\{ length: theme\.zodiacYearLabelWeight \|\| 0 \}, \(\) => `\$\{zodiacEmoji\} \$\{year\} \$\{zodiacEmoji\}`\)/);
  assert.match(contentSource, /const NEW_YEAR_ACCENT_COLOR = "#9575e6"/);
  assert.match(contentSource, /featuredEmojiColor: NEW_YEAR_ACCENT_COLOR/);
  assert.match(contentSource, /messageColor: NEW_YEAR_ACCENT_COLOR/);
  assert.match(contentSource, /featuredEmojiFontFamily: CELEBRATION_YEAR_FONT_FAMILY/);
  assert.match(contentSource, /new FontFace\([\s\S]*?CELEBRATION_YEAR_FONT_NAME,[\s\S]*?`url\(\$\{celebrationYearFontUrl\}\)`/);
  assert.match(contentSource, /template\.replaceAll\("\{year\}", String\(year\)\)/);
  assert.match(contentSource, /uprightEmoji: \[\.\.\.\(theme\.uprightEmoji \|\| \[\]\), \.\.\.zodiacEmojiPool\]/);
  assert.match(contentSource, /featuredUprightEmoji: \[\.\.\.\(theme\.featuredUprightEmoji \|\| \[\]\), \.\.\.yearLabelPool, \.\.\.zodiacYearLabelPool\]/);
});

test("节日辨识依赖 Emoji，不使用南瓜、兔子或灯笼 SVG 轮廓", () => {
  assert.doesNotMatch(contentSource, /pumpkin: "M|rabbit: "M|lantern: "M/);
});

test("节日文案只在长按或十次连击时出现", () => {
  const holidayCelebrationSource = contentSource.slice(
    contentSource.indexOf("function triggerHolidayCelebration"),
    contentSource.indexOf("function triggerFreezeDriedParticles"),
  );
  const celebrationRouterSource = contentSource.slice(
    contentSource.indexOf("function triggerCelebration"),
    contentSource.indexOf("function renderLoading"),
  );
  const comboCelebrationSource = contentSource.slice(
    contentSource.indexOf("function triggerComboCelebration"),
    contentSource.indexOf("function consumeClickEasterEggMessage"),
  );

  assert.match(holidayCelebrationSource, /showMessage = false/);
  assert.match(holidayCelebrationSource, /if \(showMessage\) \{[\s\S]*showEasterEggMessage/);
  assert.match(celebrationRouterSource, /showMessage: holdDuration >= CELEBRATION_SHAKE_THRESHOLD_MS/);
  assert.match(comboCelebrationSource, /combo: true,[\s\S]*showMessage: true/);
});

test("节日模式继承普通模式的粒子动力参数，只替换主题元素", () => {
  const holidayCelebrationSource = contentSource.slice(
    contentSource.indexOf("function triggerHolidayCelebration"),
    contentSource.indexOf("function triggerFreezeDriedParticles"),
  );

  for (const property of ["decay", "gravity", "spread", "startVelocity", "ticks"]) {
    assert.match(holidayCelebrationSource, new RegExp(`${property}: profile\\.${property}`));
  }
  assert.match(holidayCelebrationSource, /scalar: profile\.scalar/);
  assert.match(holidayCelebrationSource, /const normalAccessoryCount = Math\.round\(8 \+ profile\.charge \* 8\)/);
  assert.match(holidayCelebrationSource, /const baselineParticleCount = profile\.particleCount \+ normalAccessoryCount/);
  assert.match(holidayCelebrationSource, /const extraParticleCount = Math\.round\(baselineParticleCount \* theme\.extraParticleRatio\)/);
  assert.doesNotMatch(holidayCelebrationSource, /gravity: theme\.gravity|spread: theme\.spread|startVelocity: theme\.startVelocity|ticks: theme\.ticks/);
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
  assert.doesNotMatch(contentSource, /♥|getHeartShape|heartShapes|triggerHeartCelebration|HEART_CELEBRATION_COLORS|COMBO_CELEBRATION_COLORS/);
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
  assert.match(contentSource, /triggerComboCelebration\(button\)/);
  assert.match(contentSource, /showEasterEggMessage\(button, \{ text: consumeClickEasterEggMessage\(\) \}\)/);
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
