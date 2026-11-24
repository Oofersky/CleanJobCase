from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.schemas import AnalysisReport, VacancyReport
from app.services.ai_analyze import analyze_batch_with_ai
from app.services.fetch import FetchError, fetch_region_vacancies, unwrap_vacancies
from app.services.gigachat_client import gigachat_enabled
from app.services.report_store import load_latest, save_report
from app.services.rules import analyze_rules

logger = logging.getLogger(__name__)


def _company_name(vac: dict[str, Any]) -> str | None:
    company = vac.get("company")
    if isinstance(company, dict):
        name = company.get("name")
        return str(name) if name else None
    return None


def _dedupe_remarks(remarks):
    seen: set[tuple[str, str, str]] = set()
    out = []
    for r in remarks:
        key = (r.topic, r.source_field, r.problem)
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


async def run_on_vacancies(
    session: AsyncSession,
    vacancies: list[dict[str, Any]],
    *,
    source: Literal["api", "fixture", "upload"],
    source_url: str | None,
    pages_fetched: int,
    use_ai: bool,
    persist: bool,
    user_id: int | None = None,
) -> AnalysisReport:
    base: dict[str, VacancyReport] = {}
    for vac in vacancies:
        vid = str(vac["id"])
        req = vac.get("requirement")
        base[vid] = VacancyReport(
            vacancy_id=vid,
            vacancy_url=vac.get("vac_url"),
            job_name=vac.get("job-name"),
            company_name=_company_name(vac),
            duty=str(vac["duty"]) if vac.get("duty") is not None else None,
            requirements=str(vac["requirements"]) if vac.get("requirements") is not None else None,
            requirement=req if isinstance(req, dict) else None,
            schedule=str(vac["schedule"]) if vac.get("schedule") is not None else None,
            employment=str(vac["employment"]) if vac.get("employment") is not None else None,
            salary=str(vac["salary"]) if vac.get("salary") is not None else None,
            remarks=analyze_rules(vac),
        )

    ai_used = False
    if use_ai and gigachat_enabled() and vacancies:
        logger.info("GigaChat batch: %s vacancies (source=%s)", len(vacancies), source)
        try:
            ai_map = await analyze_batch_with_ai(vacancies)
            if ai_map:
                ai_used = True
                for vid, extra in ai_map.items():
                    if vid not in base:
                        continue
                    base[vid].remarks = _dedupe_remarks([*base[vid].remarks, *extra])
        except Exception as exc:
            logger.warning("batch AI skipped: %s", exc)
    elif use_ai and not gigachat_enabled():
        logger.info("AI requested but GigaChat not configured — rules-only")


    items = list(base.values())
    report = AnalysisReport(
        generated_at=datetime.now(timezone.utc).isoformat(),
        source=source,
        source_url=source_url,
        vacancies_processed=len(items),
        pages_fetched=pages_fetched,
        ai_used=ai_used,
        vacancies=items,
    )
    if persist:
        report = await save_report(session, report, user_id=user_id)
    return report


async def run_from_api(
    session: AsyncSession,
    *,
    max_vacancies: int | None = None,
    use_ai: bool = True,
    user_id: int,
) -> AnalysisReport:
    settings = get_settings()
    try:
        vacancies, pages = await fetch_region_vacancies(max_vacancies=max_vacancies)
    except FetchError as exc:
        last = await load_latest(session, user_id=user_id)
        if last:
            failed = last.model_copy(deep=True)
            failed.error = str(exc)
            failed.generated_at = datetime.now(timezone.utc).isoformat()
            return failed
        return AnalysisReport(
            generated_at=datetime.now(timezone.utc).isoformat(),
            source="api",
            source_url=settings.vacancies_api_url,
            vacancies_processed=0,
            pages_fetched=0,
            ai_used=False,
            error=str(exc),
            vacancies=[],
        )
    return await run_on_vacancies(
        session,
        vacancies,
        source="api",
        source_url=settings.vacancies_api_url,
        pages_fetched=pages,
        use_ai=use_ai,
        persist=True,
        user_id=user_id,
    )


async def run_from_payload(
    session: AsyncSession,
    payload: dict[str, Any] | list[Any],
    *,
    source: Literal["fixture", "upload"] = "upload",
    use_ai: bool = True,
    persist: bool = False,
    user_id: int | None = None,
) -> AnalysisReport:
    vacancies = unwrap_vacancies(payload)
    return await run_on_vacancies(
        session,
        vacancies,
        source=source,
        source_url=None,
        pages_fetched=0,
        use_ai=use_ai,
        persist=persist,
        user_id=user_id,
    )
