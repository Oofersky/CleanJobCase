from __future__ import annotations
from typing import Any
from app.knowledge.loader import resolve_sources
from app.knowledge.search import list_cases

def list_typical_errors(scenario: dict[str, Any]) -> list[dict[str, Any]]:
    errors = scenario.get('typical_errors') or []
    return [item for item in errors if isinstance(item, dict)]

def match_typical_errors(scenario: dict[str, Any], text: str) -> list[dict[str, Any]]:
    lowered = (text or '').lower()
    hits: list[dict[str, Any]] = []
    for error in list_typical_errors(scenario):
        signals = error.get('signals') or []
        if any((str(signal).lower() in lowered for signal in signals if signal)):
            hits.append(error)
    return hits

def detect_zones_from_kb(scenario: dict[str, Any], text: str) -> list[str]:
    zones: list[str] = []
    for error in match_typical_errors(scenario, text):
        zone = str(error.get('zone') or '').strip()
        if zone and zone not in zones:
            zones.append(zone)
    return zones

def format_error_feedback(error: dict[str, Any]) -> tuple[str, list[str], list[dict[str, str]]]:
    text = f"Типовая ошибка из базы знаний: «{error.get('zone')}».\n\nВот что можно улучшить: {error.get('improve')}\n\nУдачный пример: {error.get('example')}"
    sources = resolve_sources(list(error.get('source_ids') or []))
    return (text, ['improve', 'example'], sources)

def adaptive_follow_up_from_kb(scenario: dict[str, Any], weak_zones: list[str]) -> str | None:
    for error in list_typical_errors(scenario):
        zone = str(error.get('zone') or '')
        if zone in weak_zones and error.get('follow_up'):
            return f"Адаптивно по слабой зоне «{zone}»: {error['follow_up']}"
    return None

def ensure_min_trainer_cases(scenario: dict[str, Any], minimum: int=3) -> None:
    if len(list_cases(scenario)) < minimum:
        raise ValueError(f"Scenario {scenario.get('id')} needs ≥{minimum} trainer cases")
