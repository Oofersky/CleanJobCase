import { dedupeVacancies, uniqueCompanyNames, normVacancyText } from "./vacancy-dedupe.js";
import "./theme.js";
import { api, mountAuthNav, requireAuth } from "./api.js";
import { enhanceAll, syncSelect } from "./select.js";

const els = {
  history: document.getElementById("draft-history"),
  search: document.getElementById("vac-search"),
  company: document.getElementById("vac-company"),
  list: document.getElementById("vac-list"),
  clearVac: document.getElementById("btn-clear-vac"),
  picker: document.getElementById("vac-picker"),
  actions: document.getElementById("resume-actions"),
  card: document.getElementById("vacancy-card"),
  vacJob: document.getElementById("vac-job"),
  vacMeta: document.getElementById("vac-meta"),
  vacSnap: document.getElementById("vac-snap"),
  vacLink: document.getElementById("vac-link"),
  match: document.getElementById("result-match"),
  fullName: document.getElementById("full-name"),
  summary: document.getElementById("summary"),
  skills: document.getElementById("skills"),
  experience: document.getElementById("experience"),
  education: document.getElementById("education"),
  btnDraft: document.getElementById("btn-draft"),
  btnSample: document.getElementById("btn-sample"),
  btnCopy: document.getElementById("btn-copy"),
  btnNew: document.getElementById("btn-new"),
  resultActions: document.getElementById("result-actions"),
  error: document.getElementById("error"),
  draft: document.getElementById("draft"),
  empty: document.getElementById("result-empty"),
};


/** @type {Array<{id:string,report_id:number,job_name?:string,company_name?:string,vacancy_url?:string}>} */
let vacancies = [];
/** @type {{id:string,report_id:number}|null} */
let selectedKey = null;
let mode = "new"; // "new" | draft id

function showError(message) {
  if (!message) {
    els.error.textContent = "";
    els.error.classList.remove("is-visible");
    return;
  }
  els.error.textContent = message;
  els.error.classList.add("is-visible");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clip(text, max = 160) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function vacKey(v) {
  return `${v.report_id}:${v.id}`;
}

function setComposeMode(on) {
  if (els.picker) els.picker.hidden = !on;
  if (els.actions) els.actions.hidden = !on;
  if (els.btnSample) els.btnSample.hidden = !on;
  ["fullName", "summary", "skills", "experience", "education"].forEach((key) => {
    const el = els[key];
    if (!el) return;
    el.readOnly = !on;
    el.disabled = !on;
  });
  syncSampleButton();
}

function syncSampleButton() {
  if (!els.btnSample) return;
  const ok = mode === "new" && Boolean(selectedVacancy());
  els.btnSample.disabled = !ok;
  els.btnSample.title = ok ? "" : "Сначала выберите вакансию";
}

async function fillSample() {
  if (mode !== "new") return;
  const vac = selectedVacancy();
  if (!vac) {
    showError("Сначала выберите вакансию");
    syncSampleButton();
    return;
  }
  showError("");
  els.btnSample.disabled = true;
  try {
    const data = await api("/api/resume/sample", {
      method: "POST",
      body: JSON.stringify({
        vacancy_id: vac.id,
        report_id: vac.report_id,
      }),
    });
    applyResumePayload(data.resume || {});
  } catch (err) {
    showError(err.message || "Не удалось подставить пример");
  } finally {
    syncSampleButton();
  }
}

function clearForm() {
  els.fullName.value = "";
  els.summary.value = "";
  els.skills.value = "";
  els.experience.value = "[]";
  els.education.value = "[]";
}

function applyResumePayload(resume) {
  if (!resume || typeof resume !== "object") return;
  els.fullName.value = resume.full_name || resume.name || "";
  els.summary.value = resume.summary || "";
  els.skills.value = Array.isArray(resume.skills) ? resume.skills.join(", ") : "";
  els.experience.value = JSON.stringify(resume.experience || [], null, 2);
  els.education.value = JSON.stringify(resume.education || [], null, 2);
}

function buildResume() {
  let experience;
  let education;
  try {
    experience = JSON.parse(els.experience.value || "[]");
  } catch {
    throw new Error("Опыт: некорректный JSON-массив");
  }
  try {
    education = JSON.parse(els.education.value || "[]");
  } catch {
    throw new Error("Образование: некорректный JSON-массив");
  }
  if (!Array.isArray(experience) || !Array.isArray(education)) {
    throw new Error("Опыт и образование должны быть JSON-массивами");
  }
  const skills = (els.skills.value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    full_name: (els.fullName.value || "").trim() || "Кандидат",
    summary: (els.summary.value || "").trim(),
    skills,
    experience,
    education,
  };
}

function selectedVacancy() {
  if (!selectedKey) return null;
  return vacancies.find((v) => vacKey(v) === selectedKey) || null;
}

function filtersActive() {
  return Boolean((els.search.value || "").trim() || els.company.value);
}

function clearVacFilters() {
  els.search.value = "";
  els.company.value = "";
  syncSelect(els.company);
  renderVacancyList();
}

function filteredVacancies() {
  const q = (els.search.value || "").trim().toLowerCase();
  const companyNorm = normVacancyText(els.company.value);
  return vacancies.filter((v) => {
    if (companyNorm && normVacancyText(v.company_name) !== companyNorm) return false;
    if (!q) return true;
    const hay = `${v.job_name || ""} ${v.company_name || ""} ${v.id || ""}`.toLowerCase();
    return hay.includes(q);
  });
}

function fillCompanies() {
  const current = els.company.value;
  const currentNorm = normVacancyText(current);
  const names = uniqueCompanyNames(vacancies);
  els.company.innerHTML = `<option value="">Все</option>`;
  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    els.company.appendChild(opt);
  }
  const match = names.find((n) => normVacancyText(n) === currentNorm);
  if (match) els.company.value = match;
  syncSelect(els.company);
}

