import { dedupeVacancies } from "./vacancy-dedupe.js";
import "./theme.js";
import { api, mountAuthNav, requireAuth } from "./api.js";
import { enhanceAll, syncSelect } from "./select.js";

let report = null;
let runAbort = null;
let mode = "new"; // "new" | report id string

const els = {
  total: document.getElementById("stat-total"),
  needFix: document.getElementById("stat-need-fix"),
  remarks: document.getElementById("stat-remarks"),
  score: document.getElementById("stat-score"),
  search: document.getElementById("search"),
  sort: document.getElementById("filter-sort"),
  status: document.getElementById("filter-status"),
  kind: document.getElementById("filter-kind"),
  topic: document.getElementById("filter-topic"),
  scoreFilter: document.getElementById("filter-score"),
  clearFilters: document.getElementById("btn-clear-filters"),
  filterMore: document.querySelector(".filter-more"),
  history: document.getElementById("report-history"),
  runForm: document.getElementById("run-form"),
  runSource: document.getElementById("run-source"),
  error: document.getElementById("error"),
  empty: document.getElementById("empty"),
  list: document.getElementById("list"),
  loading: document.getElementById("loading"),
  board: document.querySelector(".board"),
  form: document.getElementById("run-form"),
  btnRun: document.getElementById("btn-run"),
  btnJson: document.getElementById("btn-json"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showError(message) {
  if (!message) {
    els.error.textContent = "";
    els.error.classList.remove("is-visible");
    return;
  }
  els.error.textContent = message;
  els.error.classList.add("is-visible");
}

function formatHistoryLabel(item) {
  const when = item.created_at
    ? new Date(item.created_at).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return `#${item.id} · ${when}`;
}

function setModeUI() {
  const isNew = mode === "new";
  els.runForm.hidden = !isNew;
  els.btnJson.hidden = isNew || !report?.id;
  if (!isNew && report?.id) {
    els.btnJson.setAttribute("href", `/api/reports/${report.id}/download`);
    els.btnJson.setAttribute("download", `otchet-${report.id}.json`);
  }
}

function setLoading(on) {
  els.loading.hidden = !on;
  els.loading.classList.toggle("is-on", on);
  els.board?.classList.toggle("is-loading", on);
  if (on) {
    els.empty.hidden = true;
    els.list.hidden = true;
  }
  els.btnRun.disabled = on;
  els.btnRun.classList.toggle("is-busy", on);
  els.history.disabled = on;
  syncSelect(els.history);
}

function vacancyScore(v) {
  return Math.max(0, 100 - (v.remarks || []).length * 15);
}

function scoreBand(score) {
  if (score >= 80) return "high";
  if (score >= 50) return "mid";
  return "low";
}

function kindLabel(kind) {
  if (kind === "gap") return "пропуск";
  if (kind === "contradiction") return "противоречие";
  return "неоднозначность";
}

function fieldLabel(sourceField) {
  const key = String(sourceField || "").toLowerCase();
  const map = {
    "job-name": "Название должности",
    duty: "Обязанности",
    requirements: "Требования",
    requirement: "Требования (структура)",
    schedule: "График работы",
    employment: "Тип занятости",
    salary: "Оплата",
    salary_min: "Оплата (минимум)",
    salary_max: "Оплата (максимум)",
    "addresses.address.location": "Место работы",
    location: "Место работы",
  };
  if (map[key]) return map[key];
  if (key.includes("address") || key.includes("location")) return "Место работы";
  if (key.includes("salary")) return "Оплата";
  if (key.includes("requirement")) return "Требования";
  return sourceField || "Поле вакансии";
}

function fieldKey(sourceField) {
  const key = String(sourceField || "").toLowerCase();
  if (key.includes("job-name") || key === "job_name") return "job-name";
  if (key.includes("duty")) return "duty";
  if (key.includes("requirement")) return "requirements";
  if (key.includes("schedule")) return "schedule";
  if (key.includes("employment")) return "employment";
  if (key.includes("salary")) return "salary";
  if (key.includes("address") || key.includes("location")) return "location";
  return key || "other";
}

function renderQuote(text, emptyHint) {
  const value = (text || "").trim();
  if (!value) {
    return `<p class="remark__empty">${escapeHtml(emptyHint)}</p>`;
  }
  return `<blockquote class="remark__quote"><mark>${escapeHtml(value)}</mark></blockquote>`;
}

function renderRemark(rem) {
  const kind = rem.kind || "ambiguity";
  const where = fieldLabel(rem.source_field);
  const topic = rem.topic || "тема";
  const primary =
    kind === "gap"
      ? renderQuote(rem.quote, "В карточке это поле пустое или почти не заполнено.")
      : renderQuote(rem.quote, "Цитата из вакансии не указана.");
  const secondary = (rem.quote_secondary || "").trim()
    ? `<div class="remark__compare">${renderQuote(rem.quote_secondary, "")}</div>`
    : "";
  return `
    <article class="remark" data-kind="${escapeHtml(kind)}" data-field="${escapeHtml(fieldKey(rem.source_field))}">
      <p class="remark__kicker">${escapeHtml(kindLabel(kind))} · ${escapeHtml(topic)} · ${escapeHtml(where)}</p>
      ${primary}
      ${secondary}
      ${rem.problem ? `<p class="remark__problem">${escapeHtml(rem.problem)}</p>` : ""}
      <p class="remark__ask"><span>Спросить</span> ${escapeHtml(rem.recommendation || "")}</p>
    </article>`;
}

function renderVacancySnapshot(v, remarks) {
  const hit = new Set((remarks || []).map((r) => fieldKey(r.source_field)));
  if (!hit.size) return "";
  const rows = [
    ["job-name", "Должность", v.job_name],
    ["duty", "Обязанности", v.duty],
    ["requirements", "Требования", v.requirements],
    ["schedule", "График", v.schedule],
    ["employment", "Занятость", v.employment],
    ["salary", "Оплата", v.salary],
  ].filter(([key]) => hit.has(key));
  if (!rows.length) return "";
  const html = rows
    .map(([key, label, value]) => {
      const text = (value || "").trim();
      return `
        <div class="vac-snap__item is-issue" data-field="${key}">
          <span class="vac-snap__label">${label}</span>
          <span class="vac-snap__value">${text ? escapeHtml(text) : "не указано"}</span>
        </div>`;
    })
    .join("");
  return `<div class="vac-snap" aria-label="Поля с замечаниями">${html}</div>`;
}

function filtersActive() {
  return Boolean(
    (els.search.value || "").trim() ||
      els.status.value ||
      els.kind.value ||
      els.topic.value ||
      els.scoreFilter.value ||
      (els.sort.value && els.sort.value !== "score-asc")
  );
}

function clearFilters() {
  els.search.value = "";
  els.sort.value = "score-asc";
  els.status.value = "";
  els.kind.value = "";
  els.topic.value = "";
  els.scoreFilter.value = "";
  if (els.filterMore) els.filterMore.open = false;
  renderList(report);
}

function sortVacancies(items) {
  const mode = els.sort.value || "score-asc";
  const copy = [...items];
  const byName = (a, b) =>
    String(a.job_name || "").localeCompare(String(b.job_name || ""), "ru", { sensitivity: "base" });
  const byCompany = (a, b) =>
    String(a.company_name || "").localeCompare(String(b.company_name || ""), "ru", {
      sensitivity: "base",
    });
  copy.sort((a, b) => {
    const sa = vacancyScore(a);
    const sb = vacancyScore(b);
    const ra = (a.remarks || []).length;
    const rb = (b.remarks || []).length;
    if (mode === "score-desc") return sb - sa || byName(a, b);
    if (mode === "remarks-desc") return rb - ra || sa - sb || byName(a, b);
    if (mode === "name-asc") return byName(a, b);
    if (mode === "company-asc") return byCompany(a, b) || byName(a, b);
    // score-asc: сначала низкая прозрачность (сверху — где больше вопросов)
    return sa - sb || rb - ra || byName(a, b);
  });
  return copy;
}

function reportVacancies(r) {
  return dedupeVacancies(r?.vacancies || []);
}

function updateStats(r) {
  if (!r?.vacancies) {
    els.total.textContent = "—";
    els.needFix.textContent = "—";
    els.remarks.textContent = "—";
    els.score.textContent = "—%";
    return;
  }
  const items = reportVacancies(r);
  const remarks = items.reduce((sum, v) => sum + (v.remarks || []).length, 0);
  const needFix = items.filter((v) => (v.remarks || []).length > 0).length;
  const avg = items.length
    ? Math.round(items.reduce((sum, v) => sum + vacancyScore(v), 0) / items.length)
    : 0;
  els.total.textContent = String(items.length);
  els.needFix.textContent = String(needFix);
  els.remarks.textContent = String(remarks);
  els.score.textContent = `${avg}%`;
}

function fillTopics(r) {
  const current = els.topic.value;
  const topics = new Set();
  for (const v of reportVacancies(r)) {
    for (const rem of v.remarks || []) {
      if (rem.topic) topics.add(rem.topic);
    }
  }
  els.topic.innerHTML = `<option value="">Все темы</option>`;
  [...topics].sort((a, b) => a.localeCompare(b, "ru")).forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    els.topic.appendChild(opt);
  });
  if ([...topics].includes(current)) els.topic.value = current;
  syncSelect(els.topic);
}

