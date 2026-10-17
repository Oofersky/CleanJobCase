import { confirmAction } from "./confirm-dialog.js";
import { chatSession } from "./paths.js";
import {
  getModeLabel,
  getScenarioLabel,
  getSessionSort,
  setSessionSort,
  togglePinSession,
  updateSession,
  deleteSession,
  listSessions,
} from "./sessions.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(ts) {
  if (!ts) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "";
  }
}

const ICON_MORE = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="3" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="13" r="1.4" fill="currentColor"/></svg>`;
const ICON_PIN = `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M9.7 2.2 13.8 6.3a1 1 0 0 1-.2 1.6l-2.1.8-.8 3.3a1 1 0 0 1-1.7.4L6.5 9.6 3.2 13 2 11.8l3.4-3.3-2.8-2.5a1 1 0 0 1 .4-1.7l3.3-.8.8-2.1a1 1 0 0 1 1.6-.2Z"/></svg>`;

/**
 * @param {object} session
 * @param {{ activeId?: string|null, asLink?: boolean }} opts
 */
export function buildSessionItemHtml(session, { activeId = null, asLink = false } = {}) {
  const active = activeId === session.id;
  const pinned = Boolean(session.pinned);
  const meta = `${getScenarioLabel(session.scenario)} · ${getModeLabel(session.mode)}`;
  const when = formatDate(session.updatedAt || session.createdAt);
  const mainTag = asLink ? "a" : "button";
  const mainAttrs = asLink
    ? `href="${chatSession(session.id)}"`
    : `type="button" data-open-session="${escapeHtml(session.id)}"`;

  return `
    <li class="session-item${active ? " is-active" : ""}${pinned ? " is-pinned" : ""}" data-session-id="${escapeHtml(session.id)}">
      <${mainTag} class="session-item__main" ${mainAttrs}>
        ${pinned ? `<span class="session-item__pin" title="Закреплён">${ICON_PIN}</span>` : ""}
        <span class="session-item__copy">
          <strong class="session-item__title">${escapeHtml(session.title)}</strong>
          <span class="session-item__meta">${escapeHtml(meta)}</span>
          <time class="session-item__time" datetime="${new Date(session.updatedAt || session.createdAt || Date.now()).toISOString()}">${escapeHtml(when)}</time>
        </span>
      </${mainTag}>
      <div class="session-item__menu">
        <button
          type="button"
          class="session-item__more"
          data-session-menu="${escapeHtml(session.id)}"
          aria-label="Действия с чатом"
          aria-haspopup="menu"
          aria-expanded="false"
        >${ICON_MORE}</button>
        <div class="session-menu" role="menu" hidden data-session-menu-panel="${escapeHtml(session.id)}">
          <button type="button" role="menuitem" data-session-pin="${escapeHtml(session.id)}">
            ${pinned ? "Открепить" : "Закрепить"}
          </button>
          <button type="button" role="menuitem" data-session-rename="${escapeHtml(session.id)}">Переименовать</button>
          <button type="button" role="menuitem" class="is-danger" data-session-delete="${escapeHtml(session.id)}">Удалить</button>
        </div>
      </div>
    </li>
  `;
}

export function renderSessionListInto(listEl, { activeId = null, asLink = false } = {}) {
  if (!listEl) return listSessions();
  const sessions = listSessions();
  const signature = sessions
    .map((s) => `${s.id}:${s.title}:${s.pinned ? 1 : 0}:${s.updatedAt || 0}`)
    .join("|");

  // Avoid empty-frame flash: only rebuild DOM when list content actually changed
  if (listEl.dataset.listSig === signature && listEl.children.length === sessions.length) {
    listEl.querySelectorAll(".session-item").forEach((li) => {
      const id = li.dataset.sessionId;
      li.classList.toggle("is-active", id === activeId);
    });
    return sessions;
  }

  listEl.dataset.listSig = signature;
  const html = sessions
    .map((session) => buildSessionItemHtml(session, { activeId, asLink }))
    .join("");
  listEl.replaceChildren();
  if (html) {
    listEl.insertAdjacentHTML("afterbegin", html);
  }
  return sessions;
}

function clearMenuPosition(panel) {
  if (!panel) return;
  panel.classList.remove("is-fixed");
  panel.style.top = "";
  panel.style.left = "";
  panel.style.right = "";
  panel.style.bottom = "";
  if (panel.dataset.menuHome && panel.parentElement === document.body) {
    const home = document.querySelector(panel.dataset.menuHome);
    if (home) home.appendChild(panel);
  }
}