function renderVacancyCard() {
  const vac = selectedVacancy();
  syncSampleButton();
  if (!vac) {
    els.card.hidden = true;
    return;
  }
  els.card.hidden = false;
  els.vacJob.textContent = vac.job_name || "Без названия";
  els.vacMeta.textContent = vac.company_name || "";
  const rows = [
    ["Обязанности", vac.duty],
    ["Требования", vac.requirements],
    ["График", vac.schedule],
    ["Занятость", vac.employment],
    ["Оплата", vac.salary],
  ].filter(([, value]) => clip(value));
  if (rows.length && els.vacSnap) {
    els.vacSnap.hidden = false;
    els.vacSnap.innerHTML = rows
      .map(
        ([label, value]) => `
        <div class="vac-snap__item">
          <span class="vac-snap__label">${escapeHtml(label)}</span>
          <span class="vac-snap__value">${escapeHtml(clip(value, 220))}</span>
        </div>`
      )
      .join("");
  } else if (els.vacSnap) {
    els.vacSnap.hidden = true;
    els.vacSnap.innerHTML = "";
  }
  if (vac.vacancy_url) {
    els.vacLink.hidden = false;
    els.vacLink.href = vac.vacancy_url;
  } else {
    els.vacLink.hidden = true;
  }
}

function selectVacancy(key) {
  selectedKey = key;
  renderVacancyList();
  renderVacancyCard();
  syncSampleButton();
}

function renderVacancyList() {
  const items = filteredVacancies();
  const total = vacancies.length;
  if (!total) {
    els.clearVac.hidden = true;
    els.list.innerHTML = `<p class="vac-picker__empty">Нет вакансий — сначала сформируйте отчёт на платформе</p>`;
    selectedKey = null;
    renderVacancyCard();
    return;
  }

  els.clearVac.hidden = !filtersActive();

  if (!selectedKey && items.length) selectedKey = vacKey(items[0]);

  if (!items.length) {
    els.list.innerHTML = `<p class="vac-picker__empty">Ничего не найдено. Сбросьте фильтры или измените поиск.</p>`;
    renderVacancyCard();
    return;
  }

  els.list.innerHTML = items
    .map((v) => {
      const key = vacKey(v);
      const selected = key === selectedKey ? "is-selected" : "";
      const aria = key === selectedKey ? 'aria-selected="true"' : 'aria-selected="false"';
      return `
        <button type="button" class="vac-picker__option ${selected}" role="option" data-key="${escapeHtml(key)}" ${aria}>
          <strong>${escapeHtml(v.job_name || "Без названия")}</strong>
          <span>${escapeHtml(v.company_name || "Организация не указана")}</span>
        </button>`;
    })
    .join("");

  renderVacancyCard();
}

function setVacancies(items) {
  vacancies = dedupeVacancies(items).sort((a, b) => {
    const byJob = String(a.job_name || "").localeCompare(String(b.job_name || ""), "ru", {
      sensitivity: "base",
    });
    if (byJob) return byJob;
    return String(a.company_name || "").localeCompare(String(b.company_name || ""), "ru", {
      sensitivity: "base",
    });
  });
  fillCompanies();
  selectedKey = vacancies.length ? vacKey(vacancies[0]) : null;
  renderVacancyList();
}

function formatDraftLabel(item) {
  const when = item.created_at
    ? new Date(item.created_at).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const job = item.job_name ? ` · ${item.job_name}` : "";
  return `#${item.id} · ${when}${job}`;
}

async function refreshDraftHistory(selectId) {
  const data = await api("/api/resume/drafts");
  const items = data.items || [];
  const keep = selectId ?? els.history.value ?? "new";
  els.history.innerHTML = `<option value="new">Новый черновик</option>`;
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = String(item.id);
    opt.textContent = formatDraftLabel(item);
    els.history.appendChild(opt);
  }
  const exists = keep === "new" || items.some((i) => String(i.id) === String(keep));
  els.history.value = exists ? String(keep) : "new";
  syncSelect(els.history);
}

