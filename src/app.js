/**
 * Main app logic - 單畫面雙向對話模式
 *
 * 誰要說話就按住誰的鍵（中文/ไทย），放開即翻譯 + 自動朗讀。
 * 常用句 / 收藏 / 快取命中 → 0 API、離線可用。
 */

import {
  isSpeechSupported,
  startListening,
  stopListening,
  preloadVoices,
  speak,
} from "./speech.js";
import {
  analyzeAndTranslate,
  getBackendUrl,
  getServerQuota,
  QUOTA_EXHAUSTED_MSG,
} from "./gemini.js";
import {
  showScreen,
  addSourceBubble,
  addTranslationBubble,
  addClarifyBubble,
  showLoading,
  hideLoading,
  setRecordStatus,
  showToast,
  escapeHtml,
} from "./ui.js";
import { recordRequest, getQuota, canRequest, resetQuota } from "./quota.js";
import { saveEntry, getHistory, clearHistory, formatTime } from "./history.js";
import { logEvent } from "./logger.js";
import { PHRASES, PHRASE_CATS, GLOSSARY, toFemaleThai } from "./data.js";

const $ = (sel) => document.querySelector(sel);

let gender = localStorage.getItem("voice_gender") || "male";
let isRecording = false;
let currentCat = "fav";

const DEFAULT_STATUS = "按住說話，放開翻譯 / กดค้างเพื่อพูด";
const otherLang = (lang) => (lang === "zh-TW" ? "th-TH" : "zh-TW");
const thOut = (th) => (gender === "female" ? toFemaleThai(th) : th);

// 快捷列精選（依 zh 從句庫撈）
const QUICK_PICKS = [
  "小心燙，不要碰",
  "先停機",
  "這個可以，繼續做",
  "這個要重做",
  "叫技術員來看",
  "今天要加班兩小時",
  "我聽不懂",
  "做完了",
  "有問題，請過來看",
  "等一下",
];

// ===== 收藏 =====
const FAV_KEY = "favorites";
const favKey = (p) => `${p.zh}|${p.th}`;

function getFavs() {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY)) || [];
  } catch {
    return [];
  }
}

function addFav(p) {
  const favs = getFavs().filter((f) => favKey(f) !== favKey(p));
  favs.unshift({ zh: p.zh, th: p.th });
  localStorage.setItem(FAV_KEY, JSON.stringify(favs.slice(0, 30)));
  showToast("⭐ 已收藏，常用句可找到", 1500);
  renderQuickStrip();
}

function removeFav(p) {
  localStorage.setItem(
    FAV_KEY,
    JSON.stringify(getFavs().filter((f) => favKey(f) !== favKey(p))),
  );
  renderQuickStrip();
}

