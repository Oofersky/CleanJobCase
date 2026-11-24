from __future__ import annotations

import asyncio
import logging

from app.config import get_settings
from app.database import SessionLocal
from app.services.pipeline import run_from_api

logger = logging.getLogger(__name__)
_task: asyncio.Task | None = None


async def _loop() -> None:
    settings = get_settings()
    interval = max(5, int(settings.schedule_interval_minutes)) * 60
    use_ai = bool(settings.schedule_use_ai)
    # не дёргаем API+ИИ сразу при каждом рестарте контейнера
    await asyncio.sleep(min(60, interval))
    while True:
        try:
            async with SessionLocal() as session:
                from app.services.users import ensure_seed_user

                owner = await ensure_seed_user(session)
                report = await run_from_api(session, use_ai=use_ai, user_id=owner.id)
            logger.info(
                "scheduled run: id=%s processed=%s ai=%s error=%s",
                report.id,
                report.vacancies_processed,
                report.ai_used,
                report.error,
            )
        except Exception as exc:
            logger.exception("scheduled run failed: %s", exc)
        await asyncio.sleep(interval)


def start_scheduler() -> None:
    global _task
    settings = get_settings()
    if not settings.schedule_enabled:
        logger.info("scheduler disabled")
        return
    if _task and not _task.done():
        return
    logger.info(
        "scheduler on: every %s min, use_ai=%s",
        settings.schedule_interval_minutes,
        settings.schedule_use_ai,
    )
    _task = asyncio.create_task(_loop(), name="vacancy-scheduler")


async def stop_scheduler() -> None:
    global _task
    if _task and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
    _task = None
