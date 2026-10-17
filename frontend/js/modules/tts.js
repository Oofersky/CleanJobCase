/**
 * Browser TTS for mentor replies (Web Speech Synthesis).
 * Complements STT in voice.js — no server audio.
 */

let activeUtterance = null;

export function ttsSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopSpeaking() {
  if (!ttsSupported()) return;
  window.speechSynthesis.cancel();
  activeUtterance = null;
}

export function isSpeaking() {
  return Boolean(ttsSupported() && window.speechSynthesis.speaking);
}

/**
 * Speak plain text. Cancels any ongoing utterance first.
 * @returns {boolean} false if TTS unavailable or empty text
 */
export function speakText(text, { lang = "ru-RU", rate = 1, onStart, onEnd, onError } = {}) {
  if (!ttsSupported()) {
    onError?.("unsupported");
    return false;
  }
  const plain = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) {
    onError?.("empty");
    return false;
  }

  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(plain);
  utterance.lang = lang;
  utterance.rate = rate;
  activeUtterance = utterance;

  utterance.onstart = () => onStart?.();
  utterance.onend = () => {
    if (activeUtterance === utterance) activeUtterance = null;
    onEnd?.();
  };
  utterance.onerror = () => {
    if (activeUtterance === utterance) activeUtterance = null;
    onError?.("error");
    onEnd?.();
  };

  window.speechSynthesis.speak(utterance);
  return true;
}