function showResult(data) {
  const text = data.draft_text || "";
  els.empty.hidden = true;
  els.draft.hidden = false;
  els.draft.textContent = text;
  if (els.resultActions) els.resultActions.hidden = !text;
  const matched = data.matched_skills || [];
  if (els.match) {
    if (matched.length) {
      els.match.hidden = false;
      els.match.innerHTML = `
        <p class="resume-match__label">Навыки из резюме, близкие к вакансии</p>
        ${matched.map((s) => `<span class="vac__chip">${escapeHtml(s)}</span>`).join("")}
      `;
    } else {
      els.match.hidden = true;
      els.match.innerHTML = "";
    }
  }
}

function clearResult() {
  els.empty.hidden = false;
  els.draft.hidden = true;
  els.draft.textContent = "";
  if (els.resultActions) els.resultActions.hidden = true;
  if (els.match) {
    els.match.hidden = true;
    els.match.innerHTML = "";
  }
}

function resetToNew() {
  mode = "new";
  els.history.value = "new";
  syncSelect(els.history);
  setComposeMode(true);
  showError("");
  clearResult();
  clearForm();
  renderVacancyList();
}

async function loadHistoryDraft(id) {
  const data = await api(`/api/resume/drafts/${id}`);
  mode = String(id);
  els.history.value = String(id);
  syncSelect(els.history);
  setComposeMode(false);
  if (data.resume) applyResumePayload(data.resume);
  showResult(data);
  els.card.hidden = false;
  els.vacJob.textContent = data.job_name || "Без названия";
  els.vacMeta.textContent = data.company_name || "";
  if (els.vacSnap) {
    els.vacSnap.hidden = true;
    els.vacSnap.innerHTML = "";
  }
  els.vacLink.hidden = true;
}

async function loadVacancies() {
  const data = await api("/api/resume/vacancies");
  setVacancies(data.items || []);
}

els.list.addEventListener("click", (event) => {
  if (mode !== "new") return;
  const btn = event.target.closest("[data-key]");
  if (!btn) return;
  selectVacancy(btn.getAttribute("data-key"));
});

els.search.addEventListener("input", () => {
  if (mode === "new") renderVacancyList();
});
els.company.addEventListener("change", () => {
  if (mode === "new") renderVacancyList();
});
els.clearVac.addEventListener("click", clearVacFilters);

els.history.addEventListener("change", async () => {
  const value = els.history.value;
  if (value === "new") {
    resetToNew();
    return;
  }
  try {
    showError("");
    await loadHistoryDraft(value);
  } catch (err) {
    showError(err.message || String(err));
  }
});

els.btnSample?.addEventListener("click", () => {
  fillSample().catch(() => {});
});

els.btnNew?.addEventListener("click", () => {
  resetToNew();
});

els.btnCopy?.addEventListener("click", async () => {
  const text = els.draft.textContent || "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    els.btnCopy.textContent = "Скопировано";
    setTimeout(() => {
      els.btnCopy.textContent = "Копировать";
    }, 1600);
  } catch {
    showError("Не удалось скопировать текст");
  }
});

els.btnDraft.addEventListener("click", async () => {
  if (mode !== "new") return;
  showError("");
  if (els.match) {
    els.match.hidden = true;
    els.match.innerHTML = "";
  }
  const vac = selectedVacancy();
  if (!vac) {
    showError("Выберите вакансию из списка");
    return;
  }
  let resume;
  try {
    resume = buildResume();
  } catch (err) {
    showError(err.message || String(err));
    return;
  }
  els.btnDraft.disabled = true;
  els.btnDraft.classList.add("is-busy");
  try {
    const data = await api("/api/resume/draft", {
      method: "POST",
      body: JSON.stringify({
        vacancy_id: vac.id,
        report_id: vac.report_id,
        resume,
        use_ai: true,
      }),
    });
    await refreshDraftHistory(data.id != null ? String(data.id) : "new");
    mode = data.id != null ? String(data.id) : "new";
    if (mode !== "new") {
      els.history.value = mode;
      syncSelect(els.history);
      setComposeMode(false);
    }
    showResult(data);
  } catch (err) {
    showError(err.message || String(err));
  } finally {
    els.btnDraft.disabled = false;
    els.btnDraft.classList.remove("is-busy");
  }
});

(async () => {
  const user = await requireAuth();
  if (!user) return;
  mountAuthNav(document.getElementById("auth-slot"));
  enhanceAll();
  clearForm();
  setComposeMode(true);
  clearResult();
  try {
    await Promise.all([loadVacancies(), refreshDraftHistory("new")]);
  } catch (err) {
    showError(err.message || String(err));
    setVacancies([]);
  }
})();
