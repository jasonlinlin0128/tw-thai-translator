/**
 * Gemini API integration for semantic understanding + translation
 */

const GEMINI_API_URL =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Build time key from env var (injected by GitHub Actions secret)
const BUILT_IN_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

/**
 * Get API key: localStorage override > built-in env key
 */
export function getApiKey() {
    return localStorage.getItem('gemini_api_key') || BUILT_IN_KEY;
}

/**
 * Save API key to localStorage
 */
export function setApiKey(key) {
    localStorage.setItem('gemini_api_key', key);
}

/**
 * Fetch with retry + exponential backoff for 429 errors
 */
async function fetchWithRetry(url, options, maxRetries = 1) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, options);

        if (response.status === 429 && attempt < maxRetries) {
            const body = await response.clone().text();
            console.warn(`429 rate limit (attempt ${attempt + 1}/${maxRetries}), body:`, body);

            // Try to parse retryDelay from API response
            let waitMs = 10000; // default 10s
            try {
                const errJson = JSON.parse(body);
                const retryInfo = errJson.error?.details?.find(
                    (d) => d['@type']?.includes('RetryInfo')
                );
                if (retryInfo?.retryDelay) {
                    const sec = parseFloat(retryInfo.retryDelay);
                    if (!isNaN(sec)) waitMs = Math.ceil(sec * 1000) + 500;
                }
            } catch { /* use default */ }

            console.warn(`Retrying in ${waitMs}ms`);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
        }

        return response;
    }
}

/**
 * Build the system prompt for translation
 */
function buildSystemPrompt(fromLang, toLang) {
    const fromName = fromLang === 'zh-TW' ? '中文' : 'ไทย';
    const toName = toLang === 'zh-TW' ? '中文' : 'ไทย';

    return `工廠翻譯助手。${fromName}→${toName}。口語化翻譯。
若語意模糊（代詞不明、動作不具體如「弄一下」「那個」），用clarify格式反問。
若語意清晰，用translate格式直接翻譯。
回JSON：
清晰：{"type":"translate","original":"原文","translated":"譯文"}
模糊：{"type":"clarify","question_source":"${fromName}問題","question_target":"${toName}問題","options":[{"source":"選項${fromName}","target":"選項${toName}","value":"明確句子"}]}`;
}

/**
 * Analyze and translate text using Gemini
 * @param {string} text - Input text to analyze/translate
 * @param {'zh-TW' | 'th-TH'} fromLang
 * @param {'zh-TW' | 'th-TH'} toLang
 * @returns {Promise<Object>} result with type 'translate' or 'clarify'
 */
export async function analyzeAndTranslate(text, fromLang, toLang) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('請先設定 Gemini API Key');
    }

    const systemPrompt = buildSystemPrompt(fromLang, toLang);

    const response = await fetchWithRetry(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: {
                parts: [{ text: systemPrompt }],
            },
            contents: [
                {
                    role: 'user',
                    parts: [{ text }],
                },
            ],
            generationConfig: {
                temperature: 0.3,
                responseMimeType: 'application/json',
            },
        }),
    });

    if (!response.ok) {
        const errBody = await response.text();
        console.error(`Gemini API error (${response.status}):`, errBody);
        let detail = '';
        try {
            const errJson = JSON.parse(errBody);
            detail = errJson.error?.message || errBody;
        } catch {
            detail = errBody;
        }
        if (response.status === 429) {
            throw new Error(`API 限流: ${detail}`);
        }
        throw new Error(`Gemini API 錯誤 (${response.status}): ${detail}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
        throw new Error('Gemini 沒有回傳有效內容');
    }

    try {
        return JSON.parse(content);
    } catch {
        throw new Error('Gemini 回傳格式錯誤');
    }
}

/**
 * Translate a clarified option
 * @param {string} clarifiedText - The clarified intent
 * @param {'zh-TW' | 'th-TH'} fromLang
 * @param {'zh-TW' | 'th-TH'} toLang
 * @returns {Promise<Object>}
 */
export async function translateClarified(clarifiedText, fromLang, toLang) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('請先設定 Gemini API Key');
    }

    const fromName = fromLang === 'zh-TW' ? '中文' : 'ไทย';
    const toName = toLang === 'zh-TW' ? '中文' : 'ไทย';

    const prompt = `${fromName}→${toName}口語翻譯，回JSON{"type":"translate","original":"原文","translated":"譯文"}：${clarifiedText}`;

    const response = await fetchWithRetry(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                responseMimeType: 'application/json',
            },
        }),
    });

    if (!response.ok) {
        const errBody = await response.text();
        console.error(`Gemini translate error (${response.status}):`, errBody);
        let detail = '';
        try {
            const errJson = JSON.parse(errBody);
            detail = errJson.error?.message || errBody;
        } catch {
            detail = errBody;
        }
        throw new Error(`翻譯失敗: ${detail}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    try {
        return JSON.parse(content);
    } catch {
        // Fallback: return raw text as translation
        return {
            type: 'translate',
            original: clarifiedText,
            translated: content || clarifiedText,
        };
    }
}
