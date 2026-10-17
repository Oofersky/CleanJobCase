from __future__ import annotations
import logging
from typing import Any
from app.config import get_settings
logger = logging.getLogger(__name__)
SYSTEM_MENTOR = 'Ты MentOrAI — наставник для абитуриентов и стажёров 15–20 лет. Отвечай только на основе блока «База знаний» и списка источников. Не выдумывай факты о вузах, компаниях и правилах приёма. Пиши живо и по делу, без канцелярита и без фраз вроде «как языковая модель». Форматируй ответ лёгким Markdown: **жирный**, списки -, короткие абзацы. Не используй HTML. В конце НЕ дублируй список ссылок — источники покажет интерфейс. Рекомендации информационные и не заменяют официальные требования вузов и работодателей.'

def gigachat_enabled() -> bool:
    settings = get_settings()
    return bool(settings.gigachat_credentials.strip())

def _extract_text(response) -> str:
    messages = getattr(response, 'messages', None)
    if messages:
        parts: list[str] = []
        for message in messages:
            content = getattr(message, 'content', None)
            if isinstance(content, str) and content.strip():
                parts.append(content.strip())
                continue
            if not content:
                continue
            for part in content:
                text = getattr(part, 'text', None)
                if text and str(text).strip():
                    parts.append(str(text).strip())
        if parts:
            return '\n'.join(parts).strip()
    choices = getattr(response, 'choices', None)
    if choices:
        message = getattr(choices[0], 'message', None)
        content = getattr(message, 'content', None) if message else None
        if isinstance(content, str) and content.strip():
            return content.strip()
    return ''

