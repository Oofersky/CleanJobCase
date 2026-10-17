import {
  appendRemoteMessage,
  createRemoteSession,
  deleteRemoteSession,
  fetchProgress,
  fetchSessions,
  getApiToken,
  patchRemoteMessageRating,
  saveProgress,
  updateRemoteSession,
} from "./api.js";
import { emptyProgress } from "./progress.js";
import { getUser, setUser } from "./shell.js";
import {
  listSessions,
  replaceAllSessions,
  getActiveSessionId,
} from "./sessions.js";

function normalizeRating(value) {
  return value === "like" || value === "dislike" ? value : null;
}

function toRemoteSession(session) {
  return {
    id: session.id,
    title: session.title,
    scenario: session.scenario,
    mode: session.mode,
    case_index: session.caseIndex || 0,
    messages: (session.messages || []).map((msg) => ({
      role: msg.role,
      text: msg.text,
      tags: msg.tags || [],
      sources: msg.sources || [],
      rating: normalizeRating(msg.rating),
    })),
  };
}

function ratingKey(sessionId, index, text) {
  return `${sessionId}:${index}:${String(text || "").slice(0, 80)}`;
}

/** Preserve local likes when server payload lacks them (pre-migration / race). */
function localRatingsMap() {
  const map = new Map();
  for (const session of listSessions()) {
    (session.messages || []).forEach((msg, index) => {
      const rating = normalizeRating(msg.rating);
      if (!rating) return;
      map.set(ratingKey(session.id, index, msg.text), rating);
    });
  }
  return map;
}

function fromRemoteSession(
  row,
  localPinnedById = new Map(),
  localRatings = new Map(),
  localMetaById = new Map()
) {
  const local = localMetaById.get(row.id) || {};
  const caseIndex = typeof row.caseIndex === "number" ? row.caseIndex : 0;
  const totalCases =
    typeof local.totalCases === "number" && local.totalCases > 0
      ? local.totalCases
      : row.mode === "trainer"
        ? 5
        : null;
  const trainerCompleted =
    row.mode === "trainer" &&
    (Boolean(local.trainerCompleted) || (totalCases != null && caseIndex >= totalCases));
  return {
    id: row.id,
    title: row.title,
    scenario: row.scenario,
    mode: row.mode,
    caseIndex,
    totalCases,
    trainerCompleted,
    pinned: Boolean(localPinnedById.get(row.id)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    messages: (row.messages || []).map((msg, index) => {
      const fromServer = normalizeRating(msg.rating);
      const fromLocal = localRatings.get(ratingKey(row.id, index, msg.text)) || null;
      return {
        role: msg.role,
        text: msg.text,
        // Feedback tags live on bot (mentor) messages only
        tags: msg.role === "bot" ? msg.tags || [] : [],
        sources: msg.sources || [],
        rating: fromServer || fromLocal,
        at: msg.at,
      };
    }),
  };
}

function localPinnedMap() {
  return new Map(listSessions().map((session) => [session.id, Boolean(session.pinned)]));
}

/** In-flight remote creates — messages must wait so we don't 404. */
const pendingCreates = new Map();

export async function hydratePracticeFromServer() {
  if (!getApiToken()) {
    return { sessions: listSessions(), progress: getUser()?.progress || emptyProgress() };
  }

  try {
    const [remoteSessions, progress] = await Promise.all([fetchSessions(), fetchProgress()]);
    const local = listSessions();
    const pinnedById = localPinnedMap();
    const ratings = localRatingsMap();
    const localMetaById = new Map(
      local.map((session) => [
        session.id,
        {
          trainerCompleted: Boolean(session.trainerCompleted),
          totalCases: session.totalCases || null,
        },
      ])
    );

    if ((!remoteSessions || !remoteSessions.length) && local.length) {
      for (const session of local) {
        try {
          await createRemoteSession(toRemoteSession(session));
        } catch {
          // ignore duplicates / offline races
        }
      }
      const uploaded = await fetchSessions();
      replaceAllSessions(
        (uploaded || []).map((row) => fromRemoteSession(row, pinnedById, ratings, localMetaById)),
        getActiveSessionId()
      );
    } else {
      replaceAllSessions(
        (remoteSessions || []).map((row) =>
          fromRemoteSession(row, pinnedById, ratings, localMetaById)
        ),
        getActiveSessionId()
      );
    }

    const user = getUser();
    if (user) {
      setUser({ ...user, progress: { ...emptyProgress(), ...progress } });
    }
    return { sessions: listSessions(), progress };
  } catch {
    return { sessions: listSessions(), progress: getUser()?.progress || emptyProgress() };
  }
}

export async function pushSessionCreated(session) {
  if (!getApiToken() || !session) return;
  if (pendingCreates.has(session.id)) {
    return pendingCreates.get(session.id);
  }
  const task = (async () => {
    try {
      await createRemoteSession(toRemoteSession(session));
    } catch {
      // local remains source until next hydrate / duplicate id
    } finally {
      pendingCreates.delete(session.id);
    }
  })();
  pendingCreates.set(session.id, task);
  await task;
}

export async function pushSessionUpdated(session) {
  if (!getApiToken() || !session) return;
  try {
    await updateRemoteSession(session.id, {
      title: session.title,
      scenario: session.scenario,
      mode: session.mode,
      case_index: session.caseIndex || 0,
    });
  } catch {
    // ignore
  }
}

export async function pushSessionDeleted(id) {
  if (!getApiToken() || !id) return;
  try {
    await deleteRemoteSession(id);
  } catch {
    // ignore
  }
}

export async function pushMessage(sessionId, message) {
  if (!getApiToken() || !sessionId || !message) return;

  if (pendingCreates.has(sessionId)) {
    await pendingCreates.get(sessionId);
  }

  const payload = {
    role: message.role,
    text: message.text,
    tags: message.tags || [],
    sources: message.sources || [],
    rating: normalizeRating(message.rating),
  };

  try {
    await appendRemoteMessage(sessionId, payload);
  } catch (error) {
    const detail = String(error?.message || "").toLowerCase();
    const missing = detail.includes("not found") || detail.includes("404");
    if (!missing) return;

    const local = listSessions().find((item) => item.id === sessionId);
    if (!local) return;
    try {
      await createRemoteSession(toRemoteSession(local));
      await appendRemoteMessage(sessionId, payload);
    } catch {
      // ignore — next hydrate will reconcile
    }
  }
}

export async function pushMessageRating(sessionId, messageIndex, rating) {
  if (!getApiToken() || !sessionId || messageIndex < 0) return null;
  try {
    return await patchRemoteMessageRating(sessionId, messageIndex, normalizeRating(rating));
  } catch (error) {
    console.warn("[MentOrAI] rating sync failed:", error?.message || error);
    return null;
  }
}

export async function pushProgress(progress) {
  if (!getApiToken() || !progress) return;
  try {
    await saveProgress({
      sessions: progress.sessions || 0,
      byScenario: progress.byScenario || { university: 0, job: 0, adapt: 0 },
      weakZones: progress.weakZones || [],
      notes: progress.notes || [],
      signals: progress.signals || [],
    });
  } catch {
    // ignore
  }
}
