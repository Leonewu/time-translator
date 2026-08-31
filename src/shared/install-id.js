const INSTALL_ID_KEY = "installId";
const MAX_INSTALL_ID_LENGTH = 80;

let installIdPromise = null;

function getDefaultStorage() {
  if (globalThis.chrome?.storage?.local) return globalThis.chrome.storage.local;

  try {
    if (!globalThis.localStorage) return null;
    return {
      async get(key) {
        return { [key]: globalThis.localStorage.getItem(key) };
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

function generateInstallId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export function normalizeInstallId(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > MAX_INSTALL_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(normalized)) return "";
  return normalized;
}

export function isVipInstallId(value) {
  return normalizeInstallId(value).toLocaleLowerCase() === "emma";
}

export function getInstallId(storage = getDefaultStorage()) {
  if (!storage) return Promise.reject(new Error("Extension storage is unavailable"));
  if (!installIdPromise) {
    installIdPromise = (async () => {
      const stored = await storage.get(INSTALL_ID_KEY);
      if (typeof stored?.[INSTALL_ID_KEY] === "string" && stored[INSTALL_ID_KEY].trim()) {
        return stored[INSTALL_ID_KEY].trim();
      }

      const installId = generateInstallId();
      await storage.set({ [INSTALL_ID_KEY]: installId });
      return installId;
    })().catch((error) => {
      installIdPromise = null;
      throw error;
    });
  }
  return installIdPromise;
}

export async function setInstallId(value, storage = getDefaultStorage()) {
  if (!storage) throw new Error("Extension storage is unavailable");
  const installId = normalizeInstallId(value);
  if (!installId) throw new Error("Install ID cannot be empty");
  await storage.set({ [INSTALL_ID_KEY]: installId });
  installIdPromise = Promise.resolve(installId);
  return installId;
}

export { INSTALL_ID_KEY };
