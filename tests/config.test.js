import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsSaver, mergeSettings, PROVIDER_PRESETS } from "../src/shared/config.js";

test("插件开关默认开启，并能从设置中持久化关闭状态", () => {
  assert.equal(mergeSettings().autoConvert, true);
  assert.equal(mergeSettings({ autoConvert: false }).autoConvert, false);
});

test("面板主题默认跟随系统，并能持久化手动主题", () => {
  assert.equal(mergeSettings().theme, "system");
  assert.equal(mergeSettings({ theme: "dark" }).theme, "dark");
  assert.equal(mergeSettings({ theme: "light" }).theme, "light");
  assert.equal(mergeSettings({ theme: "unknown" }).theme, "system");
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

test("提供 Gemini 的 OpenAI-compatible 预置配置", () => {
  assert.equal(PROVIDER_PRESETS.gemini.endpoint, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assert.equal(PROVIDER_PRESETS.gemini.model, "gemini-3.7-flash");
});

test("提供 OpenRouter 的 OpenAI-compatible 预置配置", () => {
  assert.equal(PROVIDER_PRESETS.openrouter.endpoint, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(PROVIDER_PRESETS.openrouter.model, "");
});

test("不同 provider 各自保存配置，切换回来时恢复原值", () => {
  const mimo = {
    endpoint: "https://mimo.example/chat/completions",
    model: "mimo-custom",
    apiKey: "mimo-key",
  };
  const gemini = {
    endpoint: "https://gemini.example/chat/completions",
    model: "gemini-custom",
    apiKey: "gemini-key",
  };
  const initial = mergeSettings({
    llm: { provider: "mimo", ...mimo },
    providerProfiles: { gemini },
  });

  assert.deepEqual(initial.providerProfiles.mimo, mimo);
  assert.deepEqual(initial.providerProfiles.gemini, gemini);

  const switchedToGemini = mergeSettings({ ...initial, llm: { provider: "gemini" } });
  assert.deepEqual(switchedToGemini.llm, { provider: "gemini", ...gemini });

  const switchedBackToMimo = mergeSettings({ ...switchedToGemini, llm: { provider: "mimo" } });
  assert.deepEqual(switchedBackToMimo.llm, { provider: "mimo", ...mimo });
});
