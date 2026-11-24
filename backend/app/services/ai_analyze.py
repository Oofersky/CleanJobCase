from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from app.schemas import Remark
from app.services.gigachat_client import complete, gigachat_enabled
from app.services.rules import as_seeker_question

logger = logging.getLogger(__name__)

SYSTEM = """Ты помощник соискателя на портале «Работа в России». По списку вакансий найди только проблемы понятности условий.
Темы: должность, обязанности, требования, оплата, график, место работы, тип занятости.
Учитывай структурированные поля: если сведения уже там есть — отсутствие повтора в тексте НЕ проблема.
Виды: gap | ambiguity | contradiction. Без выдумок и без выводов о нарушении закона.
Поле recommendation — готовый вопрос соискателя работодателю (заканчивай «?»). Не пиши правки вроде «Укажите/Добавьте» для редактора вакансии.
Ответ строго JSON-массив объектов по вакансиям:
[{"vacancy_id":"...","remarks":[{"topic":"...","source_field":"...","quote":"...","quote_secondary":"","kind":"gap|ambiguity|contradiction","problem":"...","recommendation":"..."}]}]
Пустые remarks допустимы. Только JSON."""


def _clip(value: Any, n: int = 180) -> str:
    text = "" if value is None else str(value).strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def _compact_vacancy(vac: dict[str, Any]) -> dict[str, Any]:
    req = vac.get("requirement") if isinstance(vac.get("requirement"), dict) else {}
    addresses = vac.get("addresses") or {}
    loc = ""
    if isinstance(addresses, dict):
        for a in addresses.get("address") or []:
            if isinstance(a, dict) and a.get("location"):
                loc = _clip(a["location"], 100)
                break
    return {
        "id": vac.get("id"),
        "job-name": _clip(vac.get("job-name"), 80),
        "duty": _clip(vac.get("duty"), 180),
        "requirements": _clip(vac.get("requirements"), 140),
        "salary": _clip(vac.get("salary"), 50),
        "salary_min": vac.get("salary_min"),
        "salary_max": vac.get("salary_max"),
        "schedule": _clip(vac.get("schedule"), 50),
        "employment": _clip(vac.get("employment"), 40),
        "education": _clip(req.get("education"), 50),
        "experience": req.get("experience"),
        "location": loc,
    }


def _parse_json_array(raw: str) -> list[Any]:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\[[\s\S]*\]", text)
        if not m:
            return []
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return []
    return data if isinstance(data, list) else []


def _to_remarks(items: list[Any]) -> list[Remark]:
    out: list[Remark] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "ambiguity")
        if kind not in {"gap", "ambiguity", "contradiction"}:
            kind = "ambiguity"
        try:
            remark = Remark(
                topic=str(item.get("topic") or "условия")[:120],
                source_field=str(item.get("source_field") or "duty")[:80],
                quote=str(item.get("quote") or "")[:400],
                quote_secondary=str(item.get("quote_secondary") or "")[:400],
                kind=kind,  # type: ignore[arg-type]
                problem=str(item.get("problem") or "").strip()[:500],
                recommendation=as_seeker_question(str(item.get("recommendation") or "").strip()[:500]),
            )
        except Exception:
            continue
        if remark.problem and remark.recommendation:
            out.append(remark)
    return out


async def analyze_batch_with_ai(vacancies: list[dict[str, Any]], *, timeout_sec: float = 35.0) -> dict[str, list[Remark]]:
    """One GigaChat call for the whole lite batch; hard timeout so UI never hangs."""
    if not gigachat_enabled() or not vacancies:
        return {}
    payload = json.dumps([_compact_vacancy(v) for v in vacancies], ensure_ascii=False)

    async def _call() -> str | None:
        return await complete(
            [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": f"Вакансии ({len(vacancies)} шт.):\n{payload}"},
            ],
            max_tokens=1800,
        )

    try:
        raw = await asyncio.wait_for(_call(), timeout=timeout_sec)
    except asyncio.TimeoutError:
        logger.warning("GigaChat batch timed out after %.0fs", timeout_sec)
        return {}
    except Exception as exc:
        logger.warning("GigaChat batch failed: %s", exc)
        return {}

    if not raw:
        return {}

    by_id: dict[str, list[Remark]] = {}
    for item in _parse_json_array(raw):
        if not isinstance(item, dict):
            continue
        vid = str(item.get("vacancy_id") or item.get("id") or "").strip()
        remarks_raw = item.get("remarks")
        if remarks_raw is None and item.get("problem"):
            remarks_raw = [item]
        if not vid or not isinstance(remarks_raw, list):
            continue
        by_id[vid] = _to_remarks(remarks_raw)
    return by_id
