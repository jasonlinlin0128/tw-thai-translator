/**
 * Gemini API integration for semantic understanding + translation
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
            const waitMs = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
            const body = await response.clone().text();
            console.warn(`429 rate limit (attempt ${attempt + 1}/${maxRetries}), body:`, body, `retrying in ${waitMs}ms`);
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
    const fromName = fromLang === 'zh-TW' ? '中文' : 'ภาษาไทย';
    const toName = toLang === 'zh-TW' ? '中文' : 'ภาษาไทย';

    return `你是一個工廠環境的專業翻譯助手，負責協助主管與泰國籍同仁之間的溝通。

你的任務：
1. 收到使用者的語音轉文字內容（${fromName}）
2. 分析語意是否模糊或有多種可能的解讀
3. 如果語意模糊：用${fromName}提出釐清問題，並提供 2-4 個選項
4. 如果語意清晰：直接翻譯成${toName}

回覆規則：
- 這是工廠環境，常見的指令包含：操作機台、搬運、組裝、品檢、換線、清潔等
- 翻譯要用簡單易懂的口語，不要用太文言或太正式的用詞
- 如果原文包含方言或口語化的表達，嘗試理解其意圖

你必須以 JSON 格式回覆，只回覆 JSON，不要加任何其他文字：

當語意清晰時：
{
  "type": "translate",
  "original": "原文",
  "translated": "翻譯結果",
  "note": "可選的翻譯備註"
}

當語意模糊時：
{
  "type": "clarify",
  "question_source": "用${fromName}寫的釐清問題",
  "question_target": "用${toName}寫的同一個問題（讓對方也看得懂）",
  "options": [
    {
      "source": "選項（${fromName}）",
      "target": "選項（${toName}）",
      "value": "用於後續翻譯的明確描述"
    }
  ]
}`;
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

    const fromName = fromLang === 'zh-TW' ? '中文' : 'ภาษาไทย';
    const toName = toLang === 'zh-TW' ? '中文' : 'ภาษาไทย';

    const prompt = `將以下工廠指令從${fromName}翻譯成${toName}，用簡單口語表達。

只回覆 JSON：
{
  "type": "translate",
  "original": "原文",
  "translated": "翻譯結果"
}

原文：${clarifiedText}`;

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
