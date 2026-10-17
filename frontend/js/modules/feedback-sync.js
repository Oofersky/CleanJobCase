import { getApiToken, submitOpinion } from "./api.js";
import { pushMessageRating } from "./remote-sync.js";

/**
 * Persist like/dislike: local session store (caller) + message rating + opinion telemetry.
 */
export async function pushOpinion({
  sessionId,
  messageIndex,
  rating,
  messageText,
  scenario,
  mode,
  tags = [],
}) {
  if (!getApiToken()) return null;
  const client_key = `${sessionId || "local"}:${messageIndex}`;
  const tasks = [
    pushMessageRating(sessionId, messageIndex, rating),
    submitOpinion({
      session_id: sessionId || null,
      client_key,
      rating,
      message_text: String(messageText || "").slice(0, 8000),
      scenario: scenario || "university",
      mode: mode || "info",
      tags: Array.isArray(tags) ? tags.slice(0, 12) : [],
    }).catch((error) => {
      console.warn("[MentOrAI] opinion sync failed:", error?.message || error);
      return null;
    }),
  ];
  const [messageResult] = await Promise.all(tasks);
  return messageResult;
}