const INSTALL_ID_KEY = "installId";
const ANONYMOUS_INSTALL_ID_KEY = "anonymousInstallId";
const ANONYMOUS_INSTALL_ID_GLOBAL = "__TIME_TRANSLATOR_ANONYMOUS_INSTALL_ID__";
const MAX_INSTALL_ID_LENGTH = 80;
const VIP_INSTALL_ID = "emma";
const LEGACY_GENERATED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let installIdPromise = null;
let anonymousInstallIdPromise = null;

function getDefaultStorage() {
  if (globalThis.chrome?.storage?.local) return globalThis.chrome.storage.local;

  try {
    if (!globalThis.localStorage) return null;
    return {
      async get(key) {
        const value = globalThis.localStorage.getItem(key);
        return value === null ? {} : { [key]: value };
      },
      async set(value) {
        for (const [key, item] of Object.entries(value)) {
          globalThis.localStorage.setItem(key, String(item));
        }
      },
    };
  } catch {
    return null;
  }
}

export function normalizeInstallId(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > MAX_INSTALL_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(normalized)) return "";
  return normalized;
}

function generateAnonymousInstallId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Secure random number generation is unavailable");
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function exposeAnonymousInstallId(anonymousId) {
  globalThis[ANONYMOUS_INSTALL_ID_GLOBAL] = anonymousId;
  return anonymousId;
}

export function isVipInstallId(value) {
  return normalizeInstallId(value).toLowerCase() === VIP_INSTALL_ID;
}

export function getInstallId(storage = getDefaultStorage()) {
  if (!storage) return Promise.reject(new Error("Extension storage is unavailable"));
  if (!installIdPromise) {
    installIdPromise = (async () => {
      const stored = await storage.get(INSTALL_ID_KEY);
      const hasStoredValue = Object.prototype.hasOwnProperty.call(stored || {}, INSTALL_ID_KEY);
      const code = normalizeInstallId(stored?.[INSTALL_ID_KEY]);
      if (code && LEGACY_GENERATED_ID.test(code)) {
        await storage.set({ [INSTALL_ID_KEY]: "" });
        return "";
      }
      return hasStoredValue ? code : "";
    })().catch((error) => {
      installIdPromise = null;
      throw error;
    });
  }
  return installIdPromise;
}

export function getAnonymousInstallId(storage = getDefaultStorage()) {
  if (!storage) return Promise.reject(new Error("Extension storage is unavailable"));
  if (!anonymousInstallIdPromise) {
    anonymousInstallIdPromise = (async () => {
      const stored = await storage.get(ANONYMOUS_INSTALL_ID_KEY);
      const existing = normalizeInstallId(stored?.[ANONYMOUS_INSTALL_ID_KEY]);
      if (existing) return exposeAnonymousInstallId(existing);

      const anonymousId = generateAnonymousInstallId();
      await storage.set({ [ANONYMOUS_INSTALL_ID_KEY]: anonymousId });
      return exposeAnonymousInstallId(anonymousId);
    })().catch((error) => {
      anonymousInstallIdPromise = null;
      throw error;
    });
  }
  return anonymousInstallIdPromise;
}

export async function setInstallId(value, storage = getDefaultStorage()) {
  if (!storage) throw new Error("Extension storage is unavailable");
  const rawValue = String(value ?? "").trim();
  const code = normalizeInstallId(rawValue);
  if (rawValue && !code) throw new Error("Magic Code is invalid");
  await storage.set({ [INSTALL_ID_KEY]: code });
  installIdPromise = Promise.resolve(code);
  return code;
}

export { ANONYMOUS_INSTALL_ID_KEY, INSTALL_ID_KEY };
