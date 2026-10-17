import { getModeLabel, getScenarioLabel } from "./simulate.js";

export function createUiState(root = document) {
  const params = new URLSearchParams(window.location.search);
  const state = {
    scenario: params.get("scenario") || "university",
    mode: params.get("mode") || "info",
    voice: "idle",
  };

  if (!["university", "job", "adapt"].includes(state.scenario)) state.scenario = "university";
  if (!["info", "trainer"].includes(state.mode)) state.mode = "info";

  const scenarioButtons = [...root.querySelectorAll("[data-scenario]")];
  const modeButtons = [...root.querySelectorAll("[data-mode]")];
  const scenarioLabel = root.querySelector("[data-scenario-label]");
  const modeLabel = root.querySelector("[data-mode-label]");
  const voiceBtn = root.querySelector("#voice-btn");
  const voiceIcon = root.querySelector("#voice-icon");
  const listeners = new Set();

  function emit() {
    listeners.forEach((fn) => fn({ ...state }));
  }

  function syncUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", state.scenario);
    url.searchParams.set("mode", state.mode);
    history.replaceState(null, "", url);
  }

  function setScenario(id) {
    state.scenario = id;
    scenarioButtons.forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.scenario === id));
    });
    if (scenarioLabel) scenarioLabel.textContent = getScenarioLabel(id);
    syncUrl();
    emit();
  }

  function setMode(mode) {
    state.mode = mode;
    modeButtons.forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
    });
    if (modeLabel) modeLabel.textContent = getModeLabel(mode);
    syncUrl();
    emit();
  }

  function setVoice(status) {
    state.voice = status;
    if (!voiceBtn || !voiceIcon) return;
    voiceBtn.setAttribute("aria-pressed", String(status === "listen"));
    const map = {
      idle: "/assets/icons/voice-idle.png",
      listen: "/assets/icons/voice-listen.png",
      speak: "/assets/icons/voice-listen.png",
    };
    voiceIcon.src = map[status] ?? map.idle;
  }

  scenarioButtons.forEach((btn) => {
    btn.addEventListener("click", () => setScenario(btn.dataset.scenario));
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  setScenario(state.scenario);
  setMode(state.mode);

  return {
    state,
    setScenario,
    setMode,
    setVoice,
    voiceBtn,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
