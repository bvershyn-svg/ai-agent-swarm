import type {
  Agent, ChatMessage, SendMessageRequest, ChatResponse,
  Run, Task, SwarmEvent, ActivityLog,
  Project, ProjectProfile, ContentDraft, ContentPlanItem,
  IdeaInboxItem, KnowledgeSource, TestScenario, TestRun,
  NewsPackage, NewsItem, NewsSource, RssArticle,
} from '@swarm/shared';

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';

function getAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const pwd = localStorage.getItem('swarm_pwd');
  return pwd ? { Authorization: `Bearer ${pwd}` } : {};
}

// Определяет текущий проект из URL: /p/[slug]/...
function getProjectHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const m = window.location.pathname.match(/^\/p\/([^/]+)/);
  return m ? { 'X-Project': m[1] } : {};
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...getAuthHeader(),
      ...getProjectHeader(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Требуется авторизация');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Ошибка ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Авторизация ──────────────────────────────────────────────────────────

export async function getAuthStatus(): Promise<{ password_required: boolean }> {
  const res = await fetch(`${BASE_URL}/api/auth/status`);
  return res.json();
}

// ── Проекты ───────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  return apiFetch('/api/projects');
}

export async function getProject(slug: string): Promise<Project> {
  return apiFetch(`/api/projects/${slug}`);
}

export async function createProject(data: { slug: string; name: string; description?: string; color?: string }): Promise<Project> {
  return apiFetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateProject(slug: string, data: Partial<Project>): Promise<Project> {
  return apiFetch(`/api/projects/${slug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteProject(slug: string): Promise<void> {
  await apiFetch(`/api/projects/${slug}`, { method: 'DELETE' });
}

// ── Агенты и чаты ────────────────────────────────────────────────────────

export async function getAgents(): Promise<Agent[]> {
  return apiFetch('/api/agents');
}

export async function getChatHistory(slug: string): Promise<ChatMessage[]> {
  return apiFetch(`/api/agents/${slug}/history`);
}

export async function sendMessage(
  slug: string,
  message: string,
  file?: { name: string; mimeType: string; data: string },
): Promise<ChatResponse> {
  return apiFetch(`/api/agents/${slug}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, file }),
  });
}

// ── Прогоны ──────────────────────────────────────────────────────────────

export interface RunListItem extends Run { task_count: number }

export interface RunDetail {
  run: Run;
  tasks: Task[];
  activity: ActivityLog[];
}

export async function getRuns(): Promise<RunListItem[]> {
  return apiFetch('/api/runs');
}

export async function getRunDetail(id: number): Promise<RunDetail> {
  return apiFetch(`/api/runs/${id}`);
}

export async function createRun(goal: string, budget_usd?: number): Promise<Run> {
  return apiFetch('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal, budget_usd }),
  });
}

export async function createSoloTask(
  agent_slug: string,
  description: string,
  budget_usd?: number,
): Promise<Run> {
  return apiFetch('/api/runs/solo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_slug, description, budget_usd }),
  });
}

export async function approvePlan(runId: number): Promise<void> {
  await apiFetch(`/api/runs/${runId}/approve-plan`, { method: 'POST' });
}

export async function rejectPlan(runId: number): Promise<void> {
  await apiFetch(`/api/runs/${runId}/reject-plan`, { method: 'POST' });
}

export async function approveResult(runId: number): Promise<void> {
  await apiFetch(`/api/runs/${runId}/approve-result`, { method: 'POST' });
}

