from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.schemas import ResumeDraftResponse, ResumeVacancyOption, VacancyReport
from app.services.fetch import unwrap_vacancies
from app.services.gigachat_client import complete, gigachat_enabled
from app.services.report_store import get_report, list_reports


def _company_name(vac: dict[str, Any]) -> str | None:
    company = vac.get("company")
    if isinstance(company, dict):
        name = company.get("name")
        return str(name) if name else None
    if vac.get("company_name"):
        return str(vac["company_name"])
    return None


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _skill_strings(resume: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for item in _as_list(resume.get("skills")):
        text = str(item).strip()
        if text:
            out.append(text)
    return out


def _in_hay(needle: str, hay: str) -> bool:
    if not needle or len(needle) < 2:
        return False
    if needle in hay:
        return True
    if len(needle) >= 4 and needle[:-1] in hay:
        return True
    return False


def _match_skills(skills: list[str], vac: dict[str, Any]) -> list[str]:
    parts = [str(vac.get(k) or "") for k in ("requirements", "duty", "job-name", "qualification")]
    req = vac.get("requirement")
    if isinstance(req, dict):
        parts.extend(str(v) for v in req.values() if v)
    hay = " ".join(parts).lower()
    matched: list[str] = []
    for skill in skills:
        token = skill.lower().strip()
        if _in_hay(token, hay):
            matched.append(skill)
            continue
        if any(_in_hay(part, hay) for part in re.split(r"[\s,/]+", token) if len(part) > 3):
            matched.append(skill)
    return matched


def _format_experience(items: list[Any]) -> list[str]:
    lines: list[str] = []
    for item in items[:6]:
        if isinstance(item, dict):
            role = str(item.get("role") or item.get("title") or "").strip()
            company = str(item.get("company") or "").strip()
            period = str(item.get("period") or "").strip()
            details = str(item.get("details") or item.get("description") or "").strip()
            head = " — ".join(p for p in (role, company) if p)
            if period:
                head = f"{head} ({period})" if head else period
            if head:
                lines.append(f"• {head}")
            if details:
                lines.append(f"  {details}")
        else:
            text = str(item).strip()
            if text:
                lines.append(f"• {text}")
    return lines


def _format_education(items: list[Any]) -> list[str]:
    lines: list[str] = []
    for item in items[:4]:
        if isinstance(item, dict):
            degree = str(item.get("degree") or "").strip()
            school = str(item.get("school") or "").strip()
            year = str(item.get("year") or "").strip()
            parts = [p for p in (degree, school) if p]
            line = ", ".join(parts)
            if year:
                line = f"{line} ({year})" if line else year
            if line:
                lines.append(f"• {line}")
        else:
            text = str(item).strip()
            if text:
                lines.append(f"• {text}")
    return lines


def _relevance_score(item: Any, vac: dict[str, Any]) -> int:
    hay = " ".join(
        str(vac.get(k) or "") for k in ("job-name", "duty", "requirements")
    ).lower()
    if isinstance(item, dict):
        blob = " ".join(
            str(item.get(k) or "") for k in ("role", "title", "company", "details", "description")
        ).lower()
    else:
        blob = str(item).lower()
    score = 0
    for word in re.findall(r"[a-zа-яё0-9]{4,}", hay):
        if word in blob:
            score += 1
    return score


def report_item_to_vacancy(item: VacancyReport) -> dict[str, Any]:
    vac: dict[str, Any] = {
        "id": item.vacancy_id,
        "job-name": item.job_name,
        "vac_url": item.vacancy_url,
        "duty": item.duty,
        "requirements": item.requirements,
        "requirement": item.requirement,
        "schedule": item.schedule,
        "employment": item.employment,
        "salary": item.salary,
    }
    if item.company_name:
        vac["company"] = {"name": item.company_name}
    return vac


def _skills_from_vacancy(vac: dict[str, Any]) -> list[str]:
    req = vac.get("requirement") if isinstance(vac.get("requirement"), dict) else {}
    blob = " ".join(
        str(x or "")
        for x in (
            vac.get("requirements"),
            vac.get("duty"),
            vac.get("qualification"),
            req.get("qualification"),
            req.get("education"),
        )
    )
    skills: list[str] = []
    for part in re.split(r"[;\n•·|]+", blob):
        chunk = part.strip(" .,-–—")
        if not chunk:
            continue
        # short skill-like phrases
        if 2 <= len(chunk) <= 48 and not chunk.lower().startswith(("обязан", "выполн", "работа")):
            if chunk not in skills:
                skills.append(chunk)
        if len(skills) >= 6:
            break
    if not skills:
        job = str(vac.get("job-name") or "").strip()
        if job:
            skills.append(job)
        skills.append("MS Office")
    return skills[:6]


def build_sample_resume(vac: dict[str, Any]) -> dict[str, Any]:
    """Example resume JSON tailored to vacancy fields (for UI «Подставить пример»)."""
    job = str(vac.get("job-name") or "Специалист").strip() or "Специалист"
    company = _company_name(vac) or "ООО «Пример»"
    duty = str(vac.get("duty") or "").strip()
    req = vac.get("requirement") if isinstance(vac.get("requirement"), dict) else {}
    education_raw = str(req.get("education") or "").strip()
    skills = _skills_from_vacancy(vac)
    details = duty if duty else f"Выполнение задач по профилю должности «{job}»."
    if len(details) > 280:
        details = details[:277] + "…"
    degree = education_raw if education_raw and education_raw.lower() not in {"не указано", "-"} else "Среднее профессиональное / высшее"
    return {
        "full_name": "А. И.",
        "summary": (
            f"Соискатель с опытом, близким к вакансии «{job}». "
            f"Готов обсудить график, оплату и условия работы."
        ),
        "skills": skills,
        "experience": [
            {
                "role": job,
                "company": f"ООО «Пример» (профиль близок к {company})",
                "period": "2022–2025",
                "details": details,
            },
            {
                "role": "Стажёр / помощник",
                "company": "АО «ПримерТех»",
                "period": "2021–2022",
                "details": "Поддержка профильных задач, работа с документами и учётом.",
            },
        ],
        "education": [
            {
                "degree": degree,
                "school": "БФУ им. И. Канта",
                "year": "2022",
            }
        ],
    }


def _rule_draft(resume: dict[str, Any], vac: dict[str, Any]) -> ResumeDraftResponse:
    name = str(resume.get("full_name") or resume.get("name") or "Кандидат").strip()
    job = str(vac.get("job-name") or "вакансии").strip()
    company = _company_name(vac)
    skills = _skill_strings(resume)
    matched = _match_skills(skills, vac)
    experience = _as_list(resume.get("experience"))
    education = _as_list(resume.get("education"))
    summary = str(resume.get("summary") or "").strip()

    experience_sorted = sorted(experience, key=lambda x: _relevance_score(x, vac), reverse=True)
    other_skills = [s for s in skills if s not in matched]

    lines = [
        f"ЧЕРНОВИК РЕЗЮМЕ под вакансию «{job}»"
        + (f" ({company})" if company else ""),
        "",
        name,
    ]
    if summary:
        lines.extend(["", "О себе", summary])
    elif matched:
        lines.extend(
            [
                "",
                "О себе",
                f"Соискатель с навыками, релевантными вакансии «{job}»: {', '.join(matched[:6])}.",
            ]
        )

    if matched or other_skills:
        lines.append("")
        lines.append("Навыки")
        if matched:
            lines.append("Релевантные вакансии: " + ", ".join(matched) + ".")
        if other_skills:
            lines.append("Также: " + ", ".join(other_skills[:12]) + ".")

    exp_lines = _format_experience(experience_sorted)
    if exp_lines:
        lines.append("")
        lines.append("Опыт работы")
        lines.extend(exp_lines)

    edu_lines = _format_education(education)
    if edu_lines:
        lines.append("")
        lines.append("Образование")
        lines.extend(edu_lines)

    lines.extend(
        [
            "",
            "—",
            "Важно: опыт, навыки и образование взяты только из исходного резюме соискателя. "
            "Новые факты не добавлялись; акцент сделан на соответствие полям вакансии.",
        ]
    )

    used = [k for k in ("full_name", "name", "summary", "skills", "experience", "education") if resume.get(k)]
    return ResumeDraftResponse(
        vacancy_id=str(vac.get("id")) if vac.get("id") else None,
        job_name=vac.get("job-name"),
        company_name=company,
        vacancy_url=vac.get("vac_url"),
        draft_text="\n".join(lines).strip(),
        ai_used=False,
        used_fields=used or ["skills", "experience", "education"],
        matched_skills=matched,
        vacancy_fields_used=["job-name", "duty", "requirements", "schedule", "employment"],
    )


async def draft_resume(*, resume: dict[str, Any], vac: dict[str, Any], use_ai: bool = True) -> ResumeDraftResponse:
    fallback = _rule_draft(resume, vac)
    if not (use_ai and gigachat_enabled()):
        return fallback

    system = (
        "Ты помощник соискателя на портале «Работа в России». "
        "Составь черновик РЕЗЮМЕ под выбранную вакансию. "
        "Разрешено использовать ТОЛЬКО факты из объекта resume (опыт, навыки, образование, summary, ФИО). "
        "Запрещено выдумывать места работы, должности, навыки, образование, даты и достижения. "
        "Можно переставить блоки опыта и выделить навыки, которые ближе к duty/requirements вакансии. "
        "Пиши по-русски обычным текстом, структура: ФИО, О себе, Навыки, Опыт, Образование. "
        "Без Markdown-заголовков (#), 150–280 слов."
    )
    user = json.dumps(
        {
            "resume": resume,
            "vacancy": {
                "job-name": vac.get("job-name"),
                "company": _company_name(vac),
                "duty": vac.get("duty"),
                "requirements": vac.get("requirements"),
                "requirement": vac.get("requirement"),
                "schedule": vac.get("schedule"),
                "employment": vac.get("employment"),
                "salary": vac.get("salary"),
            },
            "matched_skills_hint": fallback.matched_skills,
        },
        ensure_ascii=False,
    )
    text = await complete(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=900,
    )
    if not text:
        return fallback
    return fallback.model_copy(update={"draft_text": text.strip(), "ai_used": True})


def load_fixture_vacancies() -> list[dict[str, Any]]:
    """Для тестов и проверочного режима анализа."""
    settings = get_settings()
    path = Path(settings.fixtures_dir) / "sample_vacancies.json"
    if not path.exists():
        return []
    return unwrap_vacancies(json.loads(path.read_text(encoding="utf-8")))


def norm_vacancy_text(value: str | None) -> str:
    text = (value or "").casefold().strip()
    for ch in ("«", "»", "„", "“", "”", "'", "`"):
        text = text.replace(ch, '"')
    text = text.replace('"', "")
    return re.sub(r"\s+", " ", text).strip()


def vacancy_fingerprint(job_name: str | None, company_name: str | None) -> str:
    job = norm_vacancy_text(job_name)
    company = norm_vacancy_text(company_name)
    if not job and not company:
        return ""
    return f"{job}|{company}"


def _option_score(opt: ResumeVacancyOption) -> tuple[int, int, int]:
    # выше = лучше: не demo, больше заполненных полей, новее отчёт
    non_demo = 0 if str(opt.id).startswith("demo-") else 1
    filled = sum(
        1
        for x in (opt.duty, opt.requirements, opt.schedule, opt.employment, opt.salary, opt.vacancy_url)
        if (x or "").strip()
    )
    return (non_demo, filled, opt.report_id)


def dedupe_resume_options(options: list[ResumeVacancyOption]) -> list[ResumeVacancyOption]:
    by_id: dict[str, ResumeVacancyOption] = {}
    for opt in options:
        vid = str(opt.id)
        if vid not in by_id or _option_score(opt) > _option_score(by_id[vid]):
            by_id[vid] = opt

    by_fp: dict[str, ResumeVacancyOption] = {}
    no_fp: list[ResumeVacancyOption] = []
    for opt in by_id.values():
        fp = vacancy_fingerprint(opt.job_name, opt.company_name)
        if not fp:
            no_fp.append(opt)
            continue
        cur = by_fp.get(fp)
        if cur is None or _option_score(opt) > _option_score(cur):
            by_fp[fp] = opt
    return [*by_fp.values(), *no_fp]



async def list_resume_vacancies(session: AsyncSession, *, user_id: int) -> list[ResumeVacancyOption]:
    options: list[ResumeVacancyOption] = []
    for summary in await list_reports(session, user_id=user_id, limit=40):
        report = await get_report(session, summary.id, user_id=user_id)
        if not report or report.id is None:
            continue
        for item in report.vacancies:
            options.append(
                ResumeVacancyOption(
                    id=str(item.vacancy_id),
                    report_id=report.id,
                    job_name=item.job_name,
                    company_name=item.company_name,
                    vacancy_url=item.vacancy_url,
                    duty=item.duty,
                    requirements=item.requirements,
                    schedule=item.schedule,
                    employment=item.employment,
                    salary=item.salary,
                )
            )
    return dedupe_resume_options(options)


async def resolve_vacancy(
    session: AsyncSession,
    *,
    user_id: int,
    vacancy_id: str | None,
    report_id: int | None = None,
    vacancy: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], int | None]:
    if isinstance(vacancy, dict) and vacancy.get("id"):
        return vacancy, report_id

    if not vacancy_id:
        raise ValueError("Выберите вакансию из списка")

    if report_id is not None:
        report = await get_report(session, report_id, user_id=user_id)
        if not report:
            raise ValueError("Отчёт не найден")
        for item in report.vacancies:
            if str(item.vacancy_id) == str(vacancy_id):
                return report_item_to_vacancy(item), report.id
        raise ValueError("Вакансия не найдена в выбранном отчёте")

    for summary in await list_reports(session, user_id=user_id, limit=40):
        report = await get_report(session, summary.id, user_id=user_id)
        if not report:
            continue
        for item in report.vacancies:
            if str(item.vacancy_id) == str(vacancy_id):
                return report_item_to_vacancy(item), report.id

    raise ValueError("Вакансия не найдена в сохранённых отчётах. Сначала сформируйте отчёт на платформе.")