// ===== App init =====
export function initApp() {
  if (!isSpeechSupported()) {
    showToast("此瀏覽器不支援語音辨識，請使用 Chrome");
  }
  preloadVoices();

  // header
  $("#btn-menu").addEventListener("click", () => openSettings());
  $("#btn-history").addEventListener("click", () => {
    renderHistory();
    showScreen("history-screen");
  });
  const genderBtn = $("#btn-gender");
  const renderGender = () => {
    genderBtn.textContent = gender === "female" ? "👩 ค่ะ" : "👨 ครับ";
  };
  renderGender();
  genderBtn.addEventListener("click", () => {
    gender = gender === "female" ? "male" : "female";
    localStorage.setItem("voice_gender", gender);
    renderGender();
    showToast(
      gender === "female"
        ? "泰文語尾改用 ค่ะ（女性）"
        : "泰文語尾改用 ครับ（男性）",
      1500,
    );
  });

  // 錄音雙鍵
  bindRecordButton($("#btn-rec-zh"), "zh-TW");
  bindRecordButton($("#btn-rec-th"), "th-TH");
  setRecordStatus(DEFAULT_STATUS);

  // 文字輸入：依字元自動判斷中/泰
  const textInput = $("#text-input");
  const sendText = () => {
    const text = textInput.value.trim();
    if (!text) return;
    textInput.value = "";
    // 含泰文字母（U+0E00–U+0E7F）就當泰文輸入
    const fromLang = /[฀-๿]/.test(text) ? "th-TH" : "zh-TW";
    runTranslation(text, fromLang);
  };
  $("#btn-send").addEventListener("click", sendText);
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      sendText();
    }
  });

  // 常用句
  $("#btn-phrasebook").addEventListener("click", () => {
    openPhrasebook();
  });
  $("#btn-pb-back").addEventListener("click", () => showScreen("main-screen"));
  $("#pb-search").addEventListener("input", (e) =>
    renderPhrasebook(currentCat, e.target.value.trim()),
  );
  renderQuickStrip();

  // 紀錄
  $("#btn-history-back").addEventListener("click", () =>
    showScreen("main-screen"),
  );
  $("#history-search-input").addEventListener("input", (e) =>
    renderHistory(e.target.value.trim()),
  );
  $("#btn-export-history").addEventListener("click", exportHistory);
  $("#btn-clear-history").addEventListener("click", () => {
    if (confirm("確定要清除所有翻譯紀錄？\nล้างประวัติทั้งหมด?")) {
      clearHistory();
      renderHistory();
      showToast("紀錄已清除");
    }
  });
  // 紀錄雙語重播
  $("#history-list").addEventListener("click", (e) => {
    const playBtn = e.target.closest(".hist-play-zh, .hist-play-th");
    if (!playBtn || !e.currentTarget.contains(playBtn)) return;
    const entry = getHistory()[Number(playBtn.dataset.idx)];
    if (!entry) return;

    const playZh = playBtn.classList.contains("hist-play-zh");
    const text = playZh
      ? entry.fromLang === "zh-TW"
        ? entry.original
        : entry.translated
      : entry.fromLang === "zh-TW"
        ? entry.translated
        : entry.original;
    speak(text, playZh ? "zh-TW" : "th-TH", gender);
  });

  initSettings();
  initOffline();
  updateQuotaChip();
}

// ===== 錄音 =====
function bindRecordButton(btn, fromLang) {
  let pressTimer = null;
  let didRecord = false;

  const onStart = (e) => {
    e.preventDefault();
    if (isRecording) return;
    didRecord = false;
    pressTimer = setTimeout(() => {
      didRecord = true;
      beginRecording(btn, fromLang);
    }, 150); // 避免誤觸
  };
  const onEnd = (e) => {
    e.preventDefault();
    clearTimeout(pressTimer);
    if (didRecord && isRecording) stopListening();
  };

  btn.addEventListener("touchstart", onStart, { passive: false });
  btn.addEventListener("touchend", onEnd, { passive: false });
  btn.addEventListener("touchcancel", onEnd, { passive: false });
  btn.addEventListener("mousedown", onStart);
  btn.addEventListener("mouseup", onEnd);
  btn.addEventListener("mouseleave", onEnd);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}

async function beginRecording(btn, fromLang) {
  if (!navigator.onLine) {
    showToast("離線中無法翻譯，可先用常用句");
    return;
  }
  isRecording = true;
  btn.classList.add("recording");
  setRecordStatus(
    fromLang === "zh-TW" ? "🔴 正在聆聽..." : "🔴 กำลังฟัง...",
    true,
  );

  try {
    const text = await startListening(fromLang);
    if (!text) {
      showToast(
        fromLang === "zh-TW"
          ? "沒有聽到聲音，請再試一次"
          : "ไม่ได้ยินเสียง ลองอีกครั้ง",
      );
      return;
    }
    await runTranslation(text, fromLang);
  } catch (err) {
    console.error("STT error:", err);
    showToast("語音辨識失敗，請再試一次");
  } finally {
    isRecording = false;
    btn.classList.remove("recording");
    setRecordStatus(DEFAULT_STATUS);
  }
}

// ===== 翻譯管線（語音 / 文字共用；clarify 遞迴） =====
async function runTranslation(text, fromLang) {
  const toLang = otherLang(fromLang);

  // Direct 模式才做本機額度預檢（proxy 模式由後端把關）
  if (!getBackendUrl()) {
    const check = canRequest();
    if (!check.allowed) {
      showToast(check.reason);
      return;
    }
  }

  addSourceBubble(text, fromLang);

  try {
    let current = text;
    for (let depth = 0; depth < 3; depth++) {
      showLoading();
      const result = await analyzeAndTranslate(
        current,
        fromLang,
        toLang,
        gender,
      );
      hideLoading();
      if (result.via === "direct") recordRequest();
      updateQuotaChip();

      if (result.type === "clarify") {
        current = await addClarifyBubble(result);
        continue;
      }
      presentTranslation(current, result, fromLang, toLang);
      return;
    }
    showToast("無法確定語意，請換個說法");
  } catch (err) {
    hideLoading();
    console.error("Translation error:", err);
    handleTranslateError(err);
  }
}

