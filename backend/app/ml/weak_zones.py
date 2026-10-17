from __future__ import annotations
import re
from dataclasses import dataclass

@dataclass(frozen=True)
class WeakZoneRule:
    id: str
    zone: str
    pattern: re.Pattern[str]
    scenarios: tuple[str, ...]
    follow_up: str
RULES: tuple[WeakZoneRule, ...] = (WeakZoneRule(id='self_esteem', zone='Самооценка на собеседовании', pattern=re.compile('ничего не умею|я никто|без опыта совсем|я плох', re.I), scenarios=('job', 'university'), follow_up='В прошлых сессиях проседала самооценка. Сформулируй в 2 предложениях сильную сторону на учебном проекте — без «я ничего не умею».'), WeakZoneRule(id='portfolio', zone='Портфолио и резюме', pattern=re.compile('портфолио|резюме|cv|нет проектов', re.I), scenarios=('job', 'university'), follow_up='Слабая зона: портфолио/резюме. Опиши один проект по схеме: задача → что сделал → результат.'), WeakZoneRule(id='university_criteria', zone='Критерии выбора вуза', pattern=re.compile('рейтинг|вуз|колледж|поступ|куда возьмут', re.I), scenarios=('university',), follow_up='Слабая зона: критерии вуза. Назови 2 критерия кроме рейтинга, по которым сравнишь два варианта.'), WeakZoneRule(id='interview', zone='Ответы на собеседовании', pattern=re.compile('собесед|почему мы|почему вы|интервью|нужна практика', re.I), scenarios=('job',), follow_up='Слабая зона: ответы на собеседовании. Ответь на «Почему вы?» за 20 секунд: компания + твоя польза.'), WeakZoneRule(id='first_month', zone='Коммуникация в первый месяц', pattern=re.compile('помощь|тимлид|задач|адапта|месяц|стесняюсь спросить', re.I), scenarios=('adapt',), follow_up='Слабая зона: коммуникация в первый месяц. Напиши, как за 15 секунд уточнишь у тимлида критерий «готово» и срок.'))

def detect_weak_zones(text: str) -> list[str]:
    return [rule.zone for rule in RULES if rule.pattern.search(text or '')]

def adaptive_follow_up(weak_zones: list[str], scenario: str) -> str | None:
    for rule in RULES:
        if rule.zone in weak_zones and scenario in rule.scenarios:
            return f'Адаптивно по слабой зоне «{rule.zone}»: {rule.follow_up}'
    return None
