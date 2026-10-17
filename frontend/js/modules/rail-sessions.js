import { chatSession, ROUTES } from "./paths.js";
import {
  bindSessionListInteractions,
  closeAllMenus,
  mountSessionSortControl,
  renderSessionListInto,
} from "./session-list-ui.js";
import { getActiveSessionId, updateSession } from "./sessions.js";

/** Fill left-rail chat list; click opens that chat. */
export function mountRailSessionList() {
  const listEl = document.querySelector("[data-session-list]");
  const emptyListEl = document.querySelector("[data-session-empty]");
  const sortEl = document.querySelector("[data-session-sort]");
  if (!listEl) return;

  const paint = () => {
    closeAllMenus(document);
    const sessions = renderSessionListInto(listEl, {
      activeId: getActiveSessionId(),
      asLink: true,
    });
    if (emptyListEl) emptyListEl.hidden = sessions.length > 0;
  };

  paint();
  mountSessionSortControl(sortEl, paint);

  const rail = listEl.closest(".rail") || document;
  bindSessionListInteractions(rail, {
    onChange: paint,
    onRename: (id) => {
      const title = window.prompt("Новое название чата");
      if (title == null) return;
      const next = String(title).trim();
      if (!next) return;
      updateSession(id, { title: next });
      paint();
    },
    onDeleted: () => {
      // stay on profile / current page
    },
  });
}

/** "+ Новый чат" on profile → chat create dialog */
export function mountRailNewChatNav() {
  document.querySelectorAll("[data-create-session]").forEach((btn) => {
    if (btn.dataset.railNavBound === "1") return;
    btn.dataset.railNavBound = "1";
    if (document.querySelector("#session-dialog")) return;
    btn.addEventListener("click", () => {
      window.location.href = `${ROUTES.chat}?new=1`;
    });
  });
}

export { chatSession };
