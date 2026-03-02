/**
 * Gemini API integration for semantic understanding + translation
 *
 * NOTE: gemini-2.5-flash with responseMimeType:"application/json" corrupts
 * non-Latin characters (Chinese/Thai). We use plain text mode + thinkingBudget
 * to keep responses fast (~2s) and correct.
 */

const GEMINI_API_URL =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, options);

        if (response.status === 429 && attempt < maxRetries) {
            const body = await response.clone().text();
            console.warn(`429 rate limit (attempt ${attempt + 1}/${maxRetries + 1}), body:`, body);

            // Try to parse retryDelay from API response
            let waitMs = 5000 * (attempt + 1); // progressive backoff: 5s, 10s, 15s
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

            console.warn(`Retrying in ${waitMs}ms (attempt ${attempt + 2}/${maxRetries + 1})`);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
        }

        return response;
    }
}

/**
 * Extract JSON from model response text (may be wrapped in ```json code fence)
 */
function extractJSON(text) {
    // Try direct parse first
    try {
        return JSON.parse(text);
    } catch { /* continue */ }

    // Try extracting from ```json ... ``` code fence
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        return JSON.parse(fenceMatch[1].trim());
    }

    throw new Error('無法解析回傳的 JSON');
}

/**
 * Build the system prompt for translation
 */
function buildSystemPrompt(fromLang, toLang, gender = 'male') {
    const fromName = fromLang === 'zh-TW' ? '中文' : 'ไทย';
    const toName = toLang === 'zh-TW' ? '中文' : 'ไทย';
    const genderHint = gender === 'female'
        ? '說話者是女性，泰文句尾用ค่ะ(陳述)/คะ(疑問)，不要用ครับ。'
        : '說話者是男性，泰文句尾用ครับ，不要用ค่ะ/คะ。';

    return `工廠翻譯助手。${fromName}→${toName}。口語化翻譯。${genderHint}
術語表：安全帽=หมวกนิรภัย,手套=ถุงมือ,護目鏡=แว่นตานิรภัย,停機=หยุดเครื่อง,開機=เปิดเครื่อง,模具=แม่พิมพ์,良品=ของดี,不良品=ของเสีย,品檢=QC,加班=OT/ทำโอที,上班=เข้างาน,下班=เลิกงาน,倉庫=คลังสินค้า,出貨=ส่งของ,原料=วัตถุดิบ,組裝=ประกอบ,焊接=เชื่อม,研磨=เจียร,沖壓=ปั๊ม
若語意模糊（代詞不明、動作不具體如「弄一下」「那個」），用clarify格式反問。
若語意清晰，用translate格式直接翻譯。
只回JSON，不要markdown或code fence：
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
export async function analyzeAndTranslate(text, fromLang, toLang, gender = 'male') {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('請先設定 Gemini API Key');
    }

    const systemPrompt = buildSystemPrompt(fromLang, toLang, gender);

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
                thinkingConfig: { thinkingBudget: 256 },
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
            throw new Error(`API 限流（已重試 3 次仍失敗）：伺服器拒絕請求，可能是 API Key 額度已用盡或被多人共用。建議等幾分鐘或更換 API Key。`);
        }
        if (response.status === 403) {
            throw new Error('API Key 無效或已過期，請到設定更換 API Key');
        }
        throw new Error(`Gemini API 錯誤 (${response.status}): ${detail}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
        throw new Error('Gemini 沒有回傳有效內容');
    }

    return extractJSON(content);
}

/**
 * Translate a clarified option
 * @param {string} clarifiedText - The clarified intent
 * @param {'zh-TW' | 'th-TH'} fromLang
 * @param {'zh-TW' | 'th-TH'} toLang
 * @returns {Promise<Object>}
 */
export async function translateClarified(clarifiedText, fromLang, toLang, gender = 'male') {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('請先設定 Gemini API Key');
    }

    const fromName = fromLang === 'zh-TW' ? '中文' : 'ไทย';
    const toName = toLang === 'zh-TW' ? '中文' : 'ไทย';
    const genderNote = gender === 'female' ? '，句尾用ค่ะ/คะ' : '，句尾用ครับ';

    const prompt = `${fromName}→${toName}口語翻譯${genderNote}，只回JSON不要markdown：{"type":"translate","original":"原文","translated":"譯文"}：${clarifiedText}`;

    const response = await fetchWithRetry(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                thinkingConfig: { thinkingBudget: 256 },
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
        if (response.status === 429) {
            throw new Error('API 限流：伺服器拒絕請求，請稍後再試或更換 API Key');
        }
        if (response.status === 403) {
            throw new Error('API Key 無效或已過期，請到設定更換 API Key');
        }
        throw new Error(`翻譯失敗: ${detail}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    try {
        return extractJSON(content);
    } catch {
        // Fallback: return raw text as translation
        return {
            type: 'translate',
            original: clarifiedText,
            translated: content || clarifiedText,
        };
    }
}