def _history_to_messages(history: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    if not history:
        return out
    for item in history[-8:]:
        role = str(item.get('role') or '').lower()
        text = str(item.get('text') or '').strip()
        if not text:
            continue
        if role in {'user', 'human'}:
            out.append({'role': 'user', 'content': text[:1500]})
        elif role in {'bot', 'assistant'}:
            out.append({'role': 'assistant', 'content': text[:1500]})
    return out

async def _request_completion(messages: list[dict[str, str]], *, max_tokens: int=1200) -> str:
    settings = get_settings()
    from gigachat import GigaChat
    kwargs = {'credentials': settings.gigachat_credentials, 'scope': settings.gigachat_scope, 'model': settings.gigachat_model, 'verify_ssl_certs': settings.gigachat_verify_ssl_certs, 'timeout': settings.gigachat_timeout}
    async with GigaChat(**kwargs) as client:
        try:
            from gigachat.models import ChatCompletionRequest, ChatMessage
            response = await client.achat.create(ChatCompletionRequest(messages=[ChatMessage(role=m['role'], content=m['content']) for m in messages], temperature=0.4, max_tokens=max_tokens))
            return _extract_text(response)
        except Exception as primary_exc:
            logger.debug('GigaChat primary create failed, trying legacy: %s', primary_exc)
            from gigachat.models import Chat, Messages, MessagesRole
            role_map = {'system': MessagesRole.SYSTEM, 'user': MessagesRole.USER, 'assistant': MessagesRole.ASSISTANT}
            response = await client.achat(Chat(messages=[Messages(role=role_map.get(m['role'], MessagesRole.USER), content=m['content']) for m in messages], temperature=0.4, max_tokens=max_tokens))
            return _extract_text(response)

async def mentor_chat(*, user_text: str, scenario_title: str, mode: str, kb_block: str, sources_block: str, history: list[dict[str, Any]] | None=None, trainer_hint: str='', opinion_hints: list[str] | None=None) -> str | None:
    if not gigachat_enabled():
        return None
    mode_line = 'Режим: тренажёр-экзаменатор. Разбери ответ пользователя по текущему кейсу и мягко предложи следующий шаг.' if mode == 'trainer' else 'Режим: информационный. Ответь на вопрос с опорой на базу знаний.'
    system = f'{SYSTEM_MENTOR}\n{mode_line}'
    if trainer_hint:
        system = f'{system}\n{trainer_hint}'
    if opinion_hints:
        bullets = '\n'.join((f'- {hint}' for hint in opinion_hints[:4]))
        system = f'{system}\n\nСигналы базы мнений (телеметрия лайков/дизлайков): такие ответы часто не нравятся — переформулируй подход, будь конкретнее и полезнее, не копируй стиль ниже:\n{bullets}'
    context_user = f'Сценарий: {scenario_title}\n\nБаза знаний (используй только это):\n{kb_block}\n\nИсточники (учти в ответе по смыслу, не копируй списком):\n{sources_block}\n\nСообщение пользователя:\n{user_text}'
    messages: list[dict[str, str]] = [{'role': 'system', 'content': system}]
    messages.extend(_history_to_messages(history))
    messages.append({'role': 'user', 'content': context_user})
    try:
        text = await _request_completion(messages)
        return text.strip() or None
    except Exception as exc:
        logger.exception('GigaChat mentor_chat failed: %s', exc)
        return None

def _parse_export_list(block: str) -> list[str]:
    items: list[str] = []
    for line in (block or '').splitlines():
        cleaned = line.strip()
        if not cleaned:
            continue
        cleaned = cleaned.lstrip('-•*').strip()
        cleaned = cleaned.lstrip('0123456789.').strip()
        if cleaned:
            items.append(cleaned[:220])
    return items[:10]

def _parse_export_brief(raw: str) -> dict[str, list[str]]:
    text = (raw or '').strip()
    weak: list[str] = []
    notes: list[str] = []
    current = None
    for line in text.splitlines():
        upper = line.strip().upper()
        if upper.startswith('WEAK:') or upper.startswith('СЛАБЫЕ:'):
            current = 'weak'
            rest = line.split(':', 1)[1].strip() if ':' in line else ''
            if rest:
                weak.extend(_parse_export_list(rest))
            continue
        if upper.startswith('NOTES:') or upper.startswith('РЕКОМЕНДАЦИИ:') or upper.startswith('ПОВТОРИТЬ:'):
            current = 'notes'
            rest = line.split(':', 1)[1].strip() if ':' in line else ''
            if rest:
                notes.extend(_parse_export_list(rest))
            continue
        if current == 'weak':
            weak.extend(_parse_export_list(line))
        elif current == 'notes':
            notes.extend(_parse_export_list(line))
    return {'weak_zones': weak[:8], 'notes': notes[:8]}

async def compose_export_brief(*, kind: str, user_name: str, focus_label: str, weak_zones: list[str], notes: list[str], session_summaries: list[str] | None=None) -> dict[str, list[str]] | None:
    if not gigachat_enabled():
        return None
    kind_label = 'отчёт перед собеседованием' if kind == 'report' else 'заметки перед собеседованием'
    sessions_block = '\n'.join((f'- {item}' for item in (session_summaries or [])[:8])) or '- нет диалогов'
    system = 'Ты MentOrAI. Составь краткие пункты для PDF-выгрузки. Строго без HTML и без Markdown. Только плоский текст. Ответ строго в формате:\nWEAK:\n- пункт\nNOTES:\n- пункт\nWEAK — слабые зоны (3–6 пунктов). NOTES — рекомендации/что повторить (4–8 пунктов). Опирайся на данные пользователя, не выдумывай вузы и компании.'
    user = f"Тип документа: {kind_label}\nУчастник: {user_name}\nФокус: {focus_label}\nУже известные слабые зоны: {', '.join(weak_zones) or 'нет'}\nУже известные заметки: {'; '.join(notes) or 'нет'}\nКраткие диалоги:\n{sessions_block}\n\nСобери WEAK и NOTES."
    try:
        raw = await _request_completion([{'role': 'system', 'content': system}, {'role': 'user', 'content': user}], max_tokens=700)
        parsed = _parse_export_brief(raw)
        if not parsed['weak_zones'] and (not parsed['notes']):
            return None
        return parsed
    except Exception as exc:
        logger.exception('GigaChat export brief failed: %s', exc)
        return None
