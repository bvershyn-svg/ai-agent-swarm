# Рой ИИ-агентов — памятка для Claude

## О владельце проекта

Владелец — не технический специалист. Всегда:
- Объясняй каждый шаг простым языком, без жаргона
- Предупреждай перед установкой или удалением чего-либо
- Комментарии в коде — на русском языке
- Интерфейс — на русском языке
- Не используй curl для API-вызовов — только `npm run api --` (кириллица корректна)

---

## Что построено

Система из 8 ИИ-агентов для автоматического ведения социальных сетей.
Агенты работают как «рой»: Стратег строит план, остальные выполняют задачи.
Управление — через веб-дашборд и Telegram-бота.

---

## Стек

| Слой | Технология | Папка |
|---|---|---|
| Монорепозиторий | npm workspaces | корень |
| Бэкенд (API) | Node.js 24 + Express + tsx | `apps/backend` |
| Дашборд (UI) | Next.js 15 + React + Tailwind | `apps/dashboard` |
| Общие типы | TypeScript пакет | `packages/shared` |
| База данных | PostgreSQL 18 (портативная) | `D:\pgsql` |
| ИИ-агенты | Anthropic SDK (claude-sonnet-4-6) | — |
| Уведомления | Telegram Bot API (long-polling) | — |

---

## Структура папок

```
Рой/
├── apps/
│   ├── backend/
│   │   └── src/
│   │       ├── index.ts          # точка входа, регистрация роутеров
│   │       ├── env.ts            # переменные окружения (required/optional)
│   │       ├── db.ts             # Pool соединений с PostgreSQL
│   │       ├── notify.ts         # notifyOwner(), publishToChannel()
│   │       ├── profile.ts        # getProfile(), buildProfileContext()
│   │       ├── knowledge.ts      # searchKnowledge() — полнотекстовый поиск
│   │       ├── telegram.ts       # Telegram-бот: long-polling, команды, кнопки
│   │       ├── middleware/
│   │       │   ├── auth.ts       # Bearer-токен (SWARM_PASSWORD)
│   │       │   └── project.ts    # X-Project заголовок → req.projectId
│   │       ├── agents/
│   │       │   ├── handlers.ts   # типы AgentHandler, ChatMessage
│   │       │   ├── conversational.ts  # chat() — диалог с агентом через Claude API
│   │       │   ├── orchestrator.ts    # planRun(), executeRun(), launchSoloTask()
│   │       │   └── queue.ts      # очередь прогонов, recoverInterrupted()
│   │       └── routes/
│   │           ├── agents.ts     # GET /api/agents, GET /api/agents/:slug/chat, POST
│   │           ├── runs.ts       # CRUD прогонов, POST /api/runs/solo
│   │           ├── events.ts     # GET /api/events (SSE-события)
│   │           ├── profile.ts    # GET/PATCH /api/profile
│   │           ├── content.ts    # /api/content/drafts, /api/content/plan, publish-telegram
│   │           ├── projects.ts   # CRUD /api/projects
│   │           ├── inbox.ts      # /api/inbox, /api/inbox/:id/launch
│   │           ├── knowledge.ts  # /api/knowledge, /api/knowledge/:id/chunks
│   │           └── tests.ts      # /api/tests/scenarios, /api/tests/runs
│   └── dashboard/
│       └── src/app/
│           ├── page.tsx          # редирект на /projects
│           ├── login/            # страница входа
│           ├── projects/         # список всех проектов
│           ├── inbox/            # глобальный инбокс идей
│           └── p/[slug]/         # всё внутри проекта
│               ├── layout.tsx    # сайдбар проекта
│               ├── runs/         # список и детали прогонов
│               ├── inbox/        # инбокс идей проекта
│               ├── review/       # задачи на проверке
│               ├── tasks/        # черновики контента
│               ├── calendar/     # контент-план
│               ├── knowledge/    # база знаний
│               ├── tests/        # тестовые сценарии
│               ├── profile/      # профиль проекта
│               └── chats/[agent] # чат с конкретным агентом
├── packages/shared/src/index.ts  # все TypeScript-типы
├── db/
│   ├── migrate.sql  # идемпотентная миграция (запускать при обновлениях)
│   ├── seed.sql     # начальные данные: 8 агентов
│   ├── setup.mjs    # создание БД и пользователя swarm
│   ├── seed.mjs     # запуск seed.sql
│   ├── migrate.mjs  # запуск migrate.sql
│   ├── reset.mjs    # полный сброс (ОСТОРОЖНО: удаляет данные)
│   └── backup.mjs   # резервная копия в папку backups/
├── scripts/
│   ├── api.mjs              # UTF-8 замена curl: npm run api -- GET projects
│   ├── knowledge-ingest.mjs # загрузка файлов в базу знаний
│   ├── tests-seed.mjs       # создание 11 базовых тестовых сценариев
│   ├── tests-batch.mjs      # пакетный запуск тестов с авто-оценкой
│   └── telegram-chat-id.mjs # узнать свой Telegram chat ID
├── .env             # секреты (НЕ в git!)
├── .env.example     # шаблон (в git)
├── .gitignore
├── CLAUDE.md        # этот файл
├── README.md        # инструкция для пользователя
└── package.json     # корневые скрипты монорепозитория
```