function presentTranslation(original, result, fromLang, toLang) {
  addTranslationBubble({
    text: result.translated,
    lang: toLang,
    back: result.back,
    note: result.note,
    gender,
    onFeedback: (good) =>
      logEvent(good ? "feedback-good" : "feedback-bad", {
        original,
        translated: result.translated,
        fromLang,
        toLang,
      }),
    onStar: () =>
      addFav(
        fromLang === "zh-TW"
          ? { zh: original, th: result.translated }
          : { zh: result.translated, th: original },
      ),
  });
  saveEntry({
    original,
    translated: result.translated,
    fromLang,
    toLang,
    note: result.note,
  });
  // proxy 模式由 GAS 落表；cache/direct 由前端補報
  if (result.via === "cache")
    logEvent("cache", {
      original,
      translated: result.translated,
      fromLang,
      toLang,
    });
  else if (result.via === "direct")
    logEvent("translate", {
      original,
      translated: result.translated,
      fromLang,
      toLang,
    });
}

function handleTranslateError(err) {
  const msg = err.message || "";
  if (msg === QUOTA_EXHAUSTED_MSG) {
    showToast(msg, 4000);
    openPhrasebook(); // 額度沒了 → 引導用常用句
    return;
  }
  if (msg.includes("限流") || msg.includes("429"))
    return showToast("翻譯太頻繁，請稍等幾秒再試", 3000, true);
  if (msg.toLowerCase().includes("api key"))
    return showToast("API Key 有問題，請聯繫管理員", 3000, true);
  if (msg.includes("後端"))
    return showToast(`${msg}，請再試一次`, 3000, true);
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError"))
    return showToast("網路連線失敗，請檢查網路", 3000, true);
  showToast("翻譯失敗，請再試一次", 3000, true);
}

// ===== 常用句 =====
// 插入對話：畫面同時顯示中泰兩邊，語音播 playLang（預設泰文 — 泰籍同仁靠聽、台籍同仁看字）
function usePhrase(p, playLang = "th-TH") {
  const th = thOut(p.th);
  const fromLang = playLang === "th-TH" ? "zh-TW" : "th-TH";
  const source = fromLang === "zh-TW" ? p.zh : th;
  const target = playLang === "th-TH" ? th : p.zh;

  showScreen("main-screen");
  addSourceBubble(source, fromLang);
  addTranslationBubble({
    text: target,
    lang: playLang,
    gender,
    onStar: () => addFav(p),
  });
  saveEntry({
    original: source,
    translated: target,
    fromLang,
    toLang: playLang,
  });
  logEvent("phrase", {
    original: source,
    translated: target,
    fromLang,
    toLang: playLang,
  });
}

function renderQuickStrip() {
  const scroll = $("#quick-scroll");
  const favs = getFavs().slice(0, 5);
  const picks = QUICK_PICKS.map((zh) =>
    PHRASES.find((p) => p.zh === zh),
  ).filter(Boolean);
  const items = [
    ...favs.map((p) => ({ ...p, fav: true })),
    ...picks.filter((p) => !favs.some((f) => favKey(f) === favKey(p))),
  ];
  scroll.innerHTML = items
    .map(
      (p, i) =>
        `<button class="quick-phrase-btn" data-i="${i}">${p.fav ? "⭐" : ""}${escapeHtml(p.zh)}</button>`,
    )
    .join("");
  scroll.querySelectorAll(".quick-phrase-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      usePhrase(items[Number(btn.dataset.i)]),
    );
  });
}

function openPhrasebook() {
  if (currentCat === "fav" && getFavs().length === 0) currentCat = "safety";
  $("#pb-search").value = "";
  renderPhrasebookCats();
  renderPhrasebook(currentCat, "");
  showScreen("phrasebook-screen");
}

