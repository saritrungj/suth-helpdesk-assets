import { ref } from "vue";
import english from "./locales/en.json";

const STORAGE_KEY = "suth-language";
function savedLanguage() {
  try { return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "th"; }
  catch { return "th"; }
}
export const locale = ref(savedLanguage());

export function saveLocale(value) {
  if (!["th", "en"].includes(value)) return;
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Storage may be disabled. */ }
}

/** Translate application copy only. Never pass user-entered names to this function. */
export function t(source, values = []) {
  const message = locale.value === "en" ? english[source] ?? source : source;
  return message.replace(/\{(\d+)\}/g, (token, index) => values[index] ?? token);
}

export function setLocale(value) {
  if (!["th", "en"].includes(value) || value === locale.value) return;
  locale.value = value;
  saveLocale(value);
  document.documentElement.lang = value;
}

export function installLocale(app) {
  app.config.globalProperties.$t = t;
  document.documentElement.lang = locale.value;
}
