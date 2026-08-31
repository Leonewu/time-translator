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
