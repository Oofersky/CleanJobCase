import { getToken } from "./modules/api.js";
import { initPageMotion } from "./modules/motion.js";
import { mountShell } from "./modules/shell.js";
import { mountRailNewChatNav, mountRailSessionList } from "./modules/rail-sessions.js";

const TOKEN_KEY = "mentorai_admin_token";
const SCENARIO_LABELS = {
  university: "Выбор вуза",
  job: "Первая работа",
  adapt: "Первый месяц",
};

// Prototype: no site login gate — unlock with ADMIN_TOKEN only.
// If the user already has a session, the rail just shows their account chip.
{
  mountShell({ zone: "platform", active: "admin", stageTitle: "Админка" });
  if (getToken()) {
    mountRailSessionList();
    mountRailNewChatNav();
  }
  initPageMotion();

  const gate = document.querySelector("[data-admin-gate]");
  const panel = document.querySelector("[data-admin-panel]");
  const tokenInput = document.querySelector("[data-admin-token]");
  const unlockBtn = document.querySelector("[data-admin-unlock]");
  const gateStatus = document.querySelector("[data-admin-gate-status]");
  const targetEl = document.querySelector("[data-admin-target]");
  const jsonEl = document.querySelector("[data-admin-json]");
  const statusEl = document.querySelector("[data-admin-status]");
  const reloadBtn = document.querySelector("[data-admin-reload-file]");
  const saveBtn = document.querySelector("[data-admin-save]");
  const hotReloadBtn = document.querySelector("[data-admin-hot-reload]");
  const kpiEl = document.querySelector("[data-admin-kpi]");
  const barsEl = document.querySelector("[data-admin-scenario-bars]");
  const flaggedEl = document.querySelector("[data-admin-flagged]");
  const recentEl = document.querySelector("[data-admin-recent]");
  const flashEl = document.querySelector("[data-admin-flash]");
  const navButtons = [...document.querySelectorAll("[data-admin-view]")];
  const viewPanels = [...document.querySelectorAll("[data-view-panel]")];

  let telemetryCache = null;
  let flashTimer = 0;

  function setFlash(text, kind = "") {
    if (!flashEl) return;
    window.clearTimeout(flashTimer);
    flashEl.hidden = !text;
    flashEl.textContent = text || "";
    flashEl.classList.toggle("is-error", kind === "error");
    flashEl.classList.toggle("is-ok", kind === "ok");
    if (text && kind === "ok") {
      flashTimer = window.setTimeout(() => {
        flashEl.hidden = true;
        flashEl.textContent = "";
      }, 2200);
    }
  }

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function setGateStatus(text, kind = "") {
    if (!gateStatus) return;
    gateStatus.textContent = text || "";
    gateStatus.classList.toggle("is-error", kind === "error");
    gateStatus.classList.toggle("is-ok", kind === "ok");
  }

  function setStatus(text, kind = "") {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.classList.toggle("is-error", kind === "error");
    statusEl.classList.toggle("is-ok", kind === "ok");
  }

  async function adminFetch(path, { method = "GET", body } = {}) {
    const headers = {
      "Content-Type": "application/json",
      "X-Admin-Token": token(),
    };
    const response = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      const detail = typeof data?.detail === "string" ? data.detail : "Ошибка запроса";
      throw new Error(detail);
    }
    return data;
  }

  function showPanel() {
    if (gate) gate.hidden = true;
    if (panel) panel.hidden = false;
  }

  function setView(name) {
    navButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.adminView === name);
    });
    viewPanels.forEach((el) => {
      el.hidden = el.dataset.viewPanel !== name;
    });
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }

  function renderTelemetry(data) {
    telemetryCache = data;
    const kpi = data?.kpi || {};
    if (kpiEl) {
      kpiEl.innerHTML = `
        <article class="admin-kpi__card">
          <p class="admin-kpi__label">Лайки</p>
          <p class="admin-kpi__value">${kpi.likes ?? 0}</p>
        </article>
        <article class="admin-kpi__card admin-kpi__card--warn">
          <p class="admin-kpi__label">Дизлайки</p>
          <p class="admin-kpi__value">${kpi.dislikes ?? 0}</p>
        </article>
        <article class="admin-kpi__card">
          <p class="admin-kpi__label">Доля лайков</p>
          <p class="admin-kpi__value">${kpi.like_rate ?? 0}%</p>
        </article>
        <article class="admin-kpi__card">
          <p class="admin-kpi__label">Флаги для ИИ</p>
          <p class="admin-kpi__value">${kpi.flagged_answers ?? 0}</p>
        </article>
      `;
    }

    if (barsEl) {
      const by = data?.by_scenario || {};
      const keys = ["university", "job", "adapt"];
      barsEl.innerHTML = keys
        .map((key) => {
          const like = by[key]?.like || 0;
          const dislike = by[key]?.dislike || 0;
          const total = like + dislike || 1;
          const likePct = Math.round((like / total) * 100);
          const dislikePct = Math.round((dislike / total) * 100);
          return `
            <div class="admin-scenario-bars__row">
              <span>${escapeHtml(SCENARIO_LABELS[key] || key)}</span>
              <div class="admin-scenario-bars__track" aria-hidden="true">
                <span class="admin-scenario-bars__like" style="width:${likePct}%"></span>
                <span class="admin-scenario-bars__dislike" style="width:${dislikePct}%"></span>
              </div>
              <span>${like} / ${dislike}</span>
            </div>
          `;
        })
        .join("");
    }

    if (flaggedEl) {
      const flagged = data?.flagged || [];
      if (!flagged.length) {
        flaggedEl.innerHTML =
          '<p class="admin-empty">Пока нет ответов с несколькими дизлайками. Как появятся — ИИ начнёт их избегать.</p>';
      } else {
        flaggedEl.innerHTML = flagged
          .map(
            (item) => `
            <article class="admin-flag__item">
              <p class="admin-flag__meta">
                <span>${escapeHtml(SCENARIO_LABELS[item.scenario] || item.scenario)}</span>
                <span>${item.dislike_count} дизлайк · ${item.like_count} лайк</span>
              </p>
              <p class="admin-flag__text">${escapeHtml(item.excerpt)}</p>
            </article>
          `
          )
          .join("");
      }
    }

    if (recentEl) {
      const recent = data?.recent || [];
      if (!recent.length) {
        recentEl.innerHTML =
          '<tr><td colspan="5"><p class="admin-empty">Оценок ещё нет — поставь лайк/дизлайк в чате.</p></td></tr>';
      } else {
        recentEl.innerHTML = recent
          .map((row) => {
            const pill =
              row.rating === "like"
                ? '<span class="admin-pill admin-pill--like">лайк</span>'
                : '<span class="admin-pill admin-pill--dislike">дизлайк</span>';
            return `
              <tr>
                <td>${pill}</td>
                <td>${escapeHtml(SCENARIO_LABELS[row.scenario] || row.scenario)}</td>
                <td>${escapeHtml(row.mode)}</td>
                <td>${escapeHtml(row.excerpt)}</td>
                <td>${escapeHtml(formatWhen(row.updated_at))}</td>
              </tr>
            `;
          })
          .join("");
      }
    }
  }

  async function loadTelemetry() {
    const data = await adminFetch("/api/admin/telemetry");
    renderTelemetry(data);
    return data;
  }

  async function unlock() {
    const value = String(tokenInput?.value || "").trim();
    if (!value) {
      setGateStatus("Вставь ADMIN_TOKEN из .env", "error");
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, value);
    try {
      await adminFetch("/api/admin/status");
      setGateStatus("Доступ открыт", "ok");
      if (tokenInput) tokenInput.value = "";
      showPanel();
      setView("overview");
      await loadTelemetry();
      await loadFile();
    } catch (error) {
      sessionStorage.removeItem(TOKEN_KEY);
      setGateStatus(String(error?.message || "Неверный токен"), "error");
    }
  }

  async function loadFile() {
    const target = targetEl?.value || "catalog";
    setStatus("Загрузка…");
    try {
      if (target === "catalog") {
        const data = await adminFetch("/api/admin/catalog");
        jsonEl.value = JSON.stringify(data, null, 2);
      } else {
        const data = await adminFetch(`/api/admin/scenarios/${encodeURIComponent(target)}`);
        jsonEl.value = JSON.stringify(data, null, 2);
      }
      setStatus("Файл загружен", "ok");
    } catch (error) {
      setStatus(String(error?.message || "Ошибка"), "error");
    }
  }

  async function saveFile() {
    const target = targetEl?.value || "catalog";
    setStatus("Сохранение…");
    try {
      const parsed = JSON.parse(String(jsonEl?.value || ""));
      if (target === "catalog") {
        await adminFetch("/api/admin/catalog", {
          method: "PUT",
          body: { sources: parsed.sources || parsed },
        });
      } else {
        await adminFetch(`/api/admin/scenarios/${encodeURIComponent(target)}`, {
          method: "PUT",
          body: { data: parsed },
        });
      }
      setStatus("Сохранено, база перезагружена", "ok");
    } catch (error) {
      setStatus(String(error?.message || "Ошибка сохранения"), "error");
    }
  }

  async function hotReload() {
    setStatus("Перезагрузка…");
    try {
      await adminFetch("/api/admin/reload", { method: "POST" });
      setStatus("База знаний перезагружена", "ok");
    } catch (error) {
      setStatus(String(error?.message || "Ошибка"), "error");
    }
  }

  unlockBtn?.addEventListener("click", unlock);
  tokenInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") unlock();
  });
  reloadBtn?.addEventListener("click", loadFile);
  saveBtn?.addEventListener("click", saveFile);
  hotReloadBtn?.addEventListener("click", hotReload);
  targetEl?.addEventListener("change", () => {
    if (token()) loadFile();
  });

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.adminView || "overview"));
  });

  document.querySelectorAll("[data-admin-refresh-telemetry]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const label = btn.textContent;
      const siblings = [...document.querySelectorAll("[data-admin-refresh-telemetry]")];
      siblings.forEach((item) => {
        item.disabled = true;
        item.textContent = "Обновляю…";
      });
      setFlash("");
      try {
        await loadTelemetry();
        setFlash("Данные обновлены", "ok");
      } catch (error) {
        setFlash(String(error?.message || "Не удалось обновить"), "error");
      } finally {
        siblings.forEach((item) => {
          item.disabled = false;
          item.textContent = label || "Обновить";
        });
      }
    });
  });

  if (token()) {
    // Re-validate stored token without echoing it into the password field
    (async () => {
      try {
        await adminFetch("/api/admin/status");
        setGateStatus("Доступ открыт", "ok");
        showPanel();
        setView("overview");
        await loadTelemetry();
        await loadFile();
      } catch {
        sessionStorage.removeItem(TOKEN_KEY);
        setGateStatus("Сессия админки истекла — введи токен снова", "error");
      }
    })();
  }

  // keep unused lint quiet in case cache empty during first paint
  void telemetryCache;
}
