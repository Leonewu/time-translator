import { createSettingsSaver, getProviderPreset, loadSettings, normalizeCustomKeywords, PROVIDER_PRESETS, saveSettings } from "./shared/config.js";
import { applyI18n, getMessage as t } from "./shared/i18n.js";
import { getAnonymousInstallId, getInstallId, isVipInstallId, setInstallId } from "./shared/install-id.js";
import { listAvailableModels } from "./shared/llm.js";

applyI18n();

const provider = document.querySelector("#provider");
const model = document.querySelector("#model");
const endpoint = document.querySelector("#endpoint");
const apiKey = document.querySelector("#apiKey");
const toggleApiKey = document.querySelector("#toggleApiKey");
const themeToggle = document.querySelector("#themeToggle");
const modelMenu = document.querySelector("#modelMenu");
const modelMenuToggle = document.querySelector("#modelMenuToggle");
const modelField = document.querySelector(".model-field");
const modelStatus = document.querySelector("#modelStatus");
const refreshModels = document.querySelector("#refreshModels");
const autoConvert = document.querySelector("#autoConvert");
const pluginState = document.querySelector("#pluginState");
const customKeywords = document.querySelector("#customKeywords");
const saveStatus = document.querySelector("#saveStatus");
const testText = document.querySelector("#testText");
const testButton = document.querySelector("#testLlm");
const testResult = document.querySelector("#testResult");
const testJson = document.querySelector("#testJson");
const installIdValue = document.querySelector("#installIdValue");
const vipBadge = document.querySelector("#vipBadge");
const systemTheme = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
let settings;
let saveTimer;
let availableModels = [];
let themeMode = "system";
let activeProvider = "";
let installIdSaveTimer;
let currentInstallId = "";
let installIdInputDirty = false;
const saveSettingsInOrder = createSettingsSaver(saveSettings);

void getAnonymousInstallId().catch(() => {
  // The anonymous ID is not displayed in the popup.
});

for (const [key, value] of Object.entries(PROVIDER_PRESETS)) {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = t(`provider_${key}`);
  provider.append(option);
}

function readForm() {
  const currentProvider = provider.value;
  const currentProfile = {
    endpoint: endpoint.value.trim(),
    model: model.value.trim(),
    apiKey: apiKey.value.trim(),
  };
  return {
    autoConvert: autoConvert.checked,
    theme: themeMode,
    customKeywords: normalizeCustomKeywords(customKeywords.value),
    targetTimeZone: document.querySelector("#targetTimeZone").value,
    defaultSourceTimeZone: document.querySelector("#defaultSourceTimeZone").value,
    providerProfiles: {
      ...(settings?.providerProfiles || {}),
      [currentProvider]: currentProfile,
    },
    llm: {
      provider: currentProvider,
      ...currentProfile,
    },
  };
}

function fillProviderFields() {
  const preset = getProviderPreset(provider.value);
  const profile = settings?.providerProfiles?.[provider.value] || {
    endpoint: preset.endpoint,
    model: preset.model,
    apiKey: "",
  };
  endpoint.value = profile.endpoint;
  model.value = profile.model;
  apiKey.value = profile.apiKey;
}

function updatePluginState() {
  pluginState.textContent = autoConvert.checked ? t("autoConvertEnabled") : t("autoConvertDisabled");
  pluginState.classList.toggle("disabled", !autoConvert.checked);
}

function updateApiKeyVisibility() {
  const visible = apiKey.type === "text";
  const label = visible ? t("hideApiKey") : t("showApiKey");
  toggleApiKey.setAttribute("aria-label", label);
  toggleApiKey.setAttribute("aria-pressed", String(visible));
  toggleApiKey.title = label;
  toggleApiKey.classList.toggle("is-visible", visible);
}

function applyTheme(theme) {
  themeMode = ["light", "dark", "system"].includes(theme) ? theme : "system";
  const dark = themeMode === "dark" || (themeMode === "system" && Boolean(systemTheme?.matches));
  document.documentElement.dataset.theme = themeMode;
  const label = themeMode === "light" ? t("themeToSystem") : dark ? t("themeToLight") : t("themeToDark");
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

function setModelMenuOpen(open) {
  modelMenu.hidden = !open;
  modelMenuToggle.setAttribute("aria-expanded", String(open));
  model.setAttribute("aria-expanded", String(open));
}

function renderModelMenu(query = "") {
  modelMenu.replaceChildren();
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase();
  const models = normalizedQuery
    ? availableModels.filter((modelId) => modelId.toLocaleLowerCase().includes(normalizedQuery))
    : availableModels;

  for (const modelId of models) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "model-option";
    option.setAttribute("role", "option");
    option.dataset.model = modelId;
    option.textContent = modelId;
    modelMenu.append(option);
  }

  if (!models.length) {
    const empty = document.createElement("div");
    empty.className = "model-menu-empty";
    empty.textContent = t("modelMenuEmpty");
    modelMenu.append(empty);
  }
}

function openModelMenu(query = "") {
  if (!availableModels.length) return;
  renderModelMenu(query);
  setModelMenuOpen(true);
}

function closeModelMenu() {
  setModelMenuOpen(false);
}

function writeModelOptions(models) {
  availableModels = [...new Set(models.map((modelId) => String(modelId).trim()).filter(Boolean))];
  if (modelMenu.hidden === false) renderModelMenu();
}

