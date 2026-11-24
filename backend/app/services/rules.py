from __future__ import annotations

import re
from typing import Any

from app.schemas import Remark

AMBIGUOUS = [
    (
        re.compile(r"гибк(ий|ого|ая|ие)\s+график", re.I),
        "график",
        "Какие именно дни недели, смены и часы работы подразумевает «гибкий график»?",
    ),
    (
        re.compile(r"по\s+договор[её]нност", re.I),
        "условия",
        "Что именно «по договорённости» — график, оплата или формат работы?",
    ),
    (
        re.compile(r"конкурентн(?:ая|ую)\s+зарплат\w*|конкурентн(?:ая|ую)\s+оплат\w*", re.I),
        "оплата",
        "Какая вилка оклада или оклад «от/до» в рублях?",
    ),
    (
        re.compile(r"достойн(?:ая|ую)\s+зарплат\w*|достойн(?:ая|ую)\s+оплат\w*", re.I),
        "оплата",
        "Какой конкретный размер оплаты труда?",
    ),
    (
        re.compile(r"сменн(ый|ого)\s+график", re.I),
        "график",
        "Какая длительность смены, как устроена ротация и есть ли ночные часы?",
    ),
    (
        re.compile(r"свободн(ый|ого)\s+график", re.I),
        "график",
        "Какие рамки присутствия и как согласуется время?",
    ),
    (
        re.compile(r"удал[её]нн", re.I),
        "место работы",
        "Это полностью удалёнка, гибрид или нужны поездки — какие требования к локации?",
    ),
    (
        re.compile(r"опыт\s+приветствуется", re.I),
        "требования",
        "Опыт обязателен и какой минимальный стаж нужен?",
    ),
    (
        re.compile(r"без\s+опыта", re.I),
        "требования",
        "Стаж действительно не нужен и есть ли наставничество?",
    ),
]

_IMPERATIVE = re.compile(
    r"^(укажите|добавьте|перечислите|опишите|приведите|замените|скажите|подтвердите|уточните|спросите)\b[:\s]*",
    re.I,
)


def as_seeker_question(text: str) -> str:
    """Turn editor-style imperatives into a question for the applicant."""
    raw = (text or "").strip()
    if not raw:
        return raw
    if raw.endswith("?"):
        return raw
    rest = _IMPERATIVE.sub("", raw).strip(" :")
    if not rest:
        return raw.rstrip(".") + "?"
    low = rest.lower()
    if low.startswith(("полная", "частичная", "временная", "стажировка")) or "тип занятости" in low:
        body = rest.rstrip(".")
        return f"Какой тип занятости — {body[0].lower() + body[1:]}?"
    if not low.startswith(("как", "что", "какой", "какая", "какие", "где", "есть", "можно", "нужен", "опыт", "стаж", "это")):
        body = rest[0].lower() + rest[1:] if rest[0].isupper() else rest
        return f"Можно уточнить: {body.rstrip('.')}?"
    if rest[0].islower():
        rest = rest[0].upper() + rest[1:]
    return rest.rstrip(".") + "?"


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return str(value)
    return str(value).strip()


def _location(vac: dict[str, Any]) -> str:
    addresses = vac.get("addresses") or {}
    items = addresses.get("address") if isinstance(addresses, dict) else None
    if isinstance(items, list):
        parts = [_text(a.get("location")) for a in items if isinstance(a, dict)]
        return "; ".join(p for p in parts if p)
    return ""


def _blob(vac: dict[str, Any]) -> str:
    parts = [
        _text(vac.get("job-name")),
        _text(vac.get("duty")),
        _text(vac.get("requirements")),
        _text(vac.get("qualification")),
        _text(vac.get("salary")),
        _text(vac.get("schedule")),
        _text(vac.get("employment")),
        _location(vac),
    ]
    req = vac.get("requirement") if isinstance(vac.get("requirement"), dict) else {}
    parts.extend([_text(req.get("education")), _text(req.get("qualification")), _text(req.get("experience"))])
    return "\n".join(p for p in parts if p)


