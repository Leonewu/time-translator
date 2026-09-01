export const DEFAULT_SETTINGS = {
  autoConvert: true,
  theme: "system",
  customKeywords: [],
  blockedSites: [],
  providerProfiles: {},
  targetTimeZone: "Asia/Shanghai",
  defaultSourceTimeZone: "Europe/London",
  llm: {
    provider: "deepseek",
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-v4-flash",
    apiKey: "",
  },
};

export function normalizeCustomKeywords(value) {
  const list = (Array.isArray(value) ? value : [value]).flatMap((item) => String(item ?? "").split(/[\n,;]+/));
  const seen = new Set();
  const normalized = [];
  for (const item of list) {
    const keyword = String(item ?? "").trim();
    const key = keyword.toLocaleLowerCase();
    if (!keyword || keyword.length > 60 || seen.has(key)) continue;
    seen.add(key);
    normalized.push(keyword);
    if (normalized.length >= 30) break;
  }
  return normalized;
}

export function normalizeBlockedSites(value) {
  const list = (Array.isArray(value) ? value : [value]).flatMap((item) => String(item ?? "").split(/[\n,;]+/));
  const seen = new Set();
  const normalized = [];
  for (const item of list) {
    let hostname = String(item ?? "").trim().toLocaleLowerCase();
    if (!hostname || hostname.length > 160) continue;
    hostname = hostname.replace(/^\*\./, "");
    try {
      hostname = new URL(hostname.includes("://") ? hostname : `https://${hostname}`).hostname.toLocaleLowerCase();
    } catch {
      continue;
    }
    hostname = hostname.replace(/\.$/, "");
    if (!hostname || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname) || seen.has(hostname)) continue;
    seen.add(hostname);
    normalized.push(hostname);
    if (normalized.length >= 30) break;
  }
  return normalized;
}

export function isBlockedSite(hostname, blockedSites = []) {
  const normalizedHostname = String(hostname || "").trim().toLocaleLowerCase().replace(/\.$/, "");
  if (!normalizedHostname) return false;
  return normalizeBlockedSites(blockedSites).some((site) => normalizedHostname === site || normalizedHostname.endsWith(`.${site}`));
}

function normalizeProviderProfile(provider, value = {}) {
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
  return {
    endpoint: String(value?.endpoint ?? preset.endpoint ?? "").trim(),
    model: String(value?.model ?? preset.model ?? "").trim(),
    apiKey: String(value?.apiKey ?? "").trim(),
  };
}

export function normalizeProviderProfiles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([provider, profile]) => [provider, normalizeProviderProfile(provider, profile)]),
  );
}

export const PROVIDER_PRESETS = {
  deepseek: {
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-v4-flash",
    hint: "OpenAI 兼容接口；短文本解析建议关闭思考模式以降低延迟。",
  },
  mimo: {
    label: "小米 MiMo",
    endpoint: "https://api.xiaomimimo.com/v1/chat/completions",
    model: "mimo-v2.5",
    hint: "OpenAI 兼容接口；模型名以 MiMo 控制台当前可用列表为准。",
  },
  qwen: {
    label: "通义千问 / 阿里云百炼",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-plus",
    hint: "可替换为你的业务空间专属 Endpoint。",
  },
  zhipu: {
    label: "智谱 GLM",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model: "glm-4.7",
    hint: "使用智谱开放平台 API Key。",
  },
  moonshot: {
    label: "月之暗面 / Kimi",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    model: "kimi-k2.6",
    hint: "Kimi Open Platform 的 OpenAI-compatible 接口。",
  },
  doubao: {
    label: "火山方舟 / 豆包",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    model: "YOUR_ENDPOINT_ID",
    hint: "把模型改成你在方舟创建的 Endpoint ID。",
  },
  gemini: {
    label: "Google Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-3.7-flash",
    hint: "使用 Gemini 的 OpenAI-compatible 接口；模型名以 Google AI Studio 当前可用列表为准。",
  },
  openrouter: {
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "",
    hint: "统一 OpenAI-compatible 接口；刷新模型列表后选择模型。",
  },
  openai: {
    label: "OpenAI-compatible / OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-5.4-nano",
    hint: "也可以改成任何兼容 Chat Completions 的服务。",
  },
  custom: {
    label: "自定义兼容接口",
    endpoint: "",
    model: "",
    hint: "接口需要兼容 POST /chat/completions。",
  },
};

function mergeSettings(saved = {}) {
  const { enabled: _legacyEnabled, ...savedLlm } = saved.llm || {};
  const { showAutomatically: _legacyAutoPopup, ...savedWithoutAutoPopup } = saved;
  const { enabled: legacyAutoConvert, ...savedWithoutLegacyEnabled } = savedWithoutAutoPopup;
  const provider = savedLlm.provider || DEFAULT_SETTINGS.llm.provider;
  const providerProfiles = normalizeProviderProfiles(saved.providerProfiles);
  if (!providerProfiles[provider]) {
    providerProfiles[provider] = normalizeProviderProfile(provider, savedLlm);
  }
  const currentProfile = providerProfiles[provider];
  return {
    ...DEFAULT_SETTINGS,
    ...savedWithoutLegacyEnabled,
    autoConvert: saved.autoConvert ?? legacyAutoConvert ?? DEFAULT_SETTINGS.autoConvert,
    theme: ["light", "dark", "system"].includes(saved.theme) ? saved.theme : DEFAULT_SETTINGS.theme,
    customKeywords: normalizeCustomKeywords(saved.customKeywords),
    blockedSites: normalizeBlockedSites(saved.blockedSites),
    providerProfiles,
    llm: {
      ...DEFAULT_SETTINGS.llm,
      ...savedLlm,
      provider,
      ...currentProfile,
    },
  };
}

export async function loadSettings() {
  if (globalThis.chrome?.storage?.local) {
    const result = await chrome.storage.local.get("settings");
    return mergeSettings(result.settings);
  }

  try {
    const raw = globalThis.localStorage?.getItem("time-plain-settings");
    return mergeSettings(raw ? JSON.parse(raw) : undefined);
  } catch {
    return mergeSettings();
  }
}

export async function saveSettings(settings) {
  const merged = mergeSettings(settings);
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ settings: merged });
    return merged;
  }

  globalThis.localStorage?.setItem("time-plain-settings", JSON.stringify(merged));
  return merged;
}

export function createSettingsSaver(save = saveSettings) {
  let queue = Promise.resolve();
  return (settings) => {
    const task = queue.then(() => save(settings));
    queue = task.catch(() => undefined);
    return task;
  };
}

export function getProviderPreset(provider) {
  return PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
}

export { mergeSettings };
