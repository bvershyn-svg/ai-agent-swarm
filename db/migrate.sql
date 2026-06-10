-- Безопасная миграция роя (идемпотентная — безопасно запускать повторно)
-- Существующие данные не затрагиваются

-- ──────────────────────────────────────────────
-- Проекты (мульти-проектность)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(64)  NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  description TEXT         NOT NULL DEFAULT '',
  color       VARCHAR(16)  NOT NULL DEFAULT '#3B82F6',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
INSERT INTO projects (slug, name, description)
VALUES ('demo', 'Демо-проект', 'Первый проект для знакомства с Роем')
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────
-- Прогоны роя
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  goal            TEXT NOT NULL,
  status          VARCHAR(32) NOT NULL DEFAULT 'planning',
  plan_json       JSONB,
  summary         TEXT,
  total_tokens    INTEGER NOT NULL DEFAULT 0,
  total_cost_usd  FLOAT8  NOT NULL DEFAULT 0,
  budget_usd      FLOAT8,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE runs ADD COLUMN IF NOT EXISTS total_tokens   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS total_cost_usd FLOAT8  NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS budget_usd     FLOAT8;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS project_id     INTEGER REFERENCES projects(id) ON DELETE CASCADE;
UPDATE runs SET project_id = (SELECT id FROM projects WHERE slug = 'demo') WHERE project_id IS NULL;

-- ──────────────────────────────────────────────
-- Задачи
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id             SERIAL PRIMARY KEY,
  run_id         INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  agent_slug     VARCHAR(64) NOT NULL,
  description    TEXT NOT NULL,
  status         VARCHAR(32) NOT NULL DEFAULT 'pending',
  result         TEXT,
  critic_verdict TEXT,
  revision_round INTEGER NOT NULL DEFAULT 0,
  depends_on     INTEGER[] NOT NULL DEFAULT '{}',
  position       INTEGER NOT NULL DEFAULT 0,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd       FLOAT8  NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS input_tokens  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS output_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cost_usd      FLOAT8  NOT NULL DEFAULT 0;

