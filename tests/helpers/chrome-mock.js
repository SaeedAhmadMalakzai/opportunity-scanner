/** Minimal in-memory chrome.* mock sufficient for storage.js and the service worker to load. */
export function installChromeMock() {
  const store = {};
  const listeners = { onMessage: [], onAlarm: [], onInstalled: [], onStartup: [], onChanged: [] };
  const alarms = new Map();
  const notifications = [];
  const sent = [];
  const chrome = {
    runtime: {
      id: "test-extension-id",
      getPlatformInfo: async () => ({ os: "mac" }),
      sendMessage: async (m) => { sent.push(m); },
      onMessage: { addListener: (fn) => listeners.onMessage.push(fn) },
      onInstalled: { addListener: (fn) => listeners.onInstalled.push(fn) },
      onStartup: { addListener: (fn) => listeners.onStartup.push(fn) }
    },
    storage: {
      local: {
        get: async (keys) => {
          const list = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(store);
          return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, structuredClone(store[k])]));
        },
        set: async (data) => { for (const [k, v] of Object.entries(data)) store[k] = structuredClone(v); },
        remove: async (keys) => { for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k]; }
      },
      onChanged: { addListener: (fn) => listeners.onChanged.push(fn) }
    },
    alarms: {
      create: async (name, info) => { alarms.set(name, { name, ...info }); },
      get: async (name) => alarms.get(name) || null,
      onAlarm: { addListener: (fn) => listeners.onAlarm.push(fn) }
    },
    notifications: { create: async (id, opts) => { notifications.push({ id, ...opts }); return id; } }
  };
  globalThis.chrome = chrome;
  return { chrome, store, listeners, alarms, notifications, sent };
}

/** Dispatch a runtime message through the registered onMessage listener and await the response. */
export function dispatch(listeners, type, payload) {
  return new Promise((resolve) => {
    const fn = listeners.onMessage[0];
    fn({ type, payload }, { id: "test-extension-id" }, resolve);
  });
}
