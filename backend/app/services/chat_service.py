from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Any
from app.knowledge import get_scenario
from app.knowledge.errors import adaptive_follow_up_from_kb, detect_zones_from_kb, format_error_feedback, match_typical_errors
from app.knowledge.retrieve import format_chunks_for_prompt, format_sources_for_prompt, retrieve_for_chat
from app.knowledge.search import get_case_at, list_cases
from app.ml import adaptive_follow_up, detect_weak_zones
from app.services.gigachat_client import gigachat_enabled, mentor_chat
DISCLAIMER_TAIL = 'Рекомендации носят информационный характер и не заменяют официальные требования вузов и работодателей.'
META_NEXT = {'следующий', 'следующий кейс', 'ещё кейс', 'еще кейс', 'дальше', 'next', 'пропусти', 'пропустить'}
META_START = {'готов', 'готов к кейсу', 'давай', 'давай кейс', 'дай кейс', 'начнём', 'начнем', 'старт', 'поехали'}
META_RESTART = {'заново', 'сначала', 'пройти ещё раз', 'пройти еще раз', 'restart', 'начать заново'}
_VERDICT_LINE = re.compile('(?im)^\\s*(?:VERDICT|ВЕРДИКТ)\\s*:\\s*(ok|improve|верно|улучшить)\\s*$')

def _normalize_meta(text: str) -> str:
    return ' '.join(text.lower().strip().rstrip('.!?…').split())

def _hit_any(text: str, signals: list[str]) -> bool:
    lowered = text.lower()
    return any((str(signal).lower() in lowered for signal in signals if signal))

@dataclass
class ChatResult:
    text: str
    tags: list[str] = field(default_factory=list)
    detected_weak_zones: list[str] = field(default_factory=list)
    sources: list[dict[str, str]] = field(default_factory=list)
    case_id: str | None = None
    case_index: int | None = None
    next_case_index: int | None = None
    total_cases: int | None = None
    error_ids: list[str] = field(default_factory=list)
    trainer_completed: bool = False
    trainer_phase: str | None = None

def _kb_fallback_text(chunks_text: str, sources: list[dict[str, str]]) -> str:
    if not chunks_text.strip():
        return f'Пока не нашёл релевантный фрагмент в базе знаний. Уточни вопрос или проверь сценарий. {DISCLAIMER_TAIL}'
    return f'GigaChat не настроен или временно недоступен — ниже фрагменты из базы знаний:\n\n{chunks_text}\n\n{DISCLAIMER_TAIL}'

def _strip_verdict_line(text: str) -> tuple[str, str | None]:
    match = _VERDICT_LINE.search(text or '')
    if not match:
        return ((text or '').strip(), None)
    raw = match.group(1).lower()
    verdict = 'ok' if raw in {'ok', 'верно'} else 'improve'
    cleaned = _VERDICT_LINE.sub('', text or '').strip()
    cleaned = re.sub('\\n{3,}', '\n\n', cleaned)
    return (cleaned, verdict)

def _derive_tags(*, mode: str, text: str, case: dict[str, Any] | None, scenario: dict[str, Any], skip_feedback: bool, llm_verdict: str | None) -> tuple[list[str], list[str]]:
    if mode != 'trainer' or skip_feedback:
        return ([], [])
    error_hits = match_typical_errors(scenario, text)
    error_ids = [str(e.get('id') or '') for e in error_hits if e.get('id')]
    if llm_verdict == 'ok':
        return (['ok', 'example'], error_ids)
    if llm_verdict == 'improve':
        return (['improve', 'example'], error_ids)
    if error_hits:
        return (['improve', 'example'], error_ids)
    if case:
        weak = _hit_any(text, list(case.get('weak_signals') or []))
        strong = _hit_any(text, list(case.get('ok_signals') or []))
        if strong and (not weak):
            return (['ok', 'example'], error_ids)
        if weak:
            return (['improve', 'example'], error_ids)
    return (['improve', 'example'], error_ids)