-- ──────────────────────────────────────────────
-- Уведомления
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  run_id      INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  type        VARCHAR(64) NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Журнал активности
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id          SERIAL PRIMARY KEY,
  run_id      INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  task_id     INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  agent_slug  VARCHAR(64),
  action      VARCHAR(128) NOT NULL,
  details     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Профиль проекта
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_profile (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  business   TEXT NOT NULL DEFAULT '',
  audience   TEXT NOT NULL DEFAULT '',
  products   TEXT NOT NULL DEFAULT '',
  tone       TEXT NOT NULL DEFAULT '',
  taboo      TEXT NOT NULL DEFAULT '',
  examples   TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Добавляем project_id если таблица уже существовала без него
ALTER TABLE project_profile ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;
-- Привязываем существующие строки к демо-проекту
UPDATE project_profile
SET project_id = (SELECT id FROM projects WHERE slug = 'demo')
WHERE project_id IS NULL;
-- Создаём профиль для демо-проекта только если строк нет совсем
INSERT INTO project_profile (project_id)
SELECT id FROM projects WHERE slug = 'demo'
  AND NOT EXISTS (SELECT 1 FROM project_profile);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_project ON project_profile(project_id);

-- ──────────────────────────────────────────────
-- Чаты с агентами (с поддержкой проектов)
-- ──────────────────────────────────────────────
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;
UPDATE chat_messages SET project_id = (SELECT id FROM projects WHERE slug = 'demo') WHERE project_id IS NULL;

-- ──────────────────────────────────────────────
-- Черновики контента
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_drafts (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  task_id     INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  run_id      INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  platform    VARCHAR(32) NOT NULL DEFAULT 'general',
  title       TEXT NOT NULL DEFAULT 'Черновик',
  content     TEXT NOT NULL,
  status      VARCHAR(32) NOT NULL DEFAULT 'draft',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;
UPDATE content_drafts SET project_id = (SELECT id FROM projects WHERE slug = 'demo') WHERE project_id IS NULL;

-- ──────────────────────────────────────────────
-- Контент-план
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_plan (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  draft_id     INTEGER REFERENCES content_drafts(id) ON DELETE SET NULL,
  run_id       INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  platform     VARCHAR(32) NOT NULL DEFAULT 'general',
  title        TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  status       VARCHAR(32) NOT NULL DEFAULT 'planned',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE content_plan ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;
UPDATE content_plan SET project_id = (SELECT id FROM projects WHERE slug = 'demo') WHERE project_id IS NULL;

-- ──────────────────────────────────────────────
-- База знаний (Часть 3)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  source_type VARCHAR(32)  NOT NULL DEFAULT 'file',
  path        TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id         SERIAL PRIMARY KEY,
  source_id  INTEGER NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  metadata   JSONB NOT NULL DEFAULT '{}',
  tsv        TSVECTOR GENERATED ALWAYS AS (to_tsvector('russian', content)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_tsv     ON knowledge_chunks USING GIN(tsv);
CREATE INDEX IF NOT EXISTS idx_knowledge_project ON knowledge_chunks(project_id);

-- ──────────────────────────────────────────────
-- Инбокс идей (Часть 6)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idea_inbox (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  source     VARCHAR(32) NOT NULL DEFAULT 'manual',
  status     VARCHAR(32) NOT NULL DEFAULT 'new',
  run_id     INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Фабрика тестов (Часть 5)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_scenarios (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  agent_slug  VARCHAR(64) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  prompt      TEXT NOT NULL,
  expected    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_runs (
  id           SERIAL PRIMARY KEY,
  scenario_id  INTEGER NOT NULL REFERENCES test_scenarios(id) ON DELETE CASCADE,
  project_id   INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  status       VARCHAR(32) NOT NULL DEFAULT 'pending',
  response     TEXT,
  verdict      VARCHAR(32),
  verdict_note TEXT,
  cost_usd     FLOAT8  NOT NULL DEFAULT 0,
  duration_ms  INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Новостная фабрика
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_packages (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL DEFAULT '',
  target_date DATE         NOT NULL DEFAULT CURRENT_DATE,
  region      VARCHAR(128) NOT NULL DEFAULT '',
  languages   TEXT[]       NOT NULL DEFAULT '{}',
  status      VARCHAR(32)  NOT NULL DEFAULT 'draft',
  run_id      INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_items (
  id                  SERIAL PRIMARY KEY,
  package_id          INTEGER NOT NULL REFERENCES news_packages(id) ON DELETE CASCADE,
  category            VARCHAR(32) NOT NULL DEFAULT 'politics',
  title               VARCHAR(512) NOT NULL DEFAULT '',
  summary             TEXT NOT NULL DEFAULT '',
  why_important       TEXT NOT NULL DEFAULT '',
  why_video           TEXT NOT NULL DEFAULT '',
  links               TEXT[] NOT NULL DEFAULT '{}',
  terms               TEXT[] NOT NULL DEFAULT '{}',
  verification_status VARCHAR(32) NOT NULL DEFAULT 'unverified',
  virality_score      INTEGER NOT NULL DEFAULT 5,
  risks               TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Индексы
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_run_id        ON tasks(run_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status        ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_events_read_at      ON events(read_at);
CREATE INDEX IF NOT EXISTS idx_events_run_id       ON events(run_id);
CREATE INDEX IF NOT EXISTS idx_activity_run_id     ON activity_log(run_id);
CREATE INDEX IF NOT EXISTS idx_drafts_run_id       ON content_drafts(run_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status       ON content_drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_project      ON content_drafts(project_id);
CREATE INDEX IF NOT EXISTS idx_plan_scheduled      ON content_plan(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_plan_status         ON content_plan(status);
CREATE INDEX IF NOT EXISTS idx_plan_project        ON content_plan(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_project        ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_project        ON chat_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_ideas_project       ON idea_inbox(project_id);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_proj ON test_scenarios(project_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_scenario  ON test_runs(scenario_id);
CREATE INDEX IF NOT EXISTS idx_news_packages_proj  ON news_packages(project_id);
CREATE INDEX IF NOT EXISTS idx_news_items_pkg      ON news_items(package_id);

-- ──────────────────────────────────────────────
-- Постоянный контекст проекта
-- ──────────────────────────────────────────────
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
