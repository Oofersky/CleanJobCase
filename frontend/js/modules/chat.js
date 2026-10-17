import { markdownToPlain, renderMarkdown } from "./markdown.js";
import { safeHttpUrl } from "./safe-url.js";
import { isSpeaking, speakText, stopSpeaking, ttsSupported } from "./tts.js";

const FEEDBACK_ICONS = {
  ok: {
    src: "/assets/icons/feedback-correct.png",
    className: "tag--ok",
    label: "Это верно",
  },
  improve: {
    src: "/assets/icons/feedback-improve.png",
    className: "tag--improve",
    label: "Вот что можно улучшить",
  },
  example: {
    src: "/assets/icons/feedback-example.png",
    className: "tag--example",
    label: "Вот удачный пример ответа",
  },
};

/** Lucide outline icons — readable at 20px, tint via currentColor. */
const ICON_SPEAK = `<svg class="msg__action-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
const ICON_SPEAK_STOP = `<svg class="msg__action-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><rect x="16" y="8" width="5" height="8" rx="1" fill="currentColor" stroke="none"/></svg>`;
const ICON_LIKE = `<svg class="msg__action-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>`;
const ICON_DISLIKE = `<svg class="msg__action-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>`;

function ensureStream(stream) {
  const empty = stream.querySelector("[data-empty]");
  if (empty) empty.remove();
}

function avatar() {
  const img = document.createElement("img");
  img.className = "msg__avatar";
  img.src = "/assets/icons/bot-avatar.png";
  img.alt = "";
  img.width = 40;
  img.height = 40;
  return img;
}

function playEnter(row, enterClass) {
  row.classList.remove(enterClass);
  void row.offsetWidth;
  requestAnimationFrame(() => {
    row.classList.add(enterClass);
  });
}

function preferReduceMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildFeedbackMeta(tags, { animate = true } = {}) {
  const feedbackTags = Array.isArray(tags) ? tags.filter((t) => FEEDBACK_ICONS[t]) : [];
  if (!feedbackTags.length) return null;

  const meta = document.createElement("div");
  meta.className = "msg__meta msg__meta--mentor";
  meta.setAttribute("aria-label", "Разбор ответа наставником");

  const title = document.createElement("p");
  title.className = "msg__feedback-title";
  title.textContent = "Разбор ответа";
  meta.appendChild(title);

  feedbackTags.forEach((key, index) => {
    const conf = FEEDBACK_ICONS[key];
    const tag = document.createElement("span");
    tag.className = `tag ${conf.className}${animate ? " tag--enter" : ""}`;
    tag.style.setProperty("--tag-delay", `${80 + index * 70}ms`);
    const icon = document.createElement("img");
    icon.src = conf.src;
    icon.alt = "";
    icon.width = 14;
    icon.height = 14;
    const label = document.createElement("span");
    label.textContent = conf.label;
    tag.append(icon, label);
    meta.appendChild(tag);
  });

  return meta;
}

function buildSourcesMeta(sources, { animate = true } = {}) {
  const list = Array.isArray(sources)
    ? sources.filter((item) => item && (item.title || item.url))
    : [];
  if (!list.length) return null;

  const meta = document.createElement("div");
  meta.className = "msg__sources";
  meta.setAttribute("aria-label", "Источники");

  const title = document.createElement("p");
  title.className = "msg__sources-title";
  title.textContent = "Источники";
  meta.appendChild(title);

  const ul = document.createElement("ul");
  ul.className = "msg__sources-list";
  list.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = animate ? "msg__source msg__source--enter" : "msg__source";
    li.style.setProperty("--source-delay", `${60 + index * 50}ms`);

    const href = item.url ? safeHttpUrl(item.url) : null;
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.title || item.source || href;
      li.appendChild(link);
    } else {
      const span = document.createElement("span");
      span.textContent = item.title || item.source || "Источник";
      li.appendChild(span);
    }

    const metaLine = document.createElement("span");
    metaLine.className = "msg__source-meta";
    const parts = [];
    if (item.source) parts.push(item.source);
    if (item.accessed) parts.push(`дата обращения: ${item.accessed}`);
    metaLine.textContent = parts.join(" · ");
    if (parts.length) li.appendChild(metaLine);

    ul.appendChild(li);
  });
  meta.appendChild(ul);
  return meta;
}

