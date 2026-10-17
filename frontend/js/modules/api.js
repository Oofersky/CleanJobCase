const DEFAULT_API = "http://127.0.0.1:8000";

/**
 * Same-origin when served via nginx (:8181).
 * Direct API only on loopback for local file/dev — no localStorage override (exfil risk).
 */
function apiBase() {
  if (window.location.port === "8181") return "";
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    const host = window.location.hostname;
    if (host === "127.0.0.1" || host === "localhost") return DEFAULT_API;
    // Production-style host: always same-origin (expect reverse proxy)
    return "";
  }
  return DEFAULT_API;
}

function detailMessage(detail, fallback) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    if (typeof first === "string") return first;
    if (first?.msg) return String(first.msg);
  }
  if (detail && typeof detail === "object" && detail.msg) return String(detail.msg);
  return fallback;
}

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    if (!response.ok) throw new Error("Request failed");
    return null;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(detailMessage(data?.detail, "Request failed"));
  }

  return data;
}

export function getToken() {
  return localStorage.getItem("mentorai_token");
}

/** Real JWT only — skip offline `local.*` placeholders that cause 401 on API. */
export function getApiToken() {
  const token = getToken();
  if (!token || String(token).startsWith("local.")) return null;
  return token;
}

export function setSession({ access_token, user }) {
  localStorage.setItem("mentorai_token", access_token);
  localStorage.setItem("mentorai_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("mentorai_token");
  localStorage.removeItem("mentorai_user");
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("mentorai_user") || "null");
  } catch {
    return null;
  }
}

export async function register(payload) {
  return request("/api/auth/register", { method: "POST", body: payload });
}

export async function login(payload) {
  return request("/api/auth/login", { method: "POST", body: payload });
}

export async function fetchMe() {
  return request("/api/auth/me", { token: getApiToken() });
}

export async function updateMe(payload) {
  return request("/api/auth/me", { method: "PATCH", body: payload, token: getApiToken() });
}

export async function sendChat(payload) {
  return request("/api/chat", { method: "POST", body: payload, token: getApiToken() });
}

export async function fetchSessions() {
  return request("/api/sessions", { token: getApiToken() });
}

export async function createRemoteSession(payload) {
  return request("/api/sessions", { method: "POST", body: payload, token: getApiToken() });
}

export async function updateRemoteSession(id, payload) {
  return request(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
    token: getApiToken(),
  });
}

export async function deleteRemoteSession(id) {
  return request(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token: getApiToken(),
  });
}

export async function appendRemoteMessage(id, message) {
  return request(`/api/sessions/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: message,
    token: getApiToken(),
  });
}

export async function patchRemoteMessageRating(sessionId, messageIndex, rating) {
  return request(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages/${messageIndex}/rating`,
    {
      method: "PATCH",
      body: { rating },
      token: getApiToken(),
    }
  );
}

export async function replaceRemoteMessages(id, messages) {
  return request(`/api/sessions/${encodeURIComponent(id)}/messages`, {
    method: "PUT",
    body: messages,
    token: getApiToken(),
  });
}

export async function fetchProgress() {
  return request("/api/progress", { token: getApiToken() });
}

export async function saveProgress(payload) {
  return request("/api/progress", { method: "PUT", body: payload, token: getApiToken() });
}

export async function submitOpinion(payload) {
  return request("/api/feedback/opinion", {
    method: "POST",
    body: payload,
    token: getApiToken(),
  });
}

export async function refreshRecommendations(payload) {
  return request("/api/recommendations/refresh", {
    method: "POST",
    body: payload,
    token: getApiToken(),
  });
}

export async function downloadExportPdf(payload) {
  const headers = { "Content-Type": "application/json" };
  const token = getApiToken();
  if (!token) {
    throw new Error("Войди в аккаунт — PDF формируется только из твоих серверных сессий.");
  }
  headers.Authorization = `Bearer ${token}`;

  const body = {
    kind: payload.kind,
    session_ids: Array.isArray(payload.session_ids) ? payload.session_ids.slice(0, 8) : [],
    focusLabel: payload.focusLabel || "",
  };

  const response = await fetch(`${apiBase()}/api/export/pdf`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = "Не удалось сформировать PDF";
    try {
      const data = await response.json();
      detail = detailMessage(data?.detail, detail);
    } catch {
      // binary / empty error body
    }
    throw new Error(detail);
  }

  // octet-stream: force save-as download, never open a tab/viewer
  const buffer = await response.arrayBuffer();
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const filename =
    payload.kind === "notes" ? "mentorai-notes.pdf" : "mentorai-report.pdf";
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
