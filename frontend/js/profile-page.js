import {
  downloadExportPdf,
  fetchMe,
  getToken,
  refreshRecommendations,
  setSession,
  updateMe,
} from "/js/modules/api.js?v=20261007-telemetry";
import { requireAuth } from "/js/modules/auth-guard.js?v=20261007-telemetry";
import { confirmAction } from "/js/modules/confirm-dialog.js?v=20261007-telemetry";
import { initPageMotion, pulse } from "/js/modules/motion.js?v=20261007-telemetry";
import { loginWithNext, ROUTES } from "/js/modules/paths.js?v=20261007-telemetry";
import { emptyProgress } from "/js/modules/progress.js?v=20261007-telemetry";
import {
  hydratePracticeFromServer,
  pushProgress,
} from "/js/modules/remote-sync.js?v=20261007-telemetry";
import { mountRailNewChatNav, mountRailSessionList } from "/js/modules/rail-sessions.js?v=20261007-telemetry";
import { listSessions } from "/js/modules/sessions.js?v=20261007-telemetry";
import { getUser, setUser, mountShell, bindLogout } from "/js/modules/shell.js?v=20261007-telemetry";
import { formatApiError, validateAuthFields } from "/js/modules/validate.js?v=20261007-telemetry";

if (!requireAuth(ROUTES.profile)) {
  /* redirect in progress */
} else {
  const SCENARIO_LABELS = {
    university: "Выбор вуза",
    job: "Первая работа",
    adapt: "Первый месяц",
  };

  mountShell({ zone: "platform", active: "profile", stageTitle: "Профиль" });
  bindLogout(document);
  mountRailSessionList();
  mountRailNewChatNav();
  initPageMotion();

  const stats = document.querySelector("[data-stats]");
  const weak = document.querySelector("[data-weak]");
  const notes = document.querySelector("[data-notes]");
  const editDialog = document.querySelector("#profile-edit-dialog");
  const settingsDialog = document.querySelector("#settings-dialog");
  const form = document.querySelector("#profile-form");
  const passwordForm = document.querySelector("#password-form");
  const errorEl = document.querySelector("[data-profile-error]");
  const passwordErrorEl = document.querySelector("[data-password-error]");
  const nameInput = document.querySelector("#profile-name");
  const focusSelect = document.querySelector("#profile-focus");
  const passwordCurrentInput = document.querySelector("#settings-password-current");
  const passwordInput = document.querySelector("#settings-password");
  const passwordConfirmInput = document.querySelector("#settings-password-confirm");
  const cardName = document.querySelector("[data-profile-name]");
  const cardEmail = document.querySelector("[data-profile-email]");
  const cardFocus = document.querySelector("[data-profile-focus]");
  const cardAvatar = document.querySelector("[data-profile-avatar]");
  const settingsEmail = document.querySelector("[data-settings-email]");

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function userInitial(name) {
    return (String(name || "М").trim().charAt(0) || "М").toUpperCase();
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-visible", Boolean(message));
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function paintCard(user) {
    if (cardName) cardName.textContent = user.name || "Профиль";
    if (cardEmail) cardEmail.textContent = user.email || "";
    if (cardFocus) cardFocus.textContent = SCENARIO_LABELS[user.focus] || "Сценарий не выбран";
    if (cardAvatar) cardAvatar.textContent = userInitial(user.name);
    if (settingsEmail) settingsEmail.textContent = user.email || "—";
    const emailMirror = document.querySelector("[data-settings-email-mirror]");
    if (emailMirror) emailMirror.value = user.email || "";
  }

  function fillEditForm(user) {
    if (nameInput) nameInput.value = user.name || "";
    if (focusSelect) focusSelect.value = SCENARIO_LABELS[user.focus] ? user.focus : "university";
    showError(errorEl, "");
  }

  function buildReport(user, progress) {
    const sessions = listSessions().slice(0, 8);
    return {
      userName: user.name,
      focusLabel: SCENARIO_LABELS[user.focus] || user.focus,
      weakZones: progress.weakZones || [],
      notes: progress.notes || [],
      session_ids: sessions.map((session) => session.id).filter(Boolean),
    };
  }

  function renderProgress(user) {
    const progress = { ...emptyProgress(), ...(user.progress || {}) };

    stats.innerHTML = `
    <li><span>Сессий</span><strong>${progress.sessions || 0}</strong></li>
    <li><span>Выбор вуза</span><strong>${progress.byScenario?.university || 0}</strong></li>
    <li><span>Первая работа</span><strong>${progress.byScenario?.job || 0}</strong></li>
    <li><span>Первый месяц</span><strong>${progress.byScenario?.adapt || 0}</strong></li>
  `;

    const zones = progress.weakZones?.length
      ? progress.weakZones
      : ["Пока пусто. После практики здесь появятся темы для повторения."];
    weak.innerHTML = zones.map((z) => `<li>${escapeHtml(z)}</li>`).join("");

    const noteItems = progress.notes?.length ? progress.notes : ["Пока нет сохранённых рекомендаций."];
    notes.innerHTML = noteItems.map((n) => `<p class="note-item">${escapeHtml(n)}</p>`).join("");

    return progress;
  }

  function refreshShell() {
    mountShell({ zone: "platform", active: "profile", stageTitle: "Профиль" });
    bindLogout(document);
    mountRailSessionList();
    mountRailNewChatNav();
  }

  async function hydrate() {
    let user = getUser();
    const token = getToken();
    if (token && !String(token).startsWith("local.")) {
      try {
        const me = await fetchMe();
        user = { ...user, ...me, progress: user?.progress };
        setUser(user);
        await hydratePracticeFromServer();
        user = getUser() || user;
      } catch {
        if (!user) window.location.href = loginWithNext(ROUTES.profile);
      }
    }

    if (!user) return;

    mountRailSessionList();
    paintCard(user);

    function currentReport() {
      const fresh = getUser() || user;
      const progress = {
        ...emptyProgress(),
        ...(fresh.progress || {}),
      };
      return buildReport(fresh, progress);
    }

    renderProgress(getUser() || user);

    const refreshBtns = [...document.querySelectorAll("[data-refresh-progress]")];
    const recoStatus = document.querySelector("[data-reco-status]");
    const weakStatus = document.querySelector("[data-weak-status]");

    async function refreshFromSessions(sourceBtn) {
      const fresh = getUser() || user;
      const progress = { ...emptyProgress(), ...(fresh.progress || {}) };
      refreshBtns.forEach((btn) => {
        btn.disabled = true;
      });
      if (recoStatus) recoStatus.textContent = "Смотрю новые сессии…";
      if (weakStatus) weakStatus.textContent = "Смотрю новые сессии…";
      try {
        const data = await refreshRecommendations({
          scenario: fresh.focus || "university",
          weak_zones: progress.weakZones || [],
          notes: progress.notes || [],
          focus_label: SCENARIO_LABELS[fresh.focus] || fresh.focus || "",
        });
        const next = {
          ...fresh,
          progress: {
            ...progress,
            notes: data.notes || [],
            weakZones: data.weak_zones?.length ? data.weak_zones : progress.weakZones || [],
          },
        };
        setUser(next);
        pushProgress(next.progress);
        renderProgress(next);
        const ok =
          data.source === "gigachat"
            ? "Обновлено на основе новых сессий."
            : "Обновлено по диалогам из сессий.";
        if (recoStatus) recoStatus.textContent = ok;
        if (weakStatus) weakStatus.textContent = ok;
        if (sourceBtn) pulse(sourceBtn);
      } catch (error) {
        const msg = formatApiError(error) || "Не удалось обновить";
        if (recoStatus) recoStatus.textContent = msg;
        if (weakStatus) weakStatus.textContent = msg;
      } finally {
        refreshBtns.forEach((btn) => {
          btn.disabled = false;
        });
      }
    }

    refreshBtns.forEach((btn) => {
      btn.addEventListener("click", () => refreshFromSessions(btn));
    });

    document.querySelector("[data-edit-profile]")?.addEventListener("click", () => {
      fillEditForm(user);
      openDialog(editDialog);
      nameInput?.focus();
    });

    document.querySelector("[data-edit-cancel]")?.addEventListener("click", () => {
      closeDialog(editDialog);
    });

    document.querySelector("[data-open-settings]")?.addEventListener("click", () => {
      paintCard(user);
      showError(passwordErrorEl, "");
      if (passwordCurrentInput) passwordCurrentInput.value = "";
      if (passwordInput) passwordInput.value = "";
      if (passwordConfirmInput) passwordConfirmInput.value = "";
      openDialog(settingsDialog);
    });

    document.querySelector("[data-settings-close]")?.addEventListener("click", () => {
      closeDialog(settingsDialog);
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      showError(errorEl, "");
      const name = nameInput.value.trim();
      const focus = focusSelect.value;
      const invalid = validateAuthFields({ name, focus });
      if (invalid) {
        showError(errorEl, invalid);
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Сохраняю…";
      }

      try {
        const payload = { name, focus };
        if (token && !String(token).startsWith("local.")) {
          const updated = await updateMe(payload);
          user = { ...user, ...updated, progress: user.progress };
          setSession({ access_token: token, user });
          setUser(user);
        } else {
          user = { ...user, name, focus };
          setUser(user);
          const storedToken = token || `local.${encodeURIComponent(user.email || "guest")}`;
          setSession({ access_token: storedToken, user });
        }
        paintCard(user);
        refreshShell();
        closeDialog(editDialog);
      } catch (error) {
        showError(errorEl, formatApiError(error, "Не удалось сохранить"));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.label || "Сохранить";
        }
      }
    });

    passwordForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      showError(passwordErrorEl, "");
      const currentPassword = passwordCurrentInput?.value || "";
      const password = passwordInput.value;
      const confirm = passwordConfirmInput.value;
      const invalidCurrent = validateAuthFields({ password: currentPassword });
      if (invalidCurrent) {
        showError(passwordErrorEl, "Укажи текущий пароль");
        return;
      }
      const invalid = validateAuthFields({ password });
      if (invalid) {
        showError(passwordErrorEl, invalid);
        return;
      }
      if (password !== confirm) {
        showError(passwordErrorEl, "Пароли не совпадают");
        return;
      }

      if (!token || String(token).startsWith("local.")) {
        showError(passwordErrorEl, "Смена пароля доступна только для серверного аккаунта");
        return;
      }

      const submitBtn = passwordForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Сохраняю…";
      }

      try {
        await updateMe({ password, current_password: currentPassword });
        if (passwordCurrentInput) passwordCurrentInput.value = "";
        passwordInput.value = "";
        passwordConfirmInput.value = "";
        closeDialog(settingsDialog);
        await confirmAction({
          title: "Пароль обновлён",
          lead: "Новый пароль сохранён.",
          confirmLabel: "Понятно",
          notice: true,
        });
      } catch (error) {
        showError(passwordErrorEl, formatApiError(error, "Не удалось сменить пароль"));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.label || "Сменить пароль";
        }
      }
    });

    async function exportPdf(kind, button) {
      pulse(button);
      const label = button?.textContent || (kind === "notes" ? "Скачать заметки" : "Скачать отчёт");
      const busyLabel = kind === "notes" ? "Заметки…" : "Отчёт…";
      if (button) {
        button.disabled = true;
        button.classList.add("btn--loading");
        button.innerHTML = `<span class="btn__spinner" aria-hidden="true"></span><span>${busyLabel}</span>`;
      }
      try {
        // Sync latest weak zones / notes to server so PDF matches the profile panel
        const fresh = getUser() || user;
        if (fresh?.progress) {
          await pushProgress(fresh.progress);
        }
        const report = currentReport();
        await downloadExportPdf({
          kind,
          focusLabel: report.focusLabel,
          session_ids: kind === "report" ? report.session_ids : [],
        });
      } catch (error) {
        await confirmAction({
          title: kind === "notes" ? "Не удалось скачать заметки" : "Не удалось скачать отчёт",
          lead: formatApiError(
            error,
            "Файл собирается на сервере из твоих рекомендаций и сессий. Сначала нажми «Обновить на основе новых сессий», затем скачай снова."
          ),
          confirmLabel: "Понятно",
          notice: true,
        });
      } finally {
        if (button) {
          button.disabled = false;
          button.classList.remove("btn--loading");
          button.textContent = label;
        }
      }
    }

    document.querySelector("[data-export-pdf]")?.addEventListener("click", (event) => {
      exportPdf("report", event.currentTarget);
    });

    document.querySelector("[data-export]")?.addEventListener("click", (event) => {
      exportPdf("notes", event.currentTarget);
    });
  }

  hydrate();
}
