'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getRunDetail, approvePlan, rejectPlan, approveResult, requestRevision,
  rerunRun, updateTask, deleteTask,
} from '@/lib/api';
import type { RunDetail } from '@/lib/api';
import type { RunStatus, TaskStatus, Task, ActivityLog } from '@swarm/shared';

const STATUS_LABEL: Record<RunStatus, string> = {
  planning:          '⏳ Стратег составляет план…',
  awaiting_approval: '📋 План готов — проверьте и запустите',
  running:           '⚡ Агенты работают…',
  awaiting_review:   '✅ Готово — ожидает вашей проверки',
  completed:         '🎉 Одобрено',
  failed:            '❌ Ошибка',
};

const STATUS_COLOR: Record<RunStatus, string> = {
  planning:          'text-yellow-400',
  awaiting_approval: 'text-blue-400',
  running:           'text-green-400',
  awaiting_review:   'text-purple-400',
  completed:         'text-gray-400',
  failed:            'text-red-400',
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending:          'Ожидает',
  running:          'Выполняется',
  done:             'Выполнена',
  reviewing:        'Критик проверяет',
  approved:         'Одобрена',
  rejected:         'На доработке',
  completed:        'Завершена',
  waiting_question: 'Ждёт ответа',
  cancelled:        'Отменена',
};

const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  pending:          'bg-gray-700 text-gray-400',
  running:          'bg-green-900 text-green-300',
  done:             'bg-yellow-900 text-yellow-300',
  reviewing:        'bg-blue-900 text-blue-300',
  approved:         'bg-emerald-900 text-emerald-300',
  rejected:         'bg-orange-900 text-orange-300',
  completed:        'bg-emerald-900 text-emerald-300',
  waiting_question: 'bg-purple-900 text-purple-300',
  cancelled:        'bg-red-900/60 text-red-400',
};

const AGENT_EMOJI: Record<string, string> = {
  strategist:   '🧠',
  scriptwriter: '🎬',
  reelsmaker:   '📱',
  montager:     '✂️',
  designer:     '🎨',
  publisher:    '📅',
  programmer:   '💻',
  critic:       '🔍',
  system:       '⚙️',
};

const AGENT_NAME: Record<string, string> = {
  strategist:   'Стратег',
  scriptwriter: 'Сценарист',
  reelsmaker:   'Рилсмейкер',
  montager:     'Монтажёр',
  designer:     'Дизайнер',
  publisher:    'Публикатор',
  programmer:   'Программист',
  critic:       'Критик',
  system:       'Система',
};

const ALL_AGENTS = Object.entries(AGENT_NAME).filter(([s]) => s !== 'system');

