import { clearSession, fetchMe, getApiToken, getStoredUser, getToken } from "./api.js";
import { loginWithNext, resolveNext, ROUTES } from "./paths.js";

function looksLikeJwt(token) {
  const parts = String(token || "").split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/**
 * Gate platform pages. Allows offline `local.*` guest sessions.
 * Real JWTs are shape-checked; background /me clears stolen/invalid tokens.
 */
export function requireAuth(nextPath) {
  const token = getToken();
  const user = getStoredUser();

  if (!token && !user) {
    const target = nextPath || `${window.location.pathname}${window.location.search}`;
    window.location.replace(loginWithNext(target));
    return false;
  }

  if (token && !String(token).startsWith("local.") && !looksLikeJwt(token)) {
    clearSession();
    const target = nextPath || `${window.location.pathname}${window.location.search}`;
    window.location.replace(loginWithNext(target));
    return false;
  }

  if (getApiToken()) {
    fetchMe().catch((error) => {
      const message = String(error?.message || "").toLowerCase();
      // Only drop session on auth failures — keep offline UX if API is briefly down
      if (
        message.includes("not authenticated") ||
        message.includes("invalid token") ||
        message.includes("could not validate") ||
        message.includes("unauthorized")
      ) {
        clearSession();
        window.location.replace(loginWithNext(ROUTES.chat));
      }
    });
  }

  return true;
}

export function redirectAfterAuth(fallback = ROUTES.chat) {
  const params = new URLSearchParams(window.location.search);
  const next = resolveNext(params.get("next"));
  if (next) {
    window.location.href = next;
    return;
  }
  window.location.href = fallback;
}
