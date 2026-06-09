'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getRuns, createRun, markAllEventsRead } from '@/lib/api';
import type { RunListItem } from '@/lib/api';
import type { RunStatus } from '@swarm/shared';

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
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function RunsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [goal, setGoal] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

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
    // Автообновление каждые 5 секунд пока есть активные прогоны
    const interval = setInterval(loadRuns, 5000);
    return () => clearInterval(interval);
  }, [loadRuns]);

  async function handleCreate() {
    if (!goal.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      const run = await createRun(goal.trim());
      setGoal('');
      setShowForm(false);
      router.push(`/runs/${run.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const activeRuns = runs.filter(r => ['planning','running','awaiting_approval'].includes(r.status));
  const reviewRuns = runs.filter(r => r.status === 'awaiting_review');
  const doneRuns = runs.filter(r => ['completed','failed'].includes(r.status));

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">🚀 Прогоны роя</h1>
          <p className="text-gray-500 text-sm mt-1">Запуск агентов для достижения цели</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Новый прогон
        </button>
      </div>

      {/* Форма нового прогона */}
      {showForm && (
        <div className="bg-gray-800 rounded-xl p-5 mb-6 border border-gray-700">
          <h2 className="font-semibold mb-3">Новый прогон</h2>
          <p className="text-gray-400 text-sm mb-3">
            Опишите задачу. Стратег разобьёт её на подзадачи для агентов.
          </p>
          <textarea
            className="w-full bg-gray-900 text-gray-100 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-gray-600"
            rows={4}
            placeholder="Например: Создай контент-план для Instagram на месяц для фитнес-блога..."
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={creating}
          />
          {error && <p className="text-red-400 text-sm mt-2">⚠️ {error}</p>}
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleCreate}
              disabled={!goal.trim() || creating}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
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

      {loading && <p className="text-gray-500 text-sm">Загрузка…</p>}

      {/* Активные прогоны */}
      {activeRuns.length > 0 && (
        <Section title="Активные" count={activeRuns.length}>
          {activeRuns.map(r => <RunCard key={r.id} run={r} />)}
        </Section>
      )}

      {/* На проверке */}
      {reviewRuns.length > 0 && (
        <Section title="На проверке" count={reviewRuns.length}>
          {reviewRuns.map(r => <RunCard key={r.id} run={r} />)}
        </Section>
      )}

      {/* Завершённые */}
      {doneRuns.length > 0 && (
        <Section title="Завершённые" count={doneRuns.length}>
          {doneRuns.map(r => <RunCard key={r.id} run={r} />)}
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

function RunCard({ run }: { run: RunListItem }) {
  const router = useRouter();
  const statusColor = STATUS_COLOR[run.status] ?? 'bg-gray-700 text-gray-300';
  const isActive = ['planning', 'running'].includes(run.status);

  return (
    <div
      onClick={() => router.push(`/runs/${run.id}`)}
      className="bg-gray-800 hover:bg-gray-750 rounded-xl p-4 cursor-pointer border border-gray-700 hover:border-gray-600 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug line-clamp-2 flex-1">{run.goal}</p>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
          {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />}
          {STATUS_LABEL[run.status]}
        </span>
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
        <span>#{run.id}</span>
        {(run.task_count ?? 0) > 0 && <span>{run.task_count} задач</span>}
        <span>{formatDate(run.created_at)}</span>
      </div>
    </div>
  );
}