def analyze_rules(vac: dict[str, Any]) -> list[Remark]:
    remarks: list[Remark] = []

    job_name = _text(vac.get("job-name"))
    if not job_name:
        remarks.append(
            Remark(
                topic="название должности",
                source_field="job-name",
                quote="",
                kind="gap",
                problem="Не указано название должности.",
                recommendation="Как точно называется должность?",
            )
        )

    duty = _text(vac.get("duty"))
    if not duty or len(duty) < 40:
        remarks.append(
            Remark(
                topic="обязанности",
                source_field="duty",
                quote=duty,
                kind="gap",
                problem="Обязанности не описаны или слишком краткие.",
                recommendation="Какие основные задачи и зоны ответственности на этой роли?",
            )
        )

    requirements = _text(vac.get("requirements"))
    req = vac.get("requirement") if isinstance(vac.get("requirement"), dict) else {}
    structured_req = " ".join(
        filter(None, [_text(req.get("education")), _text(req.get("qualification")), _text(req.get("experience"))])
    )
    if not requirements and not structured_req:
        remarks.append(
            Remark(
                topic="требования",
                source_field="requirements",
                quote="",
                kind="gap",
                problem="Требования к кандидату не указаны ни в описании, ни в структурированных полях.",
                recommendation="Какие нужны образование, навыки и опыт — или опыт не требуется?",
            )
        )

    salary = _text(vac.get("salary"))
    salary_min = vac.get("salary_min")
    salary_max = vac.get("salary_max")
    has_structured_pay = salary_min is not None or salary_max is not None
    if not salary and not has_structured_pay:
        remarks.append(
            Remark(
                topic="оплата",
                source_field="salary",
                quote="",
                kind="gap",
                problem="Оплата труда не указана.",
                recommendation="Какой оклад или вилка «от/до» в рублях — до вычета НДФЛ или нетто?",
            )
        )

    schedule = _text(vac.get("schedule"))
    if not schedule:
        remarks.append(
            Remark(
                topic="график",
                source_field="schedule",
                quote="",
                kind="gap",
                problem="График работы не указан.",
                recommendation="Какой тип графика и какие часы или дни работы?",
            )
        )

    employment = _text(vac.get("employment"))
    if not employment:
        remarks.append(
            Remark(
                topic="тип занятости",
                source_field="employment",
                quote="",
                kind="gap",
                problem="Тип занятости не указан.",
                recommendation="Какой тип занятости — полная, частичная, временная или стажировка?",
            )
        )

    location = _location(vac)
    if not location:
        remarks.append(
            Remark(
                topic="место работы",
                source_field="addresses.address.location",
                quote="",
                kind="gap",
                problem="Адрес или населённый пункт места работы не указан.",
                recommendation="Где место работы — какой город и адрес, или это удалённый формат?",
            )
        )

    if has_structured_pay and salary:
        nums = [int(x) for x in re.findall(r"\d{4,}", salary.replace(" ", ""))]
        structured_vals = [int(v) for v in (salary_min, salary_max) if isinstance(v, (int, float))]
        if nums and structured_vals:
            if min(nums) > max(structured_vals) * 1.5 or max(nums) < min(structured_vals) * 0.5:
                remarks.append(
                    Remark(
                        topic="оплата",
                        source_field="salary",
                        quote=salary,
                        quote_secondary=f"salary_min={salary_min}, salary_max={salary_max}",
                        kind="contradiction",
                        problem="Текст оплаты не согласуется со структурированными полями salary_min/salary_max.",
                        recommendation="Какая сумма верная — из текста вакансии или из числовой вилки?",
                    )
                )

    blob = _blob(vac)
    for pattern, topic, rec in AMBIGUOUS:
        m = pattern.search(blob)
        if not m:
            continue
        if "график" in topic:
            if re.search(r"\b([01]?\d|2[0-3])[:.\-][0-5]\d\b", blob) or re.search(
                r"(пн|вт|ср|чт|пт|сб|вс|понедельник|пятниц)", blob, re.I
            ):
                continue
        field = "schedule" if topic == "график" else ("salary" if topic == "оплата" else "duty")
        remarks.append(
            Remark(
                topic=topic,
                source_field=field,
                quote=m.group(0),
                kind="ambiguity",
                problem=f"Формулировка «{m.group(0)}» неоднозначна для соискателя.",
                recommendation=rec,
            )
        )

    return [
        r.model_copy(update={"recommendation": as_seeker_question(r.recommendation)}) for r in remarks
    ]
