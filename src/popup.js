import { createSettingsSaver, getProviderPreset, loadSettings, normalizeCustomKeywords, PROVIDER_PRESETS, saveSettings } from "./shared/config.js";
import { listAvailableModels } from "./shared/llm.js";

const provider = document.querySelector("#provider");
const model = document.querySelector("#model");
const endpoint = document.querySelector("#endpoint");
const apiKey = document.querySelector("#apiKey");
const toggleApiKey = document.querySelector("#toggleApiKey");
const themeToggle = document.querySelector("#themeToggle");
const modelOptions = document.querySelector("#modelOptions");
const modelStatus = document.querySelector("#modelStatus");
const refreshModels = document.querySelector("#refreshModels");
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
    theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
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

function updateApiKeyVisibility() {
  const visible = apiKey.type === "text";
  const label = visible ? "隐藏 API Key" : "显示 API Key";
  toggleApiKey.setAttribute("aria-label", label);
  toggleApiKey.setAttribute("aria-pressed", String(visible));
  toggleApiKey.title = label;
  toggleApiKey.classList.toggle("is-visible", visible);
}

function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const label = dark ? "切换到日间模式" : "切换到夜间模式";
  themeToggle.setAttribute("aria-label", label);
  themeToggle.setAttribute("aria-pressed", String(dark));
  themeToggle.title = label;
  themeToggle.classList.toggle("is-dark", dark);
}

function setModelStatus(text, state = "") {
  modelStatus.textContent = text;
  modelStatus.classList.remove("model-status-error", "model-status-ready", "model-status-loading");
  if (state) modelStatus.classList.add(`model-status-${state}`);
}

function writeModelOptions(models) {
  modelOptions.replaceChildren();
  for (const modelId of models) {
    const option = document.createElement("option");
    option.value = modelId;
    modelOptions.append(option);
  }
}

async function refreshModelOptions() {
  const current = readForm();
  if (!current.llm.apiKey || !current.llm.endpoint) {
    setModelStatus("填好 API Key 和 Endpoint 后再刷新。", "error");
    return;
  }
  refreshModels.disabled = true;
  refreshModels.classList.add("is-loading");
  setModelStatus("正在读取当前服务商的模型列表…", "loading");
  try {
    const models = await listAvailableModels({ config: current.llm });
    writeModelOptions(models);
    setModelStatus(`已找到 ${models.length} 个模型，可直接选择或继续手动填写。`, "ready");
  } catch (error) {
    setModelStatus(error.message || "暂时无法读取模型列表，可继续手动填写模型名。", "error");
  } finally {
    refreshModels.disabled = false;
    refreshModels.classList.remove("is-loading");
  }
}

function writeForm(value) {
  autoConvert.checked = value.autoConvert !== false;
  applyTheme(value.theme);
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
    void refreshModelOptions();
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
  themeToggle.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    scheduleSave(0);
  });
  toggleApiKey.addEventListener("click", () => {
    apiKey.type = apiKey.type === "password" ? "text" : "password";
    updateApiKeyVisibility();
    apiKey.focus();
  });
  refreshModels.addEventListener("click", () => void refreshModelOptions());
  testButton.addEventListener("click", runTest);
  testText.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runTest();
  });
}

init();
