import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
// the handful of browser globals core.js touches at import time
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = globalThis;
globalThis.document = { documentElement: { hasAttribute: () => false, getAttribute: () => null, setAttribute() {}, style: { setProperty() {} } },
  addEventListener() {}, removeEventListener() {}, hidden: false,
  querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, getContext: () => null }) };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
