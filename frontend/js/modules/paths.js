export const ROUTES = {
  home: "/site/",
  product: "/site/#scenarios",
  login: "/site/login/",
  register: "/site/register/",
  profile: "/platform/profile/",
  chat: "/platform/chat/",
  learn: "/platform/learn/",
  admin: "/platform/admin/",
};

export function chatSession(id) {
  return `/platform/chat/${encodeURIComponent(id)}`;
}

export function parseChatSessionId(pathname = window.location.pathname) {
  const match = pathname.match(/^\/platform\/chat\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function loginWithNext(path) {
  const target = resolveNext(path) || ROUTES.chat;
  return `${ROUTES.login}?next=${encodeURIComponent(target)}`;
}

/**
 * Resolve post-login redirect. Only same-origin /site and /platform paths.
 */
export function resolveNext(raw) {
  if (raw == null) return null;
  let path;
  try {
    path = decodeURIComponent(String(raw).trim());
  } catch {
    return null;
  }
  if (!path) return null;
  // Block absolute / protocol-relative / backslash tricks
  if (/^https?:/i.test(path) || path.startsWith("//") || path.includes("\\")) return null;

  const hashIndex = path.indexOf("#");
  const queryIndex = path.indexOf("?");
  let suffix = "";
  let base = path;
  if (hashIndex >= 0) {
    suffix = path.slice(hashIndex);
    base = path.slice(0, hashIndex);
  } else if (queryIndex >= 0) {
    suffix = path.slice(queryIndex);
    base = path.slice(0, queryIndex);
  }

  const legacy = {
    "chat.html": ROUTES.chat,
    "./chat.html": ROUTES.chat,
    "profile.html": ROUTES.profile,
    "./profile.html": ROUTES.profile,
    "product.html": ROUTES.product,
    "./product.html": ROUTES.product,
    "login.html": ROUTES.login,
    "./login.html": ROUTES.login,
    "register.html": ROUTES.register,
    "./register.html": ROUTES.register,
    "index.html": ROUTES.home,
    "./index.html": ROUTES.home,
    "/": ROUTES.home,
  };
  if (legacy[base]) return legacy[base] + (legacy[base].includes("#") ? "" : suffix);

  if (!base.startsWith("/")) {
    base = `/${base.replace(/^\.\//, "")}`;
  }
  // Only allow app routes
  if (!/^\/(site|platform)(\/|$)/.test(base)) return null;
  if (base.startsWith("//")) return null;
  return `${base}${suffix}`;
}

export function isPlatformPath(pathname = window.location.pathname) {
  return pathname.startsWith("/platform");
}