function filteredVacancies(r) {
  const q = (els.search.value || "").trim().toLowerCase();
  const status = els.status.value;
  const kind = els.kind.value;
  const topic = els.topic.value;
  const band = els.scoreFilter.value;
  const filtered = reportVacancies(r).filter((v) => {
    const remarks = v.remarks || [];
    const score = vacancyScore(v);
    if (status === "with" && remarks.length === 0) return false;
    if (status === "clean" && remarks.length > 0) return false;
    if (band && scoreBand(score) !== band) return false;
    if (kind && !remarks.some((rem) => rem.kind === kind)) return false;
    if (topic && !remarks.some((rem) => rem.topic === topic)) return false;
    if (!q) return true;
    const hay = `${v.job_name || ""} ${v.company_name || ""} ${v.vacancy_id || ""}`.toLowerCase();
    return hay.includes(q);
  });
  return sortVacancies(filtered);
}

function updateFilterMeta() {
  els.clearFilters.hidden = !filtersActive();
  const secondaryOn = Boolean(els.kind.value || els.topic.value || els.scoreFilter.value);
  if (els.filterMore && secondaryOn) els.filterMore.open = true;
}

function renderList(r) {
  updateStats(r);
  fillTopics(r);
  setModeUI();

  const total = reportVacancies(r).length;
  if (!r || !total) {
    updateFilterMeta();
    els.empty.hidden = false;
    els.list.hidden = true;
    els.list.innerHTML = "";
    els.empty.querySelector("h2").textContent =
      mode === "new" ? "Отчёт ещё не сформирован" : "Отчёт пуст";
    els.empty.querySelector("p").textContent =
      mode === "new"
        ? "Нажмите «Запустить анализ», чтобы сформировать отчёт."
        : "В выбранном отчёте нет вакансий.";
    return;
  }

  const items = filteredVacancies(r);
  updateFilterMeta();

  if (!items.length) {
    els.empty.hidden = false;
    els.list.hidden = true;
    els.list.innerHTML = "";
    els.empty.querySelector("h2").textContent = "Ничего не найдено";
    els.empty.querySelector("p").textContent = filtersActive()
      ? "Сбросьте фильтры или измените условия поиска."
      : "Измените поиск или фильтры.";
    return;
  }

  els.empty.hidden = true;
  els.list.hidden = false;
  els.list.innerHTML = items
    .map((v, idx) => {
      const score = vacancyScore(v);
      const remarks = v.remarks || [];
      // при сортировке «сначала низкая» открываем худшие сверху
      const open = remarks.length > 0 && idx < 3 ? "open" : "";
      const link = v.vacancy_url
        ? `<a href="${escapeHtml(v.vacancy_url)}" target="_blank" rel="noopener">Открыть на портале</a>`
        : "";
      const company = escapeHtml(v.company_name || "Организация не указана");
      const topics = [...new Set(remarks.map((r) => r.topic).filter(Boolean))].slice(0, 4);
      const topicLine = topics.length ? topics.map((t) => escapeHtml(t)).join(" · ") : "";
      const body =
        remarks.length === 0
          ? `<p class="vac__ok">Замечаний нет — формулировки достаточно понятны.</p>`
          : `${renderVacancySnapshot(v, remarks)}
             <div class="remark-list">${remarks.map(renderRemark).join("")}</div>`;
      return `
        <details class="vac" style="--i:${idx}" ${open}>
          <summary class="vac__head">
            <div class="vac__main">
              <h3 class="vac__title">${escapeHtml(v.job_name || "Без названия")}</h3>
              <p class="vac__sub">${company}${link ? ` · ${link}` : ""}</p>
              <p class="vac__meta">
                <span class="vac__score-num">${score}%</span>
                <span class="vac__meta-sep" aria-hidden="true">·</span>
                <span>${remarks.length ? `${remarks.length} зам.` : "без замечаний"}</span>
                ${topicLine ? `<span class="vac__meta-sep" aria-hidden="true">·</span><span>${topicLine}</span>` : ""}
              </p>
            </div>
            <span class="vac__chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </span>
          </summary>
          <div class="vac__body">${body}</div>
        </details>`;
    })
    .join("");
}

