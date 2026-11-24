# Прозрачная вакансия

Сервис для автоматического аудита вакансий с портала «Работа в России» (регион 39). Программа находит размытые условия, пропуски и противоречия в описаниях, помогая соискателям экономить время, а работодателям — делать вакансии понятнее.

**Что находит система:**
- Пропуски (не указана зарплата или график)
- Неоднозначности («гибкий график» без уточнений)
- Противоречия (удалённая работа в описании vs офис в требованиях)

**Результат:** JSON-отчёт с конкретными рекомендациями, что именно уточнить у работодателя.

> Рекомендации информационные: без вымышленных фактов и без выводов о нарушении закона.

---

## Содержание

- [Возможности](#возможности)
- [Стек](#стек)
- [Где начинается обработка](#где-начинается-обработка)
- [Быстрый старт](#быстрый-старт)
- [Проверочный режим](#проверочный-режим)
- [Формат отчёта](#формат-отчёта)
- [Использование ИИ](#использование-ии)
- [Дополнительный сценарий](#дополнительный-сценарий)
- [Конфигурация](#конфигурация)
- [API](#api)
- [Структура](#структура)
- [Вклад участников команды](#вклад-участников-команды)
- [Материалы репозитория](#материалы-репозитория)
- [Демонстрация проекта](#демонстрация-проекта)

---

## Возможности

| Режим | Что делает |
|--------|------------|
| Рабочий | Загрузка API региона 39, анализ, сохранение отчёта в PostgreSQL по расписанию и вручную |
| История | Переключение между сохранёнными отчётами (`#id · дата время`) и «Новый отчёт» |
| Проверочный | Локальный JSON в формате API → отчёт **без** обращения к порталу |
| ИИ | GigaChat дополняет неоднозначности; без ключа работает **rules-only** |
| Доп. сценарий | Черновик сопроводительного текста под вакансию из обезличенного резюме |

Обрабатываются минимум **две страницы** API (если лимит и объём позволяют). Повторный запуск на тех же ID оставляет **один** результат на вакансию в текущем отчёте. При недоступности API возвращается ошибка и **последний успешный** отчёт, если он есть.

---

## Стек

| Слой | Технологии |
|------|------------|
| Frontend | HTML · CSS · JS (палитра «госпортал») |
| Backend | Python 3.12 · FastAPI · httpx · Pydantic · SQLAlchemy |
| БД | PostgreSQL 16 (asyncpg) |
| ИИ | GigaChat API (опционально) |
| Edge | Docker Compose · Nginx |

---

## Где начинается обработка

| Сценарий | Точка входа |
|----------|-------------|
| Ручной запуск / UI | `POST /api/run` → `app/services/pipeline.py` |
| Расписание | `app/services/scheduler.py` (интервал `SCHEDULE_INTERVAL_MINUTES`) |
| Проверочный режим | `POST /api/verify` или `POST /api/verify/fixture` |
| Проверка на учебном JSON | `curl` → `POST /api/verify/fixture?use_ai=false` (см. ниже) |

Workflow Docker: `docker compose up --build` → сервис `api` поднимает scheduler + HTTP.

---

## Быстрый старт

```bash
cp .env.example .env
docker compose up --build
```

| URL | Назначение |
|-----|------------|
| http://127.0.0.1:8181/ | Лендинг для соискателя |
| http://127.0.0.1:8181/login/ | Вход / регистрация |
| http://127.0.0.1:8181/platform/ | Платформа (разбор / вопросы) |
| http://127.0.0.1:8181/resume/ | Доп. сценарий |
| http://127.0.0.1:8000/docs | OpenAPI |
| http://127.0.0.1:8000/api/health | Health |

Локально без Docker (нужен PostgreSQL, в `.env` укажите `DATABASE_URL=postgresql+asyncpg://pv:pv@127.0.0.1:5432/pv`):

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Тесты:

```bash
cd backend
pytest
```

---

## Проверочный режим

С ключом GigaChat в `.env` ИИ включён по умолчанию (анализ + черновик резюме).

**Аккаунты:** регистрация по почте, логин придумываете сами, пароль ≥12 символов (Argon2id, HttpOnly cookie-сессия). Отчёты и черновики привязаны к пользователю.

Демо-аккаунт (создаётся при старте; старые «ничьи» отчёты переносятся на него):

- логин `artemshe`
- пароль `artemsheartemshe`
- UI: http://127.0.0.1:8181/login/

**Без ключа ИИ** (rules-only) — сначала вход, потом fixture:

```bash
curl -c cookies.txt -X POST "http://127.0.0.1:8000/api/auth/login" ^
  -H "Content-Type: application/json" ^
  -d "{\"login\":\"artemshe\",\"password\":\"artemsheartemshe\"}"

curl -b cookies.txt -X POST "http://127.0.0.1:8000/api/verify/fixture?use_ai=false"
```

Учебные данные: [`backend/data/fixtures/kantkod_sample_vacancies.json`](backend/data/fixtures/kantkod_sample_vacancies.json)  
В UI: источник «Учебный файл JSON» или «Поиск вакансий в сети».  
Пример отчёта: [`examples/report.sample.json`](examples/report.sample.json)

Свой JSON (после логина):

```bash
curl -b cookies.txt -X POST "http://127.0.0.1:8000/api/verify" ^
  -H "Content-Type: application/json" ^
  -d "{\"payload\": { ... }, \"use_ai\": false}"
```

---

## Формат отчёта

Имена полей команды (описаны здесь):

```json
{
  "generated_at": "ISO-8601",
  "source": "api|fixture|upload",
  "source_url": "строка или null",
  "vacancies_processed": 3,
  "pages_fetched": 2,
  "ai_used": false,
  "error": null,
  "vacancies": [
    {
      "vacancy_id": "...",
      "vacancy_url": "...",
      "job_name": "...",
      "company_name": "...",
      "remarks": [
        {
          "topic": "график",
          "source_field": "schedule",
          "quote": "Гибкий график",
          "quote_secondary": "",
          "kind": "gap|ambiguity|contradiction",
          "problem": "...",
          "recommendation": "..."
        }
      ]
    }
  ]
}
```

- Нет замечаний → `remarks: []`
- Пропуск → `quote` пустой, в `problem` чего не хватает
- Противоречие → оба значения в `quote` / `quote_secondary`
- `recommendation` — что **спросить** у работодателя (не правка текста вакансии)

Проверяемые темы: название должности, обязанности, требования, оплата, график, место работы, тип занятости. Учитываются описание и структурированные поля API.

---

## Использование ИИ

| | |
|--|--|
| Провайдер / модель | GigaChat (`GIGACHAT_MODEL`, по умолчанию `GigaChat-2`) |
| Lite-пайплайн | 1) fetch/parse вакансий → 2) локальные правила на все → 3) **один** batch-промпт GigaChat |
| Доп. сценарий | `app/services/resume_draft.py` — черновик текста под вакансию только из полей резюме |
| Без ключа | Rules-only + шаблон резюме; проверка: `?use_ai=false` |

Ключ только в `.env` (`GIGACHAT_CREDENTIALS`), в репозиторий не коммитится.

---

## Дополнительный сценарий

**Кому:** соискатель, который готовит отклик на вакансию гос/муниципальной организации региона 39 и хочет быстро получить **черновик резюме**, акцентированный под выбранную карточку.

**Данные вакансии:** из **сохранённых отчётов** в PostgreSQL (поля карточки, сохранённые при анализе: `job-name`, `duty`, `requirements`, `schedule`, `employment`, `salary`, `company`, `vac_url`).  
Список: `GET /api/resume/vacancies`.

**Вход:** обезличенное резюме (`full_name`, `summary`, `skills`, `experience`, `education`) + `vacancy_id` и `report_id`.  
Пример резюме: [`backend/data/fixtures/sample_resume.json`](backend/data/fixtures/sample_resume.json).

**Результат:** черновик резюме (О себе / Навыки / Опыт / Образование) без выдуманного опыта; GigaChat расставляет акценты под вакансию.

| | |
|--|--|
| UI | http://127.0.0.1:8181/resume/ |
| Список вакансий | `GET /api/resume/vacancies` |
| История черновиков | `GET /api/resume/drafts`, `GET /api/resume/drafts/{id}` |
| Сборка черновика | `POST /api/resume/draft` (сохраняет в БД) |
| Код | `app/services/resume_draft.py`, `draft_store.py` |

---

## Конфигурация

См. [`.env.example`](.env.example).

| Переменная | Смысл |
|------------|--------|
| `DATABASE_URL` | PostgreSQL async URL (`postgresql+asyncpg://…`) |
| `SECRET_KEY` | Подпись cookie-сессий (обязательно сменить в проде) |
| `SEED_LOGIN` / `SEED_EMAIL` / `SEED_PASSWORD` | Демо-пользователь при старте |
| `VACANCIES_API_URL` | URL источника |
| `VACANCIES_MAX` | Макс. число вакансий за прогон (lite, по умолчанию 20) |
| `VACANCIES_PAGE_LIMIT` | Размер страницы API |
| `SCHEDULE_INTERVAL_MINUTES` | Интервал фонового запуска |
| `SCHEDULE_ENABLED` | Фоновый прогон (`false` по умолчанию — отчёты только по кнопке) |
| `SCHEDULE_USE_AI` | ИИ в фоне (если scheduler включён; по умолчанию `false`) |
| `GIGACHAT_*` | Доступ к модели (один batch-запрос за прогон) |
| `GIGACHAT_RETRY_MAX` | Повторы при 429 |

---

## API

| Метод | Путь | Назначение |
|-------|------|------------|
| `GET` | `/api/health` | Health |
| `GET` | `/api/config` | Публичные настройки |
| `POST` | `/api/auth/register` | Регистрация (login + email + password) |
| `POST` | `/api/auth/login` | Вход (cookie-сессия) |
| `POST` | `/api/auth/logout` | Выход |
| `GET` | `/api/auth/me` | Текущий пользователь |
| `POST` | `/api/run` | Рабочий прогон API (сохраняет отчёт в БД) |
| `POST` | `/api/verify` | Проверочный режим |
| `POST` | `/api/verify/fixture` | Учебный JSON |
| `GET` | `/api/reports` | Список отчётов (история) |
| `GET` | `/api/reports/{id}` | Отчёт по id |
| `GET` | `/api/reports/{id}/download` | Скачать JSON-отчёт файлом |
| `GET` | `/api/report/latest` | Последний отчёт из БД |
| `GET` | `/api/resume/vacancies` | Вакансии из сохранённых отчётов |
| `POST` | `/api/resume/draft` | Черновик резюме под вакансию |

---

## Структура

```
├── backend/
│   ├── app/                 # FastAPI, pipeline, models, scheduler
│   ├── data/fixtures/       # учебный JSON
│   └── tests/
├── frontend/                # UI (история отчётов на /platform/)
├── deploy/nginx.conf
├── examples/report.sample.json
├── docker-compose.yml       # api + web + postgres
├── .env.example
└── README.md
```


---

## Вклад участников команды

| Участник | Вклад в проект |
|----------|----------------|
| Артём | Backend: API, пайплайн анализа вакансий, PostgreSQL, интеграция GigaChat, Docker |
| Кирилл | Frontend: лендинг, платформа разбора, авторизация, сценарий резюме |
| Даша | Дизайн: визуальный стиль, UI, логотип |
| Ксюша | Демонстрация: сценарий и монтаж видео |
| София | Капитан команды: координация, README, структура материалов репозитория |

---

## Материалы репозитория

В репозитории размещены:

- Исходный код проекта
- README с инструкцией по установке и запуску
- Конфигурационные файлы
- Учебный JSON для проверочного режима
- Пример сформированного отчёта [`examples/report.sample.json`](examples/report.sample.json)
- Тесты проекта

---

## Демонстрация проекта

Видеоролик продолжительностью до 3 минут демонстрирует:

- Проблему и предлагаемое решение
- Работу сайта и процесс анализа вакансий
- Использование искусственного интеллекта
- Пример входных данных и сформированного JSON-отчёта
- Дополнительный сценарий помощи соискателю

| | |
|--|--|
| Демонстрационное видео | [https://disk.yandex.ru/i/_V5OLyWCSYCWEw](https://disk.yandex.ru/i/_V5OLyWCSYCWEw) |
| SHA финального коммита | `30cf814b1e780da49adbc25ddf364576f8e57d3a` |

---

## Лицензия

[Apache License 2.0](LICENSE)
