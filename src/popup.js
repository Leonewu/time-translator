import { createSettingsSaver, getProviderPreset, loadSettings, normalizeCustomKeywords, PROVIDER_PRESETS, saveSettings } from "./shared/config.js";

const provider = document.querySelector("#provider");
const model = document.querySelector("#model");
const endpoint = document.querySelector("#endpoint");
const apiKey = document.querySelector("#apiKey");
const providerHint = document.querySelector("#providerHint");
const configState = document.querySelector("#configState");
const autoConvert = document.querySelector("#autoConvert");
const pluginState = document.querySelector("#pluginState");
const customKeywords = document.querySelector("#customKeywords");
const saveStatus = document.querySelector("#saveStatus");
const testText = document.querySelector("#testText");
const testButton = document.querySelector("#testLlm");
const testResult = document.querySelector("#testResult");
const testJson = document.querySelector("#testJson");
let settings;
let saveTimer;
const saveSettingsInOrder = createSettingsSaver(saveSettings);

for (const [key, value] of Object.entries(PROVIDER_PRESETS)) {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = value.label;
  provider.append(option);
}

function readForm() {
  return {
    autoConvert: autoConvert.checked,
    customKeywords: normalizeCustomKeywords(customKeywords.value),
    targetTimeZone: document.querySelector("#targetTimeZone").value,
    defaultSourceTimeZone: document.querySelector("#defaultSourceTimeZone").value,
    llm: {
      provider: provider.value,
      endpoint: endpoint.value.trim(),
      model: model.value.trim(),
      apiKey: apiKey.value.trim(),
    },
  };
}

function fillProviderFields(usePreset = false) {
  const preset = getProviderPreset(provider.value);
  if (usePreset || !endpoint.value) endpoint.value = preset.endpoint;
  if (usePreset || !model.value) model.value = preset.model;
  providerHint.textContent = preset.hint;
}

function updateConfigState(value = readForm()) {
  const configured = Boolean(value.llm.apiKey && value.llm.endpoint && value.llm.model);
  configState.textContent = configured ? `已连接 · ${PROVIDER_PRESETS[value.llm.provider]?.label || value.llm.provider}` : "未配置 API Key";
  configState.classList.toggle("ready", configured);
}

function updatePluginState() {
  pluginState.textContent = autoConvert.checked ? "选中后自动检测并转换" : "仅右键手动检测";
  pluginState.classList.toggle("disabled", !autoConvert.checked);
}

function writeForm(value) {
  autoConvert.checked = value.autoConvert !== false;
  customKeywords.value = value.customKeywords.join("\n");
  document.querySelector("#targetTimeZone").value = value.targetTimeZone;
  document.querySelector("#defaultSourceTimeZone").value = value.defaultSourceTimeZone;
  provider.value = value.llm.provider;
  model.value = value.llm.model;
  endpoint.value = value.llm.endpoint;
  apiKey.value = value.llm.apiKey;
  fillProviderFields();
  updateConfigState(value);
  updatePluginState();
}

async function persistForm() {
  const snapshot = readForm();
  try {
    settings = await saveSettingsInOrder(snapshot);
    saveStatus.textContent = "已自动保存";
    setTimeout(() => {
      if (saveStatus.textContent === "已自动保存") saveStatus.textContent = "输入后自动保存";
    }, 1800);
  } catch {
    saveStatus.textContent = "保存失败";
  }
}

function scheduleSave(delay = 350) {
  updateConfigState();
  saveStatus.textContent = "保存中…";
  clearTimeout(saveTimer);
  if (delay === 0) {
    void persistForm();
    return;
  }
  saveTimer = setTimeout(() => void persistForm(), delay);
}

function showTest(value) {
  testResult.classList.remove("muted", "error", "success");
  testJson.hidden = false;
  testJson.textContent = JSON.stringify(value, null, 2);
  if (!value?.ok) {
    testResult.classList.add("error");
    testResult.textContent = value?.reason || value?.error || "无法确定时间";
    return;
  }
  testResult.classList.add("success");
  testResult.textContent = value.displayText;
}

function runTest() {
  const current = readForm();
  testButton.disabled = true;
  testResult.className = "test-result muted";
  testResult.textContent = "正在请求模型…";
  testJson.hidden = true;
  chrome.runtime.sendMessage(
    { type: "TEST_LLM", text: testText.value.trim(), settings: current },
    (value) => {
      testButton.disabled = false;
      showTest(value);
    },
  );
}

async function init() {
  settings = await loadSettings();
  writeForm(settings);

  provider.addEventListener("change", () => {
    fillProviderFields(true);
    scheduleSave();
  });
  for (const field of [model, endpoint, apiKey]) {
    field.addEventListener("input", () => scheduleSave());
    field.addEventListener("blur", () => scheduleSave(0));
  }
  customKeywords.addEventListener("input", () => scheduleSave(0));
  customKeywords.addEventListener("blur", () => scheduleSave(0));
  for (const field of [document.querySelector("#targetTimeZone"), document.querySelector("#defaultSourceTimeZone")]) {
    field.addEventListener("change", () => scheduleSave());
  }
  autoConvert.addEventListener("change", () => {
    updatePluginState();
    scheduleSave(0);
  });
  testButton.addEventListener("click", runTest);
  testText.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runTest();
  });
}

init();
