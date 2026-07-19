/**
 * UI module - handles DOM interactions
 */

import { speak } from "./speech.js";

const $ = (sel) => document.querySelector(sel);

/** Show a screen by id */
export function showScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  $(`#${id}`).classList.add("active");
}

/** Clear chat area and show placeholder */
export function clearChat() {
  $("#chat-area").innerHTML = `
    <div class="chat-placeholder">
      <div class="placeholder-icon">🎤</div>
      <p>按住下方按鈕說話<br/>或點常用句、輸入文字</p>
      <p class="placeholder-sub">กดปุ่มค้างไว้เพื่อพูด<br/>หรือแตะวลีสำเร็จรูป</p>
    </div>
  `;
}

function removePlaceholder() {
  const ph = $(".chat-placeholder");
  if (ph) ph.remove();
}

/** Add a source message bubble (what the user said) */
export function addSourceBubble(text, lang) {
  removePlaceholder();
  const chatArea = $("#chat-area");
  const div = document.createElement("div");
  div.className = "chat-msg source";
  div.innerHTML = `
    <div class="bubble-label">🎤 ${lang === "zh-TW" ? "中文" : "ไทย"}</div>
    <div class="bubble">${escapeHtml(text)}</div>
  `;
  chatArea.appendChild(div);
  scrollToBottom();
}

/**
 * Add a translation result bubble.
 * @param {Object} opts
 *  - text, lang, gender
 *  - back: 回譯（顯示給說話者確認）
 *  - note: 補充說明
 *  - onFeedback(good:boolean), onStar() — 省略則不顯示該按鈕
 */
export function addTranslationBubble(opts) {
  const { text, lang, back, note, gender = "male", onFeedback, onStar } = opts;
  removePlaceholder();
  const chatArea = $("#chat-area");
  const div = document.createElement("div");
  div.className = "chat-msg target";
  div.innerHTML = `
    <div class="bubble-label">${lang === "zh-TW" ? "→ 中文" : "→ ไทย"}</div>
    <div class="bubble translation-bubble">
      <div class="translation-text ${lang === "th-TH" ? "th-text" : ""}">${escapeHtml(text)}</div>
      ${back ? `<div class="back-text">↩ ${escapeHtml(back)}</div>` : ""}
      ${note ? `<div class="note-text">${escapeHtml(note)}</div>` : ""}
      <div class="bubble-actions">
        <button class="action-btn play-btn">🔊 播放</button>
        <button class="action-btn copy-btn">📋</button>
        ${onStar ? `<button class="action-btn star-btn" title="收藏">⭐</button>` : ""}
        ${
          onFeedback
            ? `<button class="action-btn fb-btn fb-good" title="翻得好">👍</button>
        <button class="action-btn fb-btn fb-bad" title="翻錯了">👎</button>`
            : ""
        }
      </div>
    </div>
  `;

  div
    .querySelector(".play-btn")
    .addEventListener("click", () => speak(text, lang, gender));
  div.querySelector(".copy-btn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("已複製 / คัดลอกแล้ว", 1500);
    } catch {
      showToast("複製失敗");
    }
  });

  if (onStar) {
    div.querySelector(".star-btn").addEventListener("click", (e) => {
      onStar();
      e.target.classList.add("done");
    });
  }
  if (onFeedback) {
    const goodBtn = div.querySelector(".fb-good");
    const badBtn = div.querySelector(".fb-bad");
    const doneFb = (good) => {
      onFeedback(good);
      goodBtn.disabled = badBtn.disabled = true;
      (good ? badBtn : goodBtn).classList.add("dim");
      showToast("已回報，謝謝！/ ขอบคุณสำหรับความคิดเห็น", 1500);
    };
    goodBtn.addEventListener("click", () => doneFb(true));
    badBtn.addEventListener("click", () => doneFb(false));
  }

  chatArea.appendChild(div);
  scrollToBottom();

  speak(text, lang, gender); // auto-play
}

/**
 * Add clarification question bubble with options
 * @returns {Promise<string>} selected option value
 */
export function addClarifyBubble(data) {
  return new Promise((resolve) => {
    const chatArea = $("#chat-area");
    const div = document.createElement("div");
    div.className = "chat-msg clarify-msg";

    let optionsHtml = "";
    for (const opt of data.options || []) {
      optionsHtml += `
        <button class="clarify-option" data-value="${escapeAttr(opt.value)}">
          ${escapeHtml(opt.source)}<br/>
          <span class="clarify-target">${escapeHtml(opt.target)}</span>
        </button>
      `;
    }

    div.innerHTML = `
      <div class="clarify-bubble">
        <p>${escapeHtml(data.question_source)}</p>
        <p class="clarify-target">${escapeHtml(data.question_target)}</p>
        <div class="clarify-options">${optionsHtml}</div>
      </div>
    `;

    div.querySelectorAll(".clarify-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        div.querySelectorAll(".clarify-option").forEach((b) => {
          b.disabled = true;
          b.style.opacity = "0.5";
        });
        btn.style.opacity = "1";
        btn.style.border = "2px solid white";
        resolve(btn.dataset.value);
      });
    });

    chatArea.appendChild(div);
    scrollToBottom();
  });
}

/** Show loading indicator */
export function showLoading() {
  removePlaceholder();
  const div = document.createElement("div");
  div.className = "chat-msg loading-msg";
  div.id = "loading-indicator";
  div.innerHTML = `<div class="loading-dots"><span></span><span></span><span></span></div>`;
  $("#chat-area").appendChild(div);
  scrollToBottom();
}

/** Hide loading indicator */
export function hideLoading() {
  const el = $("#loading-indicator");
  if (el) el.remove();
}

/** Set recording status text */
export function setRecordStatus(text, isRecording = false) {
  const statusEl = $("#record-status");
  statusEl.textContent = text;
  statusEl.classList.toggle("recording", isRecording);
}

/** Show toast message */
export function showToast(message, duration = 3000, isError = false) {
  let toast = $("#toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), duration);
}

function scrollToBottom() {
  const chatArea = $("#chat-area");
  requestAnimationFrame(() => {
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str ?? "")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
