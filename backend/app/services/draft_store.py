from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ResumeDraftRow
from app.schemas import ResumeDraftResponse, ResumeDraftSummary


def _to_summary(row: ResumeDraftRow) -> ResumeDraftSummary:
    return ResumeDraftSummary(
        id=row.id,
        created_at=row.created_at.isoformat(),
        vacancy_id=row.vacancy_id,
        job_name=row.job_name,
        company_name=row.company_name,
        ai_used=row.ai_used,
    )


def _to_response(row: ResumeDraftRow) -> ResumeDraftResponse:
    return ResumeDraftResponse(
        id=row.id,
        vacancy_id=row.vacancy_id,
        job_name=row.job_name,
        company_name=row.company_name,
        vacancy_url=None,
        draft_text=row.draft_text,
        ai_used=row.ai_used,
        matched_skills=list(row.matched_skills or []),
        report_id=row.report_id,
        resume=dict(row.resume_payload or {}),
    )


async def save_draft(
    session: AsyncSession,
    *,
    result: ResumeDraftResponse,
    resume: dict[str, Any],
    report_id: int | None,
    user_id: int,
) -> ResumeDraftResponse:
    row = ResumeDraftRow(
        user_id=user_id,
        vacancy_id=result.vacancy_id,
        report_id=report_id,
        job_name=result.job_name,
        company_name=result.company_name,
        draft_text=result.draft_text,
        ai_used=result.ai_used,
        resume_payload=resume,
        matched_skills=result.matched_skills or [],
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_response(row)


async def list_drafts(
    session: AsyncSession,
    *,
    user_id: int,
    limit: int = 40,
) -> list[ResumeDraftSummary]:
    result = await session.execute(
        select(ResumeDraftRow)
        .where(ResumeDraftRow.user_id == user_id)
        .order_by(ResumeDraftRow.id.desc())
        .limit(limit)
    )
    return [_to_summary(row) for row in result.scalars().all()]


async def get_draft(
    session: AsyncSession,
    draft_id: int,
    *,
    user_id: int,
) -> ResumeDraftResponse | None:
    row = await session.get(ResumeDraftRow, draft_id)
    if not row or row.user_id != user_id:
        return None
    return _to_response(row)
