import { sendChat } from "./modules/api.js";
import { requireAuth } from "./modules/auth-guard.js";
import { createChat } from "./modules/chat.js";
import { confirmAction } from "./modules/confirm-dialog.js";
import { pushOpinion } from "./modules/feedback-sync.js";
import { initPageMotion, pulse } from "./modules/motion.js";
import { chatSession, parseChatSessionId, ROUTES } from "./modules/paths.js";
import {
  applyProgressUpdate,
  enrichGreeting,
  getAdaptivePrompts,
} from "./modules/progress.js";
import {
  hydratePracticeFromServer,
  pushMessage,
  pushProgress,
  pushSessionCreated,
  pushSessionDeleted,
  pushSessionUpdated,
} from "./modules/remote-sync.js";
import {
  bindSessionListInteractions,
  closeAllMenus,
  mountSessionSortControl,
  renderSessionListInto,
} from "./modules/session-list-ui.js";
import { createVoice } from "./modules/voice.js";
import { getGreeting, getPrompts, simulateReply } from "./modules/simulate.js";
import { getUser, setUser, mountShell } from "./modules/shell.js";
import {
  listSessions,
  getActiveSession,
  getSession,
  setActiveSession,
  clearActiveSession,
  createSession,
  updateSession,
  deleteSession,
  appendMessage,
  togglePinSession,
  getScenarioLabel,
  getModeLabel,
  setMessageRating,
} from "./modules/sessions.js";

