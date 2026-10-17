import { getModeLabel, getScenarioLabel } from "./simulate.js";
import { getUser } from "./shell.js";

const SCENARIOS = ["university", "job", "adapt"];
const MODES = ["info", "trainer"];

function storageKey() {
  const user = getUser();
  const id = user?.id || user?.email || "guest";
  return `mentorai_practice_sessions_${id}`;
}

function readStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) || "null");
    if (!raw || !Array.isArray(raw.items)) {
      return { activeId: null, items: [] };
    }
    return {
      activeId: raw.activeId || null,
      items: raw.items,
    };
  } catch {
    return { activeId: null, items: [] };
  }
}

function writeStore(store) {
  localStorage.setItem(storageKey(), JSON.stringify(store));
}

function uid() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultTitle(scenario, mode) {
  return `${getScenarioLabel(scenario)} · ${getModeLabel(mode)}`;
}

function normalize(input = {}) {
  const scenario = SCENARIOS.includes(input.scenario) ? input.scenario : "university";
  const mode = MODES.includes(input.mode) ? input.mode : "info";
  const title = String(input.title || "").trim() || defaultTitle(scenario, mode);
  return { scenario, mode, title };
}

function prefsKey() {
  const user = getUser();
  const id = user?.id || user?.email || "guest";
  return `mentorai_session_prefs_${id}`;
}

function readPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(prefsKey()) || "null");
    const sort = raw?.sort === "created" ? "created" : "updated";
    return { sort };
  } catch {
    return { sort: "updated" };
  }
}

export function getSessionSort() {
  return readPrefs().sort;
}

export function setSessionSort(sort) {
  const next = sort === "created" ? "created" : "updated";
  localStorage.setItem(prefsKey(), JSON.stringify({ sort: next }));
  return next;
}

function sortSessions(items, sort = getSessionSort()) {
  const key = sort === "created" ? "createdAt" : "updatedAt";
  return items.slice().sort((a, b) => {
    const pinA = a.pinned ? 1 : 0;
    const pinB = b.pinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    return (b[key] || 0) - (a[key] || 0);
  });
}

export function listSessions() {
  return sortSessions(readStore().items);
}

export function getActiveSessionId() {
  return readStore().activeId;
}

export function getSession(id) {
  return readStore().items.find((item) => item.id === id) || null;
}

export function getActiveSession() {
  const store = readStore();
  if (!store.items.length) {
    if (store.activeId) {
      store.activeId = null;
      writeStore(store);
    }
    return null;
  }

  const active = store.items.find((item) => item.id === store.activeId);
  if (active) return active;

  store.activeId = store.items[0].id;
  writeStore(store);
  return store.items[0];
}

export function setActiveSession(id) {
  const store = readStore();
  if (!store.items.some((item) => item.id === id)) return null;
  store.activeId = id;
  writeStore(store);
  return getSession(id);
}

export function clearActiveSession() {
  const store = readStore();
  store.activeId = null;
  writeStore(store);
}

export function createSession(input = {}) {
  const { scenario, mode, title } = normalize(input);
  const now = Date.now();
  const session = {
    id: uid(),
    title,
    scenario,
    mode,
    caseIndex: 0,
    trainerCompleted: false,
    totalCases: mode === "trainer" ? 5 : null,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  const store = readStore();
  store.items.unshift(session);
  store.activeId = session.id;
  writeStore(store);
  return session;
}

export function updateSession(id, patch = {}) {
  const store = readStore();
  const index = store.items.findIndex((item) => item.id === id);
  if (index < 0) return null;

  const current = store.items[index];
  const nextScenario = patch.scenario ?? current.scenario;
  const nextMode = patch.mode ?? current.mode;
  const scenarioChanged = nextScenario !== current.scenario;
  const modeChanged = nextMode !== current.mode;
  const resetCase = scenarioChanged || modeChanged || nextMode !== "trainer";

  const next = {
    ...current,
    ...normalize({
      title: patch.title ?? current.title,
      scenario: nextScenario,
      mode: nextMode,
    }),
    caseIndex: resetCase
      ? 0
      : typeof patch.caseIndex === "number"
        ? Math.max(0, patch.caseIndex)
        : typeof current.caseIndex === "number"
          ? current.caseIndex
          : 0,
    trainerCompleted: resetCase
      ? false
      : typeof patch.trainerCompleted === "boolean"
        ? patch.trainerCompleted
        : Boolean(current.trainerCompleted),
    totalCases:
      typeof patch.totalCases === "number"
        ? patch.totalCases
        : nextMode === "trainer"
          ? current.totalCases || 5
          : null,
    pinned: typeof patch.pinned === "boolean" ? patch.pinned : Boolean(current.pinned),
    updatedAt: typeof patch.touch === "boolean" && patch.touch === false ? current.updatedAt : Date.now(),
  };

  store.items[index] = next;
  writeStore(store);
  return next;
}

export function togglePinSession(id) {
  const current = getSession(id);
  if (!current) return null;
  return updateSession(id, { pinned: !current.pinned, touch: false });
}

export function deleteSession(id) {
  const store = readStore();
  store.items = store.items.filter((item) => item.id !== id);
  if (store.activeId === id) {
    store.activeId = store.items[0]?.id || null;
  }
  writeStore(store);
  return store.activeId ? getSession(store.activeId) : null;
}

export function appendMessage(id, message) {
  const store = readStore();
  const index = store.items.findIndex((item) => item.id === id);
  if (index < 0) return null;

  const role = message.role === "bot" ? "bot" : "user";
  const entry = {
    role,
    text: message.text,
    // Expert chips (ok/improve/example) only on mentor replies
    tags: role === "bot" && Array.isArray(message.tags) ? message.tags : [],
    sources: role === "bot" && Array.isArray(message.sources) ? message.sources : [],
    rating: message.rating === "like" || message.rating === "dislike" ? message.rating : null,
    at: Date.now(),
  };

  store.items[index].messages = [...(store.items[index].messages || []), entry];
  store.items[index].updatedAt = Date.now();
  writeStore(store);
  return store.items[index];
}

export function setMessageRating(sessionId, messageIndex, rating) {
  const store = readStore();
  const index = store.items.findIndex((item) => item.id === sessionId);
  if (index < 0) return null;
  const messages = [...(store.items[index].messages || [])];
  if (messageIndex < 0 || messageIndex >= messages.length) return null;
  const next =
    rating === "like" || rating === "dislike" ? rating : null;
  messages[messageIndex] = { ...messages[messageIndex], rating: next };
  store.items[index].messages = messages;
  // Do not bump updatedAt — rating is not a chat activity signal (avoids list flicker)
  writeStore(store);
  return store.items[index];
}

export function replaceMessages(id, messages) {
  const store = readStore();
  const index = store.items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  store.items[index].messages = messages;
  store.items[index].updatedAt = Date.now();
  writeStore(store);
  return store.items[index];
}

export function replaceAllSessions(items, activeId = null) {
  const store = {
    activeId: activeId && items.some((item) => item.id === activeId) ? activeId : items[0]?.id || null,
    items: Array.isArray(items) ? items : [],
  };
  writeStore(store);
  return store;
}

export { getScenarioLabel, getModeLabel, defaultTitle, SCENARIOS, MODES, sortSessions };
