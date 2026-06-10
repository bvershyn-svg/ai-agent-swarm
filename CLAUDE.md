# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## О владельце

Владелец — **не технический специалист**. Всегда:
- Объясняй каждый шаг простым языком, без жаргона
- Предупреждай перед установкой или удалением чего-либо
- Комментарии в коде — на **русском языке**
- Интерфейс — на **русском языке**
- **Никогда не используй curl** для API-вызовов — только `npm run api --` (кириллица корректна на Windows)

---

## Команды для разработки

```bash
# Запустить всё (бэкенд :4000 + дашборд :3000)
npm run dev

# Только бэкенд или дашборд
npm run dev --workspace=apps/backend
npm run dev --workspace=apps/dashboard

# TypeScript-проверка всего монорепозитория
npm run typecheck

# База данных
"D:\pgsql\bin\pg_ctl.exe" -D "D:\pgsql\data" -l "D:\pgsql\data\logfile.log" start
npm run db:migrate   # применить migrate.sql (идемпотентно, запускать при изменениях схемы)
npm run db:seed      # заполнить 8 агентов (если таблица agents пустая)
npm run db:backup    # резервная копия в backups/

# API без curl (Git Bash на Windows ломает пути /api/...)
npm run api -- GET runs
npm run api -- POST inbox demo '{"text":"Идея"}'

# Загрузка файлов в базу знаний
npm run knowledge:ingest -- --dir=./docs --project=demo

# Тесты агентов
npm run tests:seed   # создать стартовые сценарии
npm run tests:batch  # прогнать тесты
```

---

## Архитектура

### Монорепозиторий (npm workspaces)

```
Рой/
├── packages/shared/      — TypeScript-типы (Agent, Run, Task, ChatMessage…)
├── apps/backend/         — Express API + агенты + Telegram-бот
└── apps/dashboard/       — Next.js 15 дашборд
```

Типы из `packages/shared` импортируются в обоих `apps/*` как `@swarm/shared`.  
При добавлении нового поля в запрос/ответ — **сначала обновить shared/src/index.ts**.

### База данных (PostgreSQL 18 в D:\pgsql)

Суперпользователь: `postgres/postgres`. Рабочий пользователь: `swarm/swarm`.  
`db/migrate.sql` — идемпотентная, можно запускать многократно.  
`db/seed.sql` — 8 агентов со своими `system_prompt`; личность агента живёт в БД, не в коде.

Ключевые связи:
- `runs` → `tasks` (CASCADE)
- `tasks.depends_on` — **массив реальных DB `id`** (не индексы плана; маппинг происходит в `planRun()`)
- `knowledge_chunks.tsv` — вычисляемый TSVECTOR для полнотекстового поиска по-русски

### Бэкенд (`apps/backend/src/`)

**Точка входа** `index.ts`: регистрирует роутеры, запускает очередь и Telegram-бот.

**Middleware-цепочка** для всех `/api/*`:
1. `authMiddleware` — опциональный Bearer-токен из `SWARM_PASSWORD`
2. `projectMiddleware` — заголовок `X-Project: <slug>` → `req.projectId`; все запросы к БД фильтруются по `project_id`

**Жизненный цикл прогона (`agents/orchestrator.ts`):**
```
POST /api/runs
  → planRun()           — Стратег через tool_use create_plan → tasks[] в БД
  → awaiting_approval   — уведомление в Telegram
  → POST /approve-plan
  → queue.schedule(id)  → executeRun()
      → processTask()   — агент → Критик (до 2 ревизий)
      → summarizeAndFinish() — сводка → awaiting_review → уведомление
  → POST /approve-result → completed → черновики + уведомление
```

**Очередь (`agents/queue.ts`):** однопоточная (один прогон за раз), `recoverInterrupted()` при рестарте.

**Разговорный агент (`agents/conversational.ts`):**
- История = все строки `chat_messages` для (agent_id, project_id)
- Файловые вложения: изображения → `ImageBlockParam`, PDF → `DocumentBlockParam`, TXT → `PlainTextSource` (data = decoded UTF-8, не base64)
- Инструмент `fetch_url` позволяет агенту читать веб-страницы (до 5 раундов)
- Знания подтягиваются через `searchKnowledge()` (PostgreSQL FTS, топ-3 чанка)

