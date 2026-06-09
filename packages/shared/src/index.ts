// Общие типы проекта «Рой»

// ──────────────────────────────────────────────
// Проекты
// ──────────────────────────────────────────────

export interface Project {
  id: number;
  slug: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
}

// ──────────────────────────────────────────────
// Агенты и чаты
// ──────────────────────────────────────────────

export interface Agent {
  id: number;
  slug: string;
  name: string;
  description: string;
  system_prompt: string;
  is_active: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  agent_id: number;
  project_id: number | null;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface SendMessageRequest {
  message: string;
}

export interface ChatResponse {
  reply: string;
  history: ChatMessage[];
}

// ──────────────────────────────────────────────
// Прогоны и задачи
// ──────────────────────────────────────────────

export type RunStatus =
  | 'planning'
  | 'awaiting_approval'
  | 'running'
  | 'awaiting_review'
  | 'completed'
  | 'failed';

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'reviewing'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'waiting_question'
  | 'cancelled';

export interface Run {
  id: number;
  project_id: number | null;
  goal: string;
  status: RunStatus;
  plan_json: TaskPlanItem[] | null;
  summary: string | null;
  total_tokens: number;
  total_cost_usd: number;
  budget_usd: number | null;
  created_at: string;
  updated_at: string;
}

export interface TaskPlanItem {
  agent_slug: string;
  description: string;
  depends_on: number[];
}

export interface Task {
  id: number;
  run_id: number;
  agent_slug: string;
  description: string;
  status: TaskStatus;
  result: string | null;
  critic_verdict: string | null;
  revision_round: number;
  depends_on: number[];
  position: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
  updated_at: string;
}

export interface SwarmEvent {
  id: number;
  run_id: number | null;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  run_id: number;
  task_id: number | null;
  agent_slug: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

export interface RunDetail extends Run {
  tasks: Task[];
  activity: ActivityLog[];
}

// ──────────────────────────────────────────────
// Профиль проекта
// ──────────────────────────────────────────────

export interface ProjectProfile {
  id: number;
  project_id: number;
  business: string;
  audience: string;
  products: string;
  tone: string;
  taboo: string;
  examples: string;
  updated_at: string;
}

// ──────────────────────────────────────────────
// Контент-фабрика
// ──────────────────────────────────────────────

export interface ContentDraft {
  id: number;
  project_id: number | null;
  task_id: number | null;
  run_id: number | null;
  platform: string;
  title: string;
  content: string;
  status: 'draft' | 'approved' | 'published';
  created_at: string;
  updated_at: string;
}

export interface ContentPlanItem {
  id: number;
  project_id: number | null;
  draft_id: number | null;
  run_id: number | null;
  platform: string;
  title: string;
  scheduled_at: string | null;
  status: 'planned' | 'in_progress' | 'published' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ──────────────────────────────────────────────
// База знаний
// ──────────────────────────────────────────────

export interface KnowledgeSource {
  id: number;
  project_id: number;
  name: string;
  source_type: string;
  path: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeChunk {
  id: number;
  source_id: number;
  project_id: number;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ──────────────────────────────────────────────
// Инбокс идей
// ──────────────────────────────────────────────

export interface IdeaInboxItem {
  id: number;
  project_id: number | null;
  text: string;
  source: string;
  status: 'new' | 'in_progress' | 'done' | 'rejected';
  run_id: number | null;
  created_at: string;
}

// ──────────────────────────────────────────────
// Фабрика тестов
// ──────────────────────────────────────────────

export interface TestScenario {
  id: number;
  project_id: number | null;
  agent_slug: string;
  name: string;
  prompt: string;
  expected: string | null;
  created_at: string;
}

export interface TestRun {
  id: number;
  scenario_id: number;
  project_id: number | null;
  status: 'pending' | 'running' | 'done' | 'failed';
  response: string | null;
  verdict: 'pass' | 'fail' | 'skip' | null;
  verdict_note: string | null;
  cost_usd: number;
  duration_ms: number | null;
  created_at: string;
}
