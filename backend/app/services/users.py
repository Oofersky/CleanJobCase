from __future__ import annotations

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import ReportRow, ResumeDraftRow, UserRow
from app.services.auth import hash_password


async def get_user_by_login(session: AsyncSession, login: str) -> UserRow | None:
    result = await session.execute(select(UserRow).where(UserRow.login == login))
    return result.scalar_one_or_none()


async def get_user_by_email(session: AsyncSession, email: str) -> UserRow | None:
    result = await session.execute(select(UserRow).where(UserRow.email == email.lower()))
    return result.scalar_one_or_none()


async def create_user(session: AsyncSession, *, login: str, email: str, password: str) -> UserRow:
    row = UserRow(
        login=login,
        email=email.lower().strip(),
        password_hash=hash_password(password),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def ensure_seed_user(session: AsyncSession) -> UserRow:
    settings = get_settings()
    login = settings.seed_login.strip()
    email = settings.seed_email.strip().lower()
    existing = await get_user_by_login(session, login)
    if existing:
        # re-bind orphans every boot (idempotent)
        await _claim_orphans(session, existing.id)
        return existing
    # email taken by someone else — still create seed login with alt email
    if await get_user_by_email(session, email):
        email = f"{login}+seed@local.dev"
    user = await create_user(
        session,
        login=login,
        email=email,
        password=settings.seed_password,
    )
    await _claim_orphans(session, user.id)
    return user


async def _claim_orphans(session: AsyncSession, user_id: int) -> None:
    await session.execute(
        update(ReportRow).where(ReportRow.user_id.is_(None)).values(user_id=user_id)
    )
    await session.execute(
        update(ResumeDraftRow).where(ResumeDraftRow.user_id.is_(None)).values(user_id=user_id)
    )
    await session.commit()


async def migrate_user_columns(conn) -> None:
    """Add user_id to existing tables (create_all won't alter)."""
    await conn.execute(
        text(
            """
            ALTER TABLE reports
            ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)
            """
        )
    )
    await conn.execute(
        text(
            """
            ALTER TABLE resume_drafts
            ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)
            """
        )
    )
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_reports_user_id ON reports (user_id)"))
    await conn.execute(
        text("CREATE INDEX IF NOT EXISTS ix_resume_drafts_user_id ON resume_drafts (user_id)")
    )