function applyReport(r, { selectInHistory = true } = {}) {
  report = r;
  if (r?.error) showError(r.error);
  else showError("");
  if (r?.id != null) {
    mode = String(r.id);
    if (selectInHistory) {
      els.history.value = String(r.id);
      syncSelect(els.history);
    }
  }
  renderList(r);
}

async function refreshHistory(selectId) {
  const data = await api("/api/reports");
  const items = data.items || [];
  const keep = selectId ?? els.history.value ?? "new";
  els.history.innerHTML = `<option value="new">Новый отчёт</option>`;
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = String(item.id);
    opt.textContent = formatHistoryLabel(item);
    els.history.appendChild(opt);
  }
  const exists = keep === "new" || items.some((i) => String(i.id) === String(keep));
  els.history.value = exists ? String(keep) : "new";
  syncSelect(els.history);
}

async function loadHistoryReport(id) {
  setLoading(true);
  try {
    const data = await api(`/api/reports/${id}`);
    mode = String(id);
    applyReport(data, { selectInHistory: true });
  } catch (err) {
    showError(err.message || String(err));
  } finally {
    setLoading(false);
  }
}

function resetToNew() {
  mode = "new";
  report = null;
  els.history.value = "new";
  syncSelect(els.history);
  showError("");
  clearFilters();
}