function renderPhrasebookCats() {
  const cats = [
    { id: "fav", zh: "收藏", th: "รายการโปรด", icon: "⭐" },
    ...PHRASE_CATS,
    { id: "terms", zh: "術語", th: "ศัพท์เทคนิค", icon: "🔧" },
  ];
  const el = $("#pb-cats");
  el.innerHTML = cats
    .map(
      (c) =>
        `<button class="pb-cat-chip ${c.id === currentCat ? "active" : ""}" data-cat="${c.id}">${c.icon} ${c.zh}<span class="pb-cat-th">${c.th}</span></button>`,
    )
    .join("");
  el.querySelectorAll(".pb-cat-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      currentCat = chip.dataset.cat;
      renderPhrasebookCats();
      renderPhrasebook(currentCat, $("#pb-search").value.trim());
    });
  });
}

function renderPhrasebook(catId, query) {
  const list = $("#pb-list");
  let items;
  if (query) {
    const q = query.toLowerCase();
    items = [...PHRASES, ...GLOSSARY, ...getFavs()].filter(
      (p) => p.zh.toLowerCase().includes(q) || p.th.includes(q),
    );
  } else if (catId === "fav") {
    items = getFavs().map((p) => ({ ...p, fav: true }));
  } else if (catId === "terms") {
    items = GLOSSARY;
  } else {
    items = PHRASES.filter((p) => p.cat === catId);
  }

  if (items.length === 0) {
    list.innerHTML = `<div class="history-empty"><p>${query ? "找不到 / ไม่พบ" : "還沒有收藏，點翻譯結果的 ⭐ 加入"}</p></div>`;
    return;
  }

  list.innerHTML = items
    .map(
      (p, i) => `
      <div class="pb-row" data-i="${i}">
        <div class="pb-texts">
          <div class="pb-zh">${escapeHtml(p.zh)}</div>
          <div class="pb-th">${escapeHtml(thOut(p.th))}</div>
        </div>
        <div class="pb-actions">
          <button class="pb-play-zh" data-i="${i}" title="播中文給台籍同仁聽">🔊 中</button>
          ${p.fav ? `<button class="pb-remove" data-i="${i}" title="移除收藏">✕</button>` : ""}
        </div>
      </div>`,
    )
    .join("");

  list.querySelectorAll(".pb-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".pb-actions")) return;
      usePhrase(items[Number(row.dataset.i)]);
    });
  });
  list.querySelectorAll(".pb-play-zh").forEach((btn) => {
    btn.addEventListener("click", () =>
      usePhrase(items[Number(btn.dataset.i)], "zh-TW"),
    );
  });
  list.querySelectorAll(".pb-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeFav(items[Number(btn.dataset.i)]);
      renderPhrasebook("fav", "");
    });
  });
}

// ===== 額度顯示 =====
function updateQuotaChip() {
  const chip = $("#quota-chip");
  const sq = getServerQuota();
  let remaining, max;
  if (sq) {
    remaining = Math.max(0, sq.max - sq.used);
    max = sq.max;
  } else if (!getBackendUrl()) {
    const q = getQuota();
    remaining = q.rpd.remaining;
    max = q.rpd.max;
  } else {
    chip.style.display = "none"; // proxy 模式第一次翻譯前未知
    return;
  }
  chip.style.display = "";
  chip.textContent = `今日 ${remaining}/${max}`;
  chip.classList.toggle("danger", remaining / max <= 0.1);
}

