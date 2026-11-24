const KEY = "pv-theme";
const LIGHT_BG = "#f2f2f2";
const DARK_BG = "#000000";

export function getTheme() {
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
}

export function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  const root = document.documentElement;
  root.dataset.theme = next;
  root.style.backgroundColor = next === "dark" ? DARK_BG : LIGHT_BG;
  root.style.colorScheme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === "dark" ? DARK_BG : LIGHT_BG;
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    const dark = next === "dark";
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    btn.setAttribute("aria-label", dark ? "Включить светлую тему" : "Включить тёмную тему");
  });
  return next;
}

export function toggleTheme() {
  const next = getTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(KEY, next);
  return applyTheme(next);
}

export function initTheme() {
  applyTheme(getTheme());
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => toggleTheme());
  });
}

initTheme();
