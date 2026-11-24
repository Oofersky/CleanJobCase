from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ReportRow
from app.schemas import AnalysisReport, ReportSummary
from app.services.rules import as_seeker_question


def _to_report(row: ReportRow) -> AnalysisReport:
    data = dict(row.payload or {})
    data["id"] = row.id
    data["generated_at"] = row.created_at.isoformat()
    for vac in data.get("vacancies") or []:
        if not isinstance(vac, dict):
            continue
        for rem in vac.get("remarks") or []:
            if isinstance(rem, dict) and rem.get("recommendation"):
                rem["recommendation"] = as_seeker_question(str(rem["recommendation"]))
    return AnalysisReport.model_validate(data)


def _to_summary(row: ReportRow) -> ReportSummary:
    return ReportSummary(
        id=row.id,
        created_at=row.created_at.isoformat(),
        source=row.source,  # type: ignore[arg-type]
        vacancies_processed=row.vacancies_processed,
        ai_used=row.ai_used,
        has_error=bool(row.error),
    )


async def save_report(
    session: AsyncSession,
    report: AnalysisReport,
    *,
    user_id: int | None,
) -> AnalysisReport:
    payload = report.model_dump(mode="json")
    payload.pop("id", None)
    row = ReportRow(
        user_id=user_id,
        source=report.source,
        source_url=report.source_url,
        vacancies_processed=report.vacancies_processed,
        pages_fetched=report.pages_fetched,
        ai_used=report.ai_used,
        error=report.error,
        payload=payload,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_report(row)


async def list_reports(
    session: AsyncSession,
    *,
    user_id: int,
    limit: int = 50,
) -> list[ReportSummary]:
    result = await session.execute(
        select(ReportRow)
        .where(ReportRow.user_id == user_id)
        .order_by(ReportRow.id.desc())
        .limit(limit)
    )
    return [_to_summary(row) for row in result.scalars().all()]


async def get_report(
    session: AsyncSession,
    report_id: int,
    *,
    user_id: int,
) -> AnalysisReport | None:
    row = await session.get(ReportRow, report_id)
    if not row or row.user_id != user_id:
        return None
    return _to_report(row)


async def load_latest(session: AsyncSession, *, user_id: int) -> AnalysisReport | None:
    result = await session.execute(
        select(ReportRow)
        .where(ReportRow.user_id == user_id)
        .order_by(ReportRow.id.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return _to_report(row) if row else None
