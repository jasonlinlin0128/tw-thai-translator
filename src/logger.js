/**
 * Logger module - sends translation records to Google Sheets
 * Non-blocking: failures are silently logged, never affects user experience
 */

const SHEET_URL_KEY = 'google_sheet_url';
const DEVICE_ID_KEY = 'device_id';

/**
 * Get or create a persistent anonymous device ID
 */
function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

/**
 * Get the configured Google Sheets URL
 */
export function getSheetUrl() {
    return localStorage.getItem(SHEET_URL_KEY) || '';
}

/**
 * Save the Google Sheets URL
 */
export function setSheetUrl(url) {
    if (url) {
        localStorage.setItem(SHEET_URL_KEY, url.trim());
    } else {
        localStorage.removeItem(SHEET_URL_KEY);
    }
}

/**
 * Log a translation to Google Sheets (fire-and-forget)
 * @param {Object} entry
 * @param {string} entry.role - 'supervisor' | 'worker'
 * @param {string} entry.original - source text
 * @param {string} entry.translated - translated text
 * @param {string} entry.fromLang - source language
 * @param {string} entry.toLang - target language
 * @param {string} [entry.type] - 'translate' | 'clarify'
 * @param {string} [entry.note]
 */
export function logTranslation(entry) {
    const url = getSheetUrl();
    if (!url) return; // not configured, skip silently

    const directionMap = {
        'zh-TW→th-TH': '中文→泰文',
        'th-TH→zh-TW': '泰文→中文',
    };

    const payload = {
        timestamp: Date.now(),
        role: entry.role === 'supervisor' ? '主管' : '工人',
        direction: directionMap[`${entry.fromLang}→${entry.toLang}`] || `${entry.fromLang}→${entry.toLang}`,
        original: entry.original,
        translated: entry.translated,
        type: entry.type || 'translate',
        note: entry.note || '',
        deviceId: getDeviceId(),
    };

    // Fire-and-forget: don't await, don't block UI
    fetch(url, {
        method: 'POST',
        mode: 'no-cors', // Apps Script doesn't support CORS preflight
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
    }).catch((err) => {
        console.warn('[Logger] Failed to send to Google Sheets:', err.message);
    });
}
