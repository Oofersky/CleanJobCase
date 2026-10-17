/**
 * Lead stage 4 — progress & adaptive learning.
 * Heuristic detector now; swap detectWeakZones() for a neural model later.
 */

export const WEAK_ZONE_RULES = [
  {
    id: "self_esteem",
    zone: "Самооценка на собеседовании",
    test: /ничего не умею|я никто|без опыта совсем|я плох/i,
    scenarios: ["job", "university"],
    followUp:
      "В прошлых сессиях проседала самооценка. Сформулируй в 2 предложениях сильную сторону на учебном проекте — без «я ничего не умею».",
    prompt: "Переформулируй «я ничего не умею» сильнее",
  },
  {
    id: "portfolio",
    zone: "Портфолио и резюме",
    test: /портфолио|резюме|cv|нет проектов/i,
    scenarios: ["job", "university"],
    followUp:
      "Слабая зона: портфолио/резюме. Опиши один проект по схеме: задача → что сделал → результат.",
    prompt: "Разбери мой учебный проект для резюме",
  },
  {
    id: "university_criteria",
    zone: "Критерии выбора вуза",
    test: /рейтинг|вуз|колледж|поступ|куда возьмут/i,
    scenarios: ["university"],
    followUp:
      "Слабая зона: критерии вуза. Назови 2 критерия кроме рейтинга, по которым сравнишь два варианта.",
    prompt: "Сравни два вуза без опоры только на рейтинг",
  },
  {
    id: "interview",
    zone: "Ответы на собеседовании",
    test: /собесед|почему мы|почему вы|интервью|нужна практика/i,
    scenarios: ["job"],
    followUp:
      "Слабая зона: ответы на собеседовании. Ответь на «Почему вы?» за 20 секунд: компания + твоя польза.",
    prompt: "Проверь мой ответ «почему вы?»",
  },
  {
    id: "first_month",
    zone: "Коммуникация в первый месяц",
    test: /помощь|тимлид|задач|адапта|месяц|стесняюсь спросить/i,
    scenarios: ["adapt"],
    followUp:
      "Слабая зона: коммуникация в первый месяц. Напиши, как за 15 секунд уточнишь у тимлида критерий «готово» и срок.",
    prompt: "Как спокойно переспросить задачу у тимлида",
  },
];

export function emptyProgress() {
  return {
    sessions: 0,
    byScenario: { university: 0, job: 0, adapt: 0 },
    weakZones: [],
    notes: [],
    /** Structured hits for future ML / analytics */
    signals: [],
  };
}

/** Heuristic stand-in for a future classifier model. */
export function detectWeakZones(text) {
  const hits = [];
  for (const rule of WEAK_ZONE_RULES) {
    if (rule.test.test(String(text || ""))) {
      hits.push({ id: rule.id, zone: rule.zone });
    }
  }
  return hits;
}

export function getWeakZoneIds(progress) {
  const zones = progress?.weakZones || [];
  return WEAK_ZONE_RULES.filter((r) => zones.includes(r.zone)).map((r) => r.id);
}

export function getAdaptiveFollowUps(progress, scenario, { limit = 2 } = {}) {
  const zones = progress?.weakZones || [];
  if (!zones.length) return [];

  return WEAK_ZONE_RULES.filter(
    (r) => zones.includes(r.zone) && r.scenarios.includes(scenario)
  )
    .slice(0, limit)
    .map((r) => ({
      zone: r.zone,
      followUp: r.followUp,
      prompt: r.prompt,
    }));
}

export function getAdaptivePrompts(progress, scenario, mode, basePrompts = []) {
  const adaptive = getAdaptiveFollowUps(progress, scenario, { limit: 2 }).map((a) => a.prompt);
  const merged = [...adaptive, ...basePrompts];
  return [...new Set(merged)].slice(0, 5);
}

export function enrichGreeting(baseGreeting, progress, scenario, mode) {
  const adaptive = getAdaptiveFollowUps(progress, scenario, { limit: 1 });
  if (!adaptive.length || mode !== "trainer") {
    if (!adaptive.length) return baseGreeting;
    const extra = `\n\nЗаметил слабую зону «${adaptive[0].zone}». Можем разобрать её в инфо-режиме или переключиться в тренажёр.`;
    return { text: `${baseGreeting.text}${extra}`, tags: [] };
  }

  const block = [
    "",
    `Слабая зона из прошлых сессий: ${adaptive[0].zone}.`,
    adaptive[0].followUp,
  ].join("\n");

  return { text: `${baseGreeting.text}${block}`, tags: [] };
}

export function appendAdaptiveTail(reply, progress, scenario, mode) {
  if (mode !== "trainer" || !reply) return reply;
  const adaptive = getAdaptiveFollowUps(progress, scenario, { limit: 1 });
  if (!adaptive.length) return reply;

  const already =
    reply.text.includes("слабой зоне") ||
    reply.text.includes("Адаптивно") ||
    reply.text.includes(adaptive[0].followUp);
  if (already) return reply;

  return {
    ...reply,
    text: `${reply.text}\n\nПо слабой зоне «${adaptive[0].zone}»: ${adaptive[0].followUp}`,
  };
}

export function applyProgressUpdate(user, { scenario, userText, reply }) {
  const progress = {
    ...emptyProgress(),
    ...(user.progress || {}),
    byScenario: {
      university: 0,
      job: 0,
      adapt: 0,
      ...(user.progress?.byScenario || {}),
    },
    weakZones: [...(user.progress?.weakZones || [])],
    notes: [...(user.progress?.notes || [])],
    signals: [...(user.progress?.signals || [])],
  };

  progress.sessions = (progress.sessions || 0) + 1;
  progress.byScenario[scenario] = (progress.byScenario[scenario] || 0) + 1;

  const hits = detectWeakZones(userText);
  hits.forEach((hit) => {
    if (!progress.weakZones.includes(hit.zone)) progress.weakZones.unshift(hit.zone);
    progress.signals.unshift({
      at: Date.now(),
      scenario,
      zoneId: hit.id,
      zone: hit.zone,
      engine: "heuristic-v1",
    });
  });

  // Merge zones from live API (KB typical_errors + backend heuristics)
  const apiZones = Array.isArray(reply?.detected_weak_zones)
    ? reply.detected_weak_zones
    : [];
  apiZones.forEach((zone) => {
    const label = String(zone || "").trim();
    if (!label || progress.weakZones.includes(label)) return;
    progress.weakZones.unshift(label);
    progress.signals.unshift({
      at: Date.now(),
      scenario,
      zoneId: "api",
      zone: label,
      engine: "api-detected",
    });
  });

  if (reply?.tags?.includes("improve") || reply?.tags?.includes("example")) {
    const note = String(reply.text || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)[0];
    if (note && !progress.notes.includes(note)) {
      progress.notes.unshift(note.slice(0, 180));
    }
  }

  progress.weakZones = progress.weakZones.slice(0, 8);
  progress.notes = progress.notes.slice(0, 8);
  progress.signals = progress.signals.slice(0, 40);

  return { ...user, progress };
}