**Уведомления (`notify.ts`):** `notifyOwner()` отправляет в `TELEGRAM_OWNER_CHAT_ID`; `publishToChannel()` в `TELEGRAM_CHANNEL_ID`.

### Дашборд (`apps/dashboard/src/`)

**Next.js 15 App Router.** Всё интерактивное — `'use client'`. Серверные компоненты только для layout.

Критично: `params` в layout/page — `Promise<{slug}>`, нужен `await params`.

**Глобальные компоненты:**
- `TopNav` — диспатчит synthetic KeyboardEvent для открытия модалов (`Ctrl+K`, `Ctrl+N`)
- `GlobalShortcuts` — client-компонент в корневом layout, слушает `window.addEventListener('keydown')`. Не перехватывает `c/v/z/x/a/y`.

**Определение проекта:**
```typescript
// api.ts — автоматически из URL
function getProjectHeader() {
  const m = window.location.pathname.match(/^\/p\/([^/]+)/);
  return m ? { 'X-Project': m[1] } : {};
}
```
Это значит: все функции `apiFetch` внутри `/p/[slug]/...` автоматически привязаны к нужному проекту.

**Страницы проекта:**
- `/p/[slug]/digest` — главная страница владельца: что делать + результаты
- `/p/[slug]/runs/[id]` — детали прогона с задачами и журналом
- `/p/[slug]/chats/[agent]` — чат с агентом (поддержка файлов, счётчик символов, кнопка копирования)
- `/p/[slug]/knowledge` — база знаний проекта
- `/p/[slug]/context` — _(новый раздел)_ постоянный контекст и материалы для агентов

### Telegram-бот (`telegram.ts`)

Long-polling, запускается при старте сервера. Сессии (проект, режим ожидания) хранятся **в памяти** — сбрасываются при рестарте бэкенда.

Команды: `/help`, `/project`, `/runs`, `/idea`, `/inbox`, `/task`, `/agent`, `/cancel`.  
Inline-кнопки: `idea_launch_<id>`, `idea_reject_<id>`.

### Переменные окружения (`.env` в корне)

```
DATABASE_URL=postgresql://swarm:swarm@localhost:5432/ai_agent_swarm
BACKEND_PORT=4000
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
ANTHROPIC_API_KEY=               # или CLAUDE_CODE_OAUTH_TOKEN (OAuth имеет приоритет)
ANTHROPIC_MODEL=claude-sonnet-4-6
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_CHAT_ID=
TELEGRAM_CHANNEL_ID=
SWARM_PASSWORD=                  # опционально
```

`env.ts` загружает `.env` из корня (три уровня вверх от `apps/backend/src/`).  
Если `ANTHROPIC_API_KEY` не задан, но задан `CLAUDE_CODE_OAUTH_TOKEN` — он прокидывается в `ANTHROPIC_AUTH_TOKEN`, который Anthropic SDK подхватывает автоматически.

---

## Важные детали реализации

- **`tasks.depends_on`**: содержит реальные `id` из таблицы `tasks`, а не индексы из плана. Маппинг `0-based index → DB id` выполняется в `planRun()` при вставке задач.
- **TXT-файлы в чате**: frontend отправляет base64, backend декодирует в UTF-8 и использует `PlainTextSource` с `type: 'text'` (не `'base64'`).
- **Стоимость**: `MODEL_PRICING` в `orchestrator.ts` — вручную обновлять при добавлении новых моделей.
- **Критик**: запускается **внутри** `processTask()` для каждой задачи синхронно, до 2 ревизий (`MAX_REVISIONS = 2`).
- **Агент-программист** не имеет специального обработчика — использует стандартный `chat()` из `conversational.ts`.
- **Планирование**: `needs_approval` автоматически `true` если задач > 3 (`SMALL_RUN_THRESHOLD = 3`).
- **Черновики**: создаются автоматически при `approve-result` из задач агента `publisher`.
