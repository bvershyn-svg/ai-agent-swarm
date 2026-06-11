'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getRuns, createRun, createSoloTask, markAllEventsRead } from '@/lib/api';
import type { RunListItem } from '@/lib/api';
import type { RunStatus } from '@swarm/shared';

const AGENTS = [
  { slug: 'strategist',   name: 'Стратег',    emoji: '🧠' },
  { slug: 'scriptwriter', name: 'Сценарист',  emoji: '✍️' },
  { slug: 'producer',     name: 'Продюсер',   emoji: '🎬' },
  { slug: 'visual',       name: 'Визуал',     emoji: '🖼' },
  { slug: 'factchecker',  name: 'Фактчекер',  emoji: '🔍' },
  { slug: 'critic',       name: 'Критик',     emoji: '🎯' },
];

const STATUS_LABEL: Record<RunStatus, string> = {
  planning:          'Планирование',
  awaiting_approval: 'Ожидает запуска',
  running:           'Выполняется',
  awaiting_review:   'На проверке',
  completed:         'Завершён',
  failed:            'Ошибка',
};

const STATUS_COLOR: Record<RunStatus, string> = {
  planning:          'bg-yellow-800 text-yellow-200',
  awaiting_approval: 'bg-blue-900 text-blue-200',
  running:           'bg-green-900 text-green-200',
  awaiting_review:   'bg-purple-900 text-purple-200',
  completed:         'bg-gray-700 text-gray-300',
  failed:            'bg-red-900 text-red-200',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function ProjectRunsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const base = `/p/${slug}`;

  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showSolo, setShowSolo] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [goal, setGoal] = useState('');
  const [budget, setBudget] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [soloAgent, setSoloAgent] = useState('scriptwriter');
  const [soloDesc, setSoloDesc] = useState('');
  const [soloBudget, setSoloBudget] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const data = await getRuns();
      setRuns(data);
    } catch {
      setError('Не удалось загрузить список прогонов');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuns();
    markAllEventsRead().catch(() => {});
    const interval = setInterval(loadRuns, 5000);
    return () => clearInterval(interval);
  }, [loadRuns]);

  async function handleCreate() {
    if (!goal.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      const budgetNum = budget ? parseFloat(budget) : undefined;
      const run = await createRun(goal.trim(), budgetNum);
      setGoal('');
      setBudget('');
      setShowForm(false);
      router.push(`${base}/runs/${run.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleSolo() {
    if (!soloDesc.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      const budgetNum = soloBudget ? parseFloat(soloBudget) : undefined;
      const run = await createSoloTask(soloAgent, soloDesc.trim(), budgetNum);
      setSoloDesc('');
      setSoloBudget('');
      setShowSolo(false);
      router.push(`${base}/runs/${run.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const activeRuns = runs.filter(r => ['planning', 'running', 'awaiting_approval'].includes(r.status));
  const reviewRuns = runs.filter(r => r.status === 'awaiting_review');
  const doneRuns   = runs.filter(r => ['completed', 'failed'].includes(r.status));

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">🚀 Прогоны роя</h1>
          <p className="text-gray-500 text-sm mt-1">Запуск агентов для достижения цели</p>
        </div>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            + Новое задание
            <span className="text-blue-300">▾</span>
          </button>
          {showDropdown && (
            <div className="absolute right-0 top-10 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-10 min-w-[200px] overflow-hidden">
              <button
                onClick={() => { setShowDropdown(false); setShowForm(true); setShowSolo(false); }}
                className="w-full text-left px-4 py-3 text-sm hover:bg-gray-700 transition-colors"
              >
                <span className="mr-2">🚀</span> Прогон роя
                <p className="text-xs text-gray-500 mt-0.5">Стратег создаёт план задач</p>
              </button>
              <hr className="border-gray-700" />
              <button
                onClick={() => { setShowDropdown(false); setShowSolo(true); setShowForm(false); }}
                className="w-full text-left px-4 py-3 text-sm hover:bg-gray-700 transition-colors"
              >
                <span className="mr-2">⚡</span> Прямая задача
                <p className="text-xs text-gray-500 mt-0.5">Один агент без планирования</p>
              </button>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="bg-gray-800 rounded-xl p-5 mb-6 border border-gray-700">
          <h2 className="font-semibold mb-3">Новый прогон</h2>
          <textarea
            className="w-full bg-gray-900 text-gray-100 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-gray-600"
            rows={4}
            placeholder="Опишите задачу. Стратег разобьёт её на подзадачи для агентов…"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={creating}
          />
          <div className="flex items-center gap-3 mt-3">
            <label className="text-xs text-gray-500 shrink-0">Бюджет ($):</label>
            <input
              type="number" min="0" step="0.01" placeholder="без лимита"
              value={budget} onChange={(e) => setBudget(e.target.value)}
              className="w-28 bg-gray-900 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm mt-2">⚠️ {error}</p>}
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleCreate}
              disabled={!goal.trim() || creating}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {creating ? 'Создаю…' : 'Запустить'}
            </button>
            <button
              onClick={() => { setShowForm(false); setGoal(''); setError(''); }}
              className="text-gray-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Форма прямой задачи */}
      {showSolo && (
        <div className="bg-gray-800 rounded-xl p-5 mb-6 border border-gray-700">
          <h2 className="font-semibold mb-3">⚡ Прямая задача агенту</h2>
          <div className="mb-3">
            <label className="text-xs text-gray-500 block mb-1">Агент</label>
            <select
              value={soloAgent}
              onChange={(e) => setSoloAgent(e.target.value)}
              className="w-full bg-gray-900 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {AGENTS.map((a) => (
                <option key={a.slug} value={a.slug}>{a.emoji} {a.name}</option>
              ))}
            </select>
          </div>
          <textarea
            className="w-full bg-gray-900 text-gray-100 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-gray-600 mb-3"
            rows={4}
            placeholder="Что нужно сделать? Агент выполнит задачу напрямую, без планирования…"
            value={soloDesc}
            onChange={(e) => setSoloDesc(e.target.value)}
            disabled={creating}
          />
          <div className="flex items-center gap-3 mb-3">
            <label className="text-xs text-gray-500 shrink-0">Бюджет ($):</label>
            <input
              type="number" min="0" step="0.01" placeholder="без лимита"
              value={soloBudget} onChange={(e) => setSoloBudget(e.target.value)}
              className="w-28 bg-gray-900 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm mb-3">⚠️ {error}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleSolo}
              disabled={!soloDesc.trim() || creating}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {creating ? 'Запускаю…' : 'Запустить задачу'}
            </button>
            <button
              onClick={() => { setShowSolo(false); setSoloDesc(''); setError(''); }}
              className="text-gray-400 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {loading && <p className="text-gray-500 text-sm">Загрузка…</p>}

      {activeRuns.length > 0 && (
        <Section title="Активные" count={activeRuns.length}>
          {activeRuns.map(r => (
            <RunCard key={r.id} run={r} onClick={() => router.push(`${base}/runs/${r.id}`)} />
          ))}
        </Section>
      )}

      {reviewRuns.length > 0 && (
        <Section title="На проверке" count={reviewRuns.length}>
          {reviewRuns.map(r => (
            <RunCard key={r.id} run={r} onClick={() => router.push(`${base}/runs/${r.id}`)} />
          ))}
        </Section>
      )}

      {doneRuns.length > 0 && (
        <Section title="Завершённые" count={doneRuns.length}>
          {doneRuns.map(r => (
            <RunCard key={r.id} run={r} onClick={() => router.push(`${base}/runs/${r.id}`)} />
          ))}
        </Section>
      )}

      {!loading && runs.length === 0 && (
        <div className="text-center text-gray-500 mt-20">
          <div className="text-4xl mb-4">🚀</div>
          <p>Прогонов пока нет. Создайте первый!</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {title} ({count})
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function RunCard({ run, onClick }: { run: RunListItem; onClick: () => void }) {
  const isActive = ['planning', 'running'].includes(run.status);
  return (
    <div
      onClick={onClick}
      className="bg-gray-800 hover:bg-gray-750 rounded-xl p-4 cursor-pointer border border-gray-700 hover:border-gray-600 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug line-clamp-2 flex-1">{run.goal}</p>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[run.status]}`}>
          {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />}
          {STATUS_LABEL[run.status]}
        </span>
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
        <span>#{run.id}</span>
        {(run.task_count ?? 0) > 0 && <span>{run.task_count} задач</span>}
        {run.total_cost_usd > 0 && <span>${run.total_cost_usd.toFixed(4)}</span>}
        <span>{formatDate(run.created_at)}</span>
      </div>
    </div>
  );
}