---

## База данных — 15 таблиц

| Таблица | Назначение |
|---|---|
| `projects` | Проекты (slug, name, color) |
| `agents` | 8 агентов: slug, name, system_prompt, is_active |
| `runs` | Прогоны роя: goal, status, plan_json, budget_usd |
| `tasks` | Задачи внутри прогона: agent_slug, result, critic_verdict |
| `activity_log` | Журнал действий агентов во время прогона |
| `events` | SSE-события для дашборда (read_at) |
| `chat_messages` | История диалогов с агентами (по проекту) |
| `project_profile` | Профиль проекта: бизнес, аудитория, тон, табу |
| `content_drafts` | Черновики контента: platform, title, content, status |
| `content_plan` | Контент-план: scheduled_at, draft_id |
| `knowledge_sources` | Источники базы знаний (файлы) |
| `knowledge_chunks` | Чанки текста с полнотекстовым поиском (tsv) |
| `idea_inbox` | Инбокс идей: text, source, status, run_id |
| `test_scenarios` | Тестовые сценарии: agent_slug, prompt, expected |
| `test_runs` | Результаты тестов: response, verdict, cost_usd |

Статусы прогона: `planning → awaiting_approval → running → awaiting_review → completed / failed`

---

## Как работает прогон роя

1. **Цель** поступает через дашборд, Telegram (`/task`) или инбокс идей
2. **Стратег** (`planRun`) составляет план — список задач с зависимостями
3. Статус → `awaiting_approval`, дашборд показывает план
4. Владелец **одобряет** план
5. **Очередь** (`queue.ts`) запускает задачи по порядку (`executeRun`)
6. Каждую задачу выполняет соответствующий агент через Claude API
7. **Критик** проверяет результат → `approved` или `rejected` (до 3 ревизий)
8. Готовый результат → черновик в `content_drafts`
9. Статус → `awaiting_review` → владелец финально одобряет → `completed`
10. Уведомление в Telegram

**Прямая задача** (`launchSoloTask`): минует шаги 2–4, агент выполняет сразу.

---

## Переменные окружения (.env)

```
DATABASE_URL=postgresql://swarm:swarm@localhost:5432/ai_agent_swarm
BACKEND_PORT=4000
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
CLAUDE_CODE_OAUTH_TOKEN=   # npm run claude setup-token
ANTHROPIC_API_KEY=         # альтернатива OAuth-токену
ANTHROPIC_MODEL=claude-sonnet-4-6
TELEGRAM_BOT_TOKEN=        # от @BotFather
TELEGRAM_OWNER_CHAT_ID=    # npm run telegram:chat-id
TELEGRAM_CHANNEL_ID=       # @channel или -1001234567890
SWARM_PASSWORD=            # пароль дашборда (необязательно)
```

---

## PostgreSQL — запуск/остановка

