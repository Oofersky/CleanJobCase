from __future__ import annotations
import json
import re
from pathlib import Path
from typing import Any
from app.knowledge.loader import DATA_ROOT, KnowledgeError, reload_knowledge
_SCENARIO_ID_RE = re.compile('^[a-z0-9][a-z0-9_-]{0,63}$')

def _scenario_path(scenario_id: str) -> Path:
    if not _SCENARIO_ID_RE.fullmatch(scenario_id or ''):
        raise KnowledgeError('Invalid scenario id')
    root = (DATA_ROOT / 'scenarios').resolve()
    path = (root / f'{scenario_id}.json').resolve()
    if not path.is_relative_to(root):
        raise KnowledgeError('Invalid scenario id')
    return path

def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    with tmp.open('w', encoding='utf-8') as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    tmp.replace(path)

def read_catalog_raw() -> dict[str, Any]:
    path = DATA_ROOT / 'sources' / 'catalog.json'
    with path.open(encoding='utf-8') as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise KnowledgeError('catalog.json must be an object')
    return data

def save_catalog_raw(payload: dict[str, Any]) -> dict[str, Any]:
    sources = payload.get('sources')
    if not isinstance(sources, list) or not sources:
        raise KnowledgeError('catalog.sources must be a non-empty list')
    for item in sources:
        if not isinstance(item, dict):
            raise KnowledgeError('Each source must be an object')
        for key in ('id', 'title', 'source', 'url', 'accessed'):
            if not item.get(key):
                raise KnowledgeError(f'Source missing {key}')
    _write_json(DATA_ROOT / 'sources' / 'catalog.json', {'sources': sources})
    reload_knowledge()
    return read_catalog_raw()

def read_scenario_raw(scenario_id: str) -> dict[str, Any]:
    path = _scenario_path(scenario_id)
    if not path.is_file():
        raise KnowledgeError('Scenario file not found')
    with path.open(encoding='utf-8') as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise KnowledgeError('Scenario must be an object')
    return data

def save_scenario_raw(scenario_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    path = _scenario_path(scenario_id)
    if str(payload.get('id') or '') != scenario_id:
        payload = {**payload, 'id': scenario_id}
    if scenario_id not in {'university', 'job', 'adapt'} and (not path.is_file()):
        pass
    _write_json(path, payload)
    try:
        reload_knowledge()
    except KnowledgeError:
        raise
    return read_scenario_raw(scenario_id)

def list_scenario_ids() -> list[str]:
    root = DATA_ROOT / 'scenarios'
    return sorted((path.stem for path in root.glob('*.json') if _SCENARIO_ID_RE.fullmatch(path.stem)))
