from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any
from app.knowledge.loader import resolve_sources
from app.knowledge.search import _score_keywords, get_case_at, list_cases

@dataclass
class RetrievedChunk:
    kind: str
    title: str
    body: str
    source_ids: list[str] = field(default_factory=list)

@dataclass
class RetrievalResult:
    chunks: list[RetrievedChunk]
    sources: list[dict[str, str]]
    case: dict[str, Any] | None = None
    case_index: int | None = None
    next_case_index: int | None = None
    total_cases: int | None = None

def _uniq_source_ids(chunks: list[RetrievedChunk]) -> list[str]:
    seen: list[str] = []
    for chunk in chunks:
        for sid in chunk.source_ids:
            if sid and sid not in seen:
                seen.append(sid)
    return seen

def retrieve_for_chat(scenario: dict[str, Any], text: str, *, mode: str='info', case_index: int=0, limit: int=6) -> RetrievalResult:
    chunks: list[RetrievedChunk] = []
    case: dict[str, Any] | None = None
    idx = 0
    next_idx: int | None = None
    total: int | None = None
    topics = scenario.get('info', {}).get('topics') or []
    scored_topics: list[tuple[int, dict[str, Any]]] = []
    for topic in topics:
        if not isinstance(topic, dict):
            continue
        score = _score_keywords(text, list(topic.get('keywords') or []))
        scored_topics.append((score, topic))
    scored_topics.sort(key=lambda item: item[0], reverse=True)
    for score, topic in scored_topics[:3]:
        if score <= 0 and chunks:
            continue
        chunks.append(RetrievedChunk(kind='topic', title=str(topic.get('id') or 'topic'), body=str(topic.get('summary') or '').strip(), source_ids=[str(x) for x in topic.get('source_ids') or []]))
    errors = scenario.get('typical_errors') or []
    scored_errors: list[tuple[int, dict[str, Any]]] = []
    for error in errors:
        if not isinstance(error, dict):
            continue
        score = _score_keywords(text, list(error.get('signals') or []))
        if score > 0:
            scored_errors.append((score, error))
    scored_errors.sort(key=lambda item: item[0], reverse=True)
    for _, error in scored_errors[:2]:
        body = f"Типовая ошибка ({error.get('zone')}): {error.get('improve')}\nПример лучше: {error.get('example')}"
        chunks.append(RetrievedChunk(kind='error', title=str(error.get('id') or 'error'), body=body.strip(), source_ids=[str(x) for x in error.get('source_ids') or []]))
    if mode == 'trainer':
        cases = list_cases(scenario)
        total = len(cases)
        case, idx = get_case_at(scenario, case_index)
        if case:
            next_idx = idx + 1 if total and idx + 1 < total else None
            chunks.insert(0, RetrievedChunk(kind='case', title=f"Кейс {idx + 1}/{total}: {case.get('id')}", body=f"Вопрос кейса: {case.get('prompt')}\nЧто усилить: {case.get('improve')}\nОриентир ответа: {case.get('example')}", source_ids=[str(x) for x in case.get('source_ids') or []]))
    else:
        cases = list_cases(scenario)
        if cases:
            best_case = None
            best_score = 0
            for item in cases:
                signals = list(item.get('weak_signals') or []) + list(item.get('ok_signals') or [])
                score = _score_keywords(text, signals)
                if score > best_score:
                    best_case = item
                    best_score = score
            if best_case and best_score > 0:
                chunks.append(RetrievedChunk(kind='case', title=str(best_case.get('id') or 'case'), body=f"Смежный кейс для практики: {best_case.get('prompt')}", source_ids=[str(x) for x in best_case.get('source_ids') or []]))
    if not chunks and topics:
        for topic in topics[:2]:
            if not isinstance(topic, dict):
                continue
            chunks.append(RetrievedChunk(kind='topic', title=str(topic.get('id') or 'topic'), body=str(topic.get('summary') or '').strip(), source_ids=[str(x) for x in topic.get('source_ids') or []]))
    chunks = chunks[:limit]
    source_ids = _uniq_source_ids(chunks)
    sources = resolve_sources(source_ids)
    return RetrievalResult(chunks=chunks, sources=sources, case=case, case_index=idx if mode == 'trainer' else None, next_case_index=next_idx if mode == 'trainer' else None, total_cases=total if mode == 'trainer' else None)

def format_chunks_for_prompt(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return 'База знаний по запросу пуста — скажи об этом честно.'
    blocks: list[str] = []
    for i, chunk in enumerate(chunks, start=1):
        blocks.append(f'[{i}] ({chunk.kind}) {chunk.title}\n{chunk.body}')
    return '\n\n'.join(blocks)

def format_sources_for_prompt(sources: list[dict[str, str]]) -> str:
    if not sources:
        return 'Нет привязанных источников.'
    lines = []
    for i, item in enumerate(sources, start=1):
        lines.append(f"{i}. {item.get('title')} — {item.get('source')} — {item.get('url')} (дата обращения: {item.get('accessed')})")
    return '\n'.join(lines)
