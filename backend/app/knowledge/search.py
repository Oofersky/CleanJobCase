from __future__ import annotations
from typing import Any

def _score_keywords(text: str, keywords: list[str]) -> int:
    lowered = text.lower()
    score = 0
    for keyword in keywords:
        key = keyword.lower().strip()
        if key and key in lowered:
            score += 1 + min(3, len(key) // 4)
    return score

def find_topic(scenario: dict[str, Any], text: str) -> dict[str, Any] | None:
    topics = scenario.get('info', {}).get('topics') or []
    best: dict[str, Any] | None = None
    best_score = 0
    for topic in topics:
        score = _score_keywords(text, topic.get('keywords') or [])
        if score > best_score:
            best = topic
            best_score = score
    return best if best_score > 0 else topics[0] if topics else None

def list_cases(scenario: dict[str, Any]) -> list[dict[str, Any]]:
    cases = scenario.get('trainer', {}).get('cases') or []
    return [case for case in cases if isinstance(case, dict)]

def get_case_at(scenario: dict[str, Any], index: int) -> tuple[dict[str, Any] | None, int]:
    cases = list_cases(scenario)
    if not cases:
        return (None, 0)
    safe = max(0, min(int(index), len(cases) - 1))
    return (cases[safe], safe)

def find_case(scenario: dict[str, Any], text: str) -> dict[str, Any] | None:
    cases = list_cases(scenario)
    if not cases:
        return None
    best: dict[str, Any] | None = None
    best_score = 0
    for case in cases:
        signals = list(case.get('weak_signals') or []) + list(case.get('ok_signals') or [])
        prompt_words = [w for w in str(case.get('prompt') or '').lower().split() if len(w) > 4][:6]
        score = _score_keywords(text, signals + prompt_words)
        if score > best_score:
            best = case
            best_score = score
    if best_score > 0:
        return best
    index = sum((ord(ch) for ch in text.lower())) % len(cases)
    return cases[index]
