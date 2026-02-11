/**
 * Main app logic - orchestrates UI, Speech, and Gemini
 */

import {
    isSpeechSupported,
    startListening,
    stopListening,
    preloadVoices,
} from './speech.js';
import {
    getApiKey,
    analyzeAndTranslate,
    translateClarified,
} from './gemini.js';
import {
    showScreen,
    setModeLabel,
    clearChat,
    addSourceBubble,
    addTranslationBubble,
    addClarifyBubble,
    showLoading,
    hideLoading,
    setRecordStatus,
    showToast,
} from './ui.js';
import { recordRequest, getQuota, canRequest } from './quota.js';

let currentRole = null; // 'supervisor' | 'worker'
let fromLang = 'zh-TW';
let toLang = 'th-TH';
let isRecording = false;
let quotaTimer = null;

const $ = (sel) => document.querySelector(sel);

export function initApp() {
    // Check speech support
    if (!isSpeechSupported()) {
        showToast('此瀏覽器不支援語音辨識，請使用 Chrome');
    }

    preloadVoices();

    // ===== MIC PERMISSION =====
    const micBtn = $('#btn-mic-permission');
    async function checkMicPermission() {
        try {
            const status = await navigator.permissions.query({ name: 'microphone' });
            micBtn.style.display = status.state === 'granted' ? 'none' : '';
            status.onchange = () => {
                micBtn.style.display = status.state === 'granted' ? 'none' : '';
            };
        } catch {
            // Permissions API not supported, show button anyway
            micBtn.style.display = '';
        }
    }
    checkMicPermission();

    micBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Stop the stream immediately, we just needed the permission
            stream.getTracks().forEach((t) => t.stop());
            micBtn.style.display = 'none';
            showToast('✅ 麥克風已授權');
        } catch (err) {
            console.error('Mic permission denied:', err);
            showToast('麥克風授權被拒絕，請在瀏覽器設定中允許');
        }
    });

    // ===== ROLE SELECTION =====
    document.querySelectorAll('.role-card').forEach((card) => {
        card.addEventListener('click', () => {
            currentRole = card.dataset.role;
            if (currentRole === 'supervisor') {
                fromLang = 'zh-TW';
                toLang = 'th-TH';
            } else {
                fromLang = 'th-TH';
                toLang = 'zh-TW';
            }
            setModeLabel(currentRole);
            clearChat();
            showScreen('translate-screen');
            updateRecordStatus();
            startQuotaRefresh();
        });
    });

    // ===== BACK BUTTON =====
    $('#btn-back').addEventListener('click', () => {
        if (isRecording) {
            stopListening();
            isRecording = false;
            setRecordingUI(false);
        }
        stopQuotaRefresh();
        showScreen('role-screen');
    });

    // ===== RECORD BUTTON =====
    const recordBtn = $('#btn-record');

    // Press and hold to record
    let pressTimer = null;
    let didRecord = false;

    const onPressStart = (e) => {
        e.preventDefault();
        if (isRecording) return;

        didRecord = false;
        pressTimer = setTimeout(() => {
            didRecord = true;
            beginRecording();
        }, 150); // Small delay to avoid accidental taps
    };

    const onPressEnd = (e) => {
        e.preventDefault();
        clearTimeout(pressTimer);
        if (didRecord && isRecording) {
            endRecording();
        }
    };

    // Touch events
    recordBtn.addEventListener('touchstart', onPressStart, { passive: false });
    recordBtn.addEventListener('touchend', onPressEnd, { passive: false });
    recordBtn.addEventListener('touchcancel', onPressEnd, { passive: false });

    // Mouse events (for desktop testing)
    recordBtn.addEventListener('mousedown', onPressStart);
    recordBtn.addEventListener('mouseup', onPressEnd);
    recordBtn.addEventListener('mouseleave', onPressEnd);

    // Prevent context menu on long press
    recordBtn.addEventListener('contextmenu', (e) => e.preventDefault());

    // ===== TEXT INPUT =====
    const textInput = $('#text-input');
    const sendBtn = $('#btn-send');

    sendBtn.addEventListener('click', () => {
        const text = textInput.value.trim();
        if (text) {
            textInput.value = '';
            translateText(text);
        }
    });

    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            const text = textInput.value.trim();
            if (text) {
                textInput.value = '';
                translateText(text);
            }
        }
    });
}

