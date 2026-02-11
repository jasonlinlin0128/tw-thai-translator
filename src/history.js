/**
 * Translation history - stores past translations in localStorage
 */

const HISTORY_KEY = 'translation_history';
const MAX_ENTRIES = 200;

/**
 * @typedef {Object} HistoryEntry
 * @property {string} id
 * @property {number} timestamp
 * @property {string} role - 'supervisor' | 'worker'
 * @property {string} original
 * @property {string} translated
 * @property {string} fromLang
 * @property {string} toLang
 * @property {string} [note]
 */

function loadAll() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveAll(entries) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

/**
 * Save a translation to history
 * @param {Omit<HistoryEntry, 'id' | 'timestamp'>} entry
 */
export function saveEntry(entry) {
    const entries = loadAll();
    entries.unshift({
        ...entry,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        timestamp: Date.now(),
    });
    // Keep only latest MAX_ENTRIES
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
    saveAll(entries);
}

/**
 * Get all history entries (newest first)
 * @returns {HistoryEntry[]}
 */
export function getHistory() {
    return loadAll();
}

/**
 * Clear all history
 */
export function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
}

/**
 * Format timestamp to readable string
 */
export function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const isToday =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();

    const time = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });

    if (isToday) return `今天 ${time}`;

    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${month}/${day} ${time}`;
}
