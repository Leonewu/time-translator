import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsSaver, mergeSettings } from "../src/shared/config.js";

test("插件开关默认开启，并能从设置中持久化关闭状态", () => {
  assert.equal(mergeSettings().autoConvert, true);
  assert.equal(mergeSettings({ autoConvert: false }).autoConvert, false);
});

test("面板主题默认为日间模式，并能持久化夜间模式", () => {
  assert.equal(mergeSettings().theme, "light");
  assert.equal(mergeSettings({ theme: "dark" }).theme, "dark");
  assert.equal(mergeSettings({ theme: "unknown" }).theme, "light");
});

test("旧的自动弹出和 LLM 启用字段不会继续成为配置项", () => {
  const settings = mergeSettings({ enabled: false, showAutomatically: true, llm: { enabled: true } });
  assert.equal(settings.autoConvert, false);
  assert.equal(Object.hasOwn(settings, "enabled"), false);
  assert.equal(Object.hasOwn(settings, "showAutomatically"), false);
  assert.equal(Object.hasOwn(settings.llm, "enabled"), false);
});

test("自定义关键词会被清理、去重并持久化", () => {
  const settings = mergeSettings({ customKeywords: [" EOD ", "eod", "", "before close"] });
  assert.deepEqual(settings.customKeywords, ["EOD", "before close"]);
});

test("自定义关键词支持换行、逗号和分号，短语中的空格需要保留", () => {
  const settings = mergeSettings({ customKeywords: " select \n SELECT, release window ; EOD " });
  assert.deepEqual(settings.customKeywords, ["select", "release window", "EOD"]);
});

test("连续自动保存按输入顺序写入，最后一个关键词不会被旧写入覆盖", async () => {
  const writes = [];
  const save = async (value) => {
    writes.push([...value.customKeywords]);
    await new Promise((resolve) => setTimeout(resolve, writes.length === 1 ? 15 : 0));
    return value;
  };
  const saveInOrder = createSettingsSaver(save);

  await Promise.all([
    saveInOrder({ customKeywords: ["select"] }),
    saveInOrder({ customKeywords: ["select", "phrase"] }),
  ]);

  assert.deepEqual(writes, [["select"], ["select", "phrase"]]);
});