// ===== QUOTA UI =====
function updateQuotaUI() {
    const q = getQuota();

    // RPM
    const rpmPct = (q.rpm.remaining / q.rpm.max) * 100;
    const rpmFill = $('#rpm-fill');
    rpmFill.style.width = `${rpmPct}%`;
    rpmFill.className = `quota-fill${rpmPct <= 10 ? ' danger' : rpmPct <= 30 ? ' warn' : ''}`;
    $('#rpm-text').textContent = `${q.rpm.remaining}/${q.rpm.max}`;

    // RPD
    const rpdPct = (q.rpd.remaining / q.rpd.max) * 100;
    const rpdFill = $('#rpd-fill');
    rpdFill.style.width = `${rpdPct}%`;
    rpdFill.className = `quota-fill${rpdPct <= 10 ? ' danger' : rpdPct <= 30 ? ' warn' : ''}`;
    $('#rpd-text').textContent = `${q.rpd.remaining}/${q.rpd.max}`;

    // Cooldown
    const cdEl = $('#quota-cooldown');
    const cdText = $('#cooldown-text');
    if (q.rpm.remaining === 0 && q.rpm.resetInSec > 0) {
        cdEl.style.display = '';
        cdText.textContent = `${q.rpm.resetInSec} 秒後可再使用`;
    } else {
        cdEl.style.display = 'none';
    }
}

function startQuotaRefresh() {
    updateQuotaUI();
    quotaTimer = setInterval(updateQuotaUI, 1000);
}

function stopQuotaRefresh() {
    if (quotaTimer) {
        clearInterval(quotaTimer);
        quotaTimer = null;
    }
}

// ===== RECORD =====
function updateRecordStatus() {
    const text =
        currentRole === 'supervisor'
            ? '按住開始說中文'
            : 'กดค้างเพื่อพูดภาษาไทย';
    setRecordStatus(text);
}

function setRecordingUI(recording) {
    const btn = $('#btn-record');
    btn.classList.toggle('recording', recording);

    if (recording) {
        setRecordStatus(
            currentRole === 'supervisor' ? '🔴 正在聆聽...' : '🔴 กำลังฟัง...',
            true
        );
    } else {
        updateRecordStatus();
    }
}

async function beginRecording() {
    // Pre-flight quota check
    const check = canRequest();
    if (!check.allowed) {
        showToast(check.reason);
        return;
    }

    isRecording = true;
    setRecordingUI(true);

    try {
        const listenPromise = startListening(fromLang);

        // Wait for user to release button (endRecording will be called)
        const text = await listenPromise;

        if (!text) {
            showToast(
                currentRole === 'supervisor'
                    ? '沒有偵測到語音，請再試一次'
                    : 'ไม่พบเสียง กรุณาลองอีกครั้ง'
            );
            return;
        }

        // Show original text
        addSourceBubble(text, fromLang);

        // Show loading
        showLoading();
        setRecordStatus('翻譯中...');

        // Send to Gemini
        const result = await analyzeAndTranslate(text, fromLang, toLang);
        recordRequest();
        updateQuotaUI();
        hideLoading();

        if (result.type === 'clarify') {
            // Show clarification options
            const selectedValue = await addClarifyBubble(result);

            // Translate the selected option
            showLoading();
            setRecordStatus('翻譯中...');
            const translation = await translateClarified(selectedValue, fromLang, toLang);
            recordRequest();
            updateQuotaUI();
            hideLoading();

            addTranslationBubble(translation.translated, toLang, translation.note);
        } else {
            // Direct translation
            addTranslationBubble(result.translated, toLang, result.note);
        }
    } catch (err) {
        hideLoading();
        console.error('Translation error:', err);
        showToast(err.message || '發生錯誤');
    } finally {
        isRecording = false;
        setRecordingUI(false);
        updateQuotaUI();
    }
}

function endRecording() {
    stopListening();
}

/**
 * Translate text input (same flow as voice, without STT)
 */
async function translateText(text) {
    // Pre-flight quota check
    const check = canRequest();
    if (!check.allowed) {
        showToast(check.reason);
        return;
    }

    // Show original text
    addSourceBubble(text, fromLang);

    try {
        showLoading();

        const result = await analyzeAndTranslate(text, fromLang, toLang);
        recordRequest();
        updateQuotaUI();
        hideLoading();

        if (result.type === 'clarify') {
            const selectedValue = await addClarifyBubble(result);

            showLoading();
            const translation = await translateClarified(selectedValue, fromLang, toLang);
            recordRequest();
            updateQuotaUI();
            hideLoading();

            addTranslationBubble(translation.translated, toLang, translation.note);
        } else {
            addTranslationBubble(result.translated, toLang, result.note);
        }
    } catch (err) {
        hideLoading();
        console.error('Translation error:', err);
        showToast(err.message || '發生錯誤');
    } finally {
        updateQuotaUI();
    }
}
