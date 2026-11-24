import "./theme.js";
import { api, getAuthStatus } from "./api.js";

const params = new URLSearchParams(location.search);
const next = params.get("next") || "/platform/";

const loginForm = document.getElementById("form-login");
const registerForm = document.getElementById("form-register");
const loginError = document.getElementById("login-error");
const registerError = document.getElementById("register-error");

function showError(el, message) {
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function safeNext(url) {
  if (!url || !url.startsWith("/") || url.startsWith("//")) return "/platform/";
  return url;
}

document.querySelectorAll("[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    loginForm.hidden = tab !== "login";
    registerForm.hidden = tab !== "register";
    showError(loginError, "");
    showError(registerError, "");
  });
});

function setBusy(form, on) {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle("is-busy", on);
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError(loginError, "");
  const fd = new FormData(loginForm);
  setBusy(loginForm, true);
  try {
    await api("/api/auth/login", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        login: String(fd.get("login") || "").trim(),
        password: String(fd.get("password") || ""),
      }),
    });
    location.replace(safeNext(next));
  } catch (err) {
    const msg =
      err?.name === "TimeoutError" || err?.name === "AbortError"
        ? "Сервер не отвечает — подождите и попробуйте ещё раз"
        : err.message || "Не удалось войти";
    showError(loginError, msg);
    setBusy(loginForm, false);
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError(registerError, "");
  const fd = new FormData(registerForm);
  setBusy(registerForm, true);
  try {
    await api("/api/auth/register", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        login: String(fd.get("login") || "").trim(),
        email: String(fd.get("email") || "").trim(),
        password: String(fd.get("password") || ""),
      }),
    });
    location.replace(safeNext(next));
  } catch (err) {
    const msg =
      err?.name === "TimeoutError" || err?.name === "AbortError"
        ? "Сервер не отвечает — подождите и попробуйте ещё раз"
        : err.message || "Не удалось зарегистрироваться";
    showError(registerError, msg);
    setBusy(registerForm, false);
  }
});

document.getElementById("auth-forgot")?.addEventListener("click", (e) => {
  e.preventDefault();
  showError(loginError, "Сброс пароля пока недоступен — войдите с известным паролем или зарегистрируйтесь.");
});

getAuthStatus().then((status) => {
  if (status.authenticated) location.replace(safeNext(next));
});
