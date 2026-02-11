/**
 * API usage quota tracker (client-side)
 *
 * Gemini 2.0 Flash free tier:
 * - 15 RPM (requests per minute)
 * - 1,500 RPD (requests per day)
 *
 * We track usage locally and show remaining quota on UI.
 * Note: if the user clears localStorage, counts reset (conservative approach).
 */

const STORAGE_KEY = 'gemini_usage';
const MAX_RPM = 15;
const MAX_RPD = 1500;

function getUsageData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function saveUsageData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function now() {
    return Date.now();
}

function startOfDay() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

/**
 * Clean up expired minute-window timestamps
 */
function cleanData(data) {
    const oneMinuteAgo = now() - 60_000;
    const todayStart = startOfDay();

    // Remove minute entries older than 1 minute
    data.minuteTimestamps = data.minuteTimestamps.filter((t) => t > oneMinuteAgo);

    // Reset daily count if it's a new day
    if (data.dayStart !== todayStart) {
        data.dayStart = todayStart;
        data.dayCount = 0;
    }

    return data;
}

/**
 * Get or initialize usage data
 */
function getCleanUsage() {
    let data = getUsageData();
    if (!data) {
        data = {
            minuteTimestamps: [],
            dayStart: startOfDay(),
            dayCount: 0,
        };
    }
    return cleanData(data);
}

/**
 * Record one API request
 */
export function recordRequest() {
    const data = getCleanUsage();
    data.minuteTimestamps.push(now());
    data.dayCount++;
    saveUsageData(data);
}

/**
 * Get remaining quota info
 * @returns {{ rpm: { used, max, remaining, resetInSec }, rpd: { used, max, remaining } }}
 */
export function getQuota() {
    const data = getCleanUsage();

    const rpmUsed = data.minuteTimestamps.length;
    const rpmRemaining = Math.max(0, MAX_RPM - rpmUsed);

    // Calculate seconds until oldest request in the window expires
    let resetInSec = 0;
    if (rpmUsed > 0 && rpmRemaining === 0) {
        const oldest = Math.min(...data.minuteTimestamps);
        resetInSec = Math.max(0, Math.ceil((oldest + 60_000 - now()) / 1000));
    }

    const rpdUsed = data.dayCount;
    const rpdRemaining = Math.max(0, MAX_RPD - rpdUsed);

    return {
        rpm: { used: rpmUsed, max: MAX_RPM, remaining: rpmRemaining, resetInSec },
        rpd: { used: rpdUsed, max: MAX_RPD, remaining: rpdRemaining },
    };
}

/**
 * Check if we can make a request (pre-flight check)
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canRequest() {
    const q = getQuota();
    if (q.rpd.remaining <= 0) {
        return { allowed: false, reason: '今日 API 額度已用完（1,500次/天），明天重置' };
    }
    if (q.rpm.remaining <= 0) {
        return { allowed: false, reason: `每分鐘額度已滿，${q.rpm.resetInSec} 秒後可用` };
    }
    return { allowed: true };
}