// ===== 設定 =====
function initSettings() {
  const dialog = $("#settings-dialog");
  const urlInput = $("#sheet-url-input");
  const status = $("#sheet-status");

  $("#btn-settings-close").addEventListener(
    "click",
    () => (dialog.style.display = "none"),
  );
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.style.display = "none";
  });

  // 主題
  const themeBtn = $("#btn-theme");
  const applyTheme = (dark) => {
    if (dark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    themeBtn.textContent = dark ? "☀️ 切換淺色模式" : "🌙 切換深色模式";
    localStorage.setItem("theme", dark ? "dark" : "light");
  };
  applyTheme(localStorage.getItem("theme") === "dark");
  themeBtn.addEventListener("click", () =>
    applyTheme(document.documentElement.dataset.theme !== "dark"),
  );

  // 後端網址（僅存手動覆蓋；空值 = 用 build 內建）
  $("#btn-sheet-save").addEventListener("click", () => {
    const url = urlInput.value.trim();
    if (url && !url.startsWith("https://script.google.com/")) {
      status.textContent = "❌ 網址應以 https://script.google.com/ 開頭";
      status.style.color = "#ef4444";
      return;
    }
    if (url) localStorage.setItem("google_sheet_url", url);
    else localStorage.removeItem("google_sheet_url");
    status.style.color = "";
    status.textContent = url ? "✅ 已儲存" : "已清除（使用內建設定）";
    updateQuotaChip();
  });

  // 本機額度重置（direct 模式用）
  $("#btn-reset-quota").addEventListener("click", () => {
    resetQuota();
    updateQuotaChip();
    showToast("本機額度計數已重置");
  });

  // 麥克風授權（PWA standalone 需要）
  const micBtn = $("#btn-mic-permission");
  async function checkMicPermission() {
    try {
      const st = await navigator.permissions.query({ name: "microphone" });
      micBtn.style.display = st.state === "granted" ? "none" : "";
      st.onchange = () => {
        micBtn.style.display = st.state === "granted" ? "none" : "";
      };
    } catch {
      micBtn.style.display = "";
    }
  }
  checkMicPermission();
  micBtn.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      micBtn.style.display = "none";
      showToast("✅ 麥克風已授權");
    } catch {
      showToast("麥克風授權被拒絕，請在瀏覽器設定中允許");
    }
  });

  function openSettingsDialog() {
    urlInput.value = localStorage.getItem("google_sheet_url") || "";
    status.textContent = getBackendUrl() ? "✅ 後端已連線設定" : "";
    status.style.color = "";
    checkMicPermission();
    dialog.style.display = "flex";
  }
  openSettings = openSettingsDialog; // 讓 header 按鈕呼叫
}

let openSettings = () => {};

// ===== 離線 =====
function initOffline() {
  const banner = $("#offline-banner");
  const update = () => {
    banner.style.display = navigator.onLine ? "none" : "";
  };
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

// ===== 紀錄 =====
function renderHistory(search = "") {
  const list = $("#history-list");
  let entries = getHistory();
  const all = entries;

  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.original.toLowerCase().includes(q) ||
        e.translated.toLowerCase().includes(q),
    );
  }

  if (entries.length === 0) {
    list.innerHTML = `
      <div class="history-empty">
        <p>${search ? "找不到結果" : "📝 還沒有翻譯紀錄"}</p>
        <p class="placeholder-sub">${search ? "ไม่พบผลลัพธ์" : "ยังไม่มีประวัติ"}</p>
      </div>
    `;
    return;
  }

  list.innerHTML = entries
    .map((e) => {
      const isZh = e.fromLang === "zh-TW";
      const idx = all.indexOf(e);
      return `
        <div class="history-entry" data-idx="${idx}">
          <div class="history-meta">
            <span class="history-role ${isZh ? "zh" : "th"}">${isZh ? "中文" : "ไทย"}</span>
            <span>${formatTime(e.timestamp)}</span>
          </div>
          <div class="history-original">${escapeHtml(e.original)}</div>
          <div class="history-translated">${escapeHtml(e.translated)}</div>
          ${e.note ? `<div class="history-note">${escapeHtml(e.note)}</div>` : ""}
          <div class="history-actions">
            <button class="hist-play-zh" data-idx="${idx}" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H2v6h4l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              <span>中文</span>
            </button>
            <button class="hist-play-th" data-idx="${idx}" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H2v6h4l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              <span>ไทย</span>
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

function exportHistory() {
  const entries = getHistory();
  if (entries.length === 0) {
    showToast("沒有紀錄可匯出");
    return;
  }
  const BOM = "﻿"; // U+FEFF（隱形字元），讓 Excel 認出 UTF-8
  const header = "時間,說話方,原文,譯文\n";
  const esc = (s) => `"${(s || "").replace(/"/g, '""')}"`;
  const rows = entries
    .map((e) =>
      [
        esc(formatTime(e.timestamp)),
        esc(e.fromLang === "zh-TW" ? "中文" : "泰文"),
        esc(e.original),
        esc(e.translated),
      ].join(","),
    )
    .join("\n");
  const blob = new Blob([BOM + header + rows], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `翻譯紀錄_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("已匯出 CSV");
}
