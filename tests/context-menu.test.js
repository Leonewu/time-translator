import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const backgroundSource = await readFile(new URL("../src/background.js", import.meta.url), "utf8");

test("右键菜单注册前会移除同 ID 的旧菜单", () => {
  const installBlock = backgroundSource.match(/chrome\.runtime\.onInstalled\.addListener\(\(\) => \{[\s\S]*?\n\}\);/)?.[0] || "";
  const removeIndex = installBlock.indexOf('chrome.contextMenus.remove("convert-selection"');
  const createIndex = installBlock.indexOf("chrome.contextMenus.create(");

  assert.ok(removeIndex >= 0, "注册前应移除旧的 convert-selection 菜单");
  assert.ok(createIndex > removeIndex, "应先 remove，再 create");
  assert.match(installBlock, /chrome\.runtime\.lastError/);
});