els.history.addEventListener("change", async () => {
  const value = els.history.value;
  if (value === "new") {
    resetToNew();
    return;
  }
  await loadHistoryReport(value);
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (mode !== "new") return;
  showError("");
  if (runAbort) runAbort.abort();
  runAbort = new AbortController();
  const timer = setTimeout(() => runAbort.abort(), 90000);
  setLoading(true);
  try {
    const source = els.runSource?.value === "fixture" ? "fixture" : "api";
    const data = await api("/api/run", {
      method: "POST",
      body: JSON.stringify({ source }),
      signal: runAbort.signal,
    });
    await refreshHistory(data.id != null ? String(data.id) : "new");
    applyReport(data);
  } catch (err) {
    const msg =
      err?.name === "AbortError"
        ? "Анализ превысил 90 секунд. Выберите отчёт из истории, если он сохранился."
        : err.message || String(err);
    showError(msg);
    if (report) renderList(report);
    else {
      els.empty.hidden = false;
      els.list.hidden = true;
    }
  } finally {
    clearTimeout(timer);
    setLoading(false);
  }
});

els.search.addEventListener("input", () => renderList(report));
els.sort.addEventListener("change", () => renderList(report));
els.status.addEventListener("change", () => renderList(report));
els.kind.addEventListener("change", () => renderList(report));
els.topic.addEventListener("change", () => renderList(report));
els.scoreFilter.addEventListener("change", () => renderList(report));
els.clearFilters.addEventListener("click", clearFilters);

function wireFilterMore(details) {
  if (!details) return;
  const body = details.querySelector(".filter-more__body");
  if (!body) return;
  details.addEventListener("click", (event) => {
    const summary = event.target.closest("summary");
    if (!summary || !details.contains(summary)) return;
    event.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (details.open) {
      if (reduce) {
        details.open = false;
        return;
      }
      body.style.gridTemplateRows = "1fr";
      body.style.opacity = "1";
      requestAnimationFrame(() => {
        body.style.gridTemplateRows = "0fr";
        body.style.opacity = "0";
      });
      const done = (ev) => {
        if (ev.target !== body || (ev.propertyName !== "grid-template-rows" && ev.propertyName !== "opacity"))
          return;
        body.removeEventListener("transitionend", done);
        details.open = false;
        body.style.gridTemplateRows = "";
        body.style.opacity = "";
      };
      body.addEventListener("transitionend", done);
    } else {
      details.open = true;
      if (reduce) return;
      body.style.gridTemplateRows = "0fr";
      body.style.opacity = "0";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          body.style.gridTemplateRows = "1fr";
          body.style.opacity = "1";
        });
      });
      const done = (ev) => {
        if (ev.target !== body) return;
        body.removeEventListener("transitionend", done);
        body.style.gridTemplateRows = "";
        body.style.opacity = "";
      };
      body.addEventListener("transitionend", done);
    }
  });
}

(async () => {
  const user = await requireAuth();
  if (!user) return;
  mountAuthNav(document.getElementById("auth-slot"));
  wireFilterMore(els.filterMore);
  enhanceAll();
  setLoading(false);
  mode = "new";
  report = null;
  showError("");
  renderList(null);
  try {
    await refreshHistory("new");
  } catch {
    /* БД ещё недоступна */
  }
})();
