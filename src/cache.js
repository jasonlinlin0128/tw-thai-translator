/**
 * Local translation cache — 重複句 0 API、0 延遲、離線可用。
 * key = `${fromLang}|${gender}|${normalize(text)}`，LRU 上限 500。
 */

const CACHE_KEY = "translation_cache";
const MAX_ENTRIES = 500;

// ponytail: node 測試用 shim，瀏覽器一定有 localStorage
const LS =
  typeof localStorage !== "undefined"
    ? localStorage
    : (() => {
        const m = new Map();
        return {
          getItem: (k) => (m.has(k) ? m.get(k) : null),
          setItem: (k, v) => m.set(k, String(v)),
          removeItem: (k) => m.delete(k),
        };
      })();

function normalize(text) {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[。．.!！?？~～]+$/, "");
}

function loadAll() {
  try {
    return JSON.parse(LS.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function cacheKey(text, fromLang, gender) {
  return `${fromLang}|${gender}|${normalize(text)}`;
}

/**
 * @returns {{translated:string, back?:string, note?:string}|null}
 */
export function getCached(text, fromLang, gender) {
  const all = loadAll();
  const hit = all[cacheKey(text, fromLang, gender)];
  if (!hit) return null;
  hit.ts = Date.now(); // LRU touch
  LS.setItem(CACHE_KEY, JSON.stringify(all));
  return { translated: hit.translated, back: hit.back, note: hit.note };
}

export function putCached(text, fromLang, gender, result) {
  const all = loadAll();
  all[cacheKey(text, fromLang, gender)] = {
    translated: result.translated,
    back: result.back,
    note: result.note,
    ts: Date.now(),
  };
  const keys = Object.keys(all);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => all[a].ts - all[b].ts)
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete all[k]);
  }
  LS.setItem(CACHE_KEY, JSON.stringify(all));
}

export function clearCache() {
  LS.removeItem(CACHE_KEY);
}