export async function requestRevision(runId: number, comment: string): Promise<Run> {
  return apiFetch(`/api/runs/${runId}/request-revision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  });
}

export async function rerunRun(runId: number): Promise<Run> {
  return apiFetch(`/api/runs/${runId}/rerun`, { method: 'POST' });
}

export async function sendRunToTelegram(runId: number): Promise<{ ok: boolean }> {
  return apiFetch(`/api/runs/${runId}/send-to-telegram`, { method: 'POST' });
}

export async function updateTask(runId: number, taskId: number, data: { description?: string; agent_slug?: string }): Promise<Task> {
  return apiFetch(`/api/runs/${runId}/tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteTask(runId: number, taskId: number): Promise<void> {
  await apiFetch(`/api/runs/${runId}/tasks/${taskId}`, { method: 'DELETE' });
}

// ── Уведомления ──────────────────────────────────────────────────────────

export async function getEvents(): Promise<SwarmEvent[]> {
  return apiFetch('/api/events');
}

export async function getEventCount(): Promise<{ count: number }> {
  return apiFetch('/api/events/count');
}

export async function markEventRead(id: number): Promise<void> {
  await apiFetch(`/api/events/${id}/read`, { method: 'POST' });
}

export async function markAllEventsRead(): Promise<void> {
  await apiFetch('/api/events/read-all', { method: 'POST' });
}

// ── Профиль проекта ───────────────────────────────────────────────────────

export async function getProfile(): Promise<ProjectProfile> {
  return apiFetch('/api/profile');
}

export async function updateProfile(data: Partial<ProjectProfile>): Promise<ProjectProfile> {
  return apiFetch('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ── Контент-фабрика ───────────────────────────────────────────────────────

export async function getDrafts(): Promise<ContentDraft[]> {
  return apiFetch('/api/content/drafts');
}

export async function updateDraft(id: number, data: Partial<ContentDraft>): Promise<ContentDraft> {
  return apiFetch(`/api/content/drafts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteDraft(id: number): Promise<void> {
  await apiFetch(`/api/content/drafts/${id}`, { method: 'DELETE' });
}

export async function publishDraftToTelegram(id: number): Promise<{ ok: boolean; message: string }> {
  return apiFetch(`/api/content/drafts/${id}/publish-telegram`, { method: 'POST' });
}

export async function sendAllDraftsToMe(): Promise<{ ok: boolean; sent: number; message: string }> {
  return apiFetch('/api/content/drafts/send-to-me', { method: 'POST' });
}

export async function getContentPlan(): Promise<(ContentPlanItem & { draft_content?: string })[]> {
  return apiFetch('/api/content/plan');
}

export async function addToContentPlan(data: {
  title: string; platform: string; scheduled_at?: string; draft_id?: number; notes?: string;
}): Promise<ContentPlanItem> {
  return apiFetch('/api/content/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateContentPlan(id: number, data: Partial<ContentPlanItem>): Promise<ContentPlanItem> {
  return apiFetch(`/api/content/plan/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteContentPlan(id: number): Promise<void> {
  await apiFetch(`/api/content/plan/${id}`, { method: 'DELETE' });
}

// ── Инбокс идей ───────────────────────────────────────────────────────────

export async function getInbox(projectSlug?: string): Promise<IdeaInboxItem[]> {
  const q = projectSlug ? `?project=${projectSlug}` : '';
  const res = await fetch(`${BASE_URL}/api/inbox${q}`, {
    headers: { ...getAuthHeader() },
  });
  return res.json();
}

export async function addIdea(text: string): Promise<IdeaInboxItem> {
  return apiFetch('/api/inbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

export async function launchIdeaAsRun(id: number): Promise<Run> {
  return apiFetch(`/api/inbox/${id}/launch`, { method: 'POST' });
}

export async function rejectIdea(id: number): Promise<void> {
  await apiFetch(`/api/inbox/${id}`, { method: 'DELETE' });
}

// ── База знаний ───────────────────────────────────────────────────────────

export async function getKnowledgeSources(): Promise<KnowledgeSource[]> {
  return apiFetch('/api/knowledge');
}

export async function deleteKnowledgeSource(id: number): Promise<void> {
  await apiFetch(`/api/knowledge/${id}`, { method: 'DELETE' });
}

// Загрузить текстовый материал в базу знаний или постоянный контекст
export async function uploadKnowledge(
  name: string,
  text: string,
  is_pinned: boolean,
): Promise<{ source: KnowledgeSource; chunk_count: number }> {
  return apiFetch('/api/knowledge/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, text, is_pinned }),
  });
}

// Переключить тип материала: постоянный контекст ↔ база знаний
export async function patchKnowledgeSource(
  id: number,
  is_pinned: boolean,
): Promise<KnowledgeSource> {
  return apiFetch(`/api/knowledge/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_pinned }),
  });
}

// ── Тесты ─────────────────────────────────────────────────────────────────

// ── Новостная фабрика ─────────────────────────────────────────────────────

export async function getNewsPackages(): Promise<NewsPackage[]> {
  return apiFetch('/api/news/packages');
}

export async function getNewsPackage(id: number): Promise<NewsPackage> {
  return apiFetch(`/api/news/packages/${id}`);
}

export async function createNewsPackage(data: {
  title?: string;
  target_date?: string;
  region?: string;
  languages?: string[];
  items?: Partial<NewsItem>[];
}): Promise<NewsPackage> {
  return apiFetch('/api/news/packages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateNewsPackage(id: number, data: Partial<NewsPackage> & { items?: Partial<NewsItem>[] }): Promise<NewsPackage> {
  return apiFetch(`/api/news/packages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteNewsPackage(id: number): Promise<void> {
  await apiFetch(`/api/news/packages/${id}`, { method: 'DELETE' });
}

export async function createRunFromNewsPackage(id: number): Promise<Run> {
  return apiFetch(`/api/news/packages/${id}/create-run`, { method: 'POST' });
}

// Источники новостей
export async function getNewsSources(): Promise<NewsSource[]> {
  return apiFetch('/api/news/sources');
}

export async function createNewsSource(data: Partial<NewsSource>): Promise<NewsSource> {
  return apiFetch('/api/news/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateNewsSource(id: number, data: Partial<NewsSource>): Promise<NewsSource> {
  return apiFetch(`/api/news/sources/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteNewsSource(id: number): Promise<void> {
  await apiFetch(`/api/news/sources/${id}`, { method: 'DELETE' });
}

export async function fetchRssArticles(url: string, sourceName?: string): Promise<RssArticle[]> {
  return apiFetch('/api/news/fetch-rss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, source_name: sourceName ?? '' }),
  });
}

// ── Тесты ─────────────────────────────────────────────────────────────────

export async function getTestScenarios(): Promise<TestScenario[]> {
  return apiFetch('/api/tests/scenarios');
}

export async function getTestRuns(): Promise<(TestRun & { scenario_name?: string; agent_slug?: string })[]> {
  return apiFetch('/api/tests/runs');
}
