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

        // Always create a fresh instance to avoid stale state
        if (recognition) {
            try { recognition.abort(); } catch (e) { /* ignore */ }
            recognition = null;
        }

        recognition = new SpeechRecognition();
        recognition.lang = lang;
        recognition.interimResults = false;
        recognition.continuous = true; // Keep listening until user releases
        recognition.maxAlternatives = 1;

        let segments = []; // Accumulate all recognized segments

        recognition.onresult = (event) => {
            // Collect all new final results
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    segments.push(event.results[i][0].transcript);
                }
            }
            console.log('STT segments so far:', segments);
        };

        recognition.onerror = (event) => {
            console.warn('STT error:', event.error);
            isListening = false;
            if (event.error === 'no-speech' || event.error === 'aborted') {
                resolve(segments.join(''));
            } else {
                reject(new Error(`語音辨識錯誤: ${event.error}`));
            }
        };

        recognition.onend = () => {
            console.log('STT ended, segments:', segments);
            isListening = false;
            resolve(segments.join(''));
        };

        isListening = true;
        recognition.start();
        console.log('STT started, lang:', lang);
    });
}

/**
 * Stop listening
 */
export function stopListening() {
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {
            console.warn('stopListening error:', e);
        }
    }
}

/**
 * Speak text using TTS
 * @param {string} text
 * @param {'zh-TW' | 'th-TH'} lang
 * @returns {Promise<void>}
 */
export function speak(text, lang) {
    return new Promise((resolve) => {
        if (!window.speechSynthesis) {
            console.warn('TTS not supported');
            resolve();
            return;
        }

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        // Chrome bug: need a small delay after cancel() before speaking
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = lang;
            utterance.rate = 0.9;
            utterance.pitch = 1;
            utterance.volume = 1;

            // Find a matching voice
            const voices = window.speechSynthesis.getVoices();
            console.log('Available voices:', voices.length, 'Looking for:', lang);
            const langPrefix = lang.split('-')[0];
            const matchedVoice = voices.find(
                (v) => v.lang === lang || v.lang.startsWith(langPrefix)
            );
            if (matchedVoice) {
                utterance.voice = matchedVoice;
                console.log('Using voice:', matchedVoice.name, matchedVoice.lang);
            } else {
                console.warn('No voice found for', lang, '- using default');
            }

            utterance.onend = () => {
                console.log('TTS finished');
                resolve();
            };
            utterance.onerror = (e) => {
                console.error('TTS error:', e.error);
                resolve(); // Don't reject, just continue
            };

            window.speechSynthesis.speak(utterance);

            // Chrome bug: speechSynthesis can get stuck, resume it
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }

            // Safety timeout - resolve after 30s max
            setTimeout(() => resolve(), 30000);
        }, 100);
    });
}

// Store loaded voices
let voicesLoaded = false;

/**
 * Preload voices (call early so voices are ready)
 */
export function preloadVoices() {
    if (!window.speechSynthesis) return;

    const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            voicesLoaded = true;
            console.log('Voices loaded:', voices.length);
            // Log Chinese and Thai voices
            const relevant = voices.filter(
                (v) => v.lang.startsWith('zh') || v.lang.startsWith('th')
            );
            console.log(
                'Chinese/Thai voices:',
                relevant.map((v) => `${v.name} (${v.lang})`).join(', ')
            );
        }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Chrome: voices may load async, poll a few times
    if (!voicesLoaded) {
        setTimeout(loadVoices, 100);
        setTimeout(loadVoices, 500);
        setTimeout(loadVoices, 1000);
    }
}