if (requireAuth()) {
  mountShell({ zone: "platform", active: "chat", stageTitle: "Чат" });
  initPageMotion();

  const listEl = document.querySelector("[data-session-list]");
  const emptyListEl = document.querySelector("[data-session-empty]");
  const practiceRoot = document.querySelector(".gpt-shell");
  const practiceEmpty = document.querySelector("[data-practice-empty]");
  const chatView = document.querySelector("[data-chat-view]");
  const voiceFallbackEl = document.querySelector("[data-voice-fallback]");
  const chatDisclaimer = document.querySelector("[data-chat-disclaimer]");
  const promptsEl = document.querySelector("[data-prompts]");
  const titleEl = document.querySelector("[data-active-title]");
  const scenarioLabel = document.querySelector("[data-scenario-label]");
  const modeLabel = document.querySelector("[data-mode-label]");
  const input = document.querySelector("#message-input");
  const form = document.querySelector("#composer");
  const dialog = document.querySelector("#session-dialog");
  const sessionForm = document.querySelector("#session-form");
  const dialogTitle = document.querySelector("#session-dialog-title");
  const dialogSubmit = document.querySelector("[data-dialog-submit]");
  const titleInput = document.querySelector("#session-title");
  const scenarioSelect = document.querySelector("#session-scenario");
  const modeSelect = document.querySelector("#session-mode");
  const spectrumEl = document.querySelector("[data-voice-spectrum]");
  const spectrumBarsEl = document.querySelector("[data-spectrum-bars]");
  const voiceLabel = document.querySelector("[data-voice-label]");
  const voiceBtn = document.querySelector("#voice-btn");
  const trainerProgressEl = document.querySelector("[data-trainer-progress]");
  const trainerProgressLabel = document.querySelector("[data-trainer-progress-label]");
  const trainerProgressSteps = document.querySelector("[data-trainer-progress-steps]");
  const trainerProgressBar = document.querySelector("[data-trainer-progress-bar]");
  const trainerProgressFill = document.querySelector("[data-trainer-progress-fill]");
  const trainerCompleteEl = document.querySelector("[data-trainer-complete]");
  const trainerRestartBtn = document.querySelector("[data-trainer-restart]");

  const chat = createChat(document.querySelector("#chat-stream"));
  let busy = false;
  let dialogMode = "create";
  const spectrumBars = [];
  let voiceListening = false;
  let voice = null;

  function trainerTotal(session) {
    const n = Number(session?.totalCases);
    return Number.isFinite(n) && n > 0 ? n : 5;
  }

  function isTrainerDone(session) {
    if (!session || session.mode !== "trainer") return false;
    if (session.trainerCompleted) return true;
    return Number(session.caseIndex) >= trainerTotal(session);
  }

  function applyTrainerState(session, reply) {
    if (!session || session.mode !== "trainer" || !reply) return session;
    const total =
      typeof reply.total_cases === "number" && reply.total_cases > 0
        ? reply.total_cases
        : trainerTotal(session);
    const completed = Boolean(reply.trainer_completed);
    let caseIndex = session.caseIndex || 0;
    if (completed) {
      caseIndex = total;
    } else if (typeof reply.next_case_index === "number") {
      caseIndex = Math.max(0, reply.next_case_index);
    }
    return updateSession(session.id, {
      caseIndex,
      totalCases: total,
      trainerCompleted: completed,
    });
  }

  function syncTrainerChrome(session) {
    const isTrainer = session?.mode === "trainer";
    const done = isTrainerDone(session);
    const total = trainerTotal(session);
    const rawIndex = Number(session?.caseIndex) || 0;
    const current = done ? total : Math.min(total, Math.max(1, rawIndex + 1));

    if (trainerProgressEl) {
      trainerProgressEl.hidden = !isTrainer;
      if (isTrainer) {
        if (trainerProgressLabel) {
          trainerProgressLabel.textContent = done
            ? `Тренажёр завершён · ${total} из ${total}`
            : `Кейс ${current} из ${total}`;
        }
        if (trainerProgressBar) {
          trainerProgressBar.setAttribute("aria-valuemax", String(total));
          trainerProgressBar.setAttribute("aria-valuenow", String(current));
          trainerProgressBar.setAttribute(
            "aria-valuetext",
            done ? `Завершено, ${total} из ${total}` : `Кейс ${current} из ${total}`
          );
        }
        if (trainerProgressFill) {
          trainerProgressFill.style.width = `${Math.round((current / total) * 100)}%`;
        }
        if (trainerProgressSteps) {
          trainerProgressSteps.innerHTML = "";
          for (let i = 1; i <= total; i += 1) {
            const li = document.createElement("li");
            li.className = "trainer-progress__step";
            if (done || i < current) li.classList.add("is-done");
            else if (i === current) li.classList.add("is-current");
            li.title = `Кейс ${i}`;
            trainerProgressSteps.appendChild(li);
          }
        }
      }
    }

    if (trainerCompleteEl) {
      trainerCompleteEl.hidden = !(isTrainer && done);
    }

    if (form) {
      form.hidden = Boolean(isTrainer && done);
      form.setAttribute("aria-hidden", String(Boolean(isTrainer && done)));
    }
    if (input) {
      input.placeholder = isTrainer
        ? done
          ? "Круг завершён"
          : "Ответ на текущий кейс…"
        : "Напиши или надиктуй…";
    }
  }

  function ensureSpectrumBars(count = 28) {
    if (!spectrumBarsEl) return;
    if (spectrumBars.length === count && spectrumBarsEl.childElementCount === count) return;
    spectrumBarsEl.innerHTML = "";
    spectrumBars.length = 0;
    for (let i = 0; i < count; i += 1) {
      const bar = document.createElement("span");
      bar.className = "voice-spectrum__bar";
      bar.style.transform = "scaleY(0.12)";
      spectrumBarsEl.appendChild(bar);
      spectrumBars.push(bar);
    }
  }

  function setSpectrumVisible(visible) {
    if (!spectrumEl) return;
    spectrumEl.classList.toggle("is-on", visible);
    spectrumEl.hidden = !visible;
    spectrumEl.setAttribute("aria-hidden", String(!visible));
  }

  function resizeComposer() {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(140, Math.max(48, input.scrollHeight))}px`;
  }

  function applyVoiceDraft(text, { partial = false } = {}) {
    if (!input) return;
    const next = String(text || "");
    if (input.value !== next) {
      input.value = next;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    resizeComposer();
    if (!partial && next) {
      input.focus();
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch {
        /* ignore */
      }
    }
  }

  function paintSpectrum(levels = []) {
    if (!voiceListening) {
      setSpectrumVisible(false);
      spectrumBars.forEach((bar) => {
        bar.style.transform = "scaleY(0.12)";
      });
      return;
    }
    setSpectrumVisible(true);
    ensureSpectrumBars(levels.length || 28);
    spectrumBars.forEach((bar, index) => {
      const value = Math.min(1, Math.max(0.08, levels[index] || 0));
      bar.style.transform = `scaleY(${value})`;
    });
  }

  function trackProgress(scenario, userText, reply) {
    const user = getUser();
    if (!user) return;
    const next = applyProgressUpdate(user, { scenario, userText, reply });
    setUser(next);
    pushProgress(next.progress);
  }

  function historyPayload(session) {
    return (session?.messages || [])
      .slice(-10)
      .map((msg) => ({ role: msg.role === "bot" ? "bot" : "user", text: String(msg.text || "") }))
      .filter((msg) => msg.text.trim());
  }

  async function resolveReply(payload) {
    const progress = getUser()?.progress;
    const weak_zones = progress?.weakZones || [];
    const body = {
      ...payload,
      weak_zones,
      history: Array.isArray(payload.history) ? payload.history : historyPayload(getActiveSession()),
    };
    try {
      return await sendChat(body);
    } catch (error) {
      const message = String(error?.message || "");
      if (message.includes("Слишком много") || message.includes("429")) {
        return {
          text: "Слишком много запросов подряд. Подожди около минуты и напиши снова.",
          tags: [],
          sources: [],
        };
      }
      console.warn("[MentOrAI] /api/chat failed, local fallback:", message);
      return simulateReply(body);
    }
  }

  function formatDate(ts) {
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

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function renderPrompts(session) {
    promptsEl.innerHTML = "";
    if (!session) return;
    if (isTrainerDone(session)) return;
    if ((session.messages || []).some((m) => m.role === "user")) return;

    const progress = getUser()?.progress;
    const prompts = getAdaptivePrompts(
      progress,
      session.scenario,
      session.mode,
      getPrompts(session.scenario, session.mode)
    );

    prompts.forEach((text) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = text;
      btn.addEventListener("click", () => {
        if (!input || form?.hidden) return;
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        resizeComposer();
        input.focus();
        const end = input.value.length;
        try {
          input.setSelectionRange(end, end);
        } catch {
          /* ignore */
        }
      });
      promptsEl.appendChild(btn);
    });
  }

  function renderMessages(session, { animate = false } = {}) {
    const stream = document.querySelector("#chat-stream");
    const messages = session.messages || [];
    if (!stream) return;

    // Build into an offscreen node, then swap once — no empty flash between chats
    const staging = document.createElement("div");
    const stagingChat = createChat(staging);

    if (!messages.length) {
      staging.innerHTML =
        '<div class="chat__empty" data-empty>Сессия готова. Напиши сообщение или выбери подсказку.</div>';
    } else {
      messages.forEach((msg, msgIndex) => {
        if (msg.role === "user") {
          const row = stagingChat.appendUser(msg.text);
          if (!animate) row.classList.remove("msg--enter-user");
        } else {
          stagingChat.appendBot(
            {
              text: msg.text,
              tags: msg.tags || [],
              sources: msg.sources || [],
              rating: msg.rating || null,
            },
            {
              animate: false,
              onRate: (value) => {
                setMessageRating(session.id, msgIndex, value);
                pushOpinion({
                  sessionId: session.id,
                  messageIndex: msgIndex,
                  rating: value,
                  messageText: msg.text,
                  scenario: session.scenario,
                  mode: session.mode,
                  tags: msg.tags || [],
                });
              },
            }
          );
        }
      });
    }

    stream.replaceChildren(...staging.childNodes);
  }

  function syncActiveView(session, { preserveStream = false } = {}) {
    const hasSession = Boolean(session);
    if (!hasSession && voiceListening) {
      voice?.stop?.();
      voiceListening = false;
    }

    // Update chrome first; never flash empty practice shell when switching sessions
    if (session) {
      practiceEmpty.hidden = true;
      chatView.hidden = false;
      if (chatDisclaimer) chatDisclaimer.hidden = false;
      practiceRoot?.classList.remove("practice--idle");
      practiceRoot?.classList.add("practice--active");
      titleEl.textContent = session.title;
      scenarioLabel.textContent = getScenarioLabel(session.scenario);
      modeLabel.textContent = getModeLabel(session.mode);
      const pinBtn = document.querySelector("[data-active-pin]");
      if (pinBtn) pinBtn.textContent = session.pinned ? "Открепить" : "Закрепить";
      if (!preserveStream) renderMessages(session, { animate: false });
      renderPrompts(session);
      syncTrainerChrome(session);
      return;
    }

    practiceEmpty.hidden = false;
    chatView.hidden = true;
    if (chatDisclaimer) chatDisclaimer.hidden = true;
    practiceRoot?.classList.add("practice--idle");
    practiceRoot?.classList.remove("practice--active");
    titleEl.textContent = "";
    scenarioLabel.textContent = "";
    modeLabel.textContent = "";
    chat.clear();
    promptsEl.innerHTML = "";
    setSpectrumVisible(false);
    syncTrainerChrome(null);
  }

  function syncChatUrl(sessionId) {
    const target = sessionId ? chatSession(sessionId) : ROUTES.chat;
    const current = window.location.pathname.replace(/\/+$/, "") || "/";
    const normalized = target.replace(/\/+$/, "") || "/";
    if (current !== normalized) {
      history.replaceState(null, "", target);
    }
  }

  function applyRouteSession() {
    const routeSessionId = parseChatSessionId();
    if (!routeSessionId) {
      clearActiveSession();
      return;
    }
    if (getSession(routeSessionId)) {
      setActiveSession(routeSessionId);
      return;
    }
    history.replaceState(null, "", ROUTES.chat);
    clearActiveSession();
  }

  function renderSessionList({ preserveStream = false } = {}) {
    closeAllMenus(document);
    const active = getActiveSession();
    syncChatUrl(active?.id || null);
    const sessions = renderSessionListInto(listEl, {
      activeId: active?.id || null,
      asLink: false,
    });
    emptyListEl.hidden = sessions.length > 0;
    syncActiveView(active, { preserveStream });
  }

  function openDialog(mode, session = null) {
    dialogMode = mode;
    dialogTitle.textContent = mode === "edit" ? "Изменить чат" : "Новый чат";
    dialogSubmit.textContent = mode === "edit" ? "Сохранить" : "Открыть чат";
    titleInput.value = session?.title || "";
    scenarioSelect.value = session?.scenario || "university";
    modeSelect.value = session?.mode || "info";
    sessionForm.dataset.editId = session?.id || "";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    titleInput.focus();
  }

  function closeDialog() {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  async function bootSession(session) {
    if (!session) return;
    if ((session.messages || []).length) {
      setActiveSession(session.id);
      renderSessionList();
      return;
    }

    const progress = getUser()?.progress;
    const greet = enrichGreeting(
      getGreeting(session.scenario, session.mode),
      progress,
      session.scenario,
      session.mode
    );
    if (session.mode === "trainer") {
      updateSession(session.id, {
        caseIndex: typeof session.caseIndex === "number" ? session.caseIndex : 0,
        totalCases: greet.total_cases || session.totalCases || 5,
        trainerCompleted: false,
      });
    }
    const greetMsg = {
      role: "bot",
      text: greet.text,
      tags: [],
      sources: greet.sources || [],
      phase: greet.trainer_phase || null,
    };
    appendMessage(session.id, greetMsg);
    pushMessage(session.id, greetMsg);
    setActiveSession(session.id);
    renderSessionList();
  }

  async function submitText(raw) {
    const session = getActiveSession();
    if (!session) return;

    const text = String(raw || "").trim();
    if (!text || busy) return;

    if (isTrainerDone(session)) {
      const meta = text.toLowerCase().trim().replace(/[.!?…]+$/g, "");
      const restartOk = ["заново", "сначала", "пройти ещё раз", "пройти еще раз", "restart", "начать заново"].includes(
        meta
      );
      if (!restartOk) {
        syncTrainerChrome(session);
        return;
      }
    }

    busy = true;
    const sendBtn = form.querySelector('button[type="submit"]');
    const sendLabel = sendBtn?.textContent || "Отправить";
    form.classList.add("composer--busy");
    input.disabled = true;
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.classList.add("btn--loading");
      sendBtn.innerHTML = '<span class="btn__spinner" aria-hidden="true"></span><span>Генерация…</span>';
    }
    if (voiceBtn) voiceBtn.disabled = true;

    const priorHistory = historyPayload(session);
    chat.appendUser(text);
    const userMsg = { role: "user", text, tags: [] };
    appendMessage(session.id, userMsg);
    pushMessage(session.id, userMsg);
    input.value = "";
    resizeComposer();
    promptsEl.innerHTML = "";

    const typing = chat.showTyping();
    const started = Date.now();
    const reply = await resolveReply({
      text,
      scenario: session.scenario,
      mode: session.mode,
      case_index: session.mode === "trainer" ? session.caseIndex || 0 : 0,
      history: priorHistory,
    });

    // Keep "thinking" visible at least ~0.9s so generation never feels instant
    const elapsed = Date.now() - started;
    if (elapsed < 900) await new Promise((r) => setTimeout(r, 900 - elapsed));

    chat.removeTyping(typing);
    // Tags only on mentor feedback messages (AI), never on the user turn
    const mentorTags =
      session.mode === "trainer" && reply.trainer_phase === "present" ? [] : reply.tags || [];
    const botMsg = {
      role: "bot",
      text: reply.text,
      tags: mentorTags,
      sources: reply.sources || [],
      rating: null,
      phase: reply.trainer_phase || null,
    };
    appendMessage(session.id, botMsg);
    const stored = getSession(session.id);
    const botIndex = (stored?.messages || []).length - 1;
    await chat.streamBot({
      text: reply.text,
      tags: mentorTags,
      sources: reply.sources || [],
      rating: null,
      onRate: (value) => {
        if (botIndex < 0) return;
        setMessageRating(session.id, botIndex, value);
        pushOpinion({
          sessionId: session.id,
          messageIndex: botIndex,
          rating: value,
          messageText: reply.text,
          scenario: session.scenario,
          mode: session.mode,
          tags: mentorTags,
        });
      },
    });
    pushMessage(session.id, botMsg);
    if (session.mode === "trainer") {
      const updated = applyTrainerState(session, reply);
      if (updated) pushSessionUpdated(updated);
    }
    trackProgress(session.scenario, text, reply);
    renderSessionList({ preserveStream: true });
    busy = false;
    form.classList.remove("composer--busy");
    input.disabled = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.classList.remove("btn--loading");
      sendBtn.textContent = sendLabel;
    }
    if (voiceBtn) voiceBtn.disabled = false;
    input.focus();
  }

  document.querySelectorAll("[data-create-session]").forEach((btn) => {
    btn.addEventListener("click", () => {
      pulse(btn);
      openDialog("create");
    });
  });

  trainerRestartBtn?.addEventListener("click", () => {
    pulse(trainerRestartBtn);
    if (busy) return;
    if (form) form.hidden = false;
    void submitText("заново");
  });

  document.querySelector("[data-dialog-cancel]")?.addEventListener("click", () => closeDialog());

  const shellRoot = document.querySelector("[data-app-shell]") || document;

  document.querySelector("[data-edit-session]")?.addEventListener("click", () => {
    closeAllMenus(shellRoot);
    const session = getActiveSession();
    if (session) openDialog("edit", session);
  });

  document.querySelector("[data-active-pin]")?.addEventListener("click", () => {
    closeAllMenus(shellRoot);
    const session = getActiveSession();
    if (!session) return;
    togglePinSession(session.id);
    renderSessionList({ preserveStream: true });
  });

  document.querySelector("[data-delete-session]")?.addEventListener("click", async () => {
    closeAllMenus(shellRoot);
    const session = getActiveSession();
    if (!session) return;
    const ok = await confirmAction({
      title: "Удалить чат?",
      lead: `«${session.title}» будет удалён без восстановления.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    deleteSession(session.id);
    pushSessionDeleted(session.id);
    renderSessionList();
  });

  mountSessionSortControl(document.querySelector("[data-session-sort]"), () => {
    renderSessionList({ preserveStream: true });
  });
  bindSessionListInteractions(shellRoot, {
    onChange: () => {
      renderSessionList({ preserveStream: true });
    },
    onRename: (id) => {
      const session = getSession(id);
      if (session) openDialog("edit", session);
    },
    onDeleted: (id) => {
      pushSessionDeleted(id);
      renderSessionList();
    },
  });

  listEl.addEventListener("click", (event) => {
    const openBtn = event.target.closest("[data-open-session]");
    if (!openBtn) return;
    const nextId = openBtn.dataset.openSession;
    if (!nextId || nextId === getActiveSession()?.id) return;
    setActiveSession(nextId);
    renderSessionList({ preserveStream: false });
  });

  sessionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      title: titleInput.value.trim(),
      scenario: scenarioSelect.value,
      mode: modeSelect.value,
    };

    if (dialogMode === "edit" && sessionForm.dataset.editId) {
      const updated = updateSession(sessionForm.dataset.editId, payload);
      pushSessionUpdated(updated);
      setActiveSession(sessionForm.dataset.editId);
      closeDialog();
      renderSessionList();
      return;
    }

    const session = createSession(payload);
    closeDialog();
    await pushSessionCreated(session);
    await bootSession(session);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitText(input.value);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitText(input.value);
    }
  });

  ensureSpectrumBars(28);
  setSpectrumVisible(false);
  if (spectrumEl) spectrumEl.classList.remove("is-on");

  function showVoiceFallback(message) {
    if (!voiceFallbackEl) return;
    voiceFallbackEl.hidden = !message;
    voiceFallbackEl.textContent = message || "";
    if (message) input?.focus();
  }

  function clearVoiceFallback() {
    showVoiceFallback("");
  }

  voice = createVoice({
    onStatus: (status) => {
      const voiceBtn = document.querySelector("#voice-btn");
      const voiceIcon = document.querySelector("#voice-icon");
      voiceListening = status === "listen";
      if (voiceBtn) voiceBtn.setAttribute("aria-pressed", String(voiceListening));
      if (voiceIcon) {
        voiceIcon.src = voiceListening
          ? "/assets/icons/voice-listen.png"
          : "/assets/icons/voice-idle.png";
      }
      if (voiceLabel) {
        voiceLabel.textContent = voiceListening
          ? "Идёт запись… нажми микрофон ещё раз, чтобы остановить"
          : "";
      }
      if (voiceListening) clearVoiceFallback();
      setSpectrumVisible(voiceListening);
      if (!voiceListening) {
        paintSpectrum([]);
      } else {
        ensureSpectrumBars(28);
      }
    },
    onLevels: (levels) => {
      if (!voiceListening) return;
      paintSpectrum(levels);
    },
    onDraft: (text, meta = {}) => {
      // Always push live transcript into the field while listening / after stop
      applyVoiceDraft(text, meta);
    },
    onError: (code) => {
      voiceListening = false;
      setSpectrumVisible(false);
      if (code === "not-allowed" || code === "service-not-allowed") {
        const msg =
          "Нет доступа к микрофону. Разреши его в браузере или просто напиши ответ текстом.";
        if (voiceBtn) voiceBtn.title = msg;
        showVoiceFallback(msg);
        return;
      }
      if (code === "unsupported") {
        const msg =
          "Голос недоступен в этом браузере. Удобнее Chrome — или пиши текстом в поле ниже.";
        if (voiceBtn) {
          voiceBtn.title = msg;
          voiceBtn.disabled = true;
          voiceBtn.setAttribute("aria-disabled", "true");
        }
        showVoiceFallback(msg);
        return;
      }
      showVoiceFallback("Голос сбойнул — продолжай текстом в поле сообщения.");
    },
  });

  if (voice && !voice.supported) {
    showVoiceFallback(
      "Голос недоступен в этом браузере. Удобнее Chrome — или пиши текстом в поле ниже."
    );
    if (voiceBtn) {
      voiceBtn.disabled = true;
      voiceBtn.setAttribute("aria-disabled", "true");
      voiceBtn.title = "Голосовой ввод недоступен — используй текст";
    }
  }

  voiceBtn?.addEventListener("click", () => {
    if (!getActiveSession()) return;
    if (!voice.supported) {
      showVoiceFallback(
        "Голос недоступен в этом браузере. Удобнее Chrome — или пиши текстом в поле ниже."
      );
      return;
    }
    clearVoiceFallback();
    voiceBtn.title = "Голосовой ввод";
    voice.toggle();
  });

  input?.addEventListener("input", () => {
    resizeComposer();
  });

  window.addEventListener("popstate", () => {
    applyRouteSession();
    renderSessionList();
  });

  (async () => {
    await hydratePracticeFromServer();
    applyRouteSession();

    const params = new URLSearchParams(window.location.search);
    const prefScenario = params.get("scenario");
    const prefMode = params.get("mode");
    const wantsNew = params.get("new") === "1";
    if (wantsNew || ((prefScenario || prefMode) && !getActiveSession())) {
      openDialog("create");
      if (prefScenario) scenarioSelect.value = prefScenario;
      if (prefMode) modeSelect.value = prefMode;
      history.replaceState(null, "", ROUTES.chat);
    }

    renderSessionList();
  })();
}
