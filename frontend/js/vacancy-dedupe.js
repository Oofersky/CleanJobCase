/** Нормализация и дедуп вакансий (разные id / кавычки / регистр организации). */

export function normVacancyText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[«»„“”'`]/g, '"')
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function vacancyFingerprint(jobName, companyName) {
  const job = normVacancyText(jobName);
  const company = normVacancyText(companyName);
  if (!job && !company) return "";
  return `${job}|${company}`;
}

function richness(v) {
  const id = String(v.vacancy_id || v.id || "");
  const nonDemo = id.startsWith("demo-") ? 0 : 1;
  const filled = ["duty", "requirements", "schedule", "employment", "salary", "vacancy_url"].filter(
    (k) => String(v[k] || "").trim()
  ).length;
  const reportId = Number(v.report_id || 0);
  return nonDemo * 1000 + filled * 10 + Math.min(reportId, 999);
}

/** @param {Array<object>} items */
export function dedupeVacancies(items) {
  const bestById = new Map();
  for (const item of items || []) {
    const id = String(item.vacancy_id || item.id || "");
    if (!id) continue;
    const prev = bestById.get(id);
    if (!prev || richness(item) > richness(prev)) bestById.set(id, item);
  }

  const out = [];
  const seenFp = new Set();
  const ranked = [...bestById.values()].sort((a, b) => richness(b) - richness(a));
  for (const item of ranked) {
    const fp = vacancyFingerprint(item.job_name, item.company_name);
    if (fp && seenFp.has(fp)) continue;
    if (fp) seenFp.add(fp);
    out.push(item);
  }
  return out;
}

/** Уникальные названия организаций с нормализацией дублей кавычек/регистра. */
export function uniqueCompanyNames(items) {
  const best = new Map();
  for (const item of items || []) {
    const raw = String(item.company_name || "").trim();
    if (!raw) continue;
    const key = normVacancyText(raw);
    if (!best.has(key)) best.set(key, raw);
  }
  return [...best.values()].sort((a, b) => a.localeCompare(b, "ru"));
}
