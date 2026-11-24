from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class FetchError(Exception):
    pass


def unwrap_vacancies(payload: dict[str, Any] | list[Any]) -> list[dict[str, Any]]:
    """Accept trudvsem envelope or list of {vacancy: ...} / bare vacancy dicts."""
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        results = payload.get("results") or {}
        items = results.get("vacancies") if isinstance(results, dict) else None
        if items is None:
            items = payload.get("vacancies") or []
    else:
        return []

    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        vac = item.get("vacancy") if isinstance(item.get("vacancy"), dict) else item
        if isinstance(vac, dict) and vac.get("id"):
            out.append(vac)
    return out


async def fetch_region_vacancies(
    *,
    max_vacancies: int | None = None,
    base_url: str | None = None,
    page_limit: int | None = None,
) -> tuple[list[dict[str, Any]], int]:
    settings = get_settings()
    url = (base_url or settings.vacancies_api_url).rstrip("/")
    limit = page_limit or settings.vacancies_page_limit
    target = max_vacancies if max_vacancies is not None else settings.vacancies_max
    if target < 1:
        return [], 0

    collected: list[dict[str, Any]] = []
    seen: set[str] = set()
    pages = 0
    offset = 0

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            while len(collected) < target:
                pages += 1
                resp = await client.get(url, params={"offset": offset, "limit": limit})
                resp.raise_for_status()
                data = resp.json()
                batch = unwrap_vacancies(data)
                if not batch:
                    break
                for vac in batch:
                    vid = str(vac["id"])
                    if vid in seen:
                        continue
                    seen.add(vid)
                    collected.append(vac)
                    if len(collected) >= target:
                        break
                if len(batch) < limit:
                    break
                offset += limit
                # TZ: process at least two pages when data allows
                if pages >= 2 and len(collected) >= target:
                    break
                if pages >= 50:
                    break
    except Exception as exc:
        raise FetchError(f"API unavailable: {exc}") from exc

    return collected[:target], pages
