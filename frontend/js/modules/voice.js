/**
 * Voice input: Web Speech API for text + animated spectrum (no getUserMedia lock).
 * getUserMedia fights SpeechRecognition for the mic in Chromium — avoid it.
 * Draft goes to the input for editing; never auto-sends.
 */
export function createVoice({ onStatus, onLevels, onDraft, onError }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    return {
      supported: false,
      isListening: () => false,
      toggle() {
        onStatus?.("idle");
        onError?.("unsupported");
      },
      stop() {},
    };
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "ru-RU";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  let active = false;
  let sessionId = 0;
  let shouldRestart = false;
  let finalParts = [];
  let interimText = "";
  let rafId = 0;
  const barCount = 28;
  const levels = new Float32Array(barCount);

  function bestTranscript(result) {
    if (!result || !result.length) return "";
    let best = result[0];
    for (let i = 1; i < result.length; i += 1) {
      if ((result[i].confidence || 0) > (best.confidence || 0)) best = result[i];
    }
    return String(best?.transcript || "").trim();
  }

  function emitDraft(partial) {
    const finals = finalParts.join(" ").replace(/\s+/g, " ").trim();
    const draft = [finals, interimText].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    onDraft?.(draft, { partial: Boolean(partial), finals, interim: interimText });
  }

  function stopAnim() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    levels.fill(0);
    onLevels?.(Array.from(levels));
  }

  function tickAnim(id) {
    if (!active || id !== sessionId) return;
    const t = performance.now() / 140;
    for (let i = 0; i < barCount; i += 1) {
      const wave =
        Math.abs(Math.sin(t + i * 0.55)) * 0.55 +
        Math.abs(Math.sin(t * 1.7 + i * 0.31)) * 0.35 +
        Math.random() * 0.12;
      levels[i] = 0.12 + wave * 0.88;
    }
    onLevels?.(Array.from(levels));
    rafId = requestAnimationFrame(() => tickAnim(id));
  }

  recognition.onresult = (event) => {
    if (!active) return;
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const piece = bestTranscript(result);
      if (!piece) continue;
      if (result.isFinal) {
        finalParts.push(piece);
      } else {
        interim = piece;
      }
    }
    interimText = interim;
    emitDraft(true);
  };

  recognition.onerror = (event) => {
    const code = event.error || "error";
    if (code === "no-speech" || code === "aborted") return;
    shouldRestart = false;
    active = false;
    stopAnim();
    onStatus?.("idle");
    onError?.(code);
  };

  recognition.onend = () => {
    if (active && shouldRestart) {
      window.setTimeout(() => {
        if (!active || !shouldRestart) return;
        try {
          recognition.start();
        } catch {
          active = false;
          shouldRestart = false;
          stopAnim();
          emitDraft(false);
          onStatus?.("idle");
        }
      }, 80);
      return;
    }
    active = false;
    shouldRestart = false;
    stopAnim();
    emitDraft(false);
    onStatus?.("idle");
  };

  function start() {
    if (active) return;
    active = true;
    shouldRestart = true;
    sessionId += 1;
    const id = sessionId;
    finalParts = [];
    interimText = "";
    onStatus?.("listen");
    tickAnim(id);

    try {
      recognition.start();
    } catch (error) {
      active = false;
      shouldRestart = false;
      stopAnim();
      onStatus?.("idle");
      onError?.(error?.message || "start-failed");
    }
  }

  function stop() {
    if (!active) {
      stopAnim();
      onStatus?.("idle");
      return;
    }
    shouldRestart = false;
    active = false;
    sessionId += 1;
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
    stopAnim();
    emitDraft(false);
    onStatus?.("idle");
  }

  function toggle() {
    if (active) stop();
    else start();
  }

  return {
    supported: true,
    barCount,
    isListening: () => active,
    toggle,
    start,
    stop,
  };
}