```bash
# Запустить (нужно перед npm run dev)
"D:\pgsql\bin\pg_ctl.exe" -D "D:\pgsql\data" -l "D:\pgsql\data\logfile.log" start

# Остановить
"D:\pgsql\bin\pg_ctl.exe" -D "D:\pgsql\data" stop
```

Суперпользователь: `postgres` / `postgres`
Рабочий пользователь: `swarm` / `swarm`

---

## Все npm-команды

```bash
# Разработка
npm run dev              # бэкенд :4000 + дашборд :3000

# База данных
npm run db:setup         # первый запуск: создать БД и пользователя swarm
npm run db:seed          # заполнить 8 агентов
npm run db:migrate       # применить обновления схемы (идемпотентно)
npm run db:reset         # полный сброс (удаляет все данные!)
npm run db:backup        # резервная копия → backups/

# Знания
npm run knowledge:ingest -- --dir=./docs --project=demo

# Тесты агентов
npm run tests:seed       # создать 11 базовых сценариев
npm run tests:batch      # прогнать все новые тесты
npm run tests:batch -- --rerun           # перезапустить все
npm run tests:batch -- --agent=critic    # только один агент
npm run tests:batch -- --limit=5         # ограничить количество

# Утилиты
npm run api -- GET projects              # UTF-8 аналог curl
npm run api -- POST inbox demo '{"text":"Идея"}'
npm run telegram:chat-id                 # узнать свой chat ID
npm run typecheck                        # проверка TypeScript
```

---

## API — основные эндпоинты

Все запросы принимают заголовок `X-Project: <slug>` для фильтрации по проекту.

```
GET    /api/health
GET    /api/projects
GET    /api/agents
POST   /api/runs                      # запустить полный прогон роя
POST   /api/runs/solo                 # прямая задача агенту
GET    /api/runs/:id                  # детали прогона
POST   /api/runs/:id/approve          # одобрить план
POST   /api/runs/:id/tasks/:tid/approve  # одобрить задачу
GET    /api/events                    # SSE поток событий
GET    /api/profile                   # профиль проекта
PATCH  /api/profile                   # обновить профиль
GET    /api/content/drafts            # черновики
POST   /api/content/drafts/:id/publish-telegram  # опубликовать в канал
GET    /api/inbox                     # инбокс идей
POST   /api/inbox                     # добавить идею
POST   /api/inbox/:id/launch          # запустить идею как прогон
GET    /api/knowledge                 # источники базы знаний
GET    /api/tests/scenarios           # тестовые сценарии
GET    /api/tests/runs                # результаты тестов
```

---

## Telegram-бот — команды

```
/help               — справка
/project            — список проектов
/project <slug>     — переключить проект
/runs               — последние 5 прогонов
/idea <текст>       — добавить идею (с кнопками 🚀/❌)
/inbox              — показать инбокс с кнопками
/task <агент> <задача>  — прямая задача агенту
/agent <slug>       — начать диалог с агентом
/cancel             — выйти из режима диалога
```

---

## Агенты

| Slug | Роль |
|---|---|
| `strategist` | Стратег — строит план прогона |
| `scriptwriter` | Сценарист — пишет тексты, посты, сценарии |
| `reelsmaker` | Рилсмейкер — концепции коротких видео |
| `montager` | Монтажёр — монтажные планы |
| `designer` | Дизайнер — визуальные концепции и ТЗ |
| `publisher` | Публикатор — оформление, хэштеги, тайминг |
| `programmer` | Программист — помогает с системой |
| `critic` | Критик — проверяет результаты агентов |

---

## Важные детали кода

- **Next.js 15**: `params` в layout/page — `Promise<{slug}>`, нужен `await params`
- **`npm run api`** вместо curl — Git Bash конвертирует `/api/` в Windows-путь
- **`tests:batch --rerun`** — флаг парсится как `'rerun' in args` (без `--`)
- **Telegram inline-кнопки**: `callback_data: "idea_launch_<id>"`, обработчик в `telegram.ts`
- **Кодировка**: все скрипты используют Node.js fetch — всегда UTF-8
