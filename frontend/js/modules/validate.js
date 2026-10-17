/** Shared client-side validation aligned with backend Pydantic rules. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FOCUS = new Set(["university", "job", "adapt"]);

export const LIMITS = {
  nameMin: 2,
  nameMax: 80,
  passwordMin: 8,
  passwordMax: 128,
};

/**
 * @param {{ name?: string, email?: string, password?: string, focus?: string, passwordOptional?: boolean }} input
 * @returns {string|null} first error message or null
 */
export function validateAuthFields(input = {}) {
  if ("name" in input) {
    const name = String(input.name ?? "").trim();
    if (name.length < LIMITS.nameMin) return "Имя: минимум 2 символа";
    if (name.length > LIMITS.nameMax) return "Имя: максимум 80 символов";
  }

  if ("email" in input) {
    const email = String(input.email ?? "").trim();
    if (!email) return "Укажи email";
    if (!EMAIL_RE.test(email)) return "Некорректный email";
  }

  if ("password" in input) {
    const password = String(input.password ?? "");
    const optional = Boolean(input.passwordOptional);
    if (!password && optional) {
      /* ok — leave unchanged */
    } else {
      if (password.length < LIMITS.passwordMin) return "Пароль: минимум 8 символов";
      if (password.length > LIMITS.passwordMax) return "Пароль: максимум 128 символов";
    }
  }

  if ("focus" in input && input.focus != null && input.focus !== "") {
    if (!FOCUS.has(String(input.focus))) return "Выбери сценарий: вуз, работа или адаптация";
  }

  return null;
}

export function formatApiError(error, fallback = "Ошибка запроса") {
  const message = error?.message || String(error || "");
  if (!message || message === "Request failed") return fallback;

  const map = {
    "Email already registered": "Этот email уже зарегистрирован",
    "Invalid email or password": "Неверный email или пароль",
    "Current password is incorrect": "Неверный текущий пароль",
    "current_password is required to change password": "Укажи текущий пароль",
    "Authentication required": "Войди в аккаунт, чтобы продолжить",
    "Nothing to update": "Нет изменений для сохранения",
    "User not found": "Пользователь не найден",
  };
  return map[message] || message;
}