def _append_adaptive(reply_text: str, *, scenario_data: dict[str, Any], scenario_id: str, weak_zones: list[str], mode: str) -> str:
    if mode != 'trainer' or not weak_zones:
        return reply_text
    follow = adaptive_follow_up_from_kb(scenario_data, weak_zones)
    if not follow:
        follow = adaptive_follow_up(weak_zones, scenario_id)
    if not follow:
        return reply_text
    lowered = reply_text.lower()
    if 'слабой зоне' in lowered or 'адаптивно' in lowered:
        return reply_text
    if follow in reply_text:
        return reply_text
    return f'{reply_text}\n\n{follow}'

def _format_case_card(case: dict[str, Any], number: int, total: int) -> str:
    prompt = str(case.get('prompt') or '').strip()
    return f'**Кейс {number} из {total}**\n\n{prompt}\n\nОтветь в 3–6 предложениях — как на реальной встрече.'

def _format_complete(total: int) -> str:
    return f'**Тренажёр завершён**\n\nТы прошёл все {total} кейсов. Разборы сохранены в этом чате — можешь открыть профиль и обновить слабые зоны, либо написать «заново», чтобы пройти круг ещё раз.\n\n{DISCLAIMER_TAIL}'

async def build_chat_reply(*, text: str, scenario: str, mode: str, weak_zones: list[str] | None=None, case_index: int=0, history: list[dict[str, Any]] | None=None, opinion_hints: list[str] | None=None) -> ChatResult:
    scenario_data = get_scenario(scenario)
    if not scenario_data:
        return ChatResult(text='Сценарий не найден в базе знаний.', tags=[])
    kb_zones = detect_zones_from_kb(scenario_data, text)
    heuristic_zones = detect_weak_zones(text)
    detected = list(dict.fromkeys([*kb_zones, *heuristic_zones]))
    known_zones = list(dict.fromkeys([*(weak_zones or []), *detected]))
    cases = list_cases(scenario_data)
    total = len(cases)
    meta = _normalize_meta(text)
    if mode == 'trainer' and total and (meta in META_RESTART):
        case, _ = get_case_at(scenario_data, 0)
        body = 'Начинаем тренажёр заново — 5 кейсов подряд, в конце будет итог.\n\n' + _format_case_card(case or {}, 1, total)
        return ChatResult(text=body, tags=[], detected_weak_zones=detected, sources=[], case_id=str((case or {}).get('id') or '') or None, case_index=0, next_case_index=0, total_cases=total, trainer_completed=False, trainer_phase='present')
    if mode == 'trainer' and total and (meta in META_START):
        idx = max(0, min(case_index, total - 1))
        case, _ = get_case_at(scenario_data, idx)
        title = str(scenario_data.get('title') or scenario)
        body = f'Тренажёр «{title}»: {total} кейсов. Отвечай по одному — это не свободный чат.\n\n' + _format_case_card(case or {}, idx + 1, total)
        return ChatResult(text=body, tags=[], detected_weak_zones=detected, sources=[], case_id=str((case or {}).get('id') or '') or None, case_index=idx, next_case_index=idx, total_cases=total, trainer_completed=False, trainer_phase='present')
    if mode == 'trainer' and total and (case_index >= total):
        return ChatResult(text=f'Круг тренажёра уже завершён. Напиши «заново», чтобы пройти все {total} кейсов с начала.', tags=[], detected_weak_zones=detected, sources=[], case_id=None, case_index=total - 1, next_case_index=None, total_cases=total, trainer_completed=True, trainer_phase='complete')
    skip_feedback = mode == 'trainer' and meta in META_NEXT
    effective_index = max(0, min(case_index, max(total - 1, 0))) if total else 0
    if mode == 'trainer' and skip_feedback and total:
        if effective_index >= total - 1:
            case, _ = get_case_at(scenario_data, effective_index)
            return ChatResult(text=f'Это уже последний кейс круга. Ответь на него — после разбора тренажёр завершится. Или напиши «заново», чтобы начать с кейса 1.\n\n{_format_case_card(case or {}, total, total)}', tags=[], case_id=str((case or {}).get('id') or '') or None, case_index=effective_index, next_case_index=effective_index, total_cases=total, trainer_completed=False, trainer_phase='present')
        effective_index = effective_index + 1
    retrieval = retrieve_for_chat(scenario_data, text if not skip_feedback else 'кейс', mode=mode, case_index=effective_index)
    kb_block = format_chunks_for_prompt(retrieval.chunks)
    sources_block = format_sources_for_prompt(retrieval.sources)
    title = str(scenario_data.get('title') or scenario)
    answered_index = retrieval.case_index if retrieval.case_index is not None else effective_index
    is_last_case = bool(total and answered_index >= total - 1)
    trainer_completed = False
    trainer_phase: str | None = None
    trainer_hint = ''
    if mode == 'trainer' and retrieval.case:
        trainer_phase = 'present' if skip_feedback else 'feedback'
        if skip_feedback:
            trainer_hint = 'Пользователь просит следующий кейс без разбора. Кратко (2–3 предложения) представь ТОЛЬКО текущий кейс из базы. Не давай разбор предыдущего. Не добавляй VERDICT.'
        elif is_last_case:
            trainer_hint = 'Это ПОСЛЕДНИЙ кейс тренажёра. Дай персональный разбор ответа. НЕ анонсируй следующий кейс — круг заканчивается. В самом конце отдельной строкой: VERDICT: ok  или  VERDICT: improve'
        else:
            trainer_hint = 'Дай персональный разбор ответа по текущему кейсу. НЕ придумывай следующий кейс сам — его добавит система. В самом конце отдельной строкой: VERDICT: ok  или  VERDICT: improve'
    if known_zones and mode == 'trainer' and (not skip_feedback):
        trainer_hint = f"{trainer_hint}\nУчти слабые зоны пользователя: {', '.join(known_zones[:4])}."
    reply_text = None
    if gigachat_enabled():
        reply_text = await mentor_chat(user_text=text, scenario_title=title, mode=mode, kb_block=kb_block, sources_block=sources_block, history=history, trainer_hint=trainer_hint, opinion_hints=opinion_hints)
    if not reply_text and mode == 'trainer' and (not skip_feedback):
        errors = match_typical_errors(scenario_data, text)
        if errors:
            body, _tags, err_sources = format_error_feedback(errors[0])
            reply_text = body
            seen = {(s.get('url'), s.get('title')) for s in retrieval.sources}
            for item in err_sources:
                key = (item.get('url'), item.get('title'))
                if key not in seen:
                    retrieval.sources.append(item)
                    seen.add(key)
    if not reply_text and mode == 'trainer' and skip_feedback and retrieval.case:
        reply_text = 'Ок, берём следующий кейс без разбора предыдущего.\n\n' + _format_case_card(retrieval.case, (retrieval.case_index or 0) + 1, total)
    if not reply_text:
        reply_text = _kb_fallback_text(kb_block, retrieval.sources)
    reply_text, llm_verdict = _strip_verdict_line(reply_text)
    tags, error_ids = _derive_tags(mode=mode, text=text, case=retrieval.case, scenario=scenario_data, skip_feedback=skip_feedback, llm_verdict=llm_verdict)
    next_case_index: int | None
    if mode != 'trainer':
        next_case_index = retrieval.next_case_index
        trainer_phase = None
    elif skip_feedback:
        next_case_index = answered_index
        tags = []
        trainer_phase = 'present'
    elif is_last_case:
        trainer_completed = True
        trainer_phase = 'complete'
        next_case_index = None
        if '**Тренажёр завершён**' not in reply_text:
            reply_text = f'{reply_text.rstrip()}\n\n{_format_complete(total)}'
    else:
        next_case_index = answered_index + 1
        trainer_phase = 'feedback'
        next_case, _ = get_case_at(scenario_data, next_case_index)
        if next_case and f'Кейс {next_case_index + 1} из {total}' not in reply_text:
            reply_text = f'{reply_text.rstrip()}\n\n---\n\n{_format_case_card(next_case, next_case_index + 1, total)}'
    if mode == 'trainer' and (not skip_feedback) and (not trainer_completed):
        reply_text = _append_adaptive(reply_text, scenario_data=scenario_data, scenario_id=scenario, weak_zones=known_zones, mode=mode)
    case_id = str(retrieval.case.get('id') or '') if retrieval.case else None
    return ChatResult(text=reply_text, tags=tags, detected_weak_zones=detected, sources=retrieval.sources, case_id=case_id, case_index=answered_index, next_case_index=next_case_index, total_cases=total if mode == 'trainer' else retrieval.total_cases, error_ids=error_ids, trainer_completed=trainer_completed, trainer_phase=trainer_phase)
