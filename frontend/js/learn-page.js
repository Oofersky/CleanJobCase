import { requireAuth } from "./modules/auth-guard.js";
import { initPageMotion } from "./modules/motion.js";
import { mountRailNewChatNav, mountRailSessionList } from "./modules/rail-sessions.js";
import { safeHttpUrl } from "./modules/safe-url.js";
import { mountShell } from "./modules/shell.js";

if (requireAuth()) {
  mountShell({ zone: "platform", active: "learn", stageTitle: "Обучение" });
  mountRailSessionList();
  mountRailNewChatNav();
  initPageMotion();

  const scenarioEl = document.querySelector("[data-learn-scenario]");
  const queryEl = document.querySelector("[data-learn-query]");
  const topicsEl = document.querySelector("[data-learn-topics]");
  const casesEl = document.querySelector("[data-learn-cases]");
  const statusEl = document.querySelector("[data-learn-status]");

  let cache = null;

  function setStatus(text, kind = "") {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.classList.toggle("is-error", kind === "error");
    statusEl.classList.toggle("is-ok", kind === "ok");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function sourcesHtml(sources) {
    if (!sources?.length) return "";
    return `<ul class="learn-sources">${sources
      .map((item) => {
        const title = escapeHtml(item.title || item.source || item.url || "Источник");
        const href = item.url ? safeHttpUrl(item.url) : null;
        const meta = escapeHtml([item.source, item.accessed].filter(Boolean).join(" · "));
        const link = href
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${title}</a>`
          : `<span>${title}</span>`;
        return `<li>${link}${meta ? `<div class="msg__source-meta">${meta}</div>` : ""}</li>`;
      })
      .join("")}</ul>`;
  }

  function matchesQuery(text, query) {
    if (!query) return true;
    return String(text || "").toLowerCase().includes(query);
  }

  function render() {
    if (!cache || !topicsEl || !casesEl) return;
    const query = String(queryEl?.value || "")
      .trim()
      .toLowerCase();

    const topics = (cache.topics || []).filter(
      (topic) =>
        matchesQuery(topic.summary, query) ||
        matchesQuery(topic.id, query) ||
        (topic.keywords || []).some((k) => matchesQuery(k, query))
    );
    const cases = (cache.cases || []).filter((item) => matchesQuery(item.prompt, query));

    topicsEl.innerHTML = topics.length
      ? topics
          .map(
            (topic) => `
      <article class="learn-card">
        <h2>${escapeHtml(topic.id)}</h2>
        <div class="learn-card__meta">${(topic.keywords || [])
          .slice(0, 6)
          .map((k) => `<span class="learn-chip">${escapeHtml(k)}</span>`)
          .join("")}</div>
        <p>${escapeHtml(topic.summary)}</p>
        ${sourcesHtml(topic.sources)}
      </article>`
          )
          .join("")
      : `<p class="workspace__status">Тем по запросу нет.</p>`;

    casesEl.innerHTML = cases.length
      ? `<h2 style="margin:0.4rem 0 0;font-size:1.05rem">Кейсы для практики</h2>${cases
          .map(
            (item) => `
      <article class="learn-card">
        <h2>Кейс ${item.index + 1}</h2>
        <p>${escapeHtml(item.prompt)}</p>
        ${sourcesHtml(item.sources)}
      </article>`
          )
          .join("")}`
      : "";

    setStatus(
      `${cache.title}: ${topics.length} тем · ${cases.length} кейсов`,
      "ok"
    );
  }

  async function load() {
    const id = scenarioEl?.value || "university";
    setStatus("Загрузка…");
    try {
      const response = await fetch(`/api/scenarios/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error("Не удалось загрузить сценарий");
      cache = await response.json();
      render();
    } catch (error) {
      cache = null;
      topicsEl.innerHTML = "";
      casesEl.innerHTML = "";
      setStatus(String(error?.message || "Ошибка загрузки"), "error");
    }
  }

  scenarioEl?.addEventListener("change", load);
  queryEl?.addEventListener("input", () => render());
  load();
}
