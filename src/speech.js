/**
 * Web Speech API wrapper for STT and TTS
 */

let recognition = null;
let isListening = false;

/**
 * Check if Web Speech API is supported
 */
export function isSpeechSupported() {
    return !!(
        window.SpeechRecognition || window.webkitSpeechRecognition
    );
}

/**
 * Start listening for speech
 * @param {'zh-TW' | 'th-TH'} lang
 * @returns {Promise<string>} recognized text
 */
export function startListening(lang) {
    return new Promise((resolve, reject) => {
        const SpeechRecognition =
            window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            reject(new Error('此瀏覽器不支援語音辨識'));
            return;
        }

        recognition = new SpeechRecognition();
        recognition.lang = lang;
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;

        let resultText = '';

        recognition.onresult = (event) => {
            resultText = event.results[0][0].transcript;
        };

        recognition.onerror = (event) => {
            isListening = false;
            if (event.error === 'no-speech') {
                resolve('');
            } else if (event.error === 'aborted') {
                resolve(resultText);
            } else {
                reject(new Error(`語音辨識錯誤: ${event.error}`));
            }
        };

        recognition.onend = () => {
            isListening = false;
            resolve(resultText);
        };

        isListening = true;
        recognition.start();
    });
}

/**
 * Stop listening
 */
export function stopListening() {
    if (recognition && isListening) {
        recognition.stop();
    }
}

/**
 * Speak text using TTS
 * @param {string} text
 * @param {'zh-TW' | 'th-TH'} lang
 * @returns {Promise<void>}
 */
export function speak(text, lang) {
    return new Promise((resolve, reject) => {
        if (!window.speechSynthesis) {
            reject(new Error('此瀏覽器不支援語音合成'));
            return;
        }

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.9;
        utterance.pitch = 1;

        // Try finding a native voice for this language
        const voices = window.speechSynthesis.getVoices();
        const langPrefix = lang.split('-')[0];
        const matchedVoice = voices.find(
            (v) => v.lang === lang || v.lang.startsWith(langPrefix)
        );
        if (matchedVoice) {
            utterance.voice = matchedVoice;
        }

        utterance.onend = () => resolve();
        utterance.onerror = (e) => {
            if (e.error === 'canceled') resolve();
            else reject(e);
        };

        window.speechSynthesis.speak(utterance);
    });
}

/**
 * Preload voices (call early so voices are ready)
 */
export function preloadVoices() {
    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }
}
