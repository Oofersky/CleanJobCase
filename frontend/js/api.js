const LOGIN_URL = "/login/";
const FORBIDDEN_URL = "/403.html";

export async function api(path, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const res = await fetch(path, {
    ...rest,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
  });
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    location.replace(`${LOGIN_URL}?next=${next}`);
    throw new Error("Требуется вход");
  }
  if (res.status === 403) {
    location.replace(FORBIDDEN_URL);
    throw new Error("Доступ запрещён");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !(data && data.vacancies)) {
    const detail = data.detail || data.error || `Ошибка запроса (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

export async function getAuthStatus() {
  try {
    return await api("/api/auth/status", { signal: AbortSignal.timeout(8000) });
  } catch {
    return { authenticated: false };
  }
}

/** Redirect guests to login; returns user or null after redirect started. */
export async function requireAuth() {
  document.documentElement.classList.add("is-auth-checking");
  const status = await getAuthStatus();
  if (!status.authenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    location.replace(`${LOGIN_URL}?next=${next}`);
    return null; // оверлей до ухода со страницы
  }
  document.documentElement.classList.remove("is-auth-checking");
  return status.user || null;
}

export async function logout() {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  location.href = "/";
}

export function mountAuthNav(slot) {
  if (!slot) return;
  getAuthStatus().then((status) => {
    if (!status.authenticated) {
      slot.innerHTML = "";
      return;
    }
    const login = status.user?.login || "";
    slot.innerHTML = `
      <span class="auth-chip" title="${login}">${login}</span>
      <button type="button" class="btn btn--ghost btn--compact" data-logout>Выйти</button>
    `;
    slot.querySelector("[data-logout]")?.addEventListener("click", () => logout());
  });
}
