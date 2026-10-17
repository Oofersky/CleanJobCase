# MentOrAI

**ИИ-ментор для абитуриентов и стажёров** — веб-тренажёр с практикой в чате, обратной связью «Верно / Улучшить / Развивать», базой знаний и экспортом PDF.

Кейс Softline: безопасная практика диалога перед вузом и первой работой.

> Рекомендации информационные и **не заменяют** официальные требования вузов и работодателей.  
> Источники — только открытые, с attribution в инфо-режиме.

---

## Содержание

- [Возможности](#возможности)
- [Стек](#стек)
- [Архитектура](#архитектура)
- [Быстрый старт](#быстрый-старт)
- [Переменные окружения](#переменные-окружения)
- [Структура репозитория](#структура-репозитория)
- [Маршруты UI](#маршруты-ui)
- [API (кратко)](#api-кратко)
- [GigaChat и база знаний](#gigachat-и-база-знаний)
- [Этика и данные](#этика-и-данные)
- [Разработка](#разработка)
- [Лицензия](#лицензия)

---

## Возможности

| Область | Что есть |
|--------|----------|
| Сценарии | Выбор вуза · первая работа · первый месяц (адаптация) |
| Чат | Практика в стиле диалога с наставником |
| Фидбек | Метки **Верно / Улучшить / Развивать** |
| Инфо-режим | Ответы по открытым источникам со ссылками |
| Голос | Ввод через Web Speech API в браузере |
| Профиль | Прогресс, слабые зоны, экспорт PDF (Lead) |
| Auth | Регистрация с минимумом PII (псевдоним, email, пароль) |

---

## Стек

| Слой | Технологии |
|------|------------|
| Frontend | Vanilla HTML · CSS · JavaScript |
| Backend | Python 3.12 · FastAPI · Pydantic · Uvicorn |
| БД | PostgreSQL 16 · SQLAlchemy (async) · asyncpg |
| ИИ | **GigaChat API** + локальная база знаний (`backend/data/`) |
| PDF | fpdf2 |
| Edge | Docker Compose · Nginx |

---

## Архитектура

```
Браузер  (/site · /platform)
    │
    ▼
Nginx :8181          статика frontend + reverse-proxy /api
    │
    ▼
FastAPI              JWT, chat, сессии, прогресс, PDF, admin
    │
    ├── PostgreSQL   пользователи, чаты, сообщения, прогресс
    └── Knowledge    сценарии + catalog источников
            ▲
            │  контекст для ответов
            │
       GigaChat API  (опционально; без ключа — rule-based тренажёр)
```

**Поток:** сообщение (текст / голос) → `POST /api/chat` → сервис опирается на базу знаний и (если задан ключ) **GigaChat** → фидбек + источники → прогресс → PDF из своих сессий.

---

## Быстрый старт

### Требования

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose
- (опционально) ключ GigaChat из [Sber Developers](https://developers.sber.ru/studio)

### Запуск

```bash
# 1. Клонировать и перейти в каталог
git clone <url-репозитория> MentOrAI
cd MentOrAI

# 2. Конфиг окружения
cp .env.example .env
# при необходимости отредактируйте JWT_SECRET и GIGACHAT_CREDENTIALS

# 3. Поднять стек
docker compose up --build
```

| URL | Назначение |
|-----|------------|
| http://127.0.0.1:8181/site/ | Лендинг |
| http://127.0.0.1:8181/platform/chat/ | Практика |
| http://127.0.0.1:8181/platform/profile/ | Прогресс и PDF |
| http://127.0.0.1:8181/platform/learn/ | Темы и кейсы |
| http://127.0.0.1:8181/api/health | Healthcheck API |
| http://127.0.0.1:8000/docs | OpenAPI (локальный debug API) |

Порты: **8181** — веб, **8000** — API (loopback), **5433** — Postgres для внешних клиентов (внутри сети compose — `db:5432`).

Остановка:

```bash
docker compose down
```

---

## Переменные окружения

Файл `.env` **не коммитится**. Шаблон: [`.env.example`](.env.example).

| Переменная | Описание |
|------------|----------|
| `DATABASE_URL` | Async PostgreSQL URL (в Compose хост переопределяется на `db`) |
| `JWT_SECRET` | Секрет JWT (≥32 символа в production) |
| `JWT_EXPIRE_MINUTES` | Срок жизни токена (по умолчанию 1440) |
| `APP_ENV` | `development` \| `production` |
| `ALLOW_INSECURE_DEFAULTS` | Только для локального демо; в prod — `false` |
| `CORS_ORIGINS` | Разрешённые origin фронта |
| `TRUST_PROXY` | `true` за Nginx |
| `CHAT_REQUIRE_AUTH` | Требовать JWT на `/api/chat` |
| `GIGACHAT_CREDENTIALS` | Ключ авторизации GigaChat (пусто = rule-based) |
| `GIGACHAT_SCOPE` | Например `GIGACHAT_API_PERS` |
| `GIGACHAT_MODEL` | Например `GigaChat-2` |
| `GIGACHAT_VERIFY_SSL_CERTS` | Проверка TLS-сертификатов |
| `GIGACHAT_TIMEOUT` | Таймаут запроса к модели |
| `ADMIN_TOKEN` | Токен админки (`X-Admin-Token`); пусто = API выключен |

Сгенерировать секрет:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## Структура репозитория

В GitHub попадает только продуктовый минимум (см. [`.gitignore`](.gitignore)):

```
MentOrAI/
├── frontend/              # UI: лендинг + платформа
│   ├── site/              # /site/ — маркетинг, login, register
│   ├── platform/          # /platform/ — chat, profile, learn, admin
│   ├── css/ · js/ · assets/
│   └── …
├── backend/
│   ├── app/               # FastAPI: auth, chat, practice, export, knowledge
│   ├── data/
│   │   ├── scenarios/     # university · job · adapt
│   │   └── sources/       # catalog.json (source / url / accessed)
│   ├── Dockerfile
│   └── requirements.txt
├── deploy/
│   └── nginx.conf         # статика + proxy /api
├── docker-compose.yml
├── .env.example
└── README.md
```

Презентации, брендбук, агентские skills и локальные IDE-папки **не** входят в репозиторий.

---

## Маршруты UI

| Путь | Описание |
|------|----------|
| `/site/` | Лендинг |
| `/site/login/` · `/site/register/` | Вход / регистрация |
| `/platform/chat/` · `/platform/chat/:id` | Практика |
| `/platform/profile/` | Прогресс и PDF |
| `/platform/learn/` | Обучение |
| `/platform/admin/` | Админка каталога (нужен `ADMIN_TOKEN`) |

Legacy `*.html` в корне `frontend/` — редиректы на актуальные пути.

---

## API (кратко)

Префикс: `/api` (через Nginx) или напрямую `:8000`.

| Метод | Путь | Назначение |
|-------|------|------------|
| `GET` | `/api/health` | Healthcheck |
| `POST` | `/api/auth/register` · `/login` | Auth |
| `GET` · `PATCH` | `/api/auth/me` | Профиль |
| `POST` | `/api/chat` | Диалог / фидбек |
| `GET` | `/api/scenarios` | Список сценариев |
| `*` | `/api/sessions` · `/api/progress` | Практика и прогресс |
| `POST` | `/api/export/pdf` | PDF своей сессии |
| `*` | `/api/admin/*` | Каталог / сценарии (admin token) |

Интерактивная схема: http://127.0.0.1:8000/docs после `docker compose up`.

---

## GigaChat и база знаний

1. В `backend/data/` лежат сценарии и каталог открытых источников.
2. При запросе к `/api/chat` бэкенд подмешивает релевантный контекст из базы знаний.
3. Если задан `GIGACHAT_CREDENTIALS`, ответы строит **GigaChat API** с опорой на этот контекст.
4. Без ключа работает rule-based тренажёр (локальная логика фидбека).

Так модель не «галлюцинирует в вакууме»: у неё есть доступ к вашей базе знаний MentOrAI.

---

## Этика и данные

- Минимум PII: псевдоним для обращения, без лишнего сбора возраста/ФИО.
- Сессии и прогресс — в своей БД; пользовательские диалоги не коммитятся в git.
- Экспорт PDF — только данные своей сессии.
- CORS и rate limit на чувствительных эндпоинтах.
- Секреты только в `.env` на сервере, не во frontend.

---

## Разработка

```bash
# API без Docker (нужен локальный Postgres и .env)
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Фронт можно отдавать через Nginx из Compose или любым static-сервером с прокси на API (см. `deploy/nginx.conf`).

Тесты:

```bash
cd backend
pytest
```

---

## Лицензия

[Apache License 2.0](LICENSE)

---

## Авторы

MentOrAI · Softline Решения · Teal Mentor brand
