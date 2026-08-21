export const DEFAULT_SETTINGS = {
  autoConvert: true,
  customKeywords: [],
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
  return {
    ...DEFAULT_SETTINGS,
    ...savedWithoutLegacyEnabled,
    autoConvert: saved.autoConvert ?? legacyAutoConvert ?? DEFAULT_SETTINGS.autoConvert,
    customKeywords: normalizeCustomKeywords(saved.customKeywords),
    llm: {
      ...DEFAULT_SETTINGS.llm,
      ...savedLlm,
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