function setActionPressed(btn, pressed) {
  btn.setAttribute("aria-pressed", String(Boolean(pressed)));
  btn.classList.toggle("is-active", Boolean(pressed));
}

function buildMessageActions(text, { rating = null, onRate } = {}) {
  const actions = document.createElement("div");
  actions.className = "msg__actions";
  actions.setAttribute("role", "group");
  actions.setAttribute("aria-label", "Оценка ответа");

  const speakBtn = document.createElement("button");
  speakBtn.type = "button";
  speakBtn.className = "msg__action msg__action--speak";
  speakBtn.setAttribute("aria-label", "Прослушать ответ");
  speakBtn.title = ttsSupported() ? "Прослушать" : "Озвучка недоступна в этом браузере";
  speakBtn.disabled = !ttsSupported();
  speakBtn.innerHTML = ICON_SPEAK;

  function setSpeakPlaying(playing) {
    speakBtn.classList.toggle("is-playing", playing);
    speakBtn.innerHTML = playing ? ICON_SPEAK_STOP : ICON_SPEAK;
    speakBtn.setAttribute(
      "aria-label",
      playing ? "Остановить озвучку" : "Прослушать ответ"
    );
  }

  speakBtn.addEventListener("click", () => {
    if (!ttsSupported()) return;
    if (speakBtn.classList.contains("is-playing") && isSpeaking()) {
      stopSpeaking();
      setSpeakPlaying(false);
      return;
    }
    const plain = markdownToPlain(text);
    const ok = speakText(plain, {
      onStart: () => setSpeakPlaying(true),
      onEnd: () => setSpeakPlaying(false),
      onError: () => setSpeakPlaying(false),
    });
    if (!ok) setSpeakPlaying(false);
  });

  const likeBtn = document.createElement("button");
  likeBtn.type = "button";
  likeBtn.className = "msg__action msg__action--like";
  likeBtn.setAttribute("aria-label", "Полезный ответ");
  likeBtn.title = "Полезно";
  likeBtn.innerHTML = ICON_LIKE;

  const dislikeBtn = document.createElement("button");
  dislikeBtn.type = "button";
  dislikeBtn.className = "msg__action msg__action--dislike";
  dislikeBtn.setAttribute("aria-label", "Бесполезный ответ");
  dislikeBtn.title = "Не полезно";
  dislikeBtn.innerHTML = ICON_DISLIKE;

  function applyRating(next) {
    const value = rating === next ? null : next;
    rating = value;
    setActionPressed(likeBtn, value === "like");
    setActionPressed(dislikeBtn, value === "dislike");
    onRate?.(value);
  }

  likeBtn.addEventListener("click", () => applyRating("like"));
  dislikeBtn.addEventListener("click", () => applyRating("dislike"));

  if (rating === "like" || rating === "dislike") {
    setActionPressed(likeBtn, rating === "like");
    setActionPressed(dislikeBtn, rating === "dislike");
  }

  actions.append(speakBtn, likeBtn, dislikeBtn);
  return actions;
}

function attachBotExtras(
  wrap,
  { text = "", tags = [], sources = [], rating = null, onRate } = {},
  { animate = true } = {}
) {
  // Feedback chips belong to the mentor reply (AI), never the user bubble
  const feedback = buildFeedbackMeta(tags, { animate });
  if (feedback) wrap.appendChild(feedback);
  const actions = buildMessageActions(text, { rating, onRate });
  wrap.appendChild(actions);
  const attribution = buildSourcesMeta(sources, { animate });
  if (attribution) wrap.appendChild(attribution);
}

function fillBotBubble(bubble, text) {
  const html = renderMarkdown(text);
  if (html) {
    bubble.classList.add("msg__bubble--md");
    bubble.innerHTML = html;
  } else {
    bubble.classList.remove("msg__bubble--md");
    bubble.textContent = String(text || "");
  }
}