export default function ProjectRunDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const router = useRouter();
  const { slug } = params;
  const runId = parseInt(params.id);
  const base = `/p/${slug}`;

  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [revisionComment, setRevisionComment] = useState('');
  const [showRevision, setShowRevision] = useState(false);
  const [editingTask, setEditingTask] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAgent, setEditAgent] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [rerunBusy, setRerunBusy] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const data = await getRunDetail(runId);
      setDetail(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    loadDetail();
    const interval = setInterval(async () => {
      const data = await getRunDetail(runId).catch(() => null);
      if (data) {
        setDetail(data);
        if (['completed', 'failed', 'awaiting_review', 'awaiting_approval'].includes(data.run.status)) {
          clearInterval(interval);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [loadDetail, runId]);

  async function handleApprovePlan() {
    if (actionBusy) return;
    setActionBusy(true);
    try { await approvePlan(runId); await loadDetail(); }
    catch (e) { setError((e as Error).message); }
    finally { setActionBusy(false); }
  }

  async function handleRejectPlan() {
    if (actionBusy) return;
    if (!confirm('Удалить этот прогон?')) return;
    setActionBusy(true);
    try { await rejectPlan(runId); router.push(`${base}/runs`); }
    catch (e) { setError((e as Error).message); setActionBusy(false); }
  }

  async function handleApproveResult() {
    if (actionBusy) return;
    setActionBusy(true);
    try { await approveResult(runId); await loadDetail(); }
    catch (e) { setError((e as Error).message); }
    finally { setActionBusy(false); }
  }

  async function handleRevision() {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const newRun = await requestRevision(runId, revisionComment);
      router.push(`${base}/runs/${newRun.id}`);
    } catch (e) { setError((e as Error).message); }
    finally { setActionBusy(false); setShowRevision(false); }
  }

  async function handleRerun() {
    if (rerunBusy) return;
    if (!confirm('Запустить повторный прогон с той же целью?')) return;
    setRerunBusy(true);
    try {
      const newRun = await rerunRun(runId);
      router.push(`${base}/runs/${newRun.id}`);
    } catch (e) { setError((e as Error).message); }
    finally { setRerunBusy(false); }
  }

  function startEditTask(task: Task) {
    setEditingTask(task.id);
    setEditDesc(task.description);
    setEditAgent(task.agent_slug);
  }

  async function saveTaskEdit(taskId: number) {
    if (!detail) return;
    try {
      const updated = await updateTask(runId, taskId, { description: editDesc, agent_slug: editAgent });
      setDetail((prev) => prev ? {
        ...prev,
        tasks: prev.tasks.map((t) => t.id === taskId ? updated : t),
      } : prev);
    } catch (e) { setError((e as Error).message); }
    setEditingTask(null);
  }

  async function handleDeleteTask(taskId: number) {
    if (!confirm('Удалить задачу?')) return;
    try {
      await deleteTask(runId, taskId);
      setDetail((prev) => prev ? {
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== taskId),
      } : prev);
    } catch (e) { setError((e as Error).message); }
  }

  async function handleCopy(text: string, key: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return <div className="p-6 text-gray-500">Загрузка…</div>;
  if (error) return <div className="p-6 text-red-400">⚠️ {error}</div>;
  if (!detail) return null;

  const { run, tasks, activity } = detail;
  const completedTasks = tasks.filter(t => ['completed', 'approved', 'done'].includes(t.status)).length;
  const progress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const isActive = ['planning', 'running'].includes(run.status);
  const canEdit = run.status === 'awaiting_approval';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button
        onClick={() => router.push(`${base}/runs`)}
        className="text-gray-500 hover:text-white text-sm mb-4 transition-colors flex items-center gap-1"
      >
        ← Все прогоны
      </button>

      <div className="bg-gray-800 rounded-xl p-5 mb-5 border border-gray-700">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h1 className="text-lg font-semibold leading-snug">{run.goal}</h1>
          <span className="text-xs text-gray-500 shrink-0">#{run.id}</span>
        </div>

        <p className={`text-sm font-medium ${STATUS_COLOR[run.status]}`}>
          {isActive && <span className="inline-block w-2 h-2 rounded-full bg-current mr-2 animate-pulse" />}
          {STATUS_LABEL[run.status]}
        </p>

        {(run.total_cost_usd > 0 || run.budget_usd != null) && (
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
            {run.total_cost_usd > 0 && (
              <span>💸 Расходы: ${run.total_cost_usd.toFixed(4)}</span>
            )}
            {run.budget_usd != null && (
              <span className={run.total_cost_usd >= run.budget_usd ? 'text-red-400' : ''}>
                Бюджет: ${run.budget_usd.toFixed(2)}
              </span>
            )}
            {run.total_tokens > 0 && (
              <span>Токены: {run.total_tokens.toLocaleString('ru-RU')}</span>
            )}
          </div>
        )}

        {tasks.length > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Задачи: {completedTasks} / {tasks.length}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {run.status === 'awaiting_approval' && (
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleApprovePlan}
              disabled={actionBusy}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {actionBusy ? 'Запускаю…' : '▶ Запустить прогон'}
            </button>
            <button
              onClick={handleRejectPlan}
              disabled={actionBusy}
              className="text-red-400 hover:text-red-300 px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Удалить
            </button>
          </div>
        )}

        {run.status === 'awaiting_review' && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleApproveResult}
                disabled={actionBusy}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {actionBusy ? '…' : '✓ Одобрить результат'}
              </button>
              <button
                onClick={() => setShowRevision(!showRevision)}
                disabled={actionBusy}
                className="bg-orange-700 hover:bg-orange-600 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                ✏ Отправить на доработку
              </button>
            </div>
            {showRevision && (
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Комментарий к доработке…"
                  value={revisionComment}
                  onChange={(e) => setRevisionComment(e.target.value)}
                  className="flex-1 bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  onClick={handleRevision}
                  disabled={actionBusy}
                  className="bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  Отправить
                </button>
              </div>
            )}
          </div>
        )}

        {['completed', 'failed'].includes(run.status) && (
          <div className="mt-4">
            <button
              onClick={handleRerun}
              disabled={rerunBusy}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {rerunBusy ? 'Запускаю…' : '🔁 Повторить прогон'}
            </button>
          </div>
        )}
      </div>

      {run.summary && (
        <div className="bg-gray-800 rounded-xl p-5 mb-5 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm text-gray-400 uppercase tracking-wider">Итоговая сводка</h2>
            <button
              onClick={() => handleCopy(run.summary!, 'summary')}
              className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
            >
              {copied === 'summary' ? '✓ Скопировано' : '📋 Копировать'}
            </button>
          </div>
          <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{run.summary}</p>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Задачи ({tasks.length})
            {canEdit && <span className="ml-2 text-blue-400 font-normal normal-case">— можно редактировать</span>}
          </h2>
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                expanded={expandedTask === task.id}
                onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                canEdit={canEdit}
                editing={editingTask === task.id}
                editDesc={editDesc}
                editAgent={editAgent}
                onStartEdit={() => startEditTask(task)}
                onSaveEdit={() => saveTaskEdit(task.id)}
                onCancelEdit={() => setEditingTask(null)}
                onEditDescChange={setEditDesc}
                onEditAgentChange={setEditAgent}
                onDelete={() => handleDeleteTask(task.id)}
                onCopy={handleCopy}
                copied={copied}
              />
            ))}
          </div>
        </div>
      )}

      {activity.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Журнал активности
          </h2>
          <div className="bg-gray-800 rounded-xl border border-gray-700 divide-y divide-gray-700/50">
            {activity.map((entry) => (
              <ActivityEntry key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  canEdit: boolean;
  editing: boolean;
  editDesc: string;
  editAgent: string;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditDescChange: (v: string) => void;
  onEditAgentChange: (v: string) => void;
  onDelete: () => void;
  onCopy: (text: string, key: string) => void;
  copied: string | null;
}

function TaskCard({
  task, expanded, onToggle, canEdit, editing, editDesc, editAgent,
  onStartEdit, onSaveEdit, onCancelEdit, onEditDescChange, onEditAgentChange,
  onDelete, onCopy, copied,
}: TaskCardProps) {
  const emoji = AGENT_EMOJI[task.agent_slug] ?? '🤖';
  const name = AGENT_NAME[task.agent_slug] ?? task.agent_slug;
  const statusColor = TASK_STATUS_COLOR[task.status] ?? 'bg-gray-700 text-gray-400';
  const isActive = task.status === 'running' || task.status === 'reviewing';
  const resultKey = `task-result-${task.id}`;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <button onClick={onToggle} className="w-full text-left p-4 hover:bg-gray-750 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-xl shrink-0">{emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-medium text-gray-300">{name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor}`}>
                {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />}
                {TASK_STATUS_LABEL[task.status]}
              </span>
              {task.revision_round > 0 && (
                <span className="text-xs text-orange-400">Раунд {task.revision_round}</span>
              )}
              {task.cost_usd != null && task.cost_usd > 0 && (
                <span className="text-xs text-gray-600">${task.cost_usd.toFixed(4)}</span>
              )}
            </div>
            <p className="text-sm text-gray-400 line-clamp-2 leading-snug">{task.description}</p>
          </div>
          <span className="text-gray-600 text-lg shrink-0">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 p-4 space-y-3">
          {editing ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Агент</p>
                <select
                  value={editAgent}
                  onChange={(e) => onEditAgentChange(e.target.value)}
                  className="bg-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none w-full"
                >
                  {ALL_AGENTS.map(([s, agentName]) => (
                    <option key={s} value={s}>{AGENT_EMOJI[s]} {agentName}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Задача</p>
                <textarea
                  rows={4}
                  value={editDesc}
                  onChange={(e) => onEditDescChange(e.target.value)}
                  className="w-full bg-gray-900 text-gray-100 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onSaveEdit}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  Сохранить
                </button>
                <button
                  onClick={onCancelEdit}
                  className="text-gray-500 hover:text-gray-300 px-4 py-1.5 rounded-lg text-sm transition-colors"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Задача</p>
                <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{task.description}</p>
              </div>

              {canEdit && (
                <div className="flex gap-2">
                  <button
                    onClick={onStartEdit}
                    className="text-blue-400 hover:text-blue-300 text-xs px-3 py-1 rounded-lg border border-blue-900 transition-colors"
                  >
                    ✏ Редактировать
                  </button>
                  <button
                    onClick={onDelete}
                    className="text-red-400 hover:text-red-300 text-xs px-3 py-1 rounded-lg border border-red-900 transition-colors"
                  >
                    Удалить задачу
                  </button>
                </div>
              )}

              {task.result && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Результат</p>
                    <button
                      onClick={() => onCopy(task.result!, resultKey)}
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {copied === resultKey ? '✓ Скопировано' : '📋 Копировать'}
                    </button>
                  </div>
                  <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed bg-gray-900 rounded-lg p-3">
                    {task.result}
                  </p>
                </div>
              )}

              {task.critic_verdict && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Вердикт Критика</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{task.critic_verdict}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityEntry({ entry }: { entry: ActivityLog }) {
  const emoji = AGENT_EMOJI[entry.agent_slug ?? 'system'] ?? '⚙️';
  const name = AGENT_NAME[entry.agent_slug ?? 'system'] ?? entry.agent_slug;
  const time = new Date(entry.created_at).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="text-base shrink-0 mt-0.5">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-gray-300">{name}</span>
          <span className="text-xs text-gray-600">{entry.action}</span>
        </div>
        {entry.details && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{entry.details}</p>
        )}
      </div>
      <span className="text-xs text-gray-600 shrink-0 mt-0.5">{time}</span>
    </div>
  );
}