function placeMenuPanel(panel, anchorBtn) {
  if (!panel || !anchorBtn) return;
  const wrap = anchorBtn.closest(".session-item__menu, .session-actions");
  if (wrap && !panel.dataset.menuHome) {
    const marker = `menu-home-${Math.random().toString(36).slice(2, 9)}`;
    wrap.dataset.menuSlot = marker;
    panel.dataset.menuHome = `[data-menu-slot="${marker}"]`;
  }
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }

  panel.classList.add("is-fixed");
  // Measure after attach so height is real
  const rect = anchorBtn.getBoundingClientRect();
  const menuWidth = Math.max(176, panel.offsetWidth || 176);
  const menuHeight = panel.offsetHeight || 140;
  const gap = 4;
  const pad = 8;

  let top = rect.bottom + gap;
  let left = rect.right - menuWidth;

  if (left < pad) left = pad;
  if (left + menuWidth > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - menuWidth - pad);
  }
  if (top + menuHeight > window.innerHeight - pad && rect.top - gap - menuHeight > pad) {
    top = rect.top - gap - menuHeight;
  }

  panel.style.top = `${Math.round(top)}px`;
  panel.style.left = `${Math.round(left)}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
}

function closeAllMenus(root = document) {
  const panels = [
    ...document.querySelectorAll("[data-session-menu-panel]"),
    ...(root === document ? [] : [...root.querySelectorAll("[data-session-menu-panel]")]),
  ];
  const seen = new Set();
  panels.forEach((panel) => {
    if (seen.has(panel)) return;
    seen.add(panel);
    panel.hidden = true;
    clearMenuPosition(panel);
  });
  document.querySelectorAll("[data-session-menu]").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll(".session-item.is-menu-open, .session-actions.is-menu-open").forEach((el) => {
    el.classList.remove("is-menu-open");
  });
}

/**
 * Bind ⋯ menus once on a container. Callbacks optional.
 * @param {ParentNode} root
 * @param {{
 *   onChange?: () => void,
 *   onRename?: (sessionId: string) => void,
 *   onDeleted?: (sessionId: string) => void,
 * }} handlers
 */
export function bindSessionListInteractions(root, handlers = {}) {
  if (!root || root.dataset.sessionMenusBound === "1") return;
  root.dataset.sessionMenusBound = "1";

  const sessionsScroll = root.querySelector?.(".rail__sessions") || null;

  root.addEventListener("click", async (event) => {
    const moreBtn = event.target.closest("[data-session-menu]");
    if (moreBtn && root.contains(moreBtn)) {
      event.preventDefault();
      event.stopPropagation();
      const wrap = moreBtn.closest(".session-item__menu, .session-actions");
      const sessionKey = moreBtn.dataset.sessionMenu;
      const panel =
        wrap?.querySelector("[data-session-menu-panel]") ||
        document.querySelector(`[data-session-menu-panel="${CSS.escape(sessionKey)}"]`);
      const item = moreBtn.closest(".session-item, .session-actions");
      const willOpen = Boolean(panel?.hidden);
      closeAllMenus(root);
      if (panel && willOpen) {
        panel.hidden = false;
        moreBtn.setAttribute("aria-expanded", "true");
        item?.classList.add("is-menu-open");
        placeMenuPanel(panel, moreBtn);
      }
      return;
    }

    if (!event.target.closest("[data-session-menu-panel]")) {
      closeAllMenus(root);
    }
  });

  // Panels teleport to body — handle actions on document
  document.addEventListener("click", async (event) => {
    const pinBtn = event.target.closest("[data-session-pin]");
    if (pinBtn) {
      event.preventDefault();
      event.stopPropagation();
      togglePinSession(pinBtn.dataset.sessionPin);
      closeAllMenus(root);
      handlers.onChange?.();
      return;
    }

    const renameBtn = event.target.closest("[data-session-rename]");
    if (renameBtn) {
      event.preventDefault();
      event.stopPropagation();
      closeAllMenus(root);
      handlers.onRename?.(renameBtn.dataset.sessionRename);
      return;
    }

    const deleteBtn = event.target.closest("[data-session-delete]");
    if (deleteBtn) {
      event.preventDefault();
      event.stopPropagation();
      const id = deleteBtn.dataset.sessionDelete;
      closeAllMenus(root);
      const ok = await confirmAction({
        title: "Удалить чат?",
        lead: "Чат будет удалён без восстановления.",
        confirmLabel: "Удалить",
        danger: true,
      });
      if (!ok) return;
      deleteSession(id);
      handlers.onDeleted?.(id);
      handlers.onChange?.();
      return;
    }

    if (
      !root.contains(event.target) &&
      !event.target.closest?.("[data-session-menu-panel]") &&
      !event.target.closest?.("[data-session-menu]")
    ) {
      closeAllMenus(root);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllMenus(root);
  });

  const closeOnScrollOrResize = () => closeAllMenus(root);
  sessionsScroll?.addEventListener("scroll", closeOnScrollOrResize, { passive: true });
  window.addEventListener("resize", closeOnScrollOrResize);
}

export function mountSessionSortControl(selectEl, onChange) {
  if (!selectEl) return;
  selectEl.value = getSessionSort();
  if (selectEl.dataset.sortBound === "1") return;
  selectEl.dataset.sortBound = "1";
  selectEl.addEventListener("change", () => {
    setSessionSort(selectEl.value);
    onChange?.();
  });
}

export { updateSession, formatDate, escapeHtml, closeAllMenus };
