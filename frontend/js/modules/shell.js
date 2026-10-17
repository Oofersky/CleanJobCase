import { clearSession, getStoredUser } from "./api.js";
import { confirmAction } from "./confirm-dialog.js";
import { loginWithNext, ROUTES } from "./paths.js";

export function getUser() {
  return getStoredUser();
}

export function setUser(user) {
  localStorage.setItem("mentorai_user", JSON.stringify(user));
}

export function clearUser() {
  clearSession();
}

function userInitial(name) {
  const text = String(name || "М").trim();
  return (text.charAt(0) || "М").toUpperCase();
}

function bindLogout(root) {
  root?.querySelectorAll("[data-logout]").forEach((btn) => {
    if (btn.dataset.logoutBound === "1") return;
    btn.dataset.logoutBound = "1";
    btn.addEventListener("click", async () => {
      const ok = await confirmAction({
        title: "Выйти из аккаунта?",
        lead: "Прогресс и чаты сохранены на сервере. На этом устройстве локальный кэш будет очищен.",
        confirmLabel: "Выйти",
        danger: true,
      });
      if (!ok) return;
      clearUser();
      window.location.href = ROUTES.home;
    });
  });
}

export { bindLogout };

/**
 * Classic marketing chrome for /site (not ChatGPT rail).
 * Logout lives only on /platform/profile — like ChatGPT settings.
 * @param {{ active?: string }} opts
 */
export function mountSiteChrome({ active = "home" } = {}) {
  const header = document.querySelector("[data-site-header]");
  const footer = document.querySelector("[data-site-footer]");
  const user = getUser();
  document.body.dataset.zone = "site";

  if (header) {
    header.innerHTML = `
      <a class="brand" href="${ROUTES.home}" aria-label="MentOrAI">
        <img class="brand__mark" src="/assets/brand/logo-mark.png" alt="" width="36" height="36" />
        <span class="brand__name">MentOrAI</span>
      </a>
      <div class="site-header__right">
        <nav class="nav" aria-label="Сайт">
          <a class="nav__link${active === "home" ? " is-active" : ""}" href="${ROUTES.home}">Главная</a>
          <a class="nav__link${active === "product" ? " is-active" : ""}" href="${ROUTES.home}#scenarios">Сценарии</a>
          ${
            user
              ? `<a class="nav__link" href="${ROUTES.chat}">Платформа</a>`
              : `<a class="nav__link${active === "login" ? " is-active" : ""}" href="${ROUTES.login}">Вход</a>`
          }
        </nav>
        ${
          user
            ? `<a class="account-chip" href="${ROUTES.profile}" title="Профиль">
                 <span class="account-chip__avatar" aria-hidden="true">${escapeAttr(userInitial(user.name))}</span>
                 <span class="account-chip__name">${escapeAttr(user.name || "Профиль")}</span>
               </a>`
            : `<a class="btn btn--accent btn--sm" href="${loginWithNext(ROUTES.chat)}">Начать практику</a>`
        }
      </div>
    `;
  }

  if (footer) {
    footer.innerHTML = `
      <div class="footer-grid">
        <p class="disclaimer">
          Рекомендации информационные и не заменяют официальные требования вузов и работодателей.
        </p>
        <div class="footer-links">
          <a href="${ROUTES.home}#scenarios">Сценарии</a>
          <a href="${user ? ROUTES.chat : loginWithNext(ROUTES.chat)}">Практика</a>
          ${user ? `<a href="${ROUTES.profile}">Профиль</a>` : `<a href="${ROUTES.register}">Регистрация</a>`}
        </div>
      </div>
    `;
  }
}

/**
 * ChatGPT-like shell for /platform only.
 * Rail shows account chip → profile; logout only on profile page.
 * @param {{ active?: string, zone?: "site" | "platform", stageTitle?: string }} opts
 */
export function mountShell({ active, zone = "platform", stageTitle = "MentOrAI" } = {}) {
  const root = document.querySelector("[data-app-shell]");
  const railHost = document.querySelector("[data-shell-rail]");
  const topHost = document.querySelector("[data-shell-top]");
  const user = getUser();
  document.body.dataset.zone = zone;

  if (railHost) {
    const onProfile = active === "profile";
    const accountBlock = user
      ? onProfile
        ? `
        <div class="rail__account">
          <div class="account-chip account-chip--static" aria-current="page">
            <span class="account-chip__avatar" aria-hidden="true">${escapeAttr(userInitial(user.name))}</span>
            <span class="account-chip__name">${escapeAttr(user.name || "Профиль")}</span>
          </div>
          <button class="btn btn--ghost btn--sm rail__logout" type="button" data-logout>Выйти</button>
        </div>`
        : `
        <a class="account-chip" href="${ROUTES.profile}" title="Профиль">
          <span class="account-chip__avatar" aria-hidden="true">${escapeAttr(userInitial(user.name))}</span>
          <span class="account-chip__name">${escapeAttr(user.name || "Профиль")}</span>
        </a>`
      : `<a class="rail__link" href="${ROUTES.login}">Вход</a>`;

    railHost.innerHTML = `
      <a class="rail__brand" href="${ROUTES.chat}" aria-label="MentOrAI">
        <img src="/assets/brand/logo-mark.png" alt="" width="28" height="28" />
        <span>MentOrAI</span>
      </a>
      <button class="btn btn--accent rail__new" type="button" data-create-session>+ Новый чат</button>
      <div class="rail__chats-head">
        <p class="rail__label">Чаты</p>
        <label class="rail__sort">
          <span class="sr-only">Сортировка</span>
          <select data-session-sort aria-label="Сортировка чатов">
            <option value="updated">По дате изменения</option>
            <option value="created">По дате создания</option>
          </select>
        </label>
      </div>
      <div class="rail__sessions">
        <ul class="session-list" data-session-list></ul>
        <p class="session-panel__empty" data-session-empty>Пока нет чатов</p>
      </div>
      <div class="rail__foot">
        ${accountBlock}
      </div>
    `;

    bindLogout(railHost);
  }

  if (topHost) {
    topHost.innerHTML = `
      <button class="btn btn--ghost btn--sm stage__menu" type="button" data-toggle-rail aria-label="Меню">☰</button>
      <strong>${escapeAttr(stageTitle)}</strong>
    `;
  }

  if (root) {
    const toggle = () => root.classList.toggle("rail-open");
    root.querySelector(".rail-backdrop")?.addEventListener("click", toggle);
    topHost?.querySelector("[data-toggle-rail]")?.addEventListener("click", toggle);
  }
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
