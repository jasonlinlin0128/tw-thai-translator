/**
 * Translation API layer.
 *
 * 兩種模式：
 * - Proxy 模式（有後端 URL）：打 GAS，key 藏在 Script Properties，
 *   GAS 同筆完成共用額度檢查 + 伺服器快取 + Sheet log。
 * - Direct 模式（無後端 URL）：直連 Gemini（build 內建 key），向下相容。
 *
 * 兩種模式前面都先過本地快取（cache.js），重複句 0 API。
 *
 * NOTE: gemini-2.5-flash with responseMimeType:"application/json" corrupts
 * non-Latin characters (Chinese/Thai). We use plain text mode + thinkingBudget.
 */

import { matchGlossary } from "./data.js";
import { getCached, putCached } from "./cache.js";
import { getDeviceId } from "./logger.js";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const BUILT_IN_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const BUILT_IN_BACKEND = import.meta.env.VITE_BACKEND_URL || "";

// 額度用完的統一錯誤訊息（app.js 據此開啟常用句庫）
export const QUOTA_EXHAUSTED_MSG = "今日翻譯額度已用完，常用句仍可使用";

export function getApiKey() {
  return localStorage.getItem("gemini_api_key") || BUILT_IN_KEY;
}

export function setApiKey(key) {
  localStorage.setItem("gemini_api_key", key);
}

/** 後端 URL：手動設定 > build 內建（沿用舊 sheet URL 的 localStorage key，零遷移） */
export function getBackendUrl() {
  return localStorage.getItem("google_sheet_url") || BUILT_IN_BACKEND;
}

let lastQuota = null; // {used, max} — proxy 回應後更新
export function getServerQuota() {
  return lastQuota;
}

/**
 * 主翻譯入口。回傳：
 * {type:'translate', translated, back?, note?, via:'cache'|'proxy'|'direct'}
 * 或 {type:'clarify', question_source, question_target, options, via}
 */
export async function analyzeAndTranslate(
  text,
  fromLang,
  toLang,
  gender = "male",
) {
  const cached = getCached(text, fromLang, gender);
  if (cached) return { type: "translate", ...cached, via: "cache" };

  const result = await requestTranslation(text, fromLang, toLang, gender);
  if (result.type === "translate") {
    if (!result.translated) throw new Error("翻譯格式錯誤");
    putCached(text, fromLang, gender, result);
  }
  return result;
}

// ===== 內部：路由 proxy / direct =====

async function requestTranslation(text, fromLang, toLang, gender) {
  const backend = getBackendUrl();
  if (backend) {
    try {
      const result = await proxyTranslate(
        backend,
        text,
        fromLang,
        toLang,
        gender,
      );
      return { ...result, via: "proxy" };
    } catch (err) {
      // 額度用完不 fallback（fallback 會繞過共用額度）；其他錯誤若有內建 key 就直連救援
      if (err.message === QUOTA_EXHAUSTED_MSG || !getApiKey()) throw err;
      console.warn("Proxy failed, falling back to direct:", err.message);
    }
  }
  const result = await directTranslate(text, fromLang, toLang, gender);
  return { ...result, via: "direct" };
}

async function proxyTranslate(url, text, fromLang, toLang, gender) {
  const terms = matchGlossary(text, fromLang)
    .map((g) => `${g.zh}=${g.th}`)
    .join(",");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      // text/plain = CORS simple request，GAS 不吃 preflight
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "translate",
        text,
        from: fromLang,
        to: toLang,
        gender,
        terms,
        deviceId: getDeviceId(),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(err.name === "AbortError" ? "後端逾時" : "後端連線失敗");
  } finally {
    clearTimeout(timer);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`後端回應異常 (${res.status})`);
  }
  if (data.quota) lastQuota = data.quota;
  if (!data.ok) {
    if (data.error === "quota_exceeded") throw new Error(QUOTA_EXHAUSTED_MSG);
    throw new Error(data.error || "後端錯誤");
  }
  return data.result;
}

// ===== Direct 模式（現行 Gemini 直連） =====

async function directTranslate(text, fromLang, toLang, gender) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("尚未設定後端網址或 API Key");

  const response = await fetchWithRetry(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: buildSystemPrompt(text, fromLang, toLang, gender) }],
      },
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        temperature: 0.3,
        thinkingConfig: { thinkingBudget: 256 },
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`Gemini API error (${response.status}):`, errBody);
    let detail = "";
    try {
      detail = JSON.parse(errBody).error?.message || errBody;
    } catch {
      detail = errBody;
    }
    if (response.status === 429) throw new Error("API 限流：請稍等幾秒再試");
    if (response.status === 403) throw new Error("API Key 無效或已過期");
    throw new Error(`Gemini API 錯誤 (${response.status}): ${detail}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Gemini 沒有回傳有效內容");
  return extractJSON(content);
}

/**
 * System prompt v2：注入輸入相關術語 + 回譯欄位。
 * GAS 端有同款模板（google-apps-script.js），改這裡記得同步改那邊。
 */
export function buildSystemPrompt(text, fromLang, toLang, gender) {
  const fromName = fromLang === "zh-TW" ? "中文" : "ไทย";
  const toName = toLang === "zh-TW" ? "中文" : "ไทย";
  const genderHint =
    toLang === "th-TH"
      ? gender === "female"
        ? "說話者是女性，泰文句尾用ค่ะ(陳述)/คะ(疑問)，不要用ครับ。"
        : "說話者是男性，泰文句尾用ครับ。"
      : "";
  const terms = matchGlossary(text, fromLang)
    .map((g) => `${g.zh}=${g.th}`)
    .join(",");

  return `鋁壓鑄工廠翻譯助手。${fromName}→${toName}。口語化、簡短、現場工人聽得懂。${genderHint}
原文可能含台灣口語或語音辨識雜訊，先理解語意再翻。
術語表（優先採用）：${terms}
若語意模糊（代詞不明、動作不具體如「弄一下」「那個」），用clarify格式反問。
只回JSON，不要markdown或code fence：
清晰：{"type":"translate","translated":"譯文","back":"譯文直翻回${fromName}供說話者確認","note":"補充說明(可省略)"}
模糊：{"type":"clarify","question_source":"${fromName}問題","question_target":"${toName}問題","options":[{"source":"選項${fromName}","target":"選項${toName}","value":"明確句子"}]}`;
}

/** Fetch with retry + exponential backoff for 429 errors */
async function fetchWithRetry(url, options, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429 && attempt < maxRetries) {
      const body = await response.clone().text();
      let waitMs = 4000 * (attempt + 1);
      try {
        const retryInfo = JSON.parse(body).error?.details?.find((d) =>
          d["@type"]?.includes("RetryInfo"),
        );
        const sec = parseFloat(retryInfo?.retryDelay);
        if (!isNaN(sec)) waitMs = Math.ceil(sec * 1000) + 500;
      } catch {
        /* use default */
      }
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    return response;
  }
}

/** Extract JSON from model response text (may be wrapped in ```json fence) */
export function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    /* continue */
  }
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return JSON.parse(fenceMatch[1].trim());
  throw new Error("無法解析回傳的 JSON");
}