async function refreshModelOptions() {
  const current = readForm();
  if (!current.llm.apiKey || !current.llm.endpoint) {
    setModelStatus(t("modelRefreshRequired"), "error");
    return;
  }
  refreshModels.disabled = true;
  refreshModels.classList.add("is-loading");
  setModelStatus(t("modelLoading"), "loading");
  try {
    const models = await listAvailableModels({ config: current.llm });
    writeModelOptions(models);
    setModelStatus(t("modelFound", { count: models.length }), "ready");
  } catch (error) {
    const message = error.code === "region_restricted"
      ? t("regionRestricted")
      : error.message || "暂时无法读取模型列表，可继续手动填写模型名。";
    setModelStatus(message, "error");
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
  activeProvider = value.llm.provider;
  model.value = value.llm.model;
  endpoint.value = value.llm.endpoint;
  apiKey.value = value.llm.apiKey;
  fillProviderFields();
  updatePluginState();
  updateApiKeyVisibility();
}

async function persistForm() {
  const snapshot = readForm();
  try {
    settings = await saveSettingsInOrder(snapshot);
    saveStatus.textContent = t("saved");
    setTimeout(() => {
      if (saveStatus.textContent === t("saved")) saveStatus.textContent = t("saveDefault");
    }, 1800);
  } catch {
    saveStatus.textContent = t("saveFailed");
  }
}

function scheduleSave(delay = 350) {
  saveStatus.textContent = t("saving");
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
    testResult.textContent = value?.reason || value?.error || t("testUnknown");
    return;
  }
  testResult.classList.add("success");
  testResult.textContent = value.displayText;
}

function runTest() {
  const current = readForm();
  testButton.disabled = true;
  testResult.className = "test-result muted";
  testResult.textContent = t("testRequesting");
  testJson.hidden = true;
  chrome.runtime.sendMessage(
    { type: "TEST_LLM", text: testText.value.trim(), settings: current },
    (value) => {
      testButton.disabled = false;
      showTest(value);
    },
  );
}

async function loadInstallId() {
  try {
    const installId = await getInstallId();
    if (installIdInputDirty) return;
    currentInstallId = installId;
    installIdValue.value = installId;
    installIdValue.title = installId;
    updateVipBadge(installId);
  } catch {
    if (installIdInputDirty) return;
    installIdValue.value = "";
    installIdValue.placeholder = t("luckyCodeUnavailable");
  }
}

function updateVipBadge(value) {
  vipBadge.hidden = !isVipInstallId(value);
}

async function persistInstallId() {
  const value = installIdValue.value.trim();
  if (!value) {
    try {
      currentInstallId = await setInstallId("");
      installIdValue.value = "";
      installIdValue.title = "";
      updateVipBadge("");
      saveStatus.textContent = t("saved");
    } catch {
      installIdValue.value = currentInstallId;
      installIdValue.title = currentInstallId;
      updateVipBadge(currentInstallId);
    }
    return;
  }
  try {
    currentInstallId = await setInstallId(value);
    installIdValue.value = currentInstallId;
    installIdValue.title = currentInstallId;
    updateVipBadge(currentInstallId);
    saveStatus.textContent = t("saved");
  } catch {
    installIdValue.value = currentInstallId;
    installIdValue.title = currentInstallId;
    updateVipBadge(currentInstallId);
  }
}

function scheduleInstallIdSave(delay = 300) {
  saveStatus.textContent = t("saving");
  clearTimeout(installIdSaveTimer);
  if (delay === 0) {
    void persistInstallId();
    return;
  }
  installIdSaveTimer = setTimeout(() => void persistInstallId(), delay);
}

async function init() {
  settings = await loadSettings();
  writeForm(settings);

  provider.addEventListener("change", () => {
    const previousProvider = activeProvider;
    settings.providerProfiles = {
      ...(settings.providerProfiles || {}),
      [previousProvider]: {
        endpoint: endpoint.value.trim(),
        model: model.value.trim(),
        apiKey: apiKey.value.trim(),
      },
    };
    activeProvider = provider.value;
    writeModelOptions([]);
    closeModelMenu();
    fillProviderFields();
    scheduleSave();
    void refreshModelOptions();
  });
  for (const field of [model, endpoint, apiKey]) {
    field.addEventListener("input", () => scheduleSave());
    field.addEventListener("blur", () => scheduleSave(0));
  }
  model.addEventListener("click", () => openModelMenu());
  model.addEventListener("focus", () => openModelMenu());
  model.addEventListener("input", () => openModelMenu(model.value));
  modelMenuToggle.addEventListener("click", () => {
    if (modelMenu.hidden) openModelMenu();
    else closeModelMenu();
  });
  modelMenu.addEventListener("mousedown", (event) => {
    const option = event.target.closest("[data-model]");
    if (!option) return;
    event.preventDefault();
    model.value = option.dataset.model;
    scheduleSave(0);
    closeModelMenu();
  });
  document.addEventListener("mousedown", (event) => {
    if (!modelField.contains(event.target)) closeModelMenu();
  });
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
    const nextTheme = themeMode === "system"
      ? (systemTheme?.matches ? "light" : "dark")
      : themeMode === "dark"
        ? "light"
        : "system";
    applyTheme(nextTheme);
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
  loadInstallId();
  installIdValue.addEventListener("input", () => {
    installIdInputDirty = true;
    updateVipBadge(installIdValue.value);
    scheduleInstallIdSave();
  });
  installIdValue.addEventListener("blur", () => scheduleInstallIdSave(0));
  installIdValue.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      installIdValue.blur();
    }
  });
}

const handleSystemThemeChange = () => {
  if (themeMode === "system") applyTheme("system");
};
systemTheme?.addEventListener?.("change", handleSystemThemeChange);

init();
