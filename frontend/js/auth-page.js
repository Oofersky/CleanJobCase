import { login, register, setSession, getToken, getStoredUser } from "./modules/api.js";
import { redirectAfterAuth } from "./modules/auth-guard.js";
import { initPageMotion } from "./modules/motion.js";
import { ROUTES } from "./modules/paths.js";
import { mountSiteChrome } from "./modules/shell.js";
import { formatApiError, validateAuthFields } from "./modules/validate.js";

const isLogin = Boolean(document.getElementById("login-form"));
mountSiteChrome({ active: isLogin ? "login" : "register" });
initPageMotion();

if (getToken() || getStoredUser()) {
  redirectAfterAuth(ROUTES.chat);
}

function showError(form, message) {
  const el = form.querySelector("[data-error]");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("is-visible", Boolean(message));
}

function setLoading(form, loading) {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "Секунду…" : btn.dataset.label || btn.textContent;
}

function nextQuery() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next ? `?next=${encodeURIComponent(next)}` : "";
}

function localSession({ name, email }) {
  const user = {
    id: `local-${Date.now()}`,
    name,
    email,
    focus: "university",
    progress: {
      sessions: 0,
      byScenario: { university: 0, job: 0, adapt: 0 },
      weakZones: [],
      notes: [],
      signals: [],
    },
  };
  const token = `local.${encodeURIComponent(email)}.${Date.now()}`;
  setSession({ access_token: token, user });
  return user;
}

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

document.querySelectorAll(`a[href="${ROUTES.register}"]`).forEach((link) => {
  link.href = `${ROUTES.register}${nextQuery()}`;
});
document.querySelectorAll(`a[href="${ROUTES.login}"]`).forEach((link) => {
  link.href = `${ROUTES.login}${nextQuery()}`;
});

if (loginForm) {
  const btn = loginForm.querySelector('button[type="submit"]');
  if (btn) btn.dataset.label = "Войти";
}
if (registerForm) {
  const btn = registerForm.querySelector('button[type="submit"]');
  if (btn) btn.dataset.label = "Создать аккаунт";
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(loginForm, "");
  const email = loginForm.email.value.trim();
  const password = loginForm.password.value;
  const invalid = validateAuthFields({ email, password });
  if (invalid) {
    showError(loginForm, invalid);
    return;
  }

  setLoading(loginForm, true);
  try {
    const data = await login({ email, password });
    setSession(data);
    redirectAfterAuth(ROUTES.chat);
  } catch (error) {
    showError(loginForm, formatApiError(error, "Неверный email или пароль"));
  } finally {
    setLoading(loginForm, false);
  }
});

registerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(registerForm, "");
  const payload = {
    name: registerForm.name.value.trim(),
    email: registerForm.email.value.trim(),
    password: registerForm.password.value,
  };
  const invalid = validateAuthFields(payload);
  if (invalid) {
    showError(registerForm, invalid);
    return;
  }

  setLoading(registerForm, true);
  try {
    const data = await register(payload);
    setSession(data);
    redirectAfterAuth(`${ROUTES.chat}?mode=trainer`);
  } catch (error) {
    // Offline / API down — local session only after explicit validation passed
    if (String(error.message || "").includes("Failed to fetch") || error.message === "Request failed") {
      localSession(payload);
      redirectAfterAuth(`${ROUTES.chat}?mode=trainer`);
      return;
    }
    showError(registerForm, formatApiError(error, "Не удалось создать аккаунт"));
  } finally {
    setLoading(registerForm, false);
  }
});