export function createChat(streamEl) {
  function clear() {
    stopSpeaking();
    streamEl.innerHTML = "";
  }

  function scrollBottom() {
    streamEl.scrollTop = streamEl.scrollHeight;
  }

  function appendUser(text) {
    ensureStream(streamEl);
    const row = document.createElement("article");
    row.className = "msg msg--user";
    const bubble = document.createElement("div");
    bubble.className = "msg__bubble";
    bubble.textContent = text;
    row.appendChild(bubble);
    streamEl.appendChild(row);
    playEnter(row, "msg--enter-user");
    scrollBottom();
    return row;
  }

  function appendBot(
    { text, tags = [], sources = [], rating = null } = {},
    { animate = true, onRate } = {}
  ) {
    ensureStream(streamEl);
    const row = document.createElement("article");
    row.className = "msg msg--bot";
    row.appendChild(avatar());

    const wrap = document.createElement("div");
    wrap.className = "msg__body";
    const bubble = document.createElement("div");
    bubble.className = "msg__bubble";
    fillBotBubble(bubble, text);
    wrap.appendChild(bubble);

    attachBotExtras(wrap, { text, tags, sources, rating, onRate }, { animate });

    row.appendChild(wrap);
    streamEl.appendChild(row);
    if (animate) playEnter(row, "msg--enter-bot");
    scrollBottom();
    return row;
  }

  /**
   * Stream bot reply like generation: empty bubble → typewriter → markdown + tags.
   */
  async function streamBot({ text, tags = [], sources = [], rating = null, onRate } = {}) {
    ensureStream(streamEl);
    const full = String(text || "");
    const plain = markdownToPlain(full);
    const row = document.createElement("article");
    row.className = "msg msg--bot msg--generating";
    row.appendChild(avatar());

    const wrap = document.createElement("div");
    wrap.className = "msg__body";
    const bubble = document.createElement("div");
    bubble.className = "msg__bubble msg__bubble--stream";
    const textNode = document.createElement("span");
    textNode.className = "msg__stream-text";
    const caret = document.createElement("span");
    caret.className = "msg__caret";
    caret.setAttribute("aria-hidden", "true");
    bubble.append(textNode, caret);
    wrap.appendChild(bubble);
    row.appendChild(wrap);
    streamEl.appendChild(row);
    playEnter(row, "msg--enter-bot");
    scrollBottom();

    if (!full || preferReduceMotion()) {
      caret.remove();
      bubble.classList.remove("msg__bubble--stream");
      fillBotBubble(bubble, full);
      row.classList.remove("msg--generating");
      attachBotExtras(
        wrap,
        { text: full, tags, sources, rating, onRate },
        { animate: true }
      );
      scrollBottom();
      return row;
    }

    const chunks = plain.match(/\S+\s*|\s+/g) || [plain];
    let shown = "";
    const baseDelay = plain.length > 420 ? 12 : plain.length > 220 ? 18 : 26;

    for (const chunk of chunks) {
      shown += chunk;
      textNode.textContent = shown;
      scrollBottom();
      await wait(baseDelay + Math.min(40, chunk.length * 4));
    }

    caret.remove();
    row.classList.remove("msg--generating");
    bubble.classList.remove("msg__bubble--stream");
    bubble.replaceChildren();
    fillBotBubble(bubble, full);

    attachBotExtras(
      wrap,
      { text: full, tags, sources, rating, onRate },
      { animate: true }
    );
    scrollBottom();

    return row;
  }

  function showTyping() {
    ensureStream(streamEl);
    const row = document.createElement("article");
    row.className = "msg msg--bot msg--typing";
    row.dataset.typing = "true";
    row.setAttribute("aria-live", "polite");
    row.appendChild(avatar());
    const bubble = document.createElement("div");
    bubble.className = "msg__bubble msg__bubble--typing";
    bubble.innerHTML = `
      <div class="typing" aria-label="Ментор генерирует ответ">
        <span class="typing__dot"></span>
        <span class="typing__dot"></span>
        <span class="typing__dot"></span>
      </div>
      <p class="typing__label">Генерация ответа…</p>
    `;
    row.appendChild(bubble);
    streamEl.appendChild(row);
    playEnter(row, "msg--enter-bot");
    scrollBottom();
    return row;
  }

  function removeTyping(node) {
    if (!node) return;
    node.classList.add("msg--exit");
    window.setTimeout(() => node.remove(), 180);
  }

  return { clear, appendUser, appendBot, streamBot, showTyping, removeTyping };
}
