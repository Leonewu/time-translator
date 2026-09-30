const INSTALL_ID_KEY = "installId";
const MAX_INSTALL_ID_LENGTH = 80;
const VIP_INSTALL_ID = "emma";
const LEGACY_GENERATED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let installIdPromise = null;

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

export async function setInstallId(value, storage = getDefaultStorage()) {
  if (!storage) throw new Error("Extension storage is unavailable");
  const rawValue = String(value ?? "").trim();
  const code = normalizeInstallId(rawValue);
  if (rawValue && !code) throw new Error("Magic Code is invalid");
  await storage.set({ [INSTALL_ID_KEY]: code });
  installIdPromise = Promise.resolve(code);
  return code;
}

export { INSTALL_ID_KEY };
