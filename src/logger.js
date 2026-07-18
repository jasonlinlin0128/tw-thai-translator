/**
 * Logger — 把使用事件送到 GAS 後端（同一個 URL 也是翻譯 proxy）。
 * Fire-and-forget：失敗只印 console，不影響使用。
 *
 * Proxy 模式的 translate/clarify 由 GAS 在翻譯當筆直接落表，
 * 前端只需回報：cache 命中、常用句使用、direct 模式翻譯、回饋。
 */

import { getBackendUrl } from "./gemini.js";

const DEVICE_ID_KEY = "device_id";

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      "dev_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

const DIRECTION_MAP = {
  "zh-TW→th-TH": "中文→泰文",
  "th-TH→zh-TW": "泰文→中文",
};

/**
 * @param {string} type - translate|clarify|phrase|cache|feedback-good|feedback-bad
 * @param {Object} entry - {original, translated, fromLang, toLang, note?}
 */
export function logEvent(type, entry) {
  const url = getBackendUrl();
  if (!url) return;

  fetch(url, {
    method: "POST",
    mode: "no-cors", // 只寫不讀，opaque response 即可
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "log",
      type,
      timestamp: Date.now(),
      speaker: entry.fromLang === "zh-TW" ? "中文" : "泰文",
      direction:
        DIRECTION_MAP[`${entry.fromLang}→${entry.toLang}`] ||
        `${entry.fromLang}→${entry.toLang}`,
      original: entry.original,
      translated: entry.translated,
      note: entry.note || "",
      deviceId: getDeviceId(),
    }),
  }).catch((err) => {
    console.warn("[Logger] send failed:", err.message);
  });
}
