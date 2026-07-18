/**
 * Google Apps Script v2 - 中泰翻譯後端
 * 同一個部署同時是：翻譯 proxy（API key 不進前端）、共用每日額度、
 * 伺服器快取、使用紀錄收集、回饋收集。
 *
 * ===== 部署方式 =====
 * 1. 開一個新的 Google Sheets（或沿用現有收集表）
 * 2. 「擴充功能」→「Apps Script」，貼上本檔全部內容
 * 3. 左側「專案設定」→「指令碼屬性」新增：
 *    - GEMINI_API_KEY = 你的 Gemini API key（必填）
 *    - DAILY_LIMIT    = 每日翻譯上限（選填，預設 250；升級付費方案後調大）
 * 4. 「部署」→「新增部署作業」→ 類型「網頁應用程式」
 *    - 執行身分：「我」；誰可以存取：「所有人」
 * 5. 複製網址，填到 GitHub repo 的 Actions variable `VITE_BACKEND_URL`
 *    （Settings → Secrets and variables → Actions → Variables），重跑 deploy
 *    → 所有使用者零設定即用。個別裝置也可在 App 設定裡手動貼網址。
 * 6. 之後前端已不需要 Gemini key：把 repo secret VITE_GEMINI_API_KEY 刪除
 *    並到 Google AI Studio 把舊 key 作廢（它曾打包在公開網頁裡）。
 *
 * ⚠️ 改了程式碼要「部署」→「管理部署作業」→ 編輯 → 新版本，網址才會更新內容。
 */

var TZ = "Asia/Taipei";
var GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// ===== HTTP 入口 =====

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === "translate") return json(handleTranslate(data));
    if (data.action === "log") return json(handleLog(data));
    return json({ ok: false, error: "unknown action" });
  } catch (err) {
    return json({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  }
}

function doGet() {
  return json({
    status: "ok",
    message: "中泰翻譯後端 v2 運作中",
    quota: getQuota(),
  });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// ===== 翻譯 proxy =====

function handleTranslate(data) {
  // 邊界驗證（這是對外端點）
  var text = String(data.text || "").slice(0, 1000);
  var terms = String(data.terms || "").slice(0, 3000);
  var gender = data.gender === "female" ? "female" : "male";
  var from = data.from,
    to = data.to;
  var langs = ["zh-TW", "th-TH"];
  if (!text.trim()) return { ok: false, error: "empty text" };
  if (langs.indexOf(from) < 0 || langs.indexOf(to) < 0 || from === to)
    return { ok: false, error: "bad lang pair" };

  // 伺服器快取（不耗額度）
  var cacheKey =
    "t_" +
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      from + "|" + gender + "|" + text,
      Utilities.Charset.UTF_8,
    )
      .map(function (b) {
        return ((b & 0xff) + 0x100).toString(16).slice(1);
      })
      .join("");
  var cache = CacheService.getScriptCache();
  var hit = cache.get(cacheKey);
  if (hit) {
    var cachedResult = JSON.parse(hit);
    appendLog({
      timestamp: Date.now(),
      speaker: from === "zh-TW" ? "中文" : "泰文",
      direction: dirLabel(from, to),
      original: text,
      translated: cachedResult.translated || "",
      type: "translate-cached",
      note: cachedResult.note || "",
      deviceId: data.deviceId || "",
    });
    return { ok: true, result: cachedResult, quota: getQuota(), cached: true };
  }

  // 共用每日額度（LockService 防併發超量）
  var quotaCheck = tryConsumeQuota();
  if (!quotaCheck.allowed)
    return { ok: false, error: "quota_exceeded", quota: quotaCheck.quota };

  var result = callGemini(text, from, to, gender, terms);

  if (result.type === "translate" && result.translated) {
    cache.put(cacheKey, JSON.stringify(result), 21600); // 6h
  }

  appendLog({
    timestamp: Date.now(),
    speaker: from === "zh-TW" ? "中文" : "泰文",
    direction: dirLabel(from, to),
    original: text,
    translated: result.translated || "",
    type: result.type || "translate",
    note: result.note || "",
    deviceId: data.deviceId || "",
  });

  return { ok: true, result: result, quota: getQuota(), cached: false };
}

function callGemini(text, from, to, gender, terms) {
  var key =
    PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!key) throw new Error("後端未設定 GEMINI_API_KEY（指令碼屬性）");

  // 與前端 src/gemini.js buildSystemPrompt 同款模板（terms 由前端比對後帶上來）
  var fromName = from === "zh-TW" ? "中文" : "ไทย";
  var toName = to === "zh-TW" ? "中文" : "ไทย";
  var genderHint =
    to === "th-TH"
      ? gender === "female"
        ? "說話者是女性，泰文句尾用ค่ะ(陳述)/คะ(疑問)，不要用ครับ。"
        : "說話者是男性，泰文句尾用ครับ。"
      : "";
  var prompt =
    "鋁壓鑄工廠翻譯助手。" +
    fromName +
    "→" +
    toName +
    "。口語化、簡短、現場工人聽得懂。" +
    genderHint +
    "\n原文可能含台灣口語或語音辨識雜訊，先理解語意再翻。" +
    "\n術語表（優先採用）：" +
    terms +
    "\n若語意模糊（代詞不明、動作不具體如「弄一下」「那個」），用clarify格式反問。" +
    "\n只回JSON，不要markdown或code fence：" +
    '\n清晰：{"type":"translate","translated":"譯文","back":"譯文直翻回' +
    fromName +
    '供說話者確認","note":"補充說明(可省略)"}' +
    '\n模糊：{"type":"clarify","question_source":"' +
    fromName +
    '問題","question_target":"' +
    toName +
    '問題","options":[{"source":"選項' +
    fromName +
    '","target":"選項' +
    toName +
    '","value":"明確句子"}]}';

  var res = UrlFetchApp.fetch(GEMINI_URL + "?key=" + key, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      system_instruction: { parts: [{ text: prompt }] },
      contents: [{ role: "user", parts: [{ text: text }] }],
      generationConfig: {
        temperature: 0.3,
        thinkingConfig: { thinkingBudget: 256 },
      },
    }),
  });

  var code = res.getResponseCode();
  if (code !== 200) {
    var detail = "";
    try {
      detail = JSON.parse(res.getContentText()).error.message;
    } catch (e) {
      detail = res.getContentText().slice(0, 200);
    }
    throw new Error("Gemini " + code + ": " + detail);
  }

  var body = JSON.parse(res.getContentText());
  var content =
    body.candidates &&
    body.candidates[0] &&
    body.candidates[0].content &&
    body.candidates[0].content.parts &&
    body.candidates[0].content.parts[0] &&
    body.candidates[0].content.parts[0].text;
  if (!content) throw new Error("Gemini 沒有回傳有效內容");

  return extractJSON(content);
}

