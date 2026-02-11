/**
 * UI module - handles DOM interactions
 */

import { speak } from './speech.js';

const $ = (sel) => document.querySelector(sel);

/**
 * Show a screen by id
 */
export function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(`#${id}`).classList.add('active');
}

/**
 * Set mode label text
 */
export function setModeLabel(role) {
    const label = $('#mode-label');
    label.textContent =
        role === 'supervisor'
            ? '主管模式 · 中文 → 泰文'
            : 'โหมดพนักงาน · ไทย → จีน';
}

/**
 * Clear chat area and show placeholder
 */
export function clearChat() {
    const chatArea = $('#chat-area');
    chatArea.innerHTML = `
    <div class="chat-placeholder">
      <div class="placeholder-icon">🎤</div>
      <p>按住下方按鈕開始說話</p>
      <p class="placeholder-sub">กดปุ่มด้านล่างค้างไว้เพื่อพูด</p>
    </div>
  `;
}

/**
 * Remove placeholder if present
 */
function removePlaceholder() {
    const ph = $('.chat-placeholder');
    if (ph) ph.remove();
}

/**
 * Add a source message bubble (what the user said)
 */
export function addSourceBubble(text, lang) {
    removePlaceholder();
    const chatArea = $('#chat-area');
    const labelText = lang === 'zh-TW' ? '你說的' : 'ที่คุณพูด';

    const div = document.createElement('div');
    div.className = 'chat-msg source';
    div.innerHTML = `
    <div class="bubble-label">${labelText}</div>
    <div class="bubble">${escapeHtml(text)}</div>
  `;
    chatArea.appendChild(div);
    scrollToBottom();
}

/**
 * Add a translation result bubble
 */
export function addTranslationBubble(text, lang, note) {
    const chatArea = $('#chat-area');
    const labelText = lang === 'zh-TW' ? '中文翻譯' : 'คำแปลภาษาไทย';

    const div = document.createElement('div');
    div.className = 'chat-msg target';
    div.innerHTML = `
    <div class="bubble-label">${labelText}</div>
    <div class="bubble">
      ${escapeHtml(text)}
      ${note ? `<div style="font-size:12px;opacity:0.7;margin-top:6px;">${escapeHtml(note)}</div>` : ''}
      <button class="play-btn" data-text="${escapeAttr(text)}" data-lang="${lang}">🔊 播放</button>
    </div>
  `;

    const playBtn = div.querySelector('.play-btn');
    playBtn.addEventListener('click', () => {
        speak(text, lang);
    });

    chatArea.appendChild(div);
    scrollToBottom();

    // Auto-play
    speak(text, lang);
}

/**
 * Add clarification question bubble with options
 * @returns {Promise<string>} selected option value
 */
export function addClarifyBubble(data) {
    return new Promise((resolve) => {
        const chatArea = $('#chat-area');

        const div = document.createElement('div');
        div.className = 'chat-msg clarify-msg';

        let optionsHtml = '';
        for (const opt of data.options) {
            optionsHtml += `
        <button class="clarify-option" data-value="${escapeAttr(opt.value)}">
          ${escapeHtml(opt.source)}<br/>
          <span style="opacity:0.7;font-size:13px;">${escapeHtml(opt.target)}</span>
        </button>
      `;
        }

        div.innerHTML = `
      <div class="clarify-bubble">
        <p>${escapeHtml(data.question_source)}</p>
        <p style="opacity:0.7;font-size:13px;">${escapeHtml(data.question_target)}</p>
        <div class="clarify-options">${optionsHtml}</div>
      </div>
    `;

        div.querySelectorAll('.clarify-option').forEach((btn) => {
            btn.addEventListener('click', () => {
                // Disable all buttons
                div.querySelectorAll('.clarify-option').forEach((b) => {
                    b.disabled = true;
                    b.style.opacity = '0.5';
                });
                btn.style.opacity = '1';
                btn.style.border = '2px solid white';
                resolve(btn.dataset.value);
            });
        });

        chatArea.appendChild(div);
        scrollToBottom();
    });
}

/**
 * Show loading indicator
 */
export function showLoading() {
    removePlaceholder();
    const chatArea = $('#chat-area');
    const div = document.createElement('div');
    div.className = 'chat-msg loading-msg';
    div.id = 'loading-indicator';
    div.innerHTML = `
    <div class="loading-dots">
      <span></span><span></span><span></span>
    </div>
  `;
    chatArea.appendChild(div);
    scrollToBottom();
}

/**
 * Hide loading indicator
 */
export function hideLoading() {
    const el = $('#loading-indicator');
    if (el) el.remove();
}

/**
 * Set recording status text
 */
export function setRecordStatus(text, isRecording = false) {
    const statusEl = $('#record-status');
    statusEl.textContent = text;
    statusEl.classList.toggle('recording', isRecording);
}

/**
 * Show/hide settings dialog
 */
export function showSettings(show) {
    $('#settings-dialog').classList.toggle('active', show);
}

/**
 * Show toast message
 */
export function showToast(message, duration = 3000) {
    let toast = $('#toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        toast.id = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

/**
 * Scroll chat to bottom
 */
function scrollToBottom() {
    const chatArea = $('#chat-area');
    requestAnimationFrame(() => {
        chatArea.scrollTop = chatArea.scrollHeight;
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
