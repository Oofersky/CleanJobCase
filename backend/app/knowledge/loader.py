from __future__ import annotations
import json
from functools import lru_cache
from pathlib import Path
from typing import Any
DATA_ROOT = Path(__file__).resolve().parents[2] / 'data'

class KnowledgeError(RuntimeError):
    pass

def _read_json(path: Path) -> Any:
    if not path.is_file():
        raise KnowledgeError(f'Missing knowledge file: {path}')
    with path.open(encoding='utf-8') as handle:
        return json.load(handle)

def _validate_source(entry: dict[str, Any]) -> dict[str, str]:
    required = ('id', 'title', 'source', 'url', 'accessed')
    missing = [key for key in required if not entry.get(key)]
    if missing:
        raise KnowledgeError(f"Source missing fields {missing}: {entry.get('id')}")
    return {'id': str(entry['id']), 'title': str(entry['title']), 'source': str(entry['source']), 'url': str(entry['url']), 'accessed': str(entry['accessed'])}

@lru_cache(maxsize=1)
def load_catalog() -> dict[str, dict[str, str]]:
    raw = _read_json(DATA_ROOT / 'sources' / 'catalog.json')
    sources = raw.get('sources') if isinstance(raw, dict) else None
    if not isinstance(sources, list) or not sources:
        raise KnowledgeError('sources/catalog.json must contain a non-empty sources list')
    catalog: dict[str, dict[str, str]] = {}
    for item in sources:
        if not isinstance(item, dict):
            continue
        normalized = _validate_source(item)
        catalog[normalized['id']] = normalized
    return catalog

@lru_cache(maxsize=1)
def load_scenarios() -> dict[str, dict[str, Any]]:
    catalog = load_catalog()
    scenarios: dict[str, dict[str, Any]] = {}
    root = DATA_ROOT / 'scenarios'
    for path in sorted(root.glob('*.json')):
        data = _read_json(path)
        scenario_id = str(data.get('id') or path.stem)
        for topic in data.get('info', {}).get('topics', []):
            _assert_source_ids(topic.get('source_ids'), catalog, f"{scenario_id}/info/{topic.get('id')}")
        for case in data.get('trainer', {}).get('cases', []):
            _assert_source_ids(case.get('source_ids'), catalog, f"{scenario_id}/trainer/{case.get('id')}")
        for error in data.get('typical_errors') or []:
            if isinstance(error, dict):
                _assert_source_ids(error.get('source_ids'), catalog, f"{scenario_id}/errors/{error.get('id')}")
        cases = data.get('trainer', {}).get('cases') or []
        if len(cases) < 3:
            raise KnowledgeError(f'Scenario {scenario_id} needs ≥3 trainer cases, found {len(cases)}')
        errors = data.get('typical_errors') or []
        if len(errors) < 2:
            raise KnowledgeError(f'Scenario {scenario_id} needs ≥2 typical_errors, found {len(errors)}')
        scenarios[scenario_id] = data
    if len(scenarios) < 3:
        raise KnowledgeError(f'Expected ≥3 scenarios, found {len(scenarios)}')
    return scenarios

def _assert_source_ids(ids: Any, catalog: dict[str, dict[str, str]], where: str) -> None:
    if not isinstance(ids, list) or not ids:
        raise KnowledgeError(f'Missing source_ids at {where}')
    unknown = [sid for sid in ids if sid not in catalog]
    if unknown:
        raise KnowledgeError(f'Unknown source_ids {unknown} at {where}')

def resolve_sources(source_ids: list[str]) -> list[dict[str, str]]:
    catalog = load_catalog()
    resolved: list[dict[str, str]] = []
    seen: set[str] = set()
    for sid in source_ids:
        if sid in seen or sid not in catalog:
            continue
        seen.add(sid)
        item = catalog[sid]
        resolved.append({'title': item['title'], 'source': item['source'], 'url': item['url'], 'accessed': item['accessed']})
    return resolved

def get_scenario(scenario_id: str) -> dict[str, Any] | None:
    return load_scenarios().get(scenario_id)

def reload_knowledge() -> None:
    load_catalog.cache_clear()
    load_scenarios.cache_clear()
    load_catalog()
    load_scenarios()