function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    var m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) return JSON.parse(m[1].trim());
    throw new Error("無法解析模型回傳的 JSON");
  }
}

// ===== 共用每日額度 =====

function todayKey() {
  return "usage_" + Utilities.formatDate(new Date(), TZ, "yyyyMMdd");
}

function getLimit() {
  var v = PropertiesService.getScriptProperties().getProperty("DAILY_LIMIT");
  return v ? parseInt(v, 10) : 250;
}

function getQuota() {
  var used = parseInt(
    PropertiesService.getScriptProperties().getProperty(todayKey()) || "0",
    10,
  );
  return { used: used, max: getLimit() };
}

function tryConsumeQuota() {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var props = PropertiesService.getScriptProperties();
    var key = todayKey();
    var used = parseInt(props.getProperty(key) || "0", 10);
    var max = getLimit();
    if (used >= max) return { allowed: false, quota: { used: used, max: max } };
    if (used === 0) cleanupOldUsageKeys(props, key); // 跨日第一筆順手清舊 key
    props.setProperty(key, String(used + 1));
    return { allowed: true, quota: { used: used + 1, max: max } };
  } finally {
    lock.releaseLock();
  }
}

function cleanupOldUsageKeys(props, todayK) {
  props.getKeys().forEach(function (k) {
    if (k.indexOf("usage_") === 0 && k !== todayK) props.deleteProperty(k);
  });
}

// ===== 使用紀錄 =====

function dirLabel(from, to) {
  if (from === "zh-TW" && to === "th-TH") return "中文→泰文";
  if (from === "th-TH" && to === "zh-TW") return "泰文→中文";
  return from + "→" + to;
}

function handleLog(data) {
  appendLog(data);
  return { ok: true };
}

function appendLog(entry) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "時間",
        "說話方",
        "語言方向",
        "原文",
        "譯文",
        "類型",
        "備註",
        "裝置ID",
      ]);
      sheet.setFrozenRows(1);
      var header = sheet.getRange(1, 1, 1, 8);
      header.setFontWeight("bold");
      header.setBackground("#4285f4");
      header.setFontColor("#ffffff");
    }
    sheet.appendRow([
      Utilities.formatDate(
        new Date(entry.timestamp || Date.now()),
        TZ,
        "yyyy/MM/dd HH:mm:ss",
      ),
      entry.speaker || entry.role || "",
      entry.direction || "",
      entry.original || "",
      entry.translated || "",
      entry.type || "translate",
      entry.note || "",
      entry.deviceId || "",
    ]);
  } catch (err) {
    // log 失敗不影響翻譯回應
    console.error("appendLog failed: " + err);
  }
}
