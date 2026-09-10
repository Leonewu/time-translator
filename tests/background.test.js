import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const backgroundSource = await readFile(new URL("../src/background.js", import.meta.url), "utf8");

test("后台根据 Magic Code 动态切换普通和 VIP 工具栏图标", () => {
  assert.match(backgroundSource, /getInstallId, isVipInstallId/);
  assert.match(backgroundSource, /const DEFAULT_ACTION_ICON =/);
  assert.match(backgroundSource, /const VIP_ACTION_ICON =/);
  assert.match(backgroundSource, /src\/assets\/vip-a2-16\.png/);
  assert.match(backgroundSource, /src\/assets\/vip-a2-32\.png/);
  assert.match(backgroundSource, /chrome\.action\.setIcon/);
  assert.match(backgroundSource, /isVipInstallId\(value\) \? VIP_ACTION_ICON : DEFAULT_ACTION_ICON/);
  assert.match(backgroundSource, /changes\.installId/);
});

test("后台按节日和实际日期只登记一次自动彩蛋", () => {
  assert.match(backgroundSource, /const HOLIDAY_AUTO_CELEBRATION_STORAGE_PREFIX = "holiday-auto-celebration:"/);
  assert.match(backgroundSource, /const claimedHolidayAutoCelebrations = new Set\(\)/);
  assert.match(backgroundSource, /message\.type === "CLAIM_HOLIDAY_AUTO_CELEBRATION"/);
  assert.match(backgroundSource, /\^\(new-year\|halloween\|christmas\|mid-autumn\|spring-festival\):\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
  assert.match(backgroundSource, /chrome\.storage\.local\.get\(storageKey\)/);
  assert.match(backgroundSource, /chrome\.storage\.local\.set\(\{ \[storageKey\]: \{ triggeredAt: Date\.now\(\) \} \}\)/);
});
